import test from 'node:test';
import assert from 'node:assert/strict';
import { Coordinator } from '../server/coordinator.mjs';

function fixture(provider = 'mistral') {
  const calls = [], sends = [];
  const agent = {
    id: 'local-worker', provider, role: 'worker', name: 'Local worker', cwd: '/project',
    messages: [], questions: [], canSend: true, thread: { status: { type: 'idle' } },
    finishedTurn: { id: 'finished-turn', status: 'completed' }, olderCursor: 'codex-only-cursor'
  };
  const workspace = {
    rpc: { ready: true, call: async (method, params) => { calls.push({ method, params }); throw new Error('Unexpected Codex RPC'); } },
    agents: new Map([[agent.id, agent]]), summaryJobs: new Map(), returnJobs: new Map(),
    handoffs: { incoming: () => false }, readyFor: () => true, changed() {},
    send: async (id, text, options) => { sends.push({ id, text, options }); return { turnId: 'mistral-report-turn' }; }
  };
  const coordinator = new Coordinator(workspace, { approvalReviewers: false, progressUpdater: false });
  coordinator.instructions = async () => [];
  coordinator.list = () => [{ id: agent.id }];
  coordinator.mark = () => {};
  return { agent, workspace, coordinator, calls, sends };
}

const report = '| Task | Status | Outcome / next step |\n| --- | --- | --- |\n| Source integration | 🟨 In progress | Finish checks. |\n\nRelease: unknown; publication: unknown; deployment: unverified.';

test('Mistral observations never use Codex history cursors or authority pages', async () => {
  const { agent, coordinator, calls } = fixture();
  const observed = await coordinator.readWorker(agent, null);
  assert.deepEqual(observed.messages, []);
  assert.equal(observed.olderCursor, null);
  coordinator.authorityPages.set(agent, new Map([['old-user', 'old-cursor']]));
  assert.equal(await coordinator.authorizationMessage(agent, 'old-user'), undefined);
  await assert.rejects(coordinator.readWorker(agent, 'codex-cursor'), /without a Codex pagination cursor/);
  assert.deepEqual(calls, []);
});

test('task checks and engineering concern destinations remain Codex-only', () => {
  const { agent, coordinator } = fixture();
  assert.equal(coordinator.taskPingAllowed(agent), false);
  agent.provider = 'claude'; assert.equal(coordinator.taskPingAllowed(agent), false);
  agent.provider = 'codex'; assert.equal(coordinator.taskPingAllowed(agent), true);
  delete agent.provider; assert.equal(coordinator.taskPingAllowed(agent), true);
  agent.provider = 'mistral';
  coordinator.concernReviewWorkerId = agent.id;
  coordinator.pendingConcerns.set({}, { ready: true, targetId: agent.id });
  coordinator.queueConcerns();
  assert.match(coordinator.concernError, /engineering review chat is unavailable/);
  assert.equal(coordinator.deliveries.size, 0);
  assert.equal(coordinator.pendingConcerns.size, 1);
});

test('Mistral native approvals stay pending and never enter Coordinator review', async () => {
  const { agent, coordinator, calls, sends } = fixture();
  const question = { id: 'native-permission', method: 'mistral/requestPermission' };
  agent.questions.push(question);
  for (const decision of ['approve', 'decline', 'ask']) {
    await assert.rejects(coordinator.review(agent, { reviewToken: 'exact-token', decision }), /original manual controls/);
  }
  assert.deepEqual(agent.questions, [question]);
  assert.deepEqual(calls, []); assert.deepEqual(sends, []);
});

