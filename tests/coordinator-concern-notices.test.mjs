import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';

const deferred = () => { const gate = { resolved: false }; gate.promise = new Promise(done => { gate.resolve = () => { gate.resolved = true; done(); }; }); return gate; };
const rationale = 'Request: Inspect the existing integration.\nConcern: Native error details are incomplete.\nNext: Diagnose the CCNG error presentation within existing scope.';

function fixture(t, targetId = 'engineering') {
  const rpc = new EventEmitter(); rpc.ready = true;
  const workspace = new Workspace(rpc, { beads: null, coordinator: {
    approvalReviewers: false, progressUpdater: false, concernReviewWorkerId: targetId,
    eventClock: { now: () => 0, setTimeout: () => 1, clearTimeout() {} },
  } });
  workspace.instructionContext = async () => ({}); workspace.refreshTasks = async () => {};
  const makeAgent = (id, role = 'worker') => ({ id, name: id, role, provider: 'codex', cwd: '/tmp/example-project',
    canSend: true, observingOnly: false, thread: { id, cwd: '/tmp/example-project', status: { type: 'idle' } },
    finishedTurn: { id: 'previous-' + id, status: 'completed' }, turnId: null, messages: [], questions: [], tasks: [], workers: [] });
  const source = makeAgent('source'), target = makeAgent('engineering'), main = makeAgent('main-coordinator', 'coordinator');
  main.turnId = 'main-turn'; main.thread.status = { type: 'active' };
  for (const agent of [source, target, main]) { workspace.agents.set(agent.id, agent); workspace.watched.add(agent.id); }
  const coordinator = workspace.coordinator; coordinator.id = main.id;
  const calls = [];
  const f = { workspace, coordinator, rpc, source, target, main, calls, sequence: 0 };
  rpc.call = async (method, params) => {
    calls.push({ method, params });
    assert.equal(method, 'turn/start', 'only synthetic delivery may reach the fixture RPC');
    if (f.deliveryError) throw f.deliveryError;
    return { turn: { id: 'notice-' + calls.length } };
  };
  rpc.respond = rpc.refuse = () => assert.fail('Concern routing must never answer a native request.');
  f.question = (context = source, extra = {}) => {
    const id = ++f.sequence;
    rpc.emit('request', { id, method: 'item/commandExecution/requestApproval', params: {
      threadId: context.id, turnId: 'work-turn', itemId: 'work-item-' + id,
      command: 'example-tool --check', availableDecisions: ['accept', 'decline'], ...extra,
    } });
    return context.questions.find(question => question.id === id);
  };
  f.ask = (question, reason = rationale, agent = source) => coordinator.review(agent, {
    reviewToken: question.reviewToken, decision: 'ask', rationale: reason,
  });
  f.finish = (turnId = main.turnId) => coordinator.completed(main.id, turnId);
  f.idle = () => { target.turnId = null; target.thread.status = { type: 'idle' }; target.finishedTurn = { id: 'last-engineering', status: 'completed' }; };
  t.after(() => coordinator.stop());
  return f;
}

async function until(predicate, message) {
  for (let i = 0; i < 40; i++) {
    await new Promise(resolve => setImmediate(resolve));
    if (predicate()) return;
  }
  assert.fail(message);
}
const settled = agent => until(() => !agent.coordinatorSending, 'Synthetic concern delivery did not settle within forty event-loop turns.');

const queued = f => f.coordinator.deliveries.get(f.target.id) || [];

