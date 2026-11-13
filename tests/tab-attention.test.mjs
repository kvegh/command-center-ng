import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';
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

async function actualTabPresentation() {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let tabStatus, footer, coordinatorConfigured;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'tabStatus') tabStatus = node.initializer.getText(ast);
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'WorkerStatus') footer = node;
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'tabAttentionView') coordinatorConfigured = node.arguments[2]?.getText(ast);
    ts.forEachChild(node, visit);
  }; visit(ast);
  assert.ok(tabStatus); assert.ok(footer); assert.ok(coordinatorConfigured);
  return { ast, footer,
    configured: new Function('state', ts.transpileModule(`return (${coordinatorConfigured});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText),
    status: new Function('agent', 'view', ts.transpileModule(`return (${tabStatus});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText) };
}

test('eligible exact command and file approvals await review without amber or an invented idle/running-review label', () => {
  for (const question of [command(), command({ method: 'item/fileChange/requestApproval', nativeItem: { state: 'unavailable' } })]) {
    const agent = worker({ questions: [question] });
    const before = structuredClone(agent);
    assert.deepEqual(tabAttentionView(agent, true), { needsUser: false, awaitingCoordinator: true, confirming: false, label: 'Awaiting Coordinator review' });
    assert.deepEqual(agent, before, 'presentation cannot mutate native status or request fields');
  }
});

