import limits from '../server/limits.json' with { type: 'json' };
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, writeFile, chmod, stat, symlink, readlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkspaceStore, WorkspacePersistence, emptyWorkspace } from '../server/workspace-store.mjs';
import { Workspace } from '../server/workspace.mjs';

const record = (workerIds = ['one'], coordinatorId = null, coordinatorPaused = false) => ({ version: 1, workerIds, coordinatorId, coordinatorPaused });
async function fixture() { const dir = await mkdtemp(join(tmpdir(), 'ccng-workspace-')); return { dir, store: new WorkspaceStore(join(dir, 'config', 'workspace.json')), close: () => rm(dir, { recursive: true, force: true }) }; }
class Rpc extends EventEmitter {
  constructor(cwd) { super(); this.ready = true; this.calls = []; this.cwd = cwd; this.missing = new Set(); this.threads = new Map(); }
  async call(method, params) {
    this.calls.push({ method, params });
    if (method === 'thread/read' || method === 'thread/resume') {
      if (this.missing.has(params.threadId)) throw new Error('Conversation temporarily unavailable');
      return { thread: this.threads.get(params.threadId) || { id: params.threadId, name: params.threadId === 'coordinator' ? 'Command Center coordinator' : params.threadId, cwd: this.cwd, status: { type: 'notLoaded' }, canAcceptDirectInput: true, turns: [], model: 'saved-model' }, instructionSources: [], sandbox: { type: 'readOnly' } };
    }
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    if (method === 'config/read') return { config: { mcp_servers: {} } };
    if (method === 'turn/start') return { turn: { id: 'new-turn' } };
    throw new Error('Unexpected native mutation: ' + method);
  }
  respond() { throw new Error('Restoration must not answer approvals'); }
}
async function restored(saved, { dashboard = false } = {}) {
  const f = await fixture(); await f.store.save(saved); const rpc = new Rpc(f.dir);
  const workspace = new Workspace(rpc, { beads: null, coordinator: { debounceMs: 1000000 } });
  const startupSnapshots = [];
  // State-only cases isolate orchestration; the final integration case enables it.
  if (!dashboard) workspace.coordinator.refreshStartupDashboard = () => {
    startupSnapshots.push({ restoring: workspace.restoring, status: workspace.restoration.status,
      workers: workspace.coordinator.list().map(worker => ({ id: worker.id, interval: worker.reportIntervalMinutes })) });
  };
  const persistence = new WorkspacePersistence(workspace, f.store); await persistence.initialize(); await persistence.restore(); await persistence.queue;
  return { ...f, rpc, workspace, persistence, startupSnapshots, close: async () => { workspace.coordinator.stop(); await persistence.close(); await f.close(); } };
}

test('workspace writes are private, atomic and contain only selected metadata', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.store.load(), emptyWorkspace());
    await Promise.all(Array.from({ length: 8 }, (_, i) => f.store.save({ ...record(['worker-' + i]), password: 'synthetic-not-to-save', approvalAnswers: ['not-to-save'] })));
    assert.deepEqual(await f.store.load(), record(['worker-7']));
    assert.equal((await stat(f.store.file)).mode & 0o777, 0o600);
    assert.equal((await stat(join(f.dir, 'config'))).mode & 0o777, 0o700);
    const data = await readFile(f.store.file, 'utf8'); assert.ok(!data.includes('not-to-save'));
    assert.deepEqual(Object.keys(JSON.parse(data)).sort(), ['coordinatorId', 'coordinatorPaused', 'version', 'workerIds']);
  } finally { await f.close(); }
});

test('invalid, unsafe and linked workspace files are rejected without overwrite', async () => {
  const f = await fixture();
  try {
    await f.store.save(record()); await chmod(f.store.file, 0o644);
    await assert.rejects(f.store.load(), /private file/); await assert.rejects(f.store.save(record(['two'])), /private file/);
    await chmod(f.store.file, 0o600); await writeFile(f.store.file, '{invalid synthetic-marker');
    await assert.rejects(f.store.load(), error => error.message === 'Saved workspace contains invalid JSON.');
    await assert.rejects(f.store.save(record(['two'])), /invalid JSON/);
    assert.equal(await readFile(f.store.file, 'utf8'), '{invalid synthetic-marker');
    await rm(f.store.file); const target = join(f.dir, 'original.json'); await writeFile(target, JSON.stringify(record()), { mode: 0o600 }); await symlink(target, f.store.file);
    await assert.rejects(f.store.load(), error => error.code === 'ELOOP');
    await assert.rejects(f.store.save(record(['two'])), error => error.code === 'ELOOP'); assert.equal(await readlink(f.store.file), target);
  } finally { await f.close(); }
});

