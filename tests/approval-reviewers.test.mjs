import test from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalReviewers, APPROVAL_REVIEWER_LIMIT, APPROVAL_REVIEWER_SOURCE, parseReviewRecommendation } from '../server/approval-reviewers.mjs';

const tools = ['ccng_read_worker', 'ccng_read_project_file', 'ccng_read_approval_source'].map(name => ({ type: 'function', name, inputSchema: { type: 'object' } }));
const recommendation = (values = {}) => JSON.stringify({ decision: 'approve', rationale: 'Request: Inspect the authorized source.', authorizationMessageId: 'actual-user-message', authorizationQuote: 'Inspect the authorized source', ...values });
const job = (id, values = {}) => ({ reviewToken: 'token-' + id, fingerprint: 'fingerprint-' + id, workerId: 'worker-' + id,
  requestThreadId: 'worker-' + id, turnId: 'request-turn', itemId: 'request-item', cwd: '/example',
  request: { command: 'Read the selected source' }, context: { userMessage: 'Inspect the authorized source' }, ...values });

async function waitFor(predicate) {
  const deadline = performance.now() + 1000;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error('Expected fake reviewer lifecycle event was not observed.');
    await new Promise(resolve => setTimeout(resolve, 1));
  }
}
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
function fixture({ call, canRun = () => true, nativeOptions, timeoutMs } = {}) {
  const calls = [], replies = [], ready = [], errors = [], reads = []; let threads = 0, turns = 0, now = 1000;
  const rpc = {
    ready: true,
    async call(method, params) {
      calls.push({ method, params });
      if (call) { const answer = await call(method, params, pool); if (answer !== undefined) return answer; }
      if (method === 'thread/start') return { thread: { id: 'reviewer-' + ++threads, status: { type: 'idle' } }, sandbox: { type: 'readOnly', networkAccess: false } };
      if (method === 'turn/start') return { turn: { id: 'analysis-' + ++turns } };
      if (['thread/archive', 'turn/interrupt'].includes(method)) return {};
      if (method === 'thread/read') return { thread: { id: params.threadId, status: { type: 'idle' } } };
      throw new Error('Unexpected fake native method: ' + method);
    },
    respond(id, result) { replies.push({ id, result }); }
  };
  const pool = new ApprovalReviewers({ rpc, tools, instructions: 'SAME_SHARED_REVIEW_POLICY', canRun, now: () => now, timeoutMs,
    nativeOptions: nativeOptions || (async () => ({ sandbox: 'read-only', model: 'selected-model', config: { 'features.shell_tool': false }, turnOptions: { model: 'selected-model', effort: 'xhigh', additionalContext: { instructions: 'actual selected AGENTS context' } } })),
    async readTool(current, params) {
      reads.push({ job: current, params });
      if (params.arguments?.agentId && params.arguments.agentId !== current.workerId) throw new Error('Other worker scope is forbidden.');
      if (params.arguments?.reviewToken && params.arguments.reviewToken !== current.reviewToken) throw new Error('Other approval scope is forbidden.');
      return { evidence: 'bounded read', actualToken: current.reviewToken };
    },
    onReady: (...values) => ready.push(values), onError: (...values) => errors.push(values)
  });
  const complete = (token, text = recommendation(), status = 'completed') => {
    const current = pool.snapshot(token);
    pool.notification({ method: 'item/completed', params: { threadId: current.threadId, turnId: current.turnId, item: { type: 'agentMessage', phase: 'final_answer', text } } });
    pool.notification({ method: 'turn/completed', params: { threadId: current.threadId, turn: { id: current.turnId, status } } });
  };
  const toolCall = (token, values = {}) => {
    const current = pool.snapshot(token);
    return { id: 'read-' + replies.length, method: 'item/tool/call', params: { threadId: current.threadId, turnId: current.turnId, tool: 'ccng_read_worker', arguments: { agentId: 'worker-' + token.slice(6) }, ...values } };
  };
  return { rpc, pool, calls, replies, ready, errors, reads, complete, toolCall, advance: ms => { now += ms; } };
}

