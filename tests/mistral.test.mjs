import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { MistralSessions, MISTRAL_APPROVAL, MISTRAL_QUESTION, MISTRAL_UNSUPPORTED, isMistralId, findMistralExecutable } from '../server/mistral.mjs';

const capabilities = { sessionCapabilities: { list: {} }, promptCapabilities: { image: true, embeddedContext: true } };
const configOptions = [{ id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'model-a', options: [{ value: 'model-a', name: 'Model A' }, { value: 'model-b', name: 'Model B' }] }];
class SyntheticRpc extends EventEmitter {
  constructor() { super(); this.calls = []; this.responses = []; this.prompts = new Map(); this.nextSession = 0; this.started = 0; this.closed = false; }
  async start() { this.started++; }
  call(method, params = {}) {
    this.calls.push({ method, params });
    if (method === 'initialize') return Promise.resolve({ protocolVersion: 1, agentCapabilities: structuredClone(capabilities) });
    if (method === 'session/new') return Promise.resolve({ sessionId: 'opaque_' + (++this.nextSession), configOptions: structuredClone(configOptions) });
    if (method === 'session/list') return Promise.resolve({ sessions: [{ sessionId: 'saved-opaque', cwd: '/synthetic/project', title: 'Saved conversation' }] });
    if (method === 'session/prompt') return new Promise((resolve, reject) => this.prompts.set(params.sessionId, { resolve, reject }));
    if (method === 'session/set_config_option') return Promise.resolve({ configOptions: [{ ...structuredClone(configOptions[0]), currentValue: params.value }] });
    throw new Error('Unexpected synthetic ACP call: ' + method);
  }
  async notify(method, params) { this.calls.push({ method, params }); }
  async respond(id, result) { this.responses.push({ id, result }); if (this.responseWait) await this.responseWait; }
  async close() { this.closed = true; this.emit('disconnected', new Error('Synthetic connection ended.')); for (const prompt of this.prompts.values()) prompt.reject(new Error('Synthetic connection ended.')); }
  update(agent, update) { this.emit('notification', { method: 'session/update', params: { sessionId: agent.nativeSessionId, update } }); }
  request(agent, id, method, params) { this.emit('request', { jsonrpc: '2.0', id, method, params: { sessionId: agent.nativeSessionId, ...params } }); }
  complete(agent, stopReason = 'end_turn') { this.prompts.get(agent.nativeSessionId).resolve({ stopReason }); }
}
async function fixture(t, options = {}) {
  const rpc = new SyntheticRpc(), runtime = new MistralSessions({ executable: async () => '/synthetic/vibe-acp', createTransport: () => rpc, ...options });
  t.after(() => runtime.shutdown()); await runtime.initialize(); return { rpc, runtime };
}
const permission = { toolCall: { toolCallId: 'tool-1' }, options: [{ optionId: 'once', name: 'Allow once', kind: 'allow_once' }, { optionId: 'session', name: 'Allow for session', kind: 'allow_always' }, { optionId: 'deny', name: 'Reject', kind: 'reject_once' }] };
const schema = { type: 'object', properties: { q0: { type: 'string', title: 'Decision', oneOf: [{ const: 'Approved', title: 'Approved' }, { const: 'Rejected', title: 'Rejected' }] } }, required: ['q0'] };
function answerFor(question, answer) { return { requestId: question.id, reviewToken: question.reviewToken, ...answer }; }

test('Mistral discovery is lazy and native IDs are bounded opaque values', async t => {
  const { rpc, runtime } = await fixture(t); assert.equal(runtime.available, true); assert.equal(rpc.started, 0);
  assert.equal(isMistralId('mistral-opaque_native-42'), true); assert.equal(isMistralId('mistral-' + 'a'.repeat(121)), false); assert.equal(isMistralId('mistral-../file'), false);
  await assert.rejects(findMistralExecutable({ path: 'relative:.' }), /official Mistral Vibe/);
  const absent = new MistralSessions({ executable: async () => { throw new Error('not installed'); } });
  assert.equal(await absent.initialize(), false); assert.match(absent.error, /not installed/); assert.throws(() => absent.ready(), /unavailable/);
});

