import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/main.mjs';
import { setPassword } from '../server/auth.mjs';
import { Workspace } from '../server/workspace.mjs';
import { WorkspaceStore } from '../server/workspace-store.mjs';

const record = (workerIds = [], coordinatorId = 'coordinator', coordinatorPaused = true) => ({ version: 1, workerIds, coordinatorId, coordinatorPaused });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

class Response extends EventEmitter {
  headers = {}; chunks = []; writableLength = 0;
  finished = new Promise(resolve => { this.finish = resolve; });
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; for (const [name, value] of Object.entries(headers)) this.setHeader(name, value); }
  write(chunk) { this.chunks.push(String(chunk)); return true; }
  end(chunk) { if (chunk !== undefined) this.write(chunk); this.writableEnded = true; this.finish(this); this.emit('finish'); }
  json() { return JSON.parse(this.chunks.join('')); }
}

class Rpc extends EventEmitter {
  constructor(cwd, ready) {
    super(); this.cwd = cwd; this.ready = ready; this.daemonAvailable = ready;
    this.calls = []; this.connectAttempts = 0; this.closeCalls = 0; this.threads = new Map(); this.nextId = 1;
  }
  async connect() {
    this.connectAttempts++;
    if (this.connectGate) await this.connectGate;
    if (!this.daemonAvailable) throw new Error('Synthetic native daemon is not ready.');
    this.ready = true; this.emit('connected');
  }
  close() { this.closeCalls++; this.ready = false; this.emit('disconnected', 'Synthetic connection closed.'); }
  respond() { assert.fail('Reboot recovery must not answer native requests.'); }
  async call(method, params) {
    this.calls.push({ method, params });
    if (method === 'thread/start' || method === 'thread/fork') {
      const thread = { id: 'created-' + this.nextId++, name: 'Synthetic worker', cwd: params.cwd || this.cwd, status: { type: 'idle' }, canAcceptDirectInput: true, ...(method === 'thread/fork' ? { forkedFromId: params.threadId } : {}) };
      this.threads.set(thread.id, thread); return { thread: structuredClone(thread) };
    }
    if (method === 'thread/name/set') { this.threads.get(params.threadId).name = params.name; return {}; }
    if (method === 'thread/read' || method === 'thread/resume') {
      return { thread: structuredClone(this.threads.get(params.threadId) || { id: params.threadId, name: params.threadId === 'coordinator' ? 'Command Center coordinator' : params.threadId, cwd: this.cwd, status: { type: 'notLoaded' }, canAcceptDirectInput: true }) };
    }
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    if (method === 'turn/start') return { turn: { id: 'synthetic-turn' } };
    throw new Error('Unexpected native operation: ' + method);
  }
}

