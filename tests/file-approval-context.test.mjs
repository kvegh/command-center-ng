import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';
import { Coordinator } from '../server/coordinator.mjs';
import { nativeApprovalAnswer } from '../server/approval-choices.mjs';

function fixture() {
  const rpc = new EventEmitter(); rpc.ready = true;
  const w = new Workspace(rpc, { beads: null });
  const agent = { id: 'worker', name: 'Example', cwd: '/example/project', role: 'worker', canSend: true, messages: [], questions: [], tasks: [], workers: [], turnId: 'turn', thread: { id: 'worker', cwd: '/example/project', status: { type: 'active' } } };
  w.agents.set(agent.id, agent); w.watched.add(agent.id);
  const coordinator = new Coordinator(w); coordinator.paused = true;
  const changes = [{ path: '/example/project/config.yml', kind: { type: 'update', move_path: null }, diff: '-previous\n+reviewed\n' }];
  const item = (extra = {}) => ({ type: 'fileChange', id: 'changes', status: 'inProgress', changes: structuredClone(changes), ...extra });
  const request = (extra = {}) => ({ id: 17, method: 'item/fileChange/requestApproval', params: { threadId: 'worker', turnId: 'turn', itemId: 'changes', reason: null, grantRoot: null, ...extra } });
  return { w, rpc, agent, coordinator, changes, item, request };
}
async function coordinatorRead(f) {
  f.coordinator.id = 'coordinator';
  f.w.agents.set('coordinator', { id: 'coordinator', role: 'coordinator', messages: [], questions: [], tasks: [], workers: [], turnId: 'coordinator-turn', thread: { status: { type: 'active' } } });
  return f.coordinator.call({ threadId: 'coordinator', turnId: 'coordinator-turn', tool: 'ccng_list_workers', arguments: {} });
}

test('native file change paths and diff reach both pending-request views without changing native params', () => {
  const f = fixture(), request = f.request();
  f.w.notification({ method: 'item/started', params: { threadId: 'worker', turnId: 'turn', item: f.item() } });
  f.w.request(request);
  const ui = f.w.snapshot().agents[0].questions[0], coordinator = f.coordinator.pendingRequests(f.agent).questions[0];
  assert.deepEqual(ui.nativeItem.changes, f.changes);
  assert.deepEqual(coordinator.nativeItem, ui.nativeItem);
  assert.deepEqual(ui.params, request.params); assert.equal(ui.id, request.id);
  assert.equal(ui.reviewToken, f.agent.questions[0].reviewToken);
  assert.equal(ui.nativeItem.state, 'available');
});

test('request-before-item is unavailable until its exact file body arrives, never an automatic answer', () => {
  const f = fixture(); f.w.request(f.request());
  assert.equal(f.w.snapshot().agents[0].questions[0].nativeItem.state, 'unavailable');
  f.w.notification({ method: 'item/started', params: { threadId: 'worker', turnId: 'turn', item: f.item() } });
  assert.equal(f.w.snapshot().agents[0].questions[0].nativeItem.state, 'available');
  assert.equal(f.agent.questions[0].responding, undefined); assert.equal(f.agent.questions[0].review, undefined);
  assert.ok(f.w.snapshot().agents[0].messages.every(message => !Object.hasOwn(message, 'fileChangeContext')));
});

test('same item IDs in other turns/workers and non-file items never supply a guessed diff', () => {
  const f = fixture(); f.w.request(f.request());
  f.w.notification({ method: 'item/started', params: { threadId: 'worker', turnId: 'other-turn', item: f.item() } });
  f.w.notification({ method: 'item/started', params: { threadId: 'other-worker', turnId: 'turn', item: f.item() } });
  assert.equal(f.w.snapshot().agents[0].questions[0].nativeItem.state, 'unavailable');
  f.w.notification({ method: 'item/started', params: { threadId: 'worker', turnId: 'turn', item: { id: 'changes', type: 'commandExecution', command: 'apply_patch example' } } });
  const context = f.w.snapshot().agents[0].questions[0].nativeItem;
  assert.equal(context.state, 'unavailable'); assert.match(context.notice, /commandExecution, not fileChange/);
  assert.deepEqual(context.changes, []);
});

