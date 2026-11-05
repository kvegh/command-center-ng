import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ClaudeSessions, addClaudeMessage, CLAUDE_APPROVAL, CLAUDE_QUESTION, CLAUDE_ELICITATION } from '../server/claude.mjs';
import { Workspace } from '../server/workspace.mjs';
import { WorkspacePersistence, workspaceRecord } from '../server/workspace-store.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const nativeId = '11111111-2222-4333-8444-555555555555';
const workerId = 'claude-' + nativeId;
const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWmQAAAAASUVORK5CYII=';
const imageUrl = 'data:image/png;base64,' + imageData;
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) { for (let n = 0; n < 30; n++) { if (check()) return; await tick(); } assert.ok(check(), 'Expected SDK event was not handled.'); }

class Events {
  values = []; waiting = null; ended = false;
  push(value) { if (this.waiting) { this.waiting({ value, done: false }); this.waiting = null; } else this.values.push(value); }
  next() { if (this.values.length) return Promise.resolve({ value: this.values.shift(), done: false }); if (this.ended) return Promise.resolve({ done: true }); return new Promise(resolve => { this.waiting = resolve; }); }
  close() { this.ended = true; this.waiting?.({ done: true }); this.waiting = null; }
  [Symbol.asyncIterator]() { return this; }
}

async function fixture({ active = [], history = [] } = {}) {
  const calls = [], queries = [], controls = [];
  const info = { sessionId: nativeId, cwd: '/example/project', summary: 'Review local project', firstPrompt: 'Review local project' };
  const sdk = {
    listSessions: async options => { calls.push(['listSessions', options]); return [info]; },
    getSessionInfo: async id => { calls.push(['getSessionInfo', id]); return id === nativeId ? info : undefined; },
    getSessionMessages: async (id, options) => { calls.push(['getSessionMessages', id, options]); return history; },
    query(params) {
      const query = new Events(); query.params = params; queries.push(query);
      query.interrupt = async () => { controls.push(['interrupt']); };
      query.supportedModels = async () => [{ value: 'native-model', displayName: 'Native model', description: '', supportedEffortLevels: ['medium', 'high'] }];
      query.setModel = async value => { controls.push(['model', value]); };
      query.applyFlagSettings = async value => { controls.push(['settings', value]); };
      return query;
    }
  };
  const runtime = new ClaudeSessions({ loadSdk: async () => sdk, executable: async () => '/example/bin/claude', activeSessions: async () => active });
  assert.equal(await runtime.initialize(), true);
  return { runtime, sdk, calls, queries, controls, info, close: () => runtime.shutdown() };
}

test('Claude history uses native message timestamps and leaves missing or invalid times unknown', async () => {
  const history = [
    { type: 'assistant', uuid: 'timed-history', timestamp: '2026-11-05T10:20:00Z', message: { content: 'Recorded answer.' } },
    { type: 'user', uuid: 'unknown-history', message: { content: 'An older question.' } },
    { type: 'assistant', uuid: 'invalid-history', timestamp: 'not-a-time', message: { content: 'An untimed answer.' } }
  ];
  const f = await fixture({ history });
  try {
    const agent = await f.runtime.open(workerId);
    assert.equal(agent.messages[0].timestamp, '2026-11-05T10:20:00.000Z'); assert.equal(agent.messages[0].timestampSource, 'native');
    assert.equal(agent.messages[1].timestamp, undefined); assert.equal(agent.messages[2].timestamp, undefined);
    agent.messages[1].timestamp = '2026-11-05T10:21:00.000Z'; agent.messages[1].timestampSource = 'received';
    history.push({ type: 'user', uuid: 'another-old-message', message: { content: 'Another older question.' } });
    await f.runtime.refresh(agent);
    assert.equal(agent.messages[1].timestamp, '2026-11-05T10:21:00.000Z'); assert.equal(agent.messages[1].timestampSource, 'received');
    assert.equal(agent.messages.at(-1).timestamp, undefined, 'history refresh must not stamp an old message with the current time');
    assert.equal(f.queries.length, 0, 'reading timestamps does not start a model');
  } finally { await f.close(); }
});

