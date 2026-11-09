import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/main.mjs';
import { setPassword } from '../server/auth.mjs';
import { Workspace } from '../server/workspace.mjs';

class Response extends EventEmitter {
  headers = {}; chunks = []; writableLength = 0;
  finished = new Promise(resolve => { this.finish = resolve; });
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; for (const [name, value] of Object.entries(headers)) this.setHeader(name, value); }
  write(chunk) { this.chunks.push(String(chunk)); return true; }
  end(chunk) { if (chunk !== undefined) this.write(chunk); this.finish(this); this.emit('finish'); }
  destroy() { this.destroyed = true; this.finish(this); this.emit('finish'); }
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-request-delivery-'));
  const rpc = new EventEmitter(); rpc.ready = true; rpc.calls = []; rpc.replies = []; rpc.replay = [];
  const thread = { id: 'worker', name: 'Synthetic project', cwd: directory, status: { type: 'active', activeFlags: ['waitingOnUserInput'] } };
  rpc.connect = async () => {};
  rpc.close = () => {};
  rpc.respond = (id, result) => rpc.replies.push({ id, result });
  rpc.call = async (method, params) => {
    rpc.calls.push({ method, params });
    if (method === 'thread/resume') for (const request of rpc.replay) rpc.emit('request', request);
    if (['thread/read', 'thread/resume'].includes(method)) return { thread: structuredClone(thread), instructionSources: [] };
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    throw new Error('Unexpected native call: ' + method);
  };
  const workspace = new Workspace(rpc, { beads: null, recoveryTimeout: 5 });
  await workspace.open(thread.id);
  const password = randomBytes(24).toString('base64url'); const authFile = join(directory, 'auth.json');
  await setPassword(password, authFile);
  const app = await createApp({ rpc, workspace, authFile, workspaceFile: join(directory, 'workspace.json') });
  await app.persistence.restore();
  // Exercise the real authenticated HTTP handlers without binding a network port.
  const request = (path, body, cookie) => {
    const incoming = new EventEmitter();
    Object.assign(incoming, {
      url: path, method: body === undefined ? 'GET' : 'POST',
      headers: { host: 'localhost:4242', origin: 'http://localhost:4242', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      socket: { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)); },
    });
    const response = new Response(); response.once('finish', () => incoming.emit('close'));
    app.server.emit('request', incoming, response); return response;
  };
  const login = await request('/api/login', { password }).finished;
  assert.equal(login.statusCode, 200); const cookie = login.headers['set-cookie'];
  const question = { id: 73, method: 'item/tool/requestUserInput', params: { threadId: thread.id, turnId: 'waiting-turn', questions: [{ id: 'direction', question: 'Which fixture option?', options: [{ label: 'First', description: 'Use the first option.' }] }] } };
  return { rpc, workspace, app, question, request: (path, body) => request(path, body, cookie), close: async () => { await app.close(); await rm(directory, { recursive: true, force: true }); } };
}

test('HTTP reconnect preserves exact requests replayed before the resume response', async () => {
  const f = await fixture();
  try {
    f.rpc.replay = [f.question];
    const connected = await f.request('/api/connect', {}).finished;
    assert.equal(connected.statusCode, 200);
    assert.equal(f.workspace.pending.size, 1, 'the current native request is retained');
    const state = JSON.parse((await f.request('/api/state').finished).chunks.join(''));
    assert.deepEqual(state.agents[0].questions.map(question => question.id), [f.question.id]);
    assert.deepEqual(state.agents[0].questions[0].params, f.question.params);
    assert.equal(f.rpc.replies.length, 0, 'reconnect must not submit a response');
  } finally { await f.close(); }
});

test('HTTP handoff accepts immediately while native questions and background completion remain independent', async () => {
  const f = await fixture();
  try {
    f.rpc.emit('request', f.question);
    const calls = [];
    f.workspace.startHandoff = id => {
      calls.push(id);
      f.workspace.agent(id).handoff = { phase: 'waiting', parentId: 'parent', detail: 'Waiting for the existing request.' };
      return { id, parentId: 'parent' };
    };
    const response = await f.request('/api/agents/worker/handoff', {}).finished;
    assert.equal(response.statusCode, 202);
    assert.deepEqual(JSON.parse(response.chunks.join('')), { id: 'worker', parentId: 'parent' });
    assert.deepEqual(calls, ['worker']);
    assert.equal(f.workspace.agent('worker').handoff.phase, 'waiting');
    assert.deepEqual(f.workspace.agent('worker').questions.map(question => question.id), [73]);
    assert.equal(f.rpc.replies.length, 0, 'accepting handoff must not answer a native question');
    f.workspace.startHandoff = () => { throw Object.assign(new Error('Reconnect before handing back.'), { status: 409 }); };
    const rejected = await f.request('/api/agents/worker/handoff', {}).finished;
    assert.equal(rejected.statusCode, 409);
    assert.match(JSON.parse(rejected.chunks.join('')).error, /Reconnect/);
  } finally { await f.close(); }
});

