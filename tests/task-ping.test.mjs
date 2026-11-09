import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Coordinator } from '../server/coordinator.mjs';

const cadence = 15 * 60_000;
function fixture() {
  let now = 0, sequence = 0;
  const timers = new Map(), sent = [], workspace = new EventEmitter();
  const clock = {
    now: () => now, setTimeout: (run, delay) => { const id = ++sequence; timers.set(id, { run, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    advance: ms => { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.run(); } },
  };
  const worker = id => ({ id, provider: 'codex', role: 'worker', canSend: true, reportIntervalMinutes: 0, messages: [], questions: [], finishedTurn: { id: 'previous', status: 'completed' }, thread: { status: { type: 'idle' } }, turnId: null });
  workspace.rpc = { ready: true }; workspace.agents = new Map([['one', worker('one')]]);
  workspace.summaryJobs = new Map(); workspace.returnJobs = new Map(); workspace.restoring = false;
  workspace.agent = id => workspace.agents.get(id); workspace.changed = () => workspace.emit('change'); workspace.readyFor = () => workspace.rpc.ready;
  workspace.send = async (id, text, options) => {
    const agent = workspace.agent(id);
    sent.push({ id, text, options, method: agent.thread.status.type === 'active' && agent.turnId ? 'turn/steer' : 'turn/start' });
    agent.turnId = `ping-${sent.length}`; agent.thread.status = { type: 'active' };
    agent.messages.push({ type: 'user', text, internalTaskPing: !!options.taskPing });
  };
  const coordinator = new Coordinator(workspace, { reportClock: clock });
  const complete = id => {
    const agent = workspace.agent(id); agent.finishedTurn = { id: agent.turnId, status: 'completed' };
    agent.turnId = null; agent.thread.status = { type: 'idle' }; coordinator.completed(id);
  };
  return { coordinator, workspace, worker, clock, sent, timers, complete };
}
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };

test('15-minute global cadence starts only after restoration and works with every report set to Never', async () => {
  const f = fixture(); f.workspace.restoring = true;
  f.coordinator.reconcileReportSchedules({ startup: true });
  assert.equal(f.coordinator.snapshot().nextTaskPingAt, null); assert.equal(f.timers.size, 0);
  f.workspace.restoring = false; f.coordinator.reconcileReportSchedules({ startup: true });
  assert.equal(f.coordinator.snapshot().nextTaskPingAt, new Date(cadence).toISOString());
  assert.equal(f.timers.size, 1); assert.deepEqual(f.sent, []);
  f.clock.advance(cadence - 1000); await settle(); assert.deepEqual(f.sent, []);
  f.clock.advance(1000); await settle();
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].options.taskPing, true);
  assert.equal(f.workspace.agent('one').reportIntervalMinutes, 0);
  assert.equal(f.coordinator.snapshot().nextTaskPingAt, new Date(2 * cadence).toISOString());
  f.coordinator.stop(); assert.equal(f.timers.size, 0);
});

test('known active workers receive safe steering at each cadence, without catch-up bursts or interruption', async () => {
  const f = fixture(), agent = f.workspace.agent('one');
  agent.turnId = 'ordinary-work'; agent.thread.status = { type: 'active' };
  f.coordinator.reconcileReportSchedules({ startup: true });
  f.clock.advance(cadence); await settle();
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].method, 'turn/steer');
  assert.equal(f.coordinator.taskPingPending.has('one'), false);
  f.clock.advance(10 * cadence); await settle(); assert.equal(f.sent.length, 2);
  f.coordinator.dirty.clear(); f.complete('one'); await settle();
  assert.equal(f.coordinator.dirty.size, 0, 'task-check completion does not wake the coordinator model');
  assert.equal(f.coordinator.audit.length, 0, 'normal pings do not fill coordinator delivery history');
  f.coordinator.stop();
});

