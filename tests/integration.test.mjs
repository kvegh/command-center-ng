import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, chmod, stat, readFile } from 'node:fs/promises';
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
  const calls = []; const replies = []; const threads = new Map(); let sequence = 0; let connection;
  const thread = (id, status = 'idle') => ({ id, name: `Agent ${id}`, preview: 'Build a useful feature', cwd: dir, status: { type: status, activeFlags: [] }, canAcceptDirectInput: true, turns: [], model: 'configured-model' });
  threads.set('existing', thread('existing', 'active'));
  const notify = (method, params) => connection.send(JSON.stringify({ method, params }));
  const ask = (id, threadId) => connection.send(JSON.stringify({ id, method: 'item/tool/requestUserInput', params: { threadId, turnId: 'turn-' + threadId, questions: [{ id: 'choice', header: 'Direction', question: 'Which direction?', options: [{ label: 'Small', description: 'Keep the first step small.' }] }] } }));
  wss.on('connection', ws => { connection = ws; ws.on('message', bytes => {
    const message = JSON.parse(bytes.toString());
    if (!message.method) { replies.push(message); return; }
    if (message.id === undefined) return;
    calls.push(message); const p = message.params; let result;
    switch (message.method) {
      case 'initialize': result = { userAgent: 'fixture' }; break;
      case 'thread/list': result = { data: [...threads.values()], nextCursor: null }; break;
      case 'thread/resume': case 'thread/read': result = { thread: threads.get(p.threadId) }; break;
      case 'thread/turns/list': result = { data: [{ id: 'turn-' + p.threadId, status: threads.get(p.threadId).status.type === 'active' ? 'inProgress' : 'completed', items: [{ id: 'message-' + p.threadId, type: 'agentMessage', text: 'Ready to work.' }] }], nextCursor: null }; break;
      case 'thread/start': { const id = 'new-' + (++sequence); threads.set(id, thread(id)); result = { thread: threads.get(id) }; break; }
      case 'thread/name/set': threads.get(p.threadId).name = p.name; result = {}; break;
      case 'turn/start': result = { turn: { id: 'turn-' + p.threadId } }; setImmediate(() => notify('turn/started', { threadId: p.threadId, turn: { id: result.turn.id } })); break;
      case 'turn/steer': result = { turnId: p.expectedTurnId }; break;
      case 'turn/interrupt': result = {}; setImmediate(() => notify('turn/completed', { threadId: p.threadId, turn: { id: p.turnId, status: 'interrupted' } })); break;
      default: ws.send(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Unknown method' } })); return;
    }
    ws.send(JSON.stringify({ id: message.id, result }));
  }); });
  await new Promise(resolve => server.listen(socketPath, resolve));
  const rpc = new CodexRpc({ socketPath, timeout: 2000 }); await rpc.connect(); const workspace = new Workspace(rpc);
  return { dir, rpc, workspace, calls, replies, notify, ask, close: async () => { rpc.close(); for (const client of wss.clients) client.terminate(); await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); } };
}

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

test('questions change status, require explicit answers, and reject stale request ids', async () => {
  const f = await fixture();
  try {
    await f.workspace.open('existing'); f.ask('question-1', 'existing');
    await waitFor(() => f.workspace.snapshot().agents[0].status === 'attention');
    await assert.rejects(f.workspace.send('existing', 'do something'), /pending question/);
    assert.throws(() => f.workspace.answer('existing', 'question-1', { answers: {} }), /Answer every question/);
    f.workspace.answer('existing', 'question-1', { answers: { choice: 'Small' } });
    await waitFor(() => f.replies.length === 1);
    assert.deepEqual(f.replies[0], { id: 'question-1', result: { answers: { choice: { answers: ['Small'] } } } });
    assert.throws(() => f.workspace.answer('existing', 'question-1', {}), /already been resolved/);
    assert.equal(statusOf({ status: { type: 'active', activeFlags: ['waitingOnApproval'] } }), 'attention');
  } finally { await f.close(); }
});

test('password stays hashed/private; HTTP login protects controls, rejects cross-origin writes, and logout revokes sessions', async () => {
  const f = await fixture(); const authFile = join(f.dir, 'auth.json'); const password = randomBytes(24).toString('base64url');
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
    assert.equal((await request('/api/login', { password }, undefined, 'https://unrelated.example')).status, 403);
    const login = await request('/api/login', { password }); assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
    assert.equal((await request('/api/state', undefined, cookie)).status, 200);
    assert.equal((await request('/api/agents/existing/open', {}, cookie)).status, 200);
    assert.equal((await request('/api/agents/existing/message', { text: 'Continue' }, cookie, 'https://unrelated.example')).status, 403);
    assert.equal((await request('/api/logout', {}, cookie)).status, 200);
    assert.equal((await request('/api/state', undefined, cookie)).status, 401);
  } finally { await app.close(); await f.close(); }
});
