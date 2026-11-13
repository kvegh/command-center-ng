import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/main.mjs';
import { setPassword, clearAllLogins } from '../server/auth.mjs';
import { Workspace } from '../server/workspace.mjs';

// Exercise the real authenticated HTTP handlers without binding a test socket.
// Like ServerResponse, write(false) still accepts that chunk, then needs drain.
class Response extends EventEmitter {
  headers = {}; chunks = []; writableLength = 0; backpressured = false;
  destroyed = false; writableEnded = false; writesAfterClose = 0;
  finished = new Promise(resolve => { this.finish = resolve; });
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  writeHead(status, headers = {}) {
    this.statusCode = status; this.headersSent = true;
    for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
  }
  write(chunk) {
    if (this.destroyed || this.writableEnded) { this.writesAfterClose++; return false; }
    this.chunks.push(String(chunk));
    if (this.backpressured) { this.writableLength += Buffer.byteLength(chunk); return false; }
    return true;
  }
  drain() { this.backpressured = false; this.writableLength = 0; this.emit('drain'); }
  end(chunk) {
    if (chunk !== undefined) this.write(chunk);
    this.writableEnded = true; this.finish(this); this.emit('finish'); this.emit('close');
  }
  destroy() { this.destroyed = true; this.finish(this); this.emit('finish'); this.emit('close'); }
  snapshots() { return this.chunks.filter(chunk => chunk.startsWith('data: ')).map(chunk => JSON.parse(chunk.slice(6))); }
}

async function waitFor(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Expected browser stream outcome was not observed.');
    await delay(5);
  }
}

