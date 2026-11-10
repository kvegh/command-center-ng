import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { createApp } from '../server/main.mjs';
import { Workspace } from '../server/workspace.mjs';
import { setPassword } from '../server/auth.mjs';

const source = await readFile(new URL('../src/tab-attention.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace('../server/approval-choices.mjs', new URL('../server/approval-choices.mjs', import.meta.url).href);
const { tabAttentionView, coordinatorReviewAvailable } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const command = (extra = {}, threadId = 'worker') => ({
  id: 1, method: 'item/commandExecution/requestApproval', reviewToken: 'current-token',
  params: { threadId, turnId: null, itemId: null, command: 'example-tool --check' }, ...extra,
});
const worker = extra => ({ id: 'worker', role: 'worker', provider: 'codex', status: 'attention', ownStatus: 'attention', questions: [command()], messages: [], ...extra });
const coordinator = extra => ({ id: 'coordinator', role: 'coordinator', status: 'running', canSend: true, questions: [], ...extra });
const snapshot = extra => ({ connected: true, codexConnected: true, coordinator: { id: 'coordinator', paused: false, starting: false }, agents: [coordinator()], ...extra });
const needsUser = result => assert.equal(result.needsUser, true);

test('eligible exact command and file approvals await review without amber or an invented idle/running-review label', () => {
  for (const question of [command(), command({ method: 'item/fileChange/requestApproval', nativeItem: { state: 'unavailable' } })]) {
    const agent = worker({ questions: [question] });
    const before = structuredClone(agent);
    assert.deepEqual(tabAttentionView(agent, true), { needsUser: false, awaitingCoordinator: true, confirming: false, label: 'Awaiting Coordinator review' });
    assert.deepEqual(agent, before, 'presentation cannot mutate native status or request fields');
  }
});

test('native once eligibility and exact current identity are required, without imposing non-null turn/item IDs', () => {
  for (const question of [command({ reviewToken: undefined }), command({}, 'other-worker')]) {
    const result = tabAttentionView(worker({ questions: [question] }), true);
    needsUser(result); assert.equal(result.label, 'Request details unavailable');
  }
  for (const availableDecisions of [[], ['acceptForSession', 'cancel'], [{ acceptWithExecpolicyAmendment: { execpolicy_amendment: ['example-tool'] } }]]) {
    needsUser(tabAttentionView(worker({ questions: [command({ params: { threadId: 'worker', availableDecisions } })] }), true));
  }
  assert.equal(tabAttentionView(worker(), true).awaitingCoordinator, true, 'nullable native turn/item fields remain legitimate');
});

test('referrals, request errors and reviewed-but-still-pending answers need the user', () => {
  for (const extra of [{ review: { decision: 'ask', rationale: 'Choose the target.' } }, { error: 'Native answer failed.' }, ...['approve', 'decline'].map(decision => ({ review: { decision, rationale: 'Reviewed.' } }))]) {
    const result = tabAttentionView(worker({ questions: [command(extra)] }), true);
    needsUser(result); assert.equal(result.awaitingCoordinator, false);
  }
});

test('queued review remains eligible under the same native once, identity, availability and child guards', () => {
  const queued = { decision: 'queued', rationale: 'Review requested by the user.' };
  assert.equal(tabAttentionView(worker({ questions: [command({ review: queued })] }), true).awaitingCoordinator, true);
  needsUser(tabAttentionView(worker({ questions: [command({ review: queued })] }), false));
  for (const question of [command({ review: queued, reviewToken: undefined }), command({ review: queued }, 'stranger'), command({ review: queued, method: 'item/permissions/requestApproval' }), command({ review: queued, params: { threadId: 'worker', availableDecisions: ['decline'] } })]) {
    needsUser(tabAttentionView(worker({ questions: [question] }), true));
  }
  const parent = worker({ ownStatus: 'idle', questions: [], workers: [{ id: 'child', status: 'attention', needsInput: true, questions: [command({ review: queued }, 'child')] }] });
  assert.equal(tabAttentionView(parent, true).awaitingCoordinator, true);
  needsUser(tabAttentionView(parent, false));
});

test('Ask coordinator HTTP round trip queues the current request without asking the user or sending a native answer', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-tab-review-'));
  const rpc = new EventEmitter(); rpc.ready = true; rpc.close = () => {};
  rpc.respond = () => assert.fail('Asking for review must not answer the native approval.');
  rpc.call = async (method, params) => {
    if (method === 'thread/read') return { thread: { id: params.threadId, name: 'Example project', cwd: directory, status: { type: 'idle' } } };
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    assert.fail('No native execution is expected: ' + method);
  };
  const workspace = new Workspace(rpc, { beads: null });
  await workspace.open('worker', { observeOnly: true });
  const authFile = join(directory, 'auth.json'), password = randomBytes(24).toString('base64url');
  await setPassword(password, authFile);
  const app = await createApp({ rpc, workspace, authFile, workspaceFile: join(directory, 'workspace.json') });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  let reviewRequests = 0;
  workspace.coordinator = { paused: false, deliveries: new Map(), ensure: async () => { reviewRequests++; }, mark() {}, snapshot: () => null, reportState: () => null, shutdown: async () => {} };
  class Response extends EventEmitter {
    headers = {}; chunks = []; writableLength = 0;
    finished = new Promise(resolve => { this.finish = resolve; });
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
    writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; for (const [name, value] of Object.entries(headers)) this.setHeader(name, value); }
    write(chunk) { this.chunks.push(String(chunk)); return true; }
    end(chunk) { if (chunk !== undefined) this.write(chunk); this.writableEnded = true; this.finish(this); this.emit('finish'); }
  }
  const request = async (path, body, cookie) => {
    const incoming = new EventEmitter();
    Object.assign(incoming, { url: path, method: body === undefined ? 'GET' : 'POST',
      headers: { host: 'localhost:4242', origin: 'http://localhost:4242', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      socket: { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)); } });
    const response = new Response(); response.once('finish', () => incoming.emit('close'));
    app.server.emit('request', incoming, response); return response.finished;
  };
  const login = await request('/api/login', { password });
  assert.equal(login.statusCode, 200); const cookie = login.headers['set-cookie'];
  rpc.emit('request', { id: 31, method: 'item/commandExecution/requestApproval', params: { threadId: 'worker', turnId: null, itemId: null, command: 'example-tool --check' } });
  const question = workspace.agent('worker').questions[0], token = question.reviewToken;
  const reply = await request('/api/agents/worker/review', { requestId: question.id }, cookie);
  assert.equal(reply.statusCode, 200); assert.equal(reviewRequests, 1);
  const state = await request('/api/state', undefined, cookie);
  assert.equal(state.statusCode, 200);
  const actual = JSON.parse(state.chunks.join('')).agents.find(agent => agent.id === 'worker');
  assert.equal(actual.questions[0].review.decision, 'queued');
  assert.equal(actual.questions[0].reviewToken, token);
  assert.equal(tabAttentionView(actual, true).awaitingCoordinator, true);
  assert.equal(tabAttentionView(actual, true).needsUser, false);
  needsUser(tabAttentionView(actual, false));
});

