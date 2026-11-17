import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';
import { ClaudeSessions, CLAUDE_APPROVAL, CLAUDE_QUESTION } from '../server/claude.mjs';
import { COORDINATOR_TOOLS } from '../server/coordinator.mjs';
import { approvalRequestFingerprint, previousRequestReferral } from '../server/decision-store.mjs';
import { COORDINATOR_DECISION_GUIDANCE } from '../server/coordinator-prompt.mjs';

const nativeId = '11111111-2222-4333-8444-555555555555';
const rationale = 'Request: Inspect project metadata.\nConcern: The target scope needs confirmation.\nNext: Confirm the intended target.';

function fixture() {
  const rpc = new EventEmitter(); rpc.ready = true;
  rpc.call = async () => assert.fail('Concern feedback must not invoke native work.');
  rpc.respond = () => assert.fail('Concern feedback must not answer native requests.');
  const claude = new ClaudeSessions(); claude.available = true;
  const workspace = new Workspace(rpc, { beads: null, claude, coordinator: { approvalReviewers: false, progressUpdater: false } });
  const coordinator = workspace.coordinator; coordinator.id = 'coordinator';
  workspace.agents.set(coordinator.id, { id: coordinator.id, role: 'coordinator', provider: 'codex', cwd: '/example/project', messages: [], questions: [], turnId: 'coordinator-turn', thread: { status: { type: 'active' } } });
  const agent = claude.make({ sessionId: nativeId, cwd: '/example/project', summary: 'Synthetic Claude worker' });
  claude.records.set(agent.id, agent); workspace.agents.set(agent.id, agent);
  const job = { query: {} }; claude.runs.set(agent.id, job);
  const pending = claude.permission(agent, 'Bash', { command: 'inspect-project-metadata' }, { requestId: 'request-one', toolUseID: 'tool-one', signal: new AbortController().signal });
  const question = agent.questions[0];
  const pendingRecord = claude.requests.get(JSON.stringify([agent.id, question.id]));
  const args = { agentId: agent.id, reviewToken: question.reviewToken, decision: 'ask', rationale, authorizationMessageId: null, authorizationQuote: null };
  const call = (patch = {}) => coordinator.call({ threadId: coordinator.id, turnId: 'coordinator-turn', tool: 'ccng_review_approval', arguments: { ...args, ...patch } });
  return { workspace, coordinator, claude, agent, job, pending, question, args, call,
    close() { coordinator.stop(); claude.requests.set(JSON.stringify([agent.id, question.id]), pendingRecord); question.responding = false; for (const question of [...agent.questions]) claude.cancel(agent, question.id, 'Synthetic test cleanup.'); } };
}

test('Coordinator attaches an ask concern to the exact Claude callback without answering or changing eligibility', async () => {
  const f = fixture();
  try {
    let settled = false; f.pending.then(() => { settled = true; });
    const before = f.coordinator.pendingRequests(f.agent);
    assert.deepEqual(before.questions[0].reviewCapability.decisions, ['ask']);
    const browserQuestion = () => f.workspace.snapshot().agents.find(agent => agent.id === f.agent.id).questions[0];
    assert.deepEqual(browserQuestion().reviewCapability.decisions, ['ask'], 'the browser receives the same exact current capability as Coordinator tools');
    assert.equal(before.requestSummary.unreviewedApprovals, 0, 'Claude requests do not enter automatic approval analysis');
    const result = await f.call();
    assert.equal(result.outcome, 'needs_user'); assert.equal(result.questions[0].review.rationale, rationale);
    assert.deepEqual(f.question.review, { decision: 'ask', rationale });
    assert.equal(f.workspace.snapshot().agents.find(agent => agent.id === f.agent.id).questions[0].review.rationale, rationale, 'browser snapshots retain the concern on the original request');
    assert.deepEqual(browserQuestion().reviewCapability.decisions, [], 'a completed concern cannot leave evaluation eligibility behind');
    assert.equal(f.agent.questions[0], f.question); assert.equal(!!f.question.responding, false);
    assert.equal(f.claude.requests.get(JSON.stringify([f.agent.id, f.question.id])).question, f.question);
    assert.equal(settled, false); assert.equal(f.coordinator.audit.at(-1).decision, 'ask');
    assert.equal(f.coordinator.audit.at(-1).outcome, 'needs_user');
    assert.equal(f.coordinator.audit.at(-1).requestFingerprint, undefined);
    assert.equal(approvalRequestFingerprint(f.agent, f.question), null);
    assert.equal(previousRequestReferral(f.coordinator.audit, f.agent, f.question), null, 'Claude feedback cannot become historical replay authority');
    await assert.rejects(f.call(), /waiting for your decision/);
    assert.equal(f.coordinator.audit.length, 1, 'an unchanged ask is not repeated');
    f.claude.answer(f.agent, f.question.id, { decision: 'accept' });
    assert.deepEqual(await f.pending, { behavior: 'allow', updatedInput: { command: 'inspect-project-metadata' } }, 'the original manual callback remains usable');
  } finally { f.close(); }
});

