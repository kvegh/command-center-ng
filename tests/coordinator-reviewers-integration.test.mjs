import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Workspace } from '../server/workspace.mjs';
import { APPROVAL_REVIEWER_SOURCE } from '../server/approval-reviewers.mjs';
import { COORDINATOR_PROMPT } from '../server/coordinator-prompt.mjs';

const authority = 'Inspect disposable local test resources without changing production.';
const history = (items, nextCursor = null) => ({ data: [{ id: 'past-turn', status: 'completed', items }], nextCursor });
const user = (id, text) => ({ id, type: 'userMessage', content: [{ type: 'text', text }] });

// Real Workspace/Coordinator routing with an isolated native transport. No native
// session, model call, approval or project resource is touched by these tests.
class Rpc extends EventEmitter {
  constructor(cwd) { super(); this.cwd = cwd; this.ready = true; this.calls = []; this.replies = []; this.threads = new Map(); this.pages = new Map(); this.requests = new Map(); this.sequence = 0; }
  thread(id) { return { id, cwd: this.cwd, name: id, preview: authority, status: { type: 'idle' }, canAcceptDirectInput: true }; }
  async call(method, params = {}) {
    this.calls.push({ method, params });
    if (method === 'config/read') return { config: { mcp_servers: { fixture: { enabled: true } } } };
    if (method === 'thread/loaded/list') return { data: [...this.threads.keys()], nextCursor: null };
    if (method === 'thread/start') {
      const thread = { ...this.thread('native-' + ++this.sequence), threadSource: params.threadSource };
      this.threads.set(thread.id, thread); return { thread, sandbox: { type: 'readOnly' } };
    }
    if (method === 'thread/name/set') { this.threads.get(params.threadId).name = params.name; return {}; }
    if (method === 'thread/read' || method === 'thread/resume') {
      if (!this.threads.has(params.threadId)) this.threads.set(params.threadId, this.thread(params.threadId));
      return { thread: this.threads.get(params.threadId), instructionSources: [], sandbox: { type: 'readOnly' } };
    }
    if (method === 'thread/turns/list') return structuredClone(this.pages.get(JSON.stringify([params.threadId, params.cursor])) || history([user('user-' + params.threadId, authority)]));
    if (method === 'turn/start') {
      const id = 'turn-' + ++this.sequence;
      this.threads.get(params.threadId).status = { type: 'active' };
      return { turn: { id } };
    }
    if (method === 'thread/archive' || method === 'turn/interrupt') return {};
    throw new Error('Unexpected fixture RPC: ' + method);
  }
  respond(id, result) {
    this.replies.push({ id, result });
    const request = this.requests.get(id);
    if (request) {
      this.requests.delete(id);
      queueMicrotask(() => this.emit('notification', { method: 'serverRequest/resolved', params: { threadId: request.threadId, requestId: id } }));
    }
  }
  refuse(id, error) { this.replies.push({ id, error }); }
}