test('workspace metadata rejects invalid IDs and more than sixteen workers', async () => {
  const f = await fixture();
  try {
    for (const value of [record(['../invalid']), record(['one', 'one']), record(Array.from({ length: limits.maxWorkers + 1 }, (_, i) => 'worker-' + i)), record(['one'], 'one'), { ...record(), coordinatorPaused: 'yes' }]) {
      assert.throws(() => f.store.save(value), /Invalid saved workspace/);
    }
  } finally { await f.close(); }
});

test('startup restores sixteen workers and the same paused coordinator with read-only native calls', async () => {
  const ids = Array.from({ length: limits.maxWorkers }, (_, i) => 'worker-' + i);
  const f = await restored(record(ids, 'coordinator', true));
  try {
    assert.equal(f.workspace.workerCount(), limits.maxWorkers); assert.equal(f.workspace.agents.size, limits.maxWorkers + 1);
    assert.equal(f.workspace.coordinator.id, 'coordinator'); assert.equal(f.workspace.coordinator.paused, true);
    assert.equal(f.workspace.restoration.status, 'ready');
    assert.ok(f.rpc.calls.every(call => ['thread/read', 'thread/turns/list'].includes(call.method)));
    assert.ok(f.workspace.snapshot().agents.every(agent => agent.observingOnly && agent.status === 'idle'));
    assert.deepEqual(await f.store.load(), record(ids, 'coordinator', true));
  } finally { await f.close(); }
});

test('restoration refuses swapped worker/coordinator roles without changing native conversations', async () => {
  const f = await fixture(); const saved = record(['one', 'old-coordinator'], 'wrong-coordinator', true);
  await f.store.save(saved); const rpc = new Rpc(f.dir);
  rpc.threads.set('old-coordinator', { id: 'old-coordinator', name: 'Command Center coordinator', cwd: f.dir });
  const workspace = new Workspace(rpc, { beads: null, coordinator: true });
  workspace.coordinator.refreshStartupDashboard = () => {};
  const persistence = new WorkspacePersistence(workspace, f.store);
  try {
    await persistence.initialize(); await persistence.restore(); await persistence.queue;
    assert.deepEqual([...workspace.agents.keys()], ['one']);
    assert.equal(workspace.restoration.warnings.length, 2);
    assert.match(workspace.coordinator.error, /coordinator/i);
    assert.ok(rpc.calls.every(call => ['thread/read', 'thread/turns/list'].includes(call.method)));
    assert.deepEqual(await f.store.load(), saved, 'invalid saved roles stay available for explicit recovery');
  } finally { workspace.coordinator.stop(); await persistence.close(); await f.close(); }
});

test('sending after restore explicitly resumes the worker without permission/model overrides', async () => {
  const f = await restored(record(['one']));
  try {
    await f.workspace.send('one', 'Continue the authorized task.');
    const resume = f.rpc.calls.find(call => call.method === 'thread/resume');
    assert.deepEqual(resume.params, { threadId: 'one', excludeTurns: true });
    assert.equal(f.rpc.calls.filter(call => call.method === 'turn/start').length, 1);
    assert.equal(f.workspace.agent('one').observingOnly, false);
  } finally { await f.close(); }
});

test('coordinator activation reapplies restrictions and reuses its saved history', async () => {
  const f = await restored(record(['one'], 'coordinator', true));
  try {
    await f.workspace.send('coordinator', 'Summarize the existing context only.');
    const resume = f.rpc.calls.find(call => call.method === 'thread/resume');
    assert.equal(resume.params.threadId, 'coordinator'); assert.equal(resume.params.sandbox, 'read-only');
    assert.equal(resume.params.config['features.shell_tool'], false);
    assert.equal(resume.params.model, undefined); assert.equal(f.rpc.calls.some(call => call.method === 'thread/start'), false);
    assert.equal(f.workspace.coordinator.paused, true);
  } finally { await f.close(); }
});

