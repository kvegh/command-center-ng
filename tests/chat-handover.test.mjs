import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workspace } from '../server/workspace.mjs';
import { ClaudeSessions } from '../server/claude.mjs';
import { resolveHandoverSkill } from '../server/chat-handover.mjs';
import limits from '../server/limits.json' with { type: 'json' };

class Stream {
  values = []; waiting = null; closed = false;
  next() { if (this.values.length) return Promise.resolve(this.values.shift()); if (this.closed) return Promise.resolve({ done: true }); return new Promise(resolve => { this.waiting = resolve; }); }
  push(value) { const item = { value, done: false }; if (this.waiting) { const done = this.waiting; this.waiting = null; done(item); } else this.values.push(item); }
  close() { this.closed = true; this.waiting?.({ done: true }); this.waiting = null; }
  [Symbol.asyncIterator]() { return this; }
}

async function fixture(t, { sourceProvider = 'codex', handoverTimeout = 1000 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-handover-test-'));
  const calls = [], queries = [], skills = [], threads = new Map();
  const state = { fail: null, catalog: [], pages: [] };
  let allocation = 0, turn = 0;
  const rpc = new EventEmitter(); rpc.ready = true;
  rpc.call = async (method, params) => {
    calls.push({ method, params });
    if (method === state.fail) throw new Error('Synthetic native delivery was not confirmed.');
    if (method === 'thread/start') {
      const thread = { id: 'receiver-' + ++allocation, cwd: params.cwd, name: 'New chat', status: { type: 'idle' }, canAcceptDirectInput: true, turns: [] };
      threads.set(thread.id, thread); return { thread };
    }
    if (method === 'thread/name/set') { threads.get(params.threadId).name = params.name; return {}; }
    if (['thread/read', 'thread/resume'].includes(method)) return { thread: threads.get(params.threadId), instructionSources: [] };
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    if (method === 'turn/start') return { turn: { id: 'turn-' + ++turn } };
    if (method === 'turn/steer') return { turnId: params.expectedTurnId };
    assert.fail('Unexpected native operation: ' + method);
  };
  rpc.respond = () => assert.fail('Handovers must not answer native requests.');
  const sdk = {
    listSessions: async () => [], getSessionInfo: async () => undefined, getSessionMessages: async () => [],
    query(params) { const stream = new Stream(); stream.params = params; queries.push(stream); return stream; }
  };
  const claude = new ClaudeSessions({ loadSdk: async () => sdk, executable: async () => '/synthetic/unused/claude', activeSessions: async () => [] });
  await claude.initialize();
  const handoverPath = join(directory, 'handoff.md');
  const workspace = new Workspace(rpc, { beads: null, claude, handoverTimeout, handoverPath: async () => handoverPath, handoverSkill: async provider => { skills.push(provider); return '/example/installed handoff/SKILL.md'; } });
  workspace.instructionContext = async agent => ({ task: { value: 'ccng-session:' + agent.id } });
  workspace.list = async (cursor, provider) => {
    state.pages.push({ cursor, provider });
    return { agents: state.catalog.filter(row => row.provider === provider), nextCursor: null };
  };
  let source;
  if (sourceProvider === 'claude') { source = claude.create(directory, 'Source project'); workspace.agents.set(source.id, source); }
  else {
    threads.set('source', { id: 'source', cwd: directory, name: 'Source project', status: { type: 'idle' }, canAcceptDirectInput: true, turns: [] });
    source = await workspace.open('source');
  }
  const sourceId = source.id;
  const waitFor = (predicate, timeout = 2000) => new Promise((resolve, reject) => {
    const check = () => { if (predicate()) { clearTimeout(timer); workspace.off('change', check); resolve(); } };
    const timer = setTimeout(() => { workspace.off('change', check); reject(new Error('Synthetic handover state did not arrive.')); }, timeout);
    workspace.on('change', check); check();
  });
  const start = data => workspace.createHandover(sourceId, { cwd: directory, ...data });
  const preparation = async () => { await waitFor(() => !!source.turnId || source.handoverCreation?.state === 'failed'); return source.turnId; };
  const finish = async ({ contents = '# Synthetic handover\nPreserve original work.\n', status = 'completed', turnId } = {}) => {
    const expected = turnId || await preparation();
    if (contents !== null) await writeFile(handoverPath, contents, { mode: 0o600 });
    if (sourceProvider === 'claude') {
      const stream = queries.find(query => query.params.options.sessionId === source.nativeSessionId);
      stream.push({ type: 'result', is_error: status !== 'completed' });
    } else {
      source.finishedTurn = { id: expected, status }; source.lastCompletedTurnId = expected;
      source.turnId = null; source.thread.status = { type: 'idle' }; workspace.changed();
    }
    await waitFor(() => ['started', 'failed'].includes(source.handoverCreation?.state));
    const job = workspace.handoverJobs.get(sourceId); if (job?.promise) await job.promise;
    return source.handoverCreation;
  };
  const allocations = () => calls.filter(call => call.method === 'thread/start');
  t.after(async () => {
    // Terminate only synthetic waiters; never leave a test's preparation timer alive.
    rpc.ready = false; workspace.changed(); await claude.shutdown();
    await workspace.handoverJobs?.get(sourceId)?.promise;
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, handoverPath, workspace, source, sourceId, calls, queries, skills, state, threads, waitFor, start, preparation, finish, allocations };
}

function catalogChat(f, name, { id = 'closed-version', provider = 'codex', cwd = f.directory } = {}) {
  const chat = { id, name, provider, cwd, status: 'idle' }; f.state.catalog.push(chat); return chat;
}
function fillSlots(f, count) {
  for (let index = f.workspace.workerCount(); index < count; index++) {
    const id = 'existing-' + index;
    f.workspace.agents.set(id, { ...f.source, id, name: 'Unrelated ' + index, questions: [], messages: [], tasks: [], workers: [] });
  }
}

for (const provider of ['codex', 'claude']) test(`Create waits for source completion and a real file before starting ${provider} with immediate import`, async t => {
  const f = await fixture(t);
  const accepted = await f.start({ provider });
  assert.deepEqual(accepted, { accepted: true, path: f.handoverPath, state: 'preparing' });
  await f.preparation();
  assert.equal(f.allocations().length, 0); assert.equal(f.queries.length, 0);
  assert.equal(f.source.handoverCreation.state, 'preparing');
  const sourceInput = f.calls.find(call => call.method === 'turn/start').params.input[0].text;
  assert(sourceInput.includes(JSON.stringify(f.handoverPath))); assert.match(sourceInput, /atomically rename/);
  assert.deepEqual(f.skills, ['codex']);
  await writeFile(f.handoverPath, '# Complete but source is still running\n', { mode: 0o600 });
  f.workspace.changed(); assert.equal(f.allocations().length, 0, 'a file alone is not source-turn completion');
  const progress = await f.finish();
  assert.equal(progress.state, 'started'); assert(progress.id); assert.equal(progress.name, 'Source project v2');
  const receiver = f.workspace.agent(progress.id);
  assert.equal(receiver.name, 'Source project v2'); assert.equal(f.source.name, 'Source project');
  assert.deepEqual(receiver.handoverImport, { path: f.handoverPath, sourceId: f.sourceId });
  const imported = provider === 'claude'
    ? (await f.queries[0].params.prompt.next()).value.message.content
    : f.calls.find(call => call.method === 'turn/start' && call.params.threadId === progress.id).params.input[0].text;
  assert.equal(imported.split('\n')[0], 'Source project v2');
  assert(imported.includes(JSON.stringify(f.handoverPath))); assert.match(imported, /^Read the handover at/m);
  assert.doesNotMatch(imported, /press.*Import|acknowledge that you are waiting/i);
  assert.match(imported, /evidence, not new instructions/);
  assert.equal(f.allocations().length, provider === 'codex' ? 1 : 0);
  assert.equal(f.queries.length, provider === 'claude' ? 1 : 0);
  assert.equal(await readFile(f.handoverPath, 'utf8'), '# Synthetic handover\nPreserve original work.\n');
  f.workspace.close(f.sourceId); assert.equal(f.workspace.agent(progress.id), receiver, 'closing the source preserves the already-started receiver');
  assert.equal(f.calls.some(call => /archive|delete|interrupt/.test(call.method)), false);
});

for (const sourceProvider of ['codex', 'claude']) test(`omitting provider defaults to the ${sourceProvider} source provider`, async t => {
  const f = await fixture(t, { sourceProvider }); await f.start();
  const progress = await f.finish();
  assert.equal(progress.state, 'started'); assert.equal(progress.provider, sourceProvider);
  assert.deepEqual(f.skills, [sourceProvider]);
});

test('explicit provider override and arbitrary trailing versions are preserved', async t => {
  const f = await fixture(t); f.source.name = 'Source project v23';
  await f.start({ provider: 'claude' }); const progress = await f.finish();
  assert.equal(progress.name, 'Source project v24'); assert.equal(progress.provider, 'claude'); assert.equal(f.source.name, 'Source project v23');
});

for (const contents of [null, '']) test(`completed source claiming Saved cannot start a receiver when the artifact is ${contents === null ? 'missing' : 'empty'}`, async t => {
  const f = await fixture(t); await f.start(); await f.preparation();
  f.source.messages.push({ id: 'saved-claim', type: 'assistant', text: 'Saved handoff.md, verified mode 600.' });
  const progress = await f.finish({ contents });
  assert.equal(progress.state, 'failed'); assert.match(progress.error, /file|handover|private|source/i);
  assert.equal(f.allocations().length, 0); assert.equal(f.queries.length, 0);
});

test('a terminal result from another source turn cannot release preparation', async t => {
  const f = await fixture(t); await f.start(); const turnId = await f.preparation();
  await writeFile(f.handoverPath, '# Synthetic complete artifact\n', { mode: 0o600 });
  f.source.finishedTurn = { id: 'different-turn', status: 'completed' }; f.workspace.changed();
  assert.equal(f.allocations().length, 0);
  // The matching native completion is the only successful continuation signal.
  assert.equal(f.source.handoverCreation.state, 'preparing');
  const progress = await f.finish({ turnId });
  assert.equal(progress.state, 'started'); assert.equal(f.allocations().length, 1);
});

for (const status of ['failed', 'interrupted']) test(`${status} source preparation never creates or retries a receiver`, async t => {
  const f = await fixture(t); await f.start(); const progress = await f.finish({ status });
  assert.equal(progress.state, 'failed'); assert.equal(f.allocations().length, 0); assert.equal(f.queries.length, 0);
  assert.equal(f.calls.filter(call => call.method === 'turn/start').length, 1);
});

test('source preparation timeout records failure without cancelling native work', async t => {
  const f = await fixture(t, { handoverTimeout: 20 }); await f.start();
  await f.waitFor(() => f.source.handoverCreation?.state === 'failed');
  assert.match(f.source.handoverCreation.error, /timed out|timeout/i); assert.equal(f.allocations().length, 0);
  assert.equal(f.calls.some(call => /interrupt|cancel|delete|archive/.test(call.method)), false);
});

test('disconnect and explicit stop invalidate preparation without cancelling the source', async t => {
  for (const cause of ['disconnect', 'stop']) {
    const f = await fixture(t); await f.start(); await f.preparation();
    if (cause === 'disconnect') { f.workspace.rpc.ready = false; f.workspace.rpc.emit('disconnected', 'Synthetic transport loss'); }
    else { f.source.requestStopIntent = 'new-user-stop'; f.workspace.changed(); }
    await f.waitFor(() => f.source.handoverCreation?.state === 'failed');
    assert.equal(f.allocations().length, 0); assert.equal(f.calls.some(call => /interrupt|cancel|archive|delete/.test(call.method)), false);
  }
});

test('pending callbacks remain pending until a human resolves them before exact completion', async t => {
  const f = await fixture(t); await f.start(); await f.preparation();
  const question = { id: 'human-decision', method: 'item/commandExecution/requestApproval', params: {} };
  f.source.questions.push(question); f.workspace.changed();
  assert.equal(f.allocations().length, 0); assert.equal(f.source.questions[0], question);
  f.source.questions = []; f.workspace.changed();
  const progress = await f.finish(); assert.equal(progress.state, 'started');
});

test('existing direct and asynchronous native questions block preparation without retiring them', async t => {
  const f = await fixture(t), question = { id: 'direct-question', method: 'item/commandExecution/requestApproval', params: {} };
  f.source.questions.push(question);
  await assert.rejects(f.start(), /question|request|answer/i); assert.equal(f.source.questions[0], question);
  f.source.questions = []; f.source.turnId = 'question-turn'; f.source.thread.status = { type: 'active' };
  f.workspace.rpc.emit('notification', { method: 'item/completed', params: { threadId: f.sourceId, turnId: 'question-turn', item: { id: 'human-choice', type: 'agentMessage', text: '', questions: [{ title: 'Which option?', options: null }] } } });
  await assert.rejects(f.start(), error => error.code === 'async_question_pending');
  const view = f.workspace.snapshot().agents.find(agent => agent.id === f.sourceId);
  assert.equal(view.messages.find(message => message.id === 'human-choice').nativeQuestions[0].answerState, 'available');
  assert.equal(f.calls.some(call => ['thread/start', 'turn/start', 'turn/steer', 'turn/interrupt'].includes(call.method)), false);
});

test('duplicate Create during preparation cannot send or allocate twice', async t => {
  const f = await fixture(t); await f.start(); await f.preparation();
  await assert.rejects(f.start(), /already|prepar|progress/i);
  assert.equal(f.calls.filter(call => ['turn/start', 'turn/steer'].includes(call.method)).length, 1);
  await f.finish(); assert.equal(f.allocations().length, 1);
});

test('closed native destination versions require explicit confirmation before any preparation', async t => {
  const f = await fixture(t); f.source.name = 'Source project v17';
  const existing = catalogChat(f, 'Source project v18', { provider: 'claude', id: 'closed-v18' });
  catalogChat(f, 'Source project v19', { id: 'closed-v19' });
  await assert.rejects(f.start(), error => {
    assert.equal(error.status, 409); assert.equal(error.code, 'handover_name_conflict');
    assert.deepEqual(error.handoverConflict, { existing: [{ id: existing.id, name: existing.name, provider: existing.provider }], nextName: 'Source project v20' }); return true;
  });
  assert.equal(f.calls.some(call => ['thread/start', 'turn/start', 'turn/steer'].includes(call.method)), false);
  await f.start({ confirmedName: 'Source project v20' }); const progress = await f.finish();
  assert.equal(progress.state, 'started'); assert.equal(progress.name, 'Source project v20');
});

test('versions in a different project do not conflict and arbitrary confirmation cannot rename chats', async t => {
  const f = await fixture(t); catalogChat(f, 'Source project v2', { cwd: '/different/project' });
  await assert.rejects(f.start({ confirmedName: 'Unapproved arbitrary name' }), /name|version|changed|confirm/i);
  assert.equal(f.calls.some(call => call.method === 'turn/start'), false);
  await f.start(); const progress = await f.finish(); assert.equal(progress.name, 'Source project v2');
});

test('a newly occupied destination at startup fails without silently incrementing or allocating', async t => {
  const f = await fixture(t); await f.start(); await f.preparation();
  catalogChat(f, 'Source project v2');
  const progress = await f.finish(); assert.equal(progress.state, 'failed'); assert.match(progress.error, /version|name|exist|changed/i);
  assert.equal(f.allocations().length, 0);
});

test('capacity checks preserve conflict discovery but prevent source work when no slot is free', async t => {
  const f = await fixture(t); fillSlots(f, limits.maxWorkers);
  catalogChat(f, 'Source project v2');
  await assert.rejects(f.start(), error => error.code === 'handover_name_conflict');
  f.state.catalog = [];
  await assert.rejects(f.start(), /close|worker|tab|slot/i);
  assert.equal(f.calls.some(call => ['thread/start', 'turn/start', 'turn/steer'].includes(call.method)), false);
});

for (const provider of ['codex', 'claude']) test(`the last worker slot can start an automatically importing ${provider} receiver`, async t => {
  const f = await fixture(t); fillSlots(f, limits.maxWorkers - 1);
  await f.start({ provider }); const progress = await f.finish();
  assert.equal(progress.state, 'started'); assert.equal(f.workspace.workerSlots(), limits.maxWorkers);
  assert.equal(f.calls.filter(call => ['turn/start', 'turn/steer'].includes(call.method) && call.params.threadId === f.sourceId).length, 1);
});

for (const fail of ['thread/start', 'thread/name/set']) test(`${fail} failure preserves uncertain or known receiver identity without retry`, async t => {
  const f = await fixture(t); await f.start(); await f.preparation(); f.state.fail = fail;
  const progress = await f.finish(); assert.equal(progress.state, 'failed'); assert.match(progress.error, /check|confirm|receiv/i);
  assert.equal(f.allocations().length, 1);
  if (fail === 'thread/name/set') { assert(progress.id); assert(f.workspace.handoverImports.has(progress.id)); }
  assert.equal(f.calls.some(call => /delete|archive|interrupt/.test(call.method)), false);
});

test('source delivery uncertainty is recorded once without starting a receiver', async t => {
  const f = await fixture(t); f.state.fail = 'turn/start'; await f.start();
  await f.waitFor(() => f.source.handoverCreation?.state === 'failed');
  assert.equal(f.allocations().length, 0); assert.equal(f.calls.filter(call => call.method === 'turn/start').length, 1);
});

test('installed handoff skill links are reused and unavailable skills fail before source input', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-handover-skill-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'skill-source'); await mkdir(source); await writeFile(join(source, 'SKILL.md'), '# Synthetic skill\n');
  for (const [provider, config] of [['codex', '.agents'], ['claude', '.claude']]) {
    const skills = join(directory, config, 'skills'); await mkdir(skills, { recursive: true }); await symlink(source, join(skills, 'handoff'));
    assert.equal(await resolveHandoverSkill(provider, { home: directory }), join(skills, 'handoff', 'SKILL.md'));
  }
  await rm(join(source, 'SKILL.md')); await assert.rejects(resolveHandoverSkill('codex', { home: directory }), /unavailable/i);
});


