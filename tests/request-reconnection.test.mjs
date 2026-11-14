import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const waiting = () => ({ type: 'active', activeFlags: ['waitingOnApproval'] });
const overload = () => Object.assign(new Error('Server overloaded; retry later.'), { code: -32001 });
function fixture({ observed = false } = {}) {
  const rpc = new EventEmitter(); rpc.ready = true;
  const workspace = new Workspace(rpc, { beads: null, recoveryTimeout: 2 });
  const thread = { id: 'worker', parentThreadId: null, name: 'Example project', cwd: '/example/project', status: waiting(), canAcceptDirectInput: true };
  const threads = new Map([['worker', thread]]), calls = [], responses = [], requests = new Map();
  const worker = { id: 'worker', role: 'worker', provider: 'codex', name: thread.name, cwd: thread.cwd, thread: structuredClone(thread), observingOnly: observed, canSend: true, messages: [], tasks: [], workers: [], questions: [], turnId: observed ? null : 'worker-turn' };
  workspace.agents.set(worker.id, worker); workspace.watched.add(worker.id);
  const f = { workspace, rpc, worker, threads, calls, responses, requests, outcome: 'replay' };
  const request = id => ({ id: id === 'worker' ? 'original-root-request' : 73, method: 'item/commandExecution/requestApproval', params: { threadId: id, turnId: id + '-turn', itemId: id + '-command', command: 'example-read-only-command', availableDecisions: ['accept', 'decline', 'cancel'] } });
  rpc.call = async (method, params) => {
    calls.push({ method, params });
    if (method === 'thread/read') return { thread: structuredClone(threads.get(params.threadId)) };
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    if (method === 'thread/resume') {
      if (f.resumeError) throw f.resumeError;
      if (f.outcome === 'error') throw new Error('Native attachment acknowledgement unavailable.');
      if (f.outcome === 'replay') {
        const original = request(params.threadId); requests.set(params.threadId, original);
        rpc.emit('request', original); // Native callback deliberately precedes the resume response.
      }
      if (f.resumeGate) await f.resumeGate.promise;
      return { thread: structuredClone(threads.get(params.threadId)) };
    }
    if (method === 'turn/interrupt') return {};
    throw new Error('Unexpected native operation: ' + method);
  };
  rpc.respond = (id, result) => responses.push({ id, result }); rpc.refuse = () => { throw new Error('Reconnection must not refuse native requests.'); };
  const coordinator = { paused: false, stopped: false, mark() {}, flush: async () => {}, completed() {}, closed() {}, markRemainingApprovals() {} };
  workspace.coordinator = coordinator; f.coordinator = coordinator;
  f.resumes = () => calls.filter(call => call.method === 'thread/resume');
  f.assertNoExecution = () => {
    assert.deepEqual(responses, []);
    assert.ok(calls.every(call => ['thread/read', 'thread/turns/list', 'thread/resume', 'turn/interrupt'].includes(call.method)), 'no turn start, steering, commands, settings or native answers');
  };
  return f;
}

test('existing poll reconnects attached and restored roots and preserves callbacks arriving before acknowledgement', async () => {
  for (const observed of [false, true]) {
    const f = fixture({ observed });
    await f.workspace.refreshObserved('worker');
    assert.deepEqual(f.resumes().map(call => call.params), [{ threadId: 'worker', excludeTurns: true, initialTurnsPage: { limit: 1, sortDirection: 'desc', itemsView: 'full' } }]);
    const original = f.requests.get('worker'), question = f.worker.questions[0];
    assert.equal(question.id, original.id); assert.equal(question.params, original.params); assert.equal(question.method, original.method);
    assert.equal(f.worker.observingOnly, false); assert.equal(f.workspace.agents.size, 1); f.assertNoExecution();
  }
});

test('native child discovery is read-only and the next existing poll detects its future approval wait', async () => {
  const f = fixture(); f.worker.thread.status = { type: 'idle' }; f.threads.get('worker').status = { type: 'idle' };
  f.threads.set('child', { id: 'child', parentThreadId: 'worker', name: 'Native reviewer', status: { type: 'active', activeFlags: [] } });
  f.workspace.addItem(f.worker, { id: 'spawn', type: 'subAgentActivity', agentThreadId: 'child', agentPath: '/reviewer', kind: 'started' }, 'worker-turn');
  await tick(); assert.equal(f.resumes().length, 0);
  const child = f.workspace.resolveRequestContext(f.worker, 'child'); assert.equal(child.canSend, false, 'local no-chat flag is not a native ownership refusal');
  f.threads.get('child').status = waiting();
  await f.workspace.refreshObserved('worker');
  assert.deepEqual(f.resumes().map(call => call.params), [{ threadId: 'child', excludeTurns: true, initialTurnsPage: { limit: 1, sortDirection: 'desc', itemsView: 'full' } }]);
  assert.equal(child.questions[0].id, 73); assert.equal(child.questions[0].params, f.requests.get('child').params);
  assert.deepEqual(f.worker.questions, []); assert.equal(f.workspace.agents.size, 1); f.assertNoExecution();
});