test('one unavailable conversation does not prevent restoration and can be retried', async () => {
  const f = await fixture(); await f.store.save(record(['one', 'two'])); const rpc = new Rpc(f.dir); rpc.missing.add('two');
  const workspace = new Workspace(rpc, { beads: null }); const persistence = new WorkspacePersistence(workspace, f.store);
  try {
    await persistence.initialize(); await persistence.restore(); await persistence.queue;
    assert.equal(workspace.agents.size, 1); assert.equal(workspace.restoration.warnings.length, 1);
    assert.deepEqual((await f.store.load()).workerIds, ['one', 'two']);
    rpc.missing.clear(); await persistence.retry(); assert.equal(workspace.agents.size, 2);
    workspace.close('one'); await persistence.queue; assert.deepEqual((await f.store.load()).workerIds, ['two']);
  } finally { await persistence.close(); await f.close(); }
});

test('disconnected startup retains saved IDs until native connection is available', async () => {
  const f = await fixture(); await f.store.save(record(['one'])); const rpc = new Rpc(f.dir); rpc.ready = false;
  const workspace = new Workspace(rpc, { beads: null }); const persistence = new WorkspacePersistence(workspace, f.store);
  try {
    await persistence.initialize(); await persistence.restore();
    assert.equal(workspace.agents.size, 0); assert.deepEqual((await f.store.load()).workerIds, ['one']);
    rpc.ready = true; rpc.emit('connected'); await persistence.restore(); assert.ok(workspace.agents.has('one'));
  } finally { await persistence.close(); await f.close(); }
});

test('an unavailable saved coordinator is retried by ID without creating a replacement', async () => {
  const f = await fixture(); await f.store.save(record(['one'], 'coordinator', true)); const rpc = new Rpc(f.dir); rpc.missing.add('coordinator');
  const workspace = new Workspace(rpc, { beads: null, coordinator: true }); workspace.coordinator.refreshStartupDashboard = () => {}; const persistence = new WorkspacePersistence(workspace, f.store);
  try {
    await persistence.initialize(); await persistence.restore(); await persistence.queue;
    assert.equal(workspace.workerCount(), 1); assert.equal(workspace.coordinator.id, 'coordinator');
    await assert.rejects(workspace.coordinator.ensure(), /unavailable/);
    assert.equal(rpc.calls.some(call => call.method === 'thread/start'), false);
    rpc.missing.clear(); await persistence.retry();
    assert.equal(workspace.agent('coordinator').role, 'coordinator'); assert.equal(workspace.coordinator.paused, true);
    assert.ok(rpc.calls.every(call => ['thread/read', 'thread/turns/list'].includes(call.method)));
  } finally { workspace.coordinator.stop(); await persistence.close(); await f.close(); }
});


test('saved report intervals arm silently after restoration and stay queued while the coordinator is paused', async () => {
  const saved = { ...record(['one', 'two'], 'coordinator', true), workerReportIntervals: { one: 5, two: 60 } };
  const f = await restored(saved);
  try {
    assert.deepEqual(await f.store.load(), saved);
    assert.equal(f.workspace.agent('one').reportIntervalMinutes, 5); assert.equal(f.workspace.agent('two').reportIntervalMinutes, 60);
    assert.equal('nextReportAt' in f.workspace.agent('one'), false);
    assert.equal(f.workspace.coordinator.deliveries.size, 2);
    assert.ok([...f.workspace.coordinator.deliveries.values()].every(rows => rows.length === 1 && rows[0].scheduledReport));
    assert.equal(f.workspace.coordinator.reportSchedules.size, 2);
    assert.ok(f.rpc.calls.every(call => ['thread/read', 'thread/turns/list'].includes(call.method)));
    const restoredInstructions = (await f.workspace.instructionContext(f.workspace.agent('one')))['command-center-worker-instructions'].value;
    assert.match(restoredInstructions, /Current saved Standard Task Report interval: 5 minutes/);
    assert.match(restoredInstructions, /Command Center owns this timer/);
    f.workspace.coordinator.setReportInterval('one', 15); await f.persistence.queue;
    assert.deepEqual((await f.store.load()).workerReportIntervals, { one: 15, two: 60 });
    assert.match((await f.workspace.instructionContext(f.workspace.agent('one')))['command-center-worker-instructions'].value, /Current saved Standard Task Report interval: 15 minutes/);
    f.workspace.coordinator.setReportInterval('one', 0);
    assert.match((await f.workspace.instructionContext(f.workspace.agent('one')))['command-center-worker-instructions'].value, /Current saved Standard Task Report interval: Never/);
    assert.deepEqual([...f.workspace.coordinator.deliveries.keys()], ['two'], 'changing/canceling one schedule leaves the other startup report queued');
    assert.ok(f.rpc.calls.every(call => ['thread/read', 'thread/turns/list'].includes(call.method)), 'reading restored timing does not wake the native session');
    f.workspace.coordinator.setReportInterval('one', 15);
    f.workspace.close('two'); await f.persistence.queue;
    assert.deepEqual((await f.store.load()).workerReportIntervals, { one: 15 });
  } finally { await f.close(); }
});