test('Claude concern feedback never permits Coordinator approval or decline, even after an ask', async () => {
  const f = fixture();
  try {
    for (const decision of ['approve', 'decline']) await assert.rejects(f.call({ decision }), /only record an ask concern/);
    assert.equal(f.question.review, undefined); assert.equal(f.coordinator.audit.length, 0);
    await f.call();
    for (const decision of ['approve', 'decline']) await assert.rejects(f.call({ decision }), /only record an ask concern/);
    assert.equal(!!f.question.responding, false); assert.equal(f.agent.questions.length, 1);
  } finally { f.close(); }
});

test('Claude concern feedback refuses stale, foreign, unowned, ended and non-approval callbacks', async () => {
  const changes = {
    wrongToken: f => { f.args.reviewToken = 'stale-token'; },
    removedCallback: f => { f.claude.requests.delete(JSON.stringify([f.agent.id, f.question.id])); },
    replacedCallback: f => { f.claude.requests.set(JSON.stringify([f.agent.id, f.question.id]), { question: { ...f.question } }); },
    endedProcess: f => { f.claude.runs.delete(f.agent.id); },
    changedRecord: f => { f.claude.records.set(f.agent.id, { ...f.agent }); },
    externalProcess: f => { f.agent.externalSession = true; },
    stoppingWorker: f => { f.agent.requestStopIntent = true; },
    stoppedRuntime: f => { f.claude.stopped = true; },
    abortedRun: f => { f.job.abortController = new AbortController(); f.job.abortController.abort(); },
    abortedRequest: f => { f.claude.requests.get(JSON.stringify([f.agent.id, f.question.id])).signal = AbortSignal.abort(); },
    pausedCoordinator: f => { f.coordinator.paused = true; },
    stoppedCoordinator: f => { f.coordinator.stop(); },
    foreignThread: f => { f.question.params.threadId = 'different-session'; },
    answering: f => { f.question.responding = true; },
    question: f => { f.question.method = CLAUDE_QUESTION; },
    elicitation: f => { f.question.method = 'claude/mcp/elicitation/request'; }
  };
  for (const [name, change] of Object.entries(changes)) {
    const f = fixture();
    try {
      const approval = f.question.method === CLAUDE_APPROVAL;
      change(f); await assert.rejects(f.call(), undefined, name);
      const view = f.workspace.requestView(f.agent, f.question);
      if (approval && f.question.method === CLAUDE_APPROVAL && name !== 'wrongToken') assert.deepEqual(view.reviewCapability.decisions, [], name + ': stale browser capability must also be absent');
      assert.equal(f.question.review, undefined, name); assert.equal(f.coordinator.audit.length, 0, name);
    } finally { f.close(); }
  }
});

test('a Claude callback changing during concern context capture is not annotated or recorded', async () => {
  const f = fixture();
  try {
    f.workspace.requestContextFingerprint = () => { f.claude.requests.delete(JSON.stringify([f.agent.id, f.question.id])); return null; };
    await assert.rejects(f.call(), /changed during concern feedback/);
    assert.equal(f.question.review, undefined); assert.equal(f.coordinator.audit.length, 0);
  } finally { f.close(); }
});

test('tool and request metadata explicitly advertise ask-only Claude feedback', () => {
  const review = COORDINATOR_TOOLS.find(tool => tool.name === 'ccng_review_approval');
  assert.match(review.description, /only ask is supported/); assert.match(review.description, /Claude approve and decline are forbidden/);
  const list = COORDINATOR_TOOLS.find(tool => tool.name === 'ccng_list_workers');
  assert.match(list.description, /Claude tool approvals expose ask-only concern feedback/);
  assert.match(COORDINATOR_DECISION_GUIDANCE, /Claude/); assert.match(COORDINATOR_DECISION_GUIDANCE, /ask/);
  assert.equal(CLAUDE_APPROVAL, 'claude/tool/requestApproval');
});
