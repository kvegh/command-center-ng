import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ProgressUpdater, PROGRESS_UPDATER_SOURCE } from '../server/progress-updater.mjs';

const tools = ['ccng_read_worker', 'ccng_publish_progress'].map(name => ({ type: 'function', name }));
const tick = () => new Promise(resolve => setImmediate(resolve));
const job = (workerId = 'worker', fingerprint = 'v1') => ({ workerId, fingerprint, cwd: '/tmp', context: { workerId } });
function fixture(overrides = {}) {
  const rpc = new EventEmitter(); Object.assign(rpc, { ready: true, calls: [], replies: [] });
  let seq = 0;
  rpc.call = async (method, params) => {
    rpc.calls.push({ method, params });
    if (overrides.call) { const result = overrides.call(method, params); if (result !== undefined) return result; }
    if (method === 'thread/start') return { thread: { id: 'helper-' + ++seq, status: { type: 'idle' } }, sandbox: { type: 'readOnly' } };
    if (method === 'turn/start') return { turn: { id: 'turn-' + seq } };
    return {};
  };
  rpc.respond = (id, result) => rpc.replies.push({ id, result });
  const executions = []; let current = true;
  const helper = new ProgressUpdater({ rpc, tools, instructions: 'Shared bounded role', current: () => current,
    nativeOptions: async () => ({ model: 'selected-model', config: { model_reasoning_effort: 'high' }, turnOptions: { effort: 'high' } }),
    execute: async (bound, params) => { executions.push({ bound, params }); return { ok: true }; }, ...overrides.options });
  const start = async (bound = job()) => { helper.enqueue(bound); helper.pump(); await tick(); return helper.active; };
  let req = 0;
  const tool = async (run, name, args = { agentId: run.job.workerId }, turnId = run.turnId) => {
    const id = 'request-' + ++req;
    helper.handleRequest({ id, method: 'item/tool/call', params: { threadId: run.threadId, turnId, tool: name, arguments: args } });
    await tick(); return rpc.replies.find(row => row.id === id)?.result;
  };
  const complete = run => helper.notification({ method: 'turn/completed', params: { threadId: run.threadId, turn: { id: run.turnId, status: 'completed' } } });
  return { rpc, helper, start, tool, complete, executions, stale() { current = false; } };
}

test('one progress slot uses bounded tools and selected model/effort, releasing only after terminal receipt', async () => {
  const f = fixture(), run = await f.start();
  const start = f.rpc.calls.find(row => row.method === 'thread/start').params;
  assert.equal(start.threadSource, PROGRESS_UPDATER_SOURCE); assert.equal(start.sandbox, 'read-only'); assert.equal(start.ephemeral, true);
  assert.equal(start.model, 'selected-model'); assert.equal(start.config.model_reasoning_effort, 'high'); assert.deepEqual(start.dynamicTools, tools);
  assert.equal(f.helper.snapshot().lastProgressAt, null, 'launch acknowledgement does not count as evidenced progress');
  f.helper.enqueue(job('second')); f.helper.pump(); await tick();
  assert.equal(f.rpc.calls.filter(row => row.method === 'thread/start').length, 1);
  f.complete(run); await tick();
  assert.equal(f.helper.active.job.workerId, 'second'); assert.equal(f.rpc.calls.filter(row => row.method === 'thread/start').length, 2);
  f.helper.stop();
});

test('only current bound worker/turn tools execute, with three reads and one publication', async () => {
  const f = fixture(), run = await f.start();
  for (const name of ['ccng_review_approval', 'ccng_send_summary', 'shell', 'spawn_agent']) assert.equal((await f.tool(run, name)).success, false);
  assert.equal((await f.tool(run, 'ccng_read_worker', { agentId: 'other' })).success, false);
  assert.equal((await f.tool(run, 'ccng_read_worker', undefined, 'foreign-turn')).success, false);
  for (let i = 0; i < 3; i++) assert.equal((await f.tool(run, 'ccng_read_worker')).success, true);
  assert.equal((await f.tool(run, 'ccng_read_worker')).success, false);
  assert.equal((await f.tool(run, 'ccng_publish_progress')).success, true);
  assert.equal((await f.tool(run, 'ccng_publish_progress')).success, false);
  assert.equal(f.executions.length, 4); assert.ok(f.helper.snapshot().lastProgressAt);
  f.helper.stop();
});

test('changed evidence and pauses reject publications without cancelling or reusing active slot', async () => {
  const f = fixture(), run = await f.start(); f.stale();
  assert.equal((await f.tool(run, 'ccng_publish_progress')).success, false);
  f.helper.enqueue(job('worker', 'v2')); f.helper.pump(); assert.equal(f.helper.active, run);
  f.helper.setPaused(true); f.complete(run); await tick(); assert.equal(f.helper.active, null);
  assert.equal(f.rpc.calls.filter(row => row.method === 'thread/start').length, 1); f.helper.stop();
});