test('saved reporting rejects unsupported intervals, unknown workers and prototype-shaped data', async () => {
  const f = await fixture();
  try {
    for (const intervals of [{ one: 1 }, { one: '5' }, { absent: 5 }, [], null, JSON.parse('{"__proto__":5}')]) assert.throws(() => f.store.save({ ...record(), workerReportIntervals: intervals }), /report settings/);
  } finally { await f.close(); }
});


test('startup triggers one silent report for each enabled saved worker without coordinator LLM turns or restore duplicates', async () => {
  const saved = { ...record(['one', 'two', 'never']), workerReportIntervals: { one: 5, two: 15 } };
  const f = await restored(saved);
  try {
    const waitUntil = Date.now() + 2000;
    while (f.workspace.coordinator.workers().some(agent => agent.coordinatorSending) && Date.now() < waitUntil) await new Promise(resolve => setTimeout(resolve, 5));
    const reports = f.rpc.calls.filter(call => call.method === 'turn/start');
    assert.deepEqual(reports.map(call => call.params.threadId).sort(), ['one', 'two']);
    assert.ok(reports.every(call => /^ccng-report-/.test(call.params.clientUserMessageId)));
    assert.ok(reports.every(call => /Standard Task Report, once/.test(call.params.input[0].text)));
    assert.equal(f.rpc.calls.some(call => call.method === 'thread/start'), false);
    assert.equal(f.workspace.agent('never').observingOnly, true);
    const count = f.rpc.calls.length;
    f.workspace.coordinator.reconcileReportSchedules({ startup: true });
    await f.persistence.restore();
    assert.equal(f.rpc.calls.length, count, 'reconciliation/reconnect does not replay the startup report');
    assert.deepEqual((await f.store.load()).workerReportIntervals, saved.workerReportIntervals);
  } finally { await f.close(); }
});


test('restoration hands current task/report state to startup refresh only after saved workers and intervals are loaded', async () => {
  const f = await restored({ ...record(['one', 'two'], 'coordinator', true), workerReportIntervals: { one: 15 } });
  try {
    assert.deepEqual(f.startupSnapshots, [{ restoring: false, status: 'ready', workers: [{ id: 'one', interval: 15 }, { id: 'two', interval: 0 }] }]);
    await f.persistence.restore();
    assert.equal(f.startupSnapshots.length, 1);
  } finally { await f.close(); }
});

test('startup refresh combines fresh worker reports, restored intervals and coordinator sidebar publication', async () => {
  const f = await restored({ ...record(['one', 'two'], 'coordinator'), workerReportIntervals: { one: 15 } }, { dashboard: true });
  try {
    const deadline = Date.now() + 2000;
    while (f.workspace.coordinator.workers().some(agent => agent.coordinatorSending) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    const reports = f.rpc.calls.filter(call => call.method === 'turn/start' && call.params.threadId !== 'coordinator');
    assert.deepEqual(reports.map(call => call.params.threadId).sort(), ['one', 'two'], 'Never receives one startup summary and enabled timers do not duplicate it');
    await f.workspace.coordinator.pump();
    assert.equal(f.rpc.calls.filter(call => call.method === 'turn/start' && call.params.threadId === 'coordinator').length, 1);
    const metadata = f.workspace.coordinator.list();
    assert.equal(metadata.find(row => row.id === 'one').reportIntervalMinutes, 15);
    assert.equal(metadata.find(row => row.id === 'two').reportIntervalMinutes, 0);
    const coordinator = f.workspace.agent('coordinator');
    await f.workspace.coordinator.call({ threadId: 'coordinator', turnId: coordinator.turnId, tool: 'ccng_publish_progress', arguments: { agentId: 'one', summary: 'Current release is published; deployment is being checked.', blocker: '', nextStep: 'Verify the running deployment.' } });
    assert.equal(f.workspace.snapshot().agents.find(agent => agent.id === 'one').progress.summary, 'Current release is published; deployment is being checked.');
  } finally { await f.close(); }
});
