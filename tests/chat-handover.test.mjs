import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workspace } from '../server/workspace.mjs';
import { ClaudeSessions } from '../server/claude.mjs';
import { handoverCreatePrompt, handoverImportPrompt, resolveHandoverSkill } from '../server/chat-handover.mjs';
import limits from '../server/limits.json' with { type: 'json' };

class Stream {
  waiting = null;
  next() { return new Promise(resolve => { this.waiting = resolve; }); }
  close() { this.waiting?.({ done: true }); }
  [Symbol.asyncIterator]() { return this; }
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-handover-'));
  const calls = [], queries = [], skills = [], threads = new Map();
  const state = { fail: null };
  const rpc = new EventEmitter(); rpc.ready = true;
  rpc.call = async (method, params) => {
    calls.push({ method, params });
    if (method === state.fail) throw new Error('Synthetic native delivery was not confirmed.');
    if (method === 'thread/start') {
      const thread = { id: 'new-' + (threads.size + 1), cwd: params.cwd, name: 'New chat', status: { type: 'idle' }, canAcceptDirectInput: true, turns: [] };
      threads.set(thread.id, thread); return { thread };
    }
    if (method === 'thread/name/set') { threads.get(params.threadId).name = params.name; return {}; }
    if (['thread/read', 'thread/resume'].includes(method)) return { thread: threads.get(params.threadId), instructionSources: [] };
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    if (method === 'turn/start') return { turn: { id: 'turn-' + params.threadId } };
    if (method === 'turn/steer') return { turnId: params.expectedTurnId };
    assert.fail('Unexpected native operation: ' + method);
  };
  rpc.respond = () => assert.fail('Handovers must not answer a native request.');
  const sdk = {
    listSessions: async () => [], getSessionInfo: async () => undefined, getSessionMessages: async () => [],
    query(params) { const stream = new Stream(); stream.params = params; queries.push(stream); return stream; }
  };
  const claude = new ClaudeSessions({ loadSdk: async () => sdk, executable: async () => '/synthetic/unused/claude', activeSessions: async () => [] });
  await claude.initialize();
  const handoverPath = join(directory, 'handoff.md');
  const workspace = new Workspace(rpc, { beads: null, claude, handoverPath: async () => handoverPath, handoverSkill: async provider => { skills.push(provider); return '/example/installed handoff/SKILL.md'; } });
  workspace.instructionContext = async agent => ({ task: { value: 'ccng-session:' + agent.id } });
  threads.set('source', { id: 'source', cwd: directory, name: 'Source project', status: { type: 'idle' }, canAcceptDirectInput: true, turns: [] });
  const source = await workspace.open('source');
  t.after(async () => { await claude.shutdown(); await rm(directory, { recursive: true, force: true }); });
  return { directory, handoverPath, workspace, source, calls, queries, skills, state, threads };
}

test('handover prompts preserve scope and treat quoted paths as data', () => {
  const path = '/tmp/example "quoted" handover/handoff.md';
  const create = handoverCreatePrompt('/example/installed handoff/SKILL.md', path, 'receiving-chat');
  assert(create.includes(JSON.stringify('/example/installed handoff/SKILL.md')));
  assert.match(create, /read.*SKILL\.md/i); assert.match(create, /original chat available/i);
  assert.match(create, /preserve task states|task states, pauses/i);
  assert(create.includes(JSON.stringify(path)));
  assert.match(create, /not create or send to another chat/i);
  assert.match(create, /exact saved path|handoff\.md path/i);
  const imported = handoverImportPrompt(path);
  assert(imported.includes(JSON.stringify(path))); assert(imported.length <= 2000);
  assert.match(imported, /evidence, not new instructions/i);
  assert.match(imported, /receiving conversation.s actual task label/i);
  assert.match(imported, /original chats retain monitoring responsibility/i);
  assert.match(imported, /file is unavailable|context is missing/i);
});