test('Claude sends image-only and text-plus-image prompts through native SDK content without duplicating echoes', async () => {
  const f = await fixture();
  try {
    const agent = await f.runtime.open(workerId);
    await f.runtime.send(agent, '', { images: [{ dataUrl: imageUrl }] });
    const query = f.queries[0], first = (await query.params.prompt.next()).value;
    assert.deepEqual(first.message.content, [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageData } }]);
    assert.equal(agent.messages.at(-1).text, ''); assert.equal(agent.messages.at(-1).images[0].dataUrl, imageUrl);
    const sentTime = agent.messages.at(-1).timestamp;
    query.push({ ...first, type: 'user', message: { role: 'user', content: [...first.message.content, { type: 'text', text: '' }] } });
    await tick();
    assert.equal(agent.messages.filter(message => message.nativeMessageId === first.uuid).length, 1);
    assert.equal(agent.messages.at(-1).timestamp, sentTime);
    await f.runtime.send(agent, 'Explain the screenshot.', { images: [{ dataUrl: imageUrl }], priority: 'next' });
    const second = (await query.params.prompt.next()).value;
    assert.equal(second.priority, 'next'); assert.equal(second.message.content[0].type, 'image');
    assert.deepEqual(second.message.content[1], { type: 'text', text: 'Explain the screenshot.' });
    query.push(second); await tick();
    const messages = agent.messages.filter(message => message.nativeMessageId === second.uuid);
    assert.equal(messages.length, 1); assert.equal(messages[0].text, 'Explain the screenshot.'); assert.equal(messages[0].images.length, 1);
    await f.runtime.send(agent, 'Plain follow-up.');
    assert.equal((await query.params.prompt.next()).value.message.content, 'Plain follow-up.', 'text-only reports/controls keep their native string input');
    assert.equal(f.queries.length, 1); assert.equal(f.controls.length, 0, 'image input does not interrupt or change native controls');
  } finally { await f.close(); }
});

test('Claude native history retains bounded inline user images with their caption and ignores remote or unsupported sources', async () => {
  const history = [{ type: 'user', uuid: 'native-image-history', timestamp: '2026-11-05T10:20:00Z', message: { content: [
    { type: 'text', text: 'What is shown?' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageData } },
    { type: 'image', source: { type: 'url', url: 'https://untrusted.example/image.png' } },
    { type: 'image', source: { type: 'base64', media_type: 'image/svg+xml', data: 'PHN2Zy8+' } }
  ] } }];
  const f = await fixture({ history });
  try {
    const agent = await f.runtime.open(workerId);
    assert.equal(agent.messages.length, 1); assert.equal(agent.messages[0].id, 'native-image-history:0');
    assert.equal(agent.messages[0].text, 'What is shown?'); assert.equal(agent.messages[0].images.length, 1);
    assert.equal(agent.messages[0].images[0].dataUrl, imageUrl); assert.equal(agent.messages[0].images[0].mimeType, 'image/png');
    assert.equal(agent.messages[0].timestampSource, 'native');
    await f.runtime.refresh(agent);
    assert.equal(agent.messages[0].images[0].dataUrl, imageUrl); assert.equal(f.queries.length, 0);
  } finally { await f.close(); }
});

