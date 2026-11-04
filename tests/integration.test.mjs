import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, rm, chmod, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { setPassword, loadPassword } from '../server/auth.mjs';
import { CodexRpc } from '../server/rpc.mjs';
import { Workspace, statusOf } from '../server/workspace.mjs';
import { createApp } from '../server/main.mjs';

async function waitFor(predicate) {
  const until = Date.now() + 2000;
  while (!predicate()) { if (Date.now() > until) throw new Error('Expected event was not received.'); await new Promise(resolve => setTimeout(resolve, 10)); }
}
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'ccng-protocol-'));
  const socketPath = join(dir, 'codex.sock'); const server = http.createServer(); const wss = new WebSocketServer({ server });
  const calls = []; const replies = []; const threads = new Map(); const histories = new Map(); const failures = new Map(); const resumeRequests = new Map(); const summary = { text: 'Use the smaller option. Verification passed; no open questions.', status: 'completed' }; let sequence = 0; let turnSequence = 0; let connection;
  const thread = (id, status = 'idle') => ({ id, name: `Agent ${id}`, preview: 'Build a useful feature', cwd: dir, status: { type: status, activeFlags: [] }, canAcceptDirectInput: true, turns: [], model: 'configured-model' });
  threads.set('existing', thread('existing', 'active'));
  const notify = (method, params) => connection.send(JSON.stringify({ method, params }));
  const ask = (id, threadId) => connection.send(JSON.stringify({ id, method: 'item/tool/requestUserInput', params: { threadId, turnId: 'turn-' + threadId, questions: [{ id: 'choice', header: 'Direction', question: 'Which direction?', options: [{ label: 'Small', description: 'Keep the first step small.' }] }] } }));
  wss.on('connection', ws => { connection = ws; ws.on('message', bytes => {
    const message = JSON.parse(bytes.toString());
    if (!message.method) { replies.push(message); return; }
    if (message.id === undefined) return;
    calls.push(message); const p = message.params; let result;
    if (failures.has(message.method)) { ws.send(JSON.stringify({ id: message.id, error: { code: -32000, message: failures.get(message.method) } })); return; }
    switch (message.method) {
      case 'initialize': result = { userAgent: 'fixture' }; break;
      case 'thread/list': result = { data: [...threads.values()], nextCursor: null }; break;
      case 'thread/read': result = { thread: threads.get(p.threadId) }; break;
      case 'thread/resume': {
        for (const request of resumeRequests.get(p.threadId) || []) ws.send(JSON.stringify(request));
        result = { thread: threads.get(p.threadId) }; break;
      }
      case 'thread/turns/list': result = { data: histories.get(p.threadId) || [{ id: 'turn-' + p.threadId, status: threads.get(p.threadId).status.type === 'active' ? 'inProgress' : 'completed', items: [{ id: 'message-' + p.threadId, type: 'agentMessage', text: 'Ready to work.' }] }], nextCursor: null }; break;
      case 'thread/start': { const id = 'new-' + (++sequence); threads.set(id, { ...thread(id), cwd: p.cwd }); result = { thread: threads.get(id) }; break; }
      case 'thread/fork': {
        const id = 'branch-' + (++sequence); const source = histories.get(p.threadId) || [];
        const point = p.lastTurnId === undefined ? 0 : source.findIndex(turn => turn.id === p.lastTurnId);
        const copied = structuredClone(source.slice(point));
        for (const turn of copied) if (turn.status === 'inProgress') turn.status = 'interrupted';
        histories.set(id, copied);
        threads.set(id, { ...thread(id), forkedFromId: p.threadId });
        result = { thread: threads.get(id) }; break;
      }
      case 'thread/name/set': threads.get(p.threadId).name = p.name; result = {}; break;
      case 'thread/archive': threads.get(p.threadId).archived = true; result = {}; break;
      case 'turn/start': {
        const turnId = 'run-' + (++turnSequence); result = { turn: { id: turnId } };
        setImmediate(() => {
          notify('turn/started', { threadId: p.threadId, turn: { id: turnId } });
          if (p.outputSchema) setTimeout(() => {
            notify('item/completed', { threadId: p.threadId, turnId, item: { id: 'summary-' + turnId, type: 'agentMessage', text: JSON.stringify({ summary: summary.text }) } });
            notify('turn/completed', { threadId: p.threadId, turn: { id: turnId, status: summary.status } });
          }, 5);
        }); break;
      }
      case 'turn/steer': result = { turnId: p.expectedTurnId }; break;
      case 'turn/interrupt': result = {}; setImmediate(() => notify('turn/completed', { threadId: p.threadId, turn: { id: p.turnId, status: 'interrupted' } })); break;
      default: ws.send(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Unknown method' } })); return;
    }
    ws.send(JSON.stringify({ id: message.id, result }));
  }); });
  await new Promise(resolve => server.listen(socketPath, resolve));
  const rpc = new CodexRpc({ socketPath, timeout: 2000 }); await rpc.connect(); const workspace = new Workspace(rpc, { beads: null });
  return { dir, rpc, workspace, calls, replies, threads, histories, failures, resumeRequests, summary, notify, ask, request: message => connection.send(JSON.stringify(message)), close: async () => { rpc.close(); for (const client of wss.clients) client.terminate(); await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); } };
}