test('later history/different-turn records cannot overwrite an existing exact pending body', async () => {
  const f = fixture(); f.w.request(f.request()); f.w.addItem(f.agent, f.item(), 'turn');
  f.rpc.call = async () => ({ data: [{ id: 'other-turn', status: 'completed', items: [f.item({ changes: [{ path: '/other/file', kind: { type: 'delete' }, diff: '-other' }] })] }], nextCursor: null });
  await f.w.history('worker');
  assert.deepEqual(f.w.snapshot().agents[0].questions[0].nativeItem.changes, f.changes);
});

test('full native history hydrates file details for an already delivered request', async () => {
  const f = fixture(); f.w.request(f.request()); const methods = [];
  f.rpc.call = async (method, params) => { methods.push(method); assert.equal(params.threadId, 'worker'); return { data: [{ id: 'turn', status: 'inProgress', items: [f.item()] }], nextCursor: null }; };
  const result = await f.w.recoverRequests('worker');
  assert.deepEqual(methods, ['thread/turns/list']);
  assert.equal(result.fileDetailsLoaded, 1); assert.deepEqual(f.w.snapshot().agents[0].questions[0].nativeItem.changes, f.changes);
});

test('loading reports truthful unavailability if native history provides no matching file body', async () => {
  const f = fixture(); f.w.request(f.request()); const methods = [];
  f.rpc.call = async method => { methods.push(method); return { data: [], nextCursor: null }; };
  assert.equal((await f.w.recoverRequests('worker')).fileDetailsLoaded, 0);
  const context = f.w.snapshot().agents[0].questions[0].nativeItem;
  assert.equal(context.state, 'unavailable'); assert.match(context.notice, /did not provide file paths and diff/);
  assert.deepEqual(methods, ['thread/turns/list']); assert.equal(f.agent.questions.length, 1);
});

test('disconnection and externally changed native history cannot reuse a stale approval body', async () => {
  const f = fixture(); f.w.request(f.request()); f.w.addItem(f.agent, f.item(), 'turn');
  const old = f.agent.questions[0];
  f.rpc.emit('disconnected', 'Synthetic disconnect');
  f.w.request(f.request());
  assert.equal(f.w.snapshot().agents[0].questions[0].nativeItem.state, 'unavailable');
  assert.equal(f.w.requestView(f.agent, old).nativeItem.state, 'unavailable');
  f.w.addItem(f.agent, f.item(), 'turn');
  const methods = []; f.rpc.call = async method => { methods.push(method); return { data: [], nextCursor: null }; };
  f.w.notification({ method: 'thread/reverted', params: { threadId: 'worker' } });
  assert.equal(f.w.snapshot().agents[0].questions[0].nativeItem.state, 'unavailable');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(methods.every(method => method === 'thread/turns/list'));
  assert.equal(methods.length, 2, 'external history refresh and one automatic request-body read are separate bounded reads');
  assert.equal(f.agent.questions.length, 1, 'external history changes do not decide the current approval');
});

const tick = () => new Promise(resolve => setImmediate(resolve));

