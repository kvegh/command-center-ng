import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/main.mjs';
import { setPassword } from '../server/auth.mjs';
import { Workspace } from '../server/workspace.mjs';

class Response extends EventEmitter {
  headers = {}; chunks = []; writableLength = 0;
  finished = new Promise(resolve => { this.finish = resolve; });
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; for (const [name, value] of Object.entries(headers)) this.setHeader(name, value); }
  write(chunk) { this.chunks.push(String(chunk)); return true; }
  end(chunk) { if (chunk !== undefined) this.write(chunk); this.writableEnded = true; this.finish(this); this.emit('finish'); }
  json() { return JSON.parse(this.chunks.join('')); }
}

test('app initializes and closes local Mistral, with authenticated reconnect isolated from Codex', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-mistral-http-'));
  const calls = [], runtime = new EventEmitter();
  Object.assign(runtime, { records: new Map(), available: true, error: null,
    initialize: async () => calls.push('initialize'),
    refresh: async () => calls.push('refresh'),
    shutdown: async () => calls.push('shutdown') });
  const rpc = new EventEmitter(); rpc.ready = true;
  rpc.connect = async () => calls.push('codex-connect'); rpc.close = () => {};
  rpc.call = async method => assert.fail('Mistral reconnect must not call Codex: ' + method);
  const workspace = new Workspace(rpc, { beads: null, mistral: runtime });
  const agent = { id: 'mistral-session', nativeSessionId: 'session', provider: 'mistral', role: 'worker', name: 'Mistral', cwd: directory,
    canSend: true, thread: { status: { type: 'idle' } }, messages: [], questions: [], tasks: [], workers: [] };
  runtime.records.set(agent.id, agent); workspace.agents.set(agent.id, agent);
  const authFile = join(directory, 'auth.json'), password = randomBytes(24).toString('base64url');
  await setPassword(password, authFile);
  const app = await createApp({ rpc, workspace, authFile, workspaceFile: join(directory, 'workspace.json') });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const request = (path, data, { cookie, origin = 'http://localhost:4242' } = {}) => {
    const incoming = new EventEmitter();
    Object.assign(incoming, { url: path, method: 'POST',
      headers: { host: 'localhost:4242', origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      socket: { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(data)); } });
    const response = new Response(); response.once('finish', () => incoming.emit('close'));
    app.server.emit('request', incoming, response); return response.finished;
  };
  assert.deepEqual(calls, ['initialize']);
  const unauthenticated = await request('/api/connect', {});
  assert.equal(unauthenticated.statusCode, 403); assert.deepEqual(calls, ['initialize']);
  const login = await request('/api/login', { password });
  assert.equal(login.statusCode, 200); const cookie = login.headers['set-cookie'];
  const foreign = await request('/api/connect', {}, { cookie, origin: 'https://unrelated.example' });
  assert.equal(foreign.statusCode, 403); assert.deepEqual(calls, ['initialize']);
  const connected = await request('/api/connect', {}, { cookie });
  assert.equal(connected.statusCode, 200); assert.deepEqual(connected.json(), { connected: true });
  assert.deepEqual(calls, ['initialize', 'codex-connect', 'refresh']);
  await app.close(); assert.deepEqual(calls, ['initialize', 'codex-connect', 'refresh', 'shutdown']);
});