test('invalid destination choices and unavailable source input fail before source preparation', async t => {
  const f = await fixture(t);
  for (const data of [{ provider: 'unknown' }, { cwd: 'relative/project' }, { cwd: '/nonexistent/synthetic/handover-project' }]) {
    await assert.rejects(f.start(data), error => error.status === 400);
  }
  f.source.canSend = false;
  await assert.rejects(f.start(), /input|unavailable|request/i);
  assert.equal(f.calls.some(call => ['turn/start', 'thread/start'].includes(call.method)), false);
});

test('source identity and close controls preserve the exact pending preparation', async t => {
  const f = await fixture(t); await f.start(); await f.preparation();
  assert.throws(() => f.workspace.close(f.sourceId), /handover|prepar/i);
  assert.equal(f.workspace.agent(f.sourceId), f.source);
  f.workspace.agents.set(f.sourceId, { ...f.source }); f.workspace.changed();
  await f.waitFor(() => f.source.handoverCreation?.state === 'failed');
  assert.equal(f.allocations().length, 0);
  assert.equal(f.calls.some(call => /interrupt|cancel|archive|delete/.test(call.method)), false);
});

test('incomplete catalog pagination refuses to assume a destination version is unused', async t => {
  const f = await fixture(t);
  let pages = 0;
  f.workspace.list = async () => ({ agents: [], nextCursor: String(++pages) });
  await assert.rejects(f.start(), /completely|version|check/i);
  assert.equal(pages, 100); assert.equal(f.calls.some(call => ['turn/start', 'thread/start'].includes(call.method)), false);
});