test('Claude image inputs are rejected before a model starts when invalid and cannot take over an external session', async () => {
  const f = await fixture(); const external = await fixture({ active: [nativeId] });
  try {
    const agent = await f.runtime.open(workerId);
    await assert.rejects(f.runtime.send(agent, '', { images: [{ dataUrl: 'https://untrusted.example/image.png' }] }));
    await assert.rejects(f.runtime.send(agent, '', { images: [{ dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' }] }));
    assert.equal(f.queries.length, 0); assert.equal(agent.messages.length, 0);
    const other = await external.runtime.open(workerId);
    await assert.rejects(external.runtime.send(other, '', { images: [{ dataUrl: imageUrl }] }), /another local process/);
    assert.equal(external.queries.length, 0); assert.equal(external.controls.length, 0);
  } finally { await f.close(); await external.close(); }
});

test('Claude live message times remain stable through streaming, final replacement and user echoes', async t => {
  const initial = Date.parse('2026-11-05T10:20:00Z');
  t.mock.timers.enable({ apis: ['Date'], now: initial });
  const f = await fixture();
  try {
    const agent = await f.runtime.open(workerId); await f.runtime.send(agent, 'Review this change.');
    const query = f.queries[0], sent = (await query.params.prompt.next()).value;
    assert.equal(agent.messages.at(-1).timestamp, '2026-11-05T10:20:00.000Z');
    assert.equal(sent.timestamp, '2026-11-05T10:20:00.000Z');
    t.mock.timers.setTime(initial + 60000);
    query.push({ type: 'user', uuid: sent.uuid, session_id: nativeId, message: { content: 'Review this change.' } });
    query.push({ type: 'stream_event', session_id: nativeId, event: { type: 'message_start', message: { id: 'timestamp-stream', model: 'native-model' } } });
    query.push({ type: 'stream_event', session_id: nativeId, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'First' } } });
    await until(() => agent.messages.some(message => message.text === 'First'));
    assert.equal(agent.messages.find(message => message.nativeMessageId === sent.uuid).timestamp, '2026-11-05T10:20:00.000Z');
    const streamed = agent.messages.find(message => message.type === 'assistant').timestamp;
    t.mock.timers.setTime(initial + 180000);
    query.push({ type: 'stream_event', session_id: nativeId, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: ' answer.' } } });
    await until(() => agent.messages.some(message => message.text === 'First answer.'));
    assert.equal(agent.messages.find(message => message.type === 'assistant').timestamp, streamed);
    query.push({ type: 'assistant', uuid: 'timestamp-final', session_id: nativeId, message: { content: 'First answer.' } });
    await until(() => agent.messages.some(message => message.nativeMessageId === 'timestamp-final'));
    const final = agent.messages.find(message => message.nativeMessageId === 'timestamp-final');
    assert.equal(final.timestamp, streamed); assert.equal(final.timestampSource, 'received');
    assert.equal(agent.messages.filter(message => message.type === 'assistant').length, 1);
    query.push({ type: 'assistant', uuid: 'timestamp-final', timestamp: '2026-11-05T10:22:00Z', session_id: nativeId, message: { content: 'First answer.' } });
    await until(() => final !== agent.messages.find(message => message.nativeMessageId === 'timestamp-final'));
    assert.equal(agent.messages.find(message => message.nativeMessageId === 'timestamp-final').timestamp, '2026-11-05T10:22:00.000Z');
    assert.equal(agent.messages.find(message => message.nativeMessageId === 'timestamp-final').timestampSource, 'native');
    query.push({ type: 'stream_event', session_id: nativeId, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Another answer.' } } });
    await until(() => agent.messages.some(message => message.text === 'Another answer.'));
    const withoutStart = agent.messages.find(message => message.text === 'Another answer.').timestamp;
    t.mock.timers.setTime(initial + 240000);
    query.push({ type: 'assistant', uuid: 'timestamp-no-start', session_id: nativeId, message: { content: 'Another answer.' } });
    await until(() => agent.messages.some(message => message.nativeMessageId === 'timestamp-no-start'));
    assert.equal(agent.messages.find(message => message.nativeMessageId === 'timestamp-no-start').timestamp, withoutStart);
    assert.equal(agent.messages.filter(message => message.text === 'Another answer.').length, 1);
  } finally { await f.close(); }
});

test('local Claude discovery and read-only restoration include headless sessions without starting a query', async () => {
  const f = await fixture({ active: [nativeId], history: [
    { type: 'user', uuid: 'first', message: { content: 'Review the project.' } },
    { type: 'assistant', uuid: 'reply', message: { model: 'existing-model', content: [{ type: 'text', text: 'Working on it.' }] } }
  ] });
  try {
    const list = await f.runtime.list(); assert.equal(list.agents[0].id, workerId); assert.equal(list.agents[0].status, 'running');
    assert.equal(f.calls.find(([method]) => method === 'listSessions')[1].includeProgrammatic, true);
    const agent = await f.runtime.open(workerId);
    assert.equal(agent.provider, 'claude'); assert.equal(agent.canSend, false); assert.equal(agent.externalSession, true);
    assert.equal(agent.messages.at(-1).text, 'Working on it.'); assert.equal(agent.model, 'existing-model');
    await assert.rejects(f.runtime.send(agent, 'Continue'), /another local process/);
    await assert.rejects(f.runtime.interrupt(agent), /managed by this Command Center/);
    assert.equal(f.queries.length, 0); assert.equal(f.controls.length, 0);
  } finally { await f.close(); }
});

test('managed Claude uses the installed native executable and SDK streaming input without changing permission defaults', async () => {
  const f = await fixture();
  try {
    const agent = await f.runtime.open(workerId);
    await f.runtime.send(agent, 'Review this change.', { instructions: 'Standard Task Report\nShared instructions' });
    const query = f.queries[0], options = query.params.options;
    assert.equal(options.resume, nativeId); assert.equal(options.pathToClaudeCodeExecutable, '/example/bin/claude');
    assert.deepEqual(options.settingSources, ['user', 'project', 'local']); assert.match(options.systemPrompt.append, /Shared instructions/);
    for (const key of ['permissionMode', 'allowedTools', 'allowDangerouslySkipPermissions', 'mcpServers', 'settings']) assert.equal(Object.hasOwn(options, key), false, key);
    const input = (await query.params.prompt.next()).value; assert.equal(input.session_id, nativeId); assert.equal(input.message.content, 'Review this change.');
    query.push({ type: 'system', subtype: 'init', session_id: nativeId, model: 'native-model' });
    query.push({ type: 'stream_event', session_id: nativeId, event: { type: 'message_start', message: { id: 'assistant-1', model: 'native-model' } } });
    query.push({ type: 'stream_event', session_id: nativeId, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'The change ' } } });
    query.push({ type: 'stream_event', session_id: nativeId, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'looks consistent.' } } });
    await until(() => agent.messages.some(message => message.text === 'The change looks consistent.'));
    query.push({ type: 'assistant', uuid: 'complete-1', session_id: nativeId, message: { model: 'native-model', content: [{ type: 'text', text: 'The change looks consistent.' }] } });
    query.push({ type: 'result', session_id: nativeId, is_error: false });
    await until(() => agent.thread.status.type === 'idle');
    assert.equal(agent.messages.filter(message => message.type === 'assistant').length, 1, 'the streaming draft is replaced by the final native message');
    await f.runtime.send(agent, 'Now check the tests.');
    assert.equal(f.queries.length, 1, 'follow-up input stays in the same SDK process/session');
    assert.equal((await query.params.prompt.next()).value.message.content, 'Now check the tests.');
    await f.runtime.interrupt(agent); assert.deepEqual(f.controls, [['interrupt']]);
  } finally { await f.close(); }
});

