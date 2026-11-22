import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { ClaudeSessions, CLAUDE_APPROVAL, CLAUDE_QUESTION } from '../server/claude.mjs';
import { Workspace } from '../server/workspace.mjs';
import { HANDOFF_CHECKPOINT_REQUEST, SUMMARY_REQUEST } from '../server/branch-summary.mjs';

const branchNativeId = '11111111-2222-4333-8444-555555555555';
const parentNativeId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const branchId = 'claude-' + branchNativeId;
const parentId = 'claude-' + parentNativeId;
const summary = 'The design is saved. Job 47 remains running; the parent must monitor it. The blocked question and deferred work remain unfinished.';

class Events {
  values = []; waiting = null; ended = false;
  push(value) { if (this.waiting) { this.waiting({ value, done: false }); this.waiting = null; } else this.values.push(value); }
  next() { if (this.values.length) return Promise.resolve({ value: this.values.shift(), done: false }); if (this.ended) return Promise.resolve({ done: true }); return new Promise(resolve => { this.waiting = resolve; }); }
  close() { this.ended = true; this.waiting?.({ done: true }); this.waiting = null; }
  [Symbol.asyncIterator]() { return this; }
}

async function until(check) {
  const deadline = Date.now() + 1500;
  while (!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 2));
  assert.ok(check(), 'Expected native Claude handback event was not observed.');
}

async function fixture(options = {}) {
  const queries = new Map(), inputs = [], events = [], controls = [], rpcCalls = [], links = [], external = new Set();
  const sessions = new Map([branchNativeId, parentNativeId].map(sessionId => [sessionId, {
    info: { sessionId, cwd: tmpdir(), summary: sessionId === branchNativeId ? 'Explore branch' : 'Parent project' }, messages: []
  }]));
  const originalTasks = [
    { id: 'active-task', title: 'Continue work', status: 'in_progress', assignee: 'worker', dependencies: [], labels: ['ccng-session:' + branchId] },
    { id: 'blocked-task', title: 'Retain question', status: 'blocked', assignee: 'worker', dependencies: [{ id: 'active-task' }], labels: ['ccng-chat-question', 'ccng-session:' + branchId] },
    { id: 'deferred-task', title: 'Keep deferred work', status: 'deferred', assignee: 'worker', dependencies: [], labels: ['ccng-session:' + branchId] }
  ];
  const tasks = structuredClone(originalTasks);
  function echo(query, input, persist = true) {
    if (persist) { sessions.get(query.nativeId).messages.push(structuredClone(input)); events.push(['persist', query.nativeId, input.uuid]); }
    query.push({ type: 'system', subtype: 'session_state_changed', state: 'running', session_id: query.nativeId });
    query.push(structuredClone(input));
  }
  function complete(query, input, text = 'The branch reached a safe checkpoint.', isError = false) {
    const reply = { type: 'assistant', uuid: randomUUID(), session_id: query.nativeId, parent_tool_use_id: null,
      message: { role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'end_turn' } };
    sessions.get(query.nativeId).messages.push(reply); query.push(reply);
    if (options.background && input.message.content.startsWith(HANDOFF_CHECKPOINT_REQUEST)) query.push({ type: 'system', subtype: 'background_tasks_changed',
      session_id: query.nativeId, tasks: [{ task_id: 'unfinished-local-task', task_type: options.background, description: 'Work still belongs to this branch.' }] });
    query.push({ type: 'result', subtype: isError ? 'error_during_execution' : 'success', session_id: query.nativeId,
      is_error: isError, result: text, ...(isError ? { errors: ['The checkpoint failed.'] } : {}) });
    query.push({ type: 'system', subtype: 'session_state_changed', state: 'idle', session_id: query.nativeId });
  }
  const sdk = {
    listSessions: async () => [...sessions.values()].map(session => session.info),
    getSessionInfo: async id => sessions.get(id)?.info,
    getSessionMessages: async (id, { offset = 0, limit = 500 } = {}) => structuredClone(sessions.get(id)?.messages.slice(offset, offset + limit) || []),
    query(params) {
      assert.equal(typeof params.options.systemPrompt.append, 'string', 'the native SDK receives formatted instruction text');
      if (params.options.resume === parentNativeId && options.failParentStartCount > 0) {
        options.failParentStartCount--;
        throw new Error('The parent process could not start before input enqueue.');
      }
      const query = new Events(); query.nativeId = params.options.resume; query.params = params; queries.set(query.nativeId, query);
      query.close = () => { controls.push(['force-close', query.nativeId]); Events.prototype.close.call(query); };
      query.interrupt = async () => { controls.push(['interrupt', query.nativeId]); };
      query.driver = (async () => {
        for await (const input of params.prompt) {
          inputs.push({ nativeId: query.nativeId, input }); events.push(['input', query.nativeId, input.uuid]);
          echo(query, input, !(query.nativeId === parentNativeId && options.noParentReceipt));
          const checkpoint = input.message.content.startsWith(HANDOFF_CHECKPOINT_REQUEST);
          if (query.nativeId === parentNativeId || (options.holdInitial && input.message.content === 'Existing branch work.') || (options.holdCheckpoint && checkpoint)) continue;
          const summaryRequest = input.message.content.startsWith(SUMMARY_REQUEST);
          const isError = (checkpoint && options.failCheckpointCount > 0) || (summaryRequest && options.failSummaryCount > 0);
          if (isError && checkpoint) options.failCheckpointCount--;
          if (isError && summaryRequest) options.failSummaryCount--;
          const reply = summaryRequest ? options.summaryReplies?.shift() ?? JSON.stringify({ summary }) : undefined;
          complete(query, input, reply, isError);
        }
        events.push(['eof', query.nativeId]); query.closeFromEof = true; Events.prototype.close.call(query);
      })();
      return query;
    }
  };
  const runtime = new ClaudeSessions({ loadSdk: async () => sdk, executable: async () => '/example/bin/claude', activeSessions: async () => [...external] });
  assert.equal(await runtime.initialize(), true);
  const rpc = new EventEmitter(); rpc.ready = false;
  rpc.call = async (method, params) => { rpcCalls.push({ method, params }); throw new Error('Claude handback must not call disconnected Codex.'); };
  const beads = {
    linked: async (_cwd, id) => ({ status: 'available', tasks: structuredClone(tasks.filter(task => task.labels.includes('ccng-session:' + id))) }),
    handoff: async (cwd, child, parent) => {
      links.push({ cwd, child, parent });
      for (const task of tasks.filter(task => task.labels.includes('ccng-session:' + child))) if (!task.labels.includes('ccng-session:' + parent)) task.labels.push('ccng-session:' + parent);
      return { taskIds: tasks.map(task => task.id), tasks: structuredClone(tasks) };
    }
  };
  const workspace = new Workspace(rpc, { claude: runtime, beads, summaryTimeout: 1000, handoffOptions: { timeout: options.timeout || 1000, poll: 2 } });
  workspace.instructionContext = async () => ({ scope: { kind: 'application', value: 'Preserve authorized project scope and native requests.' } });
  const branch = await workspace.open(branchId), parent = await workspace.open(parentId);
  branch.parentId = parentId;
  return { workspace, runtime, sdk, branch, parent, queries, inputs, events, controls, rpcCalls, links, sessions, tasks, originalTasks, external, complete,
    async done() { const job = workspace.returnJobs.get(branchId); if (job) await job; },
    async close() { await runtime.shutdown(); await Promise.all([...queries.values()].map(query => query.driver)); }
  };
}