async function waitFor(predicate) {
  const deadline = performance.now() + 2500;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error('Expected isolated reviewer outcome was not observed.');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-reviewer-integration-'));
  const rpc = new Rpc(cwd);
  const workspace = new Workspace(rpc, { beads: null, coordinator: { progressUpdater: false, approvalReviewers: true, debounceMs: 1000000, intervalMs: 1000000 } });
  await workspace.open('worker'); await workspace.open('other'); await workspace.coordinator.ensure();
  const coordinator = workspace.coordinator, main = workspace.agent(coordinator.id);
  main.turnId = 'main-turn'; main.thread.status = { type: 'active' }; main.model = 'fixture-model'; main.reasoningEffort = 'xhigh';
  await coordinator.refreshApprovalReviewers();
  let requestSequence = 0, toolSequence = 0;
  const ask = (patch = {}, workerId = 'worker', method = 'item/commandExecution/requestApproval') => {
    const id = 'approval-' + ++requestSequence;
    workspace.request({ id, method, params: { threadId: workerId, turnId: 'work-turn', itemId: 'item-' + id,
      cwd, command: 'fixture-diagnostic', availableDecisions: ['accept', 'decline'], ...patch } });
    rpc.requests.set(id, { threadId: workerId });
    return workspace.agent(workerId).questions.find(question => question.id === id);
  };
  const run = async question => {
    await coordinator.refreshApprovalReviewers();
    await waitFor(() => coordinator.reviewers.snapshot(question.reviewToken)?.status === 'running');
    return coordinator.reviewers.jobs.get(question.reviewToken);
  };
  const tool = async (reviewer, name, args) => {
    const id = 'read-' + ++toolSequence;
    workspace.request({ id, method: 'item/tool/call', params: { threadId: reviewer.threadId, turnId: reviewer.turnId, tool: name, arguments: args } });
    await waitFor(() => rpc.replies.some(reply => reply.id === id));
    const result = rpc.replies.find(reply => reply.id === id).result;
    return { ...result, value: result.success ? JSON.parse(result.contentItems[0].text) : result.contentItems[0].text };
  };
  const call = (name, args) => coordinator.call({ threadId: main.id, turnId: main.turnId, tool: name, arguments: args });
  const review = (question, patch = {}) => call('ccng_review_approval', { agentId: 'worker', reviewToken: question.reviewToken, decision: 'approve',
    rationale: 'Request: Inspect the disposable resources.\nConcern: No unsupported effects.\nNext: Continue authorized inspection.',
    authorizationMessageId: 'user-worker', authorizationQuote: authority, ...patch });
  const complete = (reviewer, recommendation = {}) => {
    workspace.notification({ method: 'item/completed', params: { threadId: reviewer.threadId, turnId: reviewer.turnId,
      item: { id: 'result-' + reviewer.threadId, type: 'agentMessage', text: JSON.stringify({ decision: 'approve', rationale: 'The exact user instruction covers this read.',
        authorizationMessageId: 'user-worker', authorizationQuote: authority, ...recommendation }) } } });
    workspace.notification({ method: 'turn/completed', params: { threadId: reviewer.threadId, turn: { id: reviewer.turnId, status: 'completed' } } });
  };
  return { cwd, rpc, workspace, coordinator, main, ask, run, tool, call, review, complete,
    async close() { coordinator.stop(); await coordinator.reviewerRefresh; await rm(cwd, { recursive: true, force: true }); } };
}

test('analyst reads are bound to one worker/request and never grant main tools or approval authority', async () => {
  const f = await fixture();
  try {
    const question = f.ask(), reviewer = await f.run(question);
    const start = f.rpc.calls.find(call => call.method === 'thread/start' && call.params.threadSource === APPROVAL_REVIEWER_SOURCE);
    assert.equal(start.params.model, 'fixture-model'); assert.equal(start.params.config.model_reasoning_effort, 'xhigh');
    assert.equal(start.params.sandbox, 'read-only'); assert.equal(start.params.config['features.shell_tool'], false);
    assert.deepEqual(start.params.dynamicTools.map(tool => tool.name).sort(), ['ccng_read_approval_source', 'ccng_read_project_file', 'ccng_read_worker']);
    const read = await f.tool(reviewer, 'ccng_read_worker', { agentId: 'worker' });
    assert.equal(read.success, true); assert.equal(read.value.questions.length, 1);
    for (const [name, args] of [
      ['ccng_read_worker', { agentId: 'other' }],
      ['ccng_read_approval_source', { agentId: 'worker', reviewToken: 'foreign-token', path: 'check.py' }],
      ['ccng_review_approval', { agentId: 'worker', reviewToken: question.reviewToken, decision: 'approve' }],
      ['ccng_send_summary', { agentId: 'worker', summary: 'Forged authority' }],
    ]) assert.equal((await f.tool(reviewer, name, args)).success, false);
    await assert.rejects(f.coordinator.call({ threadId: reviewer.threadId, turnId: reviewer.turnId, tool: 'ccng_list_workers', arguments: {} }), /Only the active coordinator/);
    f.complete(reviewer);
    assert.equal(f.coordinator.reviewers.snapshot(question.reviewToken).status, 'ready');
    assert.equal(question.review, undefined); assert.equal(question.responding, undefined);
    assert.ok(f.workspace.pending.has(JSON.stringify(['worker', question.id])));
    assert.ok(!f.rpc.replies.some(reply => reply.id === question.id));
  } finally { await f.close(); }
});