test('delivered file approvals automatically hydrate their exact body and postpone review until content is available', async () => {
  const f = fixture(), calls = [], marks = [];
  f.w.coordinator = f.coordinator; f.coordinator.mark = (...args) => marks.push(args);
  f.agent.messages.push({ id: 'keep', turnId: 'older', nativeType: 'agentMessage', type: 'assistant', text: 'Unrelated history stays intact.', state: 'completed' });
  f.rpc.call = async (method, params) => {
    calls.push({ method, params });
    return { data: [{ id: 'turn', status: 'inProgress', items: [f.item(), { id: 'unrelated-command', type: 'commandExecution', command: 'Never merge unrelated history here.' }] }], nextCursor: null };
  };
  const request = f.request(); f.w.request(request);
  const original = f.agent.questions[0], token = original.reviewToken;
  assert.equal(f.w.snapshot().agents[0].questions[0].nativeItem.loading, true); assert.equal(marks.length, 0);
  await tick();
  const view = f.w.snapshot().agents[0].questions[0];
  assert.equal(view.nativeItem.state, 'available'); assert.equal(view.nativeItem.loading, false);
  assert.deepEqual(view.nativeItem.changes, f.changes); assert.deepEqual(view.params, request.params);
  assert.equal(view.reviewToken, token); assert.equal(f.agent.turnId, 'turn');
  assert.deepEqual(f.agent.messages.map(message => message.id), ['keep', 'changes']);
  assert.deepEqual(calls, [{ method: 'thread/turns/list', params: { threadId: 'worker', limit: 20, itemsView: 'full' } }]);
  assert.equal(marks.length, 1); assert.equal(original.responding, undefined); assert.equal(original.review, undefined);
});

test('automatic file hydration coalesces new requests and handles a request arriving during an older read once', async () => {
  const f = fixture(), calls = [];
  f.rpc.call = async (method, params) => { calls.push({ method, params }); return { data: [{ id: 'turn', items: [f.item(), f.item({ id: 'second' })] }], nextCursor: null }; };
  f.w.request(f.request()); f.w.request({ ...f.request({ itemId: 'second' }), id: 18 });
  await tick(); assert.equal(calls.length, 1);
  assert.ok(f.w.snapshot().agents[0].questions.every(question => question.nativeItem.state === 'available'));
  const g = fixture(); let release; let reads = 0;
  g.rpc.call = async method => {
    assert.equal(method, 'thread/turns/list'); reads++;
    if (reads === 1) return new Promise(resolve => { release = resolve; });
    return { data: [{ id: 'turn', items: [g.item({ id: 'second' })] }], nextCursor: null };
  };
  g.w.request(g.request()); await tick();
  g.w.request({ ...g.request({ itemId: 'second' }), id: 18 });
  release({ data: [{ id: 'turn', items: [g.item()] }], nextCursor: null });
  await tick(); assert.equal(reads, 2);
  assert.ok(g.w.snapshot().agents[0].questions.every(question => question.nativeItem.state === 'available'));
  await tick(); assert.equal(reads, 2, 'there is no retry or polling loop');
});

test('automatic hydration never replaces a newer live body or attaches stale request evidence', async () => {
  for (const change of ['token', 'binding', 'resolved', 'revision', 'closed', 'live']) {
    const f = fixture(); let release;
    f.rpc.call = async () => new Promise(resolve => { release = resolve; });
    f.w.request(f.request()); await tick(); const question = f.agent.questions[0];
    if (change === 'token') question.reviewToken = 'changed-token';
    if (change === 'binding') question.params.itemId = 'different-item';
    if (change === 'resolved') f.w.removeQuestion('worker', question.id);
    if (change === 'revision') f.agent.historyRevision = (f.agent.historyRevision || 0) + 1;
    if (change === 'closed') f.w.agents.delete('worker');
    if (change === 'live') f.w.notification({ method: 'item/started', params: { threadId: 'worker', turnId: 'turn', item: f.item({ changes: [{ ...f.changes[0], diff: '+newer-live' }] }) } });
    release({ data: [{ id: 'turn', items: [f.item()] }], nextCursor: null }); await tick();
    if (change === 'live') assert.equal(f.w.requestView(f.agent, question).nativeItem.changes[0].diff, '+newer-live');
    else assert.ok(f.agent.messages.every(message => !message.fileChangeContext), 'no stale file body is merged');
    assert.equal(question.responding, undefined); assert.equal(question.review, undefined);
  }
});