test('Claude tool permissions stay tied to independent callbacks, reject injected grants and await native progress', async () => {
  const f = await fixture();
  try {
    const agent = await f.runtime.open(workerId); await f.runtime.send(agent, 'Inspect the local project.');
    const query = f.queries[0], callback = query.params.options.canUseTool;
    const first = callback('Bash', { command: 'read-project-metadata' }, { requestId: 'approval-one', toolUseID: 'tool-one', signal: new AbortController().signal });
    const second = callback('Edit', { file_path: '/example/project/source.js', old_string: 'a', new_string: 'b' }, { requestId: 'approval-two', toolUseID: 'tool-two', signal: new AbortController().signal });
    assert.equal(agent.questions.length, 2); assert.equal(agent.questions[0].method, CLAUDE_APPROVAL);
    assert.throws(() => f.runtime.answer(agent, 'approval-one', { decision: 'accept', updatedPermissions: [{ type: 'allowAll' }] }), /only the answer/);
    assert.deepEqual(f.runtime.answer(agent, 'approval-one', { decision: 'accept' }), { submitted: true });
    assert.deepEqual(await first, { behavior: 'allow', updatedInput: { command: 'read-project-metadata' } });
    assert.equal(agent.questions.length, 2); assert.equal(agent.questions[0].responding, true);
    assert.throws(() => f.runtime.answer(agent, 'approval-one', { decision: 'accept' }), /already submitted/);
    query.push({ type: 'user', uuid: 'result-one', session_id: nativeId, message: { content: [{ type: 'tool_result', tool_use_id: 'tool-one', content: 'Metadata read.' }] } });
    await until(() => agent.questions.length === 1); assert.equal(agent.questions[0].id, 'approval-two');
    f.runtime.answer(agent, 'approval-two', { decision: 'decline' }); assert.equal((await second).behavior, 'deny');
    query.push({ type: 'result', session_id: nativeId, is_error: false });
    await until(() => !agent.questions.length);
  } finally { await f.close(); }
});

