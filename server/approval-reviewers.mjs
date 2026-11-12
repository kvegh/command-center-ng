export const APPROVAL_REVIEWER_SOURCE = 'command-center-approval-reviewer';
export const APPROVAL_REVIEWER_LIMIT = 2;
const readTools = new Set(['ccng_list_workers', 'ccng_read_worker', 'ccng_read_project_file', 'ccng_read_approval_source']);
const textInput = text => [{ type: 'text', text, text_elements: [] }];
const fail = message => new Error(message);

export function parseReviewRecommendation(text) {
  if (typeof text !== 'string' || text.length > 16000) throw fail('The reviewer did not return a bounded JSON recommendation.');
  let value;
  try { value = JSON.parse(text); } catch { throw fail('The reviewer did not return a JSON recommendation.'); }
  const keys = ['decision', 'rationale', 'authorizationMessageId', 'authorizationQuote'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))
    || !['approve', 'decline', 'ask'].includes(value.decision) || typeof value.rationale !== 'string' || !value.rationale.trim() || value.rationale.length > 1200
    || ![value.authorizationMessageId, value.authorizationQuote].every(part => part === null || typeof part === 'string')
    || (value.authorizationMessageId?.length || 0) > 500 || (value.authorizationQuote?.length || 0) > 500
    || (value.decision === 'approve' && (!value.authorizationMessageId?.trim() || !value.authorizationQuote?.trim()))) {
    throw fail('The reviewer recommendation has invalid decision, rationale or user-authority references.');
  }
  return { ...value, rationale: value.rationale.trim() };
}

/** Two read-only native analyses. Results are evidence for the main Coordinator,
 * never an approval answer or a substitute for its final live-request checks. */
