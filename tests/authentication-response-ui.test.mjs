import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map(), effects = []; let onLogin, sessionApplier, retrySession, logout;
const visit = node => {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects.push(node.arguments[0].getText(ast));
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'applySession') sessionApplier = node.initializer.getText(ast);
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'button' && node.children.some(child => ts.isJsxText(child) && child.text.includes('Retry sign-in check'))) retrySession = node.openingElement.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'onClick').initializer.expression.getText(ast);
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'button' && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'aria-label' && attribute.initializer?.text === 'Sign out')) logout = node.openingElement.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'onClick').initializer.expression.getText(ast);
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'Login') {
    onLogin = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'onLogin').initializer.expression.getText(ast);
  }
  ts.forEachChild(node, visit);
}; visit(ast);
function evaluate(source, environment) {
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return new Function(...Object.keys(environment), compiled)(...Object.values(environment));
}
const checkpoint = () => new Promise(resolve => setImmediate(resolve));
function fixture(fetch) {
  const state = { authenticated: true, notice: '', error: '', setup: {}, flushed: 0, drafts: { worker: 'Unsent text', other: 'Other draft' }, images: { worker: [{ id: 'unsent-image', dataUrl: 'data:image/png;base64,aA==' }] }, selected: 'worker' };
  const apiAuthentication = { generation: 1, required: null };
  const environment = { authenticated: true, apiAuthentication, browserSave: { current: () => { state.flushed++; } },
    setLoginNotice: value => { state.notice = value; }, setError: value => { state.error = value; }, setLoginSession: value => { state.setup = value; }, setAuthenticated: value => { state.authenticated = value; }
  };
  const effect = effects.find(effect => effect.includes('apiAuthentication.required = required'));
  assert.ok(effect, 'exercise the actual authentication response subscriber');
  const cleanup = evaluate(`return (${effect})();`, environment);
  const { api, checkSession } = evaluate(`${functions.get('authenticationRequired')}\n${functions.get('api')}\n${functions.get('checkSession')}\nreturn {api, checkSession};`, { fetch, apiAuthentication });
  const login = evaluate(`return (${onLogin});`, environment);
  return { state, apiAuthentication, api, checkSession, cleanup, login };
}
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('explicit authentication-required responses return to app sign-in without clearing text/images or selected chat', async () => {
  const f = fixture(async () => response(403, { error: 'Sign in to continue.', code: 'authentication_required' }));
  const before = structuredClone({ drafts: f.state.drafts, images: f.state.images, selected: f.state.selected });
  try {
    await assert.rejects(f.api('agents/worker/message', { text: 'unsent' }), error => error.status === 403 && error.code === 'authentication_required');
    assert.equal(f.state.authenticated, false); assert.match(f.state.notice, /session ended/);
    assert.equal(f.state.flushed, 1);
    assert.deepEqual({ drafts: f.state.drafts, images: f.state.images, selected: f.state.selected }, before);
  } finally { f.cleanup(); }
});

test('incorrect passwords, origin/permission denials and storage failures retain their errors without expiring the app session', async () => {
  for (const [path, status, code, error] of [
    ['login', 403, 'invalid_password', 'Incorrect password.'],
    ['agents/worker/message', 403, undefined, 'Request origin is not allowed.'],
    ['agents/worker/message', 403, 'permission_denied', 'This request is not permitted.'],
    ['state', 503, 'authentication_unavailable', 'Authentication storage is unavailable.'],
    ['login', 401, undefined, 'Incorrect password.'],
  ]) {
    const f = fixture(async () => response(status, { error, ...(code ? { code } : {}) }));
    try {
      await assert.rejects(f.api(path, path === 'login' ? { password: 'synthetic-input' } : undefined), failure => failure.status === status && failure.code === code && failure.message === error);
      assert.equal(f.state.authenticated, true); assert.equal(f.state.notice, ''); assert.equal(f.state.flushed, 0);
    } finally { f.cleanup(); }
  }
});

test('legacy private-route 401 remains compatible without treating an invalid-password code as session expiry', async () => {
  const f = fixture(async () => response(401, { error: 'Sign in to continue.' }));
  try { await assert.rejects(f.api('state')); assert.equal(f.state.authenticated, false); }
  finally { f.cleanup(); }
  const invalid = fixture(async () => response(401, { error: 'Incorrect password.', code: 'invalid_password' }));
  try { await assert.rejects(invalid.api('state')); assert.equal(invalid.state.authenticated, true); }
  finally { invalid.cleanup(); }
});

test('an old in-flight authentication failure cannot sign out a newer successful login', async () => {
  let resolve;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  try {
    const old = f.api('state');
    const rejected = assert.rejects(old, error => error.code === 'authentication_required');
    f.login();
    resolve(response(403, { error: 'Sign in to continue.', code: 'authentication_required' }));
    await rejected;
    assert.equal(f.state.authenticated, true); assert.equal(f.state.flushed, 0); assert.equal(f.state.notice, '');
  } finally { f.cleanup(); }
});