test('Claude structured questions and MCP forms retain their exact native callback inputs', async () => {
  const f = await fixture();
  try {
    const agent = await f.runtime.open(workerId); await f.runtime.send(agent, 'Work on the requested choice.');
    const query = f.queries[0];
    const request = { questions: [{ question: 'Which target?', header: 'Target', options: [{ label: 'Test', description: 'Use test.' }], multiSelect: false }] };
    const result = query.params.options.canUseTool('AskUserQuestion', request, { requestId: 'choice', toolUseID: 'question-tool', signal: new AbortController().signal });
    assert.equal(agent.questions[0].method, CLAUDE_QUESTION);
    assert.throws(() => f.runtime.answer(agent, 'choice', { answers: {} }), /Answer every/);
    f.runtime.answer(agent, 'choice', { answers: { 'Which target?': 'Test' } });
    assert.deepEqual(await result, { behavior: 'allow', updatedInput: { ...request, answers: { 'Which target?': 'Test' } } });
    const form = query.params.options.onElicitation({ serverName: 'example', message: 'Choose a scope.', requestedSchema: { type: 'object', properties: { scope: { type: 'string', enum: ['test'] } }, required: ['scope'] } }, { signal: new AbortController().signal });
    const pending = agent.questions.find(question => question.method === CLAUDE_ELICITATION); assert.equal(pending.params.mode, 'form');
    assert.throws(() => f.runtime.answer(agent, pending.id, { decision: 'accept', content: { scope: 'other' } }), /Check the answer/);
    f.runtime.answer(agent, pending.id, { decision: 'accept', content: { scope: 'test' } });
    assert.deepEqual(await form, { action: 'accept', content: { scope: 'test' } });
    assert.equal(pending.responding, true, 'the submitted form remains visibly pending until native progress');
    query.push({ type: 'result', session_id: nativeId, is_error: false }); await until(() => !agent.questions.length);
  } finally { await f.close(); }
});