test('automatic detail loading truthfully stops on unavailable or failed native history and late items still update', async () => {
  for (const failure of [false, true]) {
    const f = fixture(); let reads = 0;
    f.rpc.call = async method => { reads++; assert.equal(method, 'thread/turns/list'); if (failure) throw new Error('Synthetic history read failed.'); return { data: [], nextCursor: null }; };
    f.w.request(f.request()); await tick();
    let view = f.w.snapshot().agents[0].questions[0];
    assert.equal(view.nativeItem.state, 'unavailable'); assert.equal(view.nativeItem.loading, false);
    assert.match(view.nativeItem.notice, failure ? /could not be loaded automatically/ : /did not provide file paths and diff/);
    f.w.snapshot(); f.coordinator.pendingRequests(f.agent); await tick(); assert.equal(reads, 1);
    f.w.notification({ method: 'item/started', params: { threadId: 'worker', turnId: 'turn', item: f.item() } });
    view = f.w.snapshot().agents[0].questions[0]; assert.equal(view.nativeItem.state, 'available'); assert.equal(view.detailError, null);
    assert.equal(reads, 1); assert.equal(f.agent.questions.length, 1);
  }
});

test('already delivered or immediately arriving exact items avoid an unnecessary history read', async () => {
  for (const beforeRequest of [false, true]) {
    const f = fixture(); let reads = 0;
    f.rpc.call = async () => { reads++; return { data: [], nextCursor: null }; };
    if (beforeRequest) f.w.addItem(f.agent, f.item(), 'turn');
    f.w.request(f.request());
    if (!beforeRequest) f.w.notification({ method: 'item/started', params: { threadId: 'worker', turnId: 'turn', item: f.item() } });
    await tick(); assert.equal(reads, 0); assert.equal(f.w.snapshot().agents[0].questions[0].nativeItem.state, 'available');
  }
});

test('file count, byte budget and rename targets remain explicit without mutating raw native changes', () => {
  const f = fixture(); f.w.request(f.request());
  const many = Array.from({ length: 40 }, (_, index) => ({ path: `/example/file-${index}`, kind: { type: 'update', move_path: `/example/moved-${index}` }, diff: '-old\n+new\n' }));
  f.w.addItem(f.agent, f.item({ changes: many }), 'turn');
  let context = f.w.snapshot().agents[0].questions[0].nativeItem;
  assert.equal(context.totalChanges, 40); assert.equal(context.changes.length, 32); assert.equal(context.truncated, true);
  assert.equal(context.changes[0].kind.move_path, '/example/moved-0'); assert.match(context.notice, /32-file\/32-KiB/);
  const large = [{ path: '/example/large', kind: { type: 'add' }, diff: '"\\\n😀'.repeat(30_000) }], original = structuredClone(large);
  f.w.addItem(f.agent, f.item({ changes: large }), 'turn'); context = f.w.snapshot().agents[0].questions[0].nativeItem;
  assert.ok(Buffer.byteLength(JSON.stringify(context)) <= 32 * 1024); assert.equal(context.truncated, true);
  assert.deepEqual(large, original);
});

test('file content changes during coordinator authority lookup invalidate review without changing its token', async () => {
  const f = fixture(); f.w.request(f.request()); f.w.addItem(f.agent, f.item(), 'turn');
  await coordinatorRead(f);
  const question = f.agent.questions[0], token = question.reviewToken; let complete, answers = 0;
  f.coordinator.authorizationMessage = async () => new Promise(resolve => { complete = resolve; });
  f.w.answer = async () => { answers++; };
  const reviewing = f.coordinator.review(f.agent, { reviewToken: token, decision: 'approve', rationale: 'Authorized source changes.', authorizationMessageId: 'user', authorizationQuote: 'Implement the reviewed changes.' });
  f.w.addItem(f.agent, f.item({ changes: [{ ...f.changes[0], diff: '+different change' }] }), 'turn');
  complete({ id: 'user', text: 'Implement the reviewed changes.' });
  await assert.rejects(reviewing, /file-change details changed/);
  assert.equal(answers, 0); assert.equal(question.reviewToken, token); assert.equal(question.review, undefined);
});