export class ApprovalReviewers {
  constructor({ rpc, nativeOptions, readTool, onReady = () => {}, onError = () => {}, changed = () => {}, instructions, tools, canRun = () => true, now = () => Date.now(), timeoutMs = 300000 }) {
    if (!Array.isArray(tools) || tools.some(tool => tool.type !== 'function' || !readTools.has(tool.name))) throw fail('Reviewer tools must be the read-only Coordinator subset.');
    this.rpc = rpc; this.nativeOptions = nativeOptions; this.readTool = readTool; this.onReady = onReady; this.onError = onError; this.changed = changed;
    this.instructions = instructions; this.tools = tools; this.toolNames = new Set(tools.map(tool => tool.name)); this.canRun = canRun; this.now = now; this.timeoutMs = timeoutMs;
    this.jobs = new Map(); this.active = new Set(); this.threads = new Map(); this.paused = false; this.stopped = false;
  }
  current(run) { return this.jobs.get(run.job.reviewToken) === run; }
  allowed(run) { return !this.stopped && !this.paused && this.rpc.ready && this.current(run) && this.canRun(run.job); }
  queuedRun(job) { return { job: structuredClone(job), status: 'queued', candidates: new Map(), completions: new Map(), requests: new Map(), pendingTools: [] }; }
  snapshot(token) {
    const run = this.jobs.get(token); if (!run) return null;
    return this.snapshotRun(run);
  }
  snapshots() { return [...new Set([...this.jobs.values(), ...this.active])].map(run => this.snapshotRun(run)); }
  snapshotRun(run) {
    return { reviewToken: run.job.reviewToken, fingerprint: run.job.fingerprint, current: this.current(run), active: this.active.has(run), status: run.status, threadId: run.threadId || null, turnId: run.turnId || null,
      startedAt: run.startedAt ?? null, finishedAt: run.finishedAt ?? null, error: run.error || null, recommendation: run.recommendation || null,
      lastProgressAt: run.lastProgressAt ?? null, lastResult: run.lastResult || null,
      cleanupError: run.cleanupError || null,
      cleanupStatus: run.cleanupStatus || null, cleanupConfirmedAt: run.cleanupConfirmedAt ?? null,
      callbackError: run.callbackError || null,
      lastNativeStatus: run.lastNativeStatus || null, lastNativeCheckAt: run.lastNativeCheckAt ?? null,
      lastNativeCheckError: run.lastNativeCheckError || (run.status === 'unknown' && !run.threadId ? 'Native thread identity is unavailable; execution outcome cannot be inspected.' : null),
      pendingNativeRequests: [...run.requests].map(([id, method]) => ({ id, method })) };
  }
  error(run, message, status = 'unknown') {
    if (status === 'unknown' && (run.status !== status || run.error !== message)) run.unknownVersion = (run.unknownVersion || 0) + 1;
    run.status = status; run.error = message;
    try { this.onError(run.job, message, this.snapshotRun(run)); }
    catch (error) { run.callbackError = error.message; }
    this.changed();
  }
  reconcile(jobs) {
    if (this.stopped) return;
    const desired = new Map();
    for (const job of jobs) {
      if (!job || typeof job.reviewToken !== 'string' || !job.reviewToken || typeof job.fingerprint !== 'string' || !job.fingerprint || desired.has(job.reviewToken)) continue;
      const previous = this.jobs.get(job.reviewToken);
      const run = previous?.job.fingerprint === job.fingerprint ? previous : this.queuedRun(job);
      desired.set(job.reviewToken, run);
    }
    for (const [token, run] of this.jobs) if (desired.get(token) !== run && !this.active.has(run)) run.status = 'stale';
    this.jobs = desired;
    this.pruneThreads();
    // The existing caller's event cadence performs this audit. An aged/unknown
    // native run still owns its slot; elapsed time never proves it has stopped.
    for (const run of this.active) if (run.startedAt != null && this.now() - (run.lastProgressAt ?? run.startedAt) >= this.timeoutMs && !run.timeoutReported) {
      run.timeoutReported = true; this.error(run, 'Reviewer progress is unknown after the analysis time limit; inspect its native thread before retrying.');
    }
    for (const run of this.jobs.values()) this.deliver(run);
    this.launch(); this.changed();
  }
  async inspectUnknown() {
    if (!this.rpc.ready) return;
    await Promise.all([...this.active].filter(run => run.status === 'unknown' && run.threadId && run.checkedUnknownVersion !== run.unknownVersion).map(async run => {
      run.checkedUnknownVersion = run.unknownVersion; run.lastNativeCheckAt = this.now();
      try {
        const result = await this.rpc.call('thread/read', { threadId: run.threadId, includeTurns: false });
        if (result.thread?.id !== run.threadId) throw fail('The native status read returned a different thread identity.');
        run.lastNativeStatus = result.thread.status || null; run.lastNativeCheckError = null;
      } catch (error) { run.lastNativeCheckError = error.message; }
      // Idle/not-loaded is status evidence, never proof of the analysis outcome.
      this.changed();
    }));
  }
  connectionLost(message = 'The native reviewer connection was lost; its execution outcome is unknown.') {
    for (const run of this.active) {
      run.unknownVersion = (run.unknownVersion || 0) + 1;
      this.error(run, message);
    }
  }
  requeueBeforeTurn(run) {
    if (this.current(run) && !this.stopped) this.jobs.set(run.job.reviewToken, this.queuedRun(run.job));
    run.status = this.stopped ? 'stopped' : 'stale'; this.release(run);
  }
  launch() {
    if (this.stopped || this.paused || !this.rpc.ready) return;
    for (const run of this.jobs.values()) {
      if (this.active.size >= APPROVAL_REVIEWER_LIMIT) break;
      if (run.status !== 'queued' || !this.allowed(run) || [...this.active].some(active => active.job.reviewToken === run.job.reviewToken)) continue;
      run.status = 'starting'; run.startedAt = this.now(); this.active.add(run);
      void this.start(run);
    }
  }
  async start(run) {
    let stage = 'options';
    try {
      const { turnOptions = {}, ...options } = await this.nativeOptions(run.job);
      if (!this.allowed(run)) { this.requeueBeforeTurn(run); return; }
      stage = 'thread/start';
      const started = await this.rpc.call('thread/start', { ...options, cwd: run.job.cwd, sandbox: 'read-only', developerInstructions: this.instructions,
        threadSource: APPROVAL_REVIEWER_SOURCE, ephemeral: true, dynamicTools: this.tools });
      if (typeof started?.thread?.id !== 'string' || !started.thread.id || this.threads.has(started.thread.id)) throw fail('The native reviewer thread identity was not confirmed.');
      run.threadId = started.thread.id; this.threads.set(run.threadId, run);
      run.nativeStartIdle = started.thread.status?.type === 'idle';
      if (started.sandbox?.type !== 'readOnly') throw fail('The native reviewer read-only sandbox was not confirmed.');
      if (!this.allowed(run)) {
        if (!run.nativeStartIdle) throw fail('The reviewer became ineligible before its native idle state was confirmed.');
        this.requeueBeforeTurn(run); return;
      }
      stage = 'turn/start'; run.turnRequested = true;
      const result = await this.rpc.call('turn/start', { ...turnOptions, threadId: run.threadId, input: textInput(JSON.stringify({
        request: run.job.request, context: run.job.context, reviewToken: run.job.reviewToken, fingerprint: run.job.fingerprint,
        instruction: 'Analyze only this exact request under the supplied shared review rules. Return JSON only with decision (approve, ask or decline), rationale, authorizationMessageId and authorizationQuote. Use null authority references when none exist. This is a recommendation; only the main Coordinator may approve. Keep Request/Concern/Next when you cannot approve.'
      })) });
      if (typeof result?.turn?.id !== 'string' || !result.turn.id) throw fail('The native reviewer turn identity was not confirmed.');
      run.turnId = result.turn.id; run.confirmed = true;
      if (run.status !== 'stale' && run.status !== 'blocked') run.status = 'running';
      for (const message of run.pendingTools.splice(0)) void this.handleTool(message);
      this.finish(run);
      if (this.stopped) void this.interrupt(run);
      this.changed();
    } catch (error) {
      // A rejected/timed-out start can have executed remotely. Never release an
      // uncertain slot or retry simply because no native ID was returned.
      if (stage === 'options' || (stage === 'thread/start' && run.nativeStartIdle && !run.turnRequested)) { this.error(run, error.message, 'failed'); this.release(run); }
      else this.error(run, error.message);
      for (const message of run.pendingTools.splice(0)) this.reply(message, false, 'Reviewer start was not confirmed; this read was not executed.');
    }
  }
  hasThread(id) { return this.threads.has(id); }
  handleRequest(message) {
    const run = this.threads.get(message.params?.threadId); if (!run) return false;
    if (message.method === 'item/tool/call') { void this.handleTool(message); return true; }
    // Preserve the exact native request outside this module. Never respond,
    // refuse or clear a human/permission gate merely to free a reviewer slot.
    run.requests.set(message.id, message.method);
    this.error(run, 'The reviewer is waiting for a native request that needs explicit handling.', 'blocked');
    return true;
  }
  reply(message, success, value) {
    try { this.rpc.respond(message.id, { success, contentItems: [{ type: 'inputText', text: typeof value === 'string' && !success ? value : JSON.stringify(value) }] }); }
    catch (error) { const run = this.threads.get(message.params?.threadId); if (run) this.error(run, 'Reviewer tool response delivery was not confirmed: ' + error.message); }
  }
  async handleTool(message) {
    const params = message.params || {}; const run = this.threads.get(params.threadId);
    if (!run || message.method !== 'item/tool/call') return false;
    if (!this.allowed(run) || !this.active.has(run) || run.requests.size || !this.toolNames.has(params.tool)) {
      this.reply(message, false, 'This reviewer cannot execute that read for a current active request.'); return true;
    }
    if (!run.confirmed) {
      if (!run.turnRequested || run.status === 'unknown' || run.pendingTools.length >= 8) this.reply(message, false, 'The reviewer turn is not confirmed.');
      else run.pendingTools.push(message);
      return true;
    }
    if (params.turnId !== run.turnId) { this.reply(message, false, 'This reviewer turn is no longer current.'); return true; }
    run.lastProgressAt = this.now(); run.lastResult = 'Bound read requested: ' + params.tool;
    try {
      const value = await this.readTool(run.job, { tool: params.tool, arguments: params.arguments, threadId: params.threadId, turnId: params.turnId });
      if (!this.allowed(run) || !this.active.has(run) || params.turnId !== run.turnId) throw fail('This review changed or paused during its read; the result was not delivered.');
      run.lastProgressAt = this.now(); run.lastResult = 'Bound read completed: ' + params.tool;
      this.reply(message, true, value);
    } catch (error) { this.reply(message, false, error.message); }
    return true;
  }
  notification({ method, params = {} }) {
    const run = this.threads.get(params.threadId || params.thread?.id); if (!run) return false;
    if (method === 'serverRequest/resolved') {
      run.requests.delete(params.requestId);
      if (!run.requests.size && run.status === 'blocked') { run.status = 'running'; run.error = null; this.finish(run); }
    }
    if (method === 'item/completed' && params.item?.type === 'agentMessage' && params.item.phase !== 'commentary' && typeof params.turnId === 'string') {
      run.lastProgressAt = this.now(); run.lastResult = 'Analyst message received; terminal outcome not yet confirmed.';
      run.candidates.set(params.turnId, params.item.text); this.finish(run);
    }
    if (method === 'turn/completed' && typeof params.turn?.id === 'string') {
      run.completions.set(params.turn.id, params.turn); this.finish(run);
    }
    if (method === 'thread/closed' && this.active.has(run) && !run.completions.has(run.turnId)) this.error(run, 'The reviewer thread closed without a confirmed terminal analysis outcome.');
    this.changed(); return true;
  }
  finish(run) {
    const terminal = run.confirmed && run.completions.get(run.turnId);
    if (!terminal || !this.active.has(run) || run.requests.size) return;
    run.finishedAt = this.now();
    if (this.stopped || !this.current(run)) run.status = this.stopped ? 'stopped' : 'stale';
    else if (terminal.status !== 'completed') this.error(run, terminal.error?.message || 'The reviewer analysis did not complete successfully.', 'failed');
    else {
      try { run.recommendation = parseReviewRecommendation(run.candidates.get(run.turnId)); run.status = 'ready'; run.error = null; }
      catch (error) { this.error(run, error.message, 'failed'); }
    }
    this.release(run); this.deliver(run);
  }
  deliver(run) {
    if (run.status !== 'ready' || run.delivered || !this.allowed(run)) return;
    run.delivered = true;
    try { this.onReady(run.job, run.recommendation, this.snapshotRun(run)); }
    catch (error) { run.callbackError = error.message; this.changed(); }
  }
  release(run) {
    this.active.delete(run);
    // Only an acknowledged idle/terminal thread is eligible for cleanup.
    // Unknown starts, active native requests and uncertain turns stay owned.
    if (run.threadId && !run.requests.size && (!run.turnRequested || run.completions.has(run.turnId))) {
      run.cleanupStatus = 'pending';
      void this.rpc.call('thread/archive', { threadId: run.threadId }).then(() => {
        run.cleanupStatus = 'archive-confirmed'; run.cleanupConfirmedAt = this.now();
        // An archive acknowledgement is not proof of unloading. The separate
        // terminal/idle evidence and absence of native requests permit retirement.
        const terminal = !run.turnRequested || (run.confirmed && run.completions.has(run.turnId));
        if (this.threads.get(run.threadId) === run && !this.active.has(run) && !run.requests.size && terminal) this.threads.delete(run.threadId);
        this.changed();
      }, error => {
        run.cleanupStatus = 'failed'; run.cleanupError = error.message; this.pruneThreads(); this.changed();
      });
    }
    this.pruneThreads();
    this.launch(); this.changed();
  }
  pruneThreads() {
    for (const [id, run] of this.threads) {
      const terminal = !run.turnRequested || (run.confirmed && run.completions.has(run.turnId));
      if (!this.current(run) && !this.active.has(run) && !run.requests.size && terminal) this.threads.delete(id);
    }
  }
  setPaused(paused) {
    this.paused = !!paused;
    if (!this.paused && !this.stopped) { for (const run of this.jobs.values()) this.deliver(run); this.launch(); }
    this.changed();
  }
  async interrupt(run) {
    if (!this.active.has(run) || !run.confirmed || !run.turnId || run.requests.size || run.interruptSent) return;
    run.interruptSent = true;
    try { await this.rpc.call('turn/interrupt', { threadId: run.threadId, turnId: run.turnId }); }
    catch (error) { this.error(run, 'Stopping the reviewer analysis was not confirmed: ' + error.message); }
  }
  stop() {
    this.stopped = true;
    for (const run of this.jobs.values()) if (!this.active.has(run)) run.status = 'stopped';
    for (const run of this.active) void this.interrupt(run);
    this.changed();
  }
}