test('the worker picker excludes named and renamed coordinator conversations', async () => {
  const f = await fixture();
  try {
    const worker = f.threads.get('existing');
    f.threads.set('old-coordinator', { ...worker, id: 'old-coordinator', name: 'Command Center coordinator' });
    f.threads.set('renamed-coordinator', { ...worker, id: 'renamed-coordinator', name: 'Overview', threadSource: 'command-center-coordinator' });
    worker.preview = '[Command Center coordinator]\nA quoted summary in an ordinary worker.';
    const page = await f.workspace.list();
    assert.deepEqual(page.agents.map(agent => agent.id), ['existing']);
    assert.deepEqual(f.calls.map(call => call.method), ['initialize', 'thread/list']);
  } finally { await f.close(); }
});

test('opening a former coordinator as a worker is refused before native resume', async () => {
  const f = await fixture();
  try {
    const worker = f.threads.get('existing');
    f.threads.set('old-coordinator', { ...worker, id: 'old-coordinator', name: 'Command Center coordinator' });
    f.threads.set('renamed-coordinator', { ...worker, id: 'renamed-coordinator', name: 'Overview', threadSource: 'command-center-coordinator' });
    for (const id of ['old-coordinator', 'renamed-coordinator']) {
      await assert.rejects(f.workspace.open(id), /coordinator.*worker/i);
      await assert.rejects(f.workspace.open(id, { observeOnly: true }), /coordinator.*worker/i);
    }
    assert.equal(f.workspace.agents.size, 0);
    assert.equal(f.workspace.opening.size, 0);
    assert.ok(f.calls.every(call => ['initialize', 'thread/read'].includes(call.method)));
    await assert.rejects(f.workspace.create({ goal: 'Command Center coordinator', cwd: f.dir }), /reserved/i);
    assert.equal(f.calls.some(call => call.method === 'thread/start'), false);
  } finally { await f.close(); }
});

test('new workers require an explicit project directory and use it unchanged', async () => {
  const f = await fixture();
  try {
    for (const cwd of [undefined, '', 'relative-project', join(f.dir, 'missing')]) {
      await assert.rejects(f.workspace.create({ goal: 'Work in the selected project', cwd }));
    }
    assert.equal(f.calls.some(call => call.method === 'thread/start'), false);
    const cwd = join(f.dir, 'selected project'); await mkdir(cwd);
    const id = await f.workspace.create({ goal: 'Work in the selected project', cwd });
    assert.deepEqual(f.calls.find(call => call.method === 'thread/start').params, { cwd });
    assert.equal(f.workspace.agent(id).cwd, cwd);
  } finally { await f.close(); }
});

test('branches use native completed-turn context and keep parent navigation separate from summary handoff', async () => {
  const f = await fixture();
  try {
    const turn = (id, text, status = 'completed') => ({ id, status, items: [{ id: 'reply-' + id, type: 'agentMessage', text }] });
    f.histories.set('existing', [turn('active', 'Still working', 'inProgress'), turn('second', 'Later answer'), turn('first', 'Original answer')]);
    await f.workspace.open('existing');
    assert.equal(f.workspace.agent('existing').lastCompletedTurnId, 'second');
    await assert.rejects(f.workspace.fork('existing', 'active'), /completed reply/);
    const id = await f.workspace.fork('existing', 'first');
    assert.deepEqual(f.calls.find(c => c.method === 'thread/fork').params, { threadId: 'existing', lastTurnId: 'first', excludeTurns: true, deferGoalContinuation: true });
    assert.equal(f.workspace.agent(id).parentId, 'existing');
    assert.deepEqual(f.workspace.agent(id).messages.map(m => m.text), ['Original answer']);
    assert.equal(f.workspace.agent('existing').messages.length, 3);
    assert.equal(f.calls.filter(c => c.method === 'turn/start' || c.method === 'turn/steer').length, 0);
    await f.workspace.send(id, 'Explore an alternative');
    assert.equal(f.workspace.agent(id).goal, 'Explore an alternative');
    assert.equal(f.calls.find(c => c.method === 'turn/start').params.threadId, id);
    const more = await Promise.allSettled(Array.from({ length: 3 }, () => f.workspace.fork('existing')));
    assert.equal(more.filter(r => r.status === 'fulfilled').length, 2);
    assert.equal(f.workspace.snapshot().agents.length, 4);
    f.workspace.close('existing');
    await f.workspace.create({ goal: 'Another task', cwd: f.dir });
    assert.equal(await f.workspace.parent(id), 'existing');
    assert.equal(f.workspace.snapshot().agents.length, 4);
    assert.ok(!f.workspace.agents.has(id));
    assert.ok(f.threads.has(id), 'return navigation keeps the native branch');
    assert.equal(f.calls.filter(c => c.method === 'turn/interrupt').length, 0);
  } finally { await f.close(); }
});