test('an older native history response cannot replace file details received live during its read', async () => {
  const f = fixture(); f.w.request(f.request()); f.w.addItem(f.agent, f.item(), 'turn');
  let complete; f.rpc.call = async () => new Promise(resolve => { complete = resolve; });
  const reading = f.w.history('worker');
  const newer = [{ ...f.changes[0], diff: '+new live source' }];
  f.w.notification({ method: 'item/started', params: { threadId: 'worker', turnId: 'turn', item: f.item({ changes: newer }) } });
  complete({ data: [{ id: 'turn', status: 'inProgress', items: [f.item()] }], nextCursor: null }); await reading;
  assert.deepEqual(f.w.snapshot().agents[0].questions[0].nativeItem.changes, newer);
});

test('native answers stay unchanged and file item identity never depends on a naming prefix', () => {
  const f = fixture(), request = f.request({ itemId: 'exec-example' });
  f.w.request(request); f.w.addItem(f.agent, f.item({ id: 'exec-example' }), 'turn');
  const original = f.agent.questions[0], view = f.w.snapshot().agents[0].questions[0];
  assert.equal(view.nativeItem.state, 'available');
  for (const decision of ['accept', 'acceptForSession', 'decline', 'cancel']) assert.deepEqual(nativeApprovalAnswer(view, { decision }), nativeApprovalAnswer(original, { decision }));
  assert.deepEqual(original.params, request.params); assert.ok(!Object.hasOwn(original, 'nativeItem'));
});

test('a history read in flight during disconnect cannot restore stale file details for a replayed request', async () => {
  const f = fixture(); f.w.request(f.request()); f.w.addItem(f.agent, f.item(), 'turn');
  let complete; f.rpc.call = async () => new Promise(resolve => { complete = resolve; });
  const reading = f.w.history('worker');
  f.rpc.emit('disconnected', 'Synthetic disconnect'); f.w.request(f.request());
  complete({ data: [{ id: 'turn', status: 'inProgress', items: [f.item()] }], nextCursor: null }); await reading;
  assert.equal(f.w.snapshot().agents[0].questions[0].nativeItem.state, 'unavailable');
});

test('a newer live unavailable/non-file item cannot be replaced by an older file body from history', async () => {
  for (const replacement of [{ id: 'changes', type: 'fileChange', status: 'inProgress' }, { id: 'changes', type: 'commandExecution', command: 'example' }]) {
    const f = fixture(); f.w.request(f.request()); f.w.addItem(f.agent, f.item(), 'turn');
    let complete; f.rpc.call = async () => new Promise(resolve => { complete = resolve; });
    const reading = f.w.history('worker');
    f.w.notification({ method: 'item/started', params: { threadId: 'worker', turnId: 'turn', item: replacement } });
    complete({ data: [{ id: 'turn', status: 'inProgress', items: [f.item()] }], nextCursor: null }); await reading;
    assert.equal(f.w.snapshot().agents[0].questions[0].nativeItem.state, 'unavailable');
  }
});

test('passive snapshots/internal list calls do not mark file content as read by the coordinator', async () => {
  const f = fixture(); f.w.request(f.request()); f.w.addItem(f.agent, f.item(), 'turn');
  const question = f.agent.questions[0];
  f.w.snapshot(); f.coordinator.list(); f.coordinator.pendingRequests(f.agent);
  assert.equal(question.coordinatorFileContext, undefined);
  await coordinatorRead(f);
  assert.equal(question.coordinatorFileContext, f.w.requestContextFingerprint(f.agent, question));
  assert.ok(!Object.keys(question).includes('coordinatorFileContext'));
  assert.ok(!JSON.stringify(f.w.snapshot()).includes('coordinatorFileContext'));
});