test('a helper inspected by an analyst is rehashed by the unchanged final main approval', async () => {
  const f = await fixture();
  try {
    const path = join(f.cwd, 'check.py'); await writeFile(path, 'print("bounded diagnostic")\n');
    const question = f.ask({ command: `python3 ${path}` }), reviewer = await f.run(question);
    const source = await f.tool(reviewer, 'ccng_read_approval_source', { agentId: 'worker', reviewToken: question.reviewToken, path });
    assert.equal(source.success, true); assert.ok(source.value.sha256);
    assert.equal(f.coordinator.approvalSources.get(question.reviewToken).get(path).sha256, source.value.sha256);
    f.complete(reviewer); await writeFile(path, 'print("changed diagnostic")\n');
    await assert.rejects(f.review(question), /source or the command changed/);
    assert.equal(question.review, undefined); assert.ok(!f.rpc.replies.some(reply => reply.id === question.id));
  } finally { await f.close(); }
});

test('existing Coordinator list/read tools expose current ready advice and omit it after changed user instructions', async () => {
  const f = await fixture();
  try {
    const question = f.ask(), reviewer = await f.run(question); f.complete(reviewer);
    const listed = await f.call('ccng_list_workers', {});
    const ready = listed.find(worker => worker.id === 'worker').questions.find(row => row.reviewToken === question.reviewToken).approvalAnalysis;
    assert.equal(ready.status, 'ready'); assert.equal(ready.recommendation.decision, 'approve');
    assert.match(ready.notice, /recommendation|authority/i);
    const read = await f.call('ccng_read_worker', { agentId: 'worker' });
    assert.equal(read.questions.find(row => row.reviewToken === question.reviewToken).approvalAnalysis.recommendation.authorizationMessageId, 'user-worker');
    f.main.messages.push({ id: 'changed-main-scope', type: 'user', text: 'Recheck the target before continuing.' });
    const changed = await f.call('ccng_list_workers', {});
    const current = changed.find(worker => worker.id === 'worker').questions.find(row => row.reviewToken === question.reviewToken).approvalAnalysis;
    assert.equal(current?.recommendation, undefined, 'an old Coordinator needs no newly added dynamic tool, and receives no stale recommendation');
    assert.equal(question.review, undefined); assert.ok(!f.rpc.replies.some(reply => reply.id === question.id));
  } finally { await f.close(); }
});

test('paged actual user authority read by an analyst is rechecked by main before approval', async () => {
  const f = await fixture();
  try {
    const question = f.ask(), reviewer = await f.run(question), cursor = 'older-authority';
    f.rpc.pages.set(JSON.stringify(['worker', cursor]), history([user('old-user', authority)]));
    const read = await f.tool(reviewer, 'ccng_read_worker', { agentId: 'worker', cursor });
    assert.equal(read.success, true); assert.ok(read.value.messages.some(message => message.id === 'old-user'));
    assert.equal(f.coordinator.authorityPages.get(f.workspace.agent('worker')).get('old-user'), cursor);
    assert.equal((await f.coordinator.authorizationMessage(f.workspace.agent('worker'), 'old-user')).text, authority);
    f.rpc.pages.set(JSON.stringify(['worker', cursor]), history([user('old-user', 'This action is withdrawn.')]));
    await assert.rejects(f.review(question, { authorizationMessageId: 'old-user' }), /actual user instruction/);
    assert.ok(f.rpc.calls.filter(call => call.method === 'thread/turns/list' && call.params.cursor === cursor).length >= 3);
    assert.ok(!f.rpc.replies.some(reply => reply.id === question.id));
  } finally { await f.close(); }
});