test('two read-only analyses use existing native transport and selected policy/model, with no approval write effect', async () => {
  const f = fixture(); f.pool.reconcile([job(1), job(2), job(3)]);
  await waitFor(() => f.pool.snapshot('token-2').status === 'running');
  assert.equal(APPROVAL_REVIEWER_LIMIT, 2); assert.equal(f.pool.active.size, 2);
  assert.equal(f.pool.snapshot('token-3').status, 'queued');
  for (const call of f.calls.filter(call => call.method === 'thread/start')) {
    assert.equal(call.params.sandbox, 'read-only'); assert.equal(call.params.ephemeral, true);
    assert.equal(call.params.threadSource, APPROVAL_REVIEWER_SOURCE);
    assert.equal(call.params.developerInstructions, 'SAME_SHARED_REVIEW_POLICY');
    assert.deepEqual(call.params.dynamicTools, tools); assert.equal(call.params.model, 'selected-model');
    assert.equal(call.params.config['features.shell_tool'], false);
    assert.equal(call.params.turnOptions, undefined);
  }
  const turn = f.calls.find(call => call.method === 'turn/start').params;
  assert.equal(turn.effort, 'xhigh'); assert.equal(turn.model, 'selected-model');
  assert.equal(turn.additionalContext.instructions, 'actual selected AGENTS context');
  f.complete('token-1'); await waitFor(() => f.pool.snapshot('token-3').status === 'running');
  assert.equal(f.ready.length, 1); assert.equal(f.ready[0][0].reviewToken, 'token-1');
  assert.equal(f.ready[0][1].decision, 'approve'); assert.equal(f.pool.active.size, 2);
  assert.equal(f.replies.length, 0, 'a recommendation never answers a native approval');
  assert.ok(f.calls.every(call => ['thread/start', 'turn/start', 'thread/archive'].includes(call.method)));
});

test('read callbacks are whitelisted, bound to the current owned turn and rechecked against current request scope', async () => {
  const f = fixture(); f.pool.reconcile([job(1)]); await waitFor(() => f.pool.snapshot('token-1').status === 'running');
  assert.equal(f.pool.hasThread(f.pool.snapshot('token-1').threadId), true);
  await f.pool.handleTool(f.toolCall('token-1'));
  assert.equal(f.reads.length, 1); assert.equal(f.replies.at(-1).result.success, true);
  assert.equal(JSON.parse(f.replies.at(-1).result.contentItems[0].text).actualToken, 'token-1');
  for (const values of [{ turnId: 'another-turn' }, { tool: 'ccng_review_approval' }, { arguments: { agentId: 'another-worker' } }, { arguments: { reviewToken: 'another-token' } }]) {
    await f.pool.handleTool(f.toolCall('token-1', values)); assert.equal(f.replies.at(-1).result.success, false);
  }
  const count = f.replies.length;
  assert.equal(await f.pool.handleTool({ ...f.toolCall('token-1'), params: { threadId: 'not-owned' } }), false);
  assert.equal(f.replies.length, count);
  assert.throws(() => new ApprovalReviewers({ ...f, tools: [{ type: 'function', name: 'ccng_review_approval' }] }), /read-only/);
});

test('fast completed output and tool calls wait for the exact native turn acknowledgment', async () => {
  const acknowledgement = gate();
  const f = fixture({ call: async (method, params, pool) => {
    if (method !== 'turn/start') return;
    pool.notification({ method: 'item/completed', params: { threadId: params.threadId, turnId: 'fast-turn', item: { type: 'agentMessage', text: recommendation() } } });
    pool.notification({ method: 'turn/completed', params: { threadId: params.threadId, turn: { id: 'fast-turn', status: 'completed' } } });
    await acknowledgement.promise; return { turn: { id: 'fast-turn' } };
  } });
  f.pool.reconcile([job(1)]); await waitFor(() => f.calls.some(call => call.method === 'turn/start'));
  assert.equal(f.ready.length, 0); assert.equal(f.pool.active.size, 1);
  const read = f.toolCall('token-1', { turnId: 'wrong-fast-turn' });
  await f.pool.handleTool(read); assert.equal(f.replies.length, 0);
  acknowledgement.release(); await waitFor(() => f.ready.length === 1);
  assert.equal(f.reads.length, 0); assert.equal(f.replies[0].result.success, false);
  assert.equal(f.pool.snapshot('token-1').status, 'ready');
});