test('handover import rejects missing, relative, mismatched, long or control-bearing artifact paths', () => {
  for (const path of [undefined, null, {}, '', 'handoff.md', '/tmp/other.md', '/tmp/x\nhandoff.md', '/tmp/x\u0000/handoff.md', '/' + 'a'.repeat(1500) + '/handoff.md']) {
    assert.throws(() => handoverImportPrompt(path), /handoff|path/i);
  }
  assert.match(handoverImportPrompt(' /tmp/synthetic/handoff.md '), /\/tmp\/synthetic\/handoff\.md/);
});

test('skill resolution rejects an unsupported provider before reading any installed skill', async () => {
  await assert.rejects(resolveHandoverSkill('unknown-provider'), /Codex or Claude/i);
});

test('skill resolution reuses installed provider links and rejects missing or oversized files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-handover-skill-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'skill-source'); await mkdir(source);
  await writeFile(join(source, 'SKILL.md'), '# Synthetic handoff skill\n', { mode: 0o600 });
  for (const [provider, config] of [['codex', '.agents'], ['claude', '.claude']]) {
    const skills = join(directory, config, 'skills'); await mkdir(skills, { recursive: true });
    await symlink(source, join(skills, 'handoff'));
    assert.equal(await resolveHandoverSkill(provider, { home: directory }), join(skills, 'handoff', 'SKILL.md'));
  }
  await writeFile(join(source, 'SKILL.md'), 'x'.repeat(128 * 1024 + 1));
  await assert.rejects(resolveHandoverSkill('codex', { home: directory }), /unavailable/i);
  await rm(join(source, 'SKILL.md'));
  await assert.rejects(resolveHandoverSkill('claude', { home: directory }), /unavailable/i);
});

test('Create requires an explicit receiving provider before allocating a chat or sending source input', async t => {
  const f = await fixture(t);
  for (const provider of [undefined, '', 'unknown', 'codex ']) await assert.rejects(f.workspace.createHandover('source', { provider, cwd: f.directory }), /agent|Codex|Claude|provider/i);
  assert.equal(f.calls.some(call => ['thread/start', 'turn/start', 'turn/steer'].includes(call.method)), false);
  assert.equal(f.queries.length, 0); assert.equal(f.workspace.agents.size, 1);
});

test('Create allocates a waiting Codex receiver and asks only the source to write the exact private path', async t => {
  const f = await fixture(t);
  const result = await f.workspace.createHandover('source', { provider: 'codex', cwd: f.directory });
  assert.equal(result.accepted, true); assert.equal(result.path, f.handoverPath); assert.notEqual(result.id, 'source');
  assert.deepEqual(f.skills, ['codex']); assert.equal(f.workspace.agent('source'), f.source);
  assert.deepEqual(f.workspace.handoverImports.get(result.id), { path: f.handoverPath, sourceId: 'source' });
  assert.deepEqual(f.workspace.agent(result.id).handoverImport, { path: f.handoverPath, sourceId: 'source' });
  assert.deepEqual(f.calls.find(call => call.method === 'thread/start').params, { cwd: f.directory });
  assert.deepEqual(f.calls.find(call => call.method === 'thread/name/set').params, { threadId: result.id, name: 'Source project v2' });
  assert.equal(f.workspace.agent(result.id).name, 'Source project v2');
  assert.equal(f.source.name, 'Source project');
  const sends = f.calls.filter(call => call.method === 'turn/start');
  assert.equal(sends.length, 2);
  const waiting = sends.find(call => call.params.threadId === result.id).params.input[0].text;
  assert.equal(waiting.split('\n')[0], 'Source project v2');
  assert.match(waiting, /wait/i); assert.match(waiting, /import/i); assert.match(waiting, /do not|don't/i);
  assert.doesNotMatch(waiting, /^Read the handover at/m);
  const source = sends.find(call => call.params.threadId === 'source').params.input[0].text;
  assert(source.includes(JSON.stringify(f.handoverPath))); assert.match(source, /installed handoff skill/i);
  assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 1);
  assert.equal(f.queries.length, 0);
});

