import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function compiledModule(source) {
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
}

const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [];
let sessionApplier;
function hasInitialStateRead(node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'api'
    && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'state') return true;
  return ts.forEachChild(node, hasInitialStateRead) || false;
}
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'applySession') sessionApplier = node.initializer;
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useEffect'
    && ts.isArrowFunction(node.arguments[0]) && hasInitialStateRead(node.arguments[0])) effects.push(node.arguments[0]);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(effects.length, 1, 'test the actual authenticated workspace initialization effect');
assert.ok(sessionApplier, 'test the actual session state application too');
const { makeEffect, makeSessionApplier } = await compiledModule(`
export function makeEffect({ authenticated, api, EventSource, observeWorkspaceStream, setState, setError, setStreamHealth, applySession }) { return ${effects[0].getText(ast)}; }
export function makeSessionApplier({ setLoginSession, setAuthenticated, setSessionReadError, apiAuthentication, browserSave }) { return ${sessionApplier.getText(ast)}; }
`);

const statusSource = await readFile(new URL('../src/worker-status.tsx', import.meta.url), 'utf8');
const statusAst = ts.createSourceFile('worker-status.tsx', statusSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const observer = statusAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'observeWorkspaceStream');
const { observeWorkspaceStream } = await compiledModule(observer.getText(statusAst));

const snapshot = (name, questionIds = []) => ({ name, connected: true, agents: [{ id: 'worker', questions: questionIds.map(id => ({ id })) }] });
const checkpoint = () => new Promise(resolve => setImmediate(resolve));
function fixture({ authenticated = true, state = { value: null, writes: [], errors: [], health: [], authentication: [], setup: [], flushed: 0 }, session = Promise.resolve({ authenticated: true }) } = {}) {
  let resolveInitial, rejectInitial;
  const initial = new Promise((resolve, reject) => { resolveInitial = resolve; rejectInitial = reject; });
  const streams = [], requests = [];
  class Stream extends EventTarget {
    constructor(url) { super(); this.url = url; this.closed = false; streams.push(this); }
    close() { this.closed = true; }
  }
  const cleanup = makeEffect({
    authenticated, EventSource: Stream, observeWorkspaceStream,
    api: route => { requests.push(route); if (route === 'state') return initial; if (route === 'session') return session; throw new Error('Unexpected route: ' + route); },
    setState: update => { state.value = typeof update === 'function' ? update(state.value) : update; state.writes.push(state.value); },
    setError: message => state.errors.push(message),
    setStreamHealth: value => state.health.push(value),
    applySession: makeSessionApplier({ setAuthenticated: value => state.authentication.push(value), setLoginSession: value => state.setup.push(value), setSessionReadError() {}, apiAuthentication: { generation: 0 }, browserSave: { current: () => { state.flushed++; } } }),
  })();
  return { state, requests, stream: streams[0], streams, cleanup, resolveInitial, rejectInitial };
}

test('a delayed initial state read cannot replace newer streamed native questions', async () => {
  const f = fixture();
  try {
    const fresh = snapshot('newer stream', ['one', 'two', 'three', 'four']);
    f.stream.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(fresh) }));
    f.resolveInitial(snapshot('older initial read')); await checkpoint();
    assert.deepEqual(f.state.value, fresh);
    assert.equal(f.state.writes.length, 1, 'the stale empty request list is never presented');
  } finally { f.cleanup(); }
});

test('initial state still seeds the workspace before its first snapshot, including after open or heartbeat', async () => {
  const f = fixture();
  try {
    f.stream.dispatchEvent(new Event('open')); f.stream.dispatchEvent(new Event('heartbeat'));
    const initial = snapshot('initial read', ['initial-request']);
    f.resolveInitial(initial); await checkpoint();
    assert.deepEqual(f.state.value, initial);
    const fresh = snapshot('later stream', ['next-request']);
    f.stream.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(fresh) }));
    assert.deepEqual(f.state.value, fresh);
    assert.equal(f.state.health.at(-1).state, 'connected');
  } finally { f.cleanup(); }
});

test('cleanup closes the stream and a prior login cannot replace the next login with a late state read', async () => {
  const old = fixture(); old.cleanup();
  const current = fixture({ state: old.state });
  try {
    assert.equal(old.stream.closed, true);
    const fresh = snapshot('new login', ['current-request']);
    current.stream.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(fresh) }));
    old.resolveInitial(snapshot('old login')); await checkpoint();
    old.stream.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(snapshot('closed stream')) }));
    assert.deepEqual(current.state.value, fresh);
    assert.equal(current.state.writes.length, 1);
  } finally { current.cleanup(); }
});