test('Claude one-click handback checkpoints, summarizes, verifies native receipt and closes by EOF with Codex disconnected', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(f.workspace.startHandoff(branchId), { id: branchId, parentId });
    await f.done();
    assert.equal(f.branch.handoff, undefined);
    assert.equal(f.workspace.agents.has(branchId), false); assert.equal(f.workspace.agents.get(parentId), f.parent);
    assert.deepEqual(f.workspace.handoffs.completions, [{ branchId, parentId }]);
    const childInputs = f.inputs.filter(item => item.nativeId === branchNativeId);
    assert.equal(childInputs.length, 2);
    assert.ok(childInputs[0].input.message.content.startsWith(HANDOFF_CHECKPOINT_REQUEST));
    assert.match(childInputs[0].input.message.content, /Do not interrupt unsafe work|settle branch-owned local background/);
    assert.ok(childInputs[1].input.message.content.startsWith(SUMMARY_REQUEST));
    assert.match(childInputs[1].input.message.content, /Return only a JSON object/);
    const delivery = f.inputs.find(item => item.nativeId === parentNativeId);
    assert.match(delivery.input.message.content, /Job 47 remains running; the parent must monitor it/);
    assert.match(delivery.input.message.content, /All 3 linked branch tasks/);
    assert.ok(f.events.findIndex(event => event[0] === 'persist' && event[1] === parentNativeId)
      < f.events.findIndex(event => event[0] === 'eof' && event[1] === branchNativeId));
    assert.equal(f.queries.get(branchNativeId).closeFromEof, true);
    assert.equal(f.runtime.runs.has(parentId), true, 'parent work continues after receipt without waiting for its next result');
    assert.ok(f.links.length >= 2, 'links are checked again immediately before closure');
    assert.deepEqual(f.tasks.map(({ labels, ...task }) => task), f.originalTasks.map(({ labels, ...task }) => task));
    assert.ok(f.tasks.every(task => task.labels.includes('ccng-session:' + branchId) && task.labels.includes('ccng-session:' + parentId)));
    assert.ok(f.sessions.get(branchNativeId).messages.length > 0, 'native branch history remains intact');
    assert.deepEqual(f.controls, []); assert.deepEqual(f.rpcCalls, []);
  } finally { await f.close(); }
});