test('withdrawn Goal control routes return 404 without native reads or writes', async () => {
  const f = await fixture();
  try {
    const before = f.rpc.calls.length;
    const read = await f.request('/api/agents/worker/goal').finished;
    assert.equal(read.statusCode, 404);
    const choice = { action: 'start', objective: 'Deliver the agreed feature and verify it.', tokenBudget: 5000, expectedGoal: null };
    const changed = await f.request('/api/agents/worker/goal', choice).finished;
    assert.equal(changed.statusCode, 404);
    assert.equal(f.rpc.calls.length, before);
    assert.equal(f.workspace.goalState, undefined);
    assert.equal(f.workspace.updateGoal, undefined);
    assert.equal(f.rpc.replies.length, 0);
  } finally { await f.close(); }
});

test('withdrawn Edit/Rewind routes return 404 and leave native conversation history unchanged', async () => {
  const f = await fixture();
  try {
    const agent = f.workspace.agent('worker');
    f.workspace.addItem(agent, { id: 'input', type: 'userMessage', content: [{ type: 'text', text: 'Keep this decision.' }] }, 'turn');
    const original = structuredClone(agent.messages), before = f.rpc.calls.length;
    for (const route of ['rewind-preview', 'rewind']) {
      assert.equal((await f.request(`/api/agents/worker/${route}`).finished).statusCode, 404);
      assert.equal((await f.request(`/api/agents/worker/${route}`, { messageId: 'input', turnId: 'turn', previewToken: 'old-preview', confirm: true }).finished).statusCode, 404);
    }
    assert.equal(f.workspace.rewindPreview, undefined); assert.equal(f.workspace.rewind, undefined);
    assert.equal(f.workspace.rewindJobs, undefined); assert.equal(f.workspace.rewinds, undefined);
    const snapshot = f.workspace.snapshot().agents[0];
    assert.equal(Object.hasOwn(snapshot, 'rewinding'), false); assert.equal(Object.hasOwn(snapshot, 'rewindBlockedReason'), false);
    assert.equal(Object.hasOwn(snapshot.messages[0], 'rewindable'), false);
    assert.deepEqual(agent.messages, original); assert.equal(f.rpc.calls.length, before); assert.equal(f.rpc.replies.length, 0);
  } finally { await f.close(); }
});

test('recovery restores retained current requests without native replay or new identities', async () => {
  const f = await fixture();
  try {
    f.rpc.emit('request', f.question);
    f.rpc.emit('request', { ...f.question, id: String(f.question.id) });
    const exact = [...f.workspace.agent('worker').questions];
    f.workspace.watched.add('other-worker');
    f.rpc.emit('request', { ...f.question, params: { ...f.question.params, threadId: 'other-worker' } });
    f.workspace.agent('worker').questions = [];
    let changes = 0; f.workspace.on('change', () => changes++);
    const before = f.rpc.calls.length;
    assert.deepEqual(await f.workspace.recoverRequests('worker'), { requests: 2 });
    assert.deepEqual(f.workspace.agent('worker').questions.map(question => question.id), [73, '73']);
    exact.forEach((question, index) => assert.equal(f.workspace.agent('worker').questions[index], question));
    assert.deepEqual(f.workspace.snapshot().agents[0].questions.map(question => question.reviewToken), exact.map(question => question.reviewToken));
    assert.equal(new Set(exact.map(question => question.reviewToken)).size, 2);
    assert.ok(changes > 0, 'recovery publishes retained details to a stale browser');
    assert.equal(f.rpc.calls.length, before, 'an already-retained request requires no native rejoin');
    assert.equal(f.rpc.replies.length, 0);

    f.rpc.emit('notification', { method: 'serverRequest/resolved', params: { threadId: 'worker', requestId: 73 } });
    f.workspace.agent('worker').questions = [];
    assert.deepEqual(await f.workspace.recoverRequests('worker'), { requests: 1 });
    assert.equal(f.workspace.agent('worker').questions[0], exact[1], 'native resolution removes the numeric ID, not the distinct string ID');
    f.rpc.emit('disconnected', 'Synthetic connection ended.');
    assert.equal(f.workspace.pending.size, 0, 'disconnection invalidates all retained request records');
    assert.deepEqual(f.workspace.agent('worker').questions, []);
  } finally { await f.close(); }
});

test('continuous worker activity cannot indefinitely postpone a pending-request snapshot', async () => {
  const f = await fixture(); let updates;
  try {
    await delay(100);
    const stream = f.request('/api/events');
    const ready = Date.now() + 1500;
    while (!stream.headersSent && Date.now() < ready) await delay(5);
    assert.equal(stream.statusCode, 200); const initial = stream.chunks.length;
    // Authentication now includes real filesystem reads. Keep producing changes
    // while they resolve, rather than assuming synchronous timer callbacks.
    updates = setInterval(() => f.workspace.changed(), 20);
    f.rpc.emit('request', f.question);
    const delivered = Date.now() + 1000;
    while (stream.chunks.length <= initial && Date.now() < delivered) await delay(10);
    assert.ok(stream.chunks.length > initial, 'a busy worker must not starve browser state delivery');
    const snapshots = stream.chunks.filter(chunk => chunk.startsWith('data: ')).map(chunk => JSON.parse(chunk.slice(6)));
    assert.ok(snapshots.some(snapshot => snapshot.agents[0].questions.some(question => question.id === f.question.id)));
    assert.equal(f.rpc.replies.length, 0);
    assert.equal(f.rpc.calls.some(call => ['turn/start', 'turn/steer', 'turn/interrupt'].includes(call.method)), false);
  } finally {
    clearInterval(updates);
    await f.close();
  }
});