test('overlapping successful sign-in checks cannot sign out a newer login after the first check opened the form', async () => {
  const requests = [];
  const f = fixture(() => new Promise(resolve => { requests.push(resolve); }));
  f.state.authenticated = null;
  const environment = { api: f.api, checkSession: f.checkSession, apiAuthentication: f.apiAuthentication, browserSave: { current() {} }, setSessionReadError() {},
    setLoginSession: value => { f.state.setup = value; }, setAuthenticated: value => { f.state.authenticated = value; }
  };
  const applySession = evaluate(`return (${sessionApplier});`, environment);
  const retry = evaluate(`return (${retrySession});`, { ...environment, applySession });
  try {
    retry(); retry(); assert.equal(requests.length, 2);
    requests[0](response(200, { authenticated: false })); await checkpoint();
    assert.equal(f.state.authenticated, false);
    f.login(); assert.equal(f.state.authenticated, true);
    requests[1](response(200, { authenticated: false })); await checkpoint();
    assert.equal(f.state.authenticated, true, 'the late successful session read must not replace the newer login');
  } finally { f.cleanup(); }
});

test('a stale session-read error is ignored after a newer login while current errors still propagate', async () => {
  let reject;
  const f = fixture(() => new Promise((_resolve, fail) => { reject = fail; }));
  try {
    const old = f.checkSession(); f.login();
    reject(Object.assign(new Error('Old authentication storage failure.'), { status: 503, code: 'authentication_unavailable' }));
    assert.equal(await old, null); assert.equal(f.state.authenticated, true);
    const current = f.checkSession();
    reject(Object.assign(new Error('Current authentication storage failure.'), { status: 503, code: 'authentication_unavailable' }));
    await assert.rejects(current, /Current authentication storage failure/);
  } finally { f.cleanup(); }
});

test('session application cannot lag behind its generation check into a later login microtask', async () => {
  const f = fixture(async () => response(200, { authenticated: false }));
  f.state.authenticated = null;
  const environment = { apiAuthentication: f.apiAuthentication, browserSave: { current() {} }, setSessionReadError() {},
    setLoginSession: value => { f.state.setup = value; }, setAuthenticated: value => { f.state.authenticated = value; }
  };
  const applySession = evaluate(`return (${sessionApplier});`, environment);
  const checkSession = consume => {
    const result = f.checkSession(consume);
    result.then(() => f.login());
    return result;
  };
  try {
    const retry = evaluate(`return (${retrySession});`, { ...environment, checkSession, applySession });
    retry(); await checkpoint();
    assert.equal(f.state.authenticated, true, 'a checked session result cannot be applied after a newer login callback');
  } finally { f.cleanup(); }
});

test('a delayed explicit logout callback cannot clear a newer login or its new image drafts', async () => {
  const f = fixture(async () => response(200, {}));
  let resolve;
  const imageDraftsRef = { current: f.state.images };
  const callback = evaluate(`return (${logout});`, {
    act: () => new Promise(done => { resolve = done; }), apiAuthentication: f.apiAuthentication, imageDraftsRef,
    setImageDrafts: images => { f.state.images = images; }, setImageErrors() {}, setReceipts() {},
    setAuthenticated: value => { f.state.authenticated = value; }
  });
  try {
    const pending = callback(); f.login();
    f.state.images = { worker: [{ id: 'new-login-image' }] }; imageDraftsRef.current = f.state.images;
    resolve(true); await pending;
    assert.equal(f.state.authenticated, true);
    assert.deepEqual(f.state.images, { worker: [{ id: 'new-login-image' }] });
    assert.equal(imageDraftsRef.current, f.state.images);
    const current = callback(); resolve(true); await current;
    assert.equal(f.state.authenticated, false); assert.deepEqual(f.state.images, {});
  } finally { f.cleanup(); }
});

test('the subscriber is removed on cleanup and later login accepts fresh authenticated requests', async () => {
  let calls = 0;
  const f = fixture(async () => ++calls === 1 ? response(403, { error: 'Sign in to continue.', code: 'authentication_required' }) : response(200, { agents: [] }));
  await assert.rejects(f.api('state')); assert.equal(f.state.authenticated, false);
  f.cleanup(); assert.equal(f.apiAuthentication.required, null);
  f.state.error = 'Sign in to continue.';
  f.login(); assert.deepEqual(await f.api('state'), { agents: [] }); assert.equal(f.state.authenticated, true); assert.equal(f.state.error, '');
});

test('startup storage failure remains an explicit unknown/error state with a retry, not a fabricated signed-out session', async () => {
  let authenticated = null, error = '', changed = 0;
  const effect = effects.find(effect => effect.includes('checkSession(applySession)'));
  assert.ok(effect);
  const checkSession = evaluate(`${functions.get('checkSession')}\nreturn checkSession;`, { api: async () => { throw Object.assign(new Error('Authentication storage is unavailable.'), { status: 503, code: 'authentication_unavailable' }); }, apiAuthentication: { generation: 1 } });
  evaluate(`return (${effect})();`, { checkSession, applySession: session => { changed++; authenticated = session.authenticated; }, setSessionReadError: value => { error = value; } });
  await checkpoint();
  assert.equal(authenticated, null); assert.equal(changed, 0); assert.equal(error, 'Authentication storage is unavailable.');
  assert.match(main, /sessionReadError[\s\S]*role="alert"[\s\S]*Retry sign-in check/);
});

test('implicit authentication loss has no image/draft cleanup; explicit sign-out keeps its existing cleanup separate', () => {
  const subscriber = effects.find(effect => effect.includes('apiAuthentication.required = required'));
  assert.doesNotMatch(subscriber, /setDrafts|setImageDrafts|imageDraftsRef|setSelected/);
  assert.ok(effects.every(effect => !/authenticated === false[\s\S]*setImageDrafts/.test(effect)));
  assert.match(main, /act\('logout', \{\}\)[^\n]*setImageDrafts\(\{\}\)/);
  assert.doesNotMatch(functions.get('api'), /document.cookie|localStorage|sessionStorage/);
});
