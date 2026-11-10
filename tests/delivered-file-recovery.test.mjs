import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture() {
  const rpc = new EventEmitter(); rpc.ready = true;
  const w = new Workspace(rpc, { beads: null, recoveryTimeout: 5 });
  const thread = { id: 'worker', parentThreadId: null, cwd: '/example/project', status: { type: 'active', activeFlags: ['waitingOnApproval'] }, canAcceptDirectInput: true };
  const agent = { id: 'worker', name: 'Example', cwd: '/example/project', provider: 'codex', role: 'worker', canSend: true, thread: structuredClone(thread), messages: [], questions: [], workers: [], tasks: [], turnId: 'turn' };
  w.agents.set(agent.id, agent); w.watched.add(agent.id);
  const coordinator = { paused: false, stopped: false, mark() {}, flush: async () => {}, completed() {}, closed() {}, markRemainingApprovals() {} };
  w.coordinator = coordinator;
  const changes = [{ path: '/example/project/policy.yml', kind: { type: 'update', move_path: null }, diff: '-old\n+proposal' }];
  const item = { id: 'changes', type: 'fileChange', status: 'inProgress', changes };
  const original = { id: 'file-approval', method: 'item/fileChange/requestApproval', params: { threadId: 'worker', turnId: 'turn', itemId: 'changes', reason: null, grantRoot: null } };
  const calls = [], answers = [], threads = new Map([['worker', thread]]);
  const f = { w, rpc, agent, coordinator, changes, item, original, calls, answers, threads, historyItems: [], pageItems: [item] };
  rpc.respond = (...args) => answers.push(args); rpc.refuse = () => { throw new Error('A file proposal lookup cannot refuse a native request.'); };
  rpc.call = async (method, params) => {
    calls.push({ method, params });
    if (method === 'thread/turns/list') {
      if (f.historyGate) return f.historyGate.promise;
      if (f.historyError) throw new Error('Native durable history unavailable.');
      if (f.historyResult) return f.historyResult;
      return { data: [{ id: 'turn', status: 'inProgress', itemsView: 'full', items: f.historyItems }], nextCursor: null };
    }
    if (method === 'thread/read') {
      if (f.readGate) return f.readGate.promise;
      return { thread: structuredClone(threads.get(params.threadId)) };
    }
    if (method !== 'thread/resume') throw new Error('Unexpected native operation: ' + method);
    if (f.onResume) f.onResume();
    if (f.resumeError) throw new Error('Native snapshot acknowledgement unavailable.');
    return { thread: { ...structuredClone(threads.get(params.threadId)), ...(f.returnedThread || {}) }, initialTurnsPage: { data: [{ id: f.pageTurn || 'turn', status: 'inProgress', itemsView: 'full', items: f.pageItems }], nextCursor: null } };
  };
  f.deliver = () => { rpc.emit('request', original); return agent.questions[0]; };
  f.view = question => w.requestView(w.resolveRequestContext(agent, question.params.threadId), question).nativeItem;
  f.resumes = () => calls.filter(call => call.method === 'thread/resume');
  f.settle = async () => {
    for (let count = 0; count < 5; count++) { await tick(); const job = w.requestJobs.get(original.params.threadId); if (job) await job.catch(() => {}); }
  };
  f.noExecution = () => { assert.deepEqual(answers, []); assert.ok(calls.every(call => ['thread/turns/list', 'thread/read', 'thread/resume'].includes(call.method))); };
  return f;
}

test('an already delivered file approval missing durable history gets one exact guarded snapshot reconnect', async () => {
  const f = fixture(), question = f.deliver(), token = question.reviewToken; await f.settle();
  assert.deepEqual(f.resumes().map(call => call.params), [{ threadId: 'worker', excludeTurns: true, initialTurnsPage: { limit: 1, sortDirection: 'desc', itemsView: 'full' } }]);
  assert.equal(f.calls.filter(call => call.method === 'thread/turns/list').length, 1, 'existing bounded history is tried before attachment');
  assert.equal(f.agent.questions[0], question); assert.equal(question.reviewToken, token); assert.equal(question.params, f.original.params);
  assert.deepEqual(f.view(question).changes, f.changes); assert.equal(f.view(question).state, 'available'); f.noExecution();
});