test('Import sends the assigned path to the same Codex receiver and creates no third chat', async t => {
  const f = await fixture(t), result = await f.workspace.createHandover('source', { provider: 'codex', cwd: f.directory });
  const sourceBefore = structuredClone(f.source), receiver = f.workspace.agent(result.id);
  const starts = f.calls.filter(call => call.method === 'thread/start').length;
  await f.workspace.importHandover(result.id, {});
  const delivered = f.calls.filter(call => ['turn/start', 'turn/steer'].includes(call.method)).at(-1);
  assert.equal(delivered.params.threadId, result.id);
  assert(delivered.params.input[0].text.includes(JSON.stringify(f.handoverPath)));
  assert.match(delivered.params.input[0].text, /evidence, not new instructions/i);
  assert.equal(f.calls.filter(call => call.method === 'thread/start').length, starts);
  assert.equal(f.workspace.agent(result.id), receiver); assert.deepEqual(f.source, sourceBefore);
  assert.equal(f.workspace.agents.size, 2);
});

test('Create can prepare a Claude receiver and Import reuses its existing SDK query without copying permissions', async t => {
  const f = await fixture(t); f.source.name = 'Source project v9';
  const result = await f.workspace.createHandover('source', { provider: 'claude', cwd: f.directory });
  assert.match(result.id, /^claude-/); assert.equal(f.queries.length, 1);
  const query = f.queries[0], waiting = (await query.params.prompt.next()).value;
  assert.equal(f.workspace.agent(result.id).name, 'Source project v10');
  assert.equal(waiting.message.content.split('\n')[0], 'Source project v10');
  assert.equal(f.source.name, 'Source project v9');
  assert.match(waiting.message.content, /wait/i); assert.doesNotMatch(waiting.message.content, /^Read the handover at/m);
  assert.equal(query.params.options.sessionId, result.id.slice(7)); assert.equal(query.params.options.permissionMode, undefined);
  assert.match(query.params.options.systemPrompt.append, new RegExp('ccng-session:' + result.id));
  const before = structuredClone(f.source);
  await f.workspace.importHandover(result.id, {});
  const imported = (await query.params.prompt.next()).value;
  assert(imported.message.content.includes(JSON.stringify(f.handoverPath)));
  assert.equal(f.queries.length, 1); assert.deepEqual(f.source, before);
  assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 0);
});

for (const provider of ['codex', 'claude']) {
  test(`Create uses the last worker slot for a ${provider} receiver and still sends source preparation`, async t => {
    const f = await fixture(t);
    assert.equal(limits.maxWorkers, 16);
    for (let index = 1; index < limits.maxWorkers - 1; index++) {
      const id = 'existing-' + index;
      f.threads.set(id, { ...f.source.thread, id, name: 'Existing worker ' + index, turns: [] });
      await f.workspace.open(id);
    }
    assert.equal(f.workspace.workerSlots(), 15);
    const result = await f.workspace.createHandover('source', { provider });
    assert.equal(result.accepted, true); assert.equal(f.workspace.workerSlots(), 16);
    const preparation = f.calls.filter(call => ['turn/start', 'turn/steer'].includes(call.method) && call.params.threadId === 'source');
    assert.equal(preparation.length, 1);
    assert(preparation[0].params.input[0].text.includes(JSON.stringify(f.handoverPath)));
    assert.match(preparation[0].params.input[0].text, /installed handoff skill/i);
    const allocations = f.calls.filter(call => call.method === 'thread/start').length;
    await f.workspace.importHandover(result.id);
    assert.equal(f.workspace.workerSlots(), 16);
    assert.equal(f.calls.filter(call => call.method === 'thread/start').length, allocations);
    assert.equal(f.queries.length, provider === 'claude' ? 1 : 0);
    await assert.rejects(f.workspace.createHandover('source', { provider }), /close.*tab/i);
    assert.equal(f.calls.filter(call => call.method === 'thread/start').length, allocations);
  });

  test(`Import keeps the assigned ${provider} receiver usable after the source tab closes`, async t => {
    const f = await fixture(t), result = await f.workspace.createHandover('source', { provider });
    const receiver = f.workspace.agent(result.id), allocations = f.calls.filter(call => call.method === 'thread/start').length;
    if (provider === 'claude') await f.queries[0].params.prompt.next();
    f.workspace.close('source');
    assert.equal(f.workspace.agents.has('source'), false);
    assert.deepEqual(await f.workspace.importHandover(result.id), { accepted: true });
    assert.equal(f.workspace.agent(result.id), receiver);
    assert.deepEqual(receiver.handoverImport, { path: f.handoverPath, sourceId: 'source' });
    const imported = provider === 'claude'
      ? (await f.queries[0].params.prompt.next()).value.message.content
      : f.calls.filter(call => ['turn/start', 'turn/steer'].includes(call.method)).at(-1).params.input[0].text;
    assert(imported.includes(JSON.stringify(f.handoverPath)));
    assert.match(imported, /evidence, not new instructions/i);
    assert.equal(f.calls.filter(call => call.method === 'thread/start').length, allocations);
    assert.equal(f.queries.length, provider === 'claude' ? 1 : 0);
    assert.equal(f.calls.some(call => /archive|delete|interrupt/.test(call.method)), false);
  });
}