test('concurrent poll calls coalesce while exact native attachment is awaiting acknowledgement', async () => {
  const f = fixture(), started = deferred(); f.resumeGate = deferred();
  const call = f.rpc.call;
  f.rpc.call = (method, params) => { if (method === 'thread/resume') started.resolve(); return call(method, params); };
  const first = f.workspace.refreshObserved('worker'); await started.promise;
  const second = f.workspace.refreshObserved('worker');
  f.resumeGate.resolve(); await Promise.all([first, second]);
  assert.equal(f.resumes().length, 1); assert.equal(f.worker.questions.length, 1); f.assertNoExecution();
});

test('existing poll retries an explicitly overloaded native attachment after cooldown and keeps its original callback', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture(); f.resumeError = overload();
  await f.workspace.refreshObserved('worker');
  assert.equal(f.resumes().length, 1); assert.match(f.worker.requestError, /Server overloaded/);
  f.resumeError = null;
  await f.workspace.refreshObserved('worker');
  t.mock.timers.tick(4999); await f.workspace.refreshObserved('worker');
  assert.equal(f.resumes().length, 1, 'ordinary polling never retries before the five-second deadline');
  t.mock.timers.tick(1); await f.workspace.refreshObserved('worker');
  assert.equal(f.resumes().length, 2);
  const original = f.requests.get('worker');
  assert.equal(f.worker.questions[0].id, original.id); assert.equal(f.worker.questions[0].params, original.params);
  assert.equal(f.worker.requestError, null);
  t.mock.timers.tick(60000); await f.workspace.refreshObserved('worker');
  assert.equal(f.resumes().length, 2, 'an already delivered callback prevents further recovery');
  f.assertNoExecution();
});

test('overloaded attachment has at most two additional attempts spaced five seconds apart', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture(); f.resumeError = overload();
  await f.workspace.refreshObserved('worker');
  for (let additional = 1; additional <= 2; additional++) {
    t.mock.timers.tick(4999); await f.workspace.refreshObserved('worker');
    assert.equal(f.resumes().length, additional);
    t.mock.timers.tick(1); await f.workspace.refreshObserved('worker');
    assert.equal(f.resumes().length, additional + 1);
  }
  f.resumeError = null;
  for (let update = 1; update <= 3; update++) {
    f.threads.get('worker').updatedAt = update;
    t.mock.timers.tick(60000); await f.workspace.refreshObserved('worker');
  }
  assert.equal(f.resumes().length, 3, 'later polls and metadata changes cannot exceed the continuous-episode bound');
  assert.deepEqual(f.worker.questions, []); f.assertNoExecution();
});

test('timeouts, disconnect errors and nonmatching overload errors do not enable automatic retries', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const errors = [
    new Error('Codex request timed out: thread/resume'),
    new Error('Codex connection closed. Reconnect to continue.'),
    new Error('Server overloaded; retry later.'),
    Object.assign(new Error('Server overloaded; retry later.'), { code: -32000 }),
    Object.assign(new Error('Server overloaded; retry later.'), { code: '-32001' }),
    Object.assign(new Error('Server busy; retry later.'), { code: -32001 }),
  ];
  for (const error of errors) {
    const f = fixture(); f.resumeError = error;
    await f.workspace.refreshObserved('worker');
    f.resumeError = null;
    for (let poll = 0; poll < 2; poll++) { t.mock.timers.tick(60000); await f.workspace.refreshObserved('worker'); }
    assert.equal(f.resumes().length, 1, error.message); assert.deepEqual(f.worker.questions, []); f.assertNoExecution();
  }
});