test('sent answers remain neutral confirmation waits, even after review or with an older answer error', () => {
  const result = tabAttentionView(worker({ questions: [command({ responding: true, error: 'Earlier attempt failed.', review: { decision: 'approve', rationale: 'Within scope.' } })] }), false);
  assert.deepEqual(result, { needsUser: false, awaitingCoordinator: false, confirming: true, label: 'Waiting for native confirmation' });
});

test('manual clarification, permissions, MCP and unsupported approval methods are never hidden by review availability', () => {
  for (const method of ['item/tool/requestUserInput', 'item/permissions/requestApproval', 'mcpServer/elicitation/request', 'execCommandApproval', 'applyPatchApproval', 'future/requestApproval']) {
    needsUser(tabAttentionView(worker({ questions: [command({ method })] }), true));
  }
  needsUser(tabAttentionView(worker({ provider: 'claude' }), true));
  needsUser(tabAttentionView(worker(), false));
});

test('missing details and unverified child warnings stay amber with a recovery label, not an invented referral', () => {
  const own = tabAttentionView(worker({ questions: [] }), true);
  needsUser(own); assert.equal(own.label, 'Request details unavailable');
  for (const extra of [{ requestError: 'Ownership cannot be verified.' }, { detailError: 'Metadata unavailable.' }, { needsInput: true, status: 'attention' }]) {
    const child = { id: 'child', status: 'idle', questions: [], ...extra };
    const result = tabAttentionView(worker({ ownStatus: 'idle', questions: [], workers: [child] }), true);
    needsUser(result); assert.equal(result.label, 'Request details unavailable');
  }
  for (const errorField of ['requestError', 'detailError']) {
    const result = tabAttentionView(worker({ status: 'idle', ownStatus: 'idle', questions: [], workers: [{ id: 'child', status: 'idle', questions: [], [errorField]: 'An unrelated metadata read failed.' }] }), true);
    assert.equal(result.needsUser, false, 'idle child read failures do not manufacture a pending user question');
    assert.equal(result.label, 'Idle');
  }
  const failed = tabAttentionView(worker({ status: 'error', ownStatus: 'error', questions: [] }), true);
  assert.equal(failed.needsUser, false); assert.equal(failed.label, 'Error');
});