async function fixture(t, { ready = true, saved = record() } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-reboot-runtime-'));
  const authFile = join(directory, 'auth.json'), workspaceFile = join(directory, 'workspace.json');
  const password = randomBytes(24).toString('base64url'); await setPassword(password, authFile);
  await new WorkspaceStore(workspaceFile).save(saved);
  const rpc = new Rpc(directory, ready);
  const workspace = new Workspace(rpc, { beads: null, coordinator: { debounceMs: 1000000 } });
  const app = await createApp({ rpc, workspace, authFile, workspaceFile, config: { cwd: directory } });
  t.after(async () => { await chmod(workspaceFile, 0o600).catch(() => {}); await app.close(); await rm(directory, { recursive: true, force: true }); });
  if (ready) { await app.persistence.restore(); await app.persistence.flush(); }
  const request = (path, data, cookie) => {
    const incoming = new EventEmitter();
    Object.assign(incoming, {
      url: path, method: data === undefined ? 'GET' : 'POST',
      headers: { host: 'localhost:4242', origin: 'http://localhost:4242', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      socket: { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() { if (data !== undefined) yield Buffer.from(JSON.stringify(data)); },
    });
    const response = new Response(); response.once('finish', () => incoming.emit('close'));
    app.server.emit('request', incoming, response); return response;
  };
  const login = await request('/api/login', { password }).finished;
  assert.equal(login.statusCode, 200); const cookie = login.headers['set-cookie'];
  return { directory, workspaceFile, app, rpc, workspace, request: (path, data) => request(path, data, cookie), unauthenticated: request };
}

test('late native daemon connection restores the exact saved workspace without replaying model work', { timeout: 5000 }, async t => {
  const saved = { ...record(['worker-one', 'worker-two']), workerReportIntervals: { 'worker-one': 5 } };
  const f = await fixture(t, { ready: false, saved });
  assert.equal(await f.app.connectNativeRuntime(), false);
  assert.equal(f.rpc.connectAttempts, 1); assert.equal(f.workspace.agents.size, 0);
  assert.match(f.workspace.error, /daemon is not ready/);
  assert.deepEqual(await f.app.persistence.store.load(), saved);
  assert.deepEqual(f.rpc.calls, []);

  f.rpc.daemonAvailable = true;
  assert.equal(await f.app.connectNativeRuntime(), true);
  await f.app.persistence.restore(); await f.app.persistence.flush();
  const response = await f.request('/api/state').finished;
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().agents.map(agent => agent.id), ['worker-one', 'worker-two', 'coordinator']);
  assert.equal(f.workspace.coordinator.id, 'coordinator'); assert.equal(f.workspace.coordinator.paused, true);
  assert.equal(f.workspace.error, null); assert.equal(f.workspace.restoration.status, 'ready');
  assert.equal(f.workspace.agent('worker-one').reportIntervalMinutes, 5);
  assert.equal(f.workspace.agent('worker-two').reportIntervalMinutes, 0);
  assert.equal(f.workspace.coordinator.reportState('worker-one'), 'queued', 'enabled startup reports retain the pause gate');
  assert.equal(f.workspace.coordinator.reportState('worker-two'), null, 'Never does not queue startup work');
  assert.ok(f.rpc.calls.every(call => ['thread/read', 'thread/turns/list'].includes(call.method)));
  assert.deepEqual(await f.app.persistence.store.load(), saved);
  await f.app.close(); const attempts = f.rpc.connectAttempts;
  assert.equal(await f.app.connectNativeRuntime(), false); assert.equal(f.rpc.connectAttempts, attempts);
});

test('a pending connection completing after shutdown is closed without reviving the app', { timeout: 5000 }, async t => {
  const f = await fixture(t, { ready: false, saved: record(['worker-one']) });
  const gate = deferred(); f.rpc.connectGate = gate.promise; f.rpc.daemonAvailable = true;
  const connecting = f.app.connectNativeRuntime();
  try {
    assert.equal(f.rpc.connectAttempts, 1);
    await f.app.close(); assert.equal(f.rpc.ready, false);
    gate.resolve(); assert.equal(await connecting, false);
    assert.equal(f.rpc.ready, false); assert.equal(f.rpc.closeCalls, 2);
    assert.equal(f.workspace.agents.size, 0); assert.deepEqual(f.rpc.calls, []);
    assert.equal(await f.app.connectNativeRuntime(), false); assert.equal(f.rpc.connectAttempts, 1);
  } finally { gate.resolve(); await connecting; }
});

test('authenticated lifecycle HTTP responses wait until create, open, fork and close membership is saved', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  assert.equal((await f.unauthenticated('/api/agents', { goal: 'Synthetic task', cwd: f.directory }).finished).statusCode, 403);
  assert.equal(f.rpc.calls.some(call => call.method === 'thread/start'), false);

  async function savedResponse(path, data, expectedIds, status) {
    const previous = await f.app.persistence.store.load(), entered = deferred(), release = deferred();
    const save = f.app.persistence.store.save.bind(f.app.persistence.store);
    f.app.persistence.store.save = async value => { entered.resolve(); await release.promise; return save(value); };
    const response = f.request(path, data);
    try {
      await entered.promise;
      assert.equal(response.headersSent, undefined, 'HTTP success must wait for the private membership file');
      assert.deepEqual(await f.app.persistence.store.load(), previous);
      release.resolve(); const completed = await response.finished;
      assert.equal(completed.statusCode, status); assert.equal(completed.json().workspaceSaveWarning, undefined);
      assert.deepEqual((await f.app.persistence.store.load()).workerIds, expectedIds);
      return completed.json();
    } finally { release.resolve(); await response.finished; f.app.persistence.store.save = save; }
  }

  const created = await savedResponse('/api/agents', { goal: 'Synthetic task', cwd: f.directory }, ['created-1'], 201);
  assert.equal(created.id, 'created-1');
  assert.deepEqual(await savedResponse('/api/agents/external-worker/open', {}, ['created-1', 'external-worker'], 200), { ok: true });
  const branch = await savedResponse('/api/agents/external-worker/fork', {}, ['created-1', 'external-worker', 'created-2'], 201);
  assert.equal(branch.id, 'created-2');
  assert.deepEqual(await savedResponse('/api/agents/external-worker/close', {}, ['created-1', 'created-2'], 200), { ok: true });
  assert.equal(f.workspace.agents.has('external-worker'), false);
  assert.equal(f.rpc.calls.filter(call => call.method === 'thread/start').length, 1);
  assert.equal(f.rpc.calls.filter(call => call.method === 'thread/fork').length, 1);
  assert.equal(f.rpc.calls.filter(call => call.method === 'turn/start').length, 1);
  assert.equal(f.workspace.coordinator.paused, true);
});

test('a membership save failure preserves HTTP native success and ID with a visible warning', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  await chmod(f.workspaceFile, 0o644);
  const response = await f.request('/api/agents', { goal: 'Synthetic task', cwd: f.directory }).finished;
  assert.equal(response.statusCode, 201);
  const result = response.json(); assert.equal(result.id, 'created-1');
  assert.match(result.workspaceSaveWarning, /Workspace could not be saved: .*private file/);
  assert.equal(f.workspace.restoration.error, result.workspaceSaveWarning);
  assert.equal(f.workspace.agents.has(result.id), true);
  assert.deepEqual(JSON.parse(await readFile(f.workspaceFile, 'utf8')), record());
  assert.equal(f.rpc.calls.filter(call => call.method === 'thread/start').length, 1);
  assert.equal(f.rpc.calls.filter(call => call.method === 'turn/start').length, 1);
  const calls = f.rpc.calls.length;
  await chmod(f.workspaceFile, 0o600); assert.equal(await f.app.persistence.flush(), null);
  assert.equal(f.rpc.calls.length, calls, 'repairing persistence never repeats native work');
  assert.deepEqual((await f.app.persistence.store.load()).workerIds, [result.id]);
});