test('an existing exact durable file body avoids any snapshot reconnect', async () => {
  const f = fixture(); f.historyItems = [f.item]; const question = f.deliver(); await f.settle();
  assert.equal(f.resumes().length, 0); assert.deepEqual(f.view(question).changes, f.changes); f.noExecution();
});

test('empty or failed snapshots never retry the same delivered approval on polls or explicit detail reloads', async () => {
  for (const failure of [false, true]) {
    const f = fixture(); f.pageItems = []; f.resumeError = failure;
    const question = f.deliver(); await f.settle(); assert.equal(f.resumes().length, 1);
    assert.equal(f.view(question).state, 'unavailable'); assert.ok(question.detailError);
    await f.w.refreshObserved('worker');
    await f.w.recoverRequests('worker').catch(() => {}); await f.settle();
    assert.equal(f.resumes().length, 1); assert.equal(f.agent.questions[0], question); f.noExecution();
  }
});

test('guarded snapshot refuses already responding, failed-answer, paused, stopped, transferring or nonwaiting approvals', async () => {
  const setups = [
    (f, question) => { question.responding = true; }, (f, question) => { question.error = 'Previous native answer not confirmed.'; },
    f => { f.coordinator.paused = true; }, f => { f.coordinator.stopped = true; },
    f => { f.agent.handoff = { phase: 'waiting' }; }, f => { Object.defineProperty(f.agent, 'requestStopIntent', { value: {}, configurable: true }); },
    f => { f.threads.get('worker').status = { type: 'idle' }; }, f => { f.threads.get('worker').status = { type: 'notLoaded' }; },
    f => { f.threads.get('worker').status = { type: 'active', activeFlags: ['waitingOnUserInput'] }; },
  ];
  for (const setup of setups) {
    const f = fixture(), question = f.deliver(); setup(f, question); await f.settle();
    assert.equal(f.resumes().length, 0); assert.equal(f.view(question).state, 'unavailable'); f.noExecution();
  }
});

test('resolved, replaced, retokened or disconnected requests cannot reconnect after their in-flight history read', async () => {
  for (const change of ['resolved', 'replaced', 'token', 'epoch']) {
    const f = fixture(); f.historyGate = deferred(); const question = f.deliver(); await tick();
    if (change === 'resolved') f.w.notification({ method: 'serverRequest/resolved', params: { threadId: 'worker', requestId: question.id } });
    if (change === 'replaced') {
      const replacement = { ...question, reviewToken: 'replacement-token', responding: true };
      f.w.pending.set(JSON.stringify(['worker', question.id]), replacement); f.agent.questions = [replacement];
    }
    if (change === 'token') question.reviewToken = 'new-current-token';
    if (change === 'epoch') { f.rpc.ready = false; f.rpc.emit('disconnected', 'Fixture disconnected.'); }
    f.historyGate.resolve({ data: [], nextCursor: null }); await f.settle();
    assert.equal(f.resumes().length, 0); f.noExecution();
  }
});

test('snapshot validates child lineage and fresh request state after the status read', async () => {
  for (const change of ['resolved', 'responding', 'paused', 'handoff', 'epoch']) {
    const f = fixture(); f.readGate = deferred(); const question = f.deliver(); await tick();
    if (change === 'resolved') f.w.notification({ method: 'serverRequest/resolved', params: { threadId: 'worker', requestId: question.id } });
    if (change === 'responding') question.responding = true;
    if (change === 'paused') f.coordinator.paused = true;
    if (change === 'handoff') f.agent.handoff = { phase: 'waiting' };
    if (change === 'epoch') { f.rpc.ready = false; f.rpc.emit('disconnected', 'Fixture disconnected.'); }
    f.readGate.resolve({ thread: structuredClone(f.threads.get('worker')) }); await f.settle();
    assert.equal(f.resumes().length, 0); f.noExecution();
  }
  const f = fixture(); f.threads.set('child', { id: 'child', parentThreadId: 'worker', status: { type: 'active', activeFlags: ['waitingOnApproval'] } });
  f.w.addItem(f.agent, { id: 'spawn', type: 'subAgentActivity', kind: 'started', agentThreadId: 'child', agentPath: '/reviewer' }, 'turn'); await tick();
  const context = f.w.resolveRequestContext(f.agent, 'child'); f.original.params.threadId = 'child'; f.historyGate = deferred();
  f.rpc.emit('request', f.original); await tick();
  f.w.agents.set('child', { ...context, thread: { ...context.thread, parentThreadId: 'other-worker' } });
  f.historyGate.resolve({ data: [], nextCursor: null }); await f.settle();
  assert.equal(f.resumes().length, 0); assert.throws(() => f.w.resolveRequestContext(f.agent, 'child'), /verified native subagent/); f.noExecution();
});

