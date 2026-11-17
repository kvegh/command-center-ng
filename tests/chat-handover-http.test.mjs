import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

// A real authenticated loopback app with isolated provider transports. Only
// generated input delivery is proved; no model produces or reads an artifact.
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-handover-http-'));
  const project = join(directory, 'project'); await mkdir(project);
  const skillPath = join(directory, 'SKILL.md');
  await writeFile(skillPath, '# Synthetic handoff skill\n', { mode: 0o600 });
  const handoverPath = join(directory, 'handoff.md'), handoverText = '# Synthetic handover\nKeep original task states.\n';
  await writeFile(handoverPath, handoverText, { mode: 0o600 });
  const calls = [], queries = [], threads = new Map(); const state = { fail: null };
  const rpc = new EventEmitter(); rpc.ready = true; rpc.close = () => {};
  rpc.call = async (method, params) => {
    calls.push({ method, params });
    if (method === state.fail) throw new Error('Synthetic native receipt unknown.');
    if (method === 'thread/start') {
      const thread = { id: 'received-' + (threads.size + 1), name: 'New chat', cwd: params.cwd, status: { type: 'idle' }, canAcceptDirectInput: true, turns: [] };
      threads.set(thread.id, thread); return { thread };
    }
    if (method === 'thread/name/set') { threads.get(params.threadId).name = params.name; return {}; }
    if (['thread/read', 'thread/resume'].includes(method)) return { thread: threads.get(params.threadId), instructionSources: [] };
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    if (method === 'turn/start') return { turn: { id: 'turn-' + params.threadId } };
    if (method === 'turn/steer') return { turnId: params.expectedTurnId };
    assert.fail('Unexpected native call: ' + method);
  };
  rpc.respond = () => assert.fail('Handover routes must not answer native requests.');
  const sdk = {
    listSessions: async () => [], getSessionInfo: async () => undefined, getSessionMessages: async () => [],
    query(params) { const stream = new Stream(); stream.params = params; queries.push(stream); return stream; }
  };
  const claude = new ClaudeSessions({ loadSdk: async () => sdk, executable: async () => '/synthetic/unused/claude', activeSessions: async () => [] });
  const workspace = new Workspace(rpc, { beads: null, claude, handoverPath: async () => handoverPath, handoverSkill: async () => skillPath });
  workspace.instructionContext = async agent => ({ task: { value: 'ccng-session:' + agent.id } });
  threads.set('source', { id: 'source', cwd: project, name: 'Source project', status: { type: 'idle' }, canAcceptDirectInput: true, turns: [] });
  const source = await workspace.open('source');
  const authFile = join(directory, 'auth.json'), password = randomBytes(24).toString('base64url');
  await setPassword(password, authFile);
  const app = await createApp({ rpc, workspace, authFile, workspaceFile: join(directory, 'workspace.json'), config: { cwd: project } });
  t.after(async () => { try { await app.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  await app.persistence.restore();
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const port = app.server.address().port, origin = `http://127.0.0.1:${port}`;
  const request = (path, data, { cookie, requestOrigin = origin } = {}) => new Promise((resolve, reject) => {
    const client = httpRequest({ hostname: '127.0.0.1', port, path, agent: false, method: data === undefined ? 'GET' : 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; }); response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, json: () => JSON.parse(text) }));
    });
    client.setTimeout(5000, () => client.destroy(new Error('Synthetic handover HTTP request timed out.')));
    client.on('error', reject); client.end(data === undefined ? undefined : JSON.stringify(data));
  });
  const login = await request('/api/login', { password }); assert.equal(login.status, 200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  const authenticated = (path, data, options = {}) => request(path, data, { cookie, ...options });
  return { directory, project, skillPath, handoverPath, handoverText, workspace, source, calls, queries, state, request, authenticated };
}

test('handover source and receiver actions require login and same-origin protection', async t => {
  const f = await fixture(t), before = f.calls.length;
  for (const [path, data] of [['/api/agents/source/handover-create', { provider: 'codex', cwd: f.project }], ['/api/agents/source/handover-import', {}]]) {
    const denied = await f.request(path, data);
    assert.equal(denied.status, 403); assert.equal(denied.json().code, 'authentication_required');
    const foreign = await f.authenticated(path, data, { requestOrigin: 'https://unrelated.example' });
    assert.equal(foreign.status, 403); assert.match(foreign.json().error, /origin/i);
  }
  assert.equal(f.calls.length, before); assert.equal(f.queries.length, 0);
});

