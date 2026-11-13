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
let sessionApplier, runtimeReadiness, sendReadiness;
function hasInitialStateRead(node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'api'
    && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'state') return true;
  return ts.forEachChild(node, hasInitialStateRead) || false;
}
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'applySession') sessionApplier = node.initializer;
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'runtimeReady') runtimeReadiness = node.initializer;
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'readyToSend') sendReadiness = node.initializer;
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useEffect'
    && ts.isArrowFunction(node.arguments[0]) && hasInitialStateRead(node.arguments[0])) effects.push(node.arguments[0]);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(effects.length, 1, 'test the actual authenticated workspace initialization effect');
assert.ok(sessionApplier, 'test the actual session state application too');
const { makeEffect, makeSessionApplier, runtimeReady, sendReady } = await compiledModule(`
export const runtimeReady = ${runtimeReadiness.getText(ast)};
export function sendReady({ active, activeConnected, draftText, draftImages, busy, draftLocked, activeOwnStatus, hasReadyDraft }) { return ${sendReadiness.getText(ast)}; }
export function makeEffect({ authenticated, api, EventSource, observeWorkspaceStream, setState, setError, setStreamHealth, setWorkspaceReconnecting, applySession, apiAuthentication }) { return ${effects[0].getText(ast)}; }
export function makeSessionApplier({ setLoginSession, setAuthenticated, setSessionReadError, apiAuthentication, browserSave }) { return ${sessionApplier.getText(ast)}; }
`);

const statusSource = await readFile(new URL('../src/worker-status.tsx', import.meta.url), 'utf8');
const statusAst = ts.createSourceFile('worker-status.tsx', statusSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const observer = statusAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'observeWorkspaceStream');
const { observeWorkspaceStream } = await compiledModule(observer.getText(statusAst));

const snapshot = (name, questionIds = []) => ({ name, connected: true, codexConnected: true, agents: [{ id: 'worker', canSend: true, status: 'idle', questions: questionIds.map(id => ({ id })) }] });
const checkpoint = () => new Promise(resolve => setImmediate(resolve));
function fixture({ authenticated = true, state = { value: null, writes: [], errors: [], health: [], authentication: [], setup: [], flushed: 0 }, session = Promise.resolve({ authenticated: true }), apiAuthentication = { generation: 0 } } = {}) {
  const streams = [], requests = [], reads = [];
  class Stream extends EventTarget {
    constructor(url) { super(); this.url = url; this.closed = false; streams.push(this); }
    close() { this.closed = true; }
  }
  const cleanup = makeEffect({
    authenticated, EventSource: Stream, observeWorkspaceStream, apiAuthentication,
    api: (route, data) => {
      assert.equal(data, undefined, 'browser recovery must never write, resume or replay native input');
      requests.push(route);
      if (route === 'state') return new Promise((resolve, reject) => reads.push({ resolve, reject }));
      if (route === 'session') return session;
      throw new Error('Unexpected route: ' + route);
    },
    setState: update => { state.value = typeof update === 'function' ? update(state.value) : update; state.writes.push(state.value); },
    setError: message => state.errors.push(message),
    setStreamHealth: value => state.health.push(value),
    setWorkspaceReconnecting: value => { state.reconnecting = value; },
    applySession: makeSessionApplier({ setAuthenticated: value => state.authentication.push(value), setLoginSession: value => state.setup.push(value), setSessionReadError() {}, apiAuthentication, browserSave: { current: () => { state.flushed++; } } }),
  })();
  return {
    state, requests, reads, apiAuthentication, stream: streams[0], streams, cleanup,
    resolveInitial: value => reads[0].resolve(value), rejectInitial: error => reads[0].reject(error),
    publish: value => streams[0].dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })),
    canSend() {
      const active = state.value?.agents[0];
      return !!state.value && sendReady({ active, activeConnected: runtimeReady(state.value), draftText: 'Retained draft', draftImages: [], busy: '', draftLocked: false, activeOwnStatus: active?.status, hasReadyDraft: () => true });
    },
  };
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

