import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Workspace } from '../server/workspace.mjs';
import { PROGRESS_UPDATER_SOURCE } from '../server/progress-updater.mjs';
import { APPROVAL_REVIEWER_SOURCE } from '../server/approval-reviewers.mjs';

const authority = 'Inspect disposable test resources without changing anything.';
class Rpc extends EventEmitter {
  constructor(cwd) { super(); Object.assign(this, { cwd, ready: true, calls: [], replies: [], threads: new Map(), sequence: 0 }); }
  thread(id) { return { id, cwd: this.cwd, name: id, status: { type: 'idle' }, canAcceptDirectInput: true }; }
  async call(method, params = {}) {
    this.calls.push({ method, params });
    if (method === 'config/read') return { config: { mcp_servers: { fixture: { enabled: true } } } };
    if (method === 'thread/loaded/list') return { data: [...this.threads.keys()], nextCursor: null };
    if (method === 'thread/start') {
      const thread = { ...this.thread('native-' + ++this.sequence), threadSource: params.threadSource }; this.threads.set(thread.id, thread);
      return { thread, sandbox: { type: 'readOnly' } };
    }
    if (method === 'thread/read' || method === 'thread/resume') {
      if (!this.threads.has(params.threadId)) this.threads.set(params.threadId, this.thread(params.threadId));
      return { thread: this.threads.get(params.threadId), sandbox: { type: 'readOnly' }, instructionSources: [] };
    }
    if (method === 'thread/name/set') return {};
    if (method === 'thread/turns/list') return { data: [{ id: 'old-turn', status: 'completed', items: [{ id: 'actual-user', type: 'userMessage', content: [{ type: 'text', text: authority }] }] }], nextCursor: null };
    if (method === 'turn/start') { this.threads.get(params.threadId).status = { type: 'active' }; return { turn: { id: 'turn-' + ++this.sequence } }; }
    if (['thread/archive', 'turn/interrupt'].includes(method)) return {};
    throw new Error('Unexpected RPC ' + method);
  }
  respond(id, result) { this.replies.push({ id, result }); if (String(id).startsWith('approval-')) queueMicrotask(() => this.emit('notification', { method: 'serverRequest/resolved', params: { threadId: 'worker', requestId: id } })); }
  refuse(id, error) { this.replies.push({ id, error }); }
}
async function waitFor(predicate) {
  for (let i = 0; i < 150; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw new Error('Expected isolated progress outcome was not observed.');
}
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-progress-integration-')), rpc = new Rpc(cwd);
  const workspace = new Workspace(rpc, { beads: null, coordinator: { progressUpdater: true, approvalReviewers: true, debounceMs: 1000000, intervalMs: 1000000 } });
  workspace.instructionContext = async () => [{ type: 'text', text: 'Canonical shared fixture instructions.' }];
  await workspace.open('worker'); await workspace.open('other'); await workspace.coordinator.ensure();
  const coordinator = workspace.coordinator, main = workspace.agent(coordinator.id);
  main.model = 'selected-model'; main.reasoningEffort = 'high'; main.turnId = 'main-active'; main.thread.status = { type: 'active' };
  const worker = workspace.agent('worker'); worker.messages.push({ id: 'actual-user', type: 'user', text: authority });
  const request = id => {
    workspace.request({ id, method: 'item/commandExecution/requestApproval', params: { threadId: 'worker', turnId: 'work-turn', itemId: 'item-' + id,
      cwd, command: 'fixture-read', availableDecisions: ['accept', 'decline'] } });
    return worker.questions.find(row => row.id === id);
  };
  const tool = async (run, name, args, turnId = run.turnId) => {
    const id = 'dynamic-' + ++rpc.sequence;
    workspace.request({ id, method: 'item/tool/call', params: { threadId: run.threadId, turnId, tool: name, arguments: args } });
    await waitFor(() => rpc.replies.some(row => row.id === id)); return rpc.replies.find(row => row.id === id).result;
  };
  return { cwd, rpc, workspace, coordinator, main, worker, request, tool,
    async close() { coordinator.stop(); await coordinator.reviewerRefresh; await rm(cwd, { recursive: true, force: true }); } };
}

