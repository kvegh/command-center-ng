import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workspace } from '../server/workspace.mjs';
import { BeadsTasks } from '../server/beads.mjs';
import limits from '../server/limits.json' with { type: 'json' };

const id = 'mistral-native-session';
function agent(overrides = {}) {
  return { id, nativeSessionId: 'native-session', provider: 'mistral', role: 'worker', name: 'Example project', goal: 'Example project', cwd: tmpdir(), parentId: null, canSend: true, canBranch: false, observingOnly: false, thread: { id, status: { type: 'idle' } }, messages: [], tasks: [], workers: [], questions: [], turnId: null, reportIntervalMinutes: 0, ...overrides };
}
function fixture(options = {}) {
  const calls = [], taskReads = [], rpcCalls = [];
  const rpc = new EventEmitter(); rpc.ready = false;
  rpc.call = async (...args) => { rpcCalls.push(args); assert.fail('A Mistral session must never reach Codex RPC.'); };
  rpc.respond = (...args) => { rpcCalls.push(args); assert.fail('A Mistral answer must never reach Codex RPC.'); };
  const runtime = new EventEmitter(); runtime.available = true; runtime.error = null; runtime.records = new Map();
  for (const name of ['list', 'open', 'create', 'send', 'refresh', 'interrupt', 'modelSettings', 'updateModel', 'answer']) runtime[name] = async (...args) => {
    calls.push([name, ...args]);
    if (name === 'list') return { agents: [...runtime.records.values()], nextCursor: null };
    if (name === 'open') { if (!runtime.records.has(args[0])) throw Object.assign(new Error('Invalid Mistral session.'), { status: 400 }); return runtime.records.get(args[0]); }
    if (name === 'create') { const row = agent({ cwd: args[0], goal: args[1] }); runtime.records.set(row.id, row); return row; }
    if (name === 'send') return { turnId: 'native-turn', messageId: 'native-message' };
    if (name === 'modelSettings') return { models: [], model: null, effort: null };
    return { accepted: true };
  };
  const beads = { context: BeadsTasks.prototype.context, linked: async (cwd, threadId) => { taskReads.push([cwd, threadId]); return { status: 'ready', label: 'ccng-session:' + threadId, tasks: [] }; } };
  const workspace = new Workspace(rpc, { mistral: runtime, beads, ...options });
  function add(overrides) { const row = agent(overrides); runtime.records.set(row.id, row); return row; }
  return { workspace, runtime, rpc, calls, taskReads, rpcCalls, add };
}

test('Mistral lifecycle, history and model operations remain on the local native runtime', async () => {
  const f = fixture(); const row = f.add();
  assert.deepEqual((await f.workspace.list(undefined, 'mistral')).agents, [row]);
  assert.equal(await f.workspace.open(id), row);
  await f.workspace.activate(id, { force: true });
  await f.workspace.history(id);
  await f.workspace.refreshObserved(id);
  assert.deepEqual(await f.workspace.recoverRequests(id), { requests: 0 });
  await f.workspace.modelSettings(id);
  await f.workspace.updateModel(id, { model: 'native-choice' });
  await f.workspace.interrupt(id);
  assert.deepEqual(f.calls.map(call => call[0]), ['list', 'open', 'refresh', 'refresh', 'refresh', 'modelSettings', 'updateModel', 'interrupt']);
  assert.deepEqual(f.taskReads, [[row.cwd, id]]);
  assert.deepEqual(f.rpcCalls, []);
  await assert.rejects(f.workspace.history(id, 'unsupported-cursor'), { status: 400 });
  await assert.rejects(f.workspace.permissionSettings(id), /local Claude worker/);
  await assert.rejects(f.workspace.updatePermissionMode(id, { mode: 'auto' }), /local Claude worker/);
});