test('an overloaded final status read never repeats a successfully acknowledged attachment', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture(), call = f.rpc.call; f.outcome = 'empty';
  let resumed = false, rejectedRead = false;
  f.rpc.call = async (method, params) => {
    const result = await call(method, params);
    if (method === 'thread/resume') resumed = true;
    if (method === 'thread/read' && resumed && !rejectedRead) { rejectedRead = true; throw overload(); }
    return result;
  };
  await f.workspace.refreshObserved('worker');
  assert.equal(rejectedRead, true); assert.equal(f.resumes().length, 1);
  assert.match(f.worker.requestError, /Server overloaded/);
  f.outcome = 'replay';
  for (let poll = 0; poll < 3; poll++) { t.mock.timers.tick(60000); await f.workspace.refreshObserved('worker'); }
  assert.equal(f.resumes().length, 1, 'overload after admission does not authorize another attachment');
  assert.deepEqual(f.worker.questions, []); f.assertNoExecution();
});

test('an overload rejection does not consume a concurrently delivered file callback snapshot', async () => {
  const f = fixture(), call = f.rpc.call, historyStarted = deferred(), historyGate = deferred(); f.outcome = 'empty';
  const original = { id: 'concurrent-file-request', method: 'item/fileChange/requestApproval', params: { threadId: 'worker', turnId: 'worker-turn', itemId: 'file-change' } };
  let rejected = false;
  f.rpc.call = async (method, params) => {
    if (method === 'thread/resume' && !rejected) {
      f.calls.push({ method, params }); rejected = true;
      f.rpc.emit('request', original);
      throw overload();
    }
    if (method === 'thread/turns/list') { historyStarted.resolve(); await historyGate.promise; }
    return call(method, params);
  };
  try {
    await f.workspace.reconnectWaitingRequests(f.worker, f.worker);
    await historyStarted.promise;
    const question = f.worker.questions[0];
    assert.equal(question.id, original.id); assert.equal(question.params, original.params);
    assert.equal(question.fileSnapshotAttempted, undefined, 'a rejected attachment returned no live file snapshot');
    const details = f.workspace.requestJobs.get('worker');
    historyGate.resolve(); await details;
    assert.equal(f.resumes().length, 2, 'the original file callback retains its one permitted live snapshot attempt');
    assert.equal(question.fileSnapshotAttempted, true); assert.equal(f.worker.questions[0], question);
    f.assertNoExecution();
  } finally { historyGate.resolve(); await f.workspace.requestJobs.get('worker'); }
});

test('overload cooldown retries retain pause, stop, handoff and delivered-question gates', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const setups = [
    f => { f.coordinator.paused = true; }, f => { f.coordinator.stopped = true; },
    f => { f.worker.handoff = { phase: 'waiting' }; }, f => { f.worker.canSend = false; },
    f => { f.threads.get('worker').canAcceptDirectInput = false; }, f => { f.workspace.restoring = true; },
    async f => { await f.workspace.interrupt('worker'); },
    f => f.rpc.emit('request', { id: 'arrived-during-cooldown', method: 'item/commandExecution/requestApproval', params: { threadId: 'worker', turnId: 'worker-turn', itemId: 'original-command', command: 'example-command', availableDecisions: ['accept', 'decline'] } }),
  ];
  for (const setup of setups) {
    const f = fixture(); f.resumeError = overload();
    await f.workspace.refreshObserved('worker'); assert.equal(f.resumes().length, 1);
    f.resumeError = null; await setup(f);
    t.mock.timers.tick(5000); await f.workspace.refreshObserved('worker');
    assert.equal(f.resumes().length, 1); f.assertNoExecution();
  }
});

test('overload cooldown does not retry after history or native child lineage changes', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const root = fixture(); root.resumeError = overload();
  await root.workspace.refreshObserved('worker');
  root.resumeError = null; root.worker.historyRevision = (root.worker.historyRevision || 0) + 1;
  t.mock.timers.tick(5000); await root.workspace.refreshObserved('worker');
  assert.equal(root.resumes().length, 1); root.assertNoExecution();

  const child = fixture(); child.worker.thread.status = { type: 'idle' }; child.threads.get('worker').status = { type: 'idle' };
  child.threads.set('child', { id: 'child', parentThreadId: 'worker', status: waiting() });
  child.workspace.addItem(child.worker, { id: 'spawn', type: 'subAgentActivity', agentThreadId: 'child', agentPath: '/reviewer', kind: 'started' }, 'worker-turn');
  await tick(); child.resumeError = overload(); await child.workspace.refreshObserved('worker');
  assert.equal(child.resumes().length, 1);
  child.resumeError = null; child.threads.get('child').parentThreadId = 'foreign-parent';
  t.mock.timers.tick(5000); await child.workspace.refreshObserved('worker');
  assert.equal(child.resumes().length, 1); child.assertNoExecution();
});

