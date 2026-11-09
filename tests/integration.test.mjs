import limits from '../server/limits.json' with { type: 'json' };
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, chmod, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  const models = [{ model: 'configured-model', displayName: 'Configured model', description: 'Synthetic model', supportedReasoningEfforts: [{ reasoningEffort: 'low', description: 'Low effort' }, { reasoningEffort: 'high', description: 'High effort' }], defaultReasoningEffort: 'low' }, { model: 'alternate-model', displayName: 'Alternate model', description: 'Another synthetic model', supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: 'Medium effort' }], defaultReasoningEffort: 'medium' }];
  const thread = (id, status = 'idle') => ({ id, name: `Agent ${id}`, preview: 'Build a useful feature', cwd: dir, status: { type: status, activeFlags: [] }, canAcceptDirectInput: true, turns: [], model: 'configured-model', reasoningEffort: 'low' });
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
      case 'model/list': result = { data: models, nextCursor: null }; break;
      case 'thread/settings/update': {
        const current = threads.get(p.threadId); current.model = p.model; if (p.effort) current.reasoningEffort = p.effort;
        result = {}; setImmediate(() => notify('thread/settings/updated', { threadId: p.threadId, threadSettings: { model: current.model, effort: current.reasoningEffort } })); break;
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
  return { dir, rpc, workspace, calls, replies, threads, histories, failures, resumeRequests, summary, models, notify, ask, request: message => connection.send(JSON.stringify(message)), close: async () => { rpc.close(); for (const client of wss.clients) client.terminate(); await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); } };
}

test('native history can load several screenshots beyond the former16MiB frame cap without broadcasting their bytes', async () => {
  const f = await fixture();
  try {
    const bytes = Buffer.alloc(2 * 1024 * 1024); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    const url = 'data:image/png;base64,' + bytes.toString('base64');
    f.histories.set('existing', Array.from({ length: 3 }, (_, index) => ({ id: 'image-turn-' + index, status: 'completed', items: [{ id: 'image-post-' + index, type: 'userMessage', content: [{ type: 'image', url }, { type: 'image', url }] }] })));
    const agent = await f.workspace.open('existing', { observeOnly: true });
    assert.equal(agent.messages.length, 3);
    assert.ok(agent.messages.every(message => message.images.length === 2));
    const snapshot = JSON.stringify(f.workspace.snapshot());
    assert.ok(snapshot.length < 10000); assert.ok(!snapshot.includes('base64'));
    assert.equal(f.workspace.messageImage('existing', agent.messages[0].id, 0).bytes.length, bytes.length);
    assert.equal(f.calls.some(call => ['thread/resume', 'turn/start'].includes(call.method)), false);
  } finally { await f.close(); }
});

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
    const more = await Promise.allSettled(Array.from({ length: limits.maxWorkers - 1 }, () => f.workspace.fork('existing')));
    assert.equal(more.filter(r => r.status === 'fulfilled').length, limits.maxWorkers - 2);
    assert.equal(f.workspace.snapshot().agents.length, limits.maxWorkers);
    f.workspace.close('existing');
    await f.workspace.create({ goal: 'Another task', cwd: f.dir });
    assert.equal(await f.workspace.parent(id), 'existing');
    assert.equal(f.workspace.snapshot().agents.length, limits.maxWorkers);
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

test('Return summary activates an unloaded restored child only on explicit request and rechecks native state', async () => {
  const f = await branchFixture();
  try {
    f.workspace.close(f.id);
    f.threads.get(f.id).status = { type: 'notLoaded' };
    const beforeRestore = f.calls.length;
    const branch = await f.workspace.open(f.id, { observeOnly: true });
    assert.equal(branch.observingOnly, true);
    assert.equal(f.workspace.snapshot().agents.find(agent => agent.id === f.id).status, 'idle');
    assert.ok(f.calls.slice(beforeRestore).every(call => ['thread/read', 'thread/turns/list'].includes(call.method)));
    // The resume response reports the native loaded state, not the cached tab state.
    f.threads.get(f.id).status = { type: 'idle' };
    const beforeSummary = f.calls.length;
    const [first, second] = await Promise.all([f.workspace.summarize(f.id), f.workspace.summarize(f.id)]);
    assert.equal(first.text, f.summary.text); assert.equal(second.text, first.text);
    const calls = f.calls.slice(beforeSummary);
    assert.deepEqual(calls.find(call => call.method === 'thread/resume').params, { threadId: f.id, excludeTurns: true });
    assert.equal(calls.filter(call => call.method === 'thread/resume').length, 1);
    assert.equal(calls.filter(call => call.method === 'turn/start').length, 1);
    assert.equal(branch.observingOnly, false);
    await f.workspace.returnToParent(f.id, first.text);
    assert.equal(f.workspace.agents.has(f.id), false);
    assert.equal(f.threads.get(f.id).archived, true);
  } finally { await f.close(); }
});