test('stale identity, request, connection and real-user authority each revoke analyst reads', async () => {
  for (const change of ['worker', 'context', 'token', 'command', 'cwd', 'epoch', 'worker-user', 'main-user', 'stop-intent']) {
    const f = await fixture();
    try {
      const question = f.ask(), reviewer = await f.run(question), agent = f.workspace.agent('worker');
      if (change === 'worker') f.workspace.agents.set(agent.id, { ...agent });
      if (change === 'context') agent.questions = [{ ...question, params: { ...question.params } }];
      if (change === 'token') question.reviewToken = 'changed-token';
      if (change === 'command') question.params.command = 'changed-diagnostic';
      if (change === 'cwd') question.params.cwd = join(f.cwd, 'changed');
      if (change === 'epoch') f.workspace.requestEpoch++;
      if (change === 'worker-user') agent.messages.push({ id: 'new-worker-user', type: 'user', text: 'Stop this inspection.' });
      if (change === 'main-user') f.main.messages.push({ id: 'new-main-user', type: 'user', text: 'The earlier scope is withdrawn.' });
      if (change === 'stop-intent') agent.requestStopIntent = true;
      assert.equal((await f.tool(reviewer, 'ccng_read_worker', { agentId: 'worker' })).success, false, change);
      assert.ok(!f.rpc.replies.some(reply => reply.id === question.id));
    } finally { await f.close(); }
  }
});

test('new main user instructions during final historical-authority loading prevent an approval answer', async () => {
  const f = await fixture();
  try {
    const question = f.ask(), reviewer = await f.run(question), cursor = 'final-authority';
    f.rpc.pages.set(JSON.stringify(['worker', cursor]), history([user('old-user', authority)]));
    assert.equal((await f.tool(reviewer, 'ccng_read_worker', { agentId: 'worker', cursor })).success, true);
    const original = f.rpc.call.bind(f.rpc);
    f.rpc.call = async (method, params) => {
      if (method === 'thread/turns/list' && params.cursor === cursor) {
        f.main.messages.push({ id: 'withdraw-during-review', type: 'user', text: 'Stop; the earlier permission is withdrawn.' });
      }
      return original(method, params);
    };
    await assert.rejects(f.review(question, { authorizationMessageId: 'old-user' }), /changed|current|instruction/);
    assert.equal(question.review, undefined);
    assert.ok(!f.rpc.replies.some(reply => reply.id === question.id));
  } finally { await f.close(); }
});

test('a fresh main context read permits direct review while obsolete analyst work remains unfinished', async () => {
  const f = await fixture();
  try {
    const question = f.ask(), reviewer = await f.run(question);
    const oldFingerprint = reviewer.job.fingerprint;
    f.workspace.agent('worker').messages.push({ id: 'continue-with-scope', type: 'user', text: 'Continue the already authorized disposable inspection.' });
    assert.equal(f.coordinator.reviewerCurrent(reviewer.job), false);
    const current = await f.call('ccng_read_worker', { agentId: 'worker' });
    assert.ok(current.messages.some(message => message.id === 'continue-with-scope'));
    assert.notEqual(f.coordinator.reviewerBindings.get(question.reviewToken).fingerprint, oldFingerprint);
    assert.ok(f.coordinator.reviewers.active.has(reviewer), 'old native analysis remains owned until terminal evidence');
    const result = await f.review(question);
    assert.equal(result.outcome, 'resolved');
    assert.equal(f.rpc.replies.filter(reply => reply.id === question.id).length, 1, 'only the main Coordinator answers once');
  } finally { await f.close(); }
});