test('Claude model controls use SDK catalog/control acknowledgments without adding permissions', async () => {
  const f = await fixture();
  try {
    const agent = await f.runtime.open(workerId); await assert.rejects(f.runtime.modelSettings(agent), /does not start a model run/);
    assert.equal(f.queries.length, 0); await f.runtime.send(agent, 'Review the source.');
    const turn = agent.turnId; const settings = await f.runtime.modelSettings(agent); assert.deepEqual(settings.models[0].efforts.map(option => option.value), ['medium', 'high']);
    await assert.rejects(f.runtime.updateModel(agent, { model: 'native-model', effort: 'high', permissionMode: 'bypassPermissions' }), /only a model/);
    const saved = await f.runtime.updateModel(agent, { model: 'native-model', effort: 'high' });
    assert.equal(saved.change.status, 'saved'); assert.equal(agent.turnId, turn);
    assert.deepEqual(f.controls, [['model', 'native-model'], ['settings', { effortLevel: 'high' }]]);
    addClaudeMessage(agent, { type: 'assistant', uuid: 'current-turn', message: { model: 'previous-turn-model', content: [{ type: 'text', text: 'Current work continues.' }] } }, turn);
    assert.equal(agent.model, 'native-model', 'current-turn output cannot overwrite the acknowledged subsequent-turn setting');
    assert.equal(agent.currentTurnModel, 'previous-turn-model');
  } finally { await f.close(); }
});

test('Claude tool activity is visible while private thinking text is not rendered', () => {
  const agent = { messages: [] };
  addClaudeMessage(agent, { type: 'assistant', uuid: 'assistant', message: { content: [{ type: 'thinking', thinking: 'Private analysis text.' }, { type: 'tool_use', id: 'read', name: 'Read', input: { file_path: '/example/project/source.js' } }] } });
  assert.equal(agent.messages.length, 1); assert.match(agent.messages[0].text, /Read/); assert.equal(agent.messages[0].state, 'inProgress');
  addClaudeMessage(agent, { type: 'user', uuid: 'tool-output', message: { content: [{ type: 'tool_result', tool_use_id: 'read', content: 'Source read.' }] } });
  assert.equal(agent.messages.length, 1); assert.equal(agent.messages[0].state, 'completed'); assert.match(agent.messages[0].text, /Source read/);
  assert.doesNotMatch(JSON.stringify(agent.messages), /Private analysis text/);
});

test('Claude workspace restoration works without Codex and does not start a model or replay instructions', async () => {
  const f = await fixture(), rpc = new EventEmitter(); rpc.ready = false; const calls = []; rpc.call = async (method, params) => { calls.push({ method, params }); throw new Error('Codex is offline.'); };
  const workspace = new Workspace(rpc, { beads: null, claude: f.runtime });
  const saved = workspaceRecord({ version: 1, workerIds: [workerId], coordinatorId: null, coordinatorPaused: false });
  const persistence = new WorkspacePersistence(workspace, { load: async () => saved, save: async () => {} });
  try {
    await persistence.initialize(); await persistence.restore();
    assert.equal(workspace.snapshot().connected, true); assert.equal(workspace.snapshot().codexConnected, false);
    assert.equal(workspace.snapshot().agents[0].provider, 'claude'); assert.equal(f.queries.length, 0); assert.equal(calls.length, 0);
    await workspace.send(workerId, 'Continue here.'); assert.equal(f.queries.length, 1);
    assert.match(f.queries[0].params.options.systemPrompt.append, /Standard Task Report/);
    assert.match(f.queries[0].params.options.systemPrompt.append, /Setup-Agentic-Dev-Environment/);
    const pending = f.queries[0].params.options.canUseTool('Bash', { command: 'inspect-source' }, { requestId: 'native-question', toolUseID: 'native-tool', signal: new AbortController().signal });
    rpc.emit('disconnected', 'Codex disconnected.'); assert.equal(workspace.agent(workerId).questions.length, 1);
    workspace.answer(workerId, 'native-question', { decision: 'decline' }); await pending;
    f.queries[0].push({ type: 'user', uuid: 'native-result', session_id: nativeId, message: { content: [{ type: 'tool_result', tool_use_id: 'native-tool', content: 'Declined.' }] } });
    await until(() => !workspace.agent(workerId).questions.length);
    workspace.close(workerId); assert.equal(f.runtime.runs.has(workerId), true, 'closing the tab leaves the managed process running');
    let published = 0; workspace.on('change', () => published++);
    const closedRequest = f.queries[0].params.options.canUseTool('Bash', { command: 'inspect-more-source' }, { requestId: 'closed-question', toolUseID: 'closed-tool', signal: new AbortController().signal });
    assert.ok(published > 0, 'a native question from a closed tab still publishes workspace state');
    assert.equal(workspace.snapshot().backgroundQuestions, 1);
    assert.deepEqual(workspace.snapshot().backgroundWorkers, [{ id: workerId, name: 'Review local project', provider: 'claude', questionCount: 1 }]);
    await workspace.open(workerId); assert.equal(f.queries.length, 1);
    assert.equal(workspace.snapshot().backgroundQuestions, 0); assert.equal(workspace.agent(workerId).questions[0].id, 'closed-question');
    workspace.answer(workerId, 'closed-question', { decision: 'decline' }); await closedRequest;
  } finally { await persistence.close(); await f.close(); }
});

