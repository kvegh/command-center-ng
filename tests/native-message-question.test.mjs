import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';
import { Coordinator } from '../server/coordinator.mjs';
import { nativeMessageQuestions } from '../server/native-requests.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

function fixture() {
  const rpc = new EventEmitter(); rpc.ready = true;
  rpc.call = async () => { throw new Error('No native mutation expected'); };
  const workspace = new Workspace(rpc, { beads: null });
  const agent = { id: 'worker', name: 'Example', role: 'worker', cwd: '/example', canSend: true, messages: [], questions: [], tasks: [], workers: [], turnId: 'turn', thread: { id: 'worker', status: { type: 'active' } } };
  workspace.agents.set(agent.id, agent); workspace.watched.add(agent.id);
  const coordinator = new Coordinator(workspace); coordinator.paused = true; coordinator.instructions = async () => [];
  const item = (extra = {}) => ({ id: 'message', type: 'agentMessage', text: '', questions: [{ title: 'Which target?', options: ['Existing', 'New'] }], ...extra });
  return { workspace, agent, coordinator, rpc, item };
}

test('empty live assistant questions retain exact indexes without becoming server requests', async () => {
  const f = fixture();
  f.workspace.notification({ method: 'item/completed', params: { threadId: 'worker', turnId: 'turn', item: f.item() } });
  const message = f.workspace.snapshot().agents[0].messages[0];
  assert.equal(message.id, 'message'); assert.equal(message.turnId, 'turn');
  assert.equal(message.type, 'assistant'); assert.equal(message.nativeType, 'agentMessage'); assert.equal(message.text, '');
  assert.deepEqual(message.nativeQuestions, [{ title: 'Which target?', options: ['Existing', 'New'], questionIndex: 0, answerState: 'available' }]);
  assert.deepEqual(f.agent.questions, []); assert.equal(f.workspace.pending.size, 0);
  assert.throws(() => f.workspace.answer('worker', 'message', {}), /already been resolved/i);
  const read = await f.coordinator.readWorker(f.agent);
  assert.deepEqual(read.messages[0].nativeQuestions, f.agent.messages[0].nativeQuestions);
  assert.equal(read.messages[0].text, ''); assert.equal(read.messages[0].role, 'assistant'); assert.deepEqual(read.questions, []);
});

test('question metadata never replaces native text or leaks unsupported fields', () => {
  const f = fixture(); f.workspace.addItem(f.agent, f.item({ text: 'Original answer.', questions: [{ title: 'Choose', options: null, id: 'not-a-request', secretField: 'omit' }] }), 'turn');
  assert.equal(f.agent.messages[0].text, 'Original answer.');
  assert.deepEqual(f.agent.messages[0].nativeQuestions, [{ title: 'Choose', options: null, questionIndex: 0 }]);
  assert.equal(Object.hasOwn(f.agent.messages[0].nativeQuestions[0], 'id'), false);
});

test('None, omitted, empty and malformed metadata do not invent assistant text', () => {
  const f = fixture();
  for (const questions of [null, undefined, [], {}, [null, {}, { title: 3 }, { title: '  ' }]]) {
    assert.doesNotThrow(() => f.workspace.addItem(f.agent, f.item({ questions }), 'turn'));
    assert.equal(f.agent.messages.length, 0);
    assert.deepEqual(nativeMessageQuestions(f.item({ questions })), {});
  }
  f.workspace.addItem(f.agent, f.item({ text: 'Ordinary answer.', questions: null }), 'turn');
  assert.equal(f.agent.messages[0].text, 'Ordinary answer.'); assert.equal(Object.hasOwn(f.agent.messages[0], 'nativeQuestions'), false);
  assert.deepEqual(nativeMessageQuestions({ type: 'userMessage', questions: [{ title: 'Not assistant metadata' }] }), {});
});