test('main may approve before a running analyst finishes, while authority, command and source checks remain mandatory', async () => {
  const f = await fixture();
  try {
    const path = join(f.cwd, 'immediate-check.py'), original = 'print("bounded synthetic diagnostic")\n';
    await writeFile(path, original);
    const command = `python3 ${path}`, question = f.ask({ command }), reviewer = await f.run(question);
    await f.call('ccng_read_worker', { agentId: 'worker' });
    await f.call('ccng_read_approval_source', { agentId: 'worker', reviewToken: question.reviewToken, path });
    assert.equal(f.coordinator.reviewers.snapshot(question.reviewToken).status, 'running');
    assert.equal(f.coordinator.reviewers.snapshot(question.reviewToken).recommendation, null);
    await assert.rejects(f.review(question, { authorizationQuote: 'The user never actually wrote this authorization.' }), /actual user instruction/);
    question.params.command = command + ' --changed';
    await assert.rejects(f.review(question), /changed|current/);
    question.params.command = command;
    await writeFile(path, original + '# Changed after main inspection.\n');
    await assert.rejects(f.review(question), /source or the command changed/);
    assert.ok(!f.rpc.replies.some(reply => reply.id === question.id));
    await writeFile(path, original);
    assert.equal((await f.review(question)).outcome, 'resolved');
    assert.equal(f.rpc.replies.filter(reply => reply.id === question.id).length, 1);
    assert.ok(f.coordinator.reviewers.active.has(reviewer), 'main approval does not cancel real analyst work without terminal evidence');
    assert.ok(!f.rpc.calls.some(call => call.method === 'turn/interrupt'));
  } finally { await f.close(); }
});

test('new and restored Coordinator guidance treats analyst assistance as optional and permits immediate guarded decisions', async () => {
  const f = await fixture();
  try {
    let eventText;
    f.main.turnId = null; f.main.thread.status = { type: 'idle' };
    f.workspace.send = async (_id, text) => { eventText = text; };
    f.coordinator.dirty.set('worker', new Set(['Current approval needs review']));
    await f.coordinator.pump();
    for (const guidance of [COORDINATOR_PROMPT, eventText]) {
      assert.match(guidance, /optional assistance/);
      assert.match(guidance, /decide immediately/);
      assert.match(guidance, /existing final checks/);
      assert.match(guidance, /finish promptly/);
      assert.match(guidance, /Preserve Request\/Concern\/Next/);
    }
    assert.match(COORDINATOR_PROMPT, /not a required barrier/);
  } finally { await f.close(); }
});

test('a manual Request/Concern/Next referral stays pending while independent analyses continue', async () => {
  const f = await fixture();
  try {
    const first = f.ask(), second = f.ask(), third = f.ask({}, 'other');
    const firstRun = await f.run(first); await f.run(second);
    const rationale = 'Request: Inspect the diagnostic target.\nConcern: The target is unclear.\nNext: Choose the intended target.';
    assert.equal((await f.review(first, { decision: 'ask', rationale, authorizationMessageId: null, authorizationQuote: null })).outcome, 'needs_user');
    await f.coordinator.refreshApprovalReviewers();
    f.complete(firstRun, { decision: 'ask', rationale, authorizationMessageId: null, authorizationQuote: null });
    await f.run(third);
    assert.equal(first.review.decision, 'ask'); assert.equal(first.review.rationale, rationale);
    assert.ok(f.workspace.pending.has(JSON.stringify(['worker', first.id])));
    assert.ok(!f.rpc.replies.some(reply => reply.id === first.id));
  } finally { await f.close(); }
});

test('an analyst native request stays unanswered and has an exact visible blocker', async () => {
  const f = await fixture();
  try {
    const question = f.ask(), reviewer = await f.run(question), id = 'analyst-human-request';
    f.workspace.request({ id, method: 'item/tool/requestUserInput', params: { threadId: reviewer.threadId, turnId: reviewer.turnId,
      questions: [{ id: 'choice', header: 'Target', question: 'Choose the target.', options: [] }] } });
    assert.equal(f.coordinator.reviewers.snapshot(question.reviewToken).status, 'blocked');
    assert.deepEqual(f.coordinator.reviewers.snapshot(question.reviewToken).pendingNativeRequests, [{ id, method: 'item/tool/requestUserInput' }]);
    assert.match(f.coordinator.snapshot().error, /needs a native decision/);
    assert.ok(f.coordinator.snapshot().error.includes(reviewer.threadId)); assert.ok(f.coordinator.snapshot().error.includes(id));
    const key = JSON.stringify([reviewer.threadId, id]);
    assert.equal(f.workspace.pending.get(key).params.questions[0].question, 'Choose the target.');
    assert.equal(f.workspace.pending.get(key).unassociated, true, 'the analyst never becomes an approval-capable worker');
    assert.ok(!f.rpc.replies.some(reply => reply.id === id));
    assert.equal(f.coordinator.reviewers.active.size, 1, 'the unresolved decision retains its slot');
    f.workspace.notification({ method: 'serverRequest/resolved', params: { threadId: reviewer.threadId, requestId: id } });
    assert.equal(f.coordinator.reviewers.snapshot(question.reviewToken).status, 'running');
    assert.equal(f.workspace.pending.has(key), false);
    assert.doesNotMatch(f.coordinator.snapshot().error || '', /needs a native decision/, 'a resolved native wait must not remain the current visible blocker');
  } finally { await f.close(); }
});

