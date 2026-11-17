import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/main.mjs';
import { setPassword } from '../server/auth.mjs';
import { ClaudeSessions } from '../server/claude.mjs';
import { Workspace } from '../server/workspace.mjs';

// Exercise a real loopback HTTP instance and the installed SDK using only
// disposable native transcripts. No provider call or real session is used.

async function fixture(t, { restoreLegacySource = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-claude-branch-http-'));
  const cwd = join(directory, 'project'), config = join(directory, 'native-config');
  const previousConfig = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = config;
  let app, runtime, workspace, port, localOrigin, providerCalls = 0;
  t.after(async () => {
    try {
      for (const agent of runtime?.records.values() || []) for (const question of [...agent.questions]) runtime.cancel(agent, question.id, 'Synthetic test cleanup.');
      await app?.close();
    } finally {
      if (previousConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = previousConfig;
      await rm(directory, { recursive: true, force: true });
    }
  });
  await mkdir(cwd);
  const nativeDirectory = join(config, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  await mkdir(nativeDirectory, { recursive: true });
  const nativeId = randomUUID(), sourceId = 'claude-' + nativeId;
  const sourceRows = [
    { type: 'user', message: { role: 'user', content: 'Review this synthetic project.' } },
    { type: 'assistant', message: { role: 'assistant', model: 'synthetic-model', stop_reason: 'end_turn', content: [{ type: 'text', text: 'The first synthetic review is complete.' }] } },
    { type: 'user', message: { role: 'user', content: 'Inspect another synthetic detail.' } },
    { type: 'assistant', message: { role: 'assistant', model: 'synthetic-model', stop_reason: 'tool_use', content: [{ type: 'text', text: 'Inspecting the synthetic detail.' }, { type: 'tool_use', id: 'synthetic-pending-tool', name: 'Read', input: { file_path: 'README.md' } }] } }
  ].map((row, index, all) => {
    all[index].uuid = randomUUID();
    return { ...row, uuid: all[index].uuid, parentUuid: index ? all[index - 1].uuid : null, sessionId: nativeId, cwd, isSidechain: false, timestamp: '2026-11-01T12:00:00.000Z' };
  });
  const sourceFile = join(nativeDirectory, nativeId + '.jsonl');
  const sourceText = sourceRows.map(row => JSON.stringify(row)).join('\n') + '\n';
  await writeFile(sourceFile, sourceText, { mode: 0o600 });
  const authFile = join(directory, 'auth.json'), password = randomBytes(24).toString('base64url');
  const workspaceFile = join(directory, 'workspace.json');
  await setPassword(password, authFile);
  if (restoreLegacySource) await writeFile(workspaceFile, JSON.stringify({ version: 1, workerIds: [sourceId], coordinatorId: null, coordinatorPaused: false }) + '\n', { mode: 0o600 });
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  const start = async () => {
    runtime = new ClaudeSessions({
      loadSdk: async () => ({ ...sdk, query: () => { providerCalls++; assert.fail('Branching and restoration must not start a provider query.'); } }),
      executable: async () => '/synthetic/unused/claude', activeSessions: async () => []
    });
    const rpc = new EventEmitter(); rpc.ready = false; rpc.close = () => {};
    rpc.call = async () => assert.fail('Claude branching must not call Codex.');
    rpc.respond = () => assert.fail('Claude branching must not answer a native request.');
    workspace = new Workspace(rpc, { beads: null, claude: runtime });
    app = await createApp({ rpc, workspace, authFile, workspaceFile, config: { cwd } });
    await app.persistence.restore();
    await new Promise((resolve, reject) => {
      const failed = error => { app.server.off('error', failed); reject(error); };
      app.server.once('error', failed);
      app.server.listen(0, '127.0.0.1', () => { app.server.off('error', failed); resolve(); });
    });
    port = app.server.address().port; localOrigin = `http://127.0.0.1:${port}`;
  };
  await start();
  const request = (path, data, { cookie, origin = localOrigin } = {}) => new Promise((resolve, reject) => {
    const client = httpRequest({
      hostname: '127.0.0.1', port, path, agent: false, method: data === undefined ? 'GET' : 'POST',
      headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }
    }, response => {
      let text = ''; response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('error', reject);
      response.on('end', () => resolve({ statusCode: response.statusCode, headers: response.headers, json: () => JSON.parse(text) }));
    });
    client.setTimeout(5000, () => client.destroy(new Error('Synthetic Claude branch HTTP request timed out.')));
    client.on('error', reject); client.end(data === undefined ? undefined : JSON.stringify(data));
  });
  const login = await request('/api/login', { password });
  assert.equal(login.statusCode, 200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  const authenticated = (path, data, options = {}) => request(path, data, { cookie, ...options });
  const route = (id, action) => '/api/agents/' + encodeURIComponent(id) + '/' + action;
  const state = async () => {
    const response = await authenticated('/api/state'); assert.equal(response.statusCode, 200); return response.json();
  };
  const nativeRows = async id => (await readFile(join(nativeDirectory, id.slice(7) + '.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  const restart = async () => { await app.close(); app = null; await start(); };
  return {
    get runtime() { return runtime; }, get workspace() { return workspace; }, get providerCalls() { return providerCalls; },
    sourceId, sourceRows, sourceFile, sourceText, workspaceFile, nativeDirectory, nativeRows, request, authenticated, route, state, restart
  };
}

test('Claude branch HTTP actions require login and same origin before creating native history', async t => {
  const f = await fixture(t);
  const before = await readdir(f.nativeDirectory);
  for (const action of ['open', 'fork']) {
    const denied = await f.request(f.route(f.sourceId, action), {});
    assert.equal(denied.statusCode, 403); assert.equal(denied.json().code, 'authentication_required');
    const foreign = await f.authenticated(f.route(f.sourceId, action), {}, { origin: 'https://unrelated.example' });
    assert.equal(foreign.statusCode, 403); assert.match(foreign.json().error, /origin/i);
  }
  assert.deepEqual(await readdir(f.nativeDirectory), before);
  assert.equal(f.workspace.agents.size, 0); assert.equal(f.runtime.runs.size, 0); assert.equal(f.runtime.requests.size, 0);
  assert.equal(await readFile(f.sourceFile, 'utf8'), f.sourceText);
});

test('real SDK full-history and completed-reply forks work through authenticated Claude HTTP routes', async t => {
  const f = await fixture(t);
  const opened = await f.authenticated(f.route(f.sourceId, 'open'), {});
  assert.equal(opened.statusCode, 200);
  const sourceView = (await f.state()).agents.find(agent => agent.id === f.sourceId);
  assert.equal(sourceView.provider, 'claude'); assert.equal(sourceView.canBranch, true);
  const completedReply = sourceView.messages.find(message => message.nativeMessageId === f.sourceRows[1].uuid);
  const toolReply = sourceView.messages.find(message => message.nativeMessageId === f.sourceRows[3].uuid && message.type === 'assistant');
  assert.equal(completedReply.branchable, true);
  assert.notEqual(toolReply.branchable, true, 'tool-use text is not a completed reply');
  const source = f.workspace.agent(f.sourceId);
  let sourceAnswered = false;
  const answer = f.runtime.permission(source, 'Read', { file_path: 'README.md' }, { requestId: 'synthetic-source-request', toolUseID: 'synthetic-pending-tool' });
  void answer.then(() => { sourceAnswered = true; });
  const pending = [...f.runtime.requests.values()], questions = [...source.questions];
  const full = await f.authenticated(f.route(f.sourceId, 'fork'), {});
  assert.equal(full.statusCode, 201, JSON.stringify(full.json()));
  const fullId = full.json().id;
  assert.match(fullId, /^claude-[a-f0-9-]{36}$/); assert.notEqual(fullId, f.sourceId);
  const copied = (await f.nativeRows(fullId)).filter(row => row.forkedFrom);
  assert.deepEqual(copied.map(row => row.forkedFrom.messageUuid), f.sourceRows.map(row => row.uuid));
  assert(copied.every(row => row.forkedFrom.sessionId === source.nativeSessionId && row.sessionId === fullId.slice(7)));
  assert(copied.every(row => !f.sourceRows.some(original => original.uuid === row.uuid)));
  assert.equal(copied[0].parentUuid, null);
  for (let index = 1; index < copied.length; index++) assert.equal(copied[index].parentUuid, copied[index - 1].uuid);
  const branch = (await f.state()).agents.find(agent => agent.id === fullId);
  assert.equal(branch.parentId, f.sourceId); assert.equal(branch.provider, 'claude'); assert.deepEqual(branch.questions, []);
  const parent = await f.authenticated(f.route(fullId, 'parent'), {});
  assert.equal(parent.statusCode, 200); assert.equal(parent.json().id, f.sourceId);
  const cutoff = await f.authenticated(f.route(f.sourceId, 'fork'), { lastTurnId: completedReply.turnId });
  assert.equal(cutoff.statusCode, 201, JSON.stringify(cutoff.json()));
  const cutoffRows = (await f.nativeRows(cutoff.json().id)).filter(row => row.forkedFrom);
  assert.deepEqual(cutoffRows.map(row => row.forkedFrom.messageUuid), f.sourceRows.slice(0, 2).map(row => row.uuid));
  assert.equal(cutoffRows.at(-1).message.content[0].text, 'The first synthetic review is complete.');
  const beforeInvalid = (await readdir(f.nativeDirectory)).sort();
  for (const lastTurnId of [toolReply.turnId, randomUUID(), 1]) {
    const invalid = await f.authenticated(f.route(f.sourceId, 'fork'), { lastTurnId });
    assert.equal(invalid.statusCode, 400); assert.match(invalid.json().error, /completed reply/i);
  }
  assert.deepEqual((await readdir(f.nativeDirectory)).sort(), beforeInvalid);
  assert.equal(await readFile(f.sourceFile, 'utf8'), f.sourceText);
  assert.deepEqual([...f.runtime.requests.values()], pending); assert.deepEqual(source.questions, questions);
  assert.equal(sourceAnswered, false, 'forking and navigation must not answer the parent callback');
  assert.equal(f.runtime.runs.size, 0); assert.equal(f.runtime.starts.size, 0);
});

test('Claude branch parent links survive close, reopen and a cold HTTP backend restart', async t => {
  const f = await fixture(t, { restoreLegacySource: true });
  assert.deepEqual((await f.state()).agents.map(agent => agent.id), [f.sourceId], 'legacy workspace metadata needs no branch mapping or migration');
  assert.equal((await f.authenticated(f.route(f.sourceId, 'open'), {})).statusCode, 200);
  const source = (await f.state()).agents.find(agent => agent.id === f.sourceId);
  const reply = source.messages.find(message => message.nativeMessageId === f.sourceRows[1].uuid);
  const forked = await f.authenticated(f.route(f.sourceId, 'fork'), { lastTurnId: reply.turnId });
  assert.equal(forked.statusCode, 201, JSON.stringify(forked.json()));
  const childId = forked.json().id;
  const childNativeText = await readFile(join(f.nativeDirectory, childId.slice(7) + '.jsonl'), 'utf8');

  assert.equal((await f.authenticated(f.route(childId, 'close'), {})).statusCode, 200);
  assert.ok(!(await f.state()).agents.some(agent => agent.id === childId));
  const afterClose = JSON.parse(await readFile(f.workspaceFile, 'utf8'));
  assert.deepEqual(afterClose.claudeBranchParents, { [childId]: f.sourceId }, 'closing a tab must retain its branch relationship');
  assert.equal((await f.authenticated(f.route(childId, 'open'), {})).statusCode, 200);
  assert.equal((await f.state()).agents.find(agent => agent.id === childId).parentId, f.sourceId);
  assert.equal((await f.authenticated(f.route(f.sourceId, 'close'), {})).statusCode, 200);
  const saved = JSON.parse(await readFile(f.workspaceFile, 'utf8'));
  assert.deepEqual(saved.workerIds, [childId]);
  assert.deepEqual(saved.claudeBranchParents, { [childId]: f.sourceId });
  assert.deepEqual(Object.keys(saved).sort(), ['claudeBranchParents', 'coordinatorId', 'coordinatorPaused', 'version', 'workerIds']);
  assert.deepEqual(Object.keys(saved.claudeBranchParents), [childId]);
  assert.equal(typeof saved.claudeBranchParents[childId], 'string');
  assert.ok(!JSON.stringify(saved).includes('synthetic'), 'workspace metadata contains no transcript text, request or provider settings');

  const oldRuntime = f.runtime, oldWorkspace = f.workspace;
  await f.restart();
  assert.notEqual(f.runtime, oldRuntime); assert.notEqual(f.workspace, oldWorkspace);
  const restored = await f.state();
  assert.equal(restored.restoration.status, 'ready');
  assert.deepEqual(restored.agents.map(agent => agent.id), [childId]);
  const child = restored.agents[0];
  assert.equal(child.provider, 'claude'); assert.equal(child.parentId, f.sourceId);
  assert.deepEqual(child.messages.map(message => message.text), ['Review this synthetic project.', 'The first synthetic review is complete.']);
  assert.deepEqual(child.questions, []); assert.equal(child.status, 'idle');
  assert.equal(f.providerCalls, 0); assert.equal(f.runtime.runs.size, 0); assert.equal(f.runtime.starts.size, 0);

  for (const action of ['summary', 'return', 'handoff']) {
    const rejected = await f.authenticated(f.route(childId, action), action === 'return' ? { text: 'Synthetic summary.' } : {});
    assert.equal(rejected.statusCode, 409, JSON.stringify(rejected.json()));
    assert.match(rejected.json().error, /Claude|Codex|not supported|not available/i);
  }
  assert.equal(f.providerCalls, 0); assert.equal(f.runtime.runs.size, 0); assert.equal(f.runtime.starts.size, 0);
  const parent = await f.authenticated(f.route(childId, 'parent'), {});
  assert.equal(parent.statusCode, 200); assert.equal(parent.json().id, f.sourceId);
  assert.ok((await f.state()).agents.some(agent => agent.id === f.sourceId));
  assert.equal(await readFile(f.sourceFile, 'utf8'), f.sourceText);
  assert.equal(await readFile(join(f.nativeDirectory, childId.slice(7) + '.jsonl'), 'utf8'), childNativeText);
  assert.equal(f.providerCalls, 0); assert.equal(f.runtime.requests.size, 0);
});