test('metadata is bounded and partial malformed data carries an explicit truncation marker', () => {
  const count = nativeMessageQuestions({ type: 'agentMessage', questions: Array.from({ length: 40 }, () => ({ title: 'Question', options: null })) });
  assert.equal(count.nativeQuestions.length, 32); assert.equal(count.nativeQuestionsTruncated, true);
  const questions = Array.from({ length: 40 }, () => ({ title: 'q'.repeat(1200), options: Array.from({ length: 20 }, () => 'o'.repeat(500)) }));
  const result = nativeMessageQuestions({ type: 'agentMessage', questions });
  assert.equal(result.nativeQuestionsTruncated, true); assert.ok(result.nativeQuestions.length <= 32);
  let size = 0;
  for (const question of result.nativeQuestions) {
    assert.ok(question.title.length <= 1000); size += question.title.length;
    assert.ok(question.options.length <= 16);
    for (const option of question.options) { assert.ok(option.length <= 300); size += option.length; }
  }
  assert.ok(size <= 8000);
  const partial = nativeMessageQuestions({ type: 'agentMessage', questions: [null, { title: 'Valid', options: ['One', null, 2, 'Two'] }, { title: 'No options', options: {} }] });
  assert.deepEqual(partial, { nativeQuestions: [{ title: 'Valid', options: ['One', 'Two'], questionIndex: 1 }, { title: 'No options', options: null, questionIndex: 2 }], nativeQuestionsTruncated: true });
});

test('matching native completion can retain metadata omitted by the update and explicit None clears it', async () => {
  const f = fixture(); f.workspace.addItem(f.agent, f.item(), 'turn');
  f.workspace.addItem(f.agent, { id: 'message', type: 'agentMessage', text: '' }, 'turn');
  assert.equal(f.agent.messages[0].nativeQuestions.length, 1);
  f.rpc.call = async () => ({ data: [{ id: 'turn', status: 'completed', items: [{ id: 'message', type: 'agentMessage', text: '' }] }], nextCursor: null });
  await f.workspace.history('worker');
  assert.equal(f.agent.messages[0].nativeQuestions.length, 1);
  f.workspace.addItem(f.agent, f.item({ questions: null }), 'turn');
  assert.equal(f.agent.messages.length, 0);
  f.workspace.addItem(f.agent, f.item({ id: 'other-message', questions: undefined }), 'turn');
  assert.equal(f.agent.messages.length, 0, 'other native IDs cannot inherit question metadata');
});

test('Coordinator older full native pages retain display-only questions and no pending request', async () => {
  const f = fixture(), methods = [];
  f.rpc.call = async (method, params) => { methods.push(method); assert.equal(params.itemsView, 'full'); return { data: [{ id: 'older-turn', items: [f.item({ id: 'older-message' })] }], nextCursor: 'older' }; };
  const read = await f.coordinator.readWorker(f.agent, 'cursor');
  assert.deepEqual(methods, ['thread/turns/list']); assert.equal(read.messages[0].id, 'older-message');
  assert.equal(read.messages[0].text, ''); assert.equal(read.messages[0].role, 'assistant');
  assert.deepEqual(read.messages[0].nativeQuestions, [{ ...f.item().questions[0], questionIndex: 0 }]); assert.deepEqual(read.questions, []);
});

test('report-looking question titles cannot settle a pending Standard Task Report', () => {
  const f = fixture(); f.workspace.coordinator = f.coordinator;
  const response = { confirmed: true, turnId: 'turn', previousIds: new Set(), candidates: new Map() };
  f.coordinator.reportPending.add('worker'); f.coordinator.reportResponses.set('worker', response);
  const title = '| Task | Status | Outcome / next step |\n| --- | --- | --- |\n| Verify application | 🟨 In progress | Finish the existing checks. |\n\nRelease: unknown; publication: unknown; deployment: unverified.';
  f.workspace.addItem(f.agent, f.item({ questions: [{ title, options: null }] }), 'turn', false, { live: true, completed: true });
  assert.equal(f.agent.messages[0].text, ''); assert.equal(f.coordinator.reportPending.has('worker'), true);
  assert.equal(f.coordinator.reportResponses.get('worker'), response); assert.equal(response.candidate, undefined);
  f.workspace.addItem(f.agent, f.item({ text: title }), 'turn', false, { live: true, completed: true });
  assert.equal(f.agent.messages[0].text, title); assert.equal(f.coordinator.reportPending.has('worker'), false, 'actual report text can settle the report while its question remains visible');
  assert.deepEqual(f.agent.messages[0].nativeQuestions, [{ ...f.item().questions[0], questionIndex: 0 }]); assert.deepEqual(f.agent.questions, []);
});