test('Branch chat keeps the ongoing exchange and leaves parent work and approval untouched', async () => {
  const f = await fixture();
  try {
    f.histories.set('existing', [
      { id: 'active', status: 'inProgress', items: [
        { id: 'new-request', type: 'userMessage', content: [{ type: 'text', text: 'Investigate the next issue.' }] },
        { id: 'new-progress', type: 'agentMessage', text: 'Checking the available evidence.' },
        { id: 'new-followup', type: 'userMessage', content: [{ type: 'text', text: 'Keep the current deployment running.' }] }
      ] },
      { id: 'completed', status: 'completed', items: [{ id: 'completed-reply', type: 'agentMessage', text: 'The prerequisites are ready.' }] },
      { id: 'earlier', status: 'completed', items: [{ id: 'earlier-reply', type: 'agentMessage', text: 'Earlier context.' }] }
    ]);
    f.threads.get('existing').status.activeFlags = ['waitingOnApproval'];
    f.resumeRequests.set('existing', [{ id: 'parent-approval', method: 'item/commandExecution/requestApproval', params: { threadId: 'existing', turnId: 'active', command: 'printf synthetic' } }]);
    const parent = await f.workspace.open('existing');
    await waitFor(() => parent.questions.length === 1);
    const original = structuredClone({ messages: parent.messages, turnId: parent.turnId, questions: parent.questions, status: parent.thread.status });
    const before = f.calls.length;
    const id = await f.workspace.fork('existing');
    assert.deepEqual(f.calls.find(call => call.method === 'thread/fork').params, { threadId: 'existing', excludeTurns: true, deferGoalContinuation: true });
    assert.deepEqual(f.workspace.agent(id).messages.map(message => message.text), [
      'Earlier context.', 'The prerequisites are ready.', 'Investigate the next issue.',
      'Checking the available evidence.', 'Keep the current deployment running.'
    ]);
    assert.equal(f.workspace.agent(id).turnId, null);
    assert.deepEqual(f.workspace.agent(id).questions, []);
    assert.deepEqual({ messages: parent.messages, turnId: parent.turnId, questions: parent.questions, status: parent.thread.status }, original);
    assert.equal(f.histories.get('existing')[0].status, 'inProgress');
    assert.equal(f.calls.slice(before).some(call => ['turn/start', 'turn/steer', 'turn/interrupt'].includes(call.method)), false);
    assert.equal(f.replies.length, 0, 'forking does not answer the parent approval');
  } finally { await f.close(); }
});

test('Branch chat works during the first turn without a completed reply', async () => {
  const f = await fixture();
  try {
    f.histories.set('existing', [{ id: 'first-active', status: 'inProgress', items: [
      { id: 'first-request', type: 'userMessage', content: [{ type: 'text', text: 'Review this project.' }] },
      { id: 'first-progress', type: 'agentMessage', text: 'Reading the project.' }
    ] }]);
    const parent = await f.workspace.open('existing');
    assert.equal(parent.lastCompletedTurnId, null);
    const id = await f.workspace.fork('existing');
    assert.deepEqual(f.workspace.agent(id).messages.map(message => message.text), ['Review this project.', 'Reading the project.']);
    assert.equal(parent.turnId, 'first-active');
    assert.equal(f.workspace.agent(id).turnId, null);
    assert.equal(f.calls.some(call => ['turn/start', 'turn/steer', 'turn/interrupt'].includes(call.method)), false);
  } finally { await f.close(); }
});

async function branchFixture() {
  const f = await fixture();
  f.histories.set('existing', [{ id: 'parent-active', status: 'inProgress', items: [] }, { id: 'base', status: 'completed', items: [{ id: 'base-reply', type: 'agentMessage', text: 'Inherited background that must not be pasted into the parent.' }] }]);
  await f.workspace.open('existing');
  const id = await f.workspace.fork('existing');
  return { ...f, id };
}