test('Claude queued parent input without persisted receipt retains the branch and never duplicates delivery on retry', async () => {
  const f = await fixture({ noParentReceipt: true, timeout: 80 });
  try {
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.branch.handoff.phase, 'failed'); assert.match(f.branch.handoff.error, /receipt.*unconfirmed/i);
    assert.equal(f.workspace.agents.get(branchId), f.branch); assert.equal(f.queries.get(branchNativeId).closeFromEof, undefined);
    f.workspace.startHandoff(branchId); await f.done();
    assert.match(f.branch.handoff.error, /uncertain.*no duplicate/i);
    const deliveries = f.inputs.filter(item => item.nativeId === parentNativeId);
    assert.equal(deliveries.length, 1); assert.equal(f.inputs.length, 3, 'checkpoint and summary are not repeated either');
    f.sessions.get(parentNativeId).messages.push(structuredClone(deliveries[0].input));
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.workspace.agents.has(branchId), false, f.branch.handoff?.error);
    assert.equal(f.inputs.length, 3); assert.deepEqual(f.controls, []); assert.deepEqual(f.rpcCalls, []);
  } finally { await f.close(); }
});

test('Claude active branch work finishes before a checkpoint is enqueued, without interrupting it', async () => {
  const f = await fixture({ holdInitial: true });
  try {
    await f.workspace.send(branchId, 'Existing branch work.');
    await until(() => f.inputs.length === 1 && f.runtime.runs.get(branchId).turnInputIds.size === 1);
    const originalTurn = f.branch.turnId;
    f.workspace.startHandoff(branchId);
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(f.inputs.length, 1); assert.equal(f.branch.turnId, originalTurn); assert.deepEqual(f.controls, []);
    f.complete(f.queries.get(branchNativeId), f.inputs[0].input); await f.done();
    assert.equal(f.workspace.agents.has(branchId), false, f.branch.handoff?.error);
    assert.equal(f.inputs.filter(item => item.nativeId === branchNativeId).length, 3);
    assert.deepEqual(f.controls, []);
  } finally { await f.close(); }
});

for (const background of ['local_bash', 'local_agent']) test(`Claude ${background} work surviving the checkpoint keeps the branch and task links unchanged`, async () => {
  const f = await fixture({ background });
  try {
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.branch.handoff.phase, 'failed'); assert.match(f.branch.handoff.error, /local background tasks/);
    assert.equal(f.workspace.agents.get(branchId), f.branch);
    assert.equal(f.inputs.length, 1); assert.deepEqual(f.links, []); assert.deepEqual(f.tasks, f.originalTasks);
    assert.deepEqual((await f.runtime.inspectHandoff(f.branch)).backgroundTasks.map(task => task.id), ['unfinished-local-task']);
    assert.deepEqual(f.controls, []); assert.deepEqual(f.rpcCalls, []);
  } finally { await f.close(); }
});

for (const owner of ['branch', 'parent']) for (const [kind, method, params] of [
  ['approval', CLAUDE_APPROVAL, { toolName: 'Read', input: { file_path: '/example/project/README.md' } }],
  ['question', CLAUDE_QUESTION, { questions: [{ header: 'Next step', question: 'Which approach should continue?', options: [{ label: 'Keep', description: 'Keep the current design.' }] }] }]
]) test(`Claude ${owner} ${kind} remains pending and is never answered to advance handback`, async () => {
  const f = await fixture({ timeout: 80 });
  try {
    const agent = f[owner]; let answered = false;
    void f.runtime.pending(agent, 'manual-request', method, params, new AbortController().signal).then(() => { answered = true; });
    const question = agent.questions[0], callback = f.runtime.requests.get(JSON.stringify([agent.id, question.id]));
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.branch.handoff.phase, 'failed'); assert.equal(f.workspace.agents.get(branchId), f.branch);
    assert.equal(agent.questions[0], question); assert.equal(f.runtime.requests.get(JSON.stringify([agent.id, question.id])), callback);
    assert.equal(answered, false); assert.equal(question.responding, undefined);
    assert.equal(f.inputs.some(item => item.nativeId === parentNativeId), false);
    assert.deepEqual(f.links, []); assert.deepEqual(f.controls, []); assert.deepEqual(f.rpcCalls, []);
  } finally { await f.close(); }
});