function replyFixture() {
  const f = fixture(), calls = [];
  f.workspace.activate = async () => f.agent;
  f.workspace.instructionContext = async () => ({});
  f.rpc.call = async (method, params) => { calls.push({ method, params }); assert.equal(method, 'turn/steer'); return { turnId: params.expectedTurnId }; };
  const complete = (extra = {}) => f.workspace.notification({ method: 'item/completed', params: { threadId: 'worker', turnId: 'turn', item: f.item(extra) } });
  const states = () => f.workspace.snapshot().agents[0].messages.filter(message => message.nativeQuestions).flatMap(message => message.nativeQuestions.map(question => question.answerState));
  return { ...f, calls, complete, states };
}
const questionId = (index, messageId = 'message') => JSON.stringify(['request_user_input_async', messageId, index]);
const envelope = value => '<send_user_message_question_reply>\n' + JSON.stringify(value) + '\n</send_user_message_question_reply>';
const answered = index => ({ questionItemId: questionId(index), question: 'Which target?', answer: 'Existing' });
function nativeUser(f, text, id = 'user-reply') { f.workspace.addItem(f.agent, { id, type: 'userMessage', content: [{ type: 'text', text }] }, 'turn', false, { live: true, completed: true }); }

test('shared native request projection executes without Node globals in its browser consumer', async () => {
  const source = (await readFile(new URL('../server/native-requests.mjs', import.meta.url), 'utf8')).replace(/\bexport (?=const |function )/g, '');
  const context = vm.createContext({});
  vm.runInContext(source + '\nglobalThis.result = nativeMessageQuestions({type:"agentMessage", id:"example", questions:[{title:"Choose",options:null}]});', context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.result)), { nativeQuestions: [{ title: 'Choose', options: null, questionIndex: 0 }] });
});

test('exact native reply uses original identity and UTF8 title boundary while preserving the answer', async () => {
  const f = replyFixture();
  const title = 'Line\r\n' + 'ü'.repeat(300);
  f.complete({ phase: 'final_answer', questions: [{ title, options: null }, { title: 'Another question', options: null }] });
  assert.deepEqual(f.states(), ['available', 'available'], 'a final-answer message is not a terminal turn');
  const answer = '  Keep these spaces\nand this line.  ';
  assert.deepEqual(await f.workspace.answerMessageQuestion('worker', { messageId: 'message', questionIndex: 0, answer }), { accepted: true, turnId: 'turn' });
  assert.equal(f.calls.length, 1);
  const request = f.calls[0]; assert.equal(request.params.threadId, 'worker'); assert.equal(request.params.expectedTurnId, 'turn');
  const text = request.params.input[0].text;
  assert.ok(text.startsWith('<send_user_message_question_reply>\n')); assert.ok(text.endsWith('\n</send_user_message_question_reply>'));
  const [reply] = JSON.parse(text.split('\n').slice(1, -1).join('\n'));
  assert.equal(reply.questionItemId, questionId(0)); assert.equal(reply.answer, answer);
  assert.equal(reply.question, 'Line  ' + 'ü'.repeat(253)); assert.equal(Buffer.byteLength(reply.question), 512);
  assert.deepEqual(f.states(), ['submitted', 'available']);
  assert.equal(f.workspace.pending.size, 0); assert.deepEqual(f.agent.questions, []);
  await assert.rejects(f.workspace.answerMessageQuestion('worker', { messageId: 'message', questionIndex: 0, answer: 'Duplicate' }), error => error.code === 'async_question_not_current');
  assert.equal(f.calls.length, 1);
});

