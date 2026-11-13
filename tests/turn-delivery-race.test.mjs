import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';
import { asyncQuestionView } from '../server/async-question-replies.mjs';

const oldTurn = '11111111-1111-4111-8111-111111111111';
const currentTurn = '22222222-2222-4222-8222-222222222222';
const laterTurn = '33333333-3333-4333-8333-333333333333';
const mismatch = (expected = oldTurn, found = currentTurn) => new Error(`expected active turn id \`${expected}\` but found \`${found}\``);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture() {
  const rpc = new EventEmitter(); rpc.ready = true;
  const workspace = new Workspace(rpc, { beads: null, recoveryTimeout: 20 });
  workspace.instructionContext = async () => ({}); workspace.refreshTasks = async () => {};
  const agent = { id: 'synthetic-worker', cwd: '/tmp/example-project', provider: 'codex', role: 'worker', canSend: true, observingOnly: false,
    thread: { id: 'synthetic-worker', cwd: '/tmp/example-project', status: { type: 'active', activeFlags: [] } },
    turnId: oldTurn, messages: [], questions: [], tasks: [], workers: [] };
  workspace.agents.set(agent.id, agent); workspace.watched.add(agent.id);
  const f = { rpc, workspace, agent, calls: [], steerCount: 0, native: { id: agent.id, cwd: agent.cwd, status: { type: 'active', activeFlags: [] }, canAcceptDirectInput: true }, latest: { id: currentTurn, status: 'inProgress', items: [] } };
  rpc.call = async (method, params) => {
    f.calls.push({ method, params });
    if (method === 'turn/steer') {
      f.steerCount++;
      if (f.steerCount === 1) throw f.firstError || mismatch();
      if (f.retryError) throw f.retryError;
      return { turnId: params.expectedTurnId };
    }
    if (method === 'thread/turns/list') { await f.onPage?.(); return { data: [structuredClone(f.latest)], nextCursor: null }; }
    if (method === 'thread/read') { await f.onRead?.(); return { thread: structuredClone(f.native) }; }
    if (method === 'turn/start' && f.start) { f.startEntered.resolve(); return f.start.promise; }
    if (method === 'thread/resume' && f.replay) {
      rpc.emit('request', { id: 17, method: 'item/commandExecution/requestApproval', params: { threadId: agent.id, turnId: currentTurn, itemId: 'native-command', command: 'synthetic-read-command' } });
      return { thread: structuredClone(f.native) };
    }
    throw new Error('Unexpected synthetic operation: ' + method);
  };
  rpc.respond = rpc.refuse = () => assert.fail('Turn recovery must never answer or refuse a native request.');
  f.started = id => workspace.notification({ method: 'turn/started', params: { threadId: agent.id, turn: { id } } });
  f.completed = (id, status = 'completed', error) => workspace.notification({ method: 'turn/completed', params: { threadId: agent.id, turn: { id, status, error } } });
  return f;
}

function question(f, turnId = f.agent.turnId, id = 'original-question') {
  f.workspace.addItem(f.agent, { type: 'agentMessage', id, text: 'A recorded question.', questions: [{ title: 'Choose the existing option?', options: ['Existing', 'Separate'] }] }, turnId, false, { live: true, completed: true });
  return f.agent.messages.find(message => message.id === id);
}

test('exact native precondition rejection retries once with the same payload and internal identity', async () => {
  const f = fixture();
  const delivered = await f.workspace.send(f.agent.id, 'A single authorized follow-up.', { report: true });
  assert.deepEqual(delivered, { turnId: currentTurn });
  assert.deepEqual(f.calls.map(call => call.method), ['turn/steer', 'thread/turns/list', 'thread/read', 'turn/steer']);
  const [first, second] = f.calls.filter(call => call.method === 'turn/steer');
  assert.equal(first.params.expectedTurnId, oldTurn); assert.equal(second.params.expectedTurnId, currentTurn);
  assert.equal(first.params.input, second.params.input); assert.equal(first.params.clientUserMessageId, second.params.clientUserMessageId);
  assert.match(first.params.clientUserMessageId, /^ccng-report-/);
  assert.equal(f.agent.turnId, currentTurn); assert.equal(f.agent.messages.length, 0, 'no input receipt is fabricated');
});

test('a successful steer receipt remains attributed to its actual attempted turn when a newer turn starts', async () => {
  const f = fixture();
  f.rpc.call = async (method, params) => {
    f.calls.push({ method, params }); assert.equal(method, 'turn/steer');
    f.started(currentTurn); return {};
  };
  assert.deepEqual(await f.workspace.send(f.agent.id, 'A single accepted input.'), { turnId: oldTurn });
  assert.equal(f.agent.turnId, currentTurn); assert.equal(f.calls.length, 1);
});