test('concurrent sources reserve one project/version without preparing two handovers', async t => {
  const f = await fixture(t);
  f.threads.set('second-source', { ...f.source.thread, id: 'second-source', name: f.source.name, turns: [] });
  const second = await f.workspace.open('second-source');
  const results = await Promise.allSettled([
    f.start(), f.workspace.createHandover(second.id, { cwd: f.directory })
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.match(rejected.reason.message, /prepar|version|reserv|already/i);
  const record = [...f.workspace.handoverJobs.values()][0];
  assert(record); assert.equal(f.calls.filter(call => call.method === 'turn/start').length, 1);
  const owner = f.workspace.agents.get([...f.workspace.handoverJobs.keys()][0]);
  await writeFile(f.handoverPath, '# Synthetic handover\n', { mode: 0o600 });
  await f.waitFor(() => !!owner.turnId);
  owner.finishedTurn = { id: owner.turnId, status: 'completed' }; owner.lastCompletedTurnId = owner.turnId;
  owner.turnId = null; owner.thread.status = { type: 'idle' }; f.workspace.changed();
  await record.promise;
  assert.equal(owner.handoverCreation.state, 'started'); assert.equal(f.allocations().length, 1);
});

test('an interrupt while source input acknowledgement is pending cannot become the accepted stop baseline', async t => {
  const f = await fixture(t);
  const send = f.workspace.send.bind(f.workspace);
  let entered, release;
  const sending = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  f.workspace.send = async (id, ...args) => {
    if (id !== f.sourceId) return send(id, ...args);
    const receipt = await send(id, ...args); entered(); await gate; return receipt;
  };
  await f.start(); await sending;
  f.source.requestStopIntent = 'new-stop-during-receipt'; f.workspace.changed(); release();
  await f.waitFor(() => f.source.handoverCreation?.state === 'failed');
  assert.equal(f.allocations().length, 0); assert.match(f.source.handoverCreation.error, /stop|changed/i);
  assert.equal(f.calls.some(call => /interrupt|cancel|delete|archive/.test(call.method)), false);
});

for (const provider of ['codex', 'claude']) test(`a source question arriving after ${provider} allocation preserves its identity and blocks first import input`, async t => {
  const f = await fixture(t); await f.start({ provider }); await f.preparation();
  const question = { id: 'late-source-decision', method: 'item/commandExecution/requestApproval', params: {} };
  const refresh = f.workspace.refreshTasks.bind(f.workspace);
  f.workspace.refreshTasks = async id => {
    await refresh(id);
    if (id !== f.sourceId && !f.source.questions.includes(question)) f.source.questions.push(question);
  };
  const progress = await f.finish();
  assert.equal(progress.state, 'failed'); assert(progress.id, 'a known receiver identity must remain recoverable');
  assert.equal(f.source.questions[0], question);
  assert.equal(f.calls.filter(call => ['turn/start', 'turn/steer'].includes(call.method) && call.params.threadId === progress.id).length, 0);
  assert.equal(f.queries.length, 0, 'an allocated Claude record must not start its SDK query after the late question');
  assert(f.workspace.handoverImports.has(progress.id));
  assert.equal(f.calls.some(call => /archive|delete|interrupt/.test(call.method)), false);
});