test('Mistral metadata restore never loads history, starts a prompt or claims external ownership', async t => {
  const { rpc, runtime } = await fixture(t); const listing = await runtime.list(); assert.equal(listing.agents[0].status, 'offline');
  const agent = await runtime.open('mistral-saved-opaque'); await runtime.refresh(agent);
  assert.equal(agent.canSend, false); assert.equal(agent.observingOnly, true); assert.equal(agent.canBranch, false); assert.equal(agent.messages.length, 0); assert.match(agent.managementNotice, /metadata only/);
  await assert.rejects(runtime.send(agent, 'must not run'), /not controlled/); await assert.rejects(runtime.interrupt(agent), /not controlled/);
  assert.deepEqual(rpc.calls.map(call => call.method), ['initialize', 'session/list']);
  const initialize = rpc.calls[0].params; assert.equal(initialize.clientCapabilities.terminal, false); assert.equal(initialize.clientCapabilities.fs.readTextFile, false); assert.deepEqual(initialize.clientCapabilities.elicitation, { form: {} });
});

test('Mistral streams complete text and records native completion, without transcript trimming', async t => {
  const { rpc, runtime } = await fixture(t), agent = await runtime.create('/synthetic/project', 'Build a demo'); const completions = [], assistant = [];
  runtime.on('completed', id => completions.push(id)); runtime.on('assistantMessageCompleted', (id, message) => assistant.push([id, message]));
  const sent = await runtime.send(agent, 'Hello', { instructions: 'Shared project rules' });
  assert.equal(agent.messages[0].nativeMessageId, sent.messageId); assert.equal(agent.messages[0].inputState, 'queued');
  assert.equal(agent.turnId, sent.turnId); assert.equal(agent.thread.status.type, 'active'); assert.equal(completions.length, 0);
  const prompt = rpc.calls.at(-1).params.prompt; assert.equal(prompt[0].resource.text, 'Shared project rules'); assert.equal(prompt.at(-1).text, 'Hello');
  const content = 'x'.repeat(40_000); rpc.update(agent, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: content } }); rpc.update(agent, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: ' done' } });
  for (let n = 0; n < 1001; n++) runtime.put(agent, { id: 'history-' + n, type: 'activity', text: 'kept', state: 'completed' });
  assert.equal(agent.messages.some(message => message.id === sent.messageId), true);
  rpc.complete(agent); await runtime.runs.get(agent.id).done;
  assert.deepEqual(agent.finishedTurn, { id: sent.turnId, status: 'completed' }); assert.equal(agent.lastCompletedTurnId, sent.turnId); assert.equal(agent.turnId, null);
  assert.equal(agent.messages[0].inputState, 'received'); assert.deepEqual(completions, [agent.id]); assert.equal(assistant[0][1].text, content + ' done'); assert.equal(assistant[0][1].state, 'completed');
});

