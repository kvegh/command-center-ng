import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { VERSION } from './version.mjs';
import { taskSummary, reportedPlan } from './task-summary.mjs';
import { BeadsTasks, sessionLabel } from './beads.mjs';
import { Coordinator, COORDINATOR_NAME, isCoordinatorThread } from './coordinator.mjs';
import { SUMMARY_LIMIT, SUMMARY_SCHEMA, summaryPrompt, readSummary } from './branch-summary.mjs';

export const input = text => [{ type: 'text', text, text_elements: [] }];
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

export class Workspace extends EventEmitter {
  constructor(rpc, { summaryTimeout = 120_000, answerTimeout = 10_000, recoveryTimeout = 2000, beads = new BeadsTasks(), coordinator = false } = {}) {
    super(); this.rpc = rpc; this.agents = new Map(); this.pending = new Map(); this.opening = new Set(); this.watched = new Set(); this.creating = 0; this.error = null;
    this.summaryJobs = new Map(); this.returnJobs = new Map(); this.summaryTimeout = summaryTimeout;
    this.workerReads = new Set(); this.beads = beads; this.trackerReads = new Map();
    this.answerJobs = new Map(); this.answerTimeout = answerTimeout;
    this.requestJobs = new Map(); this.recoveryTimeout = recoveryTimeout;
    this.coordinator = coordinator ? new Coordinator(this, typeof coordinator === 'object' ? coordinator : {}) : null;
    this.restoring = false; this.observedReads = new Map(); this.restoration = null;
    rpc.on('notification', message => this.notification(message));
    rpc.on('request', message => this.request(message));
    rpc.on('disconnected', message => {
      this.error = message;
      for (const job of this.answerJobs.values()) job.finish(Object.assign(new Error('Codex disconnected before confirming the answer. Check the native session.'), { status: 503 }));
      this.pending.clear(); for (const agent of this.agents.values()) agent.questions = [];
      this.changed();
    });
    rpc.on('connected', () => { this.error = null; this.changed(); });
  }
  changed() { this.emit('change'); }
  workerCount() { return [...this.agents.values()].filter(agent => agent.role !== 'coordinator').length; }
  workerSlots() { return this.workerCount() + [...this.opening].filter(id => id !== this.coordinator?.id).length + this.creating; }
  snapshot() {
    return { connected: this.rpc.ready, error: this.error, version: VERSION, restoration: this.restoration, coordinator: this.coordinator?.snapshot() || null, backgroundQuestions: [...this.pending.values()].filter(q => !this.agents.has(q.params.threadId)).length, agents: [...this.agents.values()].map(agent => ({ ...agent, ...taskSummary(agent), summarizing: this.summaryJobs.has(agent.id), returning: this.returnJobs.has(agent.id), recoveringRequests: this.requestJobs.has(agent.id), status: this.rpc.ready ? (agent.observingOnly && agent.thread.status?.type === 'notLoaded' ? 'idle' : statusOf(agent.thread, agent.questions)) : 'offline', thread: undefined })) };
  }
  agent(id) { const agent = this.agents.get(id); if (!agent) throw Object.assign(new Error('Open this agent first.'), { status: 404 }); return agent; }
  async list(cursor) {
    const result = await this.rpc.call('thread/list', { limit: 50, useStateDbOnly: true, ...(cursor ? { cursor } : {}) });
    return { agents: result.data.filter(t => !isCoordinatorThread(t)).map(t => ({ id: t.id, name: t.name || t.preview?.split('\n')[0]?.slice(0, 90) || 'Untitled agent', cwd: t.cwd, status: statusOf(t), parentId: t.parentThreadId || null, forkedFromId: t.forkedFromId || null })), nextCursor: result.nextCursor };
  }
  async open(id, { observeOnly = false } = {}) {
    if (this.agents.has(id)) return this.agent(id);
    const role = id === this.coordinator?.id ? 'coordinator' : 'worker';
    if (role === 'worker' && this.workerSlots() >= 4) throw Object.assign(new Error('Four agent tabs are open. Close a tab to open another; its agent keeps running.'), { status: 409 });
    if (this.opening.has(id)) throw Object.assign(new Error('This agent is already opening.'), { status: 409 });
    this.opening.add(id);
    try {
      const observed = await this.rpc.call('thread/read', { threadId: id });
      if (!observed.thread) throw Object.assign(new Error('The saved conversation is unavailable.'), { status: 404 });
      if (role === 'worker' && isCoordinatorThread(observed.thread)) throw Object.assign(new Error('A coordinator conversation cannot be opened as a worker. Open a worker conversation instead.'), { status: 409 });
      if (role === 'coordinator' && !isCoordinatorThread(observed.thread)) throw Object.assign(new Error('The saved coordinator ID belongs to a worker or an unrecognized coordinator. Check the saved workspace before continuing.'), { status: 409 });
      // Native resume may replay requests before the awaiting continuation runs.
      this.watched.add(id);
      const { thread, instructionSources } = observeOnly ? observed : await this.rpc.call('thread/resume', { threadId: id, excludeTurns: true });
      const agent = { id, name: thread.name || 'Codex agent', goal: thread.name || thread.preview?.split('\n')[0] || 'No goal recorded', cwd: thread.cwd, model: thread.model || null, thread, parentId: thread.forkedFromId || null, canSend: thread.canAcceptDirectInput !== false, messages: [], tasks: [], workers: [], questions: [], turnId: null, lastCompletedTurnId: null, olderCursor: null, activity: null, summary: null };
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
    if (agent.role === 'coordinator') return this.coordinator.activate({ force });
    const resumed = await this.rpc.call('thread/resume', { threadId: id, excludeTurns: true });
    agent.thread = resumed.thread; agent.instructionSources = resumed.instructionSources || [];
    agent.observingOnly = false; agent.canSend = resumed.thread.canAcceptDirectInput !== false;
    this.changed();
  }
  async recoverRequests(id) {
    if (this.requestJobs.has(id)) return this.requestJobs.get(id);
    const agent = this.agent(id);
    if (agent.questions.length) return { requests: agent.questions.length };
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
    const agent = this.agents.get(id); if (!agent?.observingOnly || !this.rpc.ready || this.restoring) return;
    if (this.observedReads.has(id)) return this.observedReads.get(id);
    const job = (async () => {
      try {
        const { thread } = await this.rpc.call('thread/read', { threadId: id });
        if (!thread) throw new Error('Saved conversation is unavailable.');
        const signature = value => JSON.stringify([value.status, value.updatedAt, value.preview]);
        const changed = signature(thread) !== signature(agent.thread); const recovered = !!agent.observeError; agent.thread = thread; agent.observeError = null;
        if (changed || thread.status?.type === 'active') { await this.history(id); this.changed(); }
        else if (recovered) this.changed();
        if (changed && agent.role !== 'coordinator') this.coordinator?.mark(id, 'Watched worker changed');
      } catch (error) { agent.observeError = error.message; this.changed(); }
    })();
    this.observedReads.set(id, job); try { await job; } finally { this.observedReads.delete(id); }
  }
  addItem(agent, item, turnId, branchable = false) {
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
    const text = itemText(item); if (!text) return;
    const record = { id: item.id, turnId, branchable, type: item.type === 'userMessage' ? 'user' : item.type === 'agentMessage' ? 'assistant' : 'activity', text, state: item.status || 'completed' };
    const previous = agent.messages.findIndex(m => m.id === item.id);
    if (previous >= 0) agent.messages[previous] = record; else agent.messages.push(record);
    if (agent.messages.length > 600) agent.messages = agent.messages.slice(-600);
    if (record.type === 'activity') agent.activity = { text: String(text).split('\n')[0].slice(0, 180), state: record.state };
  }
  async history(id, cursor) {
    const agent = this.agent(id);
    const page = await this.rpc.call('thread/turns/list', { threadId: id, limit: 20, itemsView: 'full', ...(cursor ? { cursor } : {}) });
    const current = { tasks: agent.tasks, workers: agent.workers.map(worker => ({ ...worker })), summary: agent.summary, activity: agent.activity };
    const live = agent.messages; agent.messages = []; if (!cursor) agent.turnId = null;
    for (const turn of [...page.data].reverse()) {
      agent.tasks = []; agent.summary = null;
      if (turn.status === 'inProgress') agent.turnId = turn.id;
      const lastReply = turn.status === 'completed' ? turn.items?.findLast(item => item.type === 'agentMessage') : null;
      if (lastReply && !cursor) agent.lastCompletedTurnId = turn.id;
      for (const item of turn.items || []) this.addItem(agent, item, turn.id, item.id === lastReply?.id);
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
  async taskCatalog(id) {
    const agent = this.agent(id);
    if (!this.beads) throw Object.assign(new Error('Beads is unavailable.'), { status: 503 });
    return this.beads.catalog(agent.cwd, id);
  }
  async linkTasks(id, ids) {
    const agent = this.agent(id);
    if (!this.beads) throw Object.assign(new Error('Beads is unavailable.'), { status: 503 });
    try { agent.tracker = await this.beads.setLinks(agent.cwd, id, ids); this.changed(); return agent.tracker; }
    catch (error) { await this.refreshTasks(id); throw error; }
  }
  async create({ goal, cwd }) {
    if (this.workerSlots() >= 4) throw Object.assign(new Error('Four tabs are already open.'), { status: 409 });
    if (typeof goal !== 'string' || !goal.trim() || goal.length > 2000) throw Object.assign(new Error('Enter a goal of 1–2000 characters.'), { status: 400 });
    if (goal.trim().split('\n')[0].slice(0, 120) === COORDINATOR_NAME) throw Object.assign(new Error('This name is reserved for the coordinator. Enter a worker goal.'), { status: 400 });
    if (typeof cwd !== 'string' || !isAbsolute(cwd) || !(await stat(cwd)).isDirectory()) throw Object.assign(new Error('Choose an existing absolute working-directory path.'), { status: 400 });
    if (this.workerSlots() >= 4) throw Object.assign(new Error('Four tabs are already open.'), { status: 409 });
    this.creating++; let reserved = true;
    try {
      // Do not override native model, permissions, instructions, or approval policy.
      const { thread } = await this.rpc.call('thread/start', { cwd });
      await this.rpc.call('thread/name/set', { threadId: thread.id, name: goal.trim().split('\n')[0].slice(0, 120) });
      this.creating--; reserved = false;
      const agent = await this.open(thread.id); agent.goal = goal.trim().split('\n')[0]; agent.name = agent.goal;
      await this.send(thread.id, goal.trim()); return thread.id;
    } finally { if (reserved) this.creating--; }
  }
  async send(id, text) {
    const agent = this.agent(id);
    if (this.summaryJobs.has(id) || this.returnJobs.has(id) || agent.returnSummary?.delivered) throw Object.assign(new Error('Finish the branch handoff before sending another message.'), { status: 409 });
    if (!agent.canSend) throw Object.assign(new Error('Codex does not allow direct input to this agent.'), { status: 409 });
    if (typeof text !== 'string' || !text.trim() || text.length > 32_000) throw Object.assign(new Error('Enter a message of 1–32000 characters.'), { status: 400 });
    if (agent.questions.length) throw Object.assign(new Error('Answer the pending question before sending another message.'), { status: 409 });
    if (statusOf(agent.thread) === 'attention') throw Object.assign(new Error('Load the pending request before sending another message.'), { status: 409 });
    await this.activate(id);
    if (agent.questions.length || statusOf(agent.thread) === 'attention') throw Object.assign(new Error('Answer the pending request before sending another message.'), { status: 409 });
    if (agent.freshBranch) {
      const title = text.trim().split('\n')[0].slice(0, 120);
      await this.rpc.call('thread/name/set', { threadId: id, name: title });
      agent.name = title; agent.goal = title; agent.freshBranch = false;
    }
    if (agent.thread.status?.type === 'active' && agent.turnId) {
      await this.rpc.call('turn/steer', { threadId: id, expectedTurnId: agent.turnId, input: input(text.trim()) });
    } else {
      const { turn } = await this.rpc.call('turn/start', { threadId: id, input: input(text.trim()), ...(this.beads && agent.role !== 'coordinator' ? { additionalContext: this.beads.context(id) } : {}) }); agent.turnId = turn.id; agent.thread.status = { type: 'active', activeFlags: [] }; this.changed();
    }
  }
  async interrupt(id) {
    const agent = this.agent(id);
    if (!agent.turnId) throw Object.assign(new Error('There is no active turn to interrupt.'), { status: 409 });
    await this.rpc.call('turn/interrupt', { threadId: id, turnId: agent.turnId });
  }
  async fork(id, lastTurnId) {
    const source = this.agent(id);
    if (source.role === 'coordinator') throw Object.assign(new Error('Branch a worker conversation instead.'), { status: 400 });
    const point = lastTurnId || source.lastCompletedTurnId;
    if (!point || !source.messages.some(message => message.turnId === point && message.branchable)) throw Object.assign(new Error('Choose a completed reply to branch from.'), { status: 400 });
    if (this.workerSlots() >= 4) throw Object.assign(new Error('Close an agent tab before opening a branch. Conversations are kept.'), { status: 409 });
    this.creating++; let reserved = true;
    try {
      const { thread } = await this.rpc.call('thread/fork', { threadId: id, lastTurnId: point, excludeTurns: true, deferGoalContinuation: true });
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
    const replace = this.workerSlots() >= 4;
    if (replace) this.agents.delete(id);
    try { await this.open(parentId); return parentId; }
    catch (error) { if (replace) this.agents.set(id, branch); this.changed(); throw error; }
  }
  idleBranch(id) {
    const branch = this.agent(id);
    if (!branch.parentId) throw Object.assign(new Error('This conversation has no parent branch.'), { status: 400 });
    if (statusOf(branch.thread, branch.questions) !== 'idle') throw Object.assign(new Error('Wait for the branch to finish and resolve its questions before returning it.'), { status: 409 });
    return branch;
  }
  async summarize(id) {
    if (this.summaryJobs.has(id)) return this.summaryJobs.get(id);
    const branch = this.idleBranch(id);
    if (branch.returnSummary?.delivered || branch.returnSummary?.turnId === branch.lastCompletedTurnId) return branch.returnSummary;
    if (this.returnJobs.has(id)) throw Object.assign(new Error('This branch is already being returned.'), { status: 409 });
    const job = this.generateSummary(branch); this.summaryJobs.set(id, job); this.changed();
    try { return await job; } finally { this.summaryJobs.delete(id); this.changed(); }
  }
  async generateSummary(branch) {
    await this.refreshTasks(branch.id);
    const { turn } = await this.rpc.call('turn/start', { threadId: branch.id, input: input(summaryPrompt(branch.goal, branch.tracker?.tasks)), outputSchema: SUMMARY_SCHEMA });
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
    if (this.returnJobs.has(id)) return this.returnJobs.get(id);
    const branch = this.idleBranch(id);
    if (typeof text !== 'string' || !text.trim() || text.length > SUMMARY_LIMIT) throw Object.assign(new Error(`Enter a concise summary of up to ${SUMMARY_LIMIT} characters.`), { status: 400 });
    if (this.summaryJobs.has(id) || !branch.returnSummary || (!branch.returnSummary.delivered && branch.returnSummary.turnId !== branch.lastCompletedTurnId)) throw Object.assign(new Error('Prepare a current branch summary before returning it.'), { status: 409 });
    const job = this.finishReturn(branch, text.trim()); this.returnJobs.set(id, job); this.changed();
    try { return await job; } finally { this.returnJobs.delete(id); this.changed(); }
  }
  async finishReturn(branch, text) {
    const parentWasOpen = this.agents.has(branch.parentId);
    try {
      const parentId = await this.parent(branch.id);
      if (!branch.returnSummary.delivered) {
        await this.send(parentId, `Branch summary from "${branch.name}" (${branch.id}):\n\n${text}`);
        branch.returnSummary.text = text; branch.returnSummary.delivered = true; this.changed();
      }
      const { thread } = await this.rpc.call('thread/read', { threadId: branch.id });
      branch.thread = thread;
      if (statusOf(thread, branch.questions) !== 'idle') throw new Error('Wait for the child session to finish before closing it.');
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
    if (message.method === 'currentTime/read') { this.rpc.respond(message.id, { currentTime: new Date().toISOString() }); return; }
    if (message.method === 'item/tool/call' && p.threadId === this.coordinator?.id) { void this.coordinator.handle(message); return; }
    if (!this.watched.has(p.threadId)) return;
    const supported = ['item/tool/requestUserInput', 'item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'mcpServer/elicitation/request', 'item/permissions/requestApproval'];
    if (!supported.includes(message.method)) { this.rpc.refuse(message.id, 'This client does not implement this tool. Use the Codex client for it.'); return; }
    const question = { id: message.id, method: message.method, params: p, reviewToken: randomUUID() };
    const key = requestKey(p.threadId, message.id);
    if (this.pending.has(key)) return;
    this.pending.set(key, question); this.agents.get(p.threadId)?.questions.push(question); this.changed();
    this.coordinator?.mark(p.threadId, 'Approval or question needs review', true);
  }
  answer(id, requestId, answer) {
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
    } else if (question.method === 'item/permissions/requestApproval') {
      // Broad permission grants remain in the native client; refusing is safe and explicit.
      if (answer.decision !== 'decline') throw Object.assign(new Error('Grant filesystem/network permissions in the native Codex client.'), { status: 400 });
      result = { permissions: {} };
    } else if (question.method === 'mcpServer/elicitation/request') {
      if (answer.decision !== 'decline') throw Object.assign(new Error('Complete this app form in the native Codex client.'), { status: 400 });
      result = { action: 'decline' };
    } else {
      if (!['accept', 'decline', 'cancel'].includes(answer.decision)) throw Object.assign(new Error('Invalid approval decision.'), { status: 400 });
      result = { decision: answer.decision };
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
    if (agent) void this.coordinator?.flush(threadId);
  }
  notification({ method, params: p = {} }) {
    if (method === 'serverRequest/resolved') { this.removeQuestion(p.threadId, p.requestId); this.changed(); return; }
    const id = p.threadId || p.thread?.id; const agent = this.agents.get(id); if (!agent) return;
    if (method === 'thread/status/changed') agent.thread.status = p.status;
    if (method === 'thread/name/updated') agent.name = p.threadName || p.name || agent.name;
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
    if (method === 'item/started' || method === 'item/completed') this.addItem(agent, p.item, p.turnId);
    if (method === 'item/agentMessage/delta') {
      const existing = agent.messages.find(m => m.id === p.itemId);
      if (existing) existing.text += p.delta;
      else agent.messages.push({ id: p.itemId, turnId: p.turnId, type: 'assistant', text: p.delta, state: 'inProgress' });
    }
    this.changed();
  }
}
