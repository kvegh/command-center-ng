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

test('continuous worker activity cannot indefinitely postpone a pending-request snapshot', async t => {
  const f = await fixture(); let mocked = false;
  try {
    await delay(100);
    const stream = f.request('/api/events');
    assert.equal(stream.statusCode, 200); const initial = stream.chunks.length;
    t.mock.timers.enable({ apis: ['setTimeout'] }); mocked = true;
    f.rpc.emit('request', f.question);
    for (let i = 0; i < 10; i++) { t.mock.timers.tick(40); f.workspace.changed(); }
    assert.ok(stream.chunks.length > initial, 'a busy worker must not starve browser state delivery');
    const snapshots = stream.chunks.filter(chunk => chunk.startsWith('data: ')).map(chunk => JSON.parse(chunk.slice(6)));
    assert.ok(snapshots.some(snapshot => snapshot.agents[0].questions.some(question => question.id === f.question.id)));
    assert.equal(f.rpc.replies.length, 0);
    assert.equal(f.rpc.calls.some(call => ['turn/start', 'turn/steer', 'turn/interrupt'].includes(call.method)), false);
  } finally {
    if (mocked) { t.mock.timers.tick(200); t.mock.timers.reset(); }
    await f.close();
  }
});
