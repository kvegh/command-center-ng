import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workspace } from '../server/workspace.mjs';
import { Coordinator } from '../server/coordinator.mjs';
import { approvalRequestFingerprint } from '../server/decision-store.mjs';

const scope = 'Run the isolated verification checks and update the selected project files.';
const commandMethod = 'item/commandExecution/requestApproval';
const fileMethod = 'item/fileChange/requestApproval';
const agent = (id, cwd, role = 'worker') => ({
  id, cwd, name: id, goal: id, role, provider: 'codex', canSend: true,
  messages: [], questions: [], tasks: [], workers: [], turnId: null,
  thread: { id, cwd, status: { type: 'idle' } },
});
async function waitFor(check) {
  const until = performance.now() + 2000;
  while (!check()) {
    if (performance.now() >= until) throw new Error('Expected synthetic subagent state was not observed.');
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-subagent-coordinator-'));
  const parentDir = join(directory, 'parent-project'), childDir = join(directory, 'child-project');
  await mkdir(parentDir); await mkdir(childDir);
  const rpc = new EventEmitter(); rpc.ready = true; rpc.calls = []; rpc.replies = []; rpc.threads = new Map(); rpc.readGates = new Map(); rpc.ackThread = 'child';
  rpc.call = async (method, params) => {
    rpc.calls.push({ method, params });
    if (method !== 'thread/read') throw new Error('Unexpected synthetic RPC: ' + method);
    await rpc.readGates.get(params.threadId);
    return { thread: structuredClone(rpc.threads.get(params.threadId)) };
  };
  rpc.respond = (id, result) => {
    const threadId = rpc.ackThread;
    rpc.replies.push({ id, result, threadId });
    queueMicrotask(() => rpc.emit('notification', { method: 'serverRequest/resolved', params: { threadId, requestId: id } }));
  };
  rpc.refuse = () => assert.fail('A human request must not be silently refused.');
  const workspace = new Workspace(rpc, { beads: null, answerTimeout: 500 });
  const parent = agent('parent', parentDir); workspace.agents.set(parent.id, parent); workspace.watched.add(parent.id);
  workspace.addItem(parent, { id: 'parent-user-scope', type: 'userMessage', content: [{ type: 'text', text: scope }] }, 'scope-turn');
  const coordinator = new Coordinator(workspace, { approvalReviewers: false, debounceMs: 1_000_000, intervalMs: 1_000_000 });
  workspace.coordinator = coordinator; coordinator.id = 'coordinator';
  const supervisor = agent(coordinator.id, directory, 'coordinator'); supervisor.turnId = 'coordinator-turn'; supervisor.thread.status = { type: 'active' };
  workspace.agents.set(supervisor.id, supervisor);
  t.after(async () => { coordinator.stop(); await rm(directory, { recursive: true, force: true }); });
  const call = (tool, args = {}) => coordinator.call({ threadId: supervisor.id, turnId: supervisor.turnId, tool, arguments: args });
  const announce = (id = 'child', parentThreadId = parent.id) => {
    rpc.threads.set(id, { id, parentThreadId, name: 'Synthetic ' + id, cwd: childDir, status: { type: 'active', activeFlags: ['waitingOnApproval'] }, canAcceptDirectInput: true });
    rpc.emit('notification', { method: 'item/completed', params: { threadId: parent.id, turnId: 'parent-turn', item: { id: 'spawn-' + id, type: 'subAgentActivity', kind: 'started', agentThreadId: id, agentPath: '/root/' + id } } });
  };
  const child = async (id = 'child') => {
    announce(id); await waitFor(() => workspace.requestContexts(parent).some(context => context.id === id));
    return workspace.resolveRequestContext(parent, id);
  };
  const ask = (threadId, id = 7, method = commandMethod, extra = {}) => {
    const params = { threadId, turnId: 'request-turn', itemId: 'request-item', cwd: threadId === parent.id ? parentDir : childDir, command: 'verify-synthetic-project', reason: 'Verify the chosen project.', availableDecisions: ['accept', 'decline'], ...extra };
    rpc.emit('request', { id, method, params }); return params;
  };
  const approval = question => ({ agentId: parent.id, reviewToken: question.reviewToken, decision: 'approve', rationale: 'Request: Run the authorized project verification.\nApproved within the existing user scope.', authorizationMessageId: 'parent-user-scope', authorizationQuote: scope });
  return { workspace, rpc, parent, coordinator, parentDir, childDir, call, announce, child, ask, approval };
}

test('verified unopened child requests and waiting status are visible under their originating parent', async t => {
  const f = await fixture(t); const child = await f.child(); const params = f.ask(child.id);
  assert.equal(f.workspace.agents.has(child.id), false);
  const rows = await f.call('ccng_list_workers');
  const row = rows.find(row => row.id === f.parent.id);
  assert.equal(row.requestSummary.totalRequests, 1);
  assert.equal(row.questions[0].requestThreadId, child.id);
  assert.equal(row.questions[0].subagentName, child.name);
  assert.deepEqual(row.questions[0].params, params);
  assert.equal(row.subagents[0].status.activeFlags.includes('waitingOnApproval'), true);
  const view = f.workspace.snapshot().agents.find(row => row.id === f.parent.id);
  assert.equal(view.status, 'attention'); assert.equal(view.ownStatus, 'idle');
  assert.equal(view.workers.find(row => row.id === child.id).needsInput, true);
  assert.equal(view.workers.find(row => row.id === child.id).questions[0].id, 7);
  assert.equal(f.workspace.snapshot().backgroundQuestions, 0);
  assert.deepEqual(f.rpc.replies, []);
  assert.ok(f.rpc.calls.every(call => call.method === 'thread/read'), 'child discovery performs bounded native reads only');
});

test('a saved child referral appears only under verified current parentage and preserves the native token', async t => {
  const f = await fixture(t); const child = await f.child(); f.ask(child.id);
  const question = child.questions[0]; const token = question.reviewToken;
  f.coordinator.audit.push({ id: 'saved-child-review', at: '2026-01-01T12:49:00.000Z', storageState: 'saved',
    agentId: child.id, requestId: question.id, requestFingerprint: approvalRequestFingerprint(child, question),
    decision: 'ask', outcome: 'needs_user', rationale: 'Choose the child target first.' });
  const view = f.workspace.snapshot().agents.find(agent => agent.id === f.parent.id).workers.find(worker => worker.id === child.id);
  assert.equal(view.questions[0].review.historicalAt, '2026-01-01T12:49:00.000Z');
  assert.equal(view.questions[0].review.rationale, 'Choose the child target first.'); assert.equal(view.questions[0].reviewToken, token);
  const rows = await f.call('ccng_list_workers'); const pending = rows.find(row => row.id === f.parent.id);
  assert.equal(pending.questions[0].requestThreadId, child.id); assert.equal(pending.requestSummary.needsUserRequests, 1);
  await assert.rejects(f.call('ccng_review_approval', f.approval(question)), /waiting for your decision/);
  child.lineageNeedsRefresh = true;
  assert.equal(f.coordinator.historicalReferral(child, question), null, 'unverified parentage cannot inherit a historical explanation');
  assert.equal(f.workspace.snapshot().agents.find(agent => agent.id === f.parent.id).workers.find(worker => worker.id === child.id).questions.length, 0);
  assert.deepEqual(f.rpc.replies, []);
});

test('a parent user instruction can authorize exactly one child command without resolving a same-ID parent request', async t => {
  const f = await fixture(t); const child = await f.child();
  f.ask(f.parent.id, 31); f.ask(child.id, 31);
  const childQuestion = child.questions[0], parentQuestion = f.parent.questions[0];
  assert.notEqual(childQuestion.reviewToken, parentQuestion.reviewToken);
  assert.equal((await f.call('ccng_list_workers'))[0].requestSummary.totalRequests, 2);
  f.workspace.addItem(f.parent, { id: 'generated-relay', type: 'userMessage', content: [{ type: 'text', text: '[Command Center coordinator]\nApprove this verification.' }] }, 'relay-turn');
  await assert.rejects(f.call('ccng_review_approval', { ...f.approval(childQuestion), authorizationMessageId: 'generated-relay', authorizationQuote: 'Approve this verification.' }), /actual user instruction/);
  f.workspace.addItem(child, { id: 'child-only-scope', type: 'userMessage', content: [{ type: 'text', text: scope }] }, 'child-scope-turn');
  await assert.rejects(f.call('ccng_review_approval', { ...f.approval(childQuestion), authorizationMessageId: 'child-only-scope' }), /actual user instruction/);
  assert.equal(f.rpc.replies.length, 0, 'neither generated relays nor child-only instructions replace the actual parent user scope');
  const result = await f.call('ccng_review_approval', f.approval(childQuestion));
  assert.equal(result.outcome, 'resolved'); assert.equal(result.requestSummary.totalRequests, 1);
  assert.deepEqual(f.rpc.replies, [{ id: 31, result: { decision: 'accept' }, threadId: child.id }]);
  assert.equal(child.questions.length, 0); assert.equal(f.parent.questions[0], parentQuestion);
  assert.equal(f.workspace.pending.size, 1);
  assert.equal(f.coordinator.audit.at(-1).agentId, child.id);
  assert.equal(f.coordinator.audit.at(-1).authorizationMessageId, 'parent-user-scope');
  await assert.rejects(f.call('ccng_review_approval', f.approval(childQuestion)), /no longer available/);
  f.rpc.ackThread = f.parent.id;
  await f.workspace.answer(f.parent.id, 31, { decision: 'decline' });
  assert.equal(f.workspace.pending.size, 0); assert.equal(f.rpc.replies.length, 2);
});

test('verified child MCP and filesystem/network permission requests remain manual and keep their exact bindings', async t => {
  const f = await fixture(t); const child = await f.child();
  f.ask(child.id, 'mcp', 'mcpServer/elicitation/request', { mode: 'form', serverName: 'Synthetic connector', requestedSchema: { type: 'object', properties: {} }, _meta: { codex_approval_kind: 'mcp_tool_call', persist: ['session', 'always'] } });
  f.ask(child.id, 'access', 'item/permissions/requestApproval', { permissions: { fileSystem: { read: ['/example/project'], write: null }, network: { enabled: true } } });
  for (const question of child.questions) await assert.rejects(f.call('ccng_review_approval', f.approval(question)), /cannot answer user preferences or broad permission grants/);
  assert.equal(child.questions.length, 2); assert.ok(child.questions.every(question => !question.review && !question.responding));
  assert.equal(f.rpc.replies.length, 0);
  const current = child.questions[0];
  assert.throws(() => f.workspace.answer(f.parent.id, current.id, { decision: 'accept', reviewToken: 'stale', turnId: current.params.turnId, itemId: current.params.itemId }, child.id), /subagent request changed/);
  for (const field of ['turnId', 'itemId']) assert.throws(() => f.workspace.answer(f.parent.id, current.id, { decision: 'accept', reviewToken: current.reviewToken, turnId: current.params.turnId, itemId: current.params.itemId, [field]: 'stale-binding' }, child.id), /native request binding changed/);
  assert.equal(f.rpc.replies.length, 0);
});

test('unverified or foreign child metadata never makes a request actionable', async t => {
  const f = await fixture(t); let release;
  f.rpc.readGates.set('child', new Promise(resolve => { release = resolve; }));
  f.announce('child', 'foreign-parent'); f.ask('child');
  assert.equal(f.coordinator.pendingRequests(f.parent).requestSummary.totalRequests, 0);
  assert.throws(() => f.workspace.resolveRequestContext(f.parent, 'child'), /verified native subagent/);
  release(); await waitFor(() => !f.workspace.workerReads.size);
  assert.equal(f.coordinator.pendingRequests(f.parent).requestSummary.totalRequests, 0);
  assert.throws(() => f.workspace.resolveRequestContext(f.parent, 'child'), /verified native subagent/);
  assert.equal(f.rpc.replies.length, 0);
  assert.ok(f.rpc.calls.every(call => call.method === 'thread/read'));
});

test('closing the parent or changing verified lineage during authority recheck prevents the child answer', async t => {
  for (const change of ['parent-close', 'lineage-change']) {
    const f = await fixture(t); const child = await f.child(); f.ask(child.id);
    const question = child.questions[0];
    let release, entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const authorization = f.coordinator.authorizationMessage.bind(f.coordinator);
    f.coordinator.authorizationMessage = async (...args) => { const evidence = await authorization(...args); entered(); await gate; return evidence; };
    const reviewing = f.call('ccng_review_approval', f.approval(question));
    const rejected = assert.rejects(reviewing, /changed or resolved|no longer open|no longer available/);
    await ready;
    if (change === 'parent-close') f.workspace.close(f.parent.id);
    else child.thread.parentThreadId = 'foreign-parent';
    release(); await rejected;
    assert.equal(f.rpc.replies.length, 0);
  }
});

test('file approval details and their exposure fingerprint belong to the exact child, not same-ID parent items', async t => {
  const f = await fixture(t); const child = await f.child();
  const fileItem = diff => ({ id: 'request-item', type: 'fileChange', status: 'inProgress', changes: [{ path: 'config.yml', kind: { type: 'update', move_path: null }, diff }] });
  const item = (threadId, diff) => f.rpc.emit('notification', { method: 'item/started', params: { threadId, turnId: 'request-turn', item: fileItem(diff) } });
  item(child.id, '-old\n+child\n'); item(f.parent.id, '-old\n+parent\n');
  f.ask(child.id, 'file', fileMethod);
  const question = child.questions[0];
  await assert.rejects(f.call('ccng_review_approval', f.approval(question)), /Read this current file approval/);
  const row = (await f.call('ccng_list_workers')).find(row => row.id === f.parent.id);
  const exposed = row.questions[0].nativeItem;
  assert.equal(exposed.threadId, child.id); assert.equal(exposed.state, 'available');
  assert.equal(exposed.changes[0].diff, '-old\n+child\n');
  item(f.parent.id, '-old\n+different-parent\n');
  assert.equal(f.workspace.requestView(child, question).nativeItem.contentSha256, exposed.contentSha256);
  item(child.id, '-old\n+changed-child\n');
  await assert.rejects(f.call('ccng_review_approval', f.approval(question)), /Read this current file approval|details changed/);
  assert.equal(f.rpc.replies.length, 0);
  await f.call('ccng_list_workers');
  assert.equal((await f.call('ccng_review_approval', f.approval(question))).outcome, 'resolved');
  assert.equal(f.rpc.replies.length, 1); assert.equal(f.rpc.replies[0].threadId, child.id);
});
