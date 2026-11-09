import limits from './limits.json' with { type: 'json' };
import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { VERSION } from './version.mjs';
import { WORKER_BASE_INSTRUCTIONS, WORKER_REPORT_INSTRUCTIONS, reportTimingContext } from './worker-instructions.mjs';
import { isHumanRequest, manualRequestAnswer, nativeMessageQuestions } from './native-requests.mjs';
import { asyncQuestionView, currentAsyncQuestion, asyncQuestionReply, retainAsyncQuestionState, observeAsyncQuestionInput, retireAsyncQuestions, setAsyncQuestionDelivery, assertAsyncQuestionsAllowControl, hasOpenAsyncQuestions } from './async-question-replies.mjs';
import { isNativeToolApproval, nativeApprovalAnswer } from './approval-choices.mjs';
import { readModelCatalog, validateModelChoice } from './worker-models.mjs';
import { markInternalInput, reportMessageFlags } from './report-messages.mjs';
import { taskSummary, reportedPlan } from './task-summary.mjs';
import { BeadsTasks, sessionLabel } from './beads.mjs';
import { Coordinator, COORDINATOR_NAME, isCoordinatorThread } from './coordinator.mjs';
import { SUMMARY_LIMIT, SUMMARY_SCHEMA, summaryPrompt, readSummary } from './branch-summary.mjs';
import { BranchHandoffs } from './branch-handoff.mjs';
import { ClaudeSessions, isClaudeId } from './claude.mjs';
import { readEnvironmentInstructions, environmentInstructionContext } from './environment-instructions.mjs';
import { messageTime } from './message-time.mjs';
import { validateImages, codexImages, imageReferences, readInlineImage } from './image-input.mjs';

export const input = (text, images = []) => [...(text ? [{ type: 'text', text, text_elements: [] }] : []), ...images.map(image => ({ type: 'image', url: image.dataUrl }))];
const requestKey = (threadId, requestId) => JSON.stringify([threadId, requestId]);
export function statusOf(thread, requests = []) {
  if (requests.length || thread.status?.activeFlags?.some(flag => ['waitingOnApproval', 'waitingOnUserInput'].includes(flag))) return 'attention';
  return ({ active: 'running', idle: 'idle', notLoaded: 'offline', systemError: 'error' })[thread.status?.type] || 'offline';
}
function itemText(item) {
  if (item.type === 'agentMessage') return item.text;
  if (item.type === 'userMessage') return item.content?.filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (item.type === 'commandExecution') return item.command;
  if (item.type === 'mcpToolCall') return `${item.server} / ${item.tool}`;
  if (item.type === 'dynamicToolCall') return item.tool;
  if (item.type === 'fileChange') return `${item.changes?.length || 0} file change(s)`;
  if (item.type === 'webSearch') return item.query || 'Web search';
  if (item.type === 'plan') return item.text;
  return null;
}

function fileChangeContext(changes) {
  if (!Array.isArray(changes)) return null;
  const bounded = []; let budget = 32 * 1024 - 1024, truncated = changes.length > 32;
  const take = value => {
    if (typeof value !== 'string') { truncated = true; return ''; }
    let result = value.slice(0, Math.max(0, budget));
    let bytes = Buffer.byteLength(JSON.stringify(result));
    while (bytes > budget && result.length) { result = result.slice(0, Math.floor(result.length * Math.max(0, budget - 2) / bytes)); bytes = Buffer.byteLength(JSON.stringify(result)); }
    if (result.length !== value.length) truncated = true;
    budget = Math.max(0, budget - bytes); return result;
  };
  for (const change of changes.slice(0, 32)) {
    if (!change || typeof change.path !== 'string' || typeof change.diff !== 'string' || !['add', 'delete', 'update'].includes(change.kind?.type)) { truncated = true; continue; }
    if (budget < 128) { truncated = true; break; }
    const path = take(change.path), kind = { type: change.kind.type };
    if (kind.type === 'update') kind.move_path = change.kind.move_path == null ? null : take(change.kind.move_path);
    const diff = take(change.diff); bounded.push({ path, kind, diff }); budget = Math.max(0, budget - 64);
  }
  return { changes: bounded, totalChanges: changes.length, truncated, contentSha256: createHash('sha256').update(JSON.stringify(changes)).digest('hex'), notice: truncated ? `Showing ${bounded.length} of ${changes.length} files within the 32-file/32-KiB display limit. Some paths or diffs may be truncated; review remaining content in the native client.` : changes.length ? null : 'The native item lists no file changes.' };
}

function itemTime(item, previous, live) {
  const started = messageTime(item.startedAtMs);
  const completed = messageTime(item.completedAtMs);
  const prior = messageTime(previous?.timestamp);
  const native = started || (previous?.timestampSource === 'native' && prior) || (!prior && completed);
  const timestamp = native || prior || (live ? messageTime(Date.now()) : undefined);
  return timestamp ? { timestamp, timestampSource: native ? 'native' : 'received' } : {};
}