test('Create prepares selected waiting receivers; each explicit Import uses that same chat without cloning again', async t => {
  const f = await fixture(t);
  const createdCodex = await f.authenticated('/api/agents/source/handover-create', { provider: 'codex', cwd: f.project });
  assert(createdCodex.status >= 200 && createdCodex.status < 300, JSON.stringify(createdCodex.json()));
  const codex = createdCodex.json(); assert.equal(codex.accepted, true); assert.equal(codex.path, f.handoverPath); assert.notEqual(codex.id, 'source');
  const waitingCodex = f.calls.find(call => call.method === 'turn/start' && call.params.threadId === codex.id);
  assert.match(waitingCodex.params.input[0].text, /wait/i);
  assert.doesNotMatch(waitingCodex.params.input[0].text, /^Read the handover at/m);
  const sourceInput = f.calls.find(call => call.method === 'turn/start' && call.params.threadId === 'source').params.input[0].text;
  assert(sourceInput.includes(JSON.stringify(f.skillPath))); assert(sourceInput.includes(JSON.stringify(f.handoverPath)));
  assert.deepEqual(f.workspace.agent(codex.id).handoverImport, { path: f.handoverPath, sourceId: 'source' });
  const createdClaude = await f.authenticated('/api/agents/source/handover-create', { provider: 'claude', cwd: f.project });
  assert(createdClaude.status >= 200 && createdClaude.status < 300, JSON.stringify(createdClaude.json()));
  const claude = createdClaude.json(); assert.match(claude.id, /^claude-/); assert.equal(f.queries.length, 1);
  const waitingClaude = (await f.queries[0].params.prompt.next()).value;
  assert.match(waitingClaude.message.content, /wait/i); assert.doesNotMatch(waitingClaude.message.content, /^Read the handover at/m);
  assert.equal(f.queries[0].params.options.sessionId, claude.id.slice(7)); assert.equal(f.queries[0].params.options.permissionMode, undefined);
  const request = { id: 'source-still-pending', method: 'item/commandExecution/requestApproval', params: {} };
  f.source.questions.push(request); const sourceBefore = structuredClone(f.source);
  const allocations = f.calls.filter(call => call.method === 'thread/start').length;
  const importedCodex = await f.authenticated(`/api/agents/${codex.id}/handover-import`, {});
  assert.equal(importedCodex.status, 200, JSON.stringify(importedCodex.json()));
  assert.equal(importedCodex.json().accepted, true);
  const codexInput = f.calls.filter(call => ['turn/start', 'turn/steer'].includes(call.method) && call.params.threadId === codex.id).at(-1);
  assert(codexInput.params.input[0].text.includes(JSON.stringify(f.handoverPath)));
  const importedClaude = await f.authenticated(`/api/agents/${claude.id}/handover-import`, {});
  assert.equal(importedClaude.status, 200, JSON.stringify(importedClaude.json()));
  const claudeInput = (await f.queries[0].params.prompt.next()).value;
  assert(claudeInput.message.content.includes(JSON.stringify(f.handoverPath)));
  assert.equal(f.queries.length, 1); assert.equal(f.calls.filter(call => call.method === 'thread/start').length, allocations);
  assert.deepEqual(f.source, sourceBefore); assert.equal(f.source.questions[0], request);
  assert.equal(await readFile(f.handoverPath, 'utf8'), f.handoverText);
  assert.equal(f.workspace.agents.size, 3);
});

test('unassigned imports, invalid creation choices and uncertain receiver allocation keep original work intact', async t => {
  const f = await fixture(t);
  for (const data of [{}, { provider: 'unknown', cwd: f.project }]) {
    const invalid = await f.authenticated('/api/agents/source/handover-create', data); assert.equal(invalid.status, 400);
  }
  const sourceImport = await f.authenticated('/api/agents/source/handover-import', {});
  assert(sourceImport.status >= 400);
  const obsolete = await f.authenticated('/api/handovers/import', { provider: 'codex', cwd: f.project, path: f.handoverPath });
  assert.equal(obsolete.status, 404, 'the old import-creates-another-chat endpoint must be removed');
  assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 0);
  f.state.fail = 'thread/name/set';
  const known = await f.authenticated('/api/agents/source/handover-create', { provider: 'codex', cwd: f.project });
  assert(known.status >= 400); assert.match(known.json().error, /received-2/); assert.match(known.json().error, /open|check both chats/i);
  assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 1);
  f.state.fail = 'thread/start';
  const unknown = await f.authenticated('/api/agents/source/handover-create', { provider: 'codex', cwd: f.project });
  assert(unknown.status >= 400); assert.match(unknown.json().error, /not confirmed.*check existing/i);
  assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 2, 'one attempt per explicit Create, no automatic retry');
  assert.equal(f.workspace.agent('source'), f.source); assert.equal(f.workspace.creating, 0);
  assert.equal(f.calls.some(call => /archive|delete|interrupt/.test(call.method)), false);
});