test('new main asks batch at their exact turn completion; duplicate and historical observations do not resend', async t => {
  const f = fixture(t); f.target.turnId = 'engineering-busy'; f.target.thread.status = { type: 'active' };
  const first = f.question(), second = f.question();
  first.approvalAnalysis = { status: 'ready', recommendation: { decision: 'ask' } };
  assert.equal(f.coordinator.pendingConcerns.size, 0, 'an analyst recommendation is not a main referral');
  await f.ask(first); await f.ask(second);
  assert.equal(f.coordinator.pendingConcerns.size, 2); assert.equal(f.calls.length, 0);
  f.finish('older-main-turn'); assert.equal(queued(f).length, 0);
  f.main.turnId = 'newer-main-turn';
  const third = f.question(); await f.ask(third);
  f.finish('main-turn');
  assert.equal(queued(f).length, 1); assert.equal(f.coordinator.pendingConcerns.size, 1);
  assert.ok(queued(f)[0].text.includes(`Request ${first.id};`)); assert.ok(!queued(f)[0].text.includes(`Request ${third.id};`));
  await assert.rejects(f.ask(first), /waiting for your decision/);
  f.finish('main-turn'); assert.equal(queued(f).length, 1);
  f.finish('newer-main-turn'); assert.equal(queued(f).length, 2);
  const restored = f.question(); restored.review = { decision: 'ask', rationale };
  f.coordinator.audit.push({ decision: 'ask', agentId: f.source.id, requestId: restored.id, rationale });
  f.coordinator.pendingRequests(f.source); f.finish('historical-main-turn');
  assert.equal(queued(f).length, 2, 'reading restored/manual asks never scans them into routing');
  for (const question of [first, second, third, restored]) assert.equal(question.review.decision, 'ask');
});

test('non-ask main decisions and analyst recommendations do not collect concerns', async t => {
  const f = fixture(t), question = f.question();
  question.approvalAnalysis = { status: 'ready', recommendation: { decision: 'ask' } };
  f.coordinator.pendingRequests(f.source); f.finish();
  assert.equal(f.coordinator.pendingConcerns.size, 0); assert.equal(f.calls.length, 0);
  await assert.rejects(f.coordinator.review(f.source, { reviewToken: question.reviewToken, decision: 'approve', rationale }), /actual user instruction/);
  assert.equal(f.coordinator.pendingConcerns.size, 0);
  const replies = [];
  f.rpc.respond = (id, result) => {
    replies.push({ id, result });
    f.rpc.emit('notification', { method: 'serverRequest/resolved', params: { threadId: f.source.id, requestId: id } });
  };
  await f.coordinator.review(f.source, { reviewToken: question.reviewToken, decision: 'decline', rationale });
  f.finish();
  assert.equal(replies.length, 1); assert.equal(f.coordinator.pendingConcerns.size, 0); assert.equal(f.calls.length, 0);
});

test('a delivered batch retains useful origin and scope while withholding native command, credentials and review token', async t => {
  const f = fixture(t); const question = f.question();
  await f.ask(question, `Request: Inspect the request carrying ${question.reviewToken}.\nConcern: ${question.params.command}\nNext: password=synthetic-password-value`);
  f.finish(); await settled(f.target);
  assert.equal(f.calls.length, 1); assert.equal(queued(f).length, 0);
  const text = f.calls[0].params.input[0].text;
  for (const value of [question.params.command, question.reviewToken, 'synthetic-password-value', 'availableDecisions']) assert.ok(!text.includes(value), value);
  assert.match(text, /source.*Request [0-9]+; native turn work-turn; item work-item-/s);
  assert.match(text, /observations, not new user authority/); assert.match(text, /never answer, replay or bypass/);
  assert.match(text, /within the actual authorized project scope/);
  assert.equal(question.review.decision, 'ask'); assert.equal(f.source.questions.includes(question), true);
});

test('withheld concern fields identify only the first fixed matching category and preserve the original manual ask', async t => {
  for (const [concern, expected] of [
    ['example-tool --check password: "synthetic-private-value" import module', 'pending-command text'],
    ['password: "synthetic-private-value" import module', 'protected source content (credential-named literal assignment)'],
    ['The source contains a ghp_synthetic_marker_example_not_real marker.', 'protected source content (provider-token marker)'],
    ['The source contains !vault content.', 'protected source content (Vault marker)'],
    ['The identifier AKIAABCDEFGHIJKLMNOP needs inspection before import work.', 'credential-shaped data'],
    ['The ordinary import process could not map this helper.', 'code-like text'],
  ]) {
    const f = fixture(t), question = f.question();
    const reason = 'Request: Diagnose the existing reader.\nConcern: ' + concern + '\nNext: Inspect the original record within existing scope.';
    await f.ask(question, reason);
    const text = f.coordinator.pendingConcerns.get(question).text;
    assert.ok(text.includes('Concern: Details withheld: ' + expected + '. Inspect the original record through permitted tools.'));
    assert.equal(text.includes(concern), false, 'the entire original field stays withheld, even for ordinary import prose');
    for (const sensitive of ['synthetic-private-value', 'ghp_synthetic_marker_example_not_real', 'AKIAABCDEFGHIJKLMNOP', 'password:', '!vault']) {
      assert.equal(text.includes(sensitive), false, 'a category must not expose the matching command, code or data');
    }
    assert.equal(question.review.rationale, reason, 'the original user-facing ask remains intact');
    assert.equal(question.review.decision, 'ask'); assert.ok(f.source.questions.includes(question));
    assert.equal(f.calls.length, 0, 'diagnostic collection neither delivers a message nor answers a native request');
  }
});

