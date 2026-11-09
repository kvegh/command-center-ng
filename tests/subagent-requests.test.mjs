import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture() {
  const rpc = new EventEmitter(); rpc.ready = true; const calls = [], replies = [];
  const workspace = new Workspace(rpc, { beads: null, answerTimeout: 100 });
  const parent = { id: 'parent', name: 'Project', role: 'worker', canSend: true, cwd: '/example/project', messages: [], questions: [], tasks: [], workers: [], thread: { id: 'parent', status: { type: 'idle' } }, turnId: null };
  workspace.agents.set(parent.id, parent); workspace.watched.add(parent.id);
  const threads = new Map([['child', { id: 'child', name: 'Review', parentThreadId: 'parent', cwd: '/example/project', status: { type: 'active', activeFlags: ['waitingOnApproval'] } }]]);
  rpc.call = async (method, params) => {
    calls.push({ method, params });
    if (method === 'thread/read') return { thread: structuredClone(threads.get(params.threadId)) };
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    if (method === 'turn/start') return { turn: { id: 'parent-turn' } };
    throw new Error('Unexpected native call: ' + method);
  };
  rpc.respond = (id, result) => replies.push({ id, result }); rpc.refuse = () => { throw new Error('No request may be automatically refused.'); };
  workspace.instructionContext = async () => ({});
  const discover = (id = 'child', owner = 'parent') => workspace.notification({ method: 'item/completed', params: { threadId: owner, turnId: 'owner-turn', item: { id: 'activity-' + id, type: 'subAgentActivity', agentThreadId: id, agentPath: '/review', kind: 'started' } } });
  const request = (id = 7, threadId = 'child', extra = {}) => ({ id, method: 'item/commandExecution/requestApproval', params: { threadId, turnId: 'child-turn', itemId: 'command', command: 'example-command', availableDecisions: ['accept', 'decline', 'cancel'], ...extra } });
  const answer = question => ({ decision: 'accept', reviewToken: question.reviewToken, turnId: question.params.turnId, itemId: question.params.itemId });
  return { workspace, parent, rpc, threads, calls, replies, discover, request, answer };
}

test('verified subagent requests appear under their parent without a tab or parent-input block', async () => {
  const f = fixture(); f.discover(); await tick(); f.workspace.request(f.request());
  const snapshot = f.workspace.snapshot(), parent = snapshot.agents[0], child = parent.workers[0];
  assert.equal(snapshot.agents.length, 1); assert.equal(f.workspace.workerCount(), 1);
  assert.equal(parent.status, 'attention'); assert.equal(parent.ownStatus, 'idle'); assert.deepEqual(f.parent.questions, []);
  assert.equal(f.parent.thread.status.type, 'idle'); assert.equal(child.id, 'child'); assert.equal(child.needsInput, true);
  assert.equal(child.questions[0].params.threadId, 'child'); assert.deepEqual(child.questions[0].params, f.request().params);
  assert.equal(child.questions[0].reviewToken, f.workspace.resolveRequestContext(f.parent, 'child').questions[0].reviewToken);
  assert.equal(snapshot.backgroundQuestions, 0); assert.equal(Object.hasOwn(child, 'requestContext'), false);
  await f.workspace.send('parent', 'Continue independent work.');
  assert.equal(f.calls.at(-1).method, 'turn/start'); assert.equal(f.calls.at(-1).params.threadId, 'parent'); assert.deepEqual(f.replies, []);
});

test('known native candidate retains an exact request arriving during lineage verification', async () => {
  const f = fixture(), read = deferred(), original = f.rpc.call;
  f.rpc.call = (method, params) => method === 'thread/read' ? read.promise : original(method, params);
  f.discover(); const incoming = f.request(); f.workspace.request(incoming);
  const before = f.workspace.snapshot().agents[0].workers[0];
  assert.deepEqual(before.questions, []); assert.match(before.requestError, /Verifying/); assert.equal(f.workspace.pending.size, 1);
  assert.throws(() => f.workspace.answer('parent', 7, {}, 'child'), /verified native subagent/);
  read.resolve({ thread: f.threads.get('child') }); await tick();
  const context = f.workspace.resolveRequestContext(f.parent, 'child');
  assert.equal(context.questions.length, 1); assert.equal(context.questions[0].params, incoming.params);
  assert.equal(f.workspace.snapshot().agents[0].workers[0].questions[0].id, incoming.id); assert.deepEqual(f.replies, []);
});