test('empty or failed attachment never hot-retries a continuous wait merely because metadata updates', async () => {
  for (const outcome of ['empty', 'error']) {
    const f = fixture(); f.outcome = outcome;
    await f.workspace.refreshObserved('worker');
    assert.equal(f.resumes().length, 1); assert.ok(f.worker.requestError);
    for (let update = 1; update <= 2; update++) { f.threads.get('worker').updatedAt = update; await f.workspace.refreshObserved('worker'); }
    assert.equal(f.resumes().length, 1); assert.deepEqual(f.worker.questions, []); f.assertNoExecution();
  }
});

test('a fresh waiting episode, new connection and explicit manual retry can each make a new scoped attempt', async () => {
  const f = fixture(); f.outcome = 'empty'; await f.workspace.refreshObserved('worker');
  // Both native transitions occur before the next poll; metadata reads alone
  // cannot observe the intermediate nonwaiting state.
  f.workspace.notification({ method: 'thread/status/changed', params: { threadId: 'worker', status: { type: 'active', activeFlags: [] } } });
  f.workspace.notification({ method: 'thread/status/changed', params: { threadId: 'worker', status: waiting() } });
  await f.workspace.refreshObserved('worker');
  assert.equal(f.resumes().length, 2);
  f.rpc.ready = false; f.rpc.emit('disconnected', 'Fixture disconnected.');
  f.rpc.ready = true; f.rpc.emit('connected'); await f.workspace.refreshObserved('worker');
  assert.equal(f.resumes().length, 3);
  f.outcome = 'replay'; await f.workspace.recoverRequests('worker');
  assert.equal(f.resumes().length, 4); assert.equal(f.worker.questions[0].params, f.requests.get('worker').params); f.assertNoExecution();
});

test('pause, explicit stop, handoff and ownership boundaries prevent automatic attachment', async () => {
  const setups = [
    f => { f.coordinator.paused = true; }, f => { f.coordinator.stopped = true; },
    f => { f.worker.handoff = { phase: 'waiting' }; }, f => { f.worker.canSend = false; },
    f => { f.threads.get('worker').canAcceptDirectInput = false; },
    f => { f.workspace.restoring = true; },
    async f => { await f.workspace.interrupt('worker'); },
  ];
  for (const setup of setups) {
    const f = fixture(); await setup(f); await f.workspace.refreshObserved('worker');
    assert.equal(f.resumes().length, 0); f.assertNoExecution();
  }
});

test('native non-approval states, coordinator, Claude and already-delivered requests are not automatically reconnected', async () => {
  for (const status of [{ type: 'idle' }, { type: 'notLoaded' }, { type: 'active', activeFlags: [] }, { type: 'active', activeFlags: ['waitingOnUserInput'] }]) {
    const f = fixture(); f.worker.thread.status = structuredClone(status); f.threads.get('worker').status = status;
    await f.workspace.refreshObserved('worker'); assert.equal(f.resumes().length, 0); f.assertNoExecution();
  }
  for (const role of ['coordinator', 'claude']) {
    const f = fixture(); if (role === 'claude') f.worker.provider = role; else f.worker.role = role;
    await f.workspace.refreshObserved('worker'); assert.equal(f.resumes().length, 0); f.assertNoExecution();
  }
  const f = fixture(), original = { id: 'already-delivered', method: 'item/commandExecution/requestApproval', params: { threadId: 'worker', turnId: 'worker-turn', itemId: 'command', command: 'example-command' } };
  f.rpc.emit('request', original); await f.workspace.refreshObserved('worker');
  assert.equal(f.resumes().length, 0); assert.equal(f.worker.questions[0].params, original.params); f.assertNoExecution();
});

test('wrong native child parent is excluded even when its thread reports a current approval wait', async () => {
  const f = fixture(); f.worker.thread.status = { type: 'idle' }; f.threads.get('worker').status = { type: 'idle' };
  f.threads.set('child', { id: 'child', parentThreadId: 'foreign-parent', status: waiting() });
  f.workspace.addItem(f.worker, { id: 'spawn', type: 'subAgentActivity', agentThreadId: 'child', agentPath: '/reviewer', kind: 'started' }, 'worker-turn');
  await tick(); await f.workspace.refreshObserved('worker');
  assert.equal(f.resumes().length, 0); assert.throws(() => f.workspace.resolveRequestContext(f.worker, 'child'), /verified native subagent/); f.assertNoExecution();
});