test('return prepares a concise native-context summary, sends only the reviewed result, then archives and closes the child', async () => {
  const f = await branchFixture();
  try {
    await assert.rejects(f.workspace.returnToParent(f.id, 'Manual content'), /Prepare a current branch summary/);
    const [first, second] = await Promise.all([f.workspace.summarize(f.id), f.workspace.summarize(f.id)]);
    assert.equal(first.text, f.summary.text); assert.equal(second.text, first.text);
    const starts = f.calls.filter(c => c.method === 'turn/start'); assert.equal(starts.length, 1);
    assert.deepEqual(Object.keys(starts[0].params).sort(), ['input', 'outputSchema', 'threadId']);
    assert.match(starts[0].params.input[0].text, /conclusions, decisions and their reasons/);
    assert.ok(!starts[0].params.input[0].text.includes('Inherited background'));
    await f.workspace.summarize(f.id); assert.equal(f.calls.filter(c => c.method === 'turn/start').length, 1, 'reopening the dialog reuses the current summary');
    await assert.rejects(f.workspace.returnToParent(f.id, 'x'.repeat(2001)), /concise summary/);
    const edited = 'Decision: use the smaller option. Reason: lower complexity. Validation passed.';
    const parent = await f.workspace.returnToParent(f.id, edited);
    assert.equal(parent, 'existing');
    const delivered = f.calls.find(c => c.method === 'turn/steer'); assert.match(delivered.params.input[0].text, /Decision: use the smaller option/);
    assert.ok(!delivered.params.input[0].text.includes('Inherited background'));
    const archive = f.calls.find(c => c.method === 'thread/archive'); assert.equal(archive.params.threadId, f.id);
    assert.ok(f.calls.indexOf(archive) > f.calls.indexOf(delivered));
    assert.equal(f.threads.get(f.id).archived, true); assert.equal(f.workspace.agents.has(f.id), false);
  } finally { await f.close(); }
});

test('parent-send failures keep the child open; archive retries do not duplicate delivered summaries', async () => {
  const f = await branchFixture();
  try {
    await f.workspace.summarize(f.id);
    await f.workspace.create({ goal: 'Other work one', cwd: f.dir });
    await f.workspace.create({ goal: 'Other work two', cwd: f.dir });
    f.workspace.close('existing');
    await f.workspace.create({ goal: 'Other work three', cwd: f.dir });
    assert.equal(f.workspace.agents.size, 4);
    f.failures.set('turn/steer', 'Parent temporarily unavailable');
    await assert.rejects(f.workspace.returnToParent(f.id, f.summary.text), /Parent temporarily unavailable/);
    assert.ok(f.workspace.agents.has(f.id)); assert.ok(!f.threads.get(f.id).archived);
    assert.equal(f.workspace.agents.size, 4); assert.ok(!f.workspace.agents.has('existing'), 'failed handoff restores the child tab at capacity');
    assert.equal(f.workspace.agent(f.id).returnSummary.delivered, false);
    f.failures.delete('turn/steer'); f.failures.set('thread/archive', 'Archive temporarily unavailable');
    await assert.rejects(f.workspace.returnToParent(f.id, f.summary.text), /summary was delivered.*closing the branch failed/);
    assert.ok(f.workspace.agents.has(f.id)); assert.equal(f.workspace.agent(f.id).returnSummary.delivered, true);
    const sends = f.calls.filter(c => c.method === 'turn/steer').length;
    f.failures.delete('thread/archive');
    await f.workspace.returnToParent(f.id, f.summary.text);
    assert.equal(f.calls.filter(c => c.method === 'turn/steer').length, sends);
    assert.equal(f.workspace.agents.has(f.id), false);
  } finally { await f.close(); }
});

test('native subAgentActivity records populate multiple task rows and update completion without losing their goals', async () => {
  const f = await fixture();
  try {
    for (let n = 1; n <= 3; n++) f.threads.set('child-' + n, { id: 'child-' + n, name: `Review area ${n}`, status: { type: 'idle' } });
    f.histories.set('existing', [{ id: 'workers', status: 'completed', items: Array.from({ length: 3 }, (_, n) => ({ id: 'activity-' + n, type: 'subAgentActivity', kind: 'started', agentThreadId: 'child-' + (n + 1), agentPath: '/root/reviewer_' + (n + 1) })) }]);
    await f.workspace.open('existing');
    await waitFor(() => f.workspace.agent('existing').workers.every(worker => worker.task.startsWith('Review area')));
    assert.equal(f.workspace.agent('existing').workers.length, 3);
    f.notify('item/completed', { threadId: 'existing', turnId: 'workers', item: { id: 'finished-child', type: 'subAgentActivity', kind: 'completed', agentThreadId: 'child-1', agentPath: '/root/reviewer_1' } });
    await waitFor(() => f.workspace.agent('existing').workers.find(worker => worker.id === 'child-1').status === 'completed');
    assert.equal(f.workspace.agent('existing').workers.find(worker => worker.id === 'child-1').task, 'Review area 1');
  } finally { await f.close(); }
});