test('original indexes survive filtering while incomplete, historical and overlong bindings stay read-only', async () => {
  for (const extra of [
    { questions: [null, { title: 'Valid second question', options: null }] },
    { id: 'x'.repeat(513) },
    { questions: [{ title: 'q'.repeat(1001), options: null }] }
  ]) {
    const f = replyFixture(); f.complete(extra);
    const question = f.workspace.snapshot().agents[0].messages[0].nativeQuestions[0];
    assert.equal(question.answerState, 'read-only');
    if (extra.questions?.[0] === null) assert.equal(question.questionIndex, 1);
    await assert.rejects(f.workspace.answerMessageQuestion('worker', { messageId: extra.id || 'message', questionIndex: question.questionIndex, answer: 'No blind binding' }));
    assert.equal(f.calls.length, 0);
  }
  const f = replyFixture();
  f.workspace.addItem(f.agent, f.item(), 'turn'); assert.deepEqual(f.states(), ['read-only']);
  f.complete(); assert.deepEqual(f.states(), ['read-only'], 'history replay cannot reactivate a seen identity');
  const g = replyFixture();
  g.workspace.notification({ method: 'item/started', params: { threadId: 'worker', turnId: 'turn', item: g.item() } });
  assert.deepEqual(g.states(), ['read-only']); g.complete(); assert.deepEqual(g.states(), ['available']);
});

test('canonical array, singleton and IDE-prefixed replies dismiss only exact matching questions', () => {
  for (const text of [envelope([answered(0)]), envelope(answered(0)), '# Context from my IDE setup:\nfile.ts\n## My request for Codex:\n' + envelope(answered(0))]) {
    const f = replyFixture(); f.complete({ questions: [{ title: 'First', options: null }, { title: 'Second', options: null }] });
    nativeUser(f, text); assert.deepEqual(f.states(), ['submitted', 'available']);
    f.complete({ questions: [{ title: 'First', options: null }, { title: 'Second', options: null }] });
    assert.deepEqual(f.states(), ['submitted', 'available'], 'duplicate live metadata cannot reopen the first question');
  }
  const f = replyFixture();
  nativeUser(f, envelope(answered(0)));
  f.complete({ questions: [{ title: 'First', options: null }, { title: 'Second', options: null }] });
  assert.deepEqual(f.states(), ['submitted', 'available'], 'a reply observed before its question remains authoritative only for that ID');
  nativeUser(f, envelope({ ...answered(0), questionItemId: questionId(99) }), 'unknown');
  assert.deepEqual(f.states(), ['submitted', 'available']);
});

test('ordinary followup and true terminal completion retire editors without deleting metadata or reopening IDs', () => {
  for (const end of ['ordinary', 'completed', 'interrupted', 'failed']) {
    const f = replyFixture(); f.complete();
    if (end === 'ordinary') nativeUser(f, 'Continue with the existing task.');
    else f.workspace.notification({ method: 'turn/completed', params: { threadId: 'worker', turn: { id: 'turn', status: end } } });
    assert.deepEqual(f.states(), ['read-only']); assert.equal(f.agent.messages[0].nativeQuestions[0].title, 'Which target?');
    f.agent.turnId = 'turn'; f.agent.thread.status = { type: 'active' }; f.complete(); assert.deepEqual(f.states(), ['read-only']);
  }
  const f = replyFixture(); f.complete();
  f.workspace.addItem(f.agent, f.item({ questions: null }), 'turn', false, { live: true, completed: true });
  assert.equal(f.agent.messages.length, 0);
  f.complete(); assert.deepEqual(f.states(), ['read-only'], 'explicit metadata removal cannot make a duplicate ID new again');
  for (const text of ['> ' + envelope(answered(0)), envelope(answered(0)) + '\nextra text']) {
    const g = replyFixture(); g.complete(); nativeUser(g, text); assert.deepEqual(g.states(), ['read-only'], 'ordinary text is not treated as a canonical answered identity');
  }
});