test('a later confirmed successful analysis clears its earlier visible unknown-progress warning', async () => {
  const f = await fixture();
  try {
    const question = f.ask(), reviewer = await f.run(question);
    f.coordinator.reviewers.timeoutMs = 0;
    await f.coordinator.refreshApprovalReviewers();
    assert.equal(f.coordinator.reviewers.snapshot(question.reviewToken).status, 'unknown');
    assert.match(f.coordinator.snapshot().error, /unknown/);
    f.complete(reviewer);
    assert.equal(f.coordinator.reviewers.snapshot(question.reviewToken).status, 'ready');
    assert.doesNotMatch(f.coordinator.snapshot().error || '', /Approval analysis unknown/, 'confirmed recovery replaces the prior unknown state');
    assert.ok(!f.rpc.replies.some(reply => reply.id === question.id));
  } finally { await f.close(); }
});

test('reading an available file approval as an analyst does not stamp a main Coordinator file read', async () => {
  const f = await fixture();
  try {
    const agent = f.workspace.agent('worker'), itemId = 'native-file-item';
    f.workspace.addItem(agent, { id: itemId, type: 'fileChange', changes: [{ path: 'example.txt', kind: { type: 'update' }, diff: '+fixture' }] }, 'work-turn', false, { live: true, completed: false });
    const question = f.ask({ itemId }, 'worker', 'item/fileChange/requestApproval');
    assert.equal(f.workspace.requestView(agent, question).nativeItem.state, 'available');
    const reviewer = await f.run(question);
    assert.equal((await f.tool(reviewer, 'ccng_read_worker', { agentId: 'worker' })).success, true);
    assert.equal(question.coordinatorFileContext, undefined);
    await assert.rejects(f.review(question), /Read this current file approval/);
  } finally { await f.close(); }
});

test('generic source fallback permits authenticated helper names while keeping auth paths and an existing ask pending', async () => {
  const f = await fixture();
  try {
    const path = join(f.cwd, 'authenticated-reader.py');
    await writeFile(path, 'print("bounded synthetic source")\n');
    const question = f.ask({ command: `python3 ${path}` }); await f.run(question);
    const rationale = 'Request: Inspect the helper.\nConcern: Target selection still needs input.\nNext: Choose the target.';
    await f.review(question, { decision: 'ask', rationale, authorizationMessageId: null, authorizationQuote: null });
    const source = await f.call('ccng_read_project_file', { agentId: 'worker', path });
    assert.equal(source.path, path); assert.match(source.sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(source.approvalBindings, [{ requestId: question.id, reviewToken: question.reviewToken }]);
    assert.equal(question.review.decision, 'ask'); assert.equal(question.review.rationale, rationale);
    const protectedPath = join(f.cwd, 'auth.py'); await writeFile(protectedPath, 'print("synthetic source")\n');
    f.ask({ command: `python3 ${protectedPath}` }, 'other');
    await assert.rejects(f.call('ccng_read_project_file', { agentId: 'other', path: protectedPath }), /hidden|sensitive|credential/);
    assert.ok(f.workspace.pending.has(JSON.stringify(['worker', question.id])));
    assert.ok(!f.rpc.replies.some(reply => reply.id === question.id));
  } finally { await f.close(); }
});