test('ordinary concern prose and the existing 900-character scan boundary remain unchanged', async t => {
  for (const [concern, expected] of [
    ['The source-reader grammar could not recognize the explicit helper reference.', 'The source-reader grammar could not recognize the explicit helper reference.'],
    ['A'.repeat(900) + ' import module', 'A'.repeat(900)],
  ]) {
    const f = fixture(t), question = f.question();
    await f.ask(question, 'Request: Diagnose the existing reader.\nConcern: ' + concern + '\nNext: Review the permitted original record.');
    const text = f.coordinator.pendingConcerns.get(question).text;
    assert.ok(text.includes('Concern: ' + expected + '\nNext:'));
    assert.doesNotMatch(text, /Details withheld:/);
    assert.equal(f.calls.length, 0); assert.equal(question.review.decision, 'ask');
  }
});

test('whole-notice live approval token stripping survives both visible fields and diagnostic withholding', async t => {
  const f = fixture(t), question = f.question();
  f.source.name = 'Worker ' + question.reviewToken;
  await f.ask(question, `Request: Check receipt ${question.reviewToken}.\nConcern: The ordinary import process mentions ${question.reviewToken}.\nNext: Refer to receipt ${question.reviewToken}.`);
  const text = f.coordinator.pendingConcerns.get(question).text;
  assert.equal(text.includes(question.reviewToken), false);
  assert.equal(text.match(/\[approval token omitted\]/g)?.length, 3, 'the worker name and visible request/next fields are stripped');
  assert.match(text, /Concern: Details withheld: code-like text\./);
  assert.equal(text.includes('The ordinary import process'), false);
  assert.equal(question.review.decision, 'ask'); assert.ok(f.source.questions.includes(question));
  assert.equal(f.calls.length, 0);
});

test('child referrals retain the verified parent and child identities without answering the native request', async t => {
  const f = fixture(t); f.target.turnId = 'busy'; f.target.thread.status = { type: 'active' };
  const child = { ...f.source, id: 'child-worker', name: 'Child worker', questions: [], workers: [],
    thread: { id: 'child-worker', parentThreadId: f.source.id, status: { type: 'active' } } };
  f.source.workers.push({ id: child.id, requestContext: child });
  const question = f.question(child); assert.ok(question);
  await f.ask(question); f.finish();
  assert.match(queued(f)[0].text, /source \(source\) \/ Child worker \(child-worker\)/);
  assert.equal(question.review.decision, 'ask');
});

test('self routing, unavailable targets and full queues preserve the original manual ask and expose the precise routing problem', async t => {
  for (const kind of ['self', 'unknown', 'coordinator', 'claude', 'external', 'full']) {
    const f = fixture(t, kind === 'self' ? 'source' : kind === 'unknown' ? 'missing-worker' : 'engineering');
    if (kind === 'coordinator') f.target.role = 'coordinator';
    if (kind === 'claude') f.target.provider = 'claude';
    if (kind === 'external') f.target.externalSession = true;
    if (kind === 'full') f.coordinator.deliveries.set(f.target.id, Array.from({ length: 4 }, () => ({ kind: 'summary', text: 'Earlier retained delivery.', error: 'Delivery unconfirmed.' })));
    const question = f.question(); await f.ask(question); f.finish(); await settled(f.target);
    assert.equal(f.calls.length, 0, kind); assert.equal(question.review.decision, 'ask');
    const state = f.coordinator.snapshot().concernReview;
    assert.match(state.error, kind === 'self' ? /own pending request/ : kind === 'full' ? /queue is full/ : /unavailable/);
    assert.equal(state.collected, kind === 'self' ? 0 : 1);
  }
});