test('pause and suspended clocks produce no catch-up burst and retain report deadlines independently', async () => {
  const f = fixture(); f.coordinator.reconcileReportSchedules({ startup: true });
  f.coordinator.paused = true; assert.equal(f.coordinator.snapshot().nextTaskPingAt, null);
  f.clock.advance(12 * cadence); await settle(); assert.deepEqual(f.sent, []);
  f.coordinator.paused = false; f.clock.advance(cadence - 1000); await settle(); assert.deepEqual(f.sent, []);
  f.clock.advance(1000); await settle(); assert.equal(f.sent.length, 1);
  assert.equal(f.coordinator.reportSchedules.size, 0);
  f.coordinator.stop();
});

test('native questions, disconnected ownership and handoffs defer pings without answering or dropping requests', async () => {
  for (const state of ['question', 'offline', 'summary', 'handoff-job']) {
    const f = fixture(), agent = f.workspace.agent('one');
    if (state === 'question') agent.questions = [{ id: 'exact-request' }];
    if (state === 'offline') f.workspace.rpc.ready = false;
    if (state === 'summary') f.workspace.summaryJobs.set('one', {});
    if (state === 'handoff-job') f.workspace.returnJobs.set('one', {});
    f.coordinator.reconcileReportSchedules({ startup: true }); f.clock.advance(cadence); await settle();
    assert.deepEqual(f.sent, []); assert.equal(f.coordinator.deliveries.get('one').length, 1);
    if (state === 'question') { assert.equal(agent.questions[0].id, 'exact-request'); agent.questions = []; }
    f.workspace.rpc.ready = true; f.workspace.summaryJobs.clear(); f.workspace.returnJobs.clear();
    f.clock.advance(1000); await settle(); assert.equal(f.sent.length, 1);
    f.coordinator.stop();
  }
});

test('interrupted, failed, unknown, handing-back, external and Claude workers are never restarted by task pings', async () => {
  for (const state of ['interrupted', 'failed', 'unknown', 'handoff', 'external', 'claude']) {
    const f = fixture(), agent = f.workspace.agent('one');
    if (['interrupted', 'failed'].includes(state)) agent.finishedTurn.status = state;
    if (state === 'unknown') delete agent.finishedTurn;
    if (state === 'handoff') agent.handoff = { phase: 'failed' };
    if (state === 'external') agent.canSend = false;
    if (state === 'claude') agent.provider = 'claude';
    f.coordinator.reconcileReportSchedules({ startup: true }); f.clock.advance(cadence); await settle();
    assert.deepEqual(f.sent, []); assert.equal(f.coordinator.deliveries.size, 0);
    f.coordinator.stop();
  }
});

test('uncertain task-ping sends remain one failed row and are never automatically retried', async () => {
  const f = fixture(); let attempts = 0;
  f.workspace.send = async () => { attempts++; throw new Error('Native acknowledgement unavailable'); };
  f.coordinator.reconcileReportSchedules({ startup: true }); f.clock.advance(cadence); await settle();
  assert.equal(attempts, 1); assert.match(f.coordinator.deliveries.get('one')[0].error, /acknowledgement/);
  f.clock.advance(30 * cadence); await settle();
  assert.equal(attempts, 1); assert.equal(f.coordinator.deliveries.get('one').length, 1);
  f.coordinator.stop(); assert.equal(f.coordinator.taskPingPending.size, 0);
  assert.equal(f.coordinator.deliveries.size, 0); assert.equal(f.coordinator.snapshot().nextTaskPingAt, null);
});

test('closing a worker clears its ping while other workers share the same cadence', async () => {
  const f = fixture(); f.workspace.agents.set('two', f.worker('two'));
  f.workspace.agent('one').questions = [{ id: 'waiting' }];
  f.coordinator.reconcileReportSchedules({ startup: true }); f.clock.advance(cadence); await settle();
  assert.deepEqual(f.sent.map(row => row.id), ['two']);
  f.workspace.agents.delete('one'); f.coordinator.closed('one');
  assert.equal(f.coordinator.taskPingPending.has('one'), false);
  assert.equal(f.coordinator.deliveries.has('one'), false);
  assert.equal(f.timers.size, 1); f.coordinator.stop();
});