test('failed or oversized summary generation never sends or closes a branch', async () => {
  const f = await branchFixture();
  try {
    f.summary.status = 'failed'; await assert.rejects(f.workspace.summarize(f.id), /summary turn did not complete/);
    f.summary.status = 'completed'; f.summary.text = 'x'.repeat(2001);
    await assert.rejects(f.workspace.summarize(f.id), /did not return a concise summary/);
    assert.ok(f.workspace.agents.has(f.id)); assert.ok(!f.workspace.agent(f.id).returnSummary);
    assert.equal(f.calls.filter(c => ['thread/archive', 'turn/steer'].includes(c.method)).length, 0);
  } finally { await f.close(); }
});

test('further branch work invalidates a cached summary even when that new turn is interrupted', async () => {
  const f = await branchFixture();
  try {
    await f.workspace.summarize(f.id);
    const previous = f.workspace.agent(f.id).returnSummary.turnId;
    await f.workspace.send(f.id, 'Explore another option before returning.');
    await waitFor(() => !f.workspace.agent(f.id).returnSummary);
    await f.workspace.interrupt(f.id);
    await waitFor(() => f.workspace.snapshot().agents.find(agent => agent.id === f.id).status === 'idle');
    await assert.rejects(f.workspace.returnToParent(f.id, 'Old summary'), /Prepare a current branch summary/);
    const refreshed = await f.workspace.summarize(f.id);
    assert.notEqual(refreshed.turnId, previous);
  } finally { await f.close(); }
});

test('native protocol opens an active existing agent, streams plans/messages, steers and interrupts without changing permissions', async () => {
  const f = await fixture();
  try {
    await f.workspace.open('existing');
    assert.equal(f.workspace.snapshot().agents[0].status, 'running');
    assert.equal(f.workspace.agent('existing').messages[0].text, 'Ready to work.');
    f.notify('turn/plan/updated', { threadId: 'existing', plan: [{ step: 'Review changes', status: 'inProgress' }] });
    f.notify('item/agentMessage/delta', { threadId: 'existing', itemId: 'streamed', delta: 'Live ' });
    f.notify('item/agentMessage/delta', { threadId: 'existing', itemId: 'streamed', delta: 'answer' });
    await waitFor(() => f.workspace.agent('existing').messages.some(m => m.text === 'Live answer'));
    assert.equal(f.workspace.agent('existing').tasks[0].text, 'Review changes');
    await f.workspace.send('existing', 'A follow-up direction');
    const steer = f.calls.find(c => c.method === 'turn/steer'); assert.equal(steer.params.expectedTurnId, 'turn-existing');
    await f.workspace.interrupt('existing'); await waitFor(() => f.workspace.snapshot().agents[0].status === 'idle');
    for (const c of f.calls.filter(c => c.method === 'thread/resume')) assert.deepEqual(Object.keys(c.params).sort(), ['excludeTurns', 'threadId']);
  } finally { await f.close(); }
});

test('five simultaneous creates start only four agents; closing a tab never interrupts its agent', async () => {
  const f = await fixture();
  try {
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => f.workspace.create({ goal: 'Independent task ' + i, cwd: f.dir })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 4);
    assert.equal(f.calls.filter(c => c.method === 'thread/start').length, 4);
    for (const c of f.calls.filter(c => c.method === 'thread/start')) assert.deepEqual(Object.keys(c.params), ['cwd']);
    const first = f.workspace.snapshot().agents[0]; f.workspace.close(first.id);
    assert.equal(f.calls.filter(c => c.method === 'turn/interrupt').length, 0);
    f.ask('background', first.id); await waitFor(() => f.workspace.snapshot().backgroundQuestions === 1);
    await f.workspace.open(first.id); assert.equal(f.workspace.agent(first.id).questions.length, 1);
  } finally { await f.close(); }
});

test('an approval delivered before the resume response stays visible without being answered', async () => {
  const f = await fixture();
  try {
    const request = { id: 'opening-approval', method: 'item/commandExecution/requestApproval', params: { threadId: 'existing', turnId: 'turn-existing', itemId: 'fixture-command', reason: 'Synthetic approval during resume', command: 'fixture-command', availableDecisions: ['accept', 'decline'] } };
    f.resumeRequests.set('existing', [request]);
    await f.workspace.open('existing');
    assert.equal(f.workspace.agent('existing').questions.length, 1);
    assert.equal(f.workspace.agent('existing').questions[0].id, request.id);
    assert.equal(f.workspace.snapshot().agents[0].status, 'attention');
    assert.equal(f.replies.length, 0);
    assert.equal(f.calls.some(call => ['turn/start', 'turn/steer', 'turn/interrupt'].includes(call.method)), false);
  } finally { await f.close(); }
});