test('uncertain native starts retain both slots with unknown status and never launch duplicate attempts', async () => {
  const f = fixture({ call: async method => { if (method === 'thread/start') throw new Error('Synthetic native request timeout'); } });
  const jobs = [job(1), job(2), job(3)]; f.pool.reconcile(jobs);
  await waitFor(() => f.errors.length === 2);
  assert.equal(f.pool.snapshot('token-1').status, 'unknown'); assert.equal(f.pool.snapshot('token-1').threadId, null);
  assert.equal(f.pool.active.size, 2); assert.equal(f.pool.snapshot('token-3').status, 'queued');
  f.pool.reconcile(jobs); f.pool.setPaused(true); f.pool.setPaused(false);
  assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 2);
  f.pool.stop(); assert.equal(f.calls.some(call => call.method === 'turn/interrupt'), false, 'missing identities are not guessed');
});

test('turn-start uncertainty ignores even observed output until native identity is confirmed and does not retry', async () => {
  const f = fixture({ call: async (method, params, pool) => {
    if (method !== 'turn/start') return;
    pool.notification({ method: 'item/completed', params: { threadId: params.threadId, turnId: 'uncertain-turn', item: { type: 'agentMessage', text: recommendation() } } });
    pool.notification({ method: 'turn/completed', params: { threadId: params.threadId, turn: { id: 'uncertain-turn', status: 'completed' } } });
    throw new Error('Synthetic turn-start acknowledgement timeout');
  } });
  f.pool.reconcile([job(1)]); await waitFor(() => f.errors.length === 1);
  f.pool.reconcile([job(1)]);
  assert.equal(f.pool.snapshot('token-1').status, 'unknown'); assert.equal(f.pool.active.size, 1);
  assert.equal(f.ready.length, 0); assert.equal(f.calls.filter(call => call.method === 'turn/start').length, 1);
  assert.equal(f.calls.some(call => call.method === 'thread/archive'), false);
  await f.pool.inspectUnknown(); await f.pool.inspectUnknown();
  assert.equal(f.calls.filter(call => call.method === 'thread/read').length, 1);
  assert.deepEqual(f.pool.snapshot('token-1').lastNativeStatus, { type: 'idle' });
  assert.equal(f.pool.snapshot('token-1').lastNativeCheckAt, 1000);
  assert.equal(f.pool.snapshot('token-1').status, 'unknown', 'idle native status does not prove an execution outcome');
  assert.equal(f.pool.active.size, 1);
});

test('an unavailable native status remains unknown and one bounded read never retries an analysis', async () => {
  const f = fixture({ call: async method => {
    if (method === 'turn/start') throw new Error('Turn acknowledgement unknown');
    if (method === 'thread/read') throw new Error('Native thread is not loaded');
  } });
  f.pool.reconcile([job(1)]); await waitFor(() => f.pool.snapshot('token-1').status === 'unknown');
  await f.pool.inspectUnknown(); await f.pool.inspectUnknown();
  assert.match(f.pool.snapshot('token-1').lastNativeCheckError, /not loaded/);
  assert.equal(f.pool.snapshot('token-1').status, 'unknown'); assert.equal(f.pool.active.size, 1);
  assert.equal(f.calls.filter(call => call.method === 'thread/read').length, 1);
  assert.equal(f.calls.filter(call => call.method === 'turn/start').length, 1);
});

test('pausing during an acknowledged idle thread start resumes with a fresh owned run and no old-thread tool access', async () => {
  const start = gate(); let first = true;
  const f = fixture({ call: async method => {
    if (method !== 'thread/start' || !first) return;
    first = false; await start.promise;
    return { thread: { id: 'paused-idle-thread', status: { type: 'idle' } }, sandbox: { type: 'readOnly' } };
  } });
  f.pool.reconcile([job(1)]); await waitFor(() => f.calls.some(call => call.method === 'thread/start'));
  f.pool.setPaused(true); start.release(); await waitFor(() => f.pool.snapshot('token-1').status === 'queued');
  assert.equal(f.calls.some(call => call.method === 'turn/start'), false);
  f.pool.setPaused(false); await waitFor(() => f.pool.snapshot('token-1').status === 'running');
  assert.equal(await f.pool.handleTool({ id: 'old-thread-read', method: 'item/tool/call', params: { threadId: 'paused-idle-thread', turnId: f.pool.snapshot('token-1').turnId, tool: 'ccng_read_worker', arguments: {} } }), false);
  assert.equal(f.reads.length, 0); assert.equal(f.replies.length, 0, 'the retired idle thread is no longer an owned callback target');
});