test('changing report intervals and Never never cancel an independent queued task ping', async () => {
  const f = fixture(), agent = f.workspace.agent('one'); agent.questions = [{ id: 'waiting' }];
  f.coordinator.reconcileReportSchedules({ startup: true }); f.clock.advance(cadence); await settle();
  const next = f.coordinator.snapshot().nextTaskPingAt;
  f.coordinator.setReportInterval('one', 5, { notifyWorker: true });
  f.coordinator.setReportInterval('one', 0, { notifyWorker: true });
  assert.equal(f.coordinator.deliveries.get('one')[0].kind, 'task-ping');
  assert.equal(f.coordinator.snapshot().nextTaskPingAt, next); assert.equal(f.timers.size, 1);
  f.coordinator.stop();
});

test('busy workers with unknown native turn identity wait with one queued ping until exact steering is available', async () => {
  const f = fixture(), agent = f.workspace.agent('one');
  agent.thread.status = { type: 'active' }; agent.turnId = null;
  f.coordinator.reconcileReportSchedules({ startup: true });
  f.clock.advance(cadence); f.clock.advance(8 * cadence); await settle();
  assert.equal(f.sent.length, 0); assert.equal(f.coordinator.deliveries.get('one').length, 1);
  agent.turnId = 'current-native-turn'; f.clock.advance(1000); await settle();
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].method, 'turn/steer');
  f.coordinator.stop();
});

test('unacknowledged transport coalesces cycles and a confirmed send permits the following interval', async () => {
  const f = fixture(), original = f.workspace.send; let confirm;
  const pending = new Promise(resolve => { confirm = resolve; });
  f.workspace.send = async (...args) => { await original(...args); await pending; };
  f.coordinator.reconcileReportSchedules({ startup: true }); f.clock.advance(cadence); await settle();
  assert.equal(f.sent.length, 1); assert.equal(f.coordinator.taskPingPending.has('one'), true);
  f.clock.advance(cadence); await settle();
  assert.equal(f.sent.length, 1); assert.equal(f.coordinator.deliveries.get('one').length, 1);
  confirm(); await settle(); assert.equal(f.coordinator.taskPingPending.has('one'), false);
  f.clock.advance(cadence); await settle(); assert.equal(f.sent.length, 2);
  f.coordinator.stop();
});

test('task pings stay behind priority reports and uncertain rows within the existing four-message queue', async () => {
  const f = fixture(), agent = f.workspace.agent('one'); agent.questions = [{ id: 'waiting' }];
  f.coordinator.queue(agent, 'Uncertain summary', 'summary');
  f.coordinator.deliveries.get('one')[0].error = 'Unknown acceptance';
  f.coordinator.queue(agent, 'Ordinary summary', 'summary');
  f.coordinator.reconcileReportSchedules({ startup: true }); f.clock.advance(cadence);
  f.coordinator.requestUserReport('one');
  assert.deepEqual(f.coordinator.deliveries.get('one').map(row => row.kind), ['summary', 'report', 'task-ping', 'summary']);
  agent.questions = []; await f.coordinator.flush('one');
  assert.deepEqual(f.sent, []); assert.equal(f.coordinator.deliveries.get('one').length, 4);
  assert.throws(() => f.coordinator.queue(agent, 'Fifth', 'summary'), /four queued/);
  f.coordinator.stop();
});

test('a newer ping queued behind a question stays coalesced when the previous ping turn completes', async () => {
  const f = fixture(), agent = f.workspace.agent('one');
  f.coordinator.reconcileReportSchedules({ startup: true }); f.clock.advance(cadence); await settle();
  assert.equal(f.sent.length, 1);
  agent.questions = [{ id: 'current-question' }];
  f.clock.advance(cadence); await settle();
  assert.equal(f.coordinator.deliveries.get('one').length, 1);
  f.complete('one'); f.clock.advance(cadence); await settle();
  assert.equal(f.sent.length, 1); assert.equal(f.coordinator.deliveries.get('one').length, 1);
  assert.equal(agent.questions[0].id, 'current-question');
  f.coordinator.stop();
});