test('source native requests and unavailable input prevent Create before receiver allocation', async t => {
  const f = await fixture(t), request = { id: 'pending-source', method: 'item/commandExecution/requestApproval', params: {} };
  f.source.questions.push(request);
  await assert.rejects(f.workspace.createHandover('source', { provider: 'codex', cwd: f.directory }), /pending question|pending request|answer|waiting for a request/i);
  assert.equal(f.source.questions[0], request);
  assert.equal(f.calls.some(call => ['thread/start', 'turn/start'].includes(call.method)), false);
  f.source.questions = []; f.source.canSend = false;
  await assert.rejects(f.workspace.createHandover('source', { provider: 'codex', cwd: f.directory }), /does not allow|input|permission|unavailable/i);
  assert.equal(f.calls.some(call => ['thread/start', 'turn/start'].includes(call.method)), false);
});

test('Create refuses the Coordinator and a source replaced during skill resolution', async t => {
  const f = await fixture(t); f.source.role = 'coordinator';
  await assert.rejects(f.workspace.createHandover('source', { provider: 'codex', cwd: f.directory }), /worker|coordinator/i);
  f.source.role = 'worker'; let release;
  f.workspace.handoverSkill = async () => new Promise(resolve => { release = resolve; });
  const pending = f.workspace.createHandover('source', { provider: 'codex', cwd: f.directory });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(typeof release, 'function');
  f.workspace.agents.set('source', { ...f.source }); release('/example/SKILL.md');
  await assert.rejects(pending, /changed|closed|worker/i);
  assert.equal(f.calls.some(call => ['thread/start', 'turn/start'].includes(call.method)), false);
});

test('Create preserves a live native message question rather than retiring it for generated input', async t => {
  const f = await fixture(t); f.source.turnId = 'question-turn'; f.source.thread.status = { type: 'active' };
  f.workspace.rpc.emit('notification', { method: 'item/completed', params: { threadId: 'source', turnId: 'question-turn', item: { id: 'human-choice', type: 'agentMessage', text: '', questions: [{ title: 'Which option?', options: null }] } } });
  await assert.rejects(f.workspace.createHandover('source', { provider: 'codex', cwd: f.directory }), error => error.code === 'async_question_pending');
  assert.equal(f.calls.some(call => ['thread/start', 'turn/start', 'turn/steer', 'turn/interrupt'].includes(call.method)), false);
  const view = f.workspace.snapshot().agents.find(agent => agent.id === 'source');
  assert.equal(view.messages.find(message => message.id === 'human-choice').nativeQuestions[0].answerState, 'available');
});

test('Import is restricted to an assigned receiver and preserves its pending callbacks', async t => {
  const f = await fixture(t);
  await assert.rejects(f.workspace.importHandover('source', {}), /receiv|handover|assign/i);
  const result = await f.workspace.createHandover('source', { provider: 'codex', cwd: f.directory });
  const receiver = f.workspace.agent(result.id), request = { id: 'pending-receiver', method: 'item/commandExecution/requestApproval', params: {} };
  receiver.questions.push(request); const before = f.calls.length;
  await assert.rejects(f.workspace.importHandover(result.id, {}), /pending question|pending request|answer|waiting for a request/i);
  assert.equal(receiver.questions[0], request); assert.equal(f.calls.length, before);
});