test('request recovery rejoins only the selected waiting worker and preserves the native request ID', async () => {
  const f = await fixture();
  try {
    f.threads.get('existing').status.activeFlags = ['waitingOnApproval'];
    f.threads.set('other', { ...f.threads.get('existing'), id: 'other', status: { type: 'idle' } });
    await f.workspace.open('existing', { observeOnly: true }); await f.workspace.open('other', { observeOnly: true });
    f.resumeRequests.set('existing', [{ id: 71, method: 'item/commandExecution/requestApproval', params: { threadId: 'existing', turnId: 'turn-existing', itemId: 'fixture-command', command: 'fixture-command' } }]);
    const results = await Promise.all([f.workspace.recoverRequests('existing'), f.workspace.recoverRequests('existing')]);
    assert.deepEqual(results, [{ requests: 1 }, { requests: 1 }]);
    assert.equal(f.workspace.agent('existing').questions[0].id, 71);
    assert.equal(f.workspace.agent('other').questions.length, 0);
    const resumes = f.calls.filter(call => call.method === 'thread/resume');
    assert.deepEqual(resumes.map(call => call.params), [{ threadId: 'existing', excludeTurns: true }]);
    assert.equal(f.replies.length, 0);
    assert.equal(f.calls.some(call => ['turn/start', 'turn/steer', 'turn/interrupt'].includes(call.method)), false);
  } finally { await f.close(); }
});

test('request recovery accepts native replay after the resume response', async () => {
  const f = await fixture();
  try {
    f.threads.get('existing').status.activeFlags = ['waitingOnApproval'];
    await f.workspace.open('existing', { observeOnly: true });
    const recovery = f.workspace.recoverRequests('existing');
    await waitFor(() => !f.workspace.agent('existing').observingOnly);
    f.request({ id: 'late-approval', method: 'item/fileChange/requestApproval', params: { threadId: 'existing', turnId: 'turn-existing', itemId: 'fixture-file-change' } });
    assert.deepEqual(await recovery, { requests: 1 });
    assert.equal(f.workspace.agent('existing').questions[0].id, 'late-approval');
    assert.equal(f.replies.length, 0);
  } finally { await f.close(); }
});

test('missing request details block chat sends instead of replacing or steering the waiting turn', async () => {
  const f = await fixture();
  try {
    f.threads.get('existing').status.activeFlags = ['waitingOnApproval'];
    await f.workspace.open('existing', { observeOnly: true });
    await assert.rejects(f.workspace.send('existing', 'Continue'), /pending request/i);
    assert.ok(f.calls.every(call => ['initialize', 'thread/read', 'thread/turns/list'].includes(call.method)));
  } finally { await f.close(); }
});

test('request recovery refreshes an already cleared wait without resuming an unloaded worker', async () => {
  const f = await fixture();
  try {
    await f.workspace.open('existing', { observeOnly: true });
    f.workspace.agent('existing').thread = { ...f.workspace.agent('existing').thread, status: { type: 'active', activeFlags: ['waitingOnApproval'] } };
    f.threads.get('existing').status = { type: 'notLoaded' };
    assert.deepEqual(await f.workspace.recoverRequests('existing'), { requests: 0 });
    assert.equal(f.workspace.agent('existing').thread.status.type, 'notLoaded');
    assert.equal(f.calls.some(call => call.method === 'thread/resume'), false);
  } finally { await f.close(); }
});

test('a request that cannot be replayed keeps its attention state and a scoped recovery error', async () => {
  const f = await fixture(); f.workspace.recoveryTimeout = 25;
  try {
    f.threads.get('existing').status.activeFlags = ['waitingOnApproval'];
    await f.workspace.open('existing', { observeOnly: true });
    f.threads.set('other', { ...f.threads.get('existing'), id: 'other', status: { type: 'idle' } });
    await f.workspace.open('other', { observeOnly: true });
    await assert.rejects(f.workspace.recoverRequests('existing'), /did not resend/i);
    assert.match(f.workspace.agent('existing').requestError, /did not resend/i);
    assert.equal(f.workspace.agent('other').requestError, undefined);
    assert.equal(f.workspace.snapshot().agents.find(agent => agent.id === 'existing').status, 'attention');
    assert.equal(f.workspace.snapshot().agents.find(agent => agent.id === 'existing').recoveringRequests, false);
    assert.equal(f.replies.length, 0);
  } finally { await f.close(); }
});