test('concurrent Claude sends share one initialization and native idle resolves coalesced inputs', async () => {
  const f = await fixture();
  try {
    const agent = await f.runtime.open(workerId); let release;
    f.runtime.readActive = () => new Promise(resolve => { release = resolve; });
    const first = f.runtime.send(agent, 'First input.'), second = f.runtime.send(agent, 'Second input.');
    await until(() => release); release([]); await Promise.all([first, second]);
    assert.equal(f.queries.length, 1, 'one session cannot acquire two managed SDK processes');
    const query = f.queries[0];
    assert.equal((await query.params.prompt.next()).value.message.content, 'First input.');
    assert.equal((await query.params.prompt.next()).value.message.content, 'Second input.');
    query.push({ type: 'system', subtype: 'session_state_changed', state: 'running', session_id: nativeId });
    query.push({ type: 'result', session_id: nativeId, is_error: false }); await tick();
    assert.equal(agent.thread.status.type, 'active', 'a result does not override the native running state');
    query.push({ type: 'system', subtype: 'session_state_changed', state: 'idle', session_id: nativeId });
    await until(() => agent.thread.status.type === 'idle'); assert.equal(agent.turnId, null);
  } finally { await f.close(); }
});

test('shared-instruction loading cannot send into a closed worker or pass a newly arrived native question', async () => {
  for (const change of ['closed', 'question']) {
    const f = await fixture(), rpc = new EventEmitter(); rpc.ready = false;
    const workspace = new Workspace(rpc, { beads: null, claude: f.runtime });
    try {
      const agent = await workspace.open(workerId); let release;
      workspace.instructionContext = () => new Promise(resolve => { release = resolve; });
      const sending = workspace.send(workerId, 'Continue.'); await until(() => release);
      if (change === 'closed') workspace.close(workerId); else agent.thread.status = { type: 'active', activeFlags: ['waitingOnApproval'] };
      release({}); await assert.rejects(sending, change === 'closed' ? /closed before message delivery/ : /pending request/);
      assert.equal(f.queries.length, 0);
    } finally { await f.close(); }
  }
});

test('malformed Claude question keys cannot bypass the question validator and can be explicitly declined', async () => {
  const f = await fixture();
  try {
    const agent = await f.runtime.open(workerId); await f.runtime.send(agent, 'Review the decision.');
    const result = f.queries[0].params.options.canUseTool('AskUserQuestion', { questions: [{ question: '__proto__' }] }, { requestId: 'malformed', toolUseID: 'malformed-tool', signal: new AbortController().signal });
    assert.throws(() => f.runtime.answer(agent, 'malformed', { answers: JSON.parse('{"__proto__":"value"}') }), /format is unsupported/);
    f.runtime.answer(agent, 'malformed', { decision: 'decline' }); assert.equal((await result).behavior, 'deny');
  } finally { await f.close(); }
});