test('unrelated interaction targets and ordinary forked branches do not gain child request authority', async () => {
  const f = fixture();
  for (const tool of ['wait', 'sendInput', 'sendMessage']) f.workspace.addItem(f.parent, { id: tool, type: 'collabAgentToolCall', tool, agentsStates: { stranger: { status: 'running' } } }, 'turn');
  f.workspace.request(f.request(7, 'stranger')); assert.equal(f.workspace.pending.size, 0);
  f.workspace.request(f.request(8, 'undiscovered')); assert.equal(f.workspace.pending.size, 0);
  f.threads.set('branch', { id: 'branch', forkedFromId: 'parent', parentThreadId: null, status: { type: 'active' } });
  f.discover('branch'); f.workspace.request(f.request(9, 'branch')); assert.equal(f.workspace.pending.size, 1);
  await tick();
  assert.equal(f.workspace.pending.size, 0); assert.throws(() => f.workspace.resolveRequestContext(f.parent, 'branch'), /verified native subagent/);
  assert.deepEqual(f.workspace.snapshot().agents[0].workers.find(worker => worker.id === 'branch').questions, []);
  assert.deepEqual(f.replies, []);
});

test('manual child answers preserve typed IDs and wait for the exact native resolution', async () => {
  const f = fixture(); f.discover(); await tick();
  f.workspace.request(f.request(7, 'parent')); f.workspace.request(f.request('7'));
  const child = f.workspace.resolveRequestContext(f.parent, 'child'), question = child.questions[0];
  assert.throws(() => f.workspace.answer('parent', '7', { ...f.answer(question), reviewToken: 'stale' }, 'child'), /changed/);
  assert.throws(() => f.workspace.answer('parent', '7', { decision: 'accept', reviewToken: question.reviewToken }, 'child'), /binding changed/);
  let resolved = false; const result = f.workspace.answer('parent', '7', f.answer(question), 'child').then(() => { resolved = true; });
  assert.deepEqual(f.replies, [{ id: '7', result: { decision: 'accept' } }]); assert.equal(question.responding, true);
  f.workspace.notification({ method: 'serverRequest/resolved', params: { threadId: 'child', requestId: 7 } }); await tick();
  assert.equal(resolved, false, 'numeric ID cannot resolve the string request');
  f.workspace.notification({ method: 'serverRequest/resolved', params: { threadId: 'child', requestId: '7' } }); await result;
  assert.equal(child.questions.length, 0); assert.equal(f.parent.questions[0].id, 7); assert.equal(resolved, true);
});

test('child file-change detail loading reads only the exact native child and keeps bindings unchanged', async () => {
  const f = fixture(); f.discover(); await tick();
  const request = { id: 11, method: 'item/fileChange/requestApproval', params: { threadId: 'child', turnId: 'child-turn', itemId: 'changes', reason: null } };
  f.workspace.request(request);
  const original = f.rpc.call, changes = [{ path: '/example/project/file', kind: { type: 'update', move_path: null }, diff: '-old\n+new' }];
  f.rpc.call = async (method, params) => {
    if (method !== 'thread/turns/list') return original(method, params);
    f.calls.push({ method, params }); return { data: [{ id: 'child-turn', status: 'inProgress', items: [{ id: 'changes', type: 'fileChange', changes }] }], nextCursor: null };
  };
  assert.equal((await f.workspace.recoverRequests('parent', 'child')).fileDetailsLoaded, 1);
  const question = f.workspace.snapshot().agents[0].workers[0].questions[0];
  assert.deepEqual(question.params, request.params); assert.deepEqual(question.nativeItem.changes, changes); assert.equal(question.nativeItem.threadId, 'child');
  assert.ok(f.calls.every(call => ['thread/read', 'thread/turns/list'].includes(call.method))); assert.deepEqual(f.replies, []);
  assert.ok(f.calls.filter(call => call.method === 'thread/turns/list').every(call => call.params.threadId === 'child' && call.params.itemsView === 'full'));
  assert.ok(!JSON.stringify(f.workspace.snapshot().agents[0].workers).includes('fileChangeContext'));
});