test('Claude external ownership discovered at handback is preserved without starting or cancelling a process', async () => {
  const f = await fixture({ timeout: 80 });
  try {
    f.external.add(branchNativeId);
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.branch.handoff.phase, 'failed'); assert.equal(f.branch.externalSession, true);
    assert.equal(f.workspace.agents.get(branchId), f.branch); assert.equal(f.branch.canSend, false);
    assert.equal(f.queries.size, 0); assert.deepEqual(f.inputs, []); assert.deepEqual(f.links, []);
    assert.deepEqual(f.controls, []); assert.deepEqual(f.rpcCalls, []);
  } finally { await f.close(); }
});

test('Claude known pre-enqueue idle rejection clears the unsent checkpoint so an explicit retry can proceed', async () => {
  const f = await fixture({ holdInitial: true });
  try {
    await f.workspace.send(branchId, 'Existing branch work.');
    await until(() => f.inputs.length === 1 && f.runtime.runs.get(branchId).turnInputIds.size === 1);
    const query = f.queries.get(branchNativeId);
    f.complete(query, f.inputs[0].input);
    await until(() => f.branch.thread.status.type === 'idle');
    let injectBackground = true;
    const context = f.workspace.instructionContext;
    f.workspace.instructionContext = async agent => {
      if (agent === f.branch && injectBackground) {
        injectBackground = false;
        query.push({ type: 'system', subtype: 'background_tasks_changed', session_id: branchNativeId,
          tasks: [{ task_id: 'raced-local-task', task_type: 'local_bash' }] });
        await until(() => f.runtime.runs.get(branchId).backgroundTasks.has('raced-local-task'));
      }
      return context(agent);
    };
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.branch.handoff.phase, 'failed'); assert.match(f.branch.handoff.error, /not sent/);
    assert.equal(f.inputs.length, 1, 'known rejection did not enqueue a checkpoint');
    assert.equal(f.workspace.handoffs.records.get(branchId).claudeCheckpoint, undefined);
    query.push({ type: 'system', subtype: 'background_tasks_changed', session_id: branchNativeId, tasks: [] });
    await until(() => f.runtime.runs.get(branchId).backgroundTasks.size === 0);
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.workspace.agents.has(branchId), false, f.branch.handoff?.error);
    assert.equal(f.inputs.filter(item => item.input.message.content.startsWith(HANDOFF_CHECKPOINT_REQUEST)).length, 1);
    assert.deepEqual(f.controls, []); assert.deepEqual(f.rpcCalls, []);
  } finally { await f.close(); }
});

test('Claude unknown checkpoint acceptance retains its exact UUID and explicit retries never enqueue a duplicate', async () => {
  const f = await fixture({ holdCheckpoint: true, timeout: 80 });
  try {
    let injected = false;
    const uncertainAcceptance = id => {
      if (!injected && id === branchId && f.runtime.runs.get(branchId)?.pendingInputs.size) {
        injected = true;
        throw new Error('Native input acceptance became unknown.');
      }
    };
    f.runtime.on('change', uncertainAcceptance);
    f.workspace.startHandoff(branchId); await f.done();
    f.runtime.off('change', uncertainAcceptance);
    assert.equal(injected, true); assert.equal(f.branch.handoff.phase, 'failed');
    assert.match(f.branch.handoff.error, /acceptance became unknown/);
    const request = f.workspace.handoffs.records.get(branchId).claudeCheckpoint;
    assert.ok(request?.messageId, 'unclassified send failure retains its request identity');
    await until(() => f.inputs.length === 1 && f.runtime.runs.get(branchId).turnInputIds.has(request.messageId));
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.branch.handoff.phase, 'failed'); assert.equal(f.inputs.length, 1);
    assert.equal(f.workspace.handoffs.records.get(branchId).claudeCheckpoint.messageId, request.messageId);
    f.complete(f.queries.get(branchNativeId), f.inputs[0].input);
    await until(() => f.branch.thread.status.type === 'idle');
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.workspace.agents.has(branchId), false, f.branch.handoff?.error);
    assert.equal(f.inputs.filter(item => item.input.message.content.startsWith(HANDOFF_CHECKPOINT_REQUEST)).length, 1);
    assert.deepEqual(f.controls, []);
  } finally { await f.close(); }
});