test('Mistral exact permission bindings persist across unrelated events and acknowledge only native progress', async t => {
  const { rpc, runtime } = await fixture(t), agent = await runtime.create('/synthetic/project', 'Permission demo'); await runtime.send(agent, 'Inspect');
  rpc.update(agent, { sessionUpdate: 'tool_call', toolCallId: 'tool-1', title: 'Run command', rawInput: { command: 'pwd' }, kind: 'execute', status: 'pending' });
  rpc.request(agent, 71, 'session/request_permission', permission); const question = agent.questions[0]; assert.equal(question.method, MISTRAL_APPROVAL); assert.deepEqual(question.params.toolCallContext.rawInput, { command: 'pwd' });
  rpc.update(agent, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Waiting.' } }); assert.equal(agent.questions[0], question); assert.equal(rpc.responses.length, 0);
  await assert.rejects(runtime.answer(agent, 71, { optionId: 'once' }), /exact current/);
  await assert.rejects(runtime.answer(agent, 71, answerFor(question, { optionId: 'invented' })), /offered/);
  await assert.rejects(runtime.answer(agent, '71', answerFor(question, { optionId: 'once' })), /no longer answerable/);
  await assert.rejects(runtime.answer(agent, 71, { ...answerFor(question, { optionId: 'once' }), reviewToken: 'stale' }), /exact current/);
  let release; rpc.responseWait = new Promise(resolve => { release = resolve; }); const responding = runtime.answer(agent, 71, answerFor(question, { optionId: 'once' }));
  assert.equal(question.responding, true); assert.equal(question.submitted, undefined); assert.equal(agent.questions.length, 1);
  release(); assert.deepEqual(await responding, { submitted: true }); assert.equal(agent.questions.length, 1);
  assert.deepEqual(rpc.responses, [{ id: 71, result: { outcome: { outcome: 'selected', optionId: 'once' } } }]);
  rpc.update(agent, { sessionUpdate: 'tool_call_update', toolCallId: 'tool-1', status: 'completed' }); assert.equal(agent.questions.length, 0);
  await assert.rejects(runtime.answer(agent, 71, answerFor(question, { optionId: 'once' })), /no longer answerable/);
  rpc.complete(agent); await runtime.runs.get(agent.id).done;
});

test('Mistral form answers preserve exact schema and independent native callback identity', async t => {
  const { rpc, runtime } = await fixture(t), a = await runtime.create('/synthetic/a', 'A'), b = await runtime.create('/synthetic/b', 'B'); await runtime.send(a, 'Work'); await runtime.send(b, 'Work');
  rpc.request(a, 'form-id', 'elicitation/create', { mode: 'form', message: 'Approve proposal?', requestedSchema: schema }); const question = a.questions[0];
  assert.equal(question.method, MISTRAL_QUESTION); assert.deepEqual(question.params.requestedSchema, schema);
  await assert.rejects(runtime.answer(b, 'form-id', answerFor(question, { action: 'accept', content: { q0: 'Approved' } })), /no longer answerable/);
  await assert.rejects(runtime.answer(a, 'form-id', answerFor(question, { action: 'accept', content: {} })), /Answer Decision/);
  await runtime.answer(a, 'form-id', answerFor(question, { action: 'accept', content: { q0: 'Approved' } })); assert.deepEqual(rpc.responses[0], { id: 'form-id', result: { action: 'accept', content: { q0: 'Approved' } } });
  assert.equal(a.questions.length, 1); rpc.complete(a); await runtime.runs.get(a.id).done; assert.equal(a.questions.length, 0);
  rpc.complete(b); await runtime.runs.get(b.id).done;
});

test('unsupported native permissions stay visible unanswered and no filesystem/terminal action executes', async t => {
  const { rpc, runtime } = await fixture(t), agent = await runtime.create('/synthetic/project', 'Unsupported'); await runtime.send(agent, 'Work');
  rpc.request(agent, 'fs-1', 'fs/read_text_file', { path: '/synthetic/private' }); rpc.request(agent, 'url-1', 'elicitation/create', { mode: 'url', url: 'https://example.invalid/native-auth', message: 'Native login' });
  assert.equal(agent.questions[0].method, MISTRAL_UNSUPPORTED); assert.equal(agent.questions[0].unsupported, true); assert.equal(agent.questions[1].unsupported, true);
  await assert.rejects(runtime.answer(agent, 'fs-1', answerFor(agent.questions[0], { action: 'accept' })), /native client/); assert.equal(rpc.responses.length, 0);
  rpc.complete(agent); await runtime.runs.get(agent.id).done;
});

test('Mistral native cancellation waits for its terminal result, unknown outcomes never complete or retry', async t => {
  const { rpc, runtime } = await fixture(t), agent = await runtime.create('/synthetic/project', 'Cancel'); const completed = []; runtime.on('completed', id => completed.push(id));
  const sent = await runtime.send(agent, 'Work'); await runtime.interrupt(agent); assert.equal(agent.turnId, sent.turnId); assert.equal(completed.length, 0);
  assert.ok(agent.requestStopIntent); assert.deepEqual(rpc.calls.at(-1), { method: 'session/cancel', params: { sessionId: agent.nativeSessionId } });
  rpc.complete(agent, 'cancelled'); await runtime.runs.get(agent.id).done; assert.equal(agent.finishedTurn.status, 'interrupted');
  await runtime.send(agent, 'Second work'); const job = runtime.runs.get(agent.id); rpc.complete(agent, 'invented'); await job.done;
  assert.equal(agent.canSend, false); assert.equal(runtime.runs.get(agent.id), job); assert.equal(completed.length, 1); assert.match(agent.runError, /no native turn outcome/);
  await assert.rejects(runtime.send(agent, 'Do not retry'), /not controlled/); assert.equal(rpc.calls.filter(call => call.method === 'session/prompt').length, 2);
});

test('Mistral disconnection retains unanswered cards without response or execution replay', async t => {
  const { rpc, runtime } = await fixture(t), agent = await runtime.create('/synthetic/project', 'Disconnect'); await runtime.send(agent, 'Work'); const job = runtime.runs.get(agent.id);
  rpc.request(agent, 'approval', 'session/request_permission', permission); const question = agent.questions[0]; await rpc.close(); await job.done;
  assert.equal(agent.questions[0], question); assert.equal(question.unavailable, true); assert.equal(agent.canSend, false); assert.equal(agent.finishedTurn, undefined); assert.equal(rpc.responses.length, 0);
});

test('Mistral model choices come from native config and require explicit acknowledged idle changes', async t => {
  const { rpc, runtime } = await fixture(t), agent = await runtime.create('/synthetic/project', 'Models');
  assert.deepEqual((await runtime.modelSettings(agent)).models.map(model => model.model), ['model-a', 'model-b']);
  await assert.rejects(runtime.updateModel(agent, { model: 'unoffered', effort: null }), /offered/);
  await assert.rejects(runtime.updateModel(agent, { model: 'model-b', effort: 'high' }), /supported reasoning effort/);
  const result = await runtime.updateModel(agent, { model: 'model-b', effort: null }); assert.equal(result.model, 'model-b'); assert.equal(result.change.status, 'saved');
  assert.deepEqual(rpc.calls.at(-1), { method: 'session/set_config_option', params: { sessionId: agent.nativeSessionId, configId: 'model', value: 'model-b' } });
  await runtime.send(agent, 'Work'); await assert.rejects(runtime.updateModel(agent, { model: 'model-a', effort: null }), /idle/); rpc.complete(agent); await runtime.runs.get(agent.id).done;
});

// Official ACP Python SDK agent/connection.py::_create_elicitation_request
// flattens ElicitationFormSessionMode into mode="form" + sessionId + schema.
// The public v1 wire example matches this literal; no Python/model is executed.
test('official flattened ACP elicitation wire binds the native session and RPC ID', async t => {
  const { rpc, runtime } = await fixture(t), agent = await runtime.create('/synthetic/project', 'Wire fixture');
  await runtime.send(agent, 'Discuss the proposal');
  const nativeWire = {
    jsonrpc: '2.0', id: 43, method: 'elicitation/create',
    params: {
      sessionId: 'opaque_1', toolCallId: 'ask-question-1', mode: 'form', message: 'User input required',
      requestedSchema: { type: 'object', properties: { q0: { type: 'string', title: 'Approval', description: 'Approve this explained change?', oneOf: [{ const: 'Yes', title: 'Yes' }, { const: 'No', title: 'No' }] } }, required: ['q0'] },
    },
  };
  rpc.emit('request', structuredClone(nativeWire)); const question = agent.questions[0];
  assert.equal(question.id, 43); assert.equal(question.params.sessionId, agent.nativeSessionId); assert.equal(question.method, MISTRAL_QUESTION);
  for (const [key, value] of Object.entries(nativeWire.params)) assert.deepEqual(question.params[key], value);
  await runtime.answer(agent, 43, answerFor(question, { action: 'decline' }));
  assert.deepEqual(rpc.responses, [{ id: 43, result: { action: 'decline' } }]);
  rpc.complete(agent); await runtime.runs.get(agent.id).done;
});