test('changes outside the display cutoff invalidate an earlier coordinator read; rereading permits the exact current review', async () => {
  const f = fixture(); f.w.request(f.request());
  const first = Array.from({ length: 40 }, (_, index) => ({ path: `/example/${index}`, kind: { type: 'update', move_path: null }, diff: '+reviewed' }));
  f.w.addItem(f.agent, f.item({ changes: first }), 'turn'); await coordinatorRead(f);
  const question = f.agent.questions[0], shown = f.w.requestView(f.agent, question).nativeItem.changes;
  const second = structuredClone(first); second[39].diff = '+new unseen change';
  f.w.addItem(f.agent, f.item({ changes: second }), 'turn');
  assert.deepEqual(f.w.requestView(f.agent, question).nativeItem.changes, shown, 'displayed prefix is unchanged');
  const args = { reviewToken: question.reviewToken, decision: 'approve', rationale: 'Authorized source changes.', authorizationMessageId: 'user', authorizationQuote: 'Implement the reviewed changes.' };
  let answers = 0;
  f.coordinator.authorizationMessage = async () => ({ id: 'user', text: args.authorizationQuote });
  f.w.answer = async () => { answers++; };
  await assert.rejects(f.coordinator.review(f.agent, args), /Read this current file approval/);
  assert.equal(answers, 0);
  await coordinatorRead(f);
  assert.equal((await f.coordinator.review(f.agent, args)).outcome, 'resolved'); assert.equal(answers, 1);
});

test('an async worker-read response binds the body actually exposed, not a newer body arriving during instruction reads', async () => {
  const f = fixture(); f.w.request(f.request()); f.w.addItem(f.agent, f.item(), 'turn'); await coordinatorRead(f);
  let complete; f.coordinator.instructions = async () => new Promise(resolve => { complete = resolve; });
  const reading = f.coordinator.call({ threadId: 'coordinator', turnId: 'coordinator-turn', tool: 'ccng_read_worker', arguments: { agentId: 'worker' } });
  f.w.addItem(f.agent, f.item({ changes: [{ ...f.changes[0], diff: '+newer native body' }] }), 'turn');
  complete([]); const exposed = await reading;
  assert.deepEqual(exposed.questions[0].nativeItem.changes, f.changes);
  assert.notEqual(f.agent.questions[0].coordinatorFileContext, f.w.requestContextFingerprint(f.agent, f.agent.questions[0]));
});

function resumePageFixture({ afterAck = false, returnedThreadId = 'worker', pageTurnId = 'turn', pageItem, liveItem } = {}) {
  const f = fixture(), calls = [], answers = [], original = f.request();
  f.coordinator.paused = false; f.coordinator.mark = () => {}; f.coordinator.flush = async () => {};
  f.w.coordinator = f.coordinator; f.w.recoveryTimeout = 200;
  f.agent.thread = { id: 'worker', parentThreadId: null, cwd: f.agent.cwd, status: { type: 'active', activeFlags: ['waitingOnApproval'] } };
  f.rpc.respond = (id, result) => answers.push({ id, result });
  f.rpc.call = async (method, params) => {
    calls.push({ method, params });
    if (method === 'thread/read') return { thread: structuredClone(f.agent.thread) };
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    if (method !== 'thread/resume') throw new Error('Unexpected native operation: ' + method);
    const deliver = () => f.rpc.emit('request', original);
    if (afterAck) setImmediate(deliver); else deliver();
    if (liveItem) f.rpc.emit('notification', { method: 'item/started', params: { threadId: 'worker', turnId: 'turn', item: liveItem } });
    return { thread: { ...structuredClone(f.agent.thread), id: returnedThreadId }, initialTurnsPage: { data: [{ id: pageTurnId, status: 'inProgress', itemsView: 'full', items: [pageItem || f.item()] }], nextCursor: null } };
  };
  return { ...f, calls, answers, original };
}