test('restored child requests and active turns block summary generation with specific child recovery messages', async () => {
  for (const state of ['known-request', 'replayed-request', 'native-active', 'still-unloaded']) {
    const f = await branchFixture();
    try {
      f.workspace.close(f.id);
      f.threads.get(f.id).status = { type: 'notLoaded', ...(state === 'known-request' ? { activeFlags: ['waitingOnApproval'] } : {}) };
      const branch = await f.workspace.open(f.id, { observeOnly: true });
      const beforeSummary = f.calls.length;
      if (state === 'replayed-request') f.resumeRequests.set(f.id, [{ id: 'child-question', method: 'item/tool/requestUserInput', params: { threadId: f.id, turnId: 'child-turn', questions: [{ id: 'choice', question: 'Choose an option.' }] } }]);
      if (state !== 'known-request' && state !== 'still-unloaded') f.threads.get(f.id).status = { type: state === 'native-active' ? 'active' : 'idle' };
      await assert.rejects(f.workspace.summarize(f.id), error => {
        assert.equal(error.status, 409);
        assert.ok(error.message.includes(`Child chat "${branch.name}"`));
        assert.match(error.message, state.includes('request') ? /pending question or approval.*load its pending request/ : state === 'native-active' ? /still responding.*turn to finish/ : /unavailable.*Reopen/);
        return true;
      });
      const calls = f.calls.slice(beforeSummary);
      assert.equal(calls.some(call => ['turn/start', 'turn/steer', 'turn/interrupt', 'thread/archive'].includes(call.method)), false);
      assert.equal(calls.filter(call => call.method === 'thread/resume').length, state === 'known-request' ? 0 : 1);
      assert.equal(f.replies.length, 0);
      assert.equal(f.workspace.agents.has(f.id), true);
      if (state === 'replayed-request') assert.equal(branch.questions[0].id, 'child-question');
    } finally { await f.close(); }
  }
});

test('return rechecks a reactivated child before sending its saved summary or closing it', async () => {
  for (const pending of [false, true]) {
    const f = await branchFixture();
    try {
      await f.workspace.summarize(f.id);
      const branch = f.workspace.agent(f.id);
      branch.observingOnly = true; branch.thread.status = { type: 'notLoaded' };
      f.threads.get(f.id).status = { type: 'idle' };
      if (pending) f.resumeRequests.set(f.id, [{ id: 'late-child-request', method: 'item/tool/requestUserInput', params: { threadId: f.id, questions: [{ id: 'choice', question: 'Choose an option.' }] } }]);
      const beforeReturn = f.calls.length;
      if (pending) {
        await assert.rejects(f.workspace.returnToParent(f.id, 'My reviewed summary.'), /Child chat.*pending question or approval/);
        assert.equal(branch.returnSummary.delivered, false);
        assert.equal(branch.questions[0].id, 'late-child-request');
        assert.equal(f.replies.length, 0);
        assert.equal(f.calls.slice(beforeReturn).some(call => ['turn/start', 'turn/steer', 'thread/archive'].includes(call.method)), false);
      } else {
        assert.equal(await f.workspace.returnToParent(f.id, 'My reviewed summary.'), 'existing');
        assert.equal(f.threads.get(f.id).archived, true);
      }
      assert.equal(f.calls.slice(beforeReturn).filter(call => call.method === 'thread/resume').length, 1);
    } finally { await f.close(); }
  }
});