test('the installed official SDK reads isolated native headless history without a provider run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-sdk-read-')), cwd = join(directory, 'project'), config = join(directory, 'config');
  const previous = process.env.CLAUDE_CONFIG_DIR; process.env.CLAUDE_CONFIG_DIR = config;
  try {
    await mkdir(cwd); const folder = join(config, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-')); await mkdir(folder, { recursive: true });
    const first = { type: 'user', uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', parentUuid: null, sessionId: nativeId, isSidechain: false, cwd, timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'Review synthetic project.' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageData } }] } };
    const second = { type: 'assistant', uuid: 'ffffffff-aaaa-4bbb-8ccc-dddddddddddd', parentUuid: first.uuid, sessionId: nativeId, isSidechain: false, cwd, timestamp: new Date().toISOString(), message: { role: 'assistant', model: 'synthetic-model', content: [{ type: 'text', text: 'Synthetic source reviewed.' }] } };
    await writeFile(join(folder, nativeId + '.jsonl'), [first, second].map(row => JSON.stringify(row)).join('\n') + '\n');
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    const list = await sdk.listSessions({ dir: cwd, includeProgrammatic: true }); assert.equal(list.length, 1);
    assert.equal((await sdk.getSessionInfo(nativeId, { dir: cwd })).sessionId, nativeId);
    const history = await sdk.getSessionMessages(nativeId, { dir: cwd }); assert.equal(history.length, 2);
    assert.equal(history.at(-1).message.content[0].text, 'Synthetic source reviewed.');
    const agent = { messages: [] }; for (const message of history) addClaudeMessage(agent, message);
    assert.equal(agent.messages[0].text, 'Review synthetic project.'); assert.equal(agent.messages[0].images[0].dataUrl, imageUrl);
  } finally { if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = previous; await rm(directory, { recursive: true, force: true }); }
});

test('Codex connecting during delayed Claude restoration schedules one read-only retry', async () => {
  const f = await fixture(), rpc = new EventEmitter(); rpc.ready = false; const calls = [];
  rpc.call = async (method, params) => {
    calls.push({ method, params });
    if (method === 'thread/read') return { thread: { id: params.threadId, cwd: '/example/project', name: 'Restored Codex', status: { type: 'notLoaded' } }, instructionSources: [] };
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    throw new Error('Restoration must not resume a worker or start a turn.');
  };
  let release; f.sdk.getSessionMessages = () => new Promise(resolve => { release = resolve; });
  const workspace = new Workspace(rpc, { beads: null, claude: f.runtime });
  const saved = workspaceRecord({ version: 1, workerIds: ['saved-codex', workerId], coordinatorId: null, coordinatorPaused: false });
  const persistence = new WorkspacePersistence(workspace, { load: async () => saved, save: async () => {} });
  try {
    await persistence.initialize(); await until(() => release);
    assert.equal(workspace.agents.has('saved-codex'), false);
    rpc.ready = true; rpc.emit('connected'); release([]);
    await until(() => workspace.agents.has('saved-codex') && !persistence.job);
    assert.equal(workspace.agents.size, 2); assert.equal(f.queries.length, 0);
    assert.deepEqual(calls.map(call => call.method), ['thread/read', 'thread/turns/list']);
    await tick(); assert.equal(calls.length, 2, 'the event-triggered retry does not become a retry loop');
  } finally { await persistence.close(); await f.close(); }
});

test('unchanged external Claude history is not reread and observation does not erase a run failure', async () => {
  const f = await fixture(); f.info.fileSize = 100; f.info.lastModified = 1000;
  try {
    const agent = await f.runtime.open(workerId); agent.runError = 'Native Claude run failed.';
    const reads = () => f.calls.filter(([method]) => method === 'getSessionMessages').length;
    assert.equal(reads(), 1); await f.runtime.refresh(agent); assert.equal(reads(), 1);
    assert.equal(agent.runError, 'Native Claude run failed.');
    f.info.fileSize = 200; f.info.lastModified = 2000; await f.runtime.refresh(agent); assert.equal(reads(), 2);
  } finally { await f.close(); }
});