test('browser recovery restores Send from a fresh read without reconnecting native sessions or replaying input', async () => {
  const f = fixture();
  try {
    f.resolveInitial(snapshot('before interruption')); await checkpoint();
    assert.equal(f.canSend(), true);
    f.stream.dispatchEvent(new Event('open'));
    f.stream.dispatchEvent(new Event('heartbeat'));
    assert.equal(f.reads.length, 1, 'ordinary transport signals need no additional read');

    f.stream.dispatchEvent(new Event('error'));
    assert.equal(f.canSend(), false);
    assert.equal(f.state.reconnecting, true);
    f.stream.dispatchEvent(new Event('open'));
    assert.equal(f.reads.length, 2);
    assert.equal(f.canSend(), false, 'opening browser transport alone is not authoritative native state');
    assert.equal(f.state.reconnecting, true, 'retain browser recovery feedback until state is refreshed');
    f.stream.dispatchEvent(new Event('heartbeat'));
    assert.equal(f.reads.length, 2, 'heartbeats do not repeatedly read the workspace');

    f.reads[1].resolve(snapshot('recovered')); await checkpoint();
    assert.equal(f.canSend(), true);
    assert.equal(f.state.reconnecting, false);
    assert.deepEqual(f.requests, ['state', 'session', 'state']);
  } finally { f.cleanup(); }
});

test('a fresh disconnected native runtime remains unable to Send after browser recovery', async () => {
  const f = fixture();
  try {
    f.publish(snapshot('before interruption'));
    f.stream.dispatchEvent(new Event('error'));
    f.stream.dispatchEvent(new Event('open'));
    const nativeOffline = { ...snapshot('native unavailable'), connected: false, codexConnected: false, error: 'Native runtime unavailable.' };
    f.reads[1].resolve(nativeOffline); await checkpoint();
    assert.deepEqual(f.state.value, nativeOffline);
    assert.equal(f.state.reconnecting, false);
    assert.equal(f.canSend(), false, 'browser recovery cannot claim a native connection');
  } finally { f.cleanup(); }
});

test('a failed recovery read waits for another transport signal and retries without duplicate reads', async () => {
  const f = fixture();
  try {
    f.publish(snapshot('before interruption'));
    f.stream.dispatchEvent(new Event('error'));
    f.stream.dispatchEvent(new Event('open'));
    f.reads[1].reject(Object.assign(new Error('Workspace state is temporarily unavailable.'), { status: 503 }));
    await checkpoint();
    assert.equal(f.canSend(), false);
    assert.equal(f.state.reconnecting, true);
    assert.equal(f.reads.length, 2, 'a failure alone does not start a retry loop');
    assert.deepEqual(f.state.errors, ['Workspace state is temporarily unavailable.']);

    f.stream.dispatchEvent(new Event('heartbeat'));
    assert.equal(f.reads.length, 3);
    f.stream.dispatchEvent(new Event('heartbeat'));
    f.stream.dispatchEvent(new Event('open'));
    assert.equal(f.reads.length, 3, 'transport signals must not duplicate a pending recovery');
    assert.equal(f.canSend(), false);
    f.reads[2].resolve(snapshot('recovered after temporary failure')); await checkpoint();
    assert.equal(f.canSend(), true);
    assert.equal(f.state.reconnecting, false);
    f.stream.dispatchEvent(new Event('heartbeat'));
    assert.equal(f.reads.length, 3, 'successful recovery ends retries');
    assert.deepEqual(f.requests, ['state', 'session', 'state', 'state']);
  } finally { f.cleanup(); }
});

