export const PROGRESS_UPDATER_SOURCE = 'command-center-progress-updater';
const allowedTools = new Set(['ccng_read_worker', 'ccng_publish_progress']);

/** One native sidebar updater. Its publications are UI evidence, never task
 * changes or approval authority. The caller's existing cadence drives work. */
export class ProgressUpdater {
  constructor({ rpc, tools, instructions, nativeOptions, current, execute, changed = () => {}, now = () => Date.now() }) {
    if (!Array.isArray(tools) || tools.some(tool => tool.type !== 'function' || !allowedTools.has(tool.name))) throw new Error('Progress updater tools must be the bounded read/publish subset.');
    Object.assign(this, { rpc, tools, instructions, nativeOptions, current, execute, changed, now });
    this.toolNames = new Set(tools.map(tool => tool.name));
    this.jobs = new Map(); this.finished = new Map(); this.threads = new Map();
    this.active = null; this.paused = false; this.stopped = false;
    this.disconnected = () => { if (this.active) this.problem(this.active, 'The progress updater connection was lost; its execution outcome is unknown.'); };
    rpc.on?.('disconnected', this.disconnected);
  }
  enqueue(job) {
    if (this.stopped || !job?.workerId || !job.fingerprint || this.finished.get(job.workerId) === job.fingerprint) return;
    if (this.active?.job.workerId === job.workerId && this.active.job.fingerprint === job.fingerprint) return;
    this.jobs.set(job.workerId, job);
  }
  eligible(run) { return !this.stopped && !this.paused && this.rpc.ready && this.current(run.job); }
  snapshot() {
    const run = this.active;
    return { queued: this.jobs.size, ...(run ? {
      status: run.status, workerId: run.job.workerId, threadId: run.threadId || null, turnId: run.turnId || null,
      startedAt: run.startedAt, lastProgressAt: run.lastProgressAt || null, lastResult: run.lastResult || null,
      lastNativeCheckAt: run.lastNativeCheckAt || null, lastNativeStatus: run.lastNativeStatus || null,
      lastNativeCheckError: run.lastNativeCheckError || null,
      error: run.error || null, pendingNativeRequests: [...run.requests].map(([id, method]) => ({ id, method }))
    } : { status: this.error ? 'failed' : 'idle', error: this.error || null }) };
  }
  problem(run, message, status = 'unknown') {
    if (status === 'unknown' && (run.status !== status || run.error !== message)) run.unknownVersion = (run.unknownVersion || 0) + 1;
    run.status = status; run.error = message; this.error = message; this.changed();
  }
  pump() {
    if (this.stopped || this.paused || !this.rpc.ready) return;
    if (this.active) { void this.inspectUnknown(); return; }
    for (const [id, job] of this.jobs) {
      this.jobs.delete(id);
      if (!this.current(job)) continue;
      const run = { job, status: 'starting', startedAt: this.now(), requests: new Map(), completed: new Map(), pendingTools: [], reads: 0 };
      this.active = run; void this.start(run); break;
    }
  }
  async inspectUnknown() {
    const run = this.active;
    if (!run || run.requests.size || !this.rpc.ready) return;
    // Reuse the caller's existing event cadence, never a helper-owned timer.
    // Age only marks missing progress; it never frees or restarts a native slot.
    if (run.status === 'running' && this.now() - (run.lastProgressAt ?? run.startedAt) >= 300000) {
      this.problem(run, 'Sidebar updater progress is unknown; inspect its native outcome before starting another.');
    }
    if (run.status !== 'unknown' || run.inspecting || run.checkedUnknownVersion === run.unknownVersion) return;
    run.checkedUnknownVersion = run.unknownVersion;
    if (!run.threadId) { run.lastNativeCheckError = 'Native thread identity is unknown; execution cannot be checked safely.'; this.changed(); return; }
    run.inspecting = true; run.lastNativeCheckAt = this.now();
    try {
      const { thread } = await this.rpc.call('thread/read', { threadId: run.threadId, includeTurns: true });
      if (this.active !== run || thread?.id !== run.threadId) throw new Error('The native progress-helper identity was not confirmed.');
      run.lastNativeStatus = thread.status?.type || 'unknown'; run.lastNativeCheckError = null;
      const terminal = run.confirmed && thread.turns?.find(turn => turn.id === run.turnId && ['completed', 'failed', 'interrupted'].includes(turn.status));
      if (terminal) { run.completed.set(terminal.id, terminal); this.finish(run); }
    } catch (error) { run.lastNativeCheckError = error.message; }
    finally { run.inspecting = false; this.changed(); }
  }
  async start(run) {
    let stage = 'options';
    try {
      const { turnOptions = {}, ...options } = await this.nativeOptions(run.job);
      if (!this.eligible(run)) { this.release(run); return; }
      stage = 'thread/start';
      const started = await this.rpc.call('thread/start', { ...options, cwd: run.job.cwd, sandbox: 'read-only', developerInstructions: this.instructions,
        threadSource: PROGRESS_UPDATER_SOURCE, ephemeral: true, dynamicTools: this.tools });
      if (!started?.thread?.id || this.threads.has(started.thread.id)) throw new Error('The progress updater thread identity was not confirmed.');
      run.threadId = started.thread.id; this.threads.set(run.threadId, run); run.nativeIdle = started.thread.status?.type === 'idle';
      if (started.sandbox?.type !== 'readOnly') throw new Error('The progress updater read-only sandbox was not confirmed.');
      if (!this.eligible(run)) {
        if (!run.nativeIdle) throw new Error('The progress updater became ineligible without confirmed idle state.');
        this.release(run); return;
      }
      stage = 'turn/start'; run.turnRequested = true;
      const answer = await this.rpc.call('turn/start', { ...turnOptions, threadId: run.threadId, input: [{ type: 'text', text: JSON.stringify(run.job.context), text_elements: [] }] });
      if (!answer?.turn?.id) throw new Error('The progress updater turn identity was not confirmed.');
      run.turnId = answer.turn.id; run.confirmed = true;
      if (run.messageActivity?.turnId === run.turnId) this.messageProgress(run, run.messageActivity.at);
      if (!run.requests.size && run.status !== 'unknown') run.status = 'running';
      for (const message of run.pendingTools.splice(0)) void this.handleTool(message);
      if (this.stopped) this.interrupt(run);
      this.finish(run); this.changed();
    } catch (error) {
      if (stage === 'options' || (!run.turnRequested && run.threadId && run.nativeIdle)) { this.problem(run, error.message, 'failed'); this.release(run); }
      else this.problem(run, error.message);
      for (const message of run.pendingTools.splice(0)) this.reply(message, false, 'Progress updater start was not confirmed; no tool was executed.');
    }
  }
  hasThread(id) { return this.threads.has(id); }
  handleRequest(message) {
    const run = this.threads.get(message.params?.threadId); if (!run) return false;
    if (message.method === 'item/tool/call') { void this.handleTool(message); return true; }
    run.requests.set(message.id, message.method);
    this.problem(run, 'The progress updater has a native request requiring explicit handling.', 'blocked');
    return true;
  }
  reply(message, success, value) {
    try { this.rpc.respond(message.id, { success, contentItems: [{ type: 'inputText', text: success ? JSON.stringify(value) : String(value) }] }); }
    catch (error) { const run = this.threads.get(message.params?.threadId); if (run) this.problem(run, 'Progress tool response delivery is unconfirmed: ' + error.message); }
  }
  async handleTool(message) {
    const p = message.params || {}, run = this.threads.get(p.threadId);
    if (!run) return;
    if (this.active !== run || !this.eligible(run) || run.requests.size || !this.toolNames.has(p.tool)) { this.reply(message, false, 'This progress updater cannot execute that tool for a current worker.'); return; }
    if (!run.confirmed) {
      if (run.turnRequested && run.status !== 'unknown' && run.pendingTools.length < 4) run.pendingTools.push(message);
      else this.reply(message, false, 'The progress updater turn is not confirmed.');
      return;
    }
    if (p.turnId !== run.turnId || p.arguments?.agentId !== run.job.workerId) { this.reply(message, false, 'This tool belongs to a different progress worker or turn.'); return; }
    if (p.tool === 'ccng_read_worker' && ++run.reads > 3) { this.reply(message, false, 'This update already used its bounded worker-history reads. Use the delivered evidence.'); return; }
    const publication = p.tool === 'ccng_publish_progress';
    if (publication && (run.published || run.publishing)) { this.reply(message, false, 'This update already published progress or has a publication in flight.'); return; }
    if (publication) run.publishing = true;
    run.lastProgressAt = this.now(); run.lastResult = 'Bound progress tool requested: ' + p.tool;
    try {
      const result = await this.execute(run.job, p);
      if (!this.eligible(run) || this.active !== run || p.turnId !== run.turnId) throw new Error('The worker changed while progress evidence was read.');
      if (publication) run.published = true;
      run.lastProgressAt = this.now(); run.lastResult = 'Bound progress tool completed: ' + p.tool;
      this.reply(message, true, result);
    } catch (error) { this.reply(message, false, error.message); }
    finally { if (publication) run.publishing = false; }
    this.changed();
  }
  notification({ method, params: p = {} }) {
    const run = this.threads.get(p.threadId || p.thread?.id); if (!run) return false;
    const activity = (method === 'item/completed' && p.item?.type === 'agentMessage' && p.item.text?.trim())
      || (method === 'item/agentMessage/delta' && typeof p.delta === 'string' && p.delta.length);
    if (activity && typeof p.turnId === 'string') {
      if (run.confirmed && p.turnId === run.turnId) this.messageProgress(run, this.now());
      else if (!run.confirmed) run.messageActivity = { turnId: p.turnId, at: this.now() };
    }
    if (method === 'serverRequest/resolved') { run.requests.delete(p.requestId); if (!run.requests.size && run.status === 'blocked') { run.status = 'running'; run.error = null; } }
    if (method === 'turn/completed' && p.turn?.id) run.completed.set(p.turn.id, p.turn);
    if (method === 'thread/closed' && this.active === run && !run.completed.has(run.turnId)) this.problem(run, 'The progress updater closed without a confirmed terminal outcome.');
    this.finish(run); this.changed(); return true;
  }
  messageProgress(run, at) {
    run.lastProgressAt = at; run.lastResult = 'Bound sidebar assistant activity received; terminal outcome remains unconfirmed.';
  }
  finish(run) {
    const terminal = run.confirmed && run.completed.get(run.turnId);
    if (this.active !== run || !terminal || run.requests.size) return;
    if (terminal.status === 'completed' && this.current(run.job)) { this.finished.set(run.job.workerId, run.job.fingerprint); this.error = null; }
    else if (terminal.status !== 'completed') this.error = terminal.error?.message || 'The progress update did not complete successfully.';
    this.release(run);
  }
  release(run) {
    if (this.active !== run) return;
    this.active = null;
    if (run.threadId && !run.requests.size && (!run.turnRequested || run.completed.has(run.turnId))) {
      void this.rpc.call('thread/archive', { threadId: run.threadId }).then(() => {
        if (!run.requests.size && this.threads.get(run.threadId) === run) this.threads.delete(run.threadId);
      }, error => { this.error = 'Progress updater cleanup failed: ' + error.message; this.changed(); });
    }
    this.pump(); this.changed();
  }
  closed(id) { this.jobs.delete(id); this.finished.delete(id); }
  setPaused(paused) { this.paused = !!paused; if (!this.paused) this.pump(); this.changed(); }
  stop() {
    this.stopped = true; this.jobs.clear(); this.rpc.removeListener?.('disconnected', this.disconnected);
    this.interrupt(this.active);
  }
  interrupt(run) {
    // This role has no execution tools. A known turn without a human request can
    // be interrupted on shutdown; unknown starts and native decisions stay owned.
    if (run?.confirmed && run.turnId && !run.requests.size && !run.interruptSent) {
      run.interruptSent = true;
      void this.rpc.call('turn/interrupt', { threadId: run.threadId, turnId: run.turnId }).catch(error => this.problem(run, 'Stopping the progress updater is unconfirmed: ' + error.message));
    }
  }
}