async function fixture(t, { large = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-stream-backpressure-'));
  const authFile = join(directory, 'auth.json');
  const password = randomBytes(24).toString('base64url'); await setPassword(password, authFile);
  const rpc = new EventEmitter(); rpc.ready = true; rpc.calls = [];
  rpc.connect = async () => assert.fail('Browser delivery must not reconnect the native runtime.');
  rpc.call = async method => { rpc.calls.push(method); assert.fail('Browser delivery must not call native operations.'); };
  rpc.close = () => {};
  const workspace = new Workspace(rpc, { beads: null });
  const app = await createApp({ rpc, workspace, authFile, workspaceFile: join(directory, 'workspace.json'), config: { cwd: directory } });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  await app.persistence.restore();
  const text = large ? 'Synthetic history. '.repeat(350_000) : 'Synthetic history.';
  const agent = {
    id: 'worker', name: 'Initial snapshot', provider: 'codex', role: 'worker', cwd: directory,
    thread: { id: 'worker', status: { type: 'idle' } }, canSend: true, questions: [], tasks: [], workers: [],
    messages: [{ id: 'reply', turnId: 'turn', type: 'assistant', text, state: 'completed' }],
  };
  workspace.agents.set(agent.id, agent);
  const request = (path, data, cookie, response = new Response()) => {
    const incoming = new EventEmitter();
    Object.assign(incoming, {
      url: path, method: data === undefined ? 'GET' : 'POST',
      headers: { host: 'localhost:4242', origin: 'http://localhost:4242', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      socket: { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() { if (data !== undefined) yield Buffer.from(JSON.stringify(data)); },
    });
    response.once('finish', () => incoming.emit('close'));
    app.server.emit('request', incoming, response); return response;
  };
  const login = await request('/api/login', { password }).finished;
  assert.equal(login.statusCode, 200); const cookie = login.headers['set-cookie'];
  const openStream = async ({ blocked = false } = {}) => {
    const original = globalThis.setInterval; let heartbeat;
    globalThis.setInterval = (callback, milliseconds, ...args) => milliseconds === 15_000
      ? (heartbeat = callback, { unref() {} }) : original(callback, milliseconds, ...args);
    try {
      const response = new Response(); response.backpressured = blocked;
      request('/api/events', undefined, cookie, response);
      await waitFor(() => !!heartbeat);
      assert.equal(response.statusCode, 200);
      return { response, heartbeat };
    } finally { globalThis.setInterval = original; }
  };
  const publishTo = async (response, name) => {
    const count = response.chunks.length;
    agent.name = name; workspace.changed();
    await waitFor(() => response.chunks.length > count || response.destroyed);
    assert.equal(response.destroyed, false, 'a legitimate pending snapshot must not destroy the stream');
    assert.equal(response.snapshots().at(-1).agents[0].name, name);
  };
  return { app, authFile, rpc, workspace, agent, text, request, openStream, publishTo };
}

test('a large initial snapshot remains open and a slow browser receives only the latest update after drain', async t => {
  const f = await fixture(t, { large: true });
  const slow = await f.openStream({ blocked: true }), fast = await f.openStream();
  assert.ok(slow.response.writableLength > 4 * 1024 * 1024);
  assert.equal(slow.response.chunks.length, 1);
  await f.publishTo(fast.response, 'Intermediate snapshot');
  await f.publishTo(fast.response, 'Latest snapshot');
  assert.equal(slow.response.destroyed, false);
  assert.equal(slow.response.chunks.length, 1, 'updates must not accumulate behind a blocked snapshot');
  await slow.heartbeat();
  assert.equal(slow.response.chunks.length, 1, 'heartbeats must not add output while blocked');
  slow.response.drain();
  await waitFor(() => slow.response.chunks.length === 2);
  const received = slow.response.snapshots();
  assert.deepEqual(received.map(snapshot => snapshot.agents[0].name), ['Initial snapshot', 'Latest snapshot']);
  assert.equal(received[1].agents[0].messages[0].text, f.text, 'backpressure must not truncate retained history');
  assert.deepEqual(f.rpc.calls, []);
});

test('backpressure on an update pauses only that browser and normal heartbeat delivery resumes after drain', async t => {
  const f = await fixture(t);
  const slow = await f.openStream(), fast = await f.openStream();
  // Startup broadcasts may arrive before backpressure begins. Exercise that
  // legitimate case and keep exact write-count assertions relative to it.
  await f.publishTo(fast.response, 'Before backpressure');
  assert.equal(slow.response.snapshots().at(-1).agents[0].name, 'Before backpressure');
  const before = slow.response.chunks.length;
  slow.response.backpressured = true;
  await f.publishTo(fast.response, 'Accepted blocked update');
  assert.equal(slow.response.chunks.length, before + 1);
  await f.publishTo(fast.response, 'Newest update');
  assert.equal(slow.response.chunks.length, before + 1, 'write(false) matters even below the former byte cutoff');
  await slow.heartbeat();
  assert.equal(slow.response.chunks.length, before + 1);
  slow.response.drain();
  await waitFor(() => slow.response.chunks.length === before + 2);
  assert.equal(slow.response.snapshots().at(-1).agents[0].name, 'Newest update');
  await slow.heartbeat();
  assert.match(slow.response.chunks.at(-1), /^event: heartbeat\ndata: /);
  assert.deepEqual(f.rpc.calls, []);
});

test('blocked streams still enforce session revocation before heartbeat or deferred delivery', async t => {
  for (const trigger of ['heartbeat', 'drain']) {
    const f = await fixture(t);
    const slow = await f.openStream({ blocked: true }), fast = await f.openStream();
    await f.publishTo(fast.response, 'Pending protected update');
    const before = slow.response.chunks.length;
    await clearAllLogins(f.authFile);
    if (trigger === 'heartbeat') await slow.heartbeat();
    else slow.response.drain();
    await slow.response.finished;
    assert.ok(slow.response.destroyed || slow.response.writableEnded);
    assert.equal(slow.response.chunks.length, before, 'revoked sessions must not receive deferred snapshots or heartbeats');
    assert.deepEqual(f.rpc.calls, []);
  }
});

test('a closed slow browser cannot be revived by drain while another browser continues receiving updates', async t => {
  const f = await fixture(t);
  const slow = await f.openStream({ blocked: true }), fast = await f.openStream();
  await f.publishTo(fast.response, 'Pending before close');
  const before = slow.response.chunks.length;
  slow.response.destroy(); slow.response.drain();
  await slow.heartbeat();
  await f.publishTo(fast.response, 'Current after close');
  assert.equal(slow.response.chunks.length, before);
  assert.equal(slow.response.writesAfterClose, 0);
  assert.deepEqual(f.rpc.calls, []);
});

test('an unauthenticated browser cannot subscribe to workspace events', async t => {
  const f = await fixture(t);
  const denied = await f.request('/api/events').finished;
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(JSON.parse(denied.chunks.join('')).code, 'authentication_required');
  assert.deepEqual(f.rpc.calls, []);
});