export class Workspace extends EventEmitter {
  constructor(rpc, { summaryTimeout = 120_000, answerTimeout = 10_000, recoveryTimeout = 2000, beads = new BeadsTasks(), coordinator = false, claude = null, handoffOptions } = {}) {
    super(); this.rpc = rpc; this.agents = new Map(); this.pending = new Map(); this.opening = new Set(); this.watched = new Set(); this.creating = 0; this.error = null;
    this.summaryJobs = new Map(); this.returnJobs = new Map(); this.summaryTimeout = summaryTimeout;
    this.handoffs = new BranchHandoffs(this, handoffOptions);
    this.workerReads = new Set(); this.beads = beads; this.trackerReads = new Map();
    this.answerJobs = new Map(); this.answerTimeout = answerTimeout;
    this.requestJobs = new Map(); this.recoveryTimeout = recoveryTimeout;
    this.coordinator = coordinator ? new Coordinator(this, typeof coordinator === 'object' ? coordinator : {}) : null;
    this.restoring = false; this.observedReads = new Map(); this.restoration = null;
    this.claude = claude === true ? new ClaudeSessions() : claude;
    this.claude?.on('change', id => { this.changed(); if (this.agents.has(id)) void this.coordinator?.flush(id); });
    this.claude?.on('completed', id => { if (this.agents.has(id)) { this.coordinator?.completed(id); void this.refreshTasks(id); } });
    this.claude?.on('assistantMessageCompleted', (id, message) => { if (this.agents.has(id)) this.coordinator?.reportMessageCompleted(id, message); });
    rpc.on('notification', message => this.notification(message));
    rpc.on('request', message => this.request(message));
    rpc.on('disconnected', message => {
      this.error = message;
      for (const job of this.answerJobs.values()) job.finish(Object.assign(new Error('Codex disconnected before confirming the answer. Check the native session.'), { status: 503 }));
      this.pending.clear(); for (const parent of this.agents.values()) for (const agent of this.requestContexts(parent, { includeUnverified: true })) if (agent.provider !== 'claude') { agent.questions = []; retireAsyncQuestions(agent, 'The native connection changed; this question is read-only.', 'disconnect'); if (agent !== parent) agent.lineageNeedsRefresh = true; agent.historyRevision = (agent.historyRevision || 0) + 1; for (const message of agent.messages) delete message.fileChangeContext; }
      this.changed();
    });
    rpc.on('connected', () => { this.error = null; this.changed(); });
  }
  changed() { this.emit('change'); }
  nativeActivity(agent, turnId) {
    if (!agent || agent.provider === 'claude') return;
    // Receipt of a worker event is evidence of an update, not model progress.
    // Late events from an earlier turn must not make the current turn look fresh.
    if (turnId && agent.turnId && turnId !== agent.turnId) return;
    agent.lastNativeEventAt = new Date().toISOString();
  }
  readyFor(agent) { return (typeof agent === 'string' ? isClaudeId(agent) : agent?.provider === 'claude') ? !!this.claude?.available : this.rpc.ready; }
  available() { return this.rpc.ready || !!this.claude?.available; }
  workerCount() { return [...this.agents.values()].filter(agent => agent.role !== 'coordinator').length; }
  workerSlots() { return this.workerCount() + [...this.opening].filter(id => id !== this.coordinator?.id).length + this.creating; }
  childRequestContext(parent, worker) {
    if (parent.role === 'coordinator' || parent.provider === 'claude' || typeof worker.id !== 'string' || !worker.id || worker.id === parent.id) return null;
    const open = this.agents.get(worker.id);
    if (open?.provider !== 'claude' && open?.thread.parentThreadId === parent.id) { Object.defineProperty(worker, 'requestContext', { configurable: true, value: open }); return open; }
    if (!worker.requestContext) Object.defineProperty(worker, 'requestContext', { configurable: true, value: { id: worker.id, nativeParentId: parent.id, name: worker.name, role: 'worker', provider: 'codex', cwd: parent.cwd, canSend: false, thread: { id: worker.id, status: { type: 'notLoaded' } }, messages: [], questions: [], tasks: [], workers: [], turnId: null } });
    if (open) { worker.requestContext.lineageNeedsRefresh = true; worker.requestContext.observeError = 'New native thread metadata does not verify this parent/subagent relationship.'; }
    return worker.requestContext;
  }
  requestContexts(parent, { includeUnverified = false } = {}) {
    const contexts = [], seen = new Set();
    const visit = context => {
      if (seen.has(context.id) || contexts.length >= 128) return;
      if (context !== parent) context.questions = [...this.pending.values()].filter(question => question.params.threadId === context.id);
      seen.add(context.id); contexts.push(context);
      if (context.role === 'coordinator' || context.provider === 'claude') return;
      for (const worker of context.workers || []) {
        const child = worker.requestContext;
        if (!child) continue;
        const open = this.agents.get(child.id);
        const matches = open?.provider !== 'claude' && open?.thread.parentThreadId === context.id;
        if (open && !matches) { child.lineageNeedsRefresh = true; child.observeError = 'New native thread metadata does not verify this parent/subagent relationship.'; }
        const current = matches ? open : child;
        if (includeUnverified || (!current.lineageNeedsRefresh && current.thread.parentThreadId === context.id)) visit(current);
      }
    };
    visit(parent); return contexts;
  }
  resolveRequestContext(parent, threadId = parent.id) {
    if (this.agents.get(parent.id) !== parent) throw Object.assign(new Error('The originating worker is no longer open.'), { status: 409 });
    const context = this.requestContexts(parent).find(context => context.id === threadId);
    if (!context) throw Object.assign(new Error('This request does not belong to a verified native subagent of this worker.'), { status: 409 });
    return context;
  }
  requestContextCurrent(parent, context) {
    return this.agents.get(parent.id) === parent && this.requestContexts(parent).some(current => current === context);
  }
  requestOwner(threadId, { includeUnverified = false } = {}) {
    const direct = this.agents.get(threadId); if (direct) return { parent: direct, context: direct };
    for (const parent of this.agents.values()) {
      const context = this.requestContexts(parent, { includeUnverified }).find(context => context.id === threadId);
      if (context) return { parent, context };
    }
    return null;
  }
  subagentViews(parent) {
    const verified = new Set(this.requestContexts(parent));
    return this.requestContexts(parent, { includeUnverified: true }).slice(1).map(context => {
      const valid = verified.has(context);
      const nativeStatus = statusOf(context.thread, valid ? context.questions : []);
      const status = nativeStatus === 'idle' && ['completed', 'failed', 'interrupted'].includes(context.finishedTurn?.status) ? context.finishedTurn.status : nativeStatus;
      return { id: context.id, name: context.name || 'Subagent', status, nativeStatus: context.thread.status, needsInput: valid && nativeStatus === 'attention', questions: valid ? context.questions.map(question => this.requestView(context, question)) : [], requestError: valid ? context.requestError || null : context.observeError || 'Verifying native subagent ownership. Requests stay open.', recoveringRequests: this.requestJobs.has(context.id) || this.workerReads.has(parent.id + ':' + context.id), detailError: context.observeError || null };
    });
  }
  backgroundRequests() {
    const workers = new Map();
    for (const question of this.pending.values()) if (!this.requestOwner(question.params.threadId)) {
      const id = question.params.threadId, previous = workers.get(id);
      workers.set(id, { id, name: 'Codex session', provider: 'codex', questionCount: (previous?.questionCount || 0) + 1 });
    }
    for (const agent of this.claude?.records.values() || []) if (!this.agents.has(agent.id) && agent.questions.length) workers.set(agent.id, { id: agent.id, name: agent.name, provider: 'claude', questionCount: agent.questions.length });
    return { backgroundQuestions: [...workers.values()].reduce((total, worker) => total + worker.questionCount, 0), backgroundWorkers: [...workers.values()] };
  }
  snapshot() {
    return { connected: this.available(), codexConnected: this.rpc.ready, claudeAvailable: !!this.claude?.available, claudeError: this.claude?.error || null, error: this.error, nativeWarning: this.nativeWarning || null, version: VERSION, restoration: this.restoration, handoffCompletions: this.handoffs.completions, coordinator: this.coordinator?.snapshot() || null, ...this.backgroundRequests(), agents: [...this.agents.values()].map(agent => { const subagents = this.subagentViews(agent); const ownStatus = this.readyFor(agent) ? (agent.observingOnly && agent.thread.status?.type === 'notLoaded' ? 'idle' : statusOf(agent.thread, agent.questions)) : 'offline'; return ({ ...agent, workers: [...(agent.workers || []).map(worker => ({ ...worker, ...subagents.find(child => child.id === worker.id) })), ...subagents.filter(child => !(agent.workers || []).some(worker => worker.id === child.id))], ownStatus, messages: agent.messages.map(message => { const { fileChangeContext: internal, ...visible } = message; if (visible.nativeQuestions) visible.nativeQuestions = visible.nativeQuestions.map(question => asyncQuestionView(agent, message, question, this.asyncQuestionHandoffBlocked(agent))); return imageReferences(agent.id, visible); }), questions: agent.questions.map(question => this.requestView(agent, question)), ...taskSummary(agent), reportState: this.coordinator?.reportState(agent.id) || null, reportSettingPending: !!this.coordinator?.deliveries.get(agent.id)?.some(row => row.kind === 'report-setting'), summarizing: this.summaryJobs.has(agent.id), returning: this.returnJobs.has(agent.id), recoveringRequests: this.requestJobs.has(agent.id), status: this.readyFor(agent) && subagents.some(child => child.needsInput) ? 'attention' : ownStatus, thread: undefined }); }) };
  }
  requestView(agent, question) {
    if (question.method !== 'item/fileChange/requestApproval') return question;
    const p = question.params, binding = { threadId: agent.id, turnId: p.turnId, itemId: p.itemId, type: 'fileChange' };
    const pending = this.pending.get(requestKey(agent.id, question.id)) === question && agent.questions.includes(question);
    const message = pending && p.threadId === agent.id && typeof p.turnId === 'string' && typeof p.itemId === 'string'
      ? agent.messages.findLast(row => row.id === p.itemId && row.turnId === p.turnId) : null;
    const context = message?.nativeType === 'fileChange' ? message.fileChangeContext : null;
    const notice = question.detailError || (message?.nativeType && message.nativeType !== 'fileChange' ? `The exact native item is ${message.nativeType}, not fileChange. No file diff was inferred.` : 'File paths and diff are not available for this exact native request yet. No answer has been sent.');
    return { ...question, nativeItem: context ? { ...binding, state: 'available', ...structuredClone(context) } : { ...binding, state: 'unavailable', changes: [], totalChanges: null, truncated: false, notice } };
  }
  requestContextFingerprint(agent, question) {
    const context = this.requestView(agent, question).nativeItem;
    return context ? JSON.stringify([context.threadId, context.turnId, context.itemId, context.state, context.contentSha256 || null]) : null;
  }
  agent(id) { const agent = this.agents.get(id); if (!agent) throw Object.assign(new Error('Open this agent first.'), { status: 404 }); return agent; }
  messageImage(id, messageId, index) {
    const agent = this.agent(id);
    if (!Number.isInteger(index) || index < 0) throw Object.assign(new Error('Image not found.'), { status: 404 });
    const image = agent.messages.find(message => message.id === messageId)?.images?.[index];
    if (!image) throw Object.assign(new Error('Image not found in this conversation.'), { status: 404 });
    const checked = readInlineImage(image.dataUrl);
    return { mimeType: checked.mimeType, bytes: Buffer.from(checked.dataUrl.slice(checked.dataUrl.indexOf(',') + 1), 'base64') };
  }
  async list(cursor, provider = 'codex') {
    if (provider === 'claude') { if (!this.claude) throw Object.assign(new Error('Local Claude support is unavailable.'), { status: 503 }); return this.claude.list(cursor); }
    if (provider !== 'codex') throw Object.assign(new Error('Choose Codex or Claude.'), { status: 400 });
    const result = await this.rpc.call('thread/list', { limit: 50, useStateDbOnly: true, ...(cursor ? { cursor } : {}) });
    return { agents: result.data.filter(t => !isCoordinatorThread(t)).map(t => ({ id: t.id, name: t.name || t.preview?.split('\n')[0]?.slice(0, 90) || 'Untitled agent', cwd: t.cwd, status: statusOf(t), parentId: t.parentThreadId || null, forkedFromId: t.forkedFromId || null })), nextCursor: result.nextCursor };
  }
  async open(id, { observeOnly = false } = {}) {
    if (this.agents.has(id)) return this.agent(id);
    const role = id === this.coordinator?.id ? 'coordinator' : 'worker';
    if (role === 'worker' && this.workerSlots() >= limits.maxWorkers) throw Object.assign(new Error(`All ${limits.maxWorkers} worker tabs are open. Close a tab to open another; its agent keeps running.`), { status: 409 });
    if (this.opening.has(id)) throw Object.assign(new Error('This agent is already opening.'), { status: 409 });
    this.opening.add(id);
    try {
      if (isClaudeId(id)) {
        if (!this.claude) throw Object.assign(new Error('Local Claude support is unavailable.'), { status: 503 });
        const agent = await this.claude.open(id); this.agents.set(id, agent); await this.refreshTasks(id); this.changed();
        if (this.coordinator && !this.restoring && this.rpc.ready) { void this.coordinator.ensure().catch(() => {}); this.coordinator.mark(id, 'Claude worker opened'); }
        return agent;
      }
      const observed = await this.rpc.call('thread/read', { threadId: id });
      if (!observed.thread) throw Object.assign(new Error('The saved conversation is unavailable.'), { status: 404 });
      if (role === 'worker' && isCoordinatorThread(observed.thread)) throw Object.assign(new Error('A coordinator conversation cannot be opened as a worker. Open a worker conversation instead.'), { status: 409 });
      if (role === 'coordinator' && !isCoordinatorThread(observed.thread)) throw Object.assign(new Error('The saved coordinator ID belongs to a worker or an unrecognized coordinator. Check the saved workspace before continuing.'), { status: 409 });
      // Native resume may replay requests before the awaiting continuation runs.
      this.watched.add(id);
      const { thread, instructionSources } = observeOnly ? observed : await this.rpc.call('thread/resume', { threadId: id, excludeTurns: true });
      const agent = { id, name: thread.name || 'Codex agent', goal: thread.name || thread.preview?.split('\n')[0] || 'No goal recorded', cwd: thread.cwd, model: thread.model || null, reasoningEffort: thread.reasoningEffort ?? null, thread, parentId: thread.forkedFromId || null, canSend: thread.canAcceptDirectInput !== false, messages: [], tasks: [], workers: [], questions: [], turnId: null, lastCompletedTurnId: null, olderCursor: null, activity: null, summary: null, reportIntervalMinutes: 0, reportError: null };
      agent.questions = [...this.pending.values()].filter(q => q.params.threadId === id);
      agent.role = role; agent.observingOnly = observeOnly; agent.instructionSources = instructionSources || [];
      this.agents.set(id, agent);
      try { await this.history(id); await this.refreshTasks(id); } catch (error) { this.agents.delete(id); throw error; }
      this.changed();
      if (role === 'worker' && this.coordinator && !this.restoring) { void this.coordinator.ensure().catch(() => {}); this.coordinator.mark(id, 'Worker opened'); }
      return agent;
    } finally { this.opening.delete(id); }
  }
  async activate(id, { force = false } = {}) {
    const agent = this.agent(id); if (!agent.observingOnly && !force) return;
    if (agent.provider === 'claude') return;
    if (agent.role === 'coordinator') return this.coordinator.activate({ force });
    const resumed = await this.rpc.call('thread/resume', { threadId: id, excludeTurns: true });
    agent.thread = resumed.thread; agent.instructionSources = resumed.instructionSources || [];
    agent.observingOnly = false; agent.canSend = resumed.thread.canAcceptDirectInput !== false;
    this.changed();
  }
  async recoverRequests(id, requestThreadId = id) {
    const parent = this.agent(id);
    if (requestThreadId !== id) return this.recoverSubagentRequests(parent, requestThreadId);
    if (this.requestJobs.has(id)) return this.requestJobs.get(id);
    const agent = this.agent(id);
    if (agent.provider === 'claude') { await this.claude.refresh(agent); return { requests: agent.questions.length }; }
    if (!agent.questions.length) {
      // Recover a cleared view from current-connection requests, never from history or guessed IDs.
      agent.questions = [...this.pending.values()].filter(question => question.params.threadId === id);
    }
    if (agent.questions.length) {
      const missing = agent.questions.filter(question => question.method === 'item/fileChange/requestApproval' && this.requestView(agent, question).nativeItem.state === 'unavailable');
      if (!missing.length) { agent.requestError = null; this.changed(); return { requests: agent.questions.length }; }
      // An already-delivered file approval may lack its separately delivered
      // item body. Explicit loading reads native history only: never resume,
      // replay a request, infer a diff from a command or submit an answer.
      const job = (async () => {
        await this.history(id);
        if (this.agents.get(id) !== agent) throw Object.assign(new Error('The worker changed while its file details were loaded.'), { status: 409 });
        for (const question of missing) if (this.pending.get(requestKey(id, question.id)) === question && agent.questions.includes(question)) {
          question.detailError = this.requestView(agent, question).nativeItem.state === 'available' ? null : 'Codex did not provide file paths and diff for this exact pending item. The request remains open; no answer was sent.';
        }
        agent.requestError = null; this.changed(); return { requests: agent.questions.length, fileDetailsLoaded: missing.filter(question => this.requestView(agent, question).nativeItem.state === 'available').length };
      })().catch(error => { agent.requestError = error.message; this.changed(); throw error; });
      this.requestJobs.set(id, job); this.changed();
      try { return await job; } finally { this.requestJobs.delete(id); this.changed(); }
    }
    agent.requestError = null;
    const job = (async () => {
      const { thread } = await this.rpc.call('thread/read', { threadId: id });
      if (!thread || thread.id !== id) throw Object.assign(new Error('The selected conversation could not be read safely.'), { status: 502 });
      agent.thread = thread;
      if (statusOf(thread) !== 'attention') return { requests: 0 };
      if (thread.status?.type !== 'active') throw Object.assign(new Error('The pending request is not in a loaded active conversation.'), { status: 409 });
      // Explicit user action: rejoin only this already active native thread.
      // Native replay supplies the original request IDs; no answer is invented.
      await this.activate(id, { force: true });
      await new Promise((resolve, reject) => {
        let timer;
        const finish = error => { clearTimeout(timer); this.off('change', check); error ? reject(error) : resolve(); };
        const check = () => {
          if (this.agents.get(id) !== agent) return finish(Object.assign(new Error('This conversation was closed while loading the request.'), { status: 409 }));
          if (!this.rpc.ready) return finish(Object.assign(new Error('Codex disconnected while loading the request.'), { status: 503 }));
          if (agent.questions.length || statusOf(agent.thread) !== 'attention') finish();
        };
        timer = setTimeout(() => finish(), this.recoveryTimeout); this.on('change', check); check();
      });
      if (!agent.questions.length) {
        const refreshed = await this.rpc.call('thread/read', { threadId: id });
        if (refreshed.thread?.id === id) agent.thread = refreshed.thread;
        if (!agent.questions.length && statusOf(agent.thread) === 'attention') throw Object.assign(new Error('Codex still reports a pending request but did not resend its details. No response was submitted. Try loading the request again.'), { status: 504 });
      }
      return { requests: agent.questions.length };
    })().catch(error => { agent.requestError = error.message; throw error; });
    this.requestJobs.set(id, job); this.changed();
    try { return await job; } finally { this.requestJobs.delete(id); this.changed(); }
  }
  async recoverSubagentRequests(parent, id) {
    let context;
    try { context = this.resolveRequestContext(parent, id); }
    catch (error) {
      const candidates = this.requestContexts(parent, { includeUnverified: true });
      const candidate = candidates.find(context => context.id === id);
      const nativeParent = candidate && candidates.find(context => context.id === candidate.nativeParentId);
      if (!nativeParent || !this.requestContextCurrent(parent, nativeParent)) throw error;
      await this.readWorker(nativeParent, id);
      context = this.resolveRequestContext(parent, id);
    }
    if (this.requestJobs.has(id)) return this.requestJobs.get(id);
    const job = (async () => {
      const before = { status: context.thread.status, turnId: context.turnId, revision: context.historyRevision || 0 };
      const { thread } = await this.rpc.call('thread/read', { threadId: id });
      if (!this.requestContextCurrent(parent, context) || thread?.id !== id || thread.parentThreadId !== context.thread.parentThreadId) { context.lineageNeedsRefresh = true; throw Object.assign(new Error('The native subagent relationship changed while loading its request.'), { status: 409 }); }
      if ((context.historyRevision || 0) !== before.revision) throw Object.assign(new Error('The native subagent history changed while loading its request. Refresh before continuing.'), { status: 409 });
      context.thread = context.thread.status !== before.status || context.turnId !== before.turnId ? { ...thread, status: context.thread.status } : thread;
      context.questions = [...this.pending.values()].filter(question => question.params.threadId === id);
      const missing = context.questions.filter(question => question.method === 'item/fileChange/requestApproval' && this.requestView(context, question).nativeItem.state === 'unavailable');
      if (missing.length) await this.history(id, undefined, { parent });
      if (!this.requestContextCurrent(parent, context)) throw Object.assign(new Error('The originating worker closed or its subagent changed.'), { status: 409 });
      for (const question of missing) if (this.pending.get(requestKey(id, question.id)) === question) question.detailError = this.requestView(context, question).nativeItem.state === 'available' ? null : 'Codex did not provide file details for this exact subagent request. No answer was sent.';
      context.requestError = !context.questions.length && statusOf(context.thread) === 'attention' ? 'Codex reports a waiting subagent, but did not deliver request details to this client. Open the original native client; no request was replayed or answered.' : null;
      this.changed(); return { requests: context.questions.length, fileDetailsLoaded: missing.filter(question => this.requestView(context, question).nativeItem.state === 'available').length };
    })().catch(error => { if (this.requestContextCurrent(parent, context)) { context.requestError = error.message; this.changed(); } throw error; });
    this.requestJobs.set(id, job); this.changed();
    try { return await job; } finally { this.requestJobs.delete(id); this.changed(); }
  }
  async refreshObserved(id) {
    const agent = this.agents.get(id);
    if (agent?.provider === 'claude') { if (!this.claude?.available || this.restoring || this.observedReads.has(id)) return; const job = this.claude.refresh(agent); this.observedReads.set(id, job); try { await job; } catch (error) { agent.observeError = error.message; this.changed(); } finally { this.observedReads.delete(id); } return; }
    if (!agent?.observingOnly || !this.rpc.ready || this.restoring) return;
    if (this.observedReads.has(id)) return this.observedReads.get(id);
    const revision = agent.historyRevision || 0;
    const job = (async () => {
      try {
        const { thread } = await this.rpc.call('thread/read', { threadId: id });
        if (this.agents.get(id) !== agent || (agent.historyRevision || 0) !== revision) return;
        if (!thread) throw new Error('Saved conversation is unavailable.');
        const signature = value => JSON.stringify([value.status, value.updatedAt, value.preview, value.model, value.reasoningEffort]);
        const changed = signature(thread) !== signature(agent.thread); this.syncModel(agent, thread.model, thread.reasoningEffort); const recovered = !!agent.observeError; agent.thread = thread; agent.observeError = null;
        if (changed || thread.status?.type === 'active') { await this.history(id); this.changed(); void this.coordinator?.flush(id); }
        else if (recovered) this.changed();
        if (changed && agent.role !== 'coordinator') this.coordinator?.mark(id, 'Watched worker changed');
      } catch (error) { agent.observeError = error.message; this.changed(); }
    })();
    this.observedReads.set(id, job); try { await job; } finally { this.observedReads.delete(id); }
  }
  addItem(agent, item, turnId, branchable = false, { live = false, completed = false, previous: prior } = {}) {
    const plan = reportedPlan(item); if (plan) agent.tasks = plan;
    if (item.type === 'agentMessage' && item.phase === 'commentary' && !item.text.includes('```')) agent.summary = item.text.split(/\n\s*\n/)[0];
    if (item.type === 'collabAgentToolCall') {
      for (const [id, state] of Object.entries(item.agentsStates || {})) {
        const existing = agent.workers.find(worker => worker.id === id);
        const worker = Object.assign(existing || {}, { id, name: state.agentNickname || state.agentRole || existing?.name || `Worker ${agent.workers.length + 1}`, status: state.status || item.status, task: item.prompt?.split('\n')[0]?.slice(0, 160) || item.tool });
        if (!existing) agent.workers.push(worker);
        if (item.tool === 'spawnAgent') { this.childRequestContext(agent, worker); if (!worker.detailLoaded || worker.requestContext?.lineageNeedsRefresh) void this.readWorker(agent, worker.id); }
      }
    }
    if (item.type === 'subAgentActivity') {
      const existing = agent.workers.find(worker => worker.id === item.agentThreadId);
      const name = item.agentPath?.split('/').filter(Boolean).pop() || 'Subagent';
      const state = ({ started: 'running', completed: 'completed', interrupted: 'interrupted' })[item.kind];
      const worker = Object.assign(existing || {}, { id: item.agentThreadId, name: existing?.name || name, task: existing?.task || name, status: state || existing?.status || 'unknown' });
      agent.workers = [...agent.workers.filter(worker => worker.id !== item.agentThreadId), worker];
      this.childRequestContext(agent, worker);
      if (!worker.detailLoaded || worker.requestContext?.lineageNeedsRefresh) void this.readWorker(agent, worker.id);
    }
    const images = item.type === 'userMessage' ? codexImages(item.content) : [];
    const previous = agent.messages.findIndex(m => m.id === item.id && m.turnId === turnId);
    const previousRecord = agent.messages[previous] || prior;
    const questionFields = item.type === 'agentMessage' && !Object.hasOwn(item, 'questions') && previousRecord?.nativeQuestions?.length
      ? { nativeQuestions: previousRecord.nativeQuestions, ...(previousRecord.nativeQuestionsTruncated ? { nativeQuestionsTruncated: true } : {}) } : nativeMessageQuestions(item);
    const text = itemText(item);
    if (!text && !images.length && !questionFields.nativeQuestions?.length) {
      if (item.type === 'agentMessage' && item.questions === null && previousRecord?.nativeQuestions?.length) {
        if (previous >= 0 && !previousRecord.text) agent.messages.splice(previous, 1);
        else { delete previousRecord.nativeQuestions; delete previousRecord.nativeQuestionsTruncated; }
      }
      return;
    }
    const record = { id: item.id, turnId, branchable, nativeType: item.type, type: item.type === 'userMessage' ? 'user' : item.type === 'agentMessage' ? 'assistant' : 'activity', text: text || '', ...questionFields, ...(item.type === 'fileChange' ? { fileChangeContext: fileChangeContext(item.changes) } : {}), ...(images.length ? { images } : {}), state: item.status || 'completed', ...itemTime(item, previousRecord, live), ...reportMessageFlags(item, previousRecord) };
    if (previous >= 0) agent.messages[previous] = record; else agent.messages.push(record);
    retainAsyncQuestionState(agent, record, previousRecord, { live, completed, item });
    if (live && completed && record.nativeQuestions?.length) this.handoffs.observeQuestions(agent);
    if (record.type === 'user') { observeAsyncQuestionInput(agent, record, item); if (live) void this.coordinator?.flush(agent.id); }
    if (live && completed && record.type === 'assistant') this.coordinator?.reportMessageCompleted(agent.id, record);
    if (agent.messages.length > 600) agent.messages = agent.messages.slice(-600);
    if (record.type === 'activity') agent.activity = { text: String(text).split('\n')[0].slice(0, 180), state: record.state };
  }
  async history(id, cursor, { replace = false, parent } = {}) {
    const agent = parent ? this.resolveRequestContext(parent, id) : this.agent(id);
    if (agent.provider === 'claude') { if (cursor) throw Object.assign(new Error('Claude history uses its native current transcript.'), { status: 400 }); await this.claude.refresh(agent); return; }
    const before = { turnId: agent.turnId, finishedTurn: agent.finishedTurn, status: agent.thread.status, revision: agent.historyRevision || 0 };
    const beforeItems = new Map(agent.messages.map(message => [JSON.stringify([message.turnId, message.id]), message]));
    const page = await this.rpc.call('thread/turns/list', { threadId: id, limit: 20, itemsView: 'full', ...(cursor ? { cursor } : {}) });
    if (!(parent ? this.requestContextCurrent(parent, agent) : this.agents.get(id) === agent) || (agent.historyRevision || 0) !== before.revision) return;
    const sameTurn = agent.turnId === before.turnId && agent.finishedTurn === before.finishedTurn && agent.thread.status === before.status;
    const restoreTurn = (!cursor || replace) && sameTurn && (before.status?.type !== 'active' || !before.turnId);
    if ((!cursor || replace) && sameTurn) {
      const latest = page.data[0];
      // Only current native history establishes whether an idle restored worker was stopped.
      if (latest?.id && ['completed', 'interrupted', 'failed'].includes(latest.status) && agent.thread.status?.type !== 'active') {
        agent.finishedTurn = { id: latest.id, status: latest.status };
      }
    }
    const current = { tasks: agent.tasks, workers: [...agent.workers], summary: agent.summary, activity: agent.activity };
    const live = agent.messages; const previous = new Map(live.map(message => [JSON.stringify([message.turnId, message.id]), message])); agent.messages = []; if (restoreTurn) agent.turnId = null;
    for (const turn of [...page.data].reverse()) {
      agent.tasks = []; agent.summary = null;
      if (restoreTurn && turn.status === 'inProgress') agent.turnId = turn.id;
      const lastReply = turn.status === 'completed' ? turn.items?.findLast(item => item.type === 'agentMessage') : null;
      if (lastReply && (!cursor || replace)) agent.lastCompletedTurnId = turn.id;
      for (const item of turn.items || []) {
        const key = JSON.stringify([turn.id, item.id]), latest = previous.get(key);
        // Live native file details received during this read are newer evidence
        // than its history snapshot. Do not replace them with an older body.
        if (item.type === 'fileChange' && latest && beforeItems.get(key) !== latest) agent.messages.push(latest);
        else this.addItem(agent, item, turn.id, item.id === lastReply?.id, { previous: latest || (item.type !== 'fileChange' ? live.find(message => message.id === item.id && message.type !== 'activity') : undefined) });
      }
    }
    const history = agent.messages;
    agent.messages = [...history, ...live.filter(m => !history.some(h => h.id === m.id && (m.nativeType === 'fileChange' || h.nativeType === 'fileChange' ? h.turnId === m.turnId : true)))].slice(-600);
    if (cursor && !replace) Object.assign(agent, current);
    agent.olderCursor = page.nextCursor || null;
    this.changed();
    return page;
  }
  async readWorker(agent, id) {
    const owner = this.requestOwner(agent.id, { includeUnverified: true });
    if (!owner) return;
    const worker = agent.workers.find(worker => worker.id === id); if (!worker?.requestContext) return;
    const context = this.childRequestContext(agent, worker);
    const revision = context.historyRevision || 0;
    const previousStatus = context.thread.status, previousTurn = context.turnId;
    const key = owner.parent.id + ':' + id; if (this.workerReads.has(key)) return;
    this.workerReads.add(key);
    try {
      const { thread } = await this.rpc.call('thread/read', { threadId: id });
      if (!this.rpc.ready || (context.historyRevision || 0) !== revision || this.agents.get(owner.parent.id) !== owner.parent || !this.requestContexts(owner.parent, { includeUnverified: true }).includes(context)) return;
      if (!thread || thread.id !== id || thread.parentThreadId !== agent.id) {
        if (!this.watched.has(id)) for (const [pendingKey, question] of this.pending) if (question.params.threadId === id) this.pending.delete(pendingKey);
        context.questions = []; context.lineageNeedsRefresh = true; throw new Error('Native thread does not verify this parent/subagent relationship. No request is actionable here.');
      }
      context.thread = context.thread.status !== previousStatus || context.turnId !== previousTurn ? { ...thread, status: context.thread.status } : thread;
      context.cwd = thread.cwd || agent.cwd; context.name = thread.name || worker.name;
      context.questions = [...this.pending.values()].filter(question => question.params.threadId === id);
      context.observeError = null; context.lineageNeedsRefresh = false;
      worker.task = thread.name || thread.preview?.split('\n')[0] || worker.task; worker.detailLoaded = true;
      if (context.questions.length) this.coordinator?.mark(owner.parent.id, 'Subagent approval or question needs review', true);
    } catch (error) {
      if ((context.historyRevision || 0) === revision && this.agents.get(owner.parent.id) === owner.parent && this.requestContexts(owner.parent, { includeUnverified: true }).includes(context)) { context.observeError = error.message; worker.detailError = error.message; }
    }
    finally { this.workerReads.delete(key); this.changed(); }
  }
  async refreshTasks(id) {
    if (!this.beads) return;
    if (this.trackerReads.has(id)) return this.trackerReads.get(id);
    const agent = this.agents.get(id); if (!agent) return;
    if (agent.role === 'coordinator') return;
    const job = (async () => {
      const before = agent.tracker;
      try { agent.tracker = await this.beads.linked(agent.cwd, id); }
      catch (error) { agent.tracker = { status: 'unavailable', label: sessionLabel(id), tasks: [], error: error.message, checkedAt: new Date().toISOString() }; }
      const content = value => JSON.stringify(value && { status: value.status, tasks: value.tasks, error: value.error });
      if (content(before) !== content(agent.tracker)) { this.changed(); if (!this.restoring) this.coordinator?.mark(id, 'Beads tasks changed'); }
      return agent.tracker;
    })();
    this.trackerReads.set(id, job);
    try { return await job; } finally { this.trackerReads.delete(id); }
  }
  async taskDetail(id, taskId) {
    const agent = this.agent(id);
    if (!this.beads) throw Object.assign(new Error('Beads is unavailable.'), { status: 503 });
    return this.beads.detail(agent.cwd, id, taskId);
  }
  syncModel(agent, model, effort) {
    if (typeof model === 'string') agent.model = model;
    if (effort === null || typeof effort === 'string') agent.reasoningEffort = effort;
    if (['pending', 'unconfirmed'].includes(agent.modelChange?.status) && agent.model === agent.modelChange.model && (agent.modelChange.effort === null || agent.reasoningEffort === agent.modelChange.effort)) { agent.modelChange.status = 'saved'; delete agent.modelChange.error; }
  }
  async modelSettings(id) {
    const agent = this.agent(id);
    if (agent.provider === 'claude') return this.claude.modelSettings(agent);
    if (agent.role === 'coordinator') throw Object.assign(new Error('Choose a worker to change its model.'), { status: 400 });
    const { thread } = await this.rpc.call('thread/read', { threadId: id });
    if (!thread) throw new Error('The native worker is unavailable.');
    this.syncModel(agent, thread.model, thread.reasoningEffort);
    const models = await readModelCatalog(this.rpc); this.changed();
    return { models, model: agent.model, effort: agent.reasoningEffort ?? null, change: agent.modelChange || null };
  }
  async updateModel(id, choice) {
    const agent = this.agent(id);
    if (agent.provider === 'claude') return this.claude.updateModel(agent, choice);
    if (agent.role === 'coordinator' || !agent.canSend) throw Object.assign(new Error('Choose a worker that accepts direct input.'), { status: 400 });
    if (agent.modelChange?.status === 'pending') throw Object.assign(new Error('Wait for the native model change to be confirmed, or refresh settings.'), { status: 409 });
    const selected = validateModelChoice(await readModelCatalog(this.rpc), choice);
    if (this.agents.get(id) !== agent) throw new Error('The worker was closed.');
    await this.activate(id);
    agent.modelChange = { ...choice, status: 'pending' }; this.changed();
    try {
      await this.rpc.call('thread/settings/update', { threadId: id, ...selected });
      const { thread } = await this.rpc.call('thread/read', { threadId: id });
      if (thread) this.syncModel(agent, thread.model, thread.reasoningEffort);
      this.changed(); return { model: agent.model, effort: agent.reasoningEffort ?? null, change: agent.modelChange };
    } catch (error) { agent.modelChange = { ...choice, status: 'unconfirmed', error: error.message }; this.changed(); throw error; }
  }
  async taskCatalog(id) {
    const agent = this.agent(id);
    if (!this.beads) throw Object.assign(new Error('Beads is unavailable.'), { status: 503 });
    return this.beads.catalog(agent.cwd, id);
  }
  async linkTasks(id, ids) {
    const agent = this.agent(id);
    if (this.returnJobs.has(id)) throw Object.assign(new Error('Wait for the branch handoff before editing its task links.'), { status: 409 });
    if (!this.beads) throw Object.assign(new Error('Beads is unavailable.'), { status: 503 });
    try { agent.tracker = await this.beads.setLinks(agent.cwd, id, ids); this.changed(); return agent.tracker; }
    catch (error) { await this.refreshTasks(id); throw error; }
  }
  async create({ goal, cwd, provider = 'codex' }) {
    if (!['codex', 'claude'].includes(provider)) throw Object.assign(new Error('Choose Codex or Claude.'), { status: 400 });
    if (this.workerSlots() >= limits.maxWorkers) throw Object.assign(new Error(`All ${limits.maxWorkers} worker tabs are already open.`), { status: 409 });
    if (typeof goal !== 'string' || !goal.trim() || goal.length > 2000) throw Object.assign(new Error('Enter a goal of 1–2000 characters.'), { status: 400 });
    if (goal.trim().split('\n')[0].slice(0, 120) === COORDINATOR_NAME) throw Object.assign(new Error('This name is reserved for the coordinator. Enter a worker goal.'), { status: 400 });
    if (typeof cwd !== 'string') throw Object.assign(new Error('Enter an absolute working-directory path.'), { status: 400 });
    // A pasted path often includes surrounding whitespace; spaces inside a directory name are significant.
    cwd = cwd.trim();
    if (!cwd || !isAbsolute(cwd)) throw Object.assign(new Error('Enter an absolute working-directory path, such as /path/to/your/project.'), { status: 400 });
    if (/[\x00-\x1f\x7f]/.test(cwd)) throw Object.assign(new Error('The working-directory path must not contain control characters or embedded line breaks.'), { status: 400 });
    let directory;
    try { directory = await stat(cwd); }
    catch (error) {
      const message = ({
        ENOENT: 'The working directory does not exist. Check the path on the Linux host.',
        ENOTDIR: 'The working-directory path contains a file where a directory is needed.',
        EACCES: 'CCNG cannot access the working directory. Choose a directory accessible to the account running CCNG.',
        EPERM: 'CCNG cannot access the working directory. Choose a directory accessible to the account running CCNG.',
        ENAMETOOLONG: 'The working-directory path is too long.',
      })[error.code];
      if (message) throw Object.assign(new Error(message), { status: 400 });
      throw error;
    }
    if (!directory.isDirectory()) throw Object.assign(new Error('The working-directory path points to a file, not a directory.'), { status: 400 });
    if (this.workerSlots() >= limits.maxWorkers) throw Object.assign(new Error(`All ${limits.maxWorkers} worker tabs are already open.`), { status: 409 });
    this.creating++; let reserved = true;
    try {
      if (provider === 'claude') {
        if (!this.claude) throw Object.assign(new Error('Local Claude support is unavailable.'), { status: 503 });
        const agent = this.claude.create(cwd, goal.trim()); this.agents.set(agent.id, agent); this.creating--; reserved = false;
        await this.refreshTasks(agent.id); await this.send(agent.id, goal.trim());
        if (this.coordinator && this.rpc.ready) { void this.coordinator.ensure().catch(() => {}); this.coordinator.mark(agent.id, 'Claude worker started'); }
        return agent.id;
      }
      // Do not override native model, permissions, instructions, or approval policy.
      const { thread } = await this.rpc.call('thread/start', { cwd });
      await this.rpc.call('thread/name/set', { threadId: thread.id, name: goal.trim().split('\n')[0].slice(0, 120) });
      this.creating--; reserved = false;
      const agent = await this.open(thread.id); agent.goal = goal.trim().split('\n')[0]; agent.name = agent.goal;
      await this.send(thread.id, goal.trim()); return thread.id;
    } finally { if (reserved) this.creating--; }
  }
  async answerMessageQuestion(id, data) {
    if (!data || Object.keys(data).some(key => !['messageId', 'questionIndex', 'answer'].includes(key))) throw Object.assign(new Error('Answer only the selected native message question.'), { status: 400, code: 'invalid_async_question_answer' });
    const agent = this.agent(id);
    const context = currentAsyncQuestion(agent, data.messageId, data.questionIndex);
    const text = asyncQuestionReply(context.binding, data.answer);
    context.messageId = data.messageId; context.questionIndex = data.questionIndex;
    setAsyncQuestionDelivery(context, 'submitting'); this.changed();
    try {
      const delivery = await this.send(id, text, { messageQuestion: context });
      setAsyncQuestionDelivery(context, 'submitted'); this.changed(); void this.coordinator?.flush(id);
      return { accepted: true, turnId: delivery.turnId };
    } catch (error) {
      if (context.attempted) {
        setAsyncQuestionDelivery(context, 'unconfirmed'); this.changed();
        throw Object.assign(new Error('The native answer delivery was not confirmed. Check the conversation before responding again.'), { status: error.status || 502, code: 'async_question_delivery_unconfirmed' });
      }
      if (context.binding.state === 'submitting') setAsyncQuestionDelivery(context, 'available');
      this.changed();
      throw Object.assign(error, { code: 'async_question_not_current' });
    }
  }
  asyncQuestionHandoffBlocked(agent) {
    const id = agent.id;
    const ownWaitingHandoff = this.returnJobs.has(id) && ['waiting', 'stopping'].includes(agent.handoff?.phase);
    return this.summaryJobs.has(id) || this.handoffs.incoming(id) || !!agent.returnSummary?.delivered || (this.returnJobs.has(id) && !ownWaitingHandoff);
  }
  async send(id, text, { report = false, reportSetting = false, coordinatorEvent = false, taskPing = false, preserveAsyncQuestions = false, messageQuestion, images: suppliedImages } = {}) {
    const agent = this.agent(id);
    const internalControl = report || reportSetting || coordinatorEvent || taskPing || preserveAsyncQuestions;
    if (internalControl) assertAsyncQuestionsAllowControl(agent);
    if (taskPing && (agent.provider === 'claude' || agent.role === 'coordinator')) throw Object.assign(new Error('Silent task checks are supported only for Codex workers.'), { status: 409 });
    if (taskPing && agent.thread.status?.type === 'active' && !agent.turnId) throw Object.assign(new Error('Wait for the active native turn identity before a silent task check.'), { status: 409 });
    if ((this.summaryJobs.has(id) || this.returnJobs.has(id) || agent.returnSummary?.delivered) && (!messageQuestion || this.asyncQuestionHandoffBlocked(agent))) throw Object.assign(new Error('Finish the branch handoff before sending another message.'), { status: 409 });
    if (!agent.canSend) throw Object.assign(new Error(agent.managementNotice || 'The native agent does not allow direct input to this session.'), { status: 409 });
    const images = validateImages(suppliedImages);
    if (typeof text !== 'string' || (!text.trim() && !images.length) || text.length > 32_000) throw Object.assign(new Error('Enter a message of up to 32000 characters or paste an image.'), { status: 400 });
    if (agent.questions.length) throw Object.assign(new Error('Answer the pending question before sending another message.'), { status: 409 });
    if (statusOf(agent.thread) === 'attention') throw Object.assign(new Error('Load the pending request before sending another message.'), { status: 409 });
    await this.activate(id);
    const context = await this.instructionContext(agent);
    if (this.agents.get(id) !== agent) throw Object.assign(new Error('The worker was closed before message delivery.'), { status: 409 });
    if (!this.readyFor(agent)) throw Object.assign(new Error('Reconnect the native runtime before sending this message.'), { status: 503 });
    if (taskPing && agent.thread.status?.type === 'active' && !agent.turnId) throw Object.assign(new Error('Wait for the active native turn identity before a silent task check.'), { status: 409 });
    if (agent.questions.length || statusOf(agent.thread) === 'attention') throw Object.assign(new Error('Answer the pending request before sending another message.'), { status: 409 });
    if (agent.provider === 'claude') {
      await this.claude.send(agent, text.trim(), { images, report, reportSetting, instructions: Object.values(context).map(part => part.value).join('\n\n'), stillOpen: () => this.agents.get(id) === agent, ...(report || reportSetting ? { priority: 'next' } : {}) }); return;
    }
    if (agent.freshBranch && !report && !reportSetting && !taskPing && !messageQuestion) {
      const title = text.trim().split('\n')[0].slice(0, 120) || 'Image message';
      await this.rpc.call('thread/name/set', { threadId: id, name: title });
      agent.name = title; agent.goal = title; agent.freshBranch = false;
    }
    if (this.agents.get(id) !== agent) throw Object.assign(new Error('The worker was closed before message delivery.'), { status: 409 });
    if (agent.questions.length || statusOf(agent.thread) === 'attention') throw Object.assign(new Error('Answer the pending request before sending another message.'), { status: 409 });
    if (taskPing) {
      // Activation/context reads can race a stop, handoff or management change.
      // Recheck immediately before the native call, with no await in between.
      if (agent.handoff || this.handoffs.incoming(id) || this.summaryJobs.has(id) || this.returnJobs.has(id) || agent.returnSummary?.delivered) throw Object.assign(new Error('Finish the branch handoff before a silent task check.'), { status: 409 });
      if (!agent.canSend) throw Object.assign(new Error(agent.managementNotice || 'The native agent does not allow direct input to this session.'), { status: 409 });
      if (this.coordinator?.paused || this.coordinator?.stopped || this.restoring) throw Object.assign(new Error('Silent task checks are paused.'), { status: 409 });
      if (agent.thread.status?.type === 'active') {
        if (!agent.turnId) throw Object.assign(new Error('Wait for the active native turn identity before a silent task check.'), { status: 409 });
      } else if (agent.thread.status?.type !== 'idle' || agent.turnId || agent.finishedTurn?.status !== 'completed') {
        throw Object.assign(new Error('A silent task check cannot restart stopped, failed or unverified work.'), { status: 409 });
      }
    }
    const clientUserMessageId = report || reportSetting || coordinatorEvent || taskPing ? (report ? 'ccng-report-' : reportSetting ? 'ccng-report-setting-' : coordinatorEvent ? 'ccng-event-' : 'ccng-task-ping-') + randomUUID() : null;
    const messageInput = markInternalInput(input(text.trim(), images), clientUserMessageId);
    const identity = clientUserMessageId ? { clientUserMessageId } : {};
    if (internalControl) assertAsyncQuestionsAllowControl(agent);
    if (messageQuestion) {
      if (this.restoring || this.asyncQuestionHandoffBlocked(agent)) throw Object.assign(new Error('Finish restoration or branch handoff before answering this native question.'), { status: 409 });
      currentAsyncQuestion(agent, messageQuestion.messageId, messageQuestion.questionIndex, messageQuestion);
      messageQuestion.attempted = true;
    }
    if (agent.thread.status?.type === 'active' && agent.turnId) {
      const turnId = agent.turnId;
      const delivery = await this.rpc.call('turn/steer', { threadId: id, expectedTurnId: turnId, input: messageInput, ...identity });
      return { turnId: delivery?.turnId || turnId };
    } else {
      const { turn } = await this.rpc.call('turn/start', { threadId: id, input: messageInput, ...identity, additionalContext: context });
      if (agent.finishedTurn?.id !== turn.id) { agent.turnId = turn.id; agent.thread.status = { type: 'active', activeFlags: [] }; this.changed(); }
      return { turnId: turn.id };
    }
  }
  async instructionContext(agent) {
    const source = await readEnvironmentInstructions(agent.cwd);
    const { text, ...state } = source; agent.environmentInstructions = state;
    return { ...environmentInstructionContext(source), ...(agent.role !== 'coordinator' ? { ...this.beads?.context(agent.id), 'command-center-worker-instructions': { kind: 'application', value: WORKER_BASE_INSTRUCTIONS + '\n\n' + reportTimingContext(agent.reportIntervalMinutes) } } : { 'command-center-report-instructions': { kind: 'application', value: WORKER_REPORT_INSTRUCTIONS } }) };
  }
  async interrupt(id) {
    const agent = this.agent(id);
    if (agent.provider === 'claude') return this.claude.interrupt(agent);
    if (!agent.turnId) throw Object.assign(new Error('There is no active turn to interrupt.'), { status: 409 });
    await this.rpc.call('turn/interrupt', { threadId: id, turnId: agent.turnId });
  }
  async fork(id, lastTurnId) {
    const source = this.agent(id);
    if (source.provider === 'claude') throw Object.assign(new Error('Claude branching is not supported in Command Center yet. This session remains unchanged.'), { status: 400 });
    if (source.role === 'coordinator') throw Object.assign(new Error('Branch a worker conversation instead.'), { status: 400 });
    const atReply = lastTurnId !== undefined && lastTurnId !== null;
    if (atReply && (typeof lastTurnId !== 'string' || !source.messages.some(message => message.turnId === lastTurnId && message.branchable))) throw Object.assign(new Error('Choose a completed reply to branch from.'), { status: 400 });
    if (this.workerSlots() >= limits.maxWorkers) throw Object.assign(new Error('Close an agent tab before opening a branch. Conversations are kept.'), { status: 409 });
    this.creating++; let reserved = true;
    try {
      // Omit the cutoff for Branch chat; only Branch here selects a historical reply.
      const { thread } = await this.rpc.call('thread/fork', { threadId: id, ...(atReply ? { lastTurnId } : {}), excludeTurns: true, deferGoalContinuation: true });
      const name = `Branch · ${source.goal}`.slice(0, 120);
      await this.rpc.call('thread/name/set', { threadId: thread.id, name });
      this.creating--; reserved = false;
      const branch = await this.open(thread.id);
      branch.parentId = id; branch.name = name; branch.goal = source.goal; branch.freshBranch = true;
      this.changed(); return branch.id;
    } finally { if (reserved) this.creating--; }
  }
  async parent(id) {
    const branch = this.agent(id); const parentId = branch.parentId;
    if (!parentId) throw Object.assign(new Error('This conversation has no parent branch.'), { status: 400 });
    if (this.agents.has(parentId)) return parentId;
    const replace = this.workerSlots() >= limits.maxWorkers;
    if (replace && branch.handoff) throw Object.assign(new Error('All worker tabs are open. Close another tab to open the parent; the handing-back branch is kept.'), { status: 409 });
    if (replace) this.agents.delete(id);
    try { await this.open(parentId); return parentId; }
    catch (error) { if (replace) this.agents.set(id, branch); this.changed(); throw error; }
  }
  idleBranch(id, { allowUnloaded = false } = {}) {
    const branch = this.agent(id);
    if (!branch.parentId) throw Object.assign(new Error('This conversation has no parent branch.'), { status: 400 });
    const status = statusOf(branch.thread, branch.questions);
    if (status === 'attention') throw Object.assign(new Error(`Child chat "${branch.name}" has a pending question or approval. Answer it here (or load its pending request), then retry Return summary.`), { status: 409 });
    if (status === 'running') throw Object.assign(new Error(`Child chat "${branch.name}" is still responding. Wait for its turn to finish, then retry Return summary.`), { status: 409 });
    const unloaded = allowUnloaded && branch.observingOnly && branch.thread.status?.type === 'notLoaded';
    if (status !== 'idle' && !unloaded) throw Object.assign(new Error(`Child chat "${branch.name}" is unavailable in the native runtime. Reopen this child chat, then retry Return summary.`), { status: 409 });
    return branch;
  }
  async summarize(id) {
    if (this.handoffs.incoming(id) || this.agent(id).handoff) throw Object.assign(new Error('Use Hand back & close to finish this branch handoff; an incoming delivery must finish first.'), { status: 409 });
    if (this.summaryJobs.has(id)) return this.summaryJobs.get(id);
    const branch = this.idleBranch(id, { allowUnloaded: true });
    if (branch.returnSummary?.delivered || branch.returnSummary?.turnId === branch.lastCompletedTurnId) return branch.returnSummary;
    if (this.returnJobs.has(id)) throw Object.assign(new Error('This branch is already being returned.'), { status: 409 });
    const job = this.generateSummary(branch); this.summaryJobs.set(id, job); this.changed();
    try { return await job; } finally { this.summaryJobs.delete(id); this.changed(); }
  }
  startHandoff(id) { return this.handoffs.start(id); }
  async generateSummary(branch) {
    // Return summary is an explicit user action; restoring a tab stays read-only.
    await this.activate(branch.id);
    if (this.agents.get(branch.id) !== branch) throw Object.assign(new Error('The branch was closed before summary preparation.'), { status: 409 });
    this.idleBranch(branch.id);
    await this.refreshTasks(branch.id);
    const context = await this.instructionContext(branch);
    if (this.agents.get(branch.id) !== branch) throw Object.assign(new Error('The branch was closed before summary preparation.'), { status: 409 });
    this.idleBranch(branch.id);
    const { turn } = await this.rpc.call('turn/start', { threadId: branch.id, input: input(summaryPrompt(branch.goal, branch.tracker?.tasks)), outputSchema: SUMMARY_SCHEMA, additionalContext: context });
    if (branch.finishedTurn?.id !== turn.id) { branch.turnId = turn.id; branch.thread.status = { type: 'active', activeFlags: [] }; this.changed(); }
    await new Promise((resolve, reject) => {
      const finish = error => { clearTimeout(timer); this.off('change', check); error ? reject(error) : resolve(); };
      const check = () => {
        if (!this.rpc.ready) return finish(new Error('Codex disconnected while preparing the summary. The branch is still open.'));
        if (branch.questions.length || hasOpenAsyncQuestions(branch)) return finish(new Error('Resolve the branch question before preparing its summary again.'));
        if (branch.finishedTurn?.id === turn.id) finish(branch.finishedTurn.status === 'completed' ? null : new Error('The summary turn did not complete. The branch is still open.'));
      };
      const timer = setTimeout(() => finish(new Error('Summary preparation timed out. The branch is still open; check its current turn before retrying.')), this.summaryTimeout);
      this.on('change', check); check();
    });
    const reply = branch.messages.findLast(message => message.turnId === turn.id && message.type === 'assistant');
    const text = readSummary(reply?.text);
    branch.returnSummary = { text, turnId: turn.id, delivered: false }; this.changed();
    return branch.returnSummary;
  }
  async returnToParent(id, text) {
    if (this.handoffs.incoming(id) || this.agent(id).handoff) throw Object.assign(new Error('Use Hand back & close to finish this branch handoff; the older return flow cannot bypass its safety checks.'), { status: 409 });
    if (this.returnJobs.has(id)) return this.returnJobs.get(id);
    const branch = this.idleBranch(id, { allowUnloaded: true });
    if (typeof text !== 'string' || !text.trim() || text.length > SUMMARY_LIMIT) throw Object.assign(new Error(`Enter a concise summary of up to ${SUMMARY_LIMIT} characters.`), { status: 400 });
    if (this.summaryJobs.has(id) || !branch.returnSummary || (!branch.returnSummary.delivered && branch.returnSummary.turnId !== branch.lastCompletedTurnId)) throw Object.assign(new Error('Prepare a current branch summary before returning it.'), { status: 409 });
    const job = this.finishReturn(branch, text.trim()); this.returnJobs.set(id, job); this.changed();
    try { return await job; } finally { this.returnJobs.delete(id); this.changed(); }
  }
  async finishReturn(branch, text) {
    const parentWasOpen = this.agents.has(branch.parentId);
    try {
      await this.activate(branch.id);
      if (this.agents.get(branch.id) !== branch) throw Object.assign(new Error('The child chat was closed before returning its summary.'), { status: 409 });
      this.idleBranch(branch.id);
      const parentId = await this.parent(branch.id);
      if (!branch.returnSummary.delivered) {
        try { await this.send(parentId, `Branch summary from "${branch.name}" (${branch.id}):\n\n${text}`, { preserveAsyncQuestions: true }); }
        catch (error) {
          const parent = this.agent(parentId);
          const waiting = parent.questions.length || hasOpenAsyncQuestions(parent) || statusOf(parent.thread) === 'attention';
          const message = waiting
            ? `Parent chat "${parent.name}" has a pending question or approval. Open parent, answer it (or load its pending request), then return to this child and retry. Your summary is kept here.`
            : `Could not send the summary to parent chat "${parent.name}". ${error.message} Your summary is kept in this child; open the parent to check it, then retry.`;
          throw Object.assign(new Error(message), { status: error.status || 502 });
        }
        branch.returnSummary.text = text; branch.returnSummary.delivered = true; this.changed();
      }
      const { thread } = await this.rpc.call('thread/read', { threadId: branch.id });
      branch.thread = thread;
      if (statusOf(thread, branch.questions) !== 'idle') throw new Error(`Child chat "${branch.name}" is no longer idle. Check its request or active turn before retrying Close branch.`);
      await this.rpc.call('thread/archive', { threadId: branch.id });
      this.agents.delete(branch.id); this.watched.delete(branch.id); this.coordinator?.closed(branch.id); this.changed();
      return parentId;
    } catch (error) {
      if (!this.agents.has(branch.id)) { if (!parentWasOpen) this.agents.delete(branch.parentId); this.agents.set(branch.id, branch); }
      this.changed();
      if (branch.returnSummary.delivered) throw Object.assign(new Error('The summary was delivered, but closing the branch failed. Retry to close it without sending the summary again. ' + error.message), { status: 502 });
      throw error;
    }
  }
  close(id) { const agent = this.agent(id); if (agent.role === 'coordinator') throw Object.assign(new Error('Pause the coordinator using its controls.'), { status: 409 }); if (this.summaryJobs.has(id) || this.returnJobs.has(id)) throw Object.assign(new Error('Wait for the branch handoff to finish before closing its tab.'), { status: 409 }); this.agents.delete(id); this.coordinator?.closed(id); this.changed(); }
  request(message) {
    const p = message.params || {};
    if (['execCommandApproval', 'applyPatchApproval'].includes(message.method) && typeof p.conversationId === 'string' && !p.threadId) p.threadId = p.conversationId;
    if (message.method === 'currentTime/read') { this.rpc.respond(message.id, { currentTime: new Date().toISOString() }); return; }
    if (message.method === 'item/tool/call' && p.threadId === this.coordinator?.id) { void this.coordinator.handle(message); return; }
    const owner = this.requestOwner(p.threadId, { includeUnverified: true });
    if (!this.watched.has(p.threadId) && !owner) return;
    if (!isHumanRequest(message.method)) { this.rpc.refuse(message.id, 'This client does not implement this internal tool. Use the original client for it.'); return; }
    const question = { id: message.id, method: message.method, params: p, reviewToken: randomUUID() };
    const key = requestKey(p.threadId, message.id);
    if (this.pending.has(key)) return;
    const agent = owner?.context || this.agents.get(p.threadId);
    this.pending.set(key, question); agent?.questions.push(question);
    this.nativeActivity(agent, p.turnId); this.changed();
    if (!owner || this.requestContextCurrent(owner.parent, agent)) this.coordinator?.mark(owner?.parent.id || p.threadId, 'Approval or question needs review', true);
  }
  answer(id, requestId, answer, requestThreadId = id) {
    const parent = this.agent(id), agent = this.resolveRequestContext(parent, requestThreadId); if (agent.provider === 'claude') return this.claude.answer(agent, requestId, answer);
    const key = requestKey(requestThreadId, requestId); const question = this.pending.get(key);
    if (!question || question.params.threadId !== requestThreadId) throw Object.assign(new Error('This question has already been resolved.'), { status: 409 });
    if (requestThreadId !== id && answer.reviewToken !== question.reviewToken) throw Object.assign(new Error('The subagent request changed. Refresh it before answering.'), { status: 409 });
    for (const field of ['turnId', 'itemId']) if ((answer[field] !== undefined || (requestThreadId !== id && question.params[field] !== undefined)) && answer[field] !== question.params[field]) throw Object.assign(new Error('The native request binding changed. Refresh before answering.'), { status: 409 });
    const { requestId: ignoredId, requestThreadId: ignoredThread, reviewToken: ignoredToken, turnId: ignoredTurn, itemId: ignoredItem, ...nativeAnswer } = answer;
    answer = nativeAnswer;
    if (this.answerJobs.has(key)) throw Object.assign(new Error('An answer is already awaiting confirmation.'), { status: 409 });
    let result;
    if (question.method === 'item/tool/requestUserInput') {
      const answers = {};
      for (const q of question.params.questions || []) {
        const value = answer.answers?.[q.id];
        if (typeof value !== 'string' || !value.trim() || value.length > 8000) throw Object.assign(new Error('Answer every question.'), { status: 400 });
        answers[q.id] = { answers: [value] };
      }
      result = { answers };
    } else if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(question.method) || isNativeToolApproval(question)) {
      if (isNativeToolApproval(question) && agent.role === 'coordinator' && answer.decision === 'accept') throw Object.assign(new Error('Coordinator tool restrictions must remain unchanged. This request cannot be granted here.'), { status: 403 });
      const { requestId: ignoredRequestId, ...choice } = answer;
      result = nativeApprovalAnswer(question, choice, { allowPersistent: agent.role !== 'coordinator' });
    } else {
      if (agent.role === 'coordinator' && answer.decision === 'accept') throw Object.assign(new Error('Coordinator tool and filesystem/network restrictions must remain unchanged. This request cannot be granted here.'), { status: 403 });
      if (answer.persistence !== undefined) throw Object.assign(new Error('This native request does not offer a saved permission choice.'), { status: 400 });
      result = manualRequestAnswer(question, answer);
    }
    return new Promise((resolve, reject) => {
      let timer;
      const finish = error => {
        clearTimeout(timer); this.answerJobs.delete(key); question.responding = false;
        if (error) question.error = error.message;
        this.changed(); error ? reject(error) : resolve();
      };
      this.answerJobs.set(key, { finish }); question.responding = true; question.error = null; this.changed();
      timer = setTimeout(() => finish(Object.assign(new Error('Codex did not confirm that this request was resolved. Check the native session before retrying.'), { status: 504 })), this.answerTimeout);
      try { this.rpc.respond(question.id, result); }
      catch (error) { finish(Object.assign(new Error('The answer could not be sent. ' + error.message), { status: 503 })); }
    });
  }
  removeQuestion(threadId, id) {
    const key = requestKey(threadId, id); if (!this.pending.has(key)) return;
    this.pending.delete(key);
    const owner = this.requestOwner(threadId, { includeUnverified: true });
    const agent = owner?.context;
    for (const parent of this.agents.values()) for (const context of this.requestContexts(parent, { includeUnverified: true })) if (context.id === threadId) context.questions = context.questions.filter(question => question.id !== id);
    this.answerJobs.get(key)?.finish();
    if (agent) { this.coordinator?.markRemainingApprovals(owner.parent.id); void this.coordinator?.flush(owner.parent.id); }
  }
  notification({ method, params: p = {} }) {
    if (method === 'thread/reverted') {
      const owner = this.requestOwner(p.threadId); if (!owner) return;
      const { parent, context: agent } = owner;
      // A different native client changed history. Invalidate prior reads and
      // approval-item bodies before observing the new native transcript.
      const revision = agent.historyRevision = (agent.historyRevision || 0) + 1;
      agent.messages = []; agent.tasks = []; agent.workers = []; agent.summary = null; agent.activity = null;
      agent.turnId = null; agent.finishedTurn = null; agent.lastCompletedTurnId = null; agent.olderCursor = null; agent.returnSummary = null;
      const current = () => this.requestContextCurrent(parent, agent) && agent.historyRevision === revision;
      void this.history(agent.id, undefined, { replace: true, ...(parent !== agent ? { parent } : {}) }).then(() => {
        if (current()) { agent.observeError = null; this.changed(); }
      }, error => {
        if (current()) { agent.observeError = error.message; this.changed(); }
      });
      this.changed(); return;
    }
    if (method === 'serverRequest/resolved') { this.removeQuestion(p.threadId, p.requestId); this.changed(); return; }
    if (method === 'warning' && typeof p.message === 'string' && p.message.trim()) {
      // Native rule-save failures can leave the current action approved. Keep the
      // warning visible without treating request resolution as persistence proof.
      if (p.threadId != null) {
        const target = this.requestOwner(p.threadId)?.context; if (!target) return;
        target.nativeWarning = p.message.slice(0, 2000);
      } else this.nativeWarning = p.message.slice(0, 2000);
      this.changed(); return;
    }
    const id = p.threadId || p.thread?.id; const owner = this.requestOwner(id, { includeUnverified: true }); const agent = owner?.context; if (!agent) return;
    if (method === 'thread/status/changed' || method.startsWith('turn/') || method.startsWith('item/')) {
      this.nativeActivity(agent, method === 'turn/started' ? undefined : p.turnId || p.turn?.id);
    }
    if (method === 'thread/status/changed') agent.thread.status = p.status;
    if (method === 'thread/name/updated') agent.name = p.threadName || p.name || agent.name;
    if (method === 'thread/settings/updated') this.syncModel(agent, p.threadSettings?.model, p.threadSettings?.effort);
    if (method === 'turn/started') { agent.turnId = p.turn.id; agent.thread.status = { type: 'active', activeFlags: [] }; agent.tasks = []; agent.summary = null; if (!agent.returnSummary?.delivered) agent.returnSummary = null; }
    if (method === 'turn/completed') {
      retireAsyncQuestions(agent, 'The originating native turn finished; this question is read-only.', 'terminal');
      agent.turnId = null; agent.thread.status = { type: 'idle' };
      agent.finishedTurn = { id: p.turn.id, status: p.turn.status };
      if (p.turn.error) agent.activity = { text: p.turn.error.message, state: 'failed' };
      if (p.turn.status === 'completed') {
        const reply = agent.messages.findLast(message => message.type === 'assistant' && message.turnId === p.turn.id);
        if (reply) { reply.branchable = true; reply.state = 'completed'; agent.lastCompletedTurnId = p.turn.id; }
      }
      void this.refreshTasks(id);
      if (this.agents.get(id) === agent) this.coordinator?.completed(id, p.turn.id);
    }
    if (method === 'turn/plan/updated') agent.tasks = (p.plan || []).map((t, i) => ({ id: String(i), text: t.step, state: t.status }));
    if (method === 'item/started' || method === 'item/completed') this.addItem(agent, p.item, p.turnId, false, { live: true, completed: method === 'item/completed' });
    if (method === 'item/agentMessage/delta') {
      const existing = agent.messages.find(m => m.id === p.itemId);
      if (existing) { existing.text += p.delta; Object.assign(existing, itemTime(p, existing, true)); }
      else agent.messages.push({ id: p.itemId, turnId: p.turnId, type: 'assistant', text: p.delta, state: 'inProgress', ...itemTime(p, null, true) });
    }
    this.changed();
  }
}