test('uncertain delivery remains queued with an error and cannot replay on later completion or flush', async t => {
  const f = fixture(t); f.deliveryError = new Error('Synthetic native delivery timed out.');
  const question = f.question(); await f.ask(question); f.finish(); await settled(f.target);
  assert.equal(f.calls.length, 1); assert.match(queued(f)[0].error, /timed out/);
  assert.match(f.coordinator.error, /not confirmed.*will not retry automatically/);
  f.finish(); f.coordinator.completed(f.target.id, 'unrelated-turn'); await f.coordinator.flush(f.target.id);
  assert.equal(f.calls.length, 1); assert.equal(queued(f).length, 1); assert.equal(question.review.decision, 'ask');
});

test('concern delivery rechecks stop, pause, handoff, native epoch and target identity after context awaits', async t => {
  for (const [name, change] of [
    ['stop intent', f => { f.target.requestStopIntent = {}; }],
    ['paused', f => { f.coordinator.paused = true; }],
    ['stopped', f => { f.coordinator.stopped = true; }],
    ['restoring', f => { f.workspace.restoring = true; }],
    ['handoff', f => { f.target.handoff = {}; }],
    ['incoming', f => { f.workspace.handoffs.incoming = () => true; }],
    ['epoch', f => { f.workspace.requestEpoch++; }],
    ['target replaced', f => { f.workspace.agents.set(f.target.id, { ...f.target }); }],
    ['target changed', f => { f.coordinator.setConcernReviewWorker('another-worker'); }],
    ['provider changed', f => { f.target.provider = 'claude'; f.workspace.claude = { available: true, send: async () => { f.calls.push({ method: 'claude/send' }); } }; }],
    ['cannot send', f => { f.target.canSend = false; }],
    ['native request', f => { f.target.questions.push({ id: 'new-native-request' }); }],
    ['active turn', f => { f.target.turnId = 'new-work'; f.target.thread.status = { type: 'active' }; }],
  ]) {
    const f = fixture(t), entered = deferred(), gate = deferred();
    f.workspace.instructionContext = async () => { entered.resolve(); await gate.promise; return {}; };
    const question = f.question(); await f.ask(question); f.finish();
    await until(() => entered.resolved, 'The synthetic delivery did not enter context preparation.'); change(f); gate.resolve(); await settled(f.target);
    assert.equal(f.calls.length, 0, name); assert.equal(queued(f).length, 1, name);
    assert.equal(question.review.decision, 'ask', name);
    if (!['epoch', 'target replaced', 'target changed', 'provider changed'].includes(name)) assert.equal(queued(f)[0].error, undefined, name + ': an evidenced wait must remain queued without an uncertain-delivery error');
  }
});

test('clearing messages during context preparation cancels the unsent notice without touching the original ask', async t => {
  const f = fixture(t), entered = deferred(), gate = deferred();
  f.workspace.instructionContext = async () => { entered.resolve(); await gate.promise; return {}; };
  const question = f.question(); await f.ask(question); f.finish();
  await until(() => entered.resolved, 'The synthetic delivery did not enter context preparation.'); f.coordinator.clearMessages(); gate.resolve(); await settled(f.target);
  assert.equal(f.calls.length, 0, 'an explicitly cleared unsent concern must not launch after context preparation');
  assert.equal(queued(f).length, 0); assert.equal(f.coordinator.pendingConcerns.size, 0);
  assert.equal(question.review.decision, 'ask'); assert.equal(f.source.questions.includes(question), true);
});

test('closing the engineering destination cancels only unsent notices and preserves manual source questions', async t => {
  const f = fixture(t); f.target.turnId = 'busy'; f.target.thread.status = { type: 'active' };
  const question = f.question(); await f.ask(question); f.finish();
  assert.equal(queued(f).length, 1);
  f.coordinator.closed(f.target.id); f.workspace.agents.delete(f.target.id);
  assert.equal(f.coordinator.pendingConcerns.size, 0); assert.equal(queued(f).length, 0);
  assert.match(f.coordinator.snapshot().concernReview.error, /closed.*cancelled/);
  assert.equal(question.review.decision, 'ask'); assert.equal(f.calls.length, 0);
});