test('native user decisions remain pending through stop and terminal notification', async () => {
  const f = fixture(), run = await f.start();
  f.helper.handleRequest({ id: 42, method: 'item/commandExecution/requestApproval', params: { threadId: run.threadId } });
  assert.equal(f.helper.snapshot().status, 'blocked'); assert.deepEqual(f.helper.snapshot().pendingNativeRequests, [{ id: 42, method: 'item/commandExecution/requestApproval' }]);
  f.complete(run); f.helper.stop(); await tick();
  assert.equal(f.helper.active, run); assert.equal(f.rpc.replies.length, 0);
  assert.ok(!f.rpc.calls.some(row => ['turn/interrupt', 'thread/archive'].includes(row.method)));
});

test('unknown starts keep their slot and cannot trigger duplicate native execution', async () => {
  const f = fixture({ call: method => { if (method === 'turn/start') throw new Error('Transport outcome unknown'); } });
  const run = await f.start(); assert.equal(f.helper.snapshot().status, 'unknown');
  f.helper.enqueue(job('other')); f.helper.pump(); await tick(); f.helper.stop();
  assert.equal(f.helper.active, run); assert.equal(f.rpc.calls.filter(row => row.method === 'thread/start').length, 1);
  assert.ok(!f.rpc.calls.some(row => ['turn/interrupt', 'thread/archive'].includes(row.method)));
});

test('early callbacks wait for identity confirmation and shutdown handles a late turn acknowledgement', async () => {
  let acknowledge;
  const f = fixture({ call: method => method === 'turn/start' ? new Promise(resolve => { acknowledge = resolve; }) : undefined });
  const run = await f.start();
  f.helper.handleRequest({ id: 'early', method: 'item/tool/call', params: { threadId: run.threadId, turnId: 'known-turn', tool: 'ccng_read_worker', arguments: { agentId: 'worker' } } });
  assert.equal(f.executions.length, 0); f.helper.stop(); acknowledge({ turn: { id: 'known-turn' } }); await tick();
  assert.equal(f.executions.length, 0); assert.equal(f.rpc.replies[0].result.success, false);
  assert.ok(f.rpc.calls.some(row => row.method === 'turn/interrupt' && row.params.turnId === 'known-turn'));
});

test('connection loss preserves unknown ownership and exposes exact native identities', async () => {
  const f = fixture(), run = await f.start(); f.rpc.ready = false; f.rpc.emit('disconnected');
  const status = f.helper.snapshot(); assert.equal(status.status, 'unknown'); assert.equal(status.threadId, run.threadId); assert.equal(status.turnId, run.turnId);
  f.helper.enqueue(job('other')); f.helper.pump(); assert.equal(f.helper.active, run); f.helper.stop();
});

test('concurrent publications reserve one write while rejected content remains correctable', async () => {
  let resolveWrite; let attempts = 0;
  const f = fixture({ options: { execute: async () => { attempts++; return new Promise(resolve => { resolveWrite = resolve; }); } } });
  const run = await f.start();
  f.helper.handleRequest({ id: 'first-write', method: 'item/tool/call', params: { threadId: run.threadId, turnId: run.turnId, tool: 'ccng_publish_progress', arguments: { agentId: 'worker' } } }); await tick();
  assert.equal((await f.tool(run, 'ccng_publish_progress')).success, false); assert.equal(attempts, 1);
  resolveWrite({ ok: true }); await tick(); assert.equal(f.rpc.replies.find(row => row.id === 'first-write').result.success, true); f.helper.stop();
});

test('existing cadence checks unknown native outcomes without treating idle metadata as completion', async () => {
  let now = 1, metadata;
  const f = fixture({ options: { now: () => now }, call: method => method === 'thread/read' ? { thread: metadata } : undefined });
  const run = await f.start(); metadata = { id: run.threadId, status: { type: 'idle' }, turns: [] };
  now = 300002; f.helper.pump(); await tick();
  assert.equal(f.helper.snapshot().status, 'unknown'); assert.equal(f.helper.active, run);
  assert.equal(f.helper.snapshot().lastNativeStatus, 'idle');
  const checks = f.rpc.calls.filter(row => row.method === 'thread/read').length; f.helper.pump(); await tick();
  assert.equal(f.rpc.calls.filter(row => row.method === 'thread/read').length, checks, 'no repeated probe without new unknown evidence');
  f.rpc.emit('disconnected'); metadata.turns = [{ id: run.turnId, status: 'completed' }];
  f.helper.pump(); await tick(); assert.equal(f.helper.active, null); f.helper.stop();
});

test('only attributable assistant activity counts as progress, while start acknowledgement does not', async () => {
  let now = 1;
  const f = fixture({ options: { now: () => now } }), run = await f.start();
  assert.equal(f.helper.snapshot().lastProgressAt, null);
  now = 200000;
  f.helper.notification({ method: 'item/agentMessage/delta', params: { threadId: run.threadId, turnId: 'foreign-turn', delta: 'unrelated' } });
  assert.equal(f.helper.snapshot().lastProgressAt, null);
  f.helper.notification({ method: 'item/agentMessage/delta', params: { threadId: run.threadId, turnId: run.turnId, delta: 'Current findings' } });
  assert.equal(f.helper.snapshot().lastProgressAt, now);
  now = 300002; f.helper.pump(); await tick(); assert.equal(f.helper.snapshot().status, 'running');
  assert.ok(!f.rpc.calls.some(row => row.method === 'thread/read')); f.helper.stop();
});