test('Claude completed malformed summary retains the branch and an explicit retry requests a fresh valid summary', async () => {
  const f = await fixture({ summaryReplies: ['This is not a JSON summary.', JSON.stringify({ summary })] });
  try {
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.branch.handoff.phase, 'failed'); assert.match(f.branch.handoff.error, /did not return a concise summary/);
    assert.equal(f.workspace.agents.get(branchId), f.branch); assert.deepEqual(f.links, []);
    assert.equal(f.workspace.handoffs.records.get(branchId).claudeSummary, undefined);
    assert.equal(f.inputs.filter(item => item.nativeId === parentNativeId).length, 0);
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.workspace.agents.has(branchId), false, f.branch.handoff?.error);
    const summaries = f.inputs.filter(item => item.input.message.content.startsWith(SUMMARY_REQUEST));
    assert.equal(summaries.length, 2); assert.notEqual(summaries[0].input.uuid, summaries[1].input.uuid);
    assert.equal(f.inputs.filter(item => item.nativeId === parentNativeId).length, 1);
    assert.deepEqual(f.controls, []);
  } finally { await f.close(); }
});

test('Claude completed failed checkpoint can be retried after native idle without leaving a stale run error gate', async () => {
  const f = await fixture({ failCheckpointCount: 1 });
  try {
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.branch.handoff.phase, 'failed'); assert.match(f.branch.handoff.error, /handback request failed/);
    assert.equal(f.branch.thread.status.type, 'idle'); assert.equal(f.branch.finishedTurn.status, 'failed');
    assert.equal(f.workspace.agents.get(branchId), f.branch); assert.deepEqual(f.links, []);
    assert.equal(f.workspace.handoffs.records.get(branchId).claudeCheckpoint, undefined);
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.workspace.agents.has(branchId), false, f.branch.handoff?.error);
    const checkpoints = f.inputs.filter(item => item.input.message.content.startsWith(HANDOFF_CHECKPOINT_REQUEST));
    assert.equal(checkpoints.length, 2); assert.notEqual(checkpoints[0].input.uuid, checkpoints[1].input.uuid);
    assert.equal(f.inputs.filter(item => item.nativeId === parentNativeId).length, 1);
    assert.deepEqual(f.controls, []); assert.deepEqual(f.rpcCalls, []);
  } finally { await f.close(); }
});

test('Claude failed summary requests a fresh checkpoint and summary on explicit retry', async () => {
  const f = await fixture({ failSummaryCount: 1 });
  try {
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.branch.handoff.phase, 'failed'); assert.match(f.branch.handoff.error, /handback request failed/);
    assert.equal(f.branch.thread.status.type, 'idle'); assert.equal(f.workspace.agents.get(branchId), f.branch);
    assert.equal(f.workspace.handoffs.records.get(branchId).claudeCheckpoint, undefined);
    assert.equal(f.workspace.handoffs.records.get(branchId).claudeSummary, undefined);
    assert.deepEqual(f.links, []); assert.equal(f.inputs.some(item => item.nativeId === parentNativeId), false);
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.workspace.agents.has(branchId), false, f.branch.handoff?.error);
    for (const prefix of [HANDOFF_CHECKPOINT_REQUEST, SUMMARY_REQUEST]) {
      const requests = f.inputs.filter(item => item.input.message.content.startsWith(prefix));
      assert.equal(requests.length, 2); assert.notEqual(requests[0].input.uuid, requests[1].input.uuid);
    }
    assert.equal(f.inputs.filter(item => item.nativeId === parentNativeId).length, 1);
    assert.deepEqual(f.controls, []); assert.deepEqual(f.rpcCalls, []);
  } finally { await f.close(); }
});