test('native approvals remain independent while one progress helper and two analysts run concurrently', async () => {
  const f = await fixture();
  try {
    const first = f.request('approval-1'), second = f.request('approval-2');
    f.coordinator.mark('worker', 'Progress changed'); await f.coordinator.pump();
    await waitFor(() => f.coordinator.progressUpdater.active?.confirmed && f.coordinator.reviewers.active.size === 2 && [...f.coordinator.reviewers.active].every(run => run.confirmed));
    const progress = f.coordinator.progressUpdater.active;
    const starts = f.rpc.calls.filter(row => row.method === 'thread/start');
    assert.equal(starts.filter(row => row.params.threadSource === PROGRESS_UPDATER_SOURCE).length, 1);
    assert.equal(starts.filter(row => row.params.threadSource === APPROVAL_REVIEWER_SOURCE).length, 2);
    const native = starts.find(row => row.params.threadSource === PROGRESS_UPDATER_SOURCE).params;
    assert.equal(native.model, 'selected-model'); assert.equal(native.config.model_reasoning_effort, 'high'); assert.equal(native.sandbox, 'read-only');
    assert.equal(native.config['features.shell_tool'], false);
    assert.deepEqual(native.dynamicTools.map(tool => tool.name), ['ccng_read_worker', 'ccng_publish_progress']);
    const turn = f.rpc.calls.find(row => row.method === 'turn/start' && row.params.threadId === progress.threadId).params;
    assert.equal(turn.effort, 'high'); assert.deepEqual(turn.additionalContext, [{ type: 'text', text: 'Canonical shared fixture instructions.' }]);
    // Main decides using its normal native-current/real-user checks while all
    // three optional helpers are still running with no terminal notification.
    const result = await f.coordinator.call({ threadId: f.main.id, turnId: f.main.turnId, tool: 'ccng_review_approval', arguments: {
      agentId: 'worker', reviewToken: first.reviewToken, decision: 'approve', rationale: 'Request: Inspect disposable resources.\nConcern: None.\nNext: Continue.',
      authorizationMessageId: 'actual-user', authorizationQuote: authority } });
    assert.equal(first.review.decision, 'approve'); assert.ok(f.rpc.replies.some(row => row.id === 'approval-1'));
    assert.equal(f.coordinator.progressUpdater.active, progress); assert.equal(f.coordinator.reviewers.active.size, 2);
    assert.equal(second.review, undefined); assert.ok(result);
  } finally { await f.close(); }
});

test('progress routing publishes only bound current evidence and preserves unexpected native decisions', async () => {
  const f = await fixture();
  try {
    f.coordinator.mark('worker', 'Useful outcome'); await f.coordinator.pump(); await waitFor(() => f.coordinator.progressUpdater.active?.confirmed);
    const run = f.coordinator.progressUpdater.active;
    for (const [tool, args] of [['ccng_review_approval', { agentId: 'worker' }], ['ccng_send_summary', { agentId: 'worker' }], ['ccng_read_worker', { agentId: 'other' }]]) {
      assert.equal((await f.tool(run, tool, args)).success, false);
    }
    assert.equal((await f.tool(run, 'ccng_publish_progress', { agentId: 'worker', summary: 'Inspection finished.', blocker: '', nextStep: 'Review findings.' })).success, true);
    assert.equal(f.worker.progress.summary, 'Inspection finished.');
    f.worker.messages.push({ id: 'changed-evidence', type: 'assistant', text: 'A new blocker appeared.' });
    assert.equal((await f.tool(run, 'ccng_publish_progress', { agentId: 'worker', summary: 'Stale result', blocker: '', nextStep: '' })).success, false);
    assert.equal(f.worker.progress.summary, 'Inspection finished.');
    f.workspace.request({ id: 'helper-human', method: 'item/commandExecution/requestApproval', params: { threadId: run.threadId, turnId: run.turnId, command: 'unsupported' } });
    assert.ok(f.workspace.pending.has(JSON.stringify([run.threadId, 'helper-human'])));
    assert.equal(f.coordinator.snapshot().progressUpdate.status, 'blocked');
    f.coordinator.stop(); assert.ok(!f.rpc.calls.some(row => row.method === 'turn/interrupt' && row.params.threadId === run.threadId));
  } finally { await f.close(); }
});

test('progress dispatch proceeds during a busy main send and never depends on approval reviewers being enabled', async () => {
  const f = await fixture();
  try {
    f.coordinator.reviewers.stop(); f.coordinator.reviewers = null; f.coordinator.running = true;
    f.coordinator.mark('worker', 'Progress while main is busy'); await f.coordinator.pump();
    await waitFor(() => f.coordinator.progressUpdater.active?.confirmed);
    assert.equal(f.coordinator.progressUpdater.active.job.workerId, 'worker');
    assert.ok(!f.rpc.calls.some(row => row.method === 'thread/start' && row.params.threadSource === APPROVAL_REVIEWER_SOURCE));
  } finally { await f.close(); }
});

test('worker evidence and identity are rechecked before the first sidebar publication', async () => {
  const f = await fixture();
  try {
    f.worker.progress = { summary: 'Prior verified outcome.', blocker: '', nextStep: '' };
    f.coordinator.mark('worker', 'New evidence'); await f.coordinator.pump(); await waitFor(() => f.coordinator.progressUpdater.active?.confirmed);
    const run = f.coordinator.progressUpdater.active, originalMessages = f.worker.messages.slice();
    const publish = () => f.tool(run, 'ccng_publish_progress', { agentId: 'worker', summary: 'Changed result', blocker: '', nextStep: '' });
    f.worker.messages.push({ id: 'new-actual-evidence', type: 'assistant', text: 'A concrete blocker appeared.' });
    assert.equal((await publish()).success, false); assert.equal(run.published, undefined);
    assert.equal(f.worker.progress.summary, 'Prior verified outcome.');
    f.worker.messages = originalMessages; f.worker.requestStopIntent = 'user-stop';
    assert.equal((await publish()).success, false); delete f.worker.requestStopIntent;
    f.workspace.agents.set('worker', { ...f.worker }); assert.equal((await publish()).success, false);
    f.workspace.agents.set('worker', f.worker);
    assert.equal((await publish()).success, true);
  } finally { await f.close(); }
});