test('questions change status, require explicit answers, and reject stale request ids', async () => {
  const f = await fixture();
  try {
    await f.workspace.open('existing'); f.ask('question-1', 'existing');
    await waitFor(() => f.workspace.snapshot().agents[0].status === 'attention');
    await assert.rejects(f.workspace.send('existing', 'do something'), /pending question/);
    assert.throws(() => f.workspace.answer('existing', 'question-1', { answers: {} }), /Answer every question/);
    const answer = f.workspace.answer('existing', 'question-1', { answers: { choice: 'Small' } });
    await waitFor(() => f.replies.length === 1);
    assert.deepEqual(f.replies[0], { id: 'question-1', result: { answers: { choice: { answers: ['Small'] } } } });
    assert.equal(f.workspace.agent('existing').questions.length, 1, 'sending alone is not resolution');
    assert.equal(f.workspace.agent('existing').questions[0].responding, true);
    assert.throws(() => f.workspace.answer('existing', 'question-1', { answers: { choice: 'Large' } }), /awaiting confirmation/);
    assert.equal(f.replies.length, 1, 'a pending answer is not sent twice');
    f.notify('serverRequest/resolved', { threadId: 'existing', requestId: 'question-1' });
    await answer;
    assert.equal(f.workspace.agent('existing').questions.length, 0);
    assert.throws(() => f.workspace.answer('existing', 'question-1', {}), /already been resolved/);
    assert.equal(statusOf({ status: { type: 'active', activeFlags: ['waitingOnApproval'] } }), 'attention');
  } finally { await f.close(); }
});

test('command and file approval decisions await native resolution without broad permission grants', async () => {
  const f = await fixture();
  try {
    await f.workspace.open('existing');
    for (const [kind, decision] of [['commandExecution', 'accept'], ['fileChange', 'decline']]) {
      const requestId = 'approval-' + kind;
      f.request({ id: requestId, method: `item/${kind}/requestApproval`, params: { threadId: 'existing', turnId: 'turn-existing', itemId: 'action-' + kind, reason: 'Synthetic protocol fixture' } });
      await waitFor(() => f.workspace.agent('existing').questions.length === 1);
      const answer = f.workspace.answer('existing', requestId, { decision });
      await waitFor(() => f.replies.some(reply => reply.id === requestId));
      assert.deepEqual(f.replies.find(reply => reply.id === requestId), { id: requestId, result: { decision } });
      assert.equal(f.workspace.agent('existing').questions.length, 1);
      f.notify('serverRequest/resolved', { threadId: 'existing', requestId }); await answer;
      assert.equal(f.workspace.agent('existing').questions.length, 0);
    }
  } finally { await f.close(); }
});

test('unconfirmed answers stay visible after timeout and late native resolution clears them', async () => {
  const f = await fixture(); f.workspace.answerTimeout = 35;
  try {
    await f.workspace.open('existing'); f.ask('unconfirmed', 'existing');
    await waitFor(() => f.workspace.agent('existing').questions.length === 1);
    await assert.rejects(f.workspace.answer('existing', 'unconfirmed', { answers: { choice: 'Small' } }), /did not confirm/);
    const question = f.workspace.agent('existing').questions[0];
    assert.equal(question.responding, false); assert.match(question.error, /native session/);
    assert.equal(f.replies.length, 1); assert.equal(f.workspace.snapshot().agents[0].status, 'attention');
    f.notify('serverRequest/resolved', { threadId: 'existing', requestId: 'unconfirmed' });
    await waitFor(() => f.workspace.agent('existing').questions.length === 0);
  } finally { await f.close(); }
});

test('native resolution is scoped to the conversation and preserves numeric versus string request ids', async () => {
  const f = await fixture();
  try {
    f.threads.set('other', { ...f.threads.get('existing'), id: 'other', status: { type: 'idle' } });
    await f.workspace.open('existing'); await f.workspace.open('other');
    f.ask(7, 'existing'); f.ask('7', 'existing'); f.ask(7, 'other');
    await waitFor(() => f.workspace.pending.size === 3);
    f.notify('serverRequest/resolved', { threadId: 'unrelated', requestId: 7 });
    f.notify('serverRequest/resolved', { requestId: 7 });
    f.notify('serverRequest/resolved', { threadId: 'existing', requestId: 7 });
    await waitFor(() => f.workspace.pending.size === 2);
    assert.deepEqual(f.workspace.agent('existing').questions.map(q => q.id), ['7']);
    assert.equal(f.workspace.agent('other').questions.length, 1);
    f.notify('serverRequest/resolved', { threadId: 'existing', requestId: '7' });
    await waitFor(() => f.workspace.agent('existing').questions.length === 0);
    assert.equal(f.replies.length, 0, 'answers from another client clear questions without sending another response');
    const answer = f.workspace.answer('other', 7, { answers: { choice: 'Small' } });
    await waitFor(() => f.replies.length === 1);
    f.notify('serverRequest/resolved', { threadId: 'other', requestId: 7 }); await answer;
    assert.equal(f.workspace.pending.size, 0);
  } finally { await f.close(); }
});

