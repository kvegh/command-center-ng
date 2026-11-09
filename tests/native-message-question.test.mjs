import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';
import { Coordinator } from '../server/coordinator.mjs';
import { nativeMessageQuestions } from '../server/native-requests.mjs';

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

test('empty native assistant questions remain visible without becoming actionable requests', async () => {
  const f = fixture();
  f.workspace.notification({ method: 'item/completed', params: { threadId: 'worker', turnId: 'turn', item: f.item() } });
  const message = f.workspace.snapshot().agents[0].messages[0];
  assert.equal(message.id, 'message'); assert.equal(message.turnId, 'turn');
  assert.equal(message.type, 'assistant'); assert.equal(message.nativeType, 'agentMessage'); assert.equal(message.text, '');
  assert.deepEqual(message.nativeQuestions, [{ title: 'Which target?', options: ['Existing', 'New'] }]);
  assert.deepEqual(f.agent.questions, []); assert.equal(f.workspace.pending.size, 0);
  assert.throws(() => f.workspace.answer('worker', 'message', {}), /already been resolved/i);
  const read = await f.coordinator.readWorker(f.agent);
  assert.deepEqual(read.messages[0].nativeQuestions, message.nativeQuestions);
  assert.equal(read.messages[0].text, ''); assert.equal(read.messages[0].role, 'assistant'); assert.deepEqual(read.questions, []);
});

test('question metadata never replaces native text or leaks unsupported fields', () => {
  const f = fixture(); f.workspace.addItem(f.agent, f.item({ text: 'Original answer.', questions: [{ title: 'Choose', options: null, id: 'not-a-request', secretField: 'omit' }] }), 'turn');
  assert.equal(f.agent.messages[0].text, 'Original answer.');
  assert.deepEqual(f.agent.messages[0].nativeQuestions, [{ title: 'Choose', options: null }]);
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
  assert.deepEqual(partial, { nativeQuestions: [{ title: 'Valid', options: ['One', 'Two'] }, { title: 'No options', options: null }], nativeQuestionsTruncated: true });
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
  assert.deepEqual(read.messages[0].nativeQuestions, f.item().questions); assert.deepEqual(read.questions, []);
});

test('report-looking question titles cannot settle a pending Standard Task Report', () => {
  const f = fixture(); f.workspace.coordinator = f.coordinator;
  const response = { confirmed: true, turnId: 'turn', previousIds: new Set(), candidates: new Map() };
  f.coordinator.reportPending.add('worker'); f.coordinator.reportResponses.set('worker', response);
  const title = '🟩 Done: outcome.\n🟨 In progress: work.\n🟥 Blocked: none.\n🟦 Next: verify.';
  f.workspace.addItem(f.agent, f.item({ questions: [{ title, options: null }] }), 'turn', false, { live: true, completed: true });
  assert.equal(f.agent.messages[0].text, ''); assert.equal(f.coordinator.reportPending.has('worker'), true);
  assert.equal(f.coordinator.reportResponses.get('worker'), response); assert.equal(response.candidate, undefined);
  f.workspace.addItem(f.agent, f.item({ text: title }), 'turn', false, { live: true, completed: true });
  assert.equal(f.agent.messages[0].text, title); assert.equal(f.coordinator.reportPending.has('worker'), false, 'actual report text can settle the report while its question remains visible');
  assert.deepEqual(f.agent.messages[0].nativeQuestions, f.item().questions); assert.deepEqual(f.agent.questions, []);
});