test('Import validates an explicitly replaced path without creating another receiver', async t => {
  const f = await fixture(t), result = await f.workspace.createHandover('source', { provider: 'codex', cwd: f.directory });
  const before = f.calls.length;
  await assert.rejects(f.workspace.importHandover(result.id, { path: '../handoff.md' }), /absolute|path/i);
  assert.equal(f.calls.length, before);
  const replacement = '/tmp/other-private-transfer/handoff.md';
  await f.workspace.importHandover(result.id, { path: replacement });
  const delivered = f.calls.filter(call => ['turn/start', 'turn/steer'].includes(call.method)).at(-1);
  assert.equal(delivered.params.threadId, result.id); assert(delivered.params.input[0].text.includes(JSON.stringify(replacement)));
  assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 1);
});

test('a source question arriving after receiver startup keeps both the receiver and original question', async t => {
  const f = await fixture(t); let entered, release;
  const waiting = new Promise(resolve => { entered = resolve; });
  f.workspace.instructionContext = async agent => {
    if (agent.id === 'source') { entered(); await new Promise(resolve => { release = resolve; }); }
    return { task: { value: 'ccng-session:' + agent.id } };
  };
  const pending = f.workspace.createHandover('source', { provider: 'codex', cwd: f.directory });
  await waiting;
  f.source.turnId = 'question-turn'; f.source.thread.status = { type: 'active' };
  f.workspace.rpc.emit('notification', { method: 'item/completed', params: { threadId: 'source', turnId: 'question-turn', item: { id: 'late-human-choice', type: 'agentMessage', text: '', questions: [{ title: 'Which option?', options: null }] } } });
  release();
  await assert.rejects(pending, /new-2|receiving chat/i);
  assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 1);
  assert.equal(f.calls.some(call => ['turn/start', 'turn/steer'].includes(call.method) && call.params.threadId === 'source'), false);
  assert.equal(f.workspace.agents.has('new-2'), true);
  assert.deepEqual(f.workspace.handoverImports.get('new-2'), { path: f.handoverPath, sourceId: 'source' });
  const view = f.workspace.snapshot().agents.find(agent => agent.id === 'source');
  assert.equal(view.messages.find(message => message.id === 'late-human-choice').nativeQuestions[0].answerState, 'available');
});

test('known allocated Create failures retain exact receiving native ID without repeating or deleting work', async t => {
  for (const method of ['thread/name/set', 'thread/read', 'turn/start']) {
    const f = await fixture(t); f.state.fail = method;
    await assert.rejects(f.workspace.createHandover('source', { provider: 'codex', cwd: f.directory }), error => {
      assert.match(error.message, /new-2/); assert.match(error.message, /open|check|inspect/i); return true;
    });
    assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 1);
    assert.equal(f.workspace.agent('source'), f.source); assert.equal(f.workspace.creating, 0);
    assert.equal(f.calls.some(call => /archive|delete|interrupt/.test(call.method)), false);
  }
});

test('unknown native receiver allocation and unconfirmed source delivery are not blindly repeated', async t => {
  const f = await fixture(t); f.state.fail = 'thread/start';
  await assert.rejects(f.workspace.createHandover('source', { provider: 'codex', cwd: f.directory }), /uncertain|not confirmed|unknown|check/i);
  assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 1); assert.equal(f.workspace.creating, 0);
  f.state.fail = null;
  const send = f.workspace.send.bind(f.workspace); let sourceSends = 0;
  f.workspace.send = async (id, ...args) => { if (id === 'source') { sourceSends++; throw new Error('Source input not confirmed.'); } return send(id, ...args); };
  await assert.rejects(f.workspace.createHandover('source', { provider: 'codex', cwd: f.directory }), /new-2|receiv|not confirmed/i);
  assert.equal(sourceSends, 1); assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 2);
});

