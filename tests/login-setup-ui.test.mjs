import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/login.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  .replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
const { Login, PasswordFields, loginMode, submitPassword } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const fields = (props = {}) => PasswordFields({ mode: 'setup', password: '', confirmation: '', busy: false, error: '', lockIcon: null, changePassword() {}, changeConfirmation() {}, ...props });
function descendants(element, predicate) {
  const found = [];
  const visit = node => {
    if (!React.isValidElement(node)) return;
    if (predicate(node)) found.push(node);
    React.Children.forEach(node.props.children, visit);
  }; visit(element); return found;
}
function fixture(props = {}) {
  let element;
  function Capture() {
    element = Login({ brand: React.createElement('span', null, 'Command Center NG'), lockIcon: null, submitIcon: null, version: '0.0.0', request: () => assert.fail('Rendering must not submit credentials.'), refreshSession: async () => {}, onLogin() {}, ...props });
    return null;
  }
  renderToStaticMarkup(React.createElement(Capture));
  return { element, html: renderToStaticMarkup(element) };
}

// Exercise the actual event handler with controlled request/session outcomes,
// including success, errors and concurrent clicks, without a browser dependency.
const ast = ts.createSourceFile('login.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let submitSource;
function findSubmit(node) {
  if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onSubmit') submitSource = node.initializer.expression.getText(ast);
  ts.forEachChild(node, findSubmit);
} findSubmit(ast);
function handler(props = {}) {
  const state = { password: 'a'.repeat(12), confirmation: 'a'.repeat(12), busy: false, error: '', authenticated: false, pending: { current: false }, requests: [], refreshes: 0, ...props };
  const environment = {
    submitPassword, mode: props.mode || 'setup', password: state.password, confirmation: state.confirmation,
    request: props.request || (async (path, credentials) => { state.requests.push({ path, credentials }); return { authenticated: true }; }),
    refreshSession: props.refreshSession || (async () => { state.refreshes++; }),
    onLogin: () => { state.authenticated = true; }, pending: state.pending,
    setPassword: value => { state.password = value; }, setConfirmation: value => { state.confirmation = value; },
    setBusy: value => { state.busy = value; }, setError: value => { state.error = value; },
  };
  const code = ts.transpileModule(`const handler = ${submitSource};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return { state, submit: new Function(...Object.keys(environment), code + '\nreturn handler;')(...Object.values(environment)) };
}
const event = () => ({ preventDefault() {} });

test('fresh protected and unenabled sessions select distinct setup/operator forms; configured accounts keep login', () => {
  assert.equal(loginMode({}), 'login');
  assert.equal(loginMode({ setupAllowed: true }), 'login');
  assert.equal(loginMode({ setupRequired: true, setupAllowed: true }), 'setup');
  assert.equal(loginMode({ setupRequired: true, setupAllowed: false }), 'operator');
  assert.equal(loginMode({ setupRequired: true }), 'operator');
  assert.equal(loginMode({ setupRequired: true, setupAllowed: 'true' }), 'operator', 'only an explicit backend boolean permits setup');
});

test('first-password fields are labelled, private, repeated, bounded and marked as new-password for password managers', () => {
  const element = fields(), inputs = descendants(element, node => node.type === 'input');
  assert.equal(inputs.length, 2);
  assert.deepEqual(inputs.map(input => input.props.id), ['password', 'confirmation']);
  for (const input of inputs) {
    assert.equal(input.props.type, 'password'); assert.equal(input.props.autoComplete, 'new-password');
    assert.equal(input.props.minLength, 12); assert.equal(input.props.maxLength, 4096);
    assert.equal(input.props.required, true); assert.equal(input.props.disabled, false);
    assert.equal(input.props['aria-describedby'], 'password-note');
  }
  assert.deepEqual(descendants(element, node => node.type === 'label').map(label => label.props.htmlFor), ['password', 'confirmation']);
  const html = renderToStaticMarkup(element);
  assert.match(html, /Use 12–4096 characters/);
  assert.doesNotMatch(html, /setup.code|temporary.code|token/i);
});

test('configured login retains its single current-password field and existing copy without first-setup constraints', () => {
  const inputs = descendants(fields({ mode: 'login' }), node => node.type === 'input');
  assert.equal(inputs.length, 1); assert.equal(inputs[0].props.autoComplete, 'current-password');
  assert.equal(inputs[0].props.minLength, undefined); assert.equal(inputs[0].props.maxLength, undefined);
  const { html } = fixture();
  assert.match(html, /A little less switching/); assert.match(html, /Enter workspace/);
  assert.doesNotMatch(html, /Create password|Confirm application password/);
});

test('an unenabled fresh installation offers operator instructions and a read-only recheck, with no credential form', async () => {
  let reads = 0;
  const { html, element } = fixture({ mode: 'operator', refreshSession: async () => { reads++; } });
  assert.match(html, /htpasswd-protected browser setup/);
  assert.match(html, /existing command-line tool/);
  assert.doesNotMatch(html, /<form|<input|type="password"|Create password/);
  const recheck = descendants(element, node => node.type === 'button')[0];
  await recheck.props.onClick(); assert.equal(reads, 1);
  await assert.rejects(submitPassword('operator', 'a'.repeat(12), 'a'.repeat(12), () => assert.fail('Setup is disabled.')), /not enabled/);
});

test('setup submits both exact password values once and only enters the workspace after server confirmation', async () => {
  const f = handler({ password: '  ' + 'a'.repeat(12), confirmation: '  ' + 'a'.repeat(12) });
  await f.submit(event());
  assert.deepEqual(f.state.requests, [{ path: 'setup', credentials: { password: '  ' + 'a'.repeat(12), confirmation: '  ' + 'a'.repeat(12) } }]);
  assert.equal(f.state.authenticated, true); assert.equal(f.state.error, '');
  assert.equal(f.state.password, ''); assert.equal(f.state.confirmation, '');
  assert.equal(f.state.busy, false); assert.equal(f.state.pending.current, false);
  await assert.rejects(submitPassword('setup', 'a'.repeat(12), 'a'.repeat(12), async () => ({ authenticated: false })), /not confirmed/);
});

test('password bounds/mismatch fail locally without sending a request or creating a session', async () => {
  for (const props of [{ password: 'a'.repeat(11), confirmation: 'a'.repeat(11) }, { password: 'a'.repeat(4097), confirmation: 'a'.repeat(4097) }, { confirmation: 'b'.repeat(12) }]) {
    const f = handler(props); await f.submit(event());
    assert.equal(f.state.requests.length, 0); assert.equal(f.state.authenticated, false);
    assert.match(f.state.error, /12–4096|do not match/);
  }
  for (const length of [12, 4096]) {
    await submitPassword('setup', 'a'.repeat(length), 'a'.repeat(length), async () => ({ authenticated: true }));
  }
});

test('pending submissions are coalesced and failure keeps the form available without claiming success', async () => {
  let release, requests = 0;
  const f = handler({ request: async () => { requests++; return new Promise(resolve => { release = resolve; }); } });
  const first = f.submit(event()); await f.submit(event());
  assert.equal(requests, 1); assert.equal(f.state.busy, true); assert.equal(f.state.authenticated, false);
  release({ authenticated: true }); await first; assert.equal(f.state.authenticated, true);
  const failed = handler({ request: async () => { throw Object.assign(new Error('Please wait before trying again.'), { status: 429 }); } });
  await failed.submit(event());
  assert.equal(failed.state.authenticated, false); assert.equal(failed.state.busy, false);
  assert.equal(failed.state.error, 'Please wait before trying again.'); assert.equal(failed.state.refreshes, 0);
});

test('concurrent initialization and protection changes re-read the existing session mode without another setup attempt', async () => {
  for (const [status, session, expected] of [[409, { authenticated: false }, 'login'], [403, { authenticated: false, setupRequired: true, setupAllowed: false }, 'operator']]) {
    let requests = 0, mode = 'setup', reads = 0;
    const f = handler({ request: async () => { requests++; throw Object.assign(new Error('Setup changed.'), { status }); }, refreshSession: async () => { reads++; mode = loginMode(session); } });
    await f.submit(event());
    assert.equal(mode, expected); assert.equal(requests, 1); assert.equal(reads, 1);
    assert.equal(f.state.authenticated, false); assert.equal(f.state.password, ''); assert.equal(f.state.confirmation, '');
  }
});

test('login failures do not attempt setup or replace existing password state', async () => {
  const calls = [];
  const f = handler({ mode: 'login', password: 'existing-value', request: async (path, credentials) => { calls.push({ path, credentials }); throw Object.assign(new Error('Incorrect password.'), { status: 401 }); } });
  await f.submit(event());
  assert.deepEqual(calls, [{ path: 'login', credentials: { password: 'existing-value' } }]);
  assert.equal(f.state.refreshes, 0); assert.equal(f.state.error, 'Incorrect password.');
  assert.equal(f.state.authenticated, false); assert.equal(f.state.password, 'existing-value');
});

test('typed invalid-password and authentication-storage errors remain visible login failures without setup or fake success', async () => {
  for (const [status, code, message] of [[403, 'invalid_password', 'Incorrect password.'], [503, 'authentication_unavailable', 'Authentication storage is unavailable.']]) {
    const f = handler({ mode: 'login', password: 'existing-value', request: async () => { throw Object.assign(new Error(message), { status, code }); } });
    await f.submit(event());
    assert.equal(f.state.authenticated, false); assert.equal(f.state.refreshes, 0); assert.equal(f.state.error, message);
    assert.equal(f.state.password, 'existing-value'); assert.equal(f.state.busy, false);
    const html = renderToStaticMarkup(fields({ mode: 'login', error: f.state.error }));
    assert.match(html, /role="alert"/); assert.ok(html.includes(message));
  }
});

test('error and busy states remain accessible without writing passwords to browser storage', () => {
  const element = fields({ error: 'The passwords do not match.', busy: true });
  assert.ok(descendants(element, node => node.type === 'input').every(input => input.props.disabled && input.props['aria-invalid']));
  assert.match(renderToStaticMarkup(element), /id="password-error" class="error-text" role="alert"/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|URLSearchParams/);
});

test('main session integration retains setup flags on startup/reconnect and remounts the form when its mode changes', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(main, /checkSession\(applySession\)/);
  assert.match(main, /if \(current && !data.authenticated\) applySession\(data\)/);
  assert.match(main, /setupRequired: session.setupRequired === true, setupAllowed: session.setupAllowed === true/);
  assert.match(main, /<Login key=\{loginMode\(loginSession\)\} mode=\{loginMode\(loginSession\)\}/);
  assert.match(main, /refreshSession=\{refreshLoginSession\}/);
  assert.match(main, /status: response.status/);
});
