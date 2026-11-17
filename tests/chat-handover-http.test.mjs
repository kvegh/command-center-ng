import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/main.mjs';
import { setPassword } from '../server/auth.mjs';
import { Workspace } from '../server/workspace.mjs';
import { ClaudeSessions } from '../server/claude.mjs';

class Stream {
  waiting = null;
  next() { return new Promise(resolve => { this.waiting = resolve; }); }
  close() { this.waiting?.({ done: true }); }
  [Symbol.asyncIterator]() { return this; }
}

// Actual HTTP/authentication/persistence and file metadata; native providers are
// isolated transports. These tests never ask a real model to write or import.
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-auto-handover-http-'));
  const skillPath = join(directory, 'SKILL.md');
  await writeFile(skillPath, '# Synthetic handoff skill\n', { mode: 0o600 });
  const handoverPath = join(directory, 'handoff.md'), handoverText = '# Synthetic handover\nPreserve original work.\n';
  const calls = [], queries = [], threads = new Map(), state = { fail: null, catalog: [] };
  let allocation = 0, turn = 0;
  const rpc = new EventEmitter(); rpc.ready = true; rpc.close = () => {};
  rpc.call = async (method, params) => {
    calls.push({ method, params });
    if (method === state.fail) throw new Error('Synthetic native receipt unknown.');
    if (method === 'thread/start') {
      const thread = { id: 'receiver-' + ++allocation, cwd: params.cwd, name: 'New chat', status: { type: 'idle' }, canAcceptDirectInput: true, turns: [] };
      threads.set(thread.id, thread); return { thread };
    }
    if (method === 'thread/name/set') { threads.get(params.threadId).name = params.name; return {}; }
    if (['thread/read', 'thread/resume'].includes(method)) return { thread: threads.get(params.threadId), instructionSources: [] };
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    if (method === 'turn/start') return { turn: { id: 'turn-' + ++turn } };
    if (method === 'turn/steer') return { turnId: params.expectedTurnId };
    assert.fail('Unexpected native call: ' + method);
  };
  rpc.respond = () => assert.fail('Handover routes must not answer native requests.');
  const sdk = {
    listSessions: async () => [], getSessionInfo: async () => undefined, getSessionMessages: async () => [],
    query(params) { const stream = new Stream(); stream.params = params; queries.push(stream); return stream; }
  };
  const claude = new ClaudeSessions({ loadSdk: async () => sdk, executable: async () => '/synthetic/unused/claude', activeSessions: async () => [] });
  const workspace = new Workspace(rpc, { beads: null, claude, handoverTimeout: 2000, handoverPath: async () => handoverPath, handoverSkill: async () => skillPath });
  workspace.instructionContext = async agent => ({ task: { value: 'ccng-session:' + agent.id } });
  workspace.list = async (_cursor, provider) => ({ agents: state.catalog.filter(chat => chat.provider === provider), nextCursor: null });
  threads.set('source', { id: 'source', cwd: directory, name: 'Source project', status: { type: 'idle' }, canAcceptDirectInput: true, turns: [] });
  const source = await workspace.open('source');
  const waitFor = predicate => new Promise((resolve, reject) => {
    const check = () => { if (predicate()) { clearTimeout(timer); workspace.off('change', check); resolve(); } };
    const timer = setTimeout(() => { workspace.off('change', check); reject(new Error('Synthetic handover progress did not arrive.')); }, 3000);
    workspace.on('change', check); check();
  });
  const authFile = join(directory, 'auth.json'), password = randomBytes(24).toString('base64url');
  await setPassword(password, authFile);
  const workspaceFile = join(directory, 'workspace.json');
  const app = await createApp({ rpc, workspace, authFile, workspaceFile, config: { cwd: directory } });
  t.after(async () => {
    rpc.ready = false; workspace.changed(); await workspace.handoverJobs.get('source')?.promise;
    try { await app.close(); } finally { await rm(directory, { recursive: true, force: true }); }
  });
  await app.persistence.restore();
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const port = app.server.address().port, origin = `http://127.0.0.1:${port}`;
  const request = (path, data, { cookie, requestOrigin = origin } = {}) => new Promise((resolve, reject) => {
    const client = httpRequest({ hostname: '127.0.0.1', port, path, agent: false, method: data === undefined ? 'GET' : 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; }); response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, json: () => JSON.parse(text) }));
    });
    client.setTimeout(5000, () => client.destroy(new Error('Synthetic HTTP request timed out.')));
    client.on('error', reject); client.end(data === undefined ? undefined : JSON.stringify(data));
  });
  const login = await request('/api/login', { password }); assert.equal(login.status, 200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  const authenticated = (path, data, options = {}) => request(path, data, { cookie, ...options });
  const finish = async ({ contents = handoverText } = {}) => {
    await waitFor(() => !!source.turnId || source.handoverCreation?.state === 'failed');
    if (contents !== null) await writeFile(handoverPath, contents, { mode: 0o600 });
    const turnId = source.turnId;
    source.finishedTurn = { id: turnId, status: 'completed' }; source.lastCompletedTurnId = turnId;
    source.turnId = null; source.thread.status = { type: 'idle' }; workspace.changed();
    await waitFor(() => ['started', 'failed'].includes(source.handoverCreation?.state));
    await workspace.handoverJobs.get('source')?.promise; await app.persistence.flush();
    return source.handoverCreation;
  };
  return { directory, skillPath, handoverPath, handoverText, workspaceFile, workspace, source, calls, queries, state, threads, request, authenticated, finish };
}