test('verified child requests are assessed under their original child identity and any human need wins', () => {
  const child = { id: 'child', status: 'attention', needsInput: true, questions: [command({}, 'child')] };
  const parent = worker({ ownStatus: 'idle', questions: [], workers: [child] });
  assert.equal(tabAttentionView(parent, true).awaitingCoordinator, true);
  assert.equal(tabAttentionView(parent, true).needsUser, false);
  needsUser(tabAttentionView({ ...parent, questions: [command({ method: 'item/tool/requestUserInput' })] }, true));
  needsUser(tabAttentionView({ ...parent, questions: [command({ responding: true })], workers: [{ ...child, questions: [command({ review: { decision: 'ask', rationale: 'Need your choice.' } }, 'child')] }] }, true));
  needsUser(tabAttentionView({ ...parent, workers: [{ ...child, questions: [command()] }] }, true), 'never confuse parent and child identities');
  assert.equal(tabAttentionView(worker({ status: 'running', ownStatus: 'running', questions: [], workers: [{ id: 'child', status: 'running' }] }), true).needsUser, false, 'a historical activity-only child row has no question details');
});

test('live async questions retain human attention; submission waits do not invent a resolution or historical question', () => {
  const asyncWorker = state => worker({ status: 'running', ownStatus: 'running', questions: [], messages: [{ nativeQuestions: [{ answerState: state }] }] });
  for (const state of ['available', 'unconfirmed']) needsUser(tabAttentionView(asyncWorker(state), true));
  const sending = tabAttentionView(asyncWorker('submitting'), true);
  assert.equal(sending.needsUser, false); assert.equal(sending.confirming, true);
  for (const answerState of ['submitting', 'submitted', 'read-only']) {
    const unknownNativeRequest = tabAttentionView(worker({ questions: [], messages: [{ nativeQuestions: [{ answerState }] }] }), true);
    needsUser(unknownNativeRequest); assert.equal(unknownNativeRequest.label, 'Request details unavailable');
  }
  for (const answerState of ['submitted', 'read-only', undefined]) {
    assert.equal(tabAttentionView(worker({ status: 'running', ownStatus: 'running', questions: [], messages: [{ nativeQuestions: [{ answerState }] }] }), true).needsUser, false);
  }
  needsUser(tabAttentionView(worker({ questions: [command()], messages: [{ nativeQuestions: [{ answerState: 'available' }] }] }), true));
});

test('only an available matching Coordinator suppresses reviewable waits; ordinary errors and restored observation alone are not disqualifiers', () => {
  assert.equal(coordinatorReviewAvailable(snapshot()), true);
  assert.equal(coordinatorReviewAvailable(snapshot({ agents: [coordinator({ status: 'idle', observingOnly: true })], coordinator: { id: 'coordinator', paused: false, starting: false, error: 'An unrelated report was not delivered.' } })), true);
  for (const state of [snapshot({ connected: false }), snapshot({ codexConnected: false }), snapshot({ coordinator: null }), snapshot({ agents: [] }), snapshot({ coordinator: { id: 'coordinator', paused: true, starting: false } }), snapshot({ coordinator: { id: 'coordinator', paused: false, starting: true } }), ...[{ status: 'attention' }, { status: 'offline' }, { status: 'error' }, { canSend: false }, { questions: [command()] }, { role: 'worker' }, { provider: 'claude' }].map(extra => snapshot({ agents: [coordinator(extra)] }))]) {
    assert.equal(coordinatorReviewAvailable(state), false);
    needsUser(tabAttentionView(worker(), coordinatorReviewAvailable(state)));
  }
});

test('the shared derived needs-user count excludes review/confirmation waits and keeps Coordinator native attention', () => {
  const views = [tabAttentionView(worker(), true), tabAttentionView(worker({ questions: [command({ responding: true })] }), true), tabAttentionView(worker({ questions: [command({ method: 'item/permissions/requestApproval' })] }), true), tabAttentionView(coordinator({ status: 'attention' }), true)];
  assert.equal(views.filter(view => view.needsUser).length, 2);
  assert.equal(views[3].label, 'Needs you');
});