test('terminal failed or malformed recommendations do not retry or authorize anything', async () => {
  for (const [text, status] of [['Not a recommendation.', 'completed'], [recommendation(), 'failed']]) {
    const f = fixture(); f.pool.reconcile([job(1)]); await waitFor(() => f.pool.snapshot('token-1').status === 'running');
    f.complete('token-1', text, status); f.pool.reconcile([job(1)]);
    assert.equal(f.pool.snapshot('token-1').status, 'failed'); assert.equal(f.ready.length, 0);
    assert.equal(f.calls.filter(call => call.method === 'turn/start').length, 1); assert.equal(f.replies.length, 0);
  }
});

test('a changed fingerprint or removed request invalidates all late reads and results before a replacement can run', async () => {
  const f = fixture(); f.pool.reconcile([job(1)]); await waitFor(() => f.pool.snapshot('token-1').status === 'running');
  const previous = f.pool.snapshot('token-1');
  f.pool.reconcile([job(1, { fingerprint: 'changed-request' })]);
  assert.equal(f.pool.snapshot('token-1').status, 'queued');
  assert.equal(f.pool.snapshots().filter(row => row.current === false)[0].status, 'running', 'stale request ownership does not erase native execution evidence');
  await f.pool.handleTool({ id: 'late-read', method: 'item/tool/call', params: { threadId: previous.threadId, turnId: previous.turnId, tool: 'ccng_read_worker', arguments: {} } });
  assert.equal(f.reads.length, 0); assert.equal(f.replies.at(-1).result.success, false);
  f.pool.notification({ method: 'item/completed', params: { threadId: previous.threadId, turnId: previous.turnId, item: { type: 'agentMessage', text: recommendation() } } });
  f.pool.notification({ method: 'turn/completed', params: { threadId: previous.threadId, turn: { id: previous.turnId, status: 'completed' } } });
  await waitFor(() => f.pool.snapshot('token-1').status === 'running');
  assert.equal(f.ready.length, 0);
  f.pool.reconcile([]); assert.equal(f.pool.snapshot('token-1'), null);
  assert.equal(f.pool.active.size, 1, 'removed native work remains owned until terminal proof');
});

test('pause holds completed recommendations, rejects reads and launches no work until explicit resume', async () => {
  const f = fixture(); f.pool.reconcile([job(1)]); await waitFor(() => f.pool.snapshot('token-1').status === 'running');
  f.pool.setPaused(true); await f.pool.handleTool(f.toolCall('token-1'));
  assert.equal(f.reads.length, 0); assert.equal(f.replies.at(-1).result.success, false);
  f.pool.reconcile([job(1), job(2)]); f.complete('token-1');
  assert.equal(f.ready.length, 0); assert.equal(f.pool.snapshot('token-1').status, 'ready');
  assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 1);
  assert.equal(f.calls.some(call => call.method === 'turn/interrupt'), false);
  f.pool.setPaused(false); await waitFor(() => f.pool.snapshot('token-2').status === 'running');
  assert.equal(f.ready.length, 1);
});

test('startup/request/epoch eligibility gates launches and late result delivery without changing permissions', async () => {
  let eligible = false; const f = fixture({ canRun: () => eligible });
  f.pool.reconcile([job(1)]); assert.equal(f.calls.length, 0);
  eligible = true; f.pool.reconcile([job(1)]); await waitFor(() => f.pool.snapshot('token-1').status === 'running');
  eligible = false; f.complete('token-1');
  assert.equal(f.ready.length, 0); assert.equal(f.pool.snapshot('token-1').status, 'ready');
  f.pool.reconcile([]); eligible = true; f.pool.setPaused(false);
  assert.equal(f.ready.length, 0, 'removed/manual requests do not reappear merely because an external gate changes');
});