test('Mistral reports wait for idle, then bind their own native turn and result', async () => {
  const { agent, coordinator, calls, sends } = fixture();
  agent.turnId = 'project-turn'; agent.thread.status.type = 'active';
  coordinator.reportPending.add(agent.id);
  coordinator.deliveries.set(agent.id, [{ id: 'report-request', kind: 'report', text: 'Report now.' }]);
  await coordinator.flush(agent.id);
  assert.deepEqual(sends, []); assert.equal(coordinator.deliveries.get(agent.id).length, 1);
  agent.turnId = null; agent.thread.status.type = 'idle';
  await coordinator.flush(agent.id);
  assert.equal(sends.length, 1); assert.equal(sends[0].options.report, true);
  assert.equal(coordinator.reportResponses.get(agent.id).turnId, 'mistral-report-turn');
  assert.equal(coordinator.reportMessageCompleted(agent.id, { id: 'report-reply', type: 'assistant', state: 'completed', turnId: 'mistral-report-turn', text: report }), true);
  assert.equal(coordinator.reportPending.has(agent.id), false);
  assert.deepEqual(calls, []);
});

test('Mistral reports retain blocked native requests and external session boundaries', async () => {
  const { agent, coordinator, sends } = fixture();
  coordinator.deliveries.set(agent.id, [{ id: 'report-request', kind: 'report', text: 'Report now.' }]);
  agent.questions.push({ id: 'pending-native-decision' });
  await coordinator.flush(agent.id); assert.deepEqual(sends, []);
  agent.questions.length = 0; agent.externalSession = true;
  await coordinator.flush(agent.id); assert.deepEqual(sends, []);
  assert.equal(coordinator.deliveries.get(agent.id).length, 1);
});

test('a fast Mistral report completion before send acknowledgement settles once', async () => {
  const { agent, workspace, coordinator, sends } = fixture();
  coordinator.reportPending.add(agent.id);
  coordinator.deliveries.set(agent.id, [{ id: 'report-request', kind: 'report', text: 'Report now.' }]);
  workspace.send = async () => {
    sends.push('native-send'); agent.turnId = 'fast-native-turn';
    coordinator.reportMessageCompleted(agent.id, { id: 'fast-reply', type: 'assistant', state: 'completed', turnId: agent.turnId, text: report });
    coordinator.completed(agent.id);
    agent.finishedTurn = { id: agent.turnId, status: 'completed' }; agent.turnId = null;
    return {};
  };
  await coordinator.flush(agent.id);
  assert.equal(sends.length, 1); assert.equal(coordinator.reportResponses.size, 0);
  assert.equal(coordinator.reportPending.has(agent.id), false);
});


test('existing Claude concerns retain recent user evidence without Codex history calls', async () => {
  const { agent, coordinator, calls } = fixture('claude');
  const instruction = { id: 'recent-user', type: 'user', text: 'Explain this request before I decide.' };
  agent.messages.push(instruction);
  assert.equal(await coordinator.authorizationMessage(agent, instruction.id), instruction);
  coordinator.authorityPages.set(agent, new Map([['older-user', 'codex-cursor']]));
  assert.equal(await coordinator.authorizationMessage(agent, 'older-user'), undefined);
  assert.deepEqual(calls, []);
});


test('Mistral approvals are excluded from analyst jobs and expose manual-only capability', async () => {
  const { agent, coordinator, workspace, calls } = fixture();
  const question = { id: 'permission', method: 'mistral/requestPermission', params: { threadId: agent.id }, reviewToken: 'current-token' };
  agent.questions.push(question); workspace.requestView = (_context, pending) => pending;
  coordinator.id = 'main-coordinator'; coordinator.discoverReviewers = async () => {};
  const batches = [];
  coordinator.reviewers = { reconcile: jobs => batches.push(jobs), inspectUnknown: async () => {}, snapshot: () => null };
  await coordinator.refreshApprovalReviewers();
  assert.deepEqual(batches, [[]]); assert.equal(coordinator.reviewerBindings.size, 0);
  const current = coordinator.pendingRequests(agent);
  assert.deepEqual(current.questions[0].reviewCapability.decisions, []);
  assert.equal(current.requestSummary.needsUserRequests, 1);
  assert.deepEqual(calls, []);
});
