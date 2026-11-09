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
  end(chunk) { if (chunk !== undefined) this.write(chunk); this.writableEnded = true; this.finish(this); this.emit('finish'); }
  destroy() { this.destroyed = true; this.finish(this); this.emit('finish'); }
  json() { return JSON.parse(this.chunks.join('')); }
}

async function waitFor(predicate) {
  const deadline = Date.now() + 1500;
  while (!predicate()) { if (Date.now() >= deadline) throw new Error('Expected synthetic child request event was not observed.'); await delay(5); }
}

async function fixture(t, { failInitialChildRead = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-subagent-http-'));
  const rpc = new EventEmitter(); rpc.ready = true; rpc.calls = []; rpc.replies = [];
  rpc.close = () => {}; rpc.respond = (id, result) => rpc.replies.push({ id, result });
  rpc.refuse = () => assert.fail('Child requests must never be automatically refused.');
  const threads = new Map([
    ['parent', { id: 'parent', name: 'Synthetic project', cwd: directory, status: { type: 'idle' } }],
    ['child', { id: 'child', name: 'Synthetic review', parentThreadId: 'parent', cwd: directory, status: { type: 'active', activeFlags: ['waitingOnApproval'] } }],
    ['stranger', { id: 'stranger', name: 'Other project', cwd: directory, status: { type: 'idle' } }],
  ]);
  rpc.call = async (method, params) => {
    rpc.calls.push({ method, params });
    if (method === 'thread/read') {
      if (params.threadId === 'child' && failInitialChildRead) { failInitialChildRead = false; throw new Error('Temporary native lineage read failure.'); }
      return { thread: structuredClone(threads.get(params.threadId)) };
    }
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    throw new Error('Unexpected native operation: ' + method);
  };
  const workspace = new Workspace(rpc, { beads: null, answerTimeout: 500 });
  await workspace.open('parent', { observeOnly: true });
  const authFile = join(directory, 'auth.json'), password = randomBytes(24).toString('base64url');
  await setPassword(password, authFile);
  const app = await createApp({ rpc, workspace, authFile, workspaceFile: join(directory, 'workspace.json') });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
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
  workspace.notification({ method: 'item/completed', params: { threadId: 'parent', turnId: 'parent-turn', item: { id: 'child-activity', type: 'subAgentActivity', agentThreadId: 'child', agentPath: '/review', kind: 'started' } } });
  await waitFor(() => { const worker = workspace.agent('parent').workers[0]; return worker?.detailLoaded || worker?.detailError; });
  const ask = (id = 73, threadId = 'child', method = 'item/commandExecution/requestApproval', params = {}) => {
    rpc.emit('request', { id, method, params: { threadId, turnId: threadId + '-turn', itemId: threadId + '-item', command: 'synthetic-command', availableDecisions: ['accept', 'decline'], ...params } });
    return workspace.resolveRequestContext(workspace.agent('parent'), threadId).questions.find(question => question.id === id);
  };
  const binding = question => ({ requestThreadId: question.params.threadId, requestId: question.id, reviewToken: question.reviewToken, turnId: question.params.turnId, itemId: question.params.itemId });
  const coordinator = { paused: false, ensureCalls: 0, marks: [], deliveries: new Map(), snapshot: () => null, reportState: () => null,
    async ensure() { this.ensureCalls++; }, mark(id, reason) { this.marks.push({ id, reason }); }, markRemainingApprovals() {}, flush: async () => {}, shutdown: async () => {} };
  return { app, rpc, workspace, ask, binding, coordinator, request: (path, body) => request(path, body, cookie), unauthenticated: request };
}

test('authenticated browser state shows exact child requests under the parent without opening another tab', async t => {
  const f = await fixture(t), question = f.ask();
  const response = await f.request('/api/state').finished;
  assert.equal(response.statusCode, 200);
  const snapshot = response.json(); assert.deepEqual(snapshot.agents.map(agent => agent.id), ['parent']);
  const parent = snapshot.agents[0], child = parent.workers.find(worker => worker.id === 'child');
  assert.equal(parent.status, 'attention'); assert.equal(parent.ownStatus, 'idle'); assert.deepEqual(parent.questions, []);
  assert.equal(child.needsInput, true); assert.equal(child.questions[0].reviewToken, question.reviewToken);
  assert.deepEqual(child.questions[0].params, question.params); assert.equal(snapshot.backgroundQuestions, 0);
  assert.equal(Object.hasOwn(child, 'requestContext'), false); assert.deepEqual(f.rpc.replies, []);
  assert.ok(f.rpc.calls.every(call => ['thread/read', 'thread/turns/list'].includes(call.method)));
});

test('child answers wait for the exact typed native acknowledgement and leave the same parent request pending', async t => {
  const f = await fixture(t); f.ask(73, 'parent'); f.ask(73); const selected = f.ask('73');
  const body = { ...f.binding(selected), decision: 'accept' };
  const rejected = await f.unauthenticated('/api/agents/parent/answer', body).finished;
  assert.equal(rejected.statusCode, 403); assert.deepEqual(f.rpc.replies, []);
  const response = f.request('/api/agents/parent/answer', body);
  await waitFor(() => f.rpc.replies.length === 1);
  assert.deepEqual(f.rpc.replies, [{ id: '73', result: { decision: 'accept' } }]);
  assert.equal(response.headersSent, undefined, 'HTTP success waits for native resolution');
  f.rpc.emit('notification', { method: 'serverRequest/resolved', params: { threadId: 'child', requestId: '73' } });
  assert.equal((await response.finished).statusCode, 200);
  const parent = (await f.request('/api/state').finished).json().agents[0];
  assert.deepEqual(parent.questions.map(question => question.id), [73]);
  assert.deepEqual(parent.workers[0].questions.map(question => question.id), [73]);
  assert.equal(f.workspace.pending.size, 2);
});

test('foreign children, stale tokens and incomplete native bindings cannot answer or inspect a different request', async t => {
  const f = await fixture(t), question = f.ask(), exact = f.binding(question);
  await f.workspace.open('stranger', { observeOnly: true });
  const invalid = [
    { ...exact, requestThreadId: 'stranger' }, { ...exact, requestThreadId: 'undiscovered' },
    { ...exact, reviewToken: 'old-token' }, { ...exact, reviewToken: undefined },
    { ...exact, turnId: undefined }, { ...exact, itemId: undefined }, { ...exact, turnId: 'old-turn' },
  ];
  for (const binding of invalid) {
    const denied = await f.request('/api/agents/parent/answer', { ...binding, decision: 'accept' }).finished;
    assert.equal(denied.statusCode, 409, denied.chunks.join(''));
    const details = await f.request('/api/agents/parent/requests', binding).finished;
    assert.equal(details.statusCode, 409, details.chunks.join(''));
  }
  assert.deepEqual(f.rpc.replies, []); assert.equal(f.workspace.resolveRequestContext(f.workspace.agent('parent'), 'child').questions[0], question);
});

test('child refresh and exact file-detail recovery stay read-only when native history has no matching body', async t => {
  const f = await fixture(t), question = f.ask(74, 'child', 'item/fileChange/requestApproval');
  for (const body of [{ requestThreadId: 'child' }, f.binding(question)]) {
    const response = await f.request('/api/agents/parent/requests', body).finished;
    assert.equal(response.statusCode, 200, response.chunks.join(''));
  }
  const parent = (await f.request('/api/state').finished).json().agents[0], child = parent.workers[0];
  assert.equal(child.questions[0].id, 74); assert.equal(child.questions[0].nativeItem.state, 'unavailable');
  assert.match(child.questions[0].nativeItem.notice, /not available|no matching|unavailable|did not provide/i);
  assert.equal(child.questions[0].reviewToken, question.reviewToken); assert.deepEqual(f.rpc.replies, []);
  assert.deepEqual(f.workspace.snapshot().agents.map(agent => agent.id), ['parent']);
  assert.ok(f.rpc.calls.every(call => ['thread/read', 'thread/turns/list'].includes(call.method)));
  assert.ok(f.rpc.calls.some(call => call.method === 'thread/turns/list' && call.params.threadId === 'child'));
});

test('generic child refresh can reverify a known native candidate after a failed lineage read without admitting an unknown thread', async t => {
  const f = await fixture(t, { failInitialChildRead: true });
  const nativeRequest = { id: 77, method: 'item/commandExecution/requestApproval', params: { threadId: 'child', turnId: 'child-turn', itemId: 'child-item', command: 'synthetic-command', availableDecisions: ['accept', 'decline'] } };
  f.rpc.emit('request', nativeRequest);
  const before = (await f.request('/api/state').finished).json().agents[0].workers[0];
  assert.deepEqual(before.questions, []); assert.match(before.requestError, /Temporary native lineage read failure/);
  const recovered = await f.request('/api/agents/parent/requests', { requestThreadId: 'child' }).finished;
  assert.equal(recovered.statusCode, 200, recovered.chunks.join(''));
  const state = (await f.request('/api/state').finished).json();
  assert.deepEqual(state.agents.map(agent => agent.id), ['parent']);
  assert.deepEqual(state.agents[0].workers[0].questions.map(question => question.id), [77]);
  assert.deepEqual(state.agents[0].workers[0].questions[0].params, nativeRequest.params);
  const calls = f.rpc.calls.length;
  const foreign = await f.request('/api/agents/parent/requests', { requestThreadId: 'undiscovered' }).finished;
  assert.equal(foreign.statusCode, 409); assert.equal(f.rpc.calls.length, calls);
  assert.deepEqual(f.rpc.replies, []);
  assert.ok(f.rpc.calls.every(call => ['thread/read', 'thread/turns/list'].includes(call.method)));
});

test('manual child MCP and permission requests cannot be sent for coordinator review', async t => {
  for (const method of ['mcpServer/elicitation/request', 'item/permissions/requestApproval']) {
    const f = await fixture(t); f.workspace.coordinator = f.coordinator;
    const params = method === 'mcpServer/elicitation/request'
      ? { mode: 'form', requestedSchema: { type: 'object', properties: { choice: { type: 'string' } }, required: ['choice'] } }
      : { permissions: { fileSystem: { read: ['/example/project'] } } };
    const question = f.ask(75, 'child', method, params), exact = f.binding(question);
    const review = await f.request('/api/agents/parent/review', exact).finished;
    assert.equal(review.statusCode, 400); assert.equal(f.coordinator.ensureCalls, 0); assert.equal(question.review, undefined);
    const manual = method === 'mcpServer/elicitation/request' ? { decision: 'accept', content: { choice: 'Selected' } } : { decision: 'accept', scope: 'turn' };
    const response = f.request('/api/agents/parent/answer', { ...exact, ...manual });
    await waitFor(() => f.rpc.replies.length === 1);
    assert.equal(f.rpc.replies[0].id, 75);
    assert.deepEqual(f.rpc.replies[0].result, method === 'mcpServer/elicitation/request'
      ? { action: 'accept', content: { choice: 'Selected' }, _meta: null }
      : { permissions: params.permissions, scope: 'turn' });
    f.rpc.emit('notification', { method: 'serverRequest/resolved', params: { threadId: 'child', requestId: 75 } });
    assert.equal((await response.finished).statusCode, 200); assert.equal(f.coordinator.ensureCalls, 0);
  }
});

test('coordinator review retains its pause gate and requires the exact current child approval', async t => {
  const f = await fixture(t); f.workspace.coordinator = f.coordinator;
  const question = f.ask(76), exact = f.binding(question);
  f.coordinator.paused = true;
  assert.equal((await f.request('/api/agents/parent/review', exact).finished).statusCode, 409);
  f.coordinator.paused = false;
  for (const body of [{ ...exact, reviewToken: 'old-token' }, { ...exact, turnId: undefined }, { ...exact, itemId: 'different-item' }]) {
    const response = await f.request('/api/agents/parent/review', body).finished;
    assert.ok([400, 409].includes(response.statusCode), response.chunks.join(''));
  }
  assert.equal(f.coordinator.ensureCalls, 0); assert.equal(question.review, undefined);
  const response = await f.request('/api/agents/parent/review', exact).finished;
  assert.equal(response.statusCode, 200); assert.equal(f.coordinator.ensureCalls, 1);
  assert.equal(question.review.decision, 'queued'); assert.deepEqual(f.rpc.replies, []);
  assert.ok(f.rpc.calls.every(call => ['thread/read', 'thread/turns/list'].includes(call.method)));
});