test('async native creation reserves capacity and imports shared, task and report instructions before the first prompt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccng-mistral-workspace-'));
  try {
    const sharedInstructionsFile = join(dir, 'AGENTS.md');
    await writeFile(sharedInstructionsFile, 'Use the selected shared environment rules.\n');
    const f = fixture({ sharedInstructionsFile });
    let finishCreate, started = false, created = false, beforeInput = false;
    f.runtime.create = (...args) => { f.calls.push(['create', ...args]); return new Promise(resolve => { finishCreate = resolve; }); };
    const creation = f.workspace.create({ provider: 'mistral', goal: 'Inspect example', cwd: dir }, {
      onStarting: () => { started = true; }, onCreated: value => { assert.equal(value, id); created = true; },
      beforeInput: () => { assert.equal(f.workspace.agent(id).tracker.label, 'ccng-session:' + id); beforeInput = true; }
    });
    for (let n = 0; n < 30 && !finishCreate; n++) await new Promise(resolve => setImmediate(resolve));
    assert.ok(started); assert.ok(finishCreate); assert.equal(created, false);
    assert.equal(f.workspace.creating, 1); assert.equal(f.workspace.workerSlots(), 1);
    assert.equal(f.workspace.agents.has(id), false);
    finishCreate(agent({ cwd: dir }));
    assert.equal(await creation, id); assert.ok(created); assert.ok(beforeInput);
    assert.equal(f.workspace.creating, 0); assert.equal(f.workspace.workerSlots(), 1);
    const send = f.calls.find(call => call[0] === 'send');
    assert.equal(send[2], 'Inspect example');
    assert.match(send[3].instructions, /Use the selected shared environment rules/);
    assert.match(send[3].instructions, /ccng-session:mistral-native-session/);
    assert.match(send[3].instructions, /Task \| Status \| Outcome/);
    assert.equal(send[3].stillOpen(), true);
    assert.deepEqual(f.rpcCalls, []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('failed Mistral creation releases its reservation without allocating a Codex session', async () => {
  const f = fixture();
  f.runtime.create = async () => { throw new Error('Native ACP session creation failed.'); };
  await assert.rejects(f.workspace.create({ provider: 'mistral', goal: 'Inspect example', cwd: tmpdir() }), /Native ACP/);
  assert.equal(f.workspace.creating, 0); assert.equal(f.workspace.agents.size, 0); assert.deepEqual(f.rpcCalls, []);
  for (let n = 0; n < limits.maxWorkers; n++) f.workspace.agents.set('tab-' + n, agent({ id: 'tab-' + n }));
  await assert.rejects(f.workspace.create({ provider: 'mistral', goal: 'Inspect example', cwd: tmpdir() }), { status: 409 });
});

test('restored external Mistral sessions stay metadata-only through activation, refresh, reports and chat input', async () => {
  const f = fixture(); const row = f.add({ canSend: false, observingOnly: true, externalSession: true, thread: { id, status: { type: 'notLoaded' } }, managementNotice: 'Native session takeover is unavailable.' });
  await f.workspace.open(id); await f.workspace.activate(id, { force: true }); await f.workspace.refreshObserved(id); await f.workspace.history(id);
  for (const options of [{}, { report: true }, { reportSetting: true }]) await assert.rejects(f.workspace.send(id, 'Continue', options), /takeover is unavailable/);
  assert.equal(row.canSend, false); assert.equal(row.observingOnly, true);
  assert.deepEqual(f.calls.map(call => call[0]), ['open', 'refresh', 'refresh']);
  assert.equal(f.workspace.snapshot().agents[0].ownStatus, 'offline'); assert.deepEqual(f.rpcCalls, []);
});

test('native approvals retain exact Mistral request identity and manual-only Coordinator controls', async () => {
  const f = fixture(); const row = f.add(); await f.workspace.open(id);
  const question = { id: 'permission-request', method: 'mistral/session/request_permission', reviewToken: 'exact-current-token', params: { threadId: id, options: [{ optionId: 'allow-once', kind: 'allow_once' }] } };
  row.questions.push(question);
  assert.deepEqual(f.workspace.snapshot().agents[0].questions[0].reviewCapability.decisions, []);
  for (const answer of [{ optionId: 'allow-once' }, { optionId: 'allow-once', reviewToken: 'stale-token' }]) assert.throws(() => f.workspace.answer(id, question.id, answer), { status: 409 });
  assert.throws(() => f.workspace.answer(id, 'other-request', { reviewToken: question.reviewToken }), { status: 409 });
  const answer = { requestId: question.id, optionId: 'allow-once', reviewToken: question.reviewToken };
  await f.workspace.answer(id, question.id, answer);
  const sent = f.calls.find(call => call[0] === 'answer');
  assert.equal(sent[1], row); assert.equal(sent[2], question.id); assert.equal(sent[3], answer);
  delete question.reviewToken;
  assert.throws(() => f.workspace.answer(id, question.id, {}), { status: 409 });
  assert.deepEqual(f.rpcCalls, []);
});

test('Codex disconnects, notifications and legacy callback aliases cannot clear or acquire Mistral requests', async () => {
  const f = fixture(); const row = f.add(); await f.workspace.open(id);
  const question = { id: 'permission-request', reviewToken: 'native-token', params: { threadId: id } };
  row.questions.push(question); row.messages.push({ id: 'native-message', text: 'Keep this native history.', state: 'completed' });
  const before = structuredClone(row);
  for (const method of ['thread/reverted', 'serverRequest/resolved', 'turn/completed', 'thread/status/changed', 'item/started']) f.rpc.emit('notification', { method, params: { threadId: id, requestId: question.id, status: { type: 'systemError' } } });
  f.rpc.emit('request', { id: 'foreign-callback', method: 'execCommandApproval', params: { conversationId: id, command: 'example' } });
  f.rpc.emit('disconnected', 'Codex transport disconnected.');
  assert.deepEqual(row, before); assert.equal(f.workspace.pending.size, 0); assert.deepEqual(f.rpcCalls, []);
  f.workspace.close(id);
  assert.deepEqual(f.workspace.backgroundRequests(), { backgroundQuestions: 1, backgroundWorkers: [{ id, name: row.name, provider: 'mistral', questionCount: 1 }] });
});

test('Mistral cannot enter Codex branch, lineage, coordinator or silent-control flows', async () => {
  const f = fixture(); const row = f.add({ parentId: 'native-parent' }); await f.workspace.open(id);
  for (const operation of [() => f.workspace.fork(id), () => f.workspace.parent(id), () => f.workspace.summarize(id)]) await assert.rejects(operation(), { status: 409 });
  assert.throws(() => f.workspace.startHandoff(id), { status: 409 });
  await assert.rejects(f.workspace.send(id, 'Internal task check', { taskPing: true }), /only for Codex/);
  assert.equal(f.workspace.childRequestContext(row, { id: 'codex-child' }), null);
  const codex = agent({ id: 'codex-parent', provider: 'codex' });
  assert.equal(f.workspace.childRequestContext(codex, { id }), null);
  await f.workspace.readWorker(codex, id);
  const other = fixture(); other.add(); other.workspace.coordinator = { id };
  await assert.rejects(other.workspace.open(id), /Coordinator must use the Codex/);
  assert.deepEqual(f.rpcCalls, []); assert.deepEqual(other.rpcCalls, []);
});

test('Mistral availability, malformed identifiers and handover catalog never fall back to Codex', async () => {
  const f = fixture(); f.add();
  const catalog = await f.workspace.handoverCatalog(tmpdir());
  assert.equal(catalog.find(row => row.id === id).provider, 'mistral');
  await assert.rejects(f.workspace.open('mistral-invalid/session'), { status: 400 });
  f.runtime.available = false; f.runtime.error = 'The local Vibe executable is unavailable.';
  assert.equal(f.workspace.readyFor(id), false); assert.equal(f.workspace.readyFor({ provider: 'mistral' }), false);
  const view = f.workspace.snapshot(); assert.equal(view.mistralAvailable, false); assert.equal(view.mistralError, f.runtime.error); assert.deepEqual(view.mistral, { available: false, error: f.runtime.error });
  const disconnected = fixture({ mistral: null }); disconnected.rpc.ready = true;
  await assert.rejects(disconnected.workspace.open(id), { status: 503 });
  await assert.rejects(disconnected.workspace.list(undefined, 'mistral'), { status: 503 });
  assert.equal(disconnected.workspace.readyFor({ provider: 'mistral' }), false);
  assert.deepEqual(f.rpcCalls, []); assert.deepEqual(disconnected.rpcCalls, []);
});

test('Mistral source handover waits for its exact completion and links existing tasks before the Mistral receiver prompt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-mistral-handover-'));
  try {
    const path = join(directory, 'handoff.md'), calls = [], linked = new Set();
    const f = fixture({ handoverPath: async () => path, handoverSkill: async provider => { assert.equal(provider, 'mistral'); return '/example/handoff/SKILL.md'; }, handoverTimeout: 1000 });
    f.workspace.beads.list = async () => [{ id: 'existing-task', state: 'blocked' }];
    f.workspace.beads.handoff = async (cwd, source, target) => { calls.push('link'); assert.equal(cwd, directory); assert.equal(source, id); linked.add(target); };
    f.workspace.beads.linked = async (_cwd, threadId) => ({ status: 'ready', label: 'ccng-session:' + threadId, tasks: linked.has(threadId) ? [{ id: 'existing-task', text: 'Existing blocked work', state: 'blocked' }] : [] });
    const source = f.add({ cwd: directory, name: 'Example project v1' }); await f.workspace.open(id);
    const receiverId = 'mistral-receiver';
    f.runtime.create = async (cwd, goal) => { calls.push('create'); const row = agent({ id: receiverId, nativeSessionId: 'receiver', cwd, goal }); f.runtime.records.set(receiverId, row); return row; };
    f.runtime.send = async (row, text, options) => {
      if (row === source) {
        calls.push('prepare'); assert.match(text, /Create a handover/);
        row.turnId = 'source-preparation'; row.thread.status = { type: 'active' };
        return { turnId: row.turnId, messageId: 'source-input' };
      }
      calls.push('import'); assert.ok(linked.has(receiverId)); assert.match(text, /Read the handover/);
      assert.match(options.instructions, /ccng-session:mistral-receiver/);
      assert.equal(row.tracker.tasks[0].state, 'blocked');
      return { turnId: 'receiver-input', messageId: 'receiver-message' };
    };
    await f.workspace.createHandover(id);
    const job = f.workspace.handoverJobs.get(id).promise;
    for (let n = 0; n < 30 && !source.turnId; n++) await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['prepare']);
    await writeFile(path, 'Synthetic source handover.', { mode: 0o600 });
    source.turnId = null; source.thread.status = { type: 'idle' }; source.finishedTurn = { id: 'source-preparation', status: 'completed' };
    f.runtime.emit('change', id); await job;
    assert.deepEqual(calls, ['prepare', 'create', 'link', 'import']);
    assert.equal(source.handoverCreation.state, 'started');
    assert.deepEqual(f.workspace.agent(receiverId).handoverImport, { path, sourceId: id });
    assert.equal(f.workspace.agent(id), source); assert.deepEqual(f.rpcCalls, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Mistral native completion updates tasks and existing report delivery bookkeeping without a Codex turn', async () => {
  const f = fixture(); f.add(); await f.workspace.open(id);
  const reports = [], events = [];
  f.workspace.coordinator = { flush: async threadId => { events.push(['flush', threadId]); }, completed: threadId => { events.push(['completed', threadId]); }, mark: () => {}, reportMessageCompleted: (threadId, message) => { reports.push([threadId, message]); } };
  const message = { id: 'completed-report', type: 'assistant', turnId: 'native-turn', state: 'completed', text: 'A report result.' };
  f.runtime.emit('change', id); f.runtime.emit('assistantMessageCompleted', id, message); f.runtime.emit('completed', id);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, [['flush', id], ['completed', id]]);
  assert.deepEqual(reports, [[id, message]]); assert.equal(f.taskReads.length, 2); assert.deepEqual(f.rpcCalls, []);
});