test('nested native descendants retain lineage, reject cross-parent access and bound cycles', async () => {
  const f = fixture(); f.discover(); await tick();
  f.threads.set('grandchild', { id: 'grandchild', parentThreadId: 'child', status: { type: 'active', activeFlags: ['waitingOnUserInput'] } });
  f.discover('grandchild', 'child'); await tick(); f.workspace.request(f.request(12, 'grandchild'));
  assert.deepEqual(f.workspace.requestContexts(f.parent).map(context => context.id), ['parent', 'child', 'grandchild']);
  assert.equal(f.workspace.snapshot().agents[0].workers.find(worker => worker.id === 'grandchild').questions[0].id, 12);
  const stranger = { ...f.parent, id: 'other-parent', workers: [] }; f.workspace.agents.set(stranger.id, stranger);
  assert.throws(() => f.workspace.resolveRequestContext(stranger, 'grandchild'), /verified native subagent/);
  const grandchild = f.workspace.resolveRequestContext(f.parent, 'grandchild'), loop = { id: 'parent' };
  Object.defineProperty(loop, 'requestContext', { value: f.parent }); grandchild.workers.push(loop);
  assert.equal(f.workspace.requestContexts(f.parent, { includeUnverified: true }).length, 3);
});

test('opening a child separately shares pending identity and acknowledgement instead of duplicating requests', async () => {
  const f = fixture(); f.discover(); await tick(); f.workspace.request(f.request());
  const old = f.workspace.resolveRequestContext(f.parent, 'child'), question = old.questions[0];
  const child = { ...old, messages: [...old.messages], questions: [question] }; f.workspace.agents.set(child.id, child);
  assert.equal(f.workspace.resolveRequestContext(f.parent, 'child'), child);
  const waiting = f.workspace.answer('parent', 7, f.answer(question), 'child');
  assert.throws(() => f.workspace.answer('child', 7, { decision: 'accept' }), /awaiting confirmation/);
  f.workspace.notification({ method: 'serverRequest/resolved', params: { threadId: 'child', requestId: 7 } }); await waiting;
  assert.deepEqual(child.questions, []); assert.deepEqual(f.workspace.snapshot().agents[0].workers[0].questions, []); assert.equal(f.replies.length, 1);
  f.workspace.close('child');
  assert.deepEqual(f.workspace.snapshot().agents[0].workers[0].questions, [], 'closing a separate child tab cannot resurrect its previously resolved request');
});

test('closing parent or disconnecting prevents stale child reads and approvals from becoming actionable', async () => {
  const f = fixture(), late = deferred(); f.rpc.call = async () => late.promise;
  f.discover(); f.workspace.request(f.request()); f.workspace.close('parent');
  late.resolve({ thread: f.threads.get('child') }); await tick();
  assert.equal(f.workspace.requestContextCurrent(f.parent, f.parent.workers[0].requestContext), false);
  assert.throws(() => f.workspace.answer('parent', 7, {}, 'child'), /Open this agent/);
  const g = fixture(); g.discover(); await tick(); g.workspace.request(g.request());
  const context = g.workspace.resolveRequestContext(g.parent, 'child');
  g.rpc.ready = false; g.rpc.emit('disconnected', 'Fixture disconnected.');
  assert.deepEqual(context.questions, []); assert.equal(g.workspace.pending.size, 0);
  assert.throws(() => g.workspace.resolveRequestContext(g.parent, 'child'), /verified native subagent/);
  g.rpc.ready = true;
  await g.workspace.recoverRequests('parent', 'child');
  assert.match(context.requestError, /did not deliver request details/);
  assert.equal(g.workspace.snapshot().agents[0].workers[0].needsInput, true); assert.deepEqual(g.replies, []);
});