test('closing, disconnecting or completing a turn during the final status read prevents stale native attachment', async () => {
  for (const change of ['closed', 'disconnected', 'completed']) {
    const f = fixture(), entered = deferred(), read = deferred(), call = f.rpc.call; let reads = 0;
    f.rpc.call = (method, params) => {
      if (method === 'thread/read' && ++reads === 2) { entered.resolve(); return read.promise; }
      return call(method, params);
    };
    const polling = f.workspace.refreshObserved('worker'); await entered.promise;
    if (change === 'closed') f.workspace.close('worker');
    if (change === 'disconnected') { f.rpc.ready = false; f.rpc.emit('disconnected', 'Fixture disconnected.'); }
    if (change === 'completed') f.workspace.notification({ method: 'turn/completed', params: { threadId: 'worker', turn: { id: 'worker-turn', status: 'completed' } } });
    read.resolve({ thread: structuredClone(f.threads.get('worker')) }); await polling;
    assert.equal(f.resumes().length, 0); f.assertNoExecution();
  }
});

test('failed interruption and explicit native command/file cancellation are not undone by automatic reconnection', async () => {
  const stopped = fixture(), call = stopped.rpc.call;
  stopped.rpc.call = (method, params) => method === 'turn/interrupt' ? Promise.reject(new Error('Interrupt acknowledgement unavailable.')) : call(method, params);
  await assert.rejects(stopped.workspace.interrupt('worker'), /acknowledgement unavailable/);
  await stopped.workspace.refreshObserved('worker'); assert.equal(stopped.resumes().length, 0); stopped.assertNoExecution();
  for (const method of ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval']) {
    const f = fixture(), request = { id: 'cancel-this-action', method, params: { threadId: 'worker', turnId: 'worker-turn', itemId: 'cancel-command', command: 'example-command', availableDecisions: ['accept', 'decline', 'cancel'] } };
    f.rpc.emit('request', request);
    const cancelled = f.workspace.answer('worker', request.id, { decision: 'cancel' });
    f.workspace.notification({ method: 'serverRequest/resolved', params: { threadId: 'worker', requestId: request.id } }); await cancelled;
    await f.workspace.refreshObserved('worker');
    assert.deepEqual(f.responses, [{ id: request.id, result: { decision: 'cancel' } }]); assert.equal(f.resumes().length, 0);
    assert.ok(f.calls.every(call => ['thread/read', 'thread/turns/list'].includes(call.method)), 'automatic polling never restarts or reruns a cancelled action');
  }
  const invalid = fixture(), request = { id: 'invalid-choice', method: 'item/commandExecution/requestApproval', params: { threadId: 'worker', availableDecisions: ['accept'], command: 'example-command' } };
  invalid.rpc.emit('request', request);
  assert.throws(() => invalid.workspace.answer('worker', request.id, { decision: 'cancel' }), /offered/);
  invalid.workspace.notification({ method: 'serverRequest/resolved', params: { threadId: 'worker', requestId: request.id } });
  await invalid.workspace.refreshObserved('worker');
  assert.equal(invalid.resumes().length, 1, 'an invalid choice never latches stop intent'); invalid.assertNoExecution();
});


test('replayed worker internal tools remain with their executor while owned coordinator tools retain their handler', async () => {
  const f = fixture(), call = f.rpc.call;
  f.rpc.call = (method, params) => {
    if (method === 'thread/resume') {
      f.rpc.emit('request', { id: 'original-executor-call', method: 'item/tool/call', params: { threadId: 'worker', turnId: 'worker-turn', callId: 'original-tool', tool: 'external_executor', arguments: {} } });
      f.rpc.emit('request', { id: 'internal-proof', method: 'attestation/generate', params: { threadId: 'worker' } });
    }
    return call(method, params);
  };
  await f.workspace.refreshObserved('worker');
  assert.equal(f.resumes().length, 1); assert.equal(f.worker.questions.length, 1);
  assert.equal(f.worker.questions[0].id, 'original-root-request');
  assert.equal(f.workspace.pending.size, 1, 'foreign internal callbacks are neither approval cards nor automatic rejections');
  const handled = [];
  f.coordinator.id = 'own-coordinator'; f.coordinator.handle = message => { handled.push(message); };
  const owned = { id: 'own-tool', method: 'item/tool/call', params: { threadId: 'own-coordinator', tool: 'ccng_list_workers', arguments: {} } };
  f.workspace.request(owned); assert.deepEqual(handled, [owned]);
  f.assertNoExecution();
});