test('connection loss retains exact owned unknown runs and new-epoch eligibility blocks their late recommendations', async () => {
  let eligible = true; const f = fixture({ canRun: () => eligible });
  f.pool.reconcile([job(1)]); await waitFor(() => f.pool.snapshot('token-1').status === 'running');
  const run = f.pool.snapshot('token-1');
  f.rpc.ready = false; f.pool.connectionLost('Synthetic native disconnect');
  assert.equal(f.pool.snapshot('token-1').status, 'unknown'); assert.equal(f.pool.active.size, 1);
  assert.equal(f.pool.snapshot('token-1').threadId, run.threadId); assert.equal(f.pool.snapshot('token-1').turnId, run.turnId);
  f.pool.reconcile([job(1)]); assert.equal(f.calls.filter(call => call.method === 'thread/start').length, 1);
  eligible = false; f.complete('token-1'); f.rpc.ready = true; await f.pool.inspectUnknown();
  assert.equal(f.ready.length, 0, 'terminal native evidence cannot bypass the new ownership epoch');
  assert.equal(f.pool.active.size, 0); assert.equal(f.pool.snapshot('token-1').status, 'ready');
  f.pool.reconcile([]); eligible = true; f.pool.setPaused(false);
  assert.equal(f.ready.length, 0);
});

test('unexpected native user requests remain pending and visible, including through stop and native turn completion', async () => {
  const f = fixture(); f.pool.reconcile([job(1)]); await waitFor(() => f.pool.snapshot('token-1').status === 'running');
  const run = f.pool.snapshot('token-1');
  const request = { id: 'human-checkpoint', method: 'item/commandExecution/requestApproval', params: { threadId: run.threadId, turnId: run.turnId, kind: 'humanCommand', command: 'Synthetic protected checkpoint' } };
  assert.equal(f.pool.handleRequest(request), true);
  assert.equal(f.pool.snapshot('token-1').status, 'blocked');
  assert.deepEqual(f.pool.snapshot('token-1').pendingNativeRequests, [{ id: 'human-checkpoint', method: request.method }]);
  f.pool.stop(); f.complete('token-1');
  assert.equal(f.replies.length, 0); assert.equal(f.calls.some(call => ['turn/interrupt', 'thread/archive'].includes(call.method)), false);
  assert.equal(f.pool.active.size, 1); assert.equal(f.ready.length, 0);
  f.pool.notification({ method: 'serverRequest/resolved', params: { threadId: run.threadId, requestId: 'human-checkpoint' } });
  assert.equal(f.pool.active.size, 0); assert.equal(f.ready.length, 0);
});

test('stop interrupts only exact confirmed owned analyses once and ignores their late recommendations', async () => {
  const f = fixture(); f.pool.reconcile([job(1)]); await waitFor(() => f.pool.snapshot('token-1').status === 'running');
  const run = f.pool.snapshot('token-1'); f.pool.stop(); f.pool.stop();
  assert.deepEqual(f.calls.filter(call => call.method === 'turn/interrupt'), [{ method: 'turn/interrupt', params: { threadId: run.threadId, turnId: run.turnId } }]);
  f.complete('token-1'); f.pool.reconcile([job(2)]);
  assert.equal(f.ready.length, 0); assert.equal(f.pool.active.size, 0); assert.equal(f.pool.snapshot('token-1').status, 'stopped');
});

test('confirmed archival retires only the exact inactive owned thread and reports the acknowledgement truthfully', async () => {
  const f = fixture(); f.pool.reconcile([job(1)]); await waitFor(() => f.pool.snapshot('token-1').status === 'running');
  const run = f.pool.snapshot('token-1'); f.complete('token-1');
  await waitFor(() => f.pool.snapshot('token-1').cleanupStatus === 'archive-confirmed');
  assert.equal(f.pool.snapshot('token-1').cleanupConfirmedAt, 1000);
  assert.equal(f.pool.hasThread(run.threadId), false); assert.equal(f.pool.threads.size, 0);
  assert.equal(f.pool.snapshot('token-1').status, 'ready', 'archive acknowledgement does not replace the actual terminal result');
});