test('handover creation requires login and same-origin protection; manual import routes are removed', async t => {
  const f = await fixture(t), path = '/api/agents/source/handover-create', before = f.calls.length;
  const denied = await f.request(path, {}); assert.equal(denied.status, 403); assert.equal(denied.json().code, 'authentication_required');
  const foreign = await f.authenticated(path, {}, { requestOrigin: 'https://unrelated.example' });
  assert.equal(foreign.status, 403); assert.match(foreign.json().error, /origin/i);
  for (const old of ['/api/agents/source/handover-import', '/api/handovers/import']) assert.equal((await f.authenticated(old, {})).status, 404);
  assert.equal(f.calls.length, before); assert.equal(f.queries.length, 0);
});

test('HTTP Create returns accepted progress before preparation and automatically imports only the completed file', async t => {
  for (const provider of ['codex', 'claude']) {
    const f = await fixture(t);
    const response = await f.authenticated('/api/agents/source/handover-create', { provider, cwd: f.directory });
    assert.equal(response.status, 202, JSON.stringify(response.json()));
    assert.deepEqual(response.json(), { accepted: true, state: 'preparing', path: f.handoverPath });
    assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 0); assert.equal(f.queries.length, 0);
    const prepared = await f.finish(); assert.equal(prepared.state, 'started');
    const receiver = f.workspace.agent(prepared.id);
    const firstInput = provider === 'claude'
      ? (await f.queries[0].params.prompt.next()).value.message.content
      : f.calls.find(call => call.method === 'turn/start' && call.params.threadId === receiver.id).params.input[0].text;
    assert.equal(firstInput.split('\n')[0], 'Source project v2'); assert.match(firstInput, /^Read the handover at/m);
    assert(firstInput.includes(JSON.stringify(f.handoverPath))); assert.doesNotMatch(firstInput, /press.*Import|acknowledge that you are waiting/i);
    assert.equal(await readFile(f.handoverPath, 'utf8'), f.handoverText);
    const snapshot = await f.authenticated('/api/state'); assert.equal(snapshot.status, 200);
    assert.equal(snapshot.json().agents.find(agent => agent.id === 'source').handoverCreation.state, 'started');
    const saved = JSON.parse(await readFile(f.workspaceFile, 'utf8'));
    assert.deepEqual(saved.workerHandoverImports[receiver.id], { path: f.handoverPath, sourceId: 'source' });
    assert.equal(f.calls.some(call => /archive|delete|interrupt/.test(call.method)), false);
  }
});

test('HTTP collision offers an existing chat and requires an explicit next-version choice before source work', async t => {
  const f = await fixture(t), existing = { id: 'closed-v2', name: 'Source project v2', provider: 'codex', cwd: f.directory };
  f.state.catalog.push(existing);
  f.threads.set(existing.id, { ...existing, status: { type: 'idle' }, canAcceptDirectInput: true, turns: [] });
  const conflict = await f.authenticated('/api/agents/source/handover-create', {});
  assert.equal(conflict.status, 409); assert.equal(conflict.json().code, 'handover_name_conflict');
  assert.deepEqual(conflict.json().handoverConflict, { existing: [{ id: existing.id, name: existing.name, provider: existing.provider }], nextName: 'Source project v3' });
  assert.equal(f.calls.some(call => ['turn/start', 'thread/start'].includes(call.method)), false);
  const opened = await f.authenticated('/api/agents/closed-v2/open', {}); assert.equal(opened.status, 200);
  assert.equal(f.workspace.agent(existing.id).name, existing.name);
  assert.equal(f.calls.some(call => ['turn/start', 'thread/start'].includes(call.method)), false, 'opening an existing version must not prepare/import/create');
  const confirmed = await f.authenticated('/api/agents/source/handover-create', { confirmedName: 'Source project v3' });
  assert.equal(confirmed.status, 202); assert.equal((await f.finish()).name, 'Source project v3');
});

test('HTTP progress fails visibly when a completed source claims a file that is missing', async t => {
  const f = await fixture(t);
  assert.equal((await f.authenticated('/api/agents/source/handover-create', {})).status, 202);
  f.source.messages.push({ id: 'saved-claim', type: 'assistant', text: 'Saved the handover.' });
  const progress = await f.finish({ contents: null }); assert.equal(progress.state, 'failed');
  const snapshot = await f.authenticated('/api/state');
  const visible = snapshot.json().agents.find(agent => agent.id === 'source').handoverCreation;
  assert.equal(visible.state, 'failed'); assert.match(visible.error, /file|source|handover/i);
  assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 0); assert.equal(f.workspace.agents.size, 1);
});

test('HTTP accepted operations preserve known and uncertain allocation errors without automatically creating twice', async t => {
  for (const fail of ['thread/start', 'thread/name/set']) {
    const f = await fixture(t);
    const accepted = await f.authenticated('/api/agents/source/handover-create', {}); assert.equal(accepted.status, 202);
    f.state.fail = fail;
    const progress = await f.finish(); assert.equal(progress.state, 'failed'); assert.match(progress.error, /confirm|check|receiv/i);
    assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 1);
    if (fail === 'thread/name/set') assert(progress.id, 'the actual allocated identity must remain visible');
    assert.equal(f.workspace.agent('source'), f.source); assert.equal(f.workspace.creating, 0);
    assert.equal(f.calls.some(call => /archive|delete|interrupt/.test(call.method)), false);
  }
});