test('fresh streamed native questions win over a delayed recovery read or failure', async () => {
  for (const fails of [false, true]) {
    const f = fixture();
    try {
      f.publish(snapshot('original'));
      f.stream.dispatchEvent(new Event('error'));
      f.stream.dispatchEvent(new Event('open'));
      const current = snapshot('new native request', ['approval-one']);
      f.publish(current);
      if (fails) f.reads[1].reject(new Error('Obsolete recovery failure'));
      else f.reads[1].resolve(snapshot('stale read without requests'));
      await checkpoint();
      assert.deepEqual(f.state.value, current);
      assert.deepEqual(f.state.errors, []);
      assert.equal(f.state.reconnecting, false);
      assert.equal(f.canSend(), false, 'a pending native request must still block ordinary input');
      f.stream.dispatchEvent(new Event('heartbeat'));
      assert.equal(f.reads.length, 2, 'obsolete recovery results must not rearm reads after a current snapshot');
    } finally { f.cleanup(); }
  }
});

test('a snapshot arriving before recovered open repairs state without an unnecessary recovery read', async () => {
  const f = fixture();
  try {
    f.publish(snapshot('original'));
    f.stream.dispatchEvent(new Event('error'));
    f.publish(snapshot('authoritative streamed recovery'));
    f.stream.dispatchEvent(new Event('open'));
    f.stream.dispatchEvent(new Event('heartbeat'));
    assert.equal(f.reads.length, 1);
    assert.equal(f.state.reconnecting, false);
    assert.equal(f.canSend(), true);
    assert.deepEqual(f.requests, ['state', 'session']);
  } finally { f.cleanup(); }
});

test('another disconnect invalidates the pending recovery and the next open starts a fresh read', async () => {
  const f = fixture();
  try {
    f.publish(snapshot('original'));
    f.stream.dispatchEvent(new Event('error'));
    f.stream.dispatchEvent(new Event('open'));
    f.stream.dispatchEvent(new Event('error'));
    f.reads[1].resolve(snapshot('already obsolete recovery')); await checkpoint();
    assert.equal(f.canSend(), false);
    assert.equal(f.state.reconnecting, true);
    f.stream.dispatchEvent(new Event('open'));
    assert.equal(f.reads.length, 3);
    f.reads[2].resolve(snapshot('current recovery')); await checkpoint();
    assert.equal(f.canSend(), true);
    assert.equal(f.state.value.name, 'current recovery');
  } finally { f.cleanup(); }
});

test('a newer reconnect read is not held behind an obsolete in-flight read', async () => {
  const f = fixture();
  try {
    f.publish(snapshot('original'));
    f.stream.dispatchEvent(new Event('error'));
    f.stream.dispatchEvent(new Event('open'));
    f.stream.dispatchEvent(new Event('error'));
    f.stream.dispatchEvent(new Event('open'));
    assert.equal(f.reads.length, 3, 'the second recovery proceeds while the first remains pending');
    const current = snapshot('current native request', ['approval-two']);
    f.reads[2].resolve(current); await checkpoint();
    f.reads[1].resolve(snapshot('older recovery without requests')); await checkpoint();
    assert.deepEqual(f.state.value, current);
    assert.equal(f.canSend(), false);
    assert.equal(f.state.reconnecting, false);
  } finally { f.cleanup(); }
});

test('cleanup or changed login generation rejects late recovery results and failures', async () => {
  for (const invalidate of ['cleanup', 'login']) for (const fails of [false, true]) {
    const f = fixture();
    try {
      f.publish(snapshot('original'));
      f.stream.dispatchEvent(new Event('error'));
      f.stream.dispatchEvent(new Event('open'));
      const before = f.state.value;
      if (invalidate === 'cleanup') f.cleanup();
      else f.apiAuthentication.generation++;
      if (fails) f.reads[1].reject(new Error('Prior login recovery error'));
      else f.reads[1].resolve(snapshot('prior login recovery'));
      await checkpoint();
      assert.equal(f.state.value, before);
      assert.deepEqual(f.state.errors, []);
      assert.equal(f.canSend(), false);
      assert.equal(f.state.reconnecting, true);
    } finally { f.cleanup(); }
  }
});