test('fresh-human command approvals always need the user instead of coordinator review', () => {
  const question = command({ params: { threadId: 'worker', kind: 'humanCommand', availableDecisions: ['accept', 'acceptForSession'] } });
  for (const available of [true, false]) {
    const result = tabAttentionView(worker({ questions: [question] }), available);
    assert.equal(result.needsUser, true); assert.equal(result.awaitingCoordinator, false);
    assert.equal(result.label, 'Needs your personal approval');
    const child = worker({ ownStatus: 'idle', questions: [], workers: [{ id: 'child', status: 'attention', questions: [{ ...question, params: { ...question.params, threadId: 'child' } }] }] });
    assert.equal(tabAttentionView(child, available).needsUser, true);
  }
  assert.equal(tabAttentionView(worker({ questions: [{ ...question, responding: true }] }), true).confirming, true, 'a manual answer still waits for native confirmation');
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

test('actual referrals and request errors need the user while reviewed answers await confirmation', () => {
  for (const extra of [{ review: { decision: 'ask', rationale: 'Choose the target.' } }, { error: 'Native answer failed.' }]) {
    const result = tabAttentionView(worker({ questions: [command(extra)] }), true);
    needsUser(result); assert.equal(result.awaitingCoordinator, false);
  }
  for (const decision of ['approve', 'decline']) {
    const result = tabAttentionView(worker({ questions: [command({ review: { decision, rationale: 'Reviewed.' } })] }), false, true);
    assert.deepEqual(result, { needsUser: false, awaitingCoordinator: false, confirming: true, label: 'Waiting for native confirmation' });
    needsUser(tabAttentionView(worker({ questions: [command({ review: { decision, rationale: 'Reviewed.' }, error: 'Native answer failed.' })] }), false, true));
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
  question.review = { decision: 'ask', rationale: 'Choose the intended target.', historicalAt: '2026-01-01T12:49:00.000Z' };
  assert.equal(tabAttentionView({ ...actual, questions: [question] }, true).needsUser, true);
  const retryReview = await request('/api/agents/worker/review', { requestId: question.id }, cookie);
  assert.equal(retryReview.statusCode, 200); assert.equal(reviewRequests, 2);
  assert.deepEqual(question.review, { decision: 'queued', rationale: 'Review requested by the user.' });
  for (const [requestId, kind] of [[32, 'humanCommand'], [33, 'futureKind']]) {
    rpc.emit('request', { id: requestId, method: 'item/commandExecution/requestApproval', params: { threadId: 'worker', turnId: null, itemId: null, kind, command: 'example-tool --check', availableDecisions: ['accept', 'acceptForSession'] } });
    const current = workspace.agent('worker').questions.find(question => question.id === requestId);
    const denied = await request('/api/agents/worker/review', { requestId }, cookie);
    assert.equal(denied.statusCode, 400);
    assert.equal(reviewRequests, 2, 'human-only and unsupported kinds cannot queue coordinator work');
    assert.equal(current.review, undefined); assert.equal(current.responding, undefined);
  }
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

test('empty native waits and unverified child diagnostics stay neutral without inventing a human question', () => {
  const own = tabAttentionView(worker({ questions: [] }), true);
  assert.equal(own.needsUser, false); assert.equal(own.label, 'Request details unavailable');
  for (const extra of [{ requestError: 'Ownership cannot be verified.' }, { detailError: 'Metadata unavailable.' }, { needsInput: true, status: 'attention' }]) {
    const child = { id: 'child', status: 'idle', questions: [], ...extra };
    const result = tabAttentionView(worker({ ownStatus: 'idle', questions: [], workers: [child] }), true);
    assert.equal(result.needsUser, false); assert.equal(result.label, 'Request details unavailable');
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
    assert.equal(unknownNativeRequest.needsUser, false); assert.equal(unknownNativeRequest.label, 'Request details unavailable');
  }
  for (const answerState of ['submitted', 'read-only', undefined]) {
    assert.equal(tabAttentionView(worker({ status: 'running', ownStatus: 'running', questions: [], messages: [{ nativeQuestions: [{ answerState }] }] }), true).needsUser, false);
  }
  needsUser(tabAttentionView(worker({ questions: [command()], messages: [{ nativeQuestions: [{ answerState: 'available' }] }] }), true));
});

test('Coordinator availability remains truthful without turning configured review waits into user decisions', () => {
  assert.equal(coordinatorReviewAvailable(snapshot()), true);
  assert.equal(coordinatorReviewAvailable(snapshot({ agents: [coordinator({ status: 'idle', observingOnly: true })], coordinator: { id: 'coordinator', paused: false, starting: false, error: 'An unrelated report was not delivered.' } })), true);
  for (const state of [snapshot({ connected: false }), snapshot({ codexConnected: false }), snapshot({ coordinator: null }), snapshot({ agents: [] }), snapshot({ coordinator: { id: 'coordinator', paused: true, starting: false } }), snapshot({ coordinator: { id: 'coordinator', paused: false, starting: true } }), ...[{ status: 'attention' }, { status: 'offline' }, { status: 'error' }, { canSend: false }, { questions: [command()] }, { role: 'worker' }, { provider: 'claude' }].map(extra => snapshot({ agents: [coordinator(extra)] }))]) {
    assert.equal(coordinatorReviewAvailable(state), false);
    const result = tabAttentionView(worker(), coordinatorReviewAvailable(state), !!state.coordinator);
    assert.equal(result.needsUser, !state.coordinator);
    assert.equal(result.awaitingCoordinator, !!state.coordinator);
  }
});

test('queued or running analysis and analyst recommendations cannot invent a main Coordinator referral', () => {
  for (const status of ['queued', 'running', 'ready']) for (const decision of ['approve', 'decline', 'ask']) {
    const question = command({ approvalAnalysis: { status, recommendation: { decision } } });
    for (const available of [true, false]) {
      const agent = worker({ questions: [question] }), before = structuredClone(agent);
      assert.equal(tabAttentionView(agent, available, true).needsUser, false);
      assert.equal(tabAttentionView(agent, available, true).label, 'Awaiting Coordinator review');
      assert.deepEqual(agent, before);
    }
  }
  needsUser(tabAttentionView(worker(), false, false), 'without a configured Coordinator the native request remains a specific manual decision');
  for (const extra of [{ review: { decision: 'ask', rationale: 'Choose a target.' } }, { error: 'Answer failed.' }, { method: 'item/tool/requestUserInput' }]) {
    needsUser(tabAttentionView(worker({ questions: [command(extra)] }), false, true));
  }
  const parent = worker({ ownStatus: 'idle', questions: [], workers: [{ id: 'child', status: 'attention', questions: [command({ review: { decision: 'queued' } }, 'child')] }] });
  assert.equal(tabAttentionView(parent, false, true).needsUser, false);
  assert.equal(tabAttentionView(parent, false, true).awaitingCoordinator, true);
});

test('only an explicit current linked Beads input joins the user attention indicator', () => {
  const agent = worker({ status: 'running', ownStatus: 'running', questions: [], tasks: [{ displayState: 'needs_input' }] });
  assert.deepEqual(tabAttentionView(agent, false, true), { needsUser: true, awaitingCoordinator: false, confirming: false, label: 'Needs your task input' });
  for (const displayState of ['blocked', 'queued', 'closed', 'in_progress', 'deferred', undefined]) {
    const result = tabAttentionView({ ...agent, tasks: [{ displayState, isChatQuestion: true }] }, false, true);
    assert.equal(result.needsUser, false, `${displayState}: task history or ordinary work does not invent a current question`);
    assert.equal(result.label, 'Running');
  }
});

test('the shared count includes real Coordinator questions but excludes empty native, review and confirmation waits', () => {
  const views = [tabAttentionView(worker(), true), tabAttentionView(worker({ questions: [command({ responding: true })] }), true), tabAttentionView(worker({ questions: [command({ method: 'item/permissions/requestApproval' })] }), true), tabAttentionView(coordinator({ status: 'attention', questions: [command({}, 'coordinator')] }), true), tabAttentionView(coordinator({ status: 'attention' }), true)];
  assert.equal(views.filter(view => view.needsUser).length, 2);
  assert.equal(views[3].label, 'Needs your decision');
  assert.equal(views[4].label, 'Request details unavailable'); assert.equal(views[4].needsUser, false);
});

test('technical delivered-request errors remain explicit rather than becoming a decision label', () => {
  const answerError = tabAttentionView(worker({ questions: [command({ error: 'The answer could not be confirmed.' })] }), true);
  assert.equal(answerError.label, 'Request answer error'); assert.equal(answerError.needsUser, true);
  const emptyError = tabAttentionView(worker({ questions: [], requestError: 'The native envelope was not delivered.' }), true);
  assert.equal(emptyError.label, 'Request details unavailable'); assert.equal(emptyError.needsUser, false);
  const manual = tabAttentionView(worker({ questions: [command({ review: { decision: 'ask', rationale: 'Choose one target.' } })] }), true);
  assert.equal(manual.label, 'Needs your decision'); assert.equal(manual.needsUser, true);
  const coordinatorConfirming = tabAttentionView(coordinator({ status: 'attention', questions: [command({ responding: true }, 'coordinator')] }), true);
  assert.equal(coordinatorConfirming.label, 'Waiting for native confirmation'); assert.equal(coordinatorConfirming.needsUser, false);
});

test('actual tab class and footer wiring keep unknown waits neutral while genuine manual requests remain amber', async () => {
  const { ast, footer, status: evaluateStatus } = await actualTabPresentation();
  for (const [agent, expected] of [
    [worker({ questions: [] }), 'waiting'],
    [worker({ ownStatus: 'idle', questions: [], workers: [{ id: 'child', status: 'attention', needsInput: true, questions: [] }] }), 'waiting'],
    [worker(), 'waiting'],
    [worker({ questions: [command({ responding: true })] }), 'waiting'],
    [worker({ questions: [command({ method: 'item/tool/requestUserInput' })] }), 'attention'],
    [worker({ questions: [command({ review: { decision: 'ask', rationale: 'Choose a target.' } })] }), 'attention']
  ]) {
    const before = structuredClone(agent), view = tabAttentionView(agent, true);
    assert.equal(evaluateStatus(agent, view), expected);
    assert.deepEqual(agent, before, 'changing visual class never changes native status or pending requests');
  }
  const presentation = footer.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'presentation');
  assert.equal(presentation?.initializer?.expression?.getText(ast), 'tabAttention.get(active.id)');
});

test('actual tabs stay neutral across configured Coordinator lifecycle and confirmation snapshots', async () => {
  const { status, configured } = await actualTabPresentation();
  for (const state of [
    snapshot({ agents: [] }),
    snapshot({ agents: [coordinator({ status: 'idle', canSend: false, observingOnly: true })] }),
    snapshot({ coordinator: { id: 'coordinator', starting: true, paused: false } }),
    snapshot({ coordinator: { id: null, starting: true, paused: false } }),
    snapshot({ coordinator: { id: 'coordinator', starting: false, paused: true } }),
    snapshot(),
  ]) {
    for (const question of [command(), command({ review: { decision: 'queued' } }), command({ approvalAnalysis: { status: 'running' } }), command({ review: { decision: 'approve' } }), command({ review: { decision: 'decline' } })]) {
      const agent = worker({ questions: [question] }), before = structuredClone(agent);
      assert.equal(configured(state), true, 'a saved Coordinator or current startup supplies review context');
      const view = tabAttentionView(agent, coordinatorReviewAvailable(state), configured(state));
      assert.equal(status(agent, view), 'waiting');
      assert.equal(view.needsUser, false);
      assert.deepEqual(agent, before);
    }
  }
  const agent = worker();
  for (const state of [snapshot({ coordinator: null }), snapshot({ coordinator: { id: null, starting: false, paused: false } })]) {
    assert.equal(configured(state), false);
    assert.equal(status(agent, tabAttentionView(agent, coordinatorReviewAvailable(state), configured(state))), 'attention', 'no configured Coordinator leaves the native request manual');
  }
  const taskInput = worker({ status: 'running', ownStatus: 'running', questions: [], tasks: [{ displayState: 'needs_input' }] });
  assert.equal(status(taskInput, tabAttentionView(taskInput, false, true)), 'attention');
});

test('actual user-action tabs keep amber while evaluation and confirmation stay neutral in every theme and selection', async () => {
  const { status } = await actualTabPresentation();
  const sheet = postcss.parse(await readFile(new URL('../src/style.css', import.meta.url), 'utf8'));
  // Resolve only the status/selection selectors and border shorthand involved
  // in this regression; this is a cascade check, not browser layout emulation.
  const style = (theme, active, tabStatus, property) => {
    const selectors = ['.tab-wrap', `.tab-wrap.${tabStatus}`, ...(active ? ['.tab-wrap.active', `.tab-wrap.active.${tabStatus}`] : [])];
    const accepted = new Set(selectors.flatMap(selector => [selector, `:root[data-theme="${theme}"] ${selector}`]));
    let winner = { specificity: -1, value: undefined };
    sheet.nodes.filter(node => node.type === 'rule').forEach(rule => {
      const matching = rule.selectors.filter(selector => accepted.has(selector));
      if (!matching.length) return;
      const specificity = Math.max(...matching.map(selector => (selector.match(/\.[a-z-]+|\[[^\]]+\]|:root/g) || []).length));
      rule.nodes.filter(node => node.type === 'decl').forEach(declaration => {
        const applies = declaration.prop === property || (property === 'border-top-color' && declaration.prop === 'border-color');
        if (applies && specificity >= winner.specificity) winner = { specificity, value: declaration.value };
      });
    });
    return winner.value;
  };
  for (const agent of [
    worker({ questions: [command({ review: { decision: 'ask', rationale: 'Choose a target.' } })] }),
    worker({ ownStatus: 'idle', questions: [], workers: [{ id: 'child', status: 'attention', questions: [command({ method: 'item/permissions/requestApproval' }, 'child')] }] }),
    worker({ questions: [], tasks: [{ displayState: 'needs_input' }] }),
  ]) {
    const view = tabAttentionView(agent, true, true), tabStatus = status(agent, view);
    assert.equal(view.needsUser, true, 'the current main, child or Beads request genuinely needs a user decision');
    for (const theme of ['classic', 'contrastful', 'light']) for (const active of [false, true]) {
      assert.equal(style(theme, active, tabStatus, 'border-top-color'), 'var(--amber)', `${theme}: selected=${active} must keep the actual attention frame`);
      assert.equal(style(theme, active, tabStatus, 'background'), active ? 'var(--chat-tab-background)' : 'var(--surface)', 'status framing must preserve the selected chat tint and inactive fill');
    }
  }
  for (const agent of [worker(), worker({ questions: [command({ approvalAnalysis: { status: 'running' } })] }), worker({ questions: [command({ review: { decision: 'approve' } })] }), worker({ questions: [command({ responding: true })] })]) {
    const view = tabAttentionView(agent, false, true), tabStatus = status(agent, view);
    assert.equal(tabStatus, 'waiting');
    for (const theme of ['classic', 'contrastful', 'light']) for (const active of [false, true]) {
      assert.notEqual(style(theme, active, tabStatus, 'border-top-color'), 'var(--amber)', `${theme}: selected=${active} review/confirmation alone cannot show amber`);
      assert.equal(style(theme, active, tabStatus, 'background'), active ? 'var(--chat-tab-background)' : 'var(--surface)');
    }
  }
});