test('older parent history preserves internal child context and no raw child transcript is serialized', async () => {
  const f = fixture(); f.discover(); await tick(); f.workspace.request(f.request());
  const child = f.workspace.resolveRequestContext(f.parent, 'child');
  child.messages.push({ id: 'internal-detail', text: 'Bounded native activity', fileChangeContext: { secret: 'private-in-memory-detail' } });
  await f.workspace.history('parent', 'older');
  assert.equal(f.workspace.resolveRequestContext(f.parent, 'child'), child);
  assert.equal(f.workspace.snapshot().agents[0].workers[0].questions[0].id, 7);
  assert.ok(!JSON.stringify(f.workspace.snapshot()).includes('private-in-memory-detail'));
});

test('terminal child turn events show their actual outcome without treating idle as completion', async () => {
  const f = fixture(); f.threads.get('child').status = { type: 'idle' }; f.discover(); await tick();
  assert.equal(f.workspace.snapshot().agents[0].workers[0].status, 'idle');
  for (const status of ['failed', 'interrupted', 'completed']) {
    f.workspace.notification({ method: 'turn/completed', params: { threadId: 'child', turn: { id: 'child-turn', status } } });
    assert.equal(f.workspace.snapshot().agents[0].workers[0].status, status);
  }
});

test('new separately-open native ownership contradicting a hidden child fails closed without old fallback', async () => {
  const f = fixture(); f.discover(); await tick(); f.workspace.request(f.request());
  const old = f.workspace.resolveRequestContext(f.parent, 'child'), question = old.questions[0];
  const other = { ...old, thread: { ...old.thread, parentThreadId: 'other-parent' } };
  f.workspace.agents.set('child', other);
  assert.throws(() => f.workspace.resolveRequestContext(f.parent, 'child'), /verified native subagent/);
  assert.throws(() => f.workspace.answer('parent', 7, f.answer(question), 'child'), /verified native subagent/);
  assert.deepEqual(f.workspace.snapshot().agents[0].workers[0].questions, []);
  f.workspace.close('child');
  assert.throws(() => f.workspace.resolveRequestContext(f.parent, 'child'), /verified native subagent/, 'closing the new view must not resurrect its contradicted old lineage');
  assert.deepEqual(f.replies, []);
});

test('late child recovery read cannot reinstate waiting after native completion and request resolution', async () => {
  const f = fixture(); f.discover(); await tick(); f.workspace.request(f.request());
  const read = deferred(); f.rpc.call = async method => { assert.equal(method, 'thread/read'); return read.promise; };
  const loading = f.workspace.recoverRequests('parent', 'child');
  f.workspace.notification({ method: 'turn/completed', params: { threadId: 'child', turn: { id: 'child-turn', status: 'completed' } } });
  f.workspace.notification({ method: 'serverRequest/resolved', params: { threadId: 'child', requestId: 7 } });
  read.resolve({ thread: structuredClone(f.threads.get('child')) }); await loading;
  const child = f.workspace.snapshot().agents[0].workers[0];
  assert.equal(child.status, 'completed'); assert.equal(child.needsInput, false); assert.equal(child.requestError, null); assert.deepEqual(child.questions, []);
});

test('supplied nullable native turn and item bindings are preserved by manual child answers', async () => {
  const f = fixture(); f.discover(); await tick(); f.workspace.request(f.request(19, 'child', { turnId: null, itemId: null }));
  const question = f.workspace.resolveRequestContext(f.parent, 'child').questions[0];
  const result = f.workspace.answer('parent', 19, f.answer(question), 'child');
  assert.deepEqual(f.replies, [{ id: 19, result: { decision: 'accept' } }]);
  f.workspace.notification({ method: 'serverRequest/resolved', params: { threadId: 'child', requestId: 19 } }); await result;
});