test('a second turn mismatch is definitely not sent and never starts or retries another turn', async () => {
  const f = fixture(); f.retryError = mismatch(currentTurn, laterTurn);
  await assert.rejects(f.workspace.send(f.agent.id, 'Keep this message available.'), error => error.code === 'native_input_not_sent' && /not sent/.test(error.message));
  assert.equal(f.steerCount, 2); assert.equal(f.calls.some(call => call.method === 'turn/start'), false);
});

test('timeouts, disconnection and mismatches for a different attempted ID never retry', async () => {
  for (const error of [new Error('Codex request timed out: turn/steer'), new Error('Codex connection closed.'), mismatch(laterTurn, currentTurn), new Error('Native input failed.')]) {
    const f = fixture(); f.firstError = error;
    await assert.rejects(f.workspace.send(f.agent.id, 'Submit at most once.'), value => value === error);
    assert.deepEqual(f.calls.map(call => call.method), ['turn/steer']);
  }
  const f = fixture(); f.retryError = new Error('Codex request timed out: turn/steer');
  await assert.rejects(f.workspace.send(f.agent.id, 'Do not replay uncertain retry.'), /timed out/);
  assert.equal(f.steerCount, 2);
});

test('recovery refuses a new write when native reads fail, are incomplete or show idle', async () => {
  for (const change of [
    f => { f.onPage = () => { throw new Error('Read unavailable'); }; },
    f => { f.latest.status = 'completed'; f.native.status = { type: 'idle' }; },
    f => { f.latest.status = 'completed'; },
    f => { f.native.id = 'other-worker'; },
    f => { f.native.cwd = '/tmp/another-project'; },
    f => { f.native.parentThreadId = 'another-parent'; },
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(f.workspace.send(f.agent.id, 'Keep unsent text.'), error => error.code === 'native_input_not_sent');
    assert.equal(f.steerCount, 1); assert.equal(f.calls.some(call => call.method === 'turn/start'), false);
  }
});

test('stop, pause, ownership, requests, handoff and native-connection changes prevent retry', async () => {
  for (const change of [
    f => { Object.defineProperty(f.agent, 'requestStopIntent', { value: {}, configurable: true }); },
    f => { f.workspace.coordinator = { paused: true }; },
    f => { f.workspace.coordinator = { stopped: true }; },
    f => { f.workspace.restoring = true; },
    f => { f.workspace.requestEpoch++; },
    f => { f.rpc.ready = false; },
    f => { f.workspace.agents.delete(f.agent.id); },
    f => { f.agent.questions.push({ id: 'new-native-request' }); },
    f => { f.agent.handoff = { phase: 'waiting' }; },
    f => { f.workspace.handoffs.incoming = () => true; },
    f => { f.workspace.summaryJobs.set(f.agent.id, {}); },
    f => { f.workspace.returnJobs.set(f.agent.id, {}); },
    f => { f.agent.returnSummary = { delivered: true }; },
    f => { f.native.canAcceptDirectInput = false; },
  ]) {
    const f = fixture(); f.onRead = () => change(f);
    await assert.rejects(f.workspace.send(f.agent.id, 'A queued report.', { report: true }), error => error.code === 'native_input_not_sent');
    assert.equal(f.steerCount, 1);
  }
});

test('a newer live turn during recovery is preserved without retrying an ambiguous snapshot', async () => {
  const f = fixture(); f.onPage = () => f.started(laterTurn);
  await assert.rejects(f.workspace.send(f.agent.id, 'Keep this unsent.'), error => error.code === 'native_input_not_sent');
  assert.equal(f.agent.turnId, laterTurn); assert.equal(f.steerCount, 1);
});

test('a fresh native approval blocks the input and uses existing guarded request recovery', async () => {
  const f = fixture(); f.replay = true; f.native.status.activeFlags = ['waitingOnApproval'];
  await assert.rejects(f.workspace.send(f.agent.id, 'Do not send past the native approval.'), error => error.code === 'native_input_not_sent' && /Open questions/.test(error.message));
  for (let i = 0; i < 10 && !f.agent.questions.length; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.agent.turnId, currentTurn); assert.equal(f.steerCount, 1);
  assert.equal(f.agent.questions[0]?.id, 17); assert.equal(f.calls.filter(call => call.method === 'thread/resume').length, 1);
  const paused = fixture(); paused.native.status.activeFlags = ['waitingOnApproval']; paused.workspace.coordinator = { paused: true };
  await assert.rejects(paused.workspace.send(paused.agent.id, 'Respect paused recovery.'), /Open questions/);
  assert.equal(paused.calls.some(call => call.method === 'thread/resume'), false);
  const pendingIdentity = fixture(); pendingIdentity.latest.status = 'completed'; pendingIdentity.native.status.activeFlags = ['waitingOnApproval']; pendingIdentity.workspace.coordinator = { paused: true };
  await assert.rejects(pendingIdentity.workspace.send(pendingIdentity.agent.id, 'Keep blocked while the active identity is unavailable.'), /Open questions/);
  assert.equal(pendingIdentity.agent.turnId, null); assert.equal(pendingIdentity.steerCount, 1);
});

test('an exact rejected async answer stays read-only, definitely not sent and never retargeted', async () => {
  const f = fixture(), message = question(f);
  await assert.rejects(f.workspace.answerMessageQuestion(f.agent.id, { messageId: message.id, questionIndex: 0, answer: 'Existing' }), error => error.code === 'async_question_not_current' && /answer was not sent/.test(error.message));
  assert.equal(f.steerCount, 1); assert.equal(f.agent.turnId, currentTurn);
  assert.equal(asyncQuestionView(f.agent, message, message.nativeQuestions[0]).answerState, 'read-only');
  assert.match(asyncQuestionView(f.agent, message, message.nativeQuestions[0]).answerNotice, /original native turn changed/);
  const unavailable = fixture(), oldQuestion = question(unavailable); unavailable.onPage = () => { throw new Error('Read unavailable'); };
  await assert.rejects(unavailable.workspace.answerMessageQuestion(unavailable.agent.id, { messageId: oldQuestion.id, questionIndex: 0, answer: 'Existing' }), /answer was not sent/);
  question(unavailable);
  assert.equal(asyncQuestionView(unavailable.agent, oldQuestion, oldQuestion.nativeQuestions[0]).answerState, 'read-only', 'a later completed item cannot reactivate the rejected question');
});

test('a late older completion preserves newer active state and question while accounting its own reply', () => {
  const f = fixture(), completed = [];
  f.started(currentTurn); const message = question(f, currentTurn);
  const finished = f.agent.finishedTurn; f.agent.activity = { text: 'Current activity', state: 'running' };
  f.agent.messages.unshift({ id: 'old-reply', turnId: oldTurn, type: 'assistant', text: 'Historical reply' });
  f.workspace.coordinator = { completed: (_id, turn) => completed.push(turn) };
  f.completed(oldTurn);
  assert.equal(f.agent.turnId, currentTurn); assert.equal(f.agent.thread.status.type, 'active'); assert.equal(f.agent.finishedTurn, finished);
  assert.equal(asyncQuestionView(f.agent, message, message.nativeQuestions[0]).answerState, 'available');
  assert.equal(f.agent.messages[0].branchable, true); assert.deepEqual(completed, [oldTurn]);
  f.completed(oldTurn, 'failed', { message: 'An older failure' });
  assert.equal(f.agent.activity.text, 'Current activity'); assert.equal(f.agent.lastCompletedTurnId, undefined);
});

test('a late old completion cannot replace the newer terminal outcome after its active ID clears', () => {
  const f = fixture(); f.started(oldTurn); f.started(currentTurn); f.completed(currentTurn, 'interrupted');
  const finished = f.agent.finishedTurn; f.completed(oldTurn);
  assert.equal(f.agent.turnId, null); assert.equal(f.agent.finishedTurn, finished); assert.equal(finished.id, currentTurn); assert.equal(finished.status, 'interrupted');
});

test('bounded lifecycle evidence never lets unknown success clear a stopped outcome, but unseen failure still stops work', () => {
  const f = fixture(); f.started(oldTurn);
  for (let i = 0; i < 40; i++) f.started(`00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`);
  const latest = f.agent.turnId; f.completed(latest, 'interrupted');
  const stopped = f.agent.finishedTurn;
  f.completed(oldTurn);
  assert.equal(f.agent.finishedTurn, stopped, 'an old identity beyond the bounded cache is not success evidence');
  f.completed('44444444-4444-4444-8444-444444444444');
  assert.equal(f.agent.finishedTurn, stopped, 'unknown success does not clear the known stop');
  f.completed(laterTurn, 'failed', { message: 'A newly observed failure' });
  assert.equal(f.agent.finishedTurn.id, laterTurn); assert.equal(f.agent.finishedTurn.status, 'failed');
});

test('delayed start acknowledgement preserves newer observed turns and native waiting flags', async () => {
  for (const transition of [
    f => { f.started(oldTurn); f.started(currentTurn); },
    f => { f.started(oldTurn); f.started(currentTurn); f.completed(currentTurn); },
    f => f.workspace.notification({ method: 'thread/status/changed', params: { threadId: f.agent.id, status: { type: 'active', activeFlags: ['waitingOnApproval'] } } }),
  ]) {
    const f = fixture(); f.agent.turnId = null; f.agent.thread.status = { type: 'idle' }; f.start = deferred(); f.startEntered = deferred();
    const sending = f.workspace.send(f.agent.id, 'A single new input.');
    await Promise.race([f.startEntered.promise, sending]);
    assert.equal(f.calls.some(call => call.method === 'turn/start'), true);
    transition(f); const before = { turnId: f.agent.turnId, status: f.agent.thread.status, finishedTurn: f.agent.finishedTurn };
    f.start.resolve({ turn: { id: oldTurn } });
    assert.deepEqual(await sending, { turnId: oldTurn });
    assert.equal(f.agent.turnId, before.turnId); assert.equal(f.agent.thread.status, before.status); assert.equal(f.agent.finishedTurn, before.finishedTurn);
  }
});