test('resume initial full-turn page hydrates original file callbacks delivered before or after acknowledgement', async () => {
  for (const afterAck of [false, true]) {
    const f = resumePageFixture({ afterAck }); await f.w.refreshObserved('worker'); await tick();
    const question = f.agent.questions[0], visible = f.w.requestView(f.agent, question);
    assert.equal(question.id, f.original.id); assert.equal(question.params, f.original.params);
    assert.equal(visible.nativeItem.state, 'available'); assert.deepEqual(visible.nativeItem.changes, f.changes);
    assert.deepEqual(f.coordinator.pendingRequests(f.agent).questions[0].nativeItem, visible.nativeItem);
    const resumed = f.calls.filter(call => call.method === 'thread/resume');
    assert.equal(resumed.length, 1); assert.deepEqual(resumed[0].params.initialTurnsPage, { limit: 1, sortDirection: 'desc', itemsView: 'full' });
    assert.equal(f.calls.filter(call => call.method === 'thread/turns/list').length, 0, 'the existing resume page supplies the body without another history read');
    assert.deepEqual(f.answers, []); assert.ok(f.calls.every(call => ['thread/read', 'thread/resume'].includes(call.method)));
  }
});

test('resume page never supplies a file diff across a mismatched thread, turn, item or native type', async () => {
  const variants = [
    { returnedThreadId: 'other-worker' }, { pageTurnId: 'other-turn' },
    { pageItem: { type: 'fileChange', id: 'other-item', changes: [{ path: '/example/unrelated', kind: { type: 'add' }, diff: '+unrelated' }] } },
    { pageItem: { type: 'commandExecution', id: 'changes', command: 'example-command' } },
  ];
  for (const variant of variants) {
    const f = resumePageFixture(variant); await f.w.refreshObserved('worker'); await tick();
    const question = f.agent.questions[0]; assert.equal(question.params, f.original.params);
    assert.equal(f.w.requestView(f.agent, question).nativeItem.state, 'unavailable');
    assert.equal(f.calls.filter(call => call.method === 'thread/resume').length, 1); assert.deepEqual(f.answers, []);
  }
});

test('newer live exact file details take precedence over an older resume-page snapshot', async () => {
  const newer = [{ path: '/example/project/config.yml', kind: { type: 'update', move_path: null }, diff: '+newer live proposal' }];
  for (const liveItem of [
    { id: 'changes', type: 'fileChange', status: 'inProgress', changes: newer },
    { id: 'changes', type: 'fileChange', status: 'inProgress' },
    { id: 'changes', type: 'commandExecution', command: 'newer native item' },
  ]) {
    const f = resumePageFixture({ liveItem }); await f.w.refreshObserved('worker'); await tick();
    const context = f.w.requestView(f.agent, f.agent.questions[0]).nativeItem;
    assert.equal(context.state, liveItem.changes ? 'available' : 'unavailable');
    assert.deepEqual(context.changes, liveItem.changes || []);
    if (liveItem.changes) assert.equal(f.calls.filter(call => call.method === 'thread/turns/list').length, 0);
    assert.deepEqual(f.answers, []);
  }
});

test('an already delivered missing-body card receives one guarded snapshot reconnect and no repeat', async () => {
  const f = resumePageFixture(); f.w.request(f.original); await tick();
  await f.w.refreshObserved('worker'); await tick();
  assert.equal(f.agent.questions[0].params, f.original.params);
  assert.equal(f.w.requestView(f.agent, f.agent.questions[0]).nativeItem.state, 'available');
  assert.equal(f.calls.filter(call => call.method === 'thread/resume').length, 1); assert.deepEqual(f.answers, []);
  assert.ok(f.calls.every(call => ['thread/read', 'thread/turns/list', 'thread/resume'].includes(call.method)));
});