test('native reply observation requires original single-text input shape and preserves answered IDs beyond message pruning', () => {
  for (const extra of [[{ type: 'image', imageUrl: 'synthetic' }], [{ type: 'text', text: 'second text' }], [{ type: 'other', value: 'unsupported' }]]) {
    const f = replyFixture(); f.complete({ questions: [{ title: 'First', options: null }, { title: 'Second', options: null }] });
    f.workspace.addItem(f.agent, { id: 'shaped-reply', type: 'userMessage', content: [{ type: 'text', text: envelope(answered(0)) }, ...extra] }, 'turn', false, { live: true, completed: true });
    assert.deepEqual(f.states(), ['read-only', 'read-only'], 'mixed content is an ordinary followup, not a partial reply');
    assert.equal(f.agent.messages.find(message => message.type === 'user').nativeQuestionReplies, undefined);
  }
  const f = replyFixture();
  f.workspace.addItem(f.agent, { id: 'shaped-reply', type: 'userMessage', content: [{ type: 'skill', name: 'example' }, { type: 'text', text: envelope(answered(0)) }, { type: 'mention', name: 'example' }] }, 'turn', false, { live: true, completed: true });
  assert.deepEqual(f.agent.messages[0].nativeQuestionReplies, [{ question: 'Which target?', answer: 'Existing' }]);
  // The native identity remains consumed even after its user message leaves
  // CCNG's bounded display cache; no history scan or answer replay is needed.
  f.agent.messages = [];
  f.complete({ questions: [{ title: 'First', options: null }, { title: 'Second', options: null }] });
  assert.deepEqual(f.states(), ['submitted', 'available']);
});

test('changed full source title or options cannot retain a stale question binding', async () => {
  for (const changed of [{ title: 'a'.repeat(512) + 'different tail', options: ['One'] }, { title: 'a'.repeat(512) + 'original tail', options: ['Changed'] }]) {
    const f = replyFixture(); f.complete({ questions: [{ title: 'a'.repeat(512) + 'original tail', options: ['One'] }] });
    assert.deepEqual(f.states(), ['available']);
    f.complete({ questions: [changed] }); assert.deepEqual(f.states(), ['read-only']);
    await assert.rejects(f.workspace.answerMessageQuestion('worker', { messageId: 'message', questionIndex: 0, answer: 'Stale draft' }));
    assert.equal(f.calls.length, 0);
  }
});

test('final reply preflight rejects changes while native context is loading without a send', async () => {
  for (const change of [
    f => { f.agent.canSend = false; },
    f => { f.agent.questions.push({ id: 'approval' }); },
    f => { f.agent.thread.status = { type: 'idle' }; f.agent.turnId = null; },
    f => { f.agent.turnId = 'different-turn'; },
    f => { f.agent.handoff = { phase: 'transferring' }; f.workspace.returnJobs.set('worker', {}); },
    f => { f.workspace.summaryJobs.set('worker', {}); },
    f => { f.workspace.agents.delete('worker'); },
    f => { f.complete({ questions: [{ title: 'Changed question', options: null }] }); }
  ]) {
    const f = replyFixture(); f.complete(); let release, entered;
    const wait = new Promise(resolve => { entered = resolve; });
    f.workspace.instructionContext = async () => { entered(); await new Promise(resolve => { release = resolve; }); return {}; };
    const pending = f.workspace.answerMessageQuestion('worker', { messageId: 'message', questionIndex: 0, answer: 'Existing' });
    await wait; change(f); release();
    await assert.rejects(pending, error => error.code === 'async_question_not_current');
    assert.equal(f.calls.length, 0);
  }
});

