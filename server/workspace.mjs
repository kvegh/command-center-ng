import limits from './limits.json' with { type: 'json' };
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { VERSION } from './version.mjs';
import { WORKER_BASE_INSTRUCTIONS, WORKER_REPORT_INSTRUCTIONS, reportTimingContext } from './worker-instructions.mjs';
import { isHumanRequest, manualRequestAnswer } from './native-requests.mjs';
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
      this.pending.clear(); for (const agent of this.agents.values()) if (agent.provider !== 'claude') agent.questions = [];
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
  backgroundRequests() {
    const workers = new Map();
    for (const question of this.pending.values()) if (!this.agents.has(question.params.threadId)) {
      const id = question.params.threadId, previous = workers.get(id);
      workers.set(id, { id, name: 'Codex session', provider: 'codex', questionCount: (previous?.questionCount || 0) + 1 });
    }
    for (const agent of this.claude?.records.values() || []) if (!this.agents.has(agent.id) && agent.questions.length) workers.set(agent.id, { id: agent.id, name: agent.name, provider: 'claude', questionCount: agent.questions.length });
    return { backgroundQuestions: [...workers.values()].reduce((total, worker) => total + worker.questionCount, 0), backgroundWorkers: [...workers.values()] };
  }
  snapshot() {
    return { connected: this.available(), codexConnected: this.rpc.ready, claudeAvailable: !!this.claude?.available, claudeError: this.claude?.error || null, error: this.error, nativeWarning: this.nativeWarning || null, version: VERSION, restoration: this.restoration, handoffCompletions: this.handoffs.completions, coordinator: this.coordinator?.snapshot() || null, ...this.backgroundRequests(), agents: [...this.agents.values()].map(agent => ({ ...agent, messages: agent.messages.map(message => imageReferences(agent.id, message)), ...taskSummary(agent), reportState: this.coordinator?.reportState(agent.id) || null, reportSettingPending: !!this.coordinator?.deliveries.get(agent.id)?.some(row => row.kind === 'report-setting'), summarizing: this.summaryJobs.has(agent.id), returning: this.returnJobs.has(agent.id), recoveringRequests: this.requestJobs.has(agent.id), status: this.readyFor(agent) ? (agent.observingOnly && agent.thread.status?.type === 'notLoaded' ? 'idle' : statusOf(agent.thread, agent.questions)) : 'offline', thread: undefined })) };
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
  async recoverRequests(id) {
    if (this.requestJobs.has(id)) return this.requestJobs.get(id);
    const agent = this.agent(id);
    if (agent.provider === 'claude') { await this.claude.refresh(agent); return { requests: agent.questions.length }; }
    if (!agent.questions.length) {
      // Recover a cleared view from current-connection requests, never from history or guessed IDs.
      agent.questions = [...this.pending.values()].filter(question => question.params.threadId === id);
    }
    if (agent.questions.length) { agent.requestError = null; this.changed(); return { requests: agent.questions.length }; }
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
  async refreshObserved(id) {
    const agent = this.agents.get(id);
    if (agent?.provider === 'claude') { if (!this.claude?.available || this.restoring || this.observedReads.has(id)) return; const job = this.claude.refresh(agent); this.observedReads.set(id, job); try { await job; } catch (error) { agent.observeError = error.message; this.changed(); } finally { this.observedReads.delete(id); } return; }
    if (!agent?.observingOnly || !this.rpc.ready || this.restoring) return;
    if (this.observedReads.has(id)) return this.observedReads.get(id);
    const job = (async () => {
      try {
        const { thread } = await this.rpc.call('thread/read', { threadId: id });
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
        const worker = { id, name: state.agentNickname || state.agentRole || `Worker ${agent.workers.length + 1}`, status: state.status || item.status, task: item.prompt?.split('\n')[0]?.slice(0, 160) || item.tool };
        const existing = agent.workers.findIndex(w => w.id === id); if (existing < 0) agent.workers.push(worker); else agent.workers[existing] = worker;
      }
    }
    if (item.type === 'subAgentActivity') {
      const existing = agent.workers.find(worker => worker.id === item.agentThreadId);
      const name = item.agentPath?.split('/').filter(Boolean).pop() || 'Subagent';
      const state = ({ started: 'running', completed: 'completed', interrupted: 'interrupted' })[item.kind];
      const worker = { ...existing, id: item.agentThreadId, name: existing?.name || name, task: existing?.task || name, status: state || existing?.status || 'unknown' };
      agent.workers = [...agent.workers.filter(worker => worker.id !== item.agentThreadId), worker];
      if (!worker.detailLoaded) void this.readWorker(agent, worker.id);
    }
    const images = item.type === 'userMessage' ? codexImages(item.content) : [];
    const text = itemText(item); if (!text && !images.length) return;
    const previous = agent.messages.findIndex(m => m.id === item.id);
    const previousRecord = agent.messages[previous] || prior;
    const record = { id: item.id, turnId, branchable, type: item.type === 'userMessage' ? 'user' : item.type === 'agentMessage' ? 'assistant' : 'activity', text: text || '', ...(images.length ? { images } : {}), state: item.status || 'completed', ...itemTime(item, previousRecord, live), ...reportMessageFlags(item, previousRecord) };
    if (previous >= 0) agent.messages[previous] = record; else agent.messages.push(record);
    if (live && completed && record.type === 'assistant') this.coordinator?.reportMessageCompleted(agent.id, record);
    if (agent.messages.length > 600) agent.messages = agent.messages.slice(-600);
    if (record.type === 'activity') agent.activity = { text: String(text).split('\n')[0].slice(0, 180), state: record.state };
  }
  async history(id, cursor) {
    const agent = this.agent(id);
    if (agent.provider === 'claude') { if (cursor) throw Object.assign(new Error('Claude history uses its native current transcript.'), { status: 400 }); await this.claude.refresh(agent); return; }
    const before = { turnId: agent.turnId, finishedTurn: agent.finishedTurn, status: agent.thread.status };
    const page = await this.rpc.call('thread/turns/list', { threadId: id, limit: 20, itemsView: 'full', ...(cursor ? { cursor } : {}) });
    const sameTurn = agent.turnId === before.turnId && agent.finishedTurn === before.finishedTurn && agent.thread.status === before.status;
    const restoreTurn = !cursor && sameTurn && (before.status?.type !== 'active' || !before.turnId);
    if (!cursor && sameTurn) {
      const latest = page.data[0];
      // Only current native history establishes whether an idle restored worker was stopped.
      if (latest?.id && ['completed', 'interrupted', 'failed'].includes(latest.status) && agent.thread.status?.type !== 'active') {
        agent.finishedTurn = { id: latest.id, status: latest.status };
      }
    }
    const current = { tasks: agent.tasks, workers: agent.workers.map(worker => ({ ...worker })), summary: agent.summary, activity: agent.activity };
    const live = agent.messages; const previous = new Map(live.map(message => [message.id, message])); agent.messages = []; if (restoreTurn) agent.turnId = null;
    for (const turn of [...page.data].reverse()) {
      agent.tasks = []; agent.summary = null;
      if (restoreTurn && turn.status === 'inProgress') agent.turnId = turn.id;
      const lastReply = turn.status === 'completed' ? turn.items?.findLast(item => item.type === 'agentMessage') : null;
      if (lastReply && !cursor) agent.lastCompletedTurnId = turn.id;
      for (const item of turn.items || []) this.addItem(agent, item, turn.id, item.id === lastReply?.id, { previous: previous.get(item.id) });
    }
    const history = agent.messages;
    agent.messages = [...history, ...live.filter(m => !history.some(h => h.id === m.id))].slice(-600);
    if (cursor) Object.assign(agent, current);
    agent.olderCursor = page.nextCursor || null;
    this.changed();
  }
  async readWorker(agent, id) {
    const key = agent.id + ':' + id; if (this.workerReads.has(key)) return;
    this.workerReads.add(key);
    try {
      const { thread } = await this.rpc.call('thread/read', { threadId: id });
      const worker = agent.workers.find(worker => worker.id === id);
      if (worker && thread) { worker.task = thread.name || thread.preview?.split('\n')[0] || worker.task; worker.detailLoaded = true; }
    } catch (error) {
      const worker = agent.workers.find(worker => worker.id === id); if (worker) worker.detailError = error.message;
    } finally { this.workerReads.delete(key); this.changed(); }
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
  async send(id, text, { report = false, reportSetting = false, coordinatorEvent = false, taskPing = false, images: suppliedImages } = {}) {
    const agent = this.agent(id);
    if (taskPing && (agent.provider === 'claude' || agent.role === 'coordinator')) throw Object.assign(new Error('Silent task checks are supported only for Codex workers.'), { status: 409 });
    if (taskPing && agent.thread.status?.type === 'active' && !agent.turnId) throw Object.assign(new Error('Wait for the active native turn identity before a silent task check.'), { status: 409 });
    if (this.summaryJobs.has(id) || this.returnJobs.has(id) || agent.returnSummary?.delivered) throw Object.assign(new Error('Finish the branch handoff before sending another message.'), { status: 409 });
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
    if (agent.freshBranch && !report && !reportSetting && !taskPing) {
      const title = text.trim().split('\n')[0].slice(0, 120) || 'Image message';
      await this.rpc.call('thread/name/set', { threadId: id, name: title });
      agent.name = title; agent.goal = title; agent.freshBranch = false;
    }
    if (this.agents.get(id) !== agent) throw Object.assign(new Error('The worker was closed before message delivery.'), { status: 409 });
    if (agent.questions.length || statusOf(agent.thread) === 'attention') throw Object.assign(new Error('Answer the pending request before sending another message.'), { status: 409 });
    const clientUserMessageId = report || reportSetting || coordinatorEvent || taskPing ? (report ? 'ccng-report-' : reportSetting ? 'ccng-report-setting-' : coordinatorEvent ? 'ccng-event-' : 'ccng-task-ping-') + randomUUID() : null;
    const messageInput = markInternalInput(input(text.trim(), images), clientUserMessageId);
    const identity = clientUserMessageId ? { clientUserMessageId } : {};
    if (agent.thread.status?.type === 'active' && agent.turnId) {
      await this.rpc.call('turn/steer', { threadId: id, expectedTurnId: agent.turnId, input: messageInput, ...identity });
    } else {
      const { turn } = await this.rpc.call('turn/start', { threadId: id, input: messageInput, ...identity, additionalContext: context }); agent.turnId = turn.id; agent.thread.status = { type: 'active', activeFlags: [] }; this.changed();
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
        if (branch.questions.length) return finish(new Error('Resolve the branch question before preparing its summary again.'));
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
        try { await this.send(parentId, `Branch summary from "${branch.name}" (${branch.id}):\n\n${text}`); }
        catch (error) {
          const parent = this.agent(parentId);
          const waiting = parent.questions.length || statusOf(parent.thread) === 'attention';
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
    if (!this.watched.has(p.threadId)) return;
    if (!isHumanRequest(message.method)) { this.rpc.refuse(message.id, 'This client does not implement this internal tool. Use the original client for it.'); return; }
    const question = { id: message.id, method: message.method, params: p, reviewToken: randomUUID() };
    const key = requestKey(p.threadId, message.id);
    if (this.pending.has(key)) return;
    const agent = this.agents.get(p.threadId);
    this.pending.set(key, question); agent?.questions.push(question);
    this.nativeActivity(agent, p.turnId); this.changed();
    this.coordinator?.mark(p.threadId, 'Approval or question needs review', true);
  }
  answer(id, requestId, answer) {
    const agent = this.agent(id); if (agent.provider === 'claude') return this.claude.answer(agent, requestId, answer);
    const key = requestKey(id, requestId); const question = this.pending.get(key);
    if (!question || question.params.threadId !== id) throw Object.assign(new Error('This question has already been resolved.'), { status: 409 });
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
      if (this.agents.get(id)?.role === 'coordinator' && answer.decision === 'accept') throw Object.assign(new Error('Coordinator tool and filesystem/network restrictions must remain unchanged. This request cannot be granted here.'), { status: 403 });
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
    const agent = this.agents.get(threadId); if (agent) agent.questions = agent.questions.filter(q => q.id !== id);
    this.answerJobs.get(key)?.finish();
    if (agent) { this.coordinator?.markRemainingApprovals(threadId); void this.coordinator?.flush(threadId); }
  }
  notification({ method, params: p = {} }) {
    if (method === 'serverRequest/resolved') { this.removeQuestion(p.threadId, p.requestId); this.changed(); return; }
    if (method === 'warning' && typeof p.message === 'string' && p.message.trim()) {
      // Native rule-save failures can leave the current action approved. Keep the
      // warning visible without treating request resolution as persistence proof.
      if (p.threadId != null) {
        const target = this.agents.get(p.threadId); if (!target) return;
        target.nativeWarning = p.message.slice(0, 2000);
      } else this.nativeWarning = p.message.slice(0, 2000);
      this.changed(); return;
    }
    const id = p.threadId || p.thread?.id; const agent = this.agents.get(id); if (!agent) return;
    if (method === 'thread/status/changed' || method.startsWith('turn/') || method.startsWith('item/')) {
      this.nativeActivity(agent, method === 'turn/started' ? undefined : p.turnId || p.turn?.id);
    }
    if (method === 'thread/status/changed') agent.thread.status = p.status;
    if (method === 'thread/name/updated') agent.name = p.threadName || p.name || agent.name;
    if (method === 'thread/settings/updated') this.syncModel(agent, p.threadSettings?.model, p.threadSettings?.effort);
    if (method === 'turn/started') { agent.turnId = p.turn.id; agent.thread.status = { type: 'active', activeFlags: [] }; agent.tasks = []; agent.summary = null; if (!agent.returnSummary?.delivered) agent.returnSummary = null; }
    if (method === 'turn/completed') {
      agent.turnId = null; agent.thread.status = { type: 'idle' };
      agent.finishedTurn = { id: p.turn.id, status: p.turn.status };
      if (p.turn.error) agent.activity = { text: p.turn.error.message, state: 'failed' };
      if (p.turn.status === 'completed') {
        const reply = agent.messages.findLast(message => message.type === 'assistant' && message.turnId === p.turn.id);
        if (reply) { reply.branchable = true; reply.state = 'completed'; agent.lastCompletedTurnId = p.turn.id; }
      }
      void this.refreshTasks(id);
      this.coordinator?.completed(id);
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