test('unsupported terminal archival keeps current evidence but removed terminal jobs do not grow the ownership map', async () => {
  const f = fixture({ call: async method => { if (method === 'thread/archive') throw new Error('Synthetic archive unsupported'); } });
  for (let index = 0; index < 12; index++) {
    const current = job(index), token = current.reviewToken;
    f.pool.reconcile([current]); await waitFor(() => f.pool.snapshot(token).status === 'running');
    f.complete(token); await waitFor(() => f.pool.snapshot(token).cleanupStatus === 'failed');
    assert.match(f.pool.snapshot(token).cleanupError, /unsupported/);
    assert.equal(f.pool.threads.size, 1, 'only the current terminal job retains fallback context');
    f.pool.reconcile([]);
    assert.equal(f.pool.threads.size, 0); assert.equal(f.pool.active.size, 0);
  }
});

test('an unexpected native request arriving during archival prevents ownership retirement', async () => {
  const archive = gate();
  const f = fixture({ call: async method => { if (method === 'thread/archive') { await archive.promise; return {}; } } });
  f.pool.reconcile([job(1)]); await waitFor(() => f.pool.snapshot('token-1').status === 'running');
  const run = f.pool.snapshot('token-1'); f.complete('token-1');
  f.pool.handleRequest({ id: 'late-native-gate', method: 'item/commandExecution/requestApproval', params: { threadId: run.threadId, turnId: run.turnId } });
  archive.release(); await waitFor(() => f.pool.snapshot('token-1').cleanupStatus === 'archive-confirmed');
  f.pool.reconcile([]);
  assert.equal(f.pool.hasThread(run.threadId), true); assert.equal(f.replies.length, 0);
});

test('ownership pruning never drops unknown native activity or an unresolved native request', async () => {
  const f = fixture({ call: async method => { if (method === 'turn/start') throw new Error('Synthetic unknown turn'); } });
  f.pool.reconcile([job(1)]); await waitFor(() => f.pool.snapshot('token-1').status === 'unknown');
  const unknown = f.pool.snapshot('token-1'); f.pool.reconcile([]);
  assert.equal(f.pool.hasThread(unknown.threadId), true); assert.equal(f.pool.active.size, 1);
  const blocked = fixture(); blocked.pool.reconcile([job(2)]); await waitFor(() => blocked.pool.snapshot('token-2').status === 'running');
  const run = blocked.pool.snapshot('token-2');
  blocked.pool.handleRequest({ id: 'pending-human', method: 'item/commandExecution/requestApproval', params: { threadId: run.threadId, turnId: run.turnId } });
  blocked.complete('token-2'); blocked.pool.reconcile([]);
  assert.equal(blocked.pool.hasThread(run.threadId), true); assert.equal(blocked.pool.active.size, 1);
  assert.equal(blocked.replies.length, 0);
});

test('elapsed time flags unknown progress but retains ownership until actual terminal evidence', async () => {
  const f = fixture({ timeoutMs: 100 }); f.pool.reconcile([job(1)]); await waitFor(() => f.pool.snapshot('token-1').status === 'running');
  f.advance(101); f.pool.reconcile([job(1)]);
  assert.equal(f.pool.snapshot('token-1').status, 'unknown'); assert.equal(f.pool.active.size, 1);
  assert.equal(f.calls.filter(call => call.method === 'turn/start').length, 1);
  f.complete('token-1'); assert.equal(f.ready.length, 1); assert.equal(f.pool.active.size, 0);
});

test('recommendation parsing requires bounded plain JSON with user references for an approve recommendation', () => {
  assert.equal(parseReviewRecommendation(recommendation()).decision, 'approve');
  assert.equal(parseReviewRecommendation(recommendation({ decision: 'ask', rationale: 'Request: Inspect source.\nConcern: Target unknown.\nNext: Choose target.', authorizationMessageId: null, authorizationQuote: null })).decision, 'ask');
  for (const text of ['```json\n' + recommendation() + '\n```', '{}', recommendation({ decision: 'approved' }), recommendation({ authorizationMessageId: null }), recommendation({ authorizationQuote: null }), recommendation({ rationale: 'x'.repeat(1201) }), recommendation({ extra: true })]) {
    assert.throws(() => parseReviewRecommendation(text));
  }
});