test('overlapping and unconfirmed replies are not blindly resubmitted', async () => {
  const f = replyFixture(); f.complete(); let reject, started;
  const called = new Promise(resolve => { started = resolve; });
  f.rpc.call = async (method, params) => { f.calls.push({ method, params }); started(); await new Promise((resolve, fail) => { reject = fail; }); };
  const data = { messageId: 'message', questionIndex: 0, answer: 'Existing' };
  const first = f.workspace.answerMessageQuestion('worker', data);
  await called; assert.deepEqual(f.states(), ['submitting']);
  await assert.rejects(f.workspace.answerMessageQuestion('worker', data));
  reject(new Error('Synthetic native timeout'));
  await assert.rejects(first, error => error.code === 'async_question_delivery_unconfirmed');
  assert.deepEqual(f.states(), ['unconfirmed']);
  await assert.rejects(f.workspace.answerMessageQuestion('worker', data)); assert.equal(f.calls.length, 1);
});

test('only exact question replies remain possible during waiting or stopping own handoff', async () => {
  for (const phase of ['waiting', 'stopping', 'failed']) {
    const f = replyFixture(); f.complete(); f.agent.handoff = { phase };
    if (phase !== 'failed') f.workspace.returnJobs.set('worker', {});
    assert.deepEqual(f.states(), ['available']);
    if (phase !== 'failed') await assert.rejects(f.workspace.send('worker', 'Ordinary input stays locked.'), /handoff/);
    await f.workspace.answerMessageQuestion('worker', { messageId: 'message', questionIndex: 0, answer: 'Exact answer' });
    assert.equal(f.calls.length, 1);
  }
  for (const phase of ['transferring', 'summarizing', 'sending', 'archiving', 'failed']) {
    const f = replyFixture(); f.complete(); f.agent.handoff = { phase }; f.workspace.returnJobs.set('worker', {});
    assert.deepEqual(f.states(), ['read-only']);
    await assert.rejects(f.workspace.answerMessageQuestion('worker', { messageId: 'message', questionIndex: 0, answer: 'Not allowed now' })); assert.equal(f.calls.length, 0);
  }
});

test('a summary that emits a live question releases its preparation lock without answering or cancelling', async () => {
  const f = replyFixture(); f.agent.parentId = 'parent'; f.agent.thread.status = { type: 'idle' }; f.agent.turnId = null;
  f.agent.lastCompletedTurnId = null;
  f.workspace.summaryTimeout = 100;
  f.rpc.call = async (method, params) => {
    f.calls.push({ method, params }); assert.equal(method, 'turn/start');
    setImmediate(() => f.workspace.notification({ method: 'item/completed', params: { threadId: 'worker', turnId: 'summary-turn', item: f.item() } }));
    return { turn: { id: 'summary-turn' } };
  };
  await assert.rejects(f.workspace.summarize('worker'), /Resolve the branch question/);
  assert.equal(f.workspace.summaryJobs.has('worker'), false);
  assert.deepEqual(f.states(), ['available']); assert.equal(f.calls.length, 1);
});

test('native reply display annotation is bounded while raw history and copy source stay exact', () => {
  const f = replyFixture(), raw = envelope({ ...answered(0), answer: 'x'.repeat(5000) });
  nativeUser(f, raw);
  const message = f.workspace.snapshot().agents[0].messages[0];
  assert.equal(message.text, raw); assert.equal(message.nativeType, 'userMessage');
  assert.deepEqual(message.nativeQuestionReplies, [{ question: 'Which target?', answer: 'x'.repeat(4000) }]);
  assert.equal(message.nativeQuestionRepliesTruncated, true);
  const g = replyFixture(); nativeUser(g, '> ' + raw);
  assert.equal(g.agent.messages[0].nativeQuestionReplies, undefined);
});
