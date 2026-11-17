import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/main.mjs';
import { setPassword } from '../server/auth.mjs';
import { ClaudeSessions } from '../server/claude.mjs';
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

class Events {
  values = []; waiting = null; ended = false;
  push(value) { if (this.waiting) { this.waiting({ value, done: false }); this.waiting = null; } else this.values.push(value); }
  next() { if (this.values.length) return Promise.resolve({ value: this.values.shift(), done: false }); if (this.ended) return Promise.resolve({ done: true }); return new Promise(resolve => { this.waiting = resolve; }); }
  close() { this.ended = true; this.waiting?.({ done: true }); this.waiting = null; }
  [Symbol.asyncIterator]() { return this; }
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-claude-permission-http-'));
  const nativeIds = ['11111111-2222-4333-8444-555555555555', '66666666-7777-4888-8999-aaaaaaaaaaaa'];
  const infos = new Map(nativeIds.map((sessionId, index) => [sessionId, { sessionId, cwd: directory, summary: 'Synthetic Claude ' + index }]));
  const queries = new Map(), controls = [], failure = { error: null };
  const sdk = {
    listSessions: async () => [...infos.values()],
    getSessionInfo: async id => infos.get(id),
    getSessionMessages: async () => [],
    query(params) {
      const id = params.options.resume, query = new Events();
      query.setPermissionMode = async mode => { controls.push({ id, mode }); if (failure.error) throw failure.error; };
      queries.set(id, query); return query;
    }
  };
  const runtime = new ClaudeSessions({ loadSdk: async () => sdk, executable: async () => '/example/bin/claude', activeSessions: async () => [] });
  await runtime.initialize();
  const rpc = new EventEmitter(); rpc.ready = true; rpc.close = () => {};
  rpc.call = async () => assert.fail('Permission settings must not invoke Codex.');
  rpc.respond = () => assert.fail('Permission settings must not answer a native request.');
  const workspace = new Workspace(rpc, { beads: null, claude: runtime });
  const agents = [];
  for (const id of nativeIds) {
    const agent = await runtime.open('claude-' + id); workspace.agents.set(agent.id, agent);
    await runtime.send(agent, 'Synthetic setup input.');
    queries.get(id).push({ type: 'system', subtype: 'init', session_id: id, permissionMode: 'default', model: 'synthetic-model' });
    agents.push(agent);
  }
  await new Promise(resolve => setImmediate(resolve));
  for (const [id, role] of [['codex-worker', 'worker'], ['coordinator', 'coordinator']]) {
    workspace.agents.set(id, { ...runtime.make({ sessionId: nativeIds[0], cwd: directory, summary: id }), id, provider: 'codex', role });
  }
  const authFile = join(directory, 'auth.json'), password = randomBytes(24).toString('base64url');
  await setPassword(password, authFile);
  const app = await createApp({ rpc, workspace, authFile, workspaceFile: join(directory, 'workspace.json') });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const request = (path, data, { cookie, origin = 'http://localhost:4242' } = {}) => {
    const incoming = new EventEmitter();
    Object.assign(incoming, {
      url: path, method: data === undefined ? 'GET' : 'POST',
      headers: { host: 'localhost:4242', origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      socket: { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() { if (data !== undefined) yield Buffer.from(JSON.stringify(data)); }
    });
    const response = new Response(); response.once('finish', () => incoming.emit('close'));
    app.server.emit('request', incoming, response); return response.finished;
  };
  const login = await request('/api/login', { password });
  assert.equal(login.statusCode, 200); const cookie = login.headers['set-cookie'];
  return { runtime, workspace, app, directory, agents, queries, controls, failure, request,
    authenticated: (path, data, options = {}) => request(path, data, { cookie, ...options }),
    route: id => '/api/agents/' + encodeURIComponent(id) + '/permission-settings' };
}

test('Claude permission routes require the existing login and same-origin checks before any native control', async t => {
  const f = await fixture(t), path = f.route(f.agents[0].id);
  for (const body of [undefined, { mode: 'auto' }]) {
    const denied = await f.request(path, body);
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.json().code, 'authentication_required');
  }
  const foreign = await f.authenticated(path, { mode: 'auto' }, { origin: 'https://unrelated.example' });
  assert.equal(foreign.statusCode, 403); assert.match(foreign.json().error, /origin/i);
  assert.deepEqual(f.controls, []); assert.equal(f.queries.size, 2);
  assert.equal(f.agents[0].permissionMode, 'default');
});

test('authenticated Claude message responses retain the exact queued receipt until its native echo arrives', async t => {
  const f = await fixture(t), selected = f.agents[0];
  const path = '/api/agents/' + encodeURIComponent(selected.id) + '/message';
  const body = { text: 'Continue the existing package inspection.' };
  const job = f.runtime.runs.get(selected.id), before = selected.messages.length, queuedBefore = job.inputs.values.length;
  const unauthenticated = await f.request(path, body);
  assert.equal(unauthenticated.statusCode, 403); assert.equal(unauthenticated.json().code, 'authentication_required');
  const foreign = await f.authenticated(path, body, { origin: 'https://unrelated.example' });
  assert.equal(foreign.statusCode, 403); assert.match(foreign.json().error, /origin/i);
  assert.equal(selected.messages.length, before); assert.equal(job.inputs.values.length, queuedBefore, 'authentication and origin checks happen before queuing input');

  const response = await f.authenticated(path, body);
  assert.equal(response.statusCode, 200);
  const receipt = response.json();
  assert.equal(receipt.ok, true); assert.equal(receipt.turnId, selected.turnId);
  assert.equal(typeof receipt.messageId, 'string'); assert.ok(receipt.messageId);
  const record = () => f.workspace.snapshot().agents.find(agent => agent.id === selected.id).messages.find(message => message.nativeMessageId === receipt.messageId);
  const native = job.inputs.values.find(input => input.uuid === receipt.messageId);
  assert.ok(native, 'HTTP returns the UUID actually handed to this native input stream');
  assert.equal(native.message.content, body.text); assert.equal(native.session_id, selected.nativeSessionId); assert.equal(native.isSynthetic, undefined);
  assert.equal(record().id, receipt.messageId + ':0'); assert.equal(record().inputState, 'queued');
  assert.equal(job.inputs.values.length, queuedBefore + 1);
  const query = f.queries.get(selected.nativeSessionId);
  query.push({ ...native, uuid: 'unrelated-native-echo' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(record().inputState, 'queued', 'an unrelated native message cannot confirm this receipt');
  query.push(native);
  for (let n = 0; n < 30 && record().inputState !== 'received'; n++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(record().inputState, 'received');
  assert.equal(selected.messages.filter(message => message.nativeMessageId === receipt.messageId).length, 1, 'matching echoes reconcile the same optimistic row');
  assert.deepEqual(f.controls, []); assert.equal(f.queries.size, 2, 'ordinary message delivery changes no permissions and starts no extra process');
});

test('authenticated permission changes reach only the selected live Claude process and preserve pending approvals', async t => {
  const f = await fixture(t), [selected, other] = f.agents;
  const selectedAnswer = f.runtime.permission(selected, 'Bash', { command: 'synthetic-selected' }, { toolUseID: 'selected-tool' });
  const otherAnswer = f.runtime.permission(other, 'Bash', { command: 'synthetic-other' }, { toolUseID: 'other-tool' });
  let answers = 0; selectedAnswer.then(() => answers++); otherAnswer.then(() => answers++);
  const pending = [...f.runtime.requests.values()], questions = f.agents.map(agent => [...agent.questions]);
  const turns = f.agents.map(agent => agent.turnId), messages = f.agents.map(agent => structuredClone(agent.messages));
  const read = await f.authenticated(f.route(selected.id));
  assert.equal(read.statusCode, 200); assert.equal(read.json().available, true); assert.equal(read.json().mode, 'default');
  assert.deepEqual(f.controls, [], 'GET must not change native permissions');
  const changed = await f.authenticated(f.route(selected.id), { mode: 'auto' });
  assert.equal(changed.statusCode, 200);
  assert.deepEqual(changed.json(), { available: true, configuredAuto: false, mode: 'default', change: { mode: 'auto', status: 'acknowledged' } });
  assert.deepEqual(f.controls, [{ id: selected.nativeSessionId, mode: 'auto' }]);
  assert.equal(other.permissionMode, 'default'); assert.equal(other.permissionChange, null);
  assert.deepEqual([...f.runtime.requests.values()], pending);
  assert.deepEqual(f.agents.map(agent => agent.questions), questions); assert.equal(answers, 0);
  assert.deepEqual(f.agents.map(agent => agent.turnId), turns); assert.deepEqual(f.agents.map(agent => agent.messages), messages);
  assert.equal(f.queries.size, 2, 'mode controls must not start a new model query');
  f.queries.get(selected.nativeSessionId).push({ type: 'system', subtype: 'status', session_id: selected.nativeSessionId, permissionMode: 'auto' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.authenticated(f.route(selected.id))).json().mode, 'auto');
  assert.equal((await f.authenticated(f.route(other.id))).json().mode, 'default');
  const manual = await f.authenticated(f.route(selected.id), { mode: 'default' });
  assert.equal(manual.statusCode, 200);
  assert.deepEqual(manual.json(), { available: true, configuredAuto: false, mode: 'auto', change: { mode: 'default', status: 'acknowledged' } });
  assert.deepEqual(f.controls, [{ id: selected.nativeSessionId, mode: 'auto' }, { id: selected.nativeSessionId, mode: 'default' }]);
  assert.deepEqual([...f.runtime.requests.values()], pending); assert.equal(answers, 0);
});

test('acknowledged mode changes await workspace persistence and distinguish a save warning from native failure', async t => {
  const f = await fixture(t), selected = f.agents[0];
  const changed = await f.authenticated(f.route(selected.id), { mode: 'auto' });
  assert.equal(changed.statusCode, 200); assert.equal(changed.json().change.status, 'acknowledged');
  const saved = JSON.parse(await readFile(join(f.directory, 'workspace.json'), 'utf8'));
  assert.equal(saved.claudePermissionModes[selected.id], 'auto', 'the response follows the durable metadata write');
  f.app.persistence.store.save = async () => { throw new Error('Synthetic metadata storage failure.'); };
  const manual = await f.authenticated(f.route(selected.id), { mode: 'default' });
  assert.equal(manual.statusCode, 200); assert.equal(manual.json().change.status, 'acknowledged');
  assert.match(manual.json().workspaceSaveWarning, /Synthetic metadata storage failure/);
  assert.equal(f.workspace.restoration.error, manual.json().workspaceSaveWarning);
  assert.deepEqual(f.controls, [{ id: selected.nativeSessionId, mode: 'auto' }, { id: selected.nativeSessionId, mode: 'default' }], 'metadata failure never retries an acknowledged native action');
  assert.equal(JSON.parse(await readFile(join(f.directory, 'workspace.json'), 'utf8')).claudePermissionModes[selected.id], 'auto', 'failed metadata is not reported as saved');
});

test('permission routes reject non-Claude targets, unknown workers and injected modes before native control', async t => {
  const f = await fixture(t), selected = f.agents[0];
  for (const id of ['codex-worker', 'coordinator', 'unknown-worker']) for (const body of [undefined, { mode: 'auto' }]) {
    const response = await f.authenticated(f.route(id), body);
    assert.equal(response.statusCode, id === 'unknown-worker' ? 404 : 400);
  }
  for (const body of [null, [], {}, { mode: 'bypassPermissions' }, { mode: 'acceptEdits' }, { mode: 'auto', allowedTools: ['Bash'] }, { mode: 'auto', requestId: 'existing-approval' }]) {
    const rejected = await f.authenticated(f.route(selected.id), body);
    assert.equal(rejected.statusCode, 400); assert.match(rejected.json().error, /only.*permission mode/i);
  }
  const job = f.runtime.runs.get(selected.id); f.runtime.runs.delete(selected.id);
  try {
    const unavailable = await f.authenticated(f.route(selected.id), { mode: 'auto' });
    assert.equal(unavailable.statusCode, 409); assert.match(unavailable.json().error, /No session was started or resumed/);
  } finally { f.runtime.runs.set(selected.id, job); }
  assert.deepEqual(f.controls, []); assert.equal(f.queries.size, 2);
});

test('native permission refusal stays visible through HTTP without retrying or claiming Auto mode', async t => {
  const f = await fixture(t), selected = f.agents[0];
  f.failure.error = new Error('Auto mode is unavailable for this synthetic model.');
  const response = await f.authenticated(f.route(selected.id), { mode: 'auto' });
  assert.equal(response.statusCode, 500); assert.match(response.json().error, /unavailable.*synthetic model/);
  const read = (await f.authenticated(f.route(selected.id))).json();
  assert.equal(read.mode, 'default'); assert.equal(read.change.status, 'unconfirmed');
  assert.match(read.change.error, /unavailable/);
  assert.deepEqual(f.controls, [{ id: selected.nativeSessionId, mode: 'auto' }]);
  assert.equal(f.queries.size, 2);
});