test('disconnect rejects an unconfirmed answer and clears requests tied to the lost connection', async () => {
  const f = await fixture();
  try {
    await f.workspace.open('existing'); f.ask('disconnect', 'existing');
    await waitFor(() => f.workspace.pending.size === 1);
    const answer = f.workspace.answer('existing', 'disconnect', { answers: { choice: 'Small' } });
    const rejected = assert.rejects(answer, /disconnected before confirming/);
    f.rpc.disconnected('Fixture disconnect'); await rejected;
    assert.equal(f.workspace.answerJobs.size, 0); assert.equal(f.workspace.pending.size, 0);
    assert.equal(f.workspace.agent('existing').questions.length, 0);
    assert.equal(f.workspace.snapshot().agents[0].status, 'offline');
  } finally { await f.close(); }
});

test('password stays hashed/private; HTTP login protects controls, rejects cross-origin writes, and logout revokes sessions', async () => {
  const f = await fixture(); const authFile = join(f.dir, 'auth.json'); const password = randomBytes(24).toString('base64url');
  const linkCalls = [];
  f.workspace.beads = {
    checkAvailable: async () => 'bd version fixture',
    linked: async () => ({ status: 'ready', label: 'ccng-session:existing', tasks: [], error: null }),
    catalog: async () => ({ linkedIds: [], tasks: [], label: 'ccng-session:existing' }),
    setLinks: async (cwd, id, ids) => { linkCalls.push({ cwd, id, ids }); return { status: 'ready', label: 'ccng-session:' + id, tasks: [], error: null }; }
  };
  await setPassword(password, authFile);
  assert.equal((await stat(authFile)).mode & 0o777, 0o600);
  assert.ok(!(await readFile(authFile, 'utf8')).includes(password));
  await chmod(authFile, 0o644); await assert.rejects(loadPassword(authFile), /private/); await chmod(authFile, 0o600);
  const app = await createApp({ rpc: f.rpc, workspace: f.workspace, authFile });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const request = (path, data, cookie, origin = base) => fetch(base + path, { method: data === undefined ? 'GET' : 'POST', headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin }), ...(cookie ? { Cookie: cookie } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  try {
    assert.equal((await request('/api/state')).status, 401);
    assert.equal((await request('/api/coordinator', {})).status, 401);
    assert.equal((await request('/api/agents/existing/tasks')).status, 401);
    assert.equal((await request('/api/agents/existing/tasks', { ids: [] })).status, 401);
    for (const action of ['fork', 'parent', 'summary', 'return', 'answer', 'review', 'requests']) assert.equal((await request('/api/agents/existing/' + action, {})).status, 401);
    assert.equal((await request('/api/login', { password }, undefined, 'https://unrelated.example')).status, 403);
    const login = await request('/api/login', { password }); assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
    assert.equal((await request('/api/state', undefined, cookie)).status, 200);
    assert.equal((await request('/api/agents/existing/open', {}, cookie)).status, 200);
    assert.equal((await request('/api/agents/existing/tasks', undefined, cookie)).status, 200);
    assert.equal((await request('/api/agents/existing/tasks', { ids: ['demo-a'] }, cookie, 'https://unrelated.example')).status, 403);
    assert.equal(linkCalls.length, 0);
    assert.equal((await request('/api/agents/existing/tasks', { ids: ['demo-a'] }, cookie)).status, 200);
    assert.deepEqual(linkCalls, [{ cwd: f.dir, id: 'existing', ids: ['demo-a'] }]);
    assert.equal((await request('/api/agents/existing/message', { text: 'Continue' }, cookie, 'https://unrelated.example')).status, 403);
    assert.equal((await request('/api/agents/existing/fork', {}, cookie, 'https://unrelated.example')).status, 403);
    assert.equal((await request('/api/coordinator', { paused: false }, cookie, 'https://unrelated.example')).status, 403);
    assert.equal((await request('/api/agents/existing/review', {}, cookie, 'https://unrelated.example')).status, 403);
    f.ask('http-question', 'existing'); await waitFor(() => f.workspace.pending.size === 1);
    const answer = { requestId: 'http-question', answers: { choice: 'Small' } };
    assert.equal((await request('/api/agents/existing/answer', answer, cookie, 'https://unrelated.example')).status, 403);
    assert.equal(f.replies.length, 0);
    f.workspace.answerTimeout = 35;
    assert.equal((await request('/api/agents/existing/answer', answer, cookie)).status, 504, 'HTTP must not report success before native resolution');
    assert.equal(f.workspace.agent('existing').questions.length, 1);
    f.notify('serverRequest/resolved', { threadId: 'existing', requestId: 'http-question' });
    await waitFor(() => f.workspace.pending.size === 0);
    assert.equal((await request('/api/logout', {}, cookie)).status, 200);
    assert.equal((await request('/api/state', undefined, cookie)).status, 401);
  } finally { await app.close(); await f.close(); }
});