test('return prepares a concise native-context summary, sends only the reviewed result, then archives and closes the child', async () => {
  const f = await branchFixture();
  try {
    await assert.rejects(f.workspace.returnToParent(f.id, 'Manual content'), /Prepare a current branch summary/);
    const [first, second] = await Promise.all([f.workspace.summarize(f.id), f.workspace.summarize(f.id)]);
    assert.equal(first.text, f.summary.text); assert.equal(second.text, first.text);
    const starts = f.calls.filter(c => c.method === 'turn/start'); assert.equal(starts.length, 1);
    assert.deepEqual(Object.keys(starts[0].params).sort(), ['additionalContext', 'input', 'outputSchema', 'threadId']);
    assert.match(starts[0].params.additionalContext['command-center-environment-instructions'].value, /Setup-Agentic-Dev-Environment/);
    assert.match(starts[0].params.additionalContext['command-center-worker-instructions'].value, /Standard Task Report/);
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
    for (let i = f.workspace.workerCount(); i < limits.maxWorkers; i++) await f.workspace.create({ goal: 'Other work ' + i, cwd: f.dir });
    f.workspace.close('existing');
    await f.workspace.create({ goal: 'Other work three', cwd: f.dir });
    assert.equal(f.workspace.agents.size, limits.maxWorkers);
    f.failures.set('turn/steer', 'Parent temporarily unavailable');
    await assert.rejects(f.workspace.returnToParent(f.id, f.summary.text), /Parent temporarily unavailable/);
    assert.ok(f.workspace.agents.has(f.id)); assert.ok(!f.threads.get(f.id).archived);
    assert.equal(f.workspace.agents.size, limits.maxWorkers); assert.ok(!f.workspace.agents.has('existing'), 'failed handoff restores the child tab at capacity');
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

test('a parent request blocks return with a named recovery message and preserves the child summary and exact request', async () => {
  const f = await branchFixture();
  try {
    await f.workspace.summarize(f.id);
    f.ask('parent-choice', 'existing');
    await waitFor(() => f.workspace.agent('existing').questions.length === 1);
    const child = f.workspace.agent(f.id);
    const request = structuredClone(f.workspace.agent('existing').questions[0]);
    const before = f.calls.length;
    await assert.rejects(f.workspace.returnToParent(f.id, 'My edited summary.'), error => {
      assert.equal(error.status, 409);
      assert.match(error.message, /Parent chat "Agent existing" has a pending question or approval/);
      assert.match(error.message, /Open parent.*retry.*summary is kept here/);
      return true;
    });
    assert.equal(child.returnSummary.delivered, false);
    assert.equal(child.returnSummary.text, f.summary.text);
    assert.ok(f.workspace.agents.has(f.id));
    assert.deepEqual(f.workspace.agent('existing').questions[0], request);
    assert.equal(f.replies.length, 0);
    assert.equal(f.calls.slice(before).some(call => ['turn/start', 'turn/steer', 'turn/interrupt', 'thread/archive'].includes(call.method)), false);
    f.notify('serverRequest/resolved', { threadId: 'existing', requestId: 'parent-choice' });
    await waitFor(() => !f.workspace.agent('existing').questions.length);
    await f.workspace.returnToParent(f.id, 'My edited summary.');
    assert.match(f.calls.findLast(call => call.method === 'turn/steer').params.input[0].text, /My edited summary/);
  } finally { await f.close(); }
});

test('missing parent request details identify the parent without claiming another client owns the request', async () => {
  const f = await branchFixture();
  try {
    await f.workspace.summarize(f.id);
    f.workspace.agent('existing').thread.status.activeFlags = ['waitingOnApproval'];
    const before = f.calls.length;
    await assert.rejects(f.workspace.returnToParent(f.id, f.summary.text), /Parent chat "Agent existing".*load its pending request/);
    assert.equal(f.calls.length, before);
    assert.equal(f.workspace.agent(f.id).returnSummary.delivered, false);
    assert.equal(f.replies.length, 0);
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

test('seventeen simultaneous creates start only sixteen agents; closing a tab never interrupts its agent', async () => {
  const f = await fixture();
  try {
    const results = await Promise.allSettled(Array.from({ length: limits.maxWorkers + 1 }, (_, i) => f.workspace.create({ goal: 'Independent task ' + i, cwd: f.dir })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, limits.maxWorkers);
    assert.equal(f.calls.filter(c => c.method === 'thread/start').length, limits.maxWorkers);
    for (const c of f.calls.filter(c => c.method === 'thread/start')) assert.deepEqual(Object.keys(c.params), ['cwd']);
    const first = f.workspace.snapshot().agents[0]; f.workspace.close(first.id);
    assert.equal(f.calls.filter(c => c.method === 'turn/interrupt').length, 0);
    f.ask('background', first.id); await waitFor(() => f.workspace.snapshot().backgroundQuestions === 1);
    await f.workspace.open(first.id); assert.equal(f.workspace.agent(first.id).questions.length, 1);
  } finally { await f.close(); }
});

test('the sixteenth worker can be a branch and every entry point rejects a seventeenth before native work', async () => {
  const f = await fixture();
  try {
    await f.workspace.open('existing');
    for (let i = 1; i < limits.maxWorkers - 1; i++) await f.workspace.create({ goal: 'Independent task ' + i, cwd: f.dir });
    const branchId = await f.workspace.fork('existing');
    assert.equal(f.workspace.workerCount(), 16);
    assert.equal(f.workspace.agent(branchId).parentId, 'existing');
    const before = f.calls.length;
    await assert.rejects(f.workspace.open('overflow'), /16 worker tabs/);
    await assert.rejects(f.workspace.create({ goal: 'Overflow', cwd: f.dir }), /16 worker tabs/);
    await assert.rejects(f.workspace.fork('existing'), /Close an agent tab/);
    assert.equal(f.calls.length, before, 'rejected actions must not create, resume or fork native conversations');
    f.workspace.close(branchId);
    await f.workspace.open(branchId);
    assert.equal(f.workspace.workerCount(), 16);
    assert.equal(f.calls.filter(call => call.method === 'turn/interrupt').length, 0);
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

test('all four requests replayed during resume survive duplicate delivery with independent tokens', async () => {
  const f = await fixture();
  try {
    const ids = [51, '51', 52, 53];
    const requests = ids.map((id, index) => ({ id, method: index === 3 ? 'item/fileChange/requestApproval' : 'item/commandExecution/requestApproval', params: { threadId: 'existing', turnId: 'turn-existing', itemId: `synthetic-item-${index}`, command: `synthetic-command-${index}` } }));
    f.resumeRequests.set('existing', [...requests, requests[0]]);
    const agent = await f.workspace.open('existing');
    assert.deepEqual(agent.questions.map(q => q.id), ids);
    assert.equal(f.workspace.pending.size, 4);
    assert.equal(new Set(agent.questions.map(q => q.reviewToken)).size, 4);
    assert.deepEqual(agent.questions.map(q => q.params), requests.map(q => q.params));
    const tokens = agent.questions.map(q => q.reviewToken);
    f.request(requests[0]);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(agent.questions.map(q => q.reviewToken), tokens);
    f.notify('serverRequest/resolved', { threadId: 'existing', requestId: 51 });
    await waitFor(() => agent.questions.length === 3);
    assert.deepEqual(agent.questions.map(q => q.id), ids.slice(1));
    assert.deepEqual(agent.questions.map(q => q.reviewToken), tokens.slice(1));
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

test('persistent Codex command, network and file choices forward only the exact native offer', async () => {
  const f = await fixture();
  try {
    await f.workspace.open('existing');
    const prefix = { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['git', 'status'] } };
    const network = { applyNetworkPolicyAmendment: { network_policy_amendment: { host: 'docs.example.invalid', action: 'allow' } } };
    const cases = [
      { id: 'saved-prefix', kind: 'commandExecution', decision: prefix, forged: { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['git'] } } },
      { id: 'saved-host', kind: 'commandExecution', decision: network, forged: { applyNetworkPolicyAmendment: { network_policy_amendment: { host: '*.example.invalid', action: 'allow' } } } },
      { id: 'file-session', kind: 'fileChange', decision: 'acceptForSession', forged: prefix }
    ];
    for (const choice of cases) {
      f.request({ id: choice.id, method: `item/${choice.kind}/requestApproval`, params: {
        threadId: 'existing', turnId: 'turn-existing', command: 'git status', availableDecisions: ['accept', choice.decision, 'decline']
      } });
      await waitFor(() => f.workspace.agent('existing').questions.some(question => question.id === choice.id));
      const repliesBefore = f.replies.length;
      assert.throws(() => f.workspace.answer('existing', choice.id, { decision: choice.forged }), /offered by the current native request/);
      assert.equal(f.replies.length, repliesBefore);
      assert.equal(f.workspace.agent('existing').questions[0].responding, undefined);
      const accepted = f.workspace.answer('existing', choice.id, { decision: structuredClone(choice.decision) });
      await waitFor(() => f.replies.length > repliesBefore);
      assert.deepEqual(f.replies.at(-1), { id: choice.id, result: { decision: choice.decision } });
      assert.equal(f.workspace.agent('existing').questions[0].responding, true, 'native persistence is not confirmed merely by sending');
      f.notify('serverRequest/resolved', { threadId: 'existing', requestId: choice.id }); await accepted;
      assert.equal(f.workspace.agent('existing').questions.length, 0);
    }
    assert.equal(f.calls.some(call => /config|settings\/update/.test(call.method)), false, 'CCNG does not write native configuration itself');
  } finally { await f.close(); }
});

test('native tool persistence uses MCP approval metadata while generic forms and permissions reject it', async () => {
  const f = await fixture();
  try {
    await f.workspace.open('existing');
    for (const [id, offered, answer, expected] of [
      ['native-always', ['session', 'always'], { decision: 'accept', persistence: 'always' }, { action: 'accept', content: null, _meta: { persist: 'always' } }],
      ['native-once', 'session', { decision: 'accept' }, { action: 'accept', content: null, _meta: null }]
    ]) {
      f.request({ id, method: 'mcpServer/elicitation/request', params: { threadId: 'existing', mode: 'openai/form',
        requestedSchema: { type: 'object', properties: {} }, _meta: { codex_approval_kind: 'mcp_tool_call', persist: offered } } });
      await waitFor(() => f.workspace.agent('existing').questions.some(question => question.id === id));
      if (id === 'native-once') {
        const before = f.replies.length;
        assert.throws(() => f.workspace.answer('existing', id, { decision: 'accept', persistence: 'always' }), /offered by the current native request/);
        assert.equal(f.replies.length, before);
      }
      const accepted = f.workspace.answer('existing', id, answer);
      await waitFor(() => f.replies.some(reply => reply.id === id));
      assert.deepEqual(f.replies.at(-1), { id, result: expected });
      assert.equal(f.workspace.agent('existing').questions.length, 1);
      f.notify('serverRequest/resolved', { threadId: 'existing', requestId: id }); await accepted;
    }
    f.request({ id: 'generic-form', method: 'mcpServer/elicitation/request', params: { threadId: 'existing', mode: 'openai/form', requestedSchema: { type: 'object', properties: {} } } });
    f.request({ id: 'permissions', method: 'item/permissions/requestApproval', params: { threadId: 'existing', permissions: { network: { enabled: true } } } });
    await waitFor(() => f.workspace.agent('existing').questions.length === 2);
    const before = f.replies.length;
    for (const id of ['generic-form', 'permissions']) {
      assert.throws(() => f.workspace.answer('existing', id, { decision: 'accept', persistence: 'always' }), /does not offer a saved permission choice/);
    }
    assert.equal(f.replies.length, before);
    assert.equal(f.workspace.agent('existing').questions.length, 2, 'unoffered persistence never resolves or dismisses a request');
  } finally { await f.close(); }
});

test('persistent approval answers preserve strict request and thread identity until native acknowledgement', async () => {
  const f = await fixture();
  try {
    f.threads.set('other', { ...f.threads.get('existing'), id: 'other', status: { type: 'idle' } });
    await f.workspace.open('existing'); await f.workspace.open('other');
    for (const [threadId, id] of [['existing', 901], ['other', '901']]) {
      f.request({ id, method: 'item/commandExecution/requestApproval', params: { threadId, availableDecisions: ['accept', 'acceptForSession', 'decline'] } });
    }
    await waitFor(() => f.workspace.pending.size === 2);
    assert.throws(() => f.workspace.answer('existing', '901', { decision: 'acceptForSession' }), /already been resolved/);
    assert.throws(() => f.workspace.answer('other', 901, { decision: 'acceptForSession' }), /already been resolved/);
    const accepted = f.workspace.answer('existing', 901, { decision: 'acceptForSession' });
    await waitFor(() => f.replies.length === 1);
    assert.deepEqual(f.replies[0], { id: 901, result: { decision: 'acceptForSession' } });
    assert.throws(() => f.workspace.answer('existing', 901, { decision: 'accept' }), /awaiting confirmation/);
    f.notify('serverRequest/resolved', { threadId: 'other', requestId: 901 });
    f.notify('serverRequest/resolved', { threadId: 'existing', requestId: '901' });
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(f.workspace.pending.size, 2); assert.equal(f.workspace.answerJobs.size, 1);
    f.notify('serverRequest/resolved', { threadId: 'existing', requestId: 901 }); await accepted;
    assert.equal(f.workspace.agent('existing').questions.length, 0);
    assert.equal(f.workspace.agent('other').questions[0].id, '901');
    assert.throws(() => f.workspace.answer('existing', 901, { decision: 'acceptForSession' }), /already been resolved/);
    assert.equal(f.replies.length, 1);
  } finally { await f.close(); }
});

test('coordinator requests cannot grant persistent command choices or native MCP and permission access', async () => {
  const f = await fixture();
  try {
    const agent = await f.workspace.open('existing'); agent.role = 'coordinator';
    const prefix = { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['git', 'status'] } };
    f.request({ id: 'coordinator-command', method: 'item/commandExecution/requestApproval', params: { threadId: 'existing', availableDecisions: ['accept', 'acceptForSession', prefix, 'decline'] } });
    f.request({ id: 'coordinator-mcp', method: 'mcpServer/elicitation/request', params: { threadId: 'existing', mode: 'openai/form', requestedSchema: { type: 'object', properties: {} }, _meta: { codex_approval_kind: 'mcp_tool_call', persist: ['session', 'always'] } } });
    f.request({ id: 'coordinator-permission', method: 'item/permissions/requestApproval', params: { threadId: 'existing', permissions: { network: { enabled: true } } } });
    await waitFor(() => agent.questions.length === 3);
    for (const decision of ['acceptForSession', prefix]) {
      assert.throws(() => f.workspace.answer('existing', 'coordinator-command', { decision }), { status: 400 });
    }
    for (const answer of [{ decision: 'accept' }, { decision: 'accept', persistence: 'session' }, { decision: 'accept', persistence: 'always' }]) {
      assert.throws(() => f.workspace.answer('existing', 'coordinator-mcp', answer), { status: 403 });
    }
    assert.throws(() => f.workspace.answer('existing', 'coordinator-permission', { decision: 'accept' }), { status: 403 });
    assert.throws(() => f.workspace.answer('existing', 'coordinator-permission', { decision: 'accept', scope: 'session' }), { status: 403 });
    assert.equal(f.replies.length, 0); assert.equal(f.workspace.answerJobs.size, 0);
    assert.equal(agent.questions.length, 3);
    assert.equal(f.calls.some(call => /config|settings\/update/.test(call.method)), false);
  } finally { await f.close(); }
});

test('HTTP persistent approval strips its request envelope and waits for exact native confirmation', async () => {
  const f = await fixture(); const authFile = join(f.dir, 'auth.json'); const password = randomBytes(24).toString('base64url');
  f.workspace.beads = { checkAvailable: async () => 'fixture', context: () => ({}), linked: async () => ({ status: 'ready', tasks: [] }) };
  await setPassword(password, authFile);
  const app = await createApp({ rpc: f.rpc, workspace: f.workspace, authFile });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const post = (path, data, cookie) => fetch(base + path, { method: 'POST', headers: {
    'Content-Type': 'application/json', Origin: base, ...(cookie ? { Cookie: cookie } : {})
  }, body: JSON.stringify(data) });
  try {
    const login = await post('/api/login', { password }); assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.equal((await post('/api/agents/existing/open', {}, cookie)).status, 200);
    const decision = { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['git', 'status'] } };
    f.request({ id: 'http-persistent', method: 'item/commandExecution/requestApproval', params: {
      threadId: 'existing', availableDecisions: ['accept', decision, 'decline']
    } });
    await waitFor(() => f.workspace.agent('existing').questions.some(question => question.id === 'http-persistent'));
    let settled = false;
    const pending = post('/api/agents/existing/answer', { requestId: 'http-persistent', decision }, cookie).then(response => { settled = true; return response; });
    await waitFor(() => f.replies.some(reply => reply.id === 'http-persistent'));
    assert.deepEqual(f.replies.at(-1), { id: 'http-persistent', result: { decision } });
    assert.equal(settled, false); assert.equal(f.workspace.agent('existing').questions.length, 1);
    f.notify('serverRequest/resolved', { threadId: 'existing', requestId: 'http-persistent' });
    assert.equal((await pending).status, 200);
    assert.equal(f.workspace.agent('existing').questions.length, 0);
  } finally { await app.close(); await f.close(); }
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

test('native MCP and permission answers retain exact identity and wait for confirmation; unsupported human requests stay visible', async () => {
  const f = await fixture();
  try {
    await f.workspace.open('existing');
    const profile = { fileSystem: { read: ['/example/project'], write: null }, network: null };
    f.request({ id: 801, method: 'item/permissions/requestApproval', params: { threadId: 'existing', turnId: 'turn-existing', permissions: profile, reason: 'Read selected source' } });
    await waitFor(() => f.workspace.agent('existing').questions.length === 1);
    assert.throws(() => f.workspace.answer('existing', 801, { decision: 'accept', permissions: { network: { enabled: true } }, scope: 'session' }), /only this current permission request/);
    assert.equal(f.replies.length, 0, 'browser-provided permissions cannot replace the native requested profile');
    const pending = f.workspace.answer('existing', 801, { requestId: 801, decision: 'accept', scope: 'session' });
    await waitFor(() => f.replies.some(reply => reply.id === 801));
    assert.deepEqual(f.replies.find(reply => reply.id === 801).result, { permissions: { fileSystem: profile.fileSystem }, scope: 'session' });
    assert.equal(f.workspace.agent('existing').questions.length, 1, 'sending is not native confirmation');
    f.notify('serverRequest/resolved', { threadId: 'existing', requestId: 801 }); await pending;
    assert.throws(() => f.workspace.answer('existing', 801, { decision: 'accept' }), /already been resolved/);
    f.request({ id: '801', method: 'mcpServer/elicitation/request', params: { threadId: 'existing', turnId: 'turn-existing', serverName: 'Example connector', mode: 'openai/form', message: 'Allow this tool?', requestedSchema: { type: 'object', properties: { decision: { type: 'string', enum: ['once', 'deny'] } }, required: ['decision'] } } });
    await waitFor(() => f.workspace.agent('existing').questions.length === 1);
    const before = f.replies.length;
    assert.throws(() => f.workspace.answer('existing', '801', { decision: 'accept', content: { decision: 'always' } }), /Check the answer/);
    assert.equal(f.replies.length, before);
    const accepted = f.workspace.answer('existing', '801', { decision: 'accept', content: { decision: 'once' } });
    await waitFor(() => f.replies.length > before);
    assert.deepEqual(f.replies.at(-1).result, { action: 'accept', content: { decision: 'once' }, _meta: null });
    f.notify('serverRequest/resolved', { threadId: 'existing', requestId: '801' }); await accepted;
    f.request({ id: 'future', method: 'item/future/requestApproval', params: { threadId: 'existing', reason: 'Review a future action' } });
    await waitFor(() => f.workspace.agent('existing').questions.length === 1);
    assert.equal(f.replies.length, before + 1, 'unknown human requests are not automatically refused');
    assert.throws(() => f.workspace.answer('existing', 'future', { decision: 'accept' }), /no supported answer format/);
    assert.equal(f.workspace.agent('existing').questions[0].id, 'future');
    f.request({ id: 'legacy', method: 'execCommandApproval', params: { conversationId: 'existing', command: ['printf', 'example'], reason: 'Legacy callback' } });
    await waitFor(() => f.workspace.agent('existing').questions.length === 2);
    assert.equal(f.workspace.agent('existing').questions.find(question => question.id === 'legacy').params.threadId, 'existing');
    f.request({ id: 'internal', method: 'account/chatgptAuthTokens/refresh', params: { reason: 'Refresh native credentials' } });
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(f.workspace.agent('existing').questions.length, 2);
    assert.equal(f.calls.some(call => call.method === 'turn/interrupt'), false);
  } finally { await f.close(); }
});

test('password length bounds preserve existing authentication on rejected replacement', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccng-password-bounds-'));
  const authFile = join(dir, 'auth.json'); const password = randomBytes(3072).toString('base64url');
  try {
    assert.equal(password.length, 4096);
    await setPassword(password, authFile);
    const profile = await readFile(authFile);
    await assert.rejects(setPassword(password + 'x', authFile), /at most 4096 characters/);
    assert.deepEqual(await readFile(authFile), profile, 'oversized replacement leaves the existing profile unchanged');
    await assert.rejects(setPassword('short', authFile), /at least 12 characters/);
    assert.deepEqual(await readFile(authFile), profile);
    assert.equal((await loadPassword(authFile))(password), true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('password CLI accepts the maximum length with LF or CRLF and preserves authentication on oversized input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccng-password-stdin-'));
  const authFile = join(dir, 'auth.json'); const password = randomBytes(3072).toString('base64url');
  const run = input => spawnSync(process.execPath, [fileURLToPath(new URL('../server/password.mjs', import.meta.url)), '--stdin'], {
    input, encoding: 'utf8', env: { ...process.env, CCNG_CONFIG_DIR: dir }, timeout: 10000, maxBuffer: 8192,
  });
  try {
    for (const ending of ['\n', '\r\n']) {
      const accepted = run(password + ending);
      assert.ifError(accepted.error);
      assert.equal(accepted.status, 0, accepted.stderr);
      assert.equal((await loadPassword(authFile))(password), true);
      const profile = await readFile(authFile);
      const rejected = run(password + 'x' + ending);
      assert.ifError(rejected.error);
      assert.equal(rejected.status, 1);
      assert.match(rejected.stderr, /too long|at most 4096/);
      assert.deepEqual(await readFile(authFile), profile, 'oversized stdin preserves the existing authentication profile');
      assert.ok(!accepted.stdout.includes(password) && !rejected.stderr.includes(password));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('long password stays hashed/private; HTTP login protects controls, rejects cross-origin writes, and logout revokes sessions', async () => {
  const f = await fixture(); const authFile = join(f.dir, 'auth.json'); const password = randomBytes(1536).toString('base64url');
  assert.equal(password.length, 2048);
  const linkCalls = [];
  f.workspace.beads = {
    checkAvailable: async () => 'bd version fixture',
    context: () => ({}),
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
    const unauthenticated = await request('/api/state');
    assert.equal(unauthenticated.status, 403); assert.equal((await unauthenticated.json()).code, 'authentication_required');
    assert.equal(unauthenticated.headers.get('www-authenticate'), null);
    assert.equal((await request('/api/agents/existing/messages/image-post/images/0')).status, 403);
    assert.equal((await request('/api/coordinator', {})).status, 403);
    assert.equal((await request('/api/agents/existing/tasks')).status, 403);
    assert.equal((await request('/api/agents/existing/tasks', { ids: [] })).status, 403);
    for (const action of ['fork', 'parent', 'summary', 'return', 'answer', 'review', 'requests']) assert.equal((await request('/api/agents/existing/' + action, {})).status, 403);
    assert.equal((await request('/api/login', { password }, undefined, 'https://unrelated.example')).status, 403);
    const oversizedLogin = await request('/api/login', { password: 'x'.repeat(4097) });
    assert.equal(oversizedLogin.status, 403); assert.equal((await oversizedLogin.json()).code, 'invalid_password');
    assert.equal(oversizedLogin.headers.get('www-authenticate'), null);
    assert.equal(oversizedLogin.headers.get('set-cookie'), null);
    const login = await request('/api/login', { password }); assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
    assert.equal((await request('/api/state', undefined, cookie)).status, 200);
    assert.equal((await request('/api/agents/existing/open', {}, cookie)).status, 200);
    assert.equal((await request('/api/agents/existing/tasks', undefined, cookie)).status, 200);
    assert.equal((await request('/api/agents/existing/tasks', { ids: ['demo-a'] }, cookie, 'https://unrelated.example')).status, 403);
    assert.equal(linkCalls.length, 0);
    assert.equal((await request('/api/agents/existing/tasks', { ids: ['demo-a'] }, cookie)).status, 200);
    assert.deepEqual(linkCalls, [{ cwd: f.dir, id: 'existing', ids: ['demo-a'] }]);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7hkAAAAASUVORK5CYII=';
    const imagePost = { text: '圖'.repeat(30000), images: [{ dataUrl: png }] };
    const beforeImage = f.calls.length;
    assert.equal((await request('/api/agents/existing/message', imagePost, cookie, 'https://unrelated.example')).status, 403);
    assert.equal(f.calls.length, beforeImage);
    const imageWorker = f.workspace.agent('existing'); imageWorker.thread.status = { type: 'idle' }; imageWorker.turnId = null;
    const imageDelivery = await request('/api/agents/existing/message', imagePost, cookie);
    assert.equal(imageDelivery.status, 200, 'image delivery: ' + JSON.stringify(await imageDelivery.json()));
    assert.deepEqual(f.calls.findLast(call => call.method === 'turn/start').params.input.at(-1), { type: 'image', url: png });
    f.workspace.addItem(imageWorker, { id: 'image-post', type: 'userMessage', content: [{ type: 'image', url: png }] }, 'image-turn');
    const imageResponse = await request('/api/agents/existing/messages/image-post/images/0', undefined, cookie);
    assert.equal(imageResponse.status, 200); assert.equal(imageResponse.headers.get('content-type'), 'image/png');
    assert.equal(imageResponse.headers.get('cache-control'), 'no-store');
    assert.equal(Buffer.from(await imageResponse.arrayBuffer()).toString('base64'), png.split(',')[1]);
    assert.equal((await request('/api/agents/existing/messages/image-post/images/1', undefined, cookie)).status, 404);
    assert.equal((await request('/api/agents/missing/messages/image-post/images/0', undefined, cookie)).status, 404);
    assert.equal((await request('/api/agents/existing/message', { text: '', images: [{ dataUrl: 'https://example.invalid/image.png' }] }, cookie)).status, 400);
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
    assert.equal((await request('/api/state', undefined, cookie)).status, 403);
  } finally { await app.close(); await f.close(); }
});

test('worker model controls validate the native catalog and persist only model/effort without interrupting active work or requests', async () => {
  const f = await fixture();
  try {
    const worker = await f.workspace.open('existing'); const originalTurn = worker.turnId;
    const catalog = await f.workspace.modelSettings('existing');
    assert.deepEqual(catalog.models.map(model => model.model), ['configured-model', 'alternate-model']);
    assert.deepEqual(catalog.models[1].efforts.map(option => option.value), ['medium']);
    f.ask('unchanged-request', 'existing'); await waitFor(() => worker.questions.length === 1);
    await assert.rejects(f.workspace.updateModel('existing', { model: 'invented', effort: 'high' }), /offered by the native/);
    await assert.rejects(f.workspace.updateModel('existing', { model: 'alternate-model', effort: 'high' }), /supported reasoning/);
    await assert.rejects(f.workspace.updateModel('existing', { model: 'alternate-model', effort: 'medium', sandboxPolicy: 'unsafe' }), /only a model/);
    assert.equal(f.calls.some(call => call.method === 'thread/settings/update'), false);
    const result = await f.workspace.updateModel('existing', { model: 'alternate-model', effort: 'medium' });
    assert.equal(result.model, 'alternate-model'); assert.equal(result.effort, 'medium'); assert.equal(result.change.status, 'saved');
    assert.equal(worker.turnId, originalTurn); assert.equal(worker.questions[0].id, 'unchanged-request'); assert.equal(f.replies.length, 0);
    assert.deepEqual(f.calls.find(call => call.method === 'thread/settings/update').params, { threadId: 'existing', model: 'alternate-model', effort: 'medium' });
    assert.equal(f.calls.some(call => ['turn/interrupt', 'turn/steer', 'turn/start'].includes(call.method)), false);
    const restored = new Workspace(f.rpc, { beads: null }); await restored.open('existing', { observeOnly: true });
    assert.equal(restored.agent('existing').model, 'alternate-model'); assert.equal(restored.agent('existing').reasoningEffort, 'medium');
    f.failures.set('thread/settings/update', 'Unsupported runtime settings method');
    await assert.rejects(f.workspace.updateModel('existing', { model: 'configured-model', effort: 'low' }), /Unsupported runtime/);
    assert.equal(worker.model, 'alternate-model'); assert.equal(worker.modelChange.status, 'unconfirmed');
    f.notify('thread/settings/updated', { threadId: 'existing', threadSettings: { model: 'configured-model', effort: 'low' } });
    await waitFor(() => worker.modelChange.status === 'saved');
    assert.equal(worker.model, 'configured-model'); assert.equal(worker.reasoningEffort, 'low');
    assert.equal(worker.modelChange.error, undefined);
  } finally { await f.close(); }
});