test('Claude known parent delivery failure before enqueue permits an explicit retry without repeating the summary', async () => {
  const f = await fixture({ failParentStartCount: 1 });
  try {
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.branch.handoff.phase, 'failed'); assert.match(f.branch.handoff.error, /before input enqueue/);
    assert.equal(f.workspace.agents.get(branchId), f.branch); assert.equal(f.inputs.length, 2);
    const record = f.workspace.handoffs.records.get(branchId);
    assert.equal(record.sendAttempted, false); assert.equal(record.claudeDeliveryId, undefined);
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.workspace.agents.has(branchId), false, f.branch.handoff?.error);
    assert.equal(f.inputs.length, 3, 'the accepted checkpoint and summary are reused');
    assert.equal(f.inputs.filter(item => item.nativeId === parentNativeId).length, 1);
    assert.deepEqual(f.controls, []); assert.deepEqual(f.rpcCalls, []);
  } finally { await f.close(); }
});

test('Claude completed handback can reopen native history and accept ordinary followups with task links preserved', async () => {
  const f = await fixture();
  try {
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.workspace.agents.has(branchId), false, f.branch.handoff?.error);
    const nativeHistory = structuredClone(f.sessions.get(branchNativeId).messages), tasks = structuredClone(f.tasks);
    const reopened = await f.workspace.open(branchId);
    assert.equal(reopened, f.branch, 'the adapter retains its native conversation record');
    assert.equal(reopened.handoff, undefined); assert.equal(reopened.returnSummary, undefined);
    assert.deepEqual(f.sessions.get(branchNativeId).messages, nativeHistory);
    assert.deepEqual(reopened.tracker.tasks.map(task => task.id), tasks.map(task => task.id));
    assert.deepEqual(f.tasks, tasks); assert.equal(reopened.parentId, parentId);
    const followup = await f.workspace.send(branchId, 'Continue the reopened branch.');
    await until(() => f.sessions.get(branchNativeId).messages.some(message => message.uuid === followup.messageId));
    assert.ok(reopened.messages.some(message => message.nativeMessageId === followup.messageId));
    assert.deepEqual(f.sessions.get(branchNativeId).messages.slice(0, nativeHistory.length), nativeHistory);
    assert.deepEqual(f.tasks, tasks); assert.deepEqual(f.controls, []); assert.deepEqual(f.rpcCalls, []);
  } finally { await f.close(); }
});

test('Claude summary receipt failure followed by ordinary work invalidates the earlier completed summary on retry', async () => {
  const oldSummary = 'The earlier approach is still proposed.';
  const currentSummary = 'The newer decision supersedes the earlier proposal.';
  const f = await fixture({ summaryReplies: [JSON.stringify({ summary: oldSummary }), JSON.stringify({ summary: currentSummary })] });
  try {
    const readMessages = f.sdk.getSessionMessages;
    f.sdk.getSessionMessages = async (id, options) => {
      const request = f.workspace.handoffs.records.get(branchId)?.claudeSummary;
      if (id === branchNativeId && request && f.branch.handoffCompletions?.at(-1)?.messageIds.includes(request.messageId)) {
        throw new Error('The completed summary receipt read is unavailable.');
      }
      return readMessages(id, options);
    };
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.branch.handoff.phase, 'failed'); assert.match(f.branch.handoff.error, /summary receipt read is unavailable/);
    const record = f.workspace.handoffs.records.get(branchId), oldRequest = record.claudeSummary;
    assert.equal(record.summary, undefined); assert.ok(oldRequest?.messageId);
    assert.equal(f.branch.handoffCompletions.at(-1).text, JSON.stringify({ summary: oldSummary }));
    assert.equal(f.workspace.agents.get(branchId), f.branch); assert.deepEqual(f.links, []);
    const ordinary = await f.workspace.send(branchId, 'The decision changed. Use the newer approach in the handback.');
    await until(() => f.branch.thread.status.type === 'idle' && f.branch.handoffCompletions.at(-1).messageIds.includes(ordinary.messageId));
    f.sdk.getSessionMessages = readMessages;
    f.workspace.startHandoff(branchId); await f.done();
    assert.equal(f.workspace.agents.has(branchId), false, f.branch.handoff?.error);
    for (const prefix of [HANDOFF_CHECKPOINT_REQUEST, SUMMARY_REQUEST]) {
      const requests = f.inputs.filter(item => item.input.message.content.startsWith(prefix));
      assert.equal(requests.length, 2); assert.notEqual(requests[0].input.uuid, requests[1].input.uuid);
    }
    const deliveries = f.inputs.filter(item => item.nativeId === parentNativeId);
    assert.equal(deliveries.length, 1); assert.ok(deliveries[0].input.message.content.includes(currentSummary));
    assert.ok(!deliveries[0].input.message.content.includes(oldSummary));
    assert.deepEqual(f.controls, []); assert.deepEqual(f.rpcCalls, []);
  } finally { await f.close(); }
});