test('late initial-read errors after cleanup are ignored, while a current initial-read error remains visible', async () => {
  const old = fixture(); old.cleanup();
  const current = fixture({ state: old.state });
  try {
    old.rejectInitial(new Error('Obsolete login error')); await checkpoint();
    assert.deepEqual(current.state.errors, []);
    current.rejectInitial(new Error('Current connection error')); await checkpoint();
    assert.deepEqual(current.state.errors, ['Current connection error']);
  } finally { current.cleanup(); }
});

test('an unauthenticated view opens neither an initial state request nor an event stream', () => {
  const f = fixture({ authenticated: false });
  assert.deepEqual(f.requests, []); assert.deepEqual(f.streams, []); assert.equal(f.cleanup, undefined);
});

test('a prior login session check cannot log out a newer login after its stream is cleaned up', async () => {
  let resolveOldSession;
  const old = fixture({ session: new Promise(resolve => { resolveOldSession = resolve; }) });
  old.stream.dispatchEvent(new Event('error'));
  assert.deepEqual(old.requests, ['state', 'session']);
  old.cleanup();
  const current = fixture({ state: old.state, session: Promise.resolve({ authenticated: false }) });
  try {
    const fresh = snapshot('new login', ['current-request']);
    current.stream.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(fresh) }));
    resolveOldSession({ authenticated: false }); await checkpoint();
    assert.deepEqual(current.state.authentication, [], 'an expired old session cannot log out the newer effect');
    assert.equal(current.state.flushed, 0);
    assert.deepEqual(current.state.value, fresh);
    current.stream.dispatchEvent(new Event('error')); await checkpoint();
    assert.deepEqual(current.state.authentication, [false], 'the current effect still detects an expired session');
    assert.equal(current.state.flushed, 1, 'save pending text preferences before leaving the authenticated view');
  } finally { current.cleanup(); }
});

test('old setup flags cannot replace the newer login while a current session recheck still detects first-password setup', async () => {
  let resolveOldSession;
  const old = fixture({ session: new Promise(resolve => { resolveOldSession = resolve; }) });
  old.stream.dispatchEvent(new Event('error')); old.cleanup();
  const current = fixture({ state: old.state, session: Promise.resolve({ authenticated: false, setupRequired: true, setupAllowed: true }) });
  try {
    resolveOldSession({ authenticated: false, setupRequired: true, setupAllowed: false }); await checkpoint();
    assert.deepEqual(current.state.authentication, []);
    assert.deepEqual(current.state.setup, [], 'a stale session cannot display an obsolete operator-only setup view');
    current.stream.dispatchEvent(new Event('error')); await checkpoint();
    assert.deepEqual(current.state.authentication, [false]);
    assert.deepEqual(current.state.setup, [{ setupRequired: true, setupAllowed: true }], 'the current effect preserves the exact first-password mode');
  } finally { current.cleanup(); }
});

test('current authentication-storage failures are visible and never interpreted as an expired session', async () => {
  const failure = Object.assign(new Error('Authentication storage is unavailable.'), { status: 503, code: 'authentication_unavailable' });
  const f = fixture({ session: Promise.reject(failure) });
  try {
    f.stream.dispatchEvent(new Event('error')); await checkpoint();
    assert.deepEqual(f.state.errors, ['Authentication storage is unavailable.']);
    assert.deepEqual(f.state.authentication, []);
    assert.deepEqual(f.state.setup, []);
  } finally { f.cleanup(); }
});

test('a delayed storage error from the old stream cannot replace a newer login with an obsolete warning', async () => {
  let rejectOldSession;
  const old = fixture({ session: new Promise((_resolve, reject) => { rejectOldSession = reject; }) });
  old.stream.dispatchEvent(new Event('error')); old.cleanup();
  const current = fixture({ state: old.state });
  try {
    rejectOldSession(Object.assign(new Error('Obsolete authentication storage error.'), { status: 503 })); await checkpoint();
    assert.deepEqual(current.state.errors, []); assert.deepEqual(current.state.authentication, []);
  } finally { current.cleanup(); }
});