test('wrong snapshot identity/type cannot hydrate while newer live proposals always win', async () => {
  const variants = [
    { returnedThread: { id: 'other-worker' } }, { pageTurn: 'other-turn' },
    { pageItems: [{ id: 'other-item', type: 'fileChange', changes: [] }] },
    { pageItems: [{ id: 'changes', type: 'commandExecution', command: 'example' }] },
  ];
  for (const variant of variants) {
    const f = fixture(); Object.assign(f, variant); const question = f.deliver(); await f.settle();
    assert.equal(f.view(question).state, 'unavailable'); assert.equal(f.resumes().length, 1); f.noExecution();
  }
  const f = fixture(), newer = [{ ...f.changes[0], diff: '+newer live proposal' }];
  f.onResume = () => f.w.notification({ method: 'item/started', params: { threadId: 'worker', turnId: 'turn', item: { ...f.item, changes: newer } } });
  const question = f.deliver(); await f.settle();
  assert.deepEqual(f.view(question).changes, newer); assert.equal(f.resumes().length, 1); f.noExecution();
});

test('failed or malformed durable reads do not repeat on automatic polls for the same eligible callback', async () => {
  for (const malformed of [false, true]) {
    const f = fixture(); if (malformed) f.historyResult = { data: null }; else f.historyError = true;
    const question = f.deliver(), token = question.reviewToken; await f.settle();
    for (let count = 0; count < 3; count++) { f.threads.get('worker').updatedAt = count; await f.w.refreshObserved('worker'); await f.settle(); }
    assert.equal(f.calls.filter(call => call.method === 'thread/turns/list').length, 1);
    assert.equal(f.resumes().length, 0); assert.equal(f.agent.questions[0], question); assert.equal(question.reviewToken, token);
    assert.equal(f.view(question).state, 'unavailable'); assert.ok(question.detailError); f.noExecution();
  }
  const f = fixture(); f.coordinator.paused = true; f.historyError = true;
  const question = f.deliver(); await f.settle(); assert.equal(f.resumes().length, 0);
  f.coordinator.paused = false; f.historyError = false; await f.w.refreshObserved('worker'); await f.settle();
  assert.equal(f.resumes().length, 1, 'a read failure while paused does not consume later authorized recovery');
  assert.deepEqual(f.view(question).changes, f.changes); f.noExecution();
});

test('local cwd changes during durable or fresh metadata reads prevent attaching a proposal to the old context', async () => {
  for (const stage of ['history', 'status']) {
    const f = fixture(), gate = deferred(); f[stage === 'history' ? 'historyGate' : 'readGate'] = gate;
    const question = f.deliver(), token = question.reviewToken; await tick();
    f.agent.cwd = '/example/changed-project';
    gate.resolve(stage === 'history' ? { data: [], nextCursor: null } : { thread: structuredClone(f.threads.get('worker')) });
    await f.settle();
    assert.equal(f.resumes().length, 0); assert.equal(question.params, f.original.params); assert.equal(question.reviewToken, token);
    assert.equal(f.view(question).state, 'unavailable'); f.noExecution();
  }
});

test('fresh native read or resume cwd mismatch never hydrates a file proposal for another directory', async () => {
  for (const stage of ['status', 'ack', 'local-ack']) {
    const f = fixture();
    if (stage === 'status') f.threads.get('worker').cwd = '/example/other-project';
    if (stage === 'ack') f.returnedThread = { cwd: '/example/other-project' };
    if (stage === 'local-ack') f.onResume = () => { f.agent.cwd = '/example/other-project'; };
    const question = f.deliver(), token = question.reviewToken; await f.settle();
    assert.equal(f.resumes().length, stage === 'status' ? 0 : 1);
    assert.equal(f.view(question).state, 'unavailable'); assert.equal(question.params, f.original.params); assert.equal(question.reviewToken, token);
    f.noExecution();
  }
});
