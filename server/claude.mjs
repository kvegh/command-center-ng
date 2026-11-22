import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { formContent } from './native-requests.mjs';
import { validateModelChoice } from './worker-models.mjs';
import { messageTime } from './message-time.mjs';
import { readInlineImage, validateImages } from './image-input.mjs';
import { readClaudeMessages, claudeTaskNotification, claudeSubagentBinding, claudeSubagentName } from './claude-notifications.mjs';

const run = promisify(execFile);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const bounded = value => String(value ?? '').slice(0, 32_000);
const permissionModes = new Set(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto']);
export const CLAUDE_APPROVAL = 'claude/tool/requestApproval';
export const CLAUDE_QUESTION = 'claude/tool/requestUserInput';
export const CLAUDE_ELICITATION = 'claude/mcp/elicitation/request';
export const isClaudeId = id => typeof id === 'string' && id.startsWith('claude-') && uuid.test(id.slice(7));
export const MAX_CLAUDE_BRANCH_LINKS = 256;
const sessionId = id => { if (!isClaudeId(id)) throw fail('Choose a valid local Claude session.', 400); return id.slice(7); };
const subagentNames = new WeakMap();

function rememberSubagents(agent, message) {
  if (!agent.nativeSessionId || message.session_id !== agent.nativeSessionId) return;
  let names = subagentNames.get(agent);
  if (!names) { names = new Map(); subagentNames.set(agent, names); }
  const remember = (id, name, priority) => {
    if (typeof id !== 'string' || !id || id.length > 512 || !name || (names.get(id)?.priority || 0) > priority) return;
    if (names.get(id)?.name === name && names.get(id)?.priority === priority) return;
    names.set(id, { name, priority });
    if (names.size > 600) names.delete(names.keys().next().value);
    agent.messages = agent.messages.map(item => item.subagent?.id === id
      ? { ...item, subagent: { id, name }, ...(item.type === 'activity' ? { activityTitle: 'Message from subagent ' + name } : {}) } : item);
  };
  if (message.type === 'assistant') for (const block of blocks(message.message)) {
    if (block.type !== 'tool_use' || !['Agent', 'Task'].includes(block.name)) continue;
    const input = block.input;
    const name = claudeSubagentName(input?.name), description = claudeSubagentName(input?.description);
    remember(block.id, name || description || claudeSubagentName(input?.subagent_type), name ? 3 : description ? 2 : 1);
  }
  if (message.type === 'system' && ['task_started', 'task_progress'].includes(message.subtype)) {
    const description = claudeSubagentName(message.description);
    remember(message.tool_use_id, description || claudeSubagentName(message.subagent_type), description ? 2 : 1);
  }
}

function subagentOf(agent, message) {
  const binding = claudeSubagentBinding(message, agent.nativeSessionId);
  if (!binding) return null;
  const name = subagentNames.get(agent)?.get(binding.id)?.name || binding.name;
  return { id: binding.id, ...(name ? { name } : {}) };
}

class Inputs {
  values = []; waiting = null; ended = false;
  push(value) { if (this.ended) throw fail('The Claude input stream has ended.'); if (this.waiting) { this.waiting({ value, done: false }); this.waiting = null; } else this.values.push(value); }
  next() { if (this.values.length) return Promise.resolve({ value: this.values.shift(), done: false }); if (this.ended) return Promise.resolve({ done: true }); return new Promise(resolve => { this.waiting = resolve; }); }
  close() { this.ended = true; this.waiting?.({ done: true }); this.waiting = null; }
  [Symbol.asyncIterator]() { return this; }
}

async function nativeExecutable() {
  for (const directory of (process.env.PATH || '').split(':').filter(Boolean)) {
    const file = join(directory, 'claude'); try { await access(file, constants.X_OK); return file; } catch {}
  }
  throw fail('Install and sign in to the native Claude CLI on this backend host before managing Claude sessions.', 503);
}

export async function readActiveClaudeSessions(executable) {
  const { stdout } = await run(executable, ['agents', '--json'], { timeout: 5000, maxBuffer: 1_048_576, windowsHide: true });
  const rows = JSON.parse(stdout);
  if (!Array.isArray(rows)) throw fail('The native Claude active-session list could not be read safely.', 503);
  return rows.map(row => {
    const id = [row.sessionId, row.session_id, row.id].find(value => typeof value === 'string' && uuid.test(value));
    if (!id) throw fail('The native Claude active-session list uses an unsupported identity format. Session takeover was refused.', 503);
    return id;
  });
}

function put(agent, record) {
  const index = agent.messages.findIndex(item => item.id === record.id);
  const previous = agent.messages[index];
  if (previous?.timestamp && record.timestampSource === 'received') record = { ...record, timestamp: previous.timestamp, timestampSource: previous.timestampSource };
  if (index < 0) agent.messages.push(record); else agent.messages[index] = { ...agent.messages[index], ...record };
  agent.messages = agent.messages.slice(-600);
  if (record.type === 'activity') agent.activity = { text: (record.activityTitle || record.text.split('\n')[0]).slice(0, 180), state: record.state };
}

function blocks(message) { return typeof message?.content === 'string' ? [{ type: 'text', text: message.content }] : Array.isArray(message?.content) ? message.content : []; }

function questionTranscript(input) {
  const fields = input?.questions;
  if (!Array.isArray(fields) || !fields.length || fields.length > 8
    || fields.some(field => typeof field?.question !== 'string' || !field.question.trim())
    || fields.reduce((size, field) => size + field.question.length, 0) > 32_000) return null;
  return { questions: fields.map(field => field.question) };
}

export function addClaudeMessage(agent, message, turnId = message.uuid || 'history', timing = {}, { live = false } = {}) {
  rememberSubagents(agent, message);
  const subagent = ['assistant', 'user'].includes(message.type) ? subagentOf(agent, message) : null;
  const parentAssistant = message.type === 'assistant' && message.parent_tool_use_id == null;
  const id = message.uuid || randomUUID();
  const nativeTime = messageTime(message.timestamp);
  const time = nativeTime ? { timestamp: nativeTime, timestampSource: 'native' } : timing;
  // SDK synthetic user inputs become native isMeta transcript rows. The SDK
  // omits those rows from history; suppress their live text echoes as well.
  // Tool results still reconcile normally and assistant reports stay visible.
  const syntheticInput = message.type === 'user' && message.isSynthetic === true;
  const content = blocks(message.message); let images = [];
  const ownInput = live && !syntheticInput && message.type === 'user' && message.parent_tool_use_id == null && message.session_id === agent.nativeSessionId
    && agent.messages.find(item => item.type === 'user' && item.nativeMessageId === message.uuid && ['queued', 'unconfirmed'].includes(item.inputState));
  const inputReceipt = ownInput ? { inputState: 'received' } : {};
  // Persisted terminal replies have a native cutoff. Live replies wait for the
  // successful result/idle pair in finishTurn, including background activity.
  const completedReply = !live && parentAssistant && ['end_turn', 'stop_sequence'].includes(message.message?.stop_reason);
  if (message.type === 'user' && !syntheticInput) for (const block of content) if (block.type === 'image' && block.source?.type === 'base64') {
    try { images = validateImages([...images, readInlineImage('data:' + block.source.media_type + ';base64,' + block.source.data)]); } catch { /* Unsupported or oversized native images stay unavailable; never fetch alternatives. */ }
  }
  // A forwarded subagent user-role block is input inside the child transcript,
  // not a new instruction from the human in the parent conversation.
  const childInput = message.type === 'user' && subagent;
  if (images.length) put(agent, { id: id + ':0', nativeMessageId: id, turnId, type: childInput ? 'activity' : 'user', text: bounded(content.filter(block => block.type === 'text').map(block => block.text || '').join('\n')), images, state: 'completed', ...(subagent ? { subagent } : {}), ...(childInput ? { activityTitle: 'Message from subagent ' + (subagent.name || subagent.id) } : {}), ...time, ...inputReceipt });
  for (const [index, block] of content.entries()) {
    if (block.type === 'text' && block.text && !images.length && !syntheticInput) {
      const notification = claudeTaskNotification(message, agent.nativeSessionId, block.text);
      put(agent, { id: id + ':' + index, nativeMessageId: id, turnId, type: notification || childInput ? 'activity' : message.type === 'assistant' ? 'assistant' : 'user', text: bounded(block.text), state: 'completed', ...notification, ...(childInput ? { activityTitle: 'Message from subagent ' + (subagent.name || subagent.id) } : {}), ...(subagent ? { subagent } : {}), ...(message.type === 'assistant' ? { nativeStopReason: message.message?.stop_reason ?? null, ...(!parentAssistant ? { branchable: false } : {}) } : {}), ...(completedReply ? { branchable: true } : {}), ...time, ...inputReceipt });
    }
    if (block.type === 'tool_use') {
      // Question tools belong in readable history after their live card closes;
      // they remain native activity, never fabricated human input or authority.
      const transcript = message.type === 'assistant' && block.name === 'AskUserQuestion' && typeof block.id === 'string' && block.id
        ? questionTranscript(block.input) : null;
      const priorTool = agent.messages.find(item => item.id === 'tool:' + block.id)?.nativeTool;
      const sameTool = priorTool?.name === block.name ? priorTool : undefined;
      const requestedAt = nativeTime || sameTool?.requestedAt || (live ? new Date().toISOString() : undefined);
      const nativeTool = message.type === 'assistant' && typeof block.id === 'string' && block.id && typeof block.name === 'string' && block.name
        ? { ...sameTool, name: block.name.slice(0, 180), ...(typeof block.input?.description === 'string' ? { description: block.input.description.slice(0, 500) } : {}), ...(requestedAt ? { requestedAt, requestedAtSource: nativeTime ? 'native' : sameTool?.requestedAtSource || 'received' } : {}) } : null;
      put(agent, { id: 'tool:' + block.id, turnId, type: 'activity', text: bounded(block.name + '\n' + JSON.stringify(block.input, null, 2)), state: 'inProgress', ...(transcript ? { nativeQuestionTranscript: transcript } : {}), ...(nativeTool ? { nativeTool } : {}), ...time });
    }
    if (block.type === 'tool_result') {
      const item = agent.messages.find(item => item.id === 'tool:' + block.tool_use_id);
      const output = typeof block.content === 'string' ? block.content : (block.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');
      put(agent, { id: 'tool:' + block.tool_use_id, turnId: item?.turnId || turnId, type: 'activity', text: bounded((item?.text || 'Claude tool result') + '\n\n' + output), state: block.is_error ? 'failed' : 'completed', ...(item?.nativeQuestionTranscript ? { nativeQuestionTranscript: { ...item.nativeQuestionTranscript, result: bounded(output) } } : {}) });
    }
  }
  if (parentAssistant && typeof message.message?.model === 'string') { agent.currentTurnModel = message.message.model; if (!agent.sdkModelOverride) agent.model = message.message.model; }
}

/** Local native session files and SDK-owned processes; no remote transport/store. */
export class ClaudeSessions extends EventEmitter {
  constructor({ loadSdk = () => import('@anthropic-ai/claude-agent-sdk'), executable = nativeExecutable, activeSessions = readActiveClaudeSessions } = {}) {
    super(); this.loadSdk = loadSdk; this.findExecutable = executable; this.readActive = activeSessions;
    this.records = new Map(); this.runs = new Map(); this.starts = new Map(); this.requests = new Map(); this.available = false; this.error = null; this.activeCache = null; this.stopped = false;
    this.autoReviewSessions = new Set();
    this.permissionPreferences = new Map();
  }
  async initialize() {
    try {
      this.sdk = await this.loadSdk(); this.executable = await this.findExecutable();
      if (!['query', 'listSessions', 'getSessionInfo', 'getSessionMessages'].every(name => typeof this.sdk[name] === 'function')) throw new Error('The installed official Claude Agent SDK lacks required session interfaces.');
      this.available = true; this.error = null;
    } catch (error) { this.available = false; this.error = 'Local Claude is unavailable: ' + error.message; }
    return this.available;
  }
  ready() { if (!this.available || this.stopped) throw fail(this.error || 'Local Claude is unavailable or shutting down.', 503); }
  changed(agent) { this.emit('change', agent.id); }
  async active(force = false) {
    if (!force && this.activeCache && Date.now() - this.activeCache.at < 5000) return this.activeCache.job;
    const job = this.readActive(this.executable).then(ids => new Set(ids)); this.activeCache = { at: Date.now(), job };
    try { return await job; } catch (error) { this.activeCache = null; throw error; }
  }
  make(info, goal) {
    const id = 'claude-' + info.sessionId;
    return { id, nativeSessionId: info.sessionId, provider: 'claude', role: 'worker', name: info.customTitle || info.summary || goal || 'Claude agent', goal: goal || info.firstPrompt || info.summary || 'No goal recorded', cwd: info.cwd, model: null, reasoningEffort: null, modelSettingsAvailable: false, permissionSettingsAvailable: false, permissionMode: null, permissionChange: null, autoReviewConfigured: this.autoReviewSessions.has(id), thread: { id, cwd: info.cwd, status: { type: 'idle' } }, parentId: null, canSend: true, canBranch: typeof this.sdk?.forkSession === 'function', messages: [], tasks: [], workers: [], questions: [], turnId: null, lastCompletedTurnId: null, olderCursor: null, activity: null, summary: null, reportIntervalMinutes: 0, reportError: null, observingOnly: true };
  }
  async list(cursor) {
    this.ready(); const offset = cursor ? Number(cursor) : 0;
    if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) throw fail('Invalid Claude session page.', 400);
    const [sessions, active] = await Promise.all([this.sdk.listSessions({ limit: 50, offset, includeProgrammatic: true }), this.active().catch(() => null)]);
    return { agents: sessions.filter(info => uuid.test(info.sessionId) && typeof info.cwd === 'string').map(info => ({ id: 'claude-' + info.sessionId, provider: 'claude', name: info.customTitle || info.summary || 'Claude agent', cwd: info.cwd, status: active === null ? 'offline' : active.has(info.sessionId) ? 'running' : 'idle', parentId: null, forkedFromId: null })), nextCursor: sessions.length === 50 ? String(offset + 50) : null };
  }
  async open(id) {
    this.ready(); if (this.records.has(id)) { const agent = this.records.get(id); if (!this.runs.has(id)) await this.refresh(agent); return agent; }
    const info = await this.sdk.getSessionInfo(sessionId(id));
    if (!info || info.sessionId !== sessionId(id) || typeof info.cwd !== 'string') throw fail('This local Claude conversation is unavailable.', 404);
    const agent = this.make(info); this.records.set(id, agent);
    try { await this.refresh(agent); return agent; } catch (error) { this.records.delete(id); throw error; }
  }
  create(cwd, goal) {
    this.ready(); const agent = this.make({ sessionId: randomUUID(), cwd, summary: goal.split('\n')[0].slice(0, 120) }, goal.split('\n')[0]); agent.newSession = true; agent.observingOnly = false; this.records.set(agent.id, agent);
    // Keep the new-chat default as intent, independently of native status/fallbacks.
    this.permissionPreferences.set(agent.id, 'auto'); return agent;
  }
  async fork(source, lastTurnId) {
    this.ready();
    if (this.records.get(source.id) !== source || source.provider !== 'claude') throw fail('Choose an open local Claude conversation.', 400);
    if (typeof this.sdk.forkSession !== 'function') throw fail('The installed Claude SDK does not support session branching.', 503);
    const atReply = lastTurnId !== undefined && lastTurnId !== null;
    const reply = atReply && source.messages.findLast(message => message.type === 'assistant' && message.turnId === lastTurnId && message.branchable && message.state === 'completed' && uuid.test(message.nativeMessageId));
    if (atReply && (typeof lastTurnId !== 'string' || !reply)) throw fail('Choose a completed reply to branch from.', 400);
    const name = `Branch · ${source.goal}`.slice(0, 120);
    // Branches are new chats: retain an explicit source choice, otherwise use
    // the new-chat Auto default rather than a transient native fallback.
    const permissionMode = this.permissionPreferences.get(source.id) ?? 'auto';
    // The SDK copies only persisted native history. It never starts a query,
    // interrupts the parent or transfers its live permission callbacks.
    const result = await this.sdk.forkSession(source.nativeSessionId, { dir: source.cwd, title: name, ...(atReply ? { upToMessageId: reply.nativeMessageId } : {}) });
    if (!uuid.test(result?.sessionId) || result.sessionId === source.nativeSessionId || this.records.has('claude-' + result.sessionId)) throw fail('Claude did not return a new branch identity. Check native sessions before retrying.');
    this.permissionPreferences.set('claude-' + result.sessionId, permissionMode);
    // Preserve the known native relationship even if opening its view fails.
    this.emit('forked', 'claude-' + result.sessionId, source.id);
    let branch;
    try { branch = await this.open('claude-' + result.sessionId); }
    catch { throw fail(`Claude created branch claude-${result.sessionId}, but its view could not be opened. Reopen that session from Add agent instead of creating another branch.`); }
    branch.parentId = source.id; branch.name = name; branch.goal = source.goal; branch.freshBranch = true;
    this.changed(branch); return branch;
  }
  async refresh(agent) {
    this.ready(); if (this.runs.has(agent.id) || agent.newSession) return;
    const before = JSON.stringify([agent.canSend, agent.externalSession, agent.thread.status, agent.observeError, agent.managementNotice, agent.name]);
    const previousMessages = agent.messages;
    // Disk observation must not overwrite a run or newer native messages received
    // while SDK reads were pending. Collect first, then apply one current result.
    const current = () => !this.runs.has(agent.id) && agent.messages === previousMessages;
    let info, version, messages, active, activeError;
    try {
      info = await this.sdk.getSessionInfo(agent.nativeSessionId, { dir: agent.cwd });
      if (!info) throw fail('This local Claude conversation is no longer available.', 404);
      version = Number.isFinite(info.lastModified) && Number.isFinite(info.fileSize) ? JSON.stringify([info.lastModified, info.fileSize]) : null;
      if (version === null || version !== agent.historyVersion) {
        messages = await readClaudeMessages(this.sdk, agent.nativeSessionId, { dir: agent.cwd, includeSystemMessages: true });
      }
      try { active = await this.active(); } catch (error) { activeError = error; }
    } catch (error) {
      if (!current()) return;
      if (error.status === 404) agent.canSend = false;
      throw error;
    }
    if (!current()) return;
    if (messages) {
      const previous = new Map(previousMessages.map(message => [message.id, message]));
      agent.messages = []; subagentNames.delete(agent);
      // A spawning Agent call may precede the visible history window.
      for (const message of messages) rememberSubagents(agent, message);
      for (const message of messages.slice(-600)) addClaudeMessage(agent, message);
      for (const message of agent.messages) if (!message.timestamp && previous.get(message.id)?.timestamp) {
        const before = previous.get(message.id); message.timestamp = before.timestamp; message.timestampSource = before.timestampSource;
      }
      agent.historyVersion = version;
    }
    if (info.customTitle) agent.name = info.customTitle;
    if (activeError) { agent.canSend = false; agent.managementNotice = activeError.message; agent.observeError = activeError.message; }
    else {
      agent.externalSession = active.has(agent.nativeSessionId); agent.canSend = !agent.externalSession;
      agent.managementNotice = agent.externalSession ? 'Claude is running in another local process. This tab follows its transcript; send and interrupt become available after that process releases the session.' : null;
      agent.thread.status = { type: agent.externalSession ? 'active' : 'idle' }; agent.observeError = null;
    }
    const after = JSON.stringify([agent.canSend, agent.externalSession, agent.thread.status, agent.observeError, agent.managementNotice, agent.name]);
    if (messages || before !== after) this.changed(agent);
  }
  async startRun(agent, instructions, stillOpen) {
      if ((await this.active(true)).has(agent.nativeSessionId)) { agent.canSend = false; agent.externalSession = true; agent.thread.status = { type: 'active' }; agent.managementNotice = 'Claude is still running in another local process. Wait for it to finish before resuming this session here.'; this.changed(agent); throw fail(agent.managementNotice); }
      if (this.stopped) throw fail('Command Center is shutting down; no Claude process was started.', 503);
      if (!stillOpen()) throw fail('The worker was closed before starting its Claude process.');
      const inputs = new Inputs(), abortController = new AbortController();
      const job = { inputs, abortController, turnId: null, result: null, nativeStateSeen: false, streams: new Map(), pendingInputs: new Map(), turnInputIds: new Set(), backgroundTasks: new Map(), backgroundTrackingValid: true, handoffStateSeen: false, handoffIdle: false, closing: false };
      this.runs.set(agent.id, job); agent.externalSession = false; agent.canSend = true; agent.observingOnly = false; agent.managementNotice = null;
      agent.permissionMode = null; agent.permissionChange = null; agent.permissionSettingsAvailable = false;
      try {
        const permissionMode = this.permissionPreferences.get(agent.id) ?? (this.autoReviewSessions.has(agent.id) ? 'auto' : undefined);
        job.query = this.sdk.query({ prompt: inputs, options: {
          cwd: agent.cwd, pathToClaudeCodeExecutable: this.executable, settingSources: ['user', 'project', 'local'],
          // Reuse a selected per-chat mode on explicit resumes. Unchanged operator
          // defaults do not override a later acknowledged Manual choice.
          ...(permissionMode ? { permissionMode } : {}),
          ...(agent.newSession ? { sessionId: agent.nativeSessionId, title: agent.name } : { resume: agent.nativeSessionId }),
          systemPrompt: { type: 'preset', preset: 'claude_code', append: instructions }, includePartialMessages: true, abortController,
          canUseTool: (name, input, options) => this.permission(agent, name, input, options),
          onElicitation: (request, options) => this.elicitation(agent, request, options)
        } });
        agent.modelSettingsAvailable = ['supportedModels', 'setModel', 'applyFlagSettings'].every(name => typeof job.query[name] === 'function');
        agent.permissionSettingsAvailable = typeof job.query.setPermissionMode === 'function';
        job.done = this.consume(agent, job); job.done.catch(() => {});
      } catch (error) { this.runs.delete(agent.id); throw error; }
      return job;
  }
  async send(agent, text, { instructions = '', stillOpen = () => true, priority, images = [], report = false, reportSetting = false, clientMessageId, internal = false, requireIdle = false } = {}) {
    let inputAttempted = false;
    try {
      this.ready(); images = validateImages(images); let job = this.runs.get(agent.id);
      if (clientMessageId !== undefined && (typeof clientMessageId !== 'string' || !uuid.test(clientMessageId))) throw fail('Choose a valid Claude message identity.', 400);
      if (job?.closing) throw fail('This Claude process is closing after handback; no message was sent.');
      if (requireIdle && this.handoffBlocker(agent, job, { allowUnstarted: true, allowCompletedFailure: internal && requireIdle })) throw fail('Claude is no longer idle; the handback request was not sent.');
      if (agent.freshBranch && !report && !reportSetting && !internal && typeof this.sdk.renameSession === 'function') {
        const title = text.trim().split('\n')[0].slice(0, 120) || 'Image message';
        await this.sdk.renameSession(agent.nativeSessionId, title, { dir: agent.cwd });
        if (!stillOpen()) throw fail('The worker was closed before sending its Claude message.');
        agent.name = title; agent.goal = title; agent.freshBranch = false;
      }
      if (!job || this.starts.has(agent.id)) {
        let start = this.starts.get(agent.id);
        if (!start) { start = this.startRun(agent, instructions, stillOpen); this.starts.set(agent.id, start); }
        try { job = await start; } finally { if (this.starts.get(agent.id) === start) this.starts.delete(agent.id); }
        if (!stillOpen()) throw fail('The worker was closed before sending its Claude message.');
      }
      if (job.closing) throw fail('This Claude process is closing after handback; no message was sent.');
      if (requireIdle && this.handoffBlocker(agent, job, { allowUnstarted: true, allowCompletedFailure: internal && requireIdle })) throw fail('Claude is no longer idle; the handback request was not sent.');
      const messageId = clientMessageId ?? randomUUID();
      if (job.pendingInputs.has(messageId) || job.turnInputIds.has(messageId) || agent.handoffCompletions?.some(item => item.messageIds.includes(messageId))) throw fail('This Claude message identity was already submitted; verify native history before retrying.');
      agent.runError = null;
      if (!agent.turnId) { job.turnId = messageId; agent.turnId = messageId; agent.thread.status = { type: 'active' }; }
      const timestamp = new Date().toISOString();
      const syntheticInput = report === true || reportSetting === true;
      if (!syntheticInput) put(agent, { id: messageId + ':0', nativeMessageId: messageId, turnId: job.turnId, type: 'user', text, ...(images.length ? { images } : {}), state: 'completed', timestamp, timestampSource: 'received', inputState: 'queued' });
      const content = images.length ? [...images.map(image => ({ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.dataUrl.slice(image.dataUrl.indexOf(',') + 1) } })), ...(text ? [{ type: 'text', text }] : [])] : text;
      // Queue acceptance is not native receipt. Keep every input pending until an
      // exact native user echo arrives, including hidden report inputs.
      job.pendingInputs.set(messageId, text);
      try {
        inputAttempted = true;
        job.inputs.push({ type: 'user', session_id: agent.nativeSessionId, uuid: messageId, timestamp, parent_tool_use_id: null, ...(syntheticInput ? { isSynthetic: true } : {}), ...(priority ? { priority } : {}), message: { role: 'user', content } });
      } catch (error) {
        const queued = agent.messages.find(item => item.nativeMessageId === messageId && item.inputState === 'queued');
        if (queued) put(agent, { ...queued, inputState: 'unconfirmed' });
        this.changed(agent); throw error;
      }
      this.changed(agent);
      return { turnId: job.turnId, messageId };
    } catch (error) {
      if (!inputAttempted && error && typeof error === 'object') error.code = 'native_input_not_sent';
      throw error;
    }
  }
  async consume(agent, job) {
    try { for await (const message of job.query) {
      if (this.runs.get(agent.id) !== job) break;
      if (message.session_id && message.session_id !== agent.nativeSessionId) throw new Error('Claude returned a different session identity; this run was stopped.');
      const receivedAt = new Date().toISOString();
      if (message.session_id === agent.nativeSessionId) {
        agent.lastNativeEventAt = receivedAt;
        // Current native activity supersedes an earlier observation failure.
        agent.observeError = null;
      }
      rememberSubagents(agent, message);
      if (message.type === 'user' && message.session_id === agent.nativeSessionId && message.parent_tool_use_id == null && job.pendingInputs.has(message.uuid)) {
        const text = blocks(message.message).filter(block => block.type === 'text').map(block => block.text || '').join('\n');
        if (text === job.pendingInputs.get(message.uuid)) { job.pendingInputs.delete(message.uuid); job.turnInputIds.add(message.uuid); }
      }
      if (message.type === 'system' && message.subtype === 'background_tasks_changed') {
        // Native replacement snapshots cover both background Bash and subagents.
        // Edge notifications have unspecified ordering and must not mutate this set.
        const tasks = message.tasks;
        job.backgroundTrackingValid = message.session_id === agent.nativeSessionId && Array.isArray(tasks) && tasks.every(task => typeof task?.task_id === 'string' && task.task_id && typeof task.task_type === 'string');
        if (job.backgroundTrackingValid) job.backgroundTasks = new Map(tasks.map(task => [task.task_id, { id: task.task_id, type: task.task_type, description: bounded(task.description) }]));
      }
      const parentMessage = message.parent_tool_use_id == null;
      const subagent = subagentOf(agent, message);
      // Native parent tool IDs separate interleaved streams; child text must
      // never consume the parent's stream or advance parent report bookkeeping.
      const streamKey = parentMessage ? null : message.parent_tool_use_id;
      const thinkingId = 'thinking:' + job.turnId + (parentMessage ? '' : ':subagent:' + streamKey);
      if (message.type === 'system' && ['init', 'status'].includes(message.subtype) && permissionModes.has(message.permissionMode)) agent.permissionMode = message.permissionMode;
      if (message.type === 'system' && message.subtype === 'init') { if (!agent.sdkModelOverride) agent.model = message.model || agent.model; agent.newSession = false; }
      if (message.type === 'stream_event') {
        const event = message.event;
        if (event?.type === 'message_start') {
          if (parentMessage && !agent.turnId) { job.turnId = message.uuid || randomUUID(); agent.turnId = job.turnId; agent.thread.status = { type: 'active' }; }
          job.streams.set(streamKey, { id: 'stream-' + (parentMessage ? '' : 'subagent:' + streamKey + ':') + event.message.id, text: '', timestamp: receivedAt });
          if (parentMessage) agent.model = event.message.model || agent.model;
        }
        if (event?.type === 'content_block_start' && event.content_block?.type === 'thinking') put(agent, { id: thinkingId, turnId: job.turnId, type: 'activity', text: 'Claude is thinking…', state: 'inProgress' });
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const stream = job.streams.get(streamKey) || { id: 'stream-' + (parentMessage ? '' : 'subagent:' + streamKey + ':') + job.turnId, text: '', timestamp: receivedAt };
          stream.text = bounded(stream.text + event.delta.text); job.streams.set(streamKey, stream);
          put(agent, { id: stream.id, turnId: job.turnId, type: 'assistant', text: stream.text, state: 'inProgress', ...(subagent ? { subagent } : {}), timestamp: stream.timestamp, timestampSource: 'received' });
        }
      }
      if (['assistant', 'user'].includes(message.type)) {
        const streamedId = job.streams.get(streamKey)?.id;
        const stream = message.type === 'assistant' && streamedId ? agent.messages.find(item => item.id === streamedId) : null;
        const timing = { timestamp: stream?.timestamp || new Date().toISOString(), timestampSource: stream?.timestampSource || 'received' };
        if (message.type === 'assistant') { agent.messages = agent.messages.filter(item => item.id !== streamedId); const thinking = agent.messages.find(item => item.id === thinkingId); if (thinking) thinking.state = 'completed'; job.streams.delete(streamKey); }
        addClaudeMessage(agent, message, job.turnId, timing, { live: true });
        if (message.type === 'assistant' && parentMessage) this.emit('assistantMessageCompleted', agent.id, { id: stream?.id || message.uuid + ':0', turnId: job.turnId, type: 'assistant', state: 'completed', text: blocks(message.message).filter(block => block.type === 'text').map(block => block.text || '').join('\n') });
        for (const block of blocks(message.message)) if (block.type === 'tool_result') this.confirm(agent, block.tool_use_id);
      }
      if (message.type === 'tool_progress' && message.tool_use_id) {
        const item = message.session_id === agent.nativeSessionId && agent.messages.find(item => item.id === 'tool:' + message.tool_use_id && item.nativeTool && item.state === 'inProgress');
        if (item && (message.tool_name === undefined || message.tool_name === item.nativeTool.name)) {
          // A requested tool is not execution evidence. Only matching native
          // progress supplies a running update; receipt time is labelled as such.
          const elapsed = message.elapsed_time_seconds;
          put(agent, { ...item, nativeTool: { ...item.nativeTool, lastProgressAt: receivedAt, ...(typeof elapsed === 'number' && Number.isFinite(elapsed) && elapsed >= 0 ? { elapsedSeconds: elapsed } : {}) } });
        }
        this.confirm(agent, message.tool_use_id);
      }
      if (message.type === 'system' && message.subtype === 'permission_denied') put(agent, { id: message.uuid, turnId: job.turnId, type: 'activity', text: bounded(message.message || message.decision_reason || 'Claude denied a tool call.'), state: 'failed' });
      if (message.type === 'system' && message.subtype === 'session_state_changed') {
        job.handoffStateSeen ||= message.session_id === agent.nativeSessionId;
        job.handoffIdle = message.session_id === agent.nativeSessionId && message.state === 'idle';
        job.nativeStateSeen = true;
        if (message.state === 'idle' && job.result) this.finishTurn(agent, job);
        else if (message.state === 'running' || message.state === 'requires_action') { job.turnId ||= randomUUID(); agent.turnId = job.turnId; agent.thread.status = { type: 'active', activeFlags: message.state === 'requires_action' ? ['waitingOnApproval'] : [] }; }
      }
      if (message.type === 'result') {
        job.result = message;
        for (const question of [...agent.questions]) if (question.responding) this.confirm(agent, question.params.toolUseId, question.id);
        // Older runtimes expose only terminal results; current native state
        // events distinguish a finished turn from internally coalesced input.
        if (!job.nativeStateSeen) this.finishTurn(agent, job);
      }
      this.changed(agent);
    } } catch (error) { agent.runError = 'Claude session stopped: ' + error.message; agent.thread.status = { type: 'systemError' }; try { job.query.close?.(); } finally { job.abortController.abort(); } }
    finally {
      job.inputs.close();
      if (this.runs.get(agent.id) === job) {
        if (job.pendingInputs.size || job.turnInputIds.size || job.turnId || job.backgroundTasks.size || !job.backgroundTrackingValid || agent.questions.length || [...this.requests.keys()].some(key => JSON.parse(key)[0] === agent.id)) {
          // An ended process is not proof that tracked work completed. Preserve
          // uncertainty after EOF instead of turning missing evidence into idle.
          agent.runError ||= 'Claude process ended without confirming all local work settled; keep this conversation for verification.';
          agent.thread.status = { type: 'systemError' };
        }
        this.runs.delete(agent.id);
        agent.turnId = null; agent.modelSettingsAvailable = false; agent.modelChange = null; agent.reasoningEffort = null; delete agent.sdkModelOverride;
        agent.permissionSettingsAvailable = false; agent.permissionMode = null;
        if (agent.permissionChange) agent.permissionChange = { ...agent.permissionChange, status: 'unconfirmed', error: 'The managed Claude process ended; its current permission mode is unavailable.' };
        for (const question of [...agent.questions]) this.cancel(agent, question.id, 'The native Claude process ended.');
        if (agent.thread.status.type !== 'systemError') agent.thread.status = { type: 'idle' };
        this.changed(agent);
      }
    }
  }
  finishTurn(agent, job) {
    const message = job.result; if (!message) return;
    agent.finishedTurn = { id: job.turnId, status: message.is_error ? 'failed' : 'completed' }; agent.lastCompletedTurnId = job.turnId;
    if (message.is_error) agent.runError = bounded((message.errors || []).join('\n') || 'Claude did not complete this turn.');
    if (!message.is_error) {
      const reply = agent.messages.findLast(item => item.type === 'assistant' && !item.subagent && item.branchable !== false && item.turnId === job.turnId && item.nativeMessageId && item.state === 'completed');
      if (reply && reply.nativeStopReason !== 'tool_use') reply.branchable = true;
    }
    // Only a same-session result followed by authoritative native idle can
    // complete a handback request. Legacy UI result fallback stays separate.
    if (message.session_id === agent.nativeSessionId && job.handoffStateSeen && job.handoffIdle) {
      if (!Object.hasOwn(agent, 'handoffCompletedSequence')) Object.defineProperties(agent, {
        handoffCompletedSequence: { value: 0, writable: true },
        handoffCompletions: { value: [], writable: true }
      });
      const completion = { sequence: agent.handoffCompletedSequence + 1, messageIds: [...job.turnInputIds], status: message.is_error ? 'failed' : 'completed', text: bounded(message.result || ''), ...(message.is_error ? { error: agent.runError } : {}) };
      agent.handoffCompletedSequence = completion.sequence;
      agent.handoffCompletions = [...(agent.handoffCompletions || []), completion].slice(-32);
      job.turnInputIds.clear();
    }
    job.result = null; job.turnId = null; agent.turnId = null; agent.thread.status = { type: 'idle' };
    this.emit('completed', agent.id);
  }
  pending(agent, id, method, params, signal) {
    const key = JSON.stringify([agent.id, id]); if (this.requests.has(key)) return this.requests.get(key).promise;
    const question = { id, method, params: { ...params, threadId: agent.id }, reviewToken: randomUUID() };
    let resolve; const promise = new Promise(done => { resolve = done; });
    const abort = () => this.cancel(agent, id, 'The native Claude request was cancelled.');
    this.requests.set(key, { question, promise, resolve, signal, abort }); agent.questions.push(question);
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort(); this.changed(agent); return promise;
  }
  permission(agent, name, input, options = {}) {
    const id = options.requestId || options.toolUseID || randomUUID();
    return this.pending(agent, id, name === 'AskUserQuestion' ? CLAUDE_QUESTION : CLAUDE_APPROVAL, { toolName: name, input: structuredClone(input), toolUseId: options.toolUseID, reason: options.decisionReason || `Claude requests permission to use ${name}.`, blockedPath: options.blockedPath, defaultToNo: !!options.defaultToNo }, options.signal);
  }
  elicitation(agent, request, options = {}) {
    const id = options.requestId || request.elicitationId || randomUUID();
    return this.pending(agent, id, CLAUDE_ELICITATION, { ...request, mode: request.mode || 'form', reason: request.message || 'Claude MCP server needs your input.' }, options.signal);
  }
  answer(agent, id, answer) {
    const key = JSON.stringify([agent.id, id]), pending = this.requests.get(key);
    if (!pending || !agent.questions.includes(pending.question)) throw fail('This Claude request has already ended.');
    if (pending.question.responding) throw fail('The answer was already submitted; wait for Claude to continue.');
    if (!answer || typeof answer !== 'object' || Array.isArray(answer) || Object.keys(answer).some(key => !['requestId', 'decision', 'answers', 'content'].includes(key))) throw fail('Submit only the answer to this exact Claude request.', 400);
    const q = pending.question; let result;
    if (q.method === CLAUDE_ELICITATION) {
      if (!['accept', 'decline', 'cancel'].includes(answer.decision)) throw fail('Choose an explicit MCP form action.', 400);
      result = { action: answer.decision, ...(answer.decision === 'accept' && q.params.mode === 'form' ? { content: formContent(q.params.requestedSchema, answer.content) } : {}) };
      if (answer.decision === 'accept' && !['form', 'url'].includes(q.params.mode)) throw fail('This native MCP request format is not supported yet.', 400);
    } else if (q.method === CLAUDE_QUESTION) {
      if (answer.decision === 'decline') result = { behavior: 'deny', message: 'The user declined to answer this question.' };
      else {
        const fields = q.params.input.questions;
        if (!Array.isArray(fields) || !fields.length || fields.length > 8 || fields.some(field => !field || typeof field.question !== 'string' || !field.question.trim() || ['__proto__', 'constructor', 'prototype'].includes(field.question)) || new Set(fields.map(field => field.question)).size !== fields.length) throw fail('This Claude question format is unsupported.', 400);
        const answers = [];
        for (const field of fields) {
          const value = answer.answers?.[field.question];
          if (typeof value !== 'string' || !value.trim() || value.length > 8000) throw fail('Answer every Claude question.', 400);
          answers.push([field.question, value]);
        }
        result = { behavior: 'allow', updatedInput: { ...structuredClone(q.params.input), answers: Object.fromEntries(answers) } };
      }
    } else {
      if (!['accept', 'decline'].includes(answer.decision)) throw fail('Allow this exact tool call once or decline it.', 400);
      result = answer.decision === 'accept' ? { behavior: 'allow', updatedInput: structuredClone(q.params.input) } : { behavior: 'deny', message: 'The user declined this exact tool call.' };
    }
    q.responding = true; pending.resolve(result); this.changed(agent);
    // The callback submits a native control response; retain the card until
    // the matching tool result or a terminal native result confirms progress.
    return { submitted: true };
  }
  confirm(agent, toolUseId, id) {
    for (const question of [...agent.questions]) if (id !== undefined ? question.id === id : toolUseId && question.params.toolUseId === toolUseId) {
      const key = JSON.stringify([agent.id, question.id]), pending = this.requests.get(key);
      pending?.signal?.removeEventListener('abort', pending.abort); this.requests.delete(key); agent.questions = agent.questions.filter(item => item !== question);
    }
    this.changed(agent);
  }
  cancel(agent, id, message) {
    const pending = this.requests.get(JSON.stringify([agent.id, id]));
    if (pending && !pending.question.responding) pending.resolve(pending.question.method === CLAUDE_ELICITATION ? { action: 'cancel' } : { behavior: 'deny', message });
    this.confirm(agent, undefined, id);
  }
  async interrupt(agent) { const job = this.runs.get(agent.id); if (!job || !agent.turnId) throw fail('Only a Claude turn managed by this Command Center can be interrupted here.'); await job.query.interrupt(); }
  permissionSettings(agent) {
    const job = this.records.get(agent.id) === agent && this.runs.get(agent.id);
    const available = !!(this.available && !this.stopped && job?.query && typeof job.query.setPermissionMode === 'function');
    return { available, mode: available ? agent.permissionMode : null, change: agent.permissionChange || null, configuredAuto: this.autoReviewSessions.has(agent.id) };
  }
  async configureAutoReviewSessions(ids) {
    if (!Array.isArray(ids) || ids.length > 16 || ids.some(id => !isClaudeId(id))) throw fail('Choose at most sixteen valid local Claude session IDs for Auto-review.', 400);
    const selected = new Set(ids), previous = this.autoReviewSessions;
    const changes = [...new Set([...previous, ...selected])].filter(id => previous.has(id) !== selected.has(id))
      .map(id => ({ id, mode: selected.has(id) ? 'auto' : 'default', agent: this.records.get(id), job: this.runs.get(id) }));
    this.autoReviewSessions = selected;
    const results = [];
    for (const { id, mode, agent, job } of changes) {
      // A changed operator selection is new intent for future starts even if its
      // live control fails. It must not be masked by an older per-chat choice.
      this.permissionPreferences.delete(id);
      if (agent) { agent.autoReviewConfigured = selected.has(id); this.changed(agent); }
      // Only an existing owned process is updated. Unloaded sessions retain
      // this selection for their next explicit start without being resumed.
      if (!agent || !job || this.records.get(id) !== agent || this.runs.get(id) !== job) {
        results.push({ id, status: 'configured', mode, observedMode: null }); continue;
      }
      try {
        const state = await this.updatePermissionMode(agent, { mode });
        results.push({ id, status: state.change.status, mode, observedMode: state.mode });
      } catch (error) {
        results.push({ id, status: 'unconfirmed', mode, observedMode: this.permissionSettings(agent).mode, error: bounded(error.message) });
      }
    }
    return results;
  }
  async updatePermissionMode(agent, choice) {
    if (!choice || typeof choice !== 'object' || Array.isArray(choice) || Object.keys(choice).length !== 1 || !Object.hasOwn(choice, 'mode') || !['auto', 'default'].includes(choice.mode)) throw fail('Choose only a Claude permission mode: auto or default.', 400);
    this.ready();
    const job = this.runs.get(agent.id);
    if (!this.permissionSettings(agent).available) throw fail('Permission mode can change only in this currently managed Claude process. No session was started or resumed.');
    const query = job.query;
    const current = () => this.runs.get(agent.id) === job && job.query === query && this.records.get(agent.id) === agent && !this.stopped;
    if (agent.permissionChange?.status === 'pending') throw fail('A permission-mode change is already pending; wait for its native response.');
    const change = { mode: choice.mode, status: 'pending' };
    agent.permissionChange = change; this.changed(agent);
    try {
      if (!current()) throw fail('The managed Claude process changed before applying the permission mode.');
      await query.setPermissionMode(choice.mode);
      if (!current()) throw fail('The managed Claude process changed before confirmation; the outcome is unconfirmed.');
      // A control acknowledgement is separate from the latest native status,
      // which may already report a model-driven fallback to another mode.
      this.permissionPreferences.set(agent.id, choice.mode);
      change.status = 'acknowledged'; this.changed(agent); return this.permissionSettings(agent);
    } catch (error) {
      if (this.records.get(agent.id) === agent && agent.permissionChange === change) { agent.permissionChange = { ...change, status: 'unconfirmed', error: bounded(error.message) }; this.changed(agent); }
      throw error;
    }
  }
  async modelSettings(agent) {
    const query = this.runs.get(agent.id)?.query;
    if (!query) throw fail('Claude model choices are available after you start or resume this session here. Refresh choices after sending your first message. Reading settings does not start a model run.');
    const rows = await query.supportedModels(), seen = new Set();
    const models = [];
    for (const row of rows) {
      const model = typeof row.resolvedModel === 'string' ? row.resolvedModel : row.value;
      if (typeof model !== 'string' || seen.has(model)) continue; seen.add(model);
      models.push({ model, displayName: row.displayName || model, description: row.description || '', defaultEffort: null, efforts: (row.supportedEffortLevels || []).map(value => ({ value, description: '' })) });
    }
    return { models, model: agent.model, effort: agent.reasoningEffort ?? null, change: agent.modelChange || null };
  }
  async updateModel(agent, choice) {
    const { models } = await this.modelSettings(agent); validateModelChoice(models, choice);
    const query = this.runs.get(agent.id)?.query; if (!query) throw fail('This managed Claude process ended. Refresh its session first.');
    agent.modelChange = { ...choice, status: 'pending' }; this.changed(agent);
    try {
      await query.setModel(choice.model); agent.model = choice.model; agent.sdkModelOverride = choice.model;
      if (choice.effort !== null) { await query.applyFlagSettings({ effortLevel: choice.effort }); agent.reasoningEffort = choice.effort; }
      agent.modelChange.status = 'saved'; this.changed(agent); return { model: agent.model, effort: agent.reasoningEffort, change: agent.modelChange };
    } catch (error) { agent.modelChange = { ...choice, status: 'unconfirmed', error: error.message }; this.changed(agent); throw error; }
  }
  handoffBlocker(agent, job, { allowUnstarted = false, allowCompletedFailure = false } = {}) {
    const lastCompleted = agent.handoffCompletions?.at(-1);
    const knownCompletedFailure = allowCompletedFailure && lastCompleted?.status === 'failed' && lastCompleted.error === agent.runError;
    if (agent.observeError || (agent.runError && !knownCompletedFailure)) return agent.observeError || agent.runError;
    if (this.starts.has(agent.id)) return 'The Claude process is still starting.';
    if (agent.questions.length || [...this.requests.keys()].some(key => JSON.parse(key)[0] === agent.id)) return 'A native Claude request still needs its human response.';
    if (job?.pendingInputs.size) return 'Claude has not acknowledged every queued input.';
    if (job?.turnInputIds.size) return 'Claude has not completed every acknowledged input.';
    if (job && ((!job.handoffStateSeen && !allowUnstarted) || (job.handoffStateSeen && !job.handoffIdle) || !job.backgroundTrackingValid)) return 'Native Claude lifecycle or background-task tracking is unavailable.';
    if (job?.backgroundTasks.size) return 'Claude still has local background tasks.';
    if (agent.turnId || job?.turnId || agent.thread.status?.type !== 'idle' || agent.thread.status?.activeFlags?.length) return 'Claude has not reached a verified idle checkpoint.';
    return null;
  }
  async inspectHandoff(agent) {
    this.ready();
    if (this.records.get(agent.id) !== agent) throw fail('This Claude conversation is no longer open.');
    let job = this.runs.get(agent.id), external = false, error = null;
    try {
      if (!job) {
        const active = await this.active(true);
        external = active.has(agent.nativeSessionId);
        await this.refresh(agent);
        if (this.runs.get(agent.id) !== job) throw fail('The Claude process changed during its handback check.');
      }
    } catch (cause) { error = cause.message; }
    if (this.runs.get(agent.id) !== job) error = 'The Claude process changed during its handback check.';
    const queuedInputIds = [...(job?.pendingInputs.keys() || [])];
    const backgroundTasks = [...(job?.backgroundTasks.values() || [])];
    const status = agent.thread.status?.type;
    const reason = error || (external ? 'Claude is running in another local process; handback will not take it over.' : this.handoffBlocker(agent, job));
    return { status: error ? 'unknown' : status === 'idle' ? 'idle' : status === 'active' ? 'active' : 'unknown', safe: !reason, reason, managed: Boolean(job), external, queuedInputIds, backgroundTasks, completedSequence: agent.handoffCompletedSequence || 0, lastCompleted: agent.handoffCompletions?.at(-1) || null, completions: agent.handoffCompletions || [] };
  }
  async handoffReceipt(agent, { messageId, text }) {
    this.ready();
    if (!uuid.test(messageId || '') || typeof text !== 'string') throw fail('A native Claude receipt needs its exact message identity and text.', 400);
    // Read the native persisted chain, never the UI's queued local echo. The SDK
    // offsets from the beginning; scan bounded pages and fail closed beyond them.
    for (let offset = 0; offset < 30_000; offset += 500) {
      const messages = await this.sdk.getSessionMessages(agent.nativeSessionId, { dir: agent.cwd, offset, limit: 500 });
      if (!Array.isArray(messages)) throw fail('Claude native history returned an unsupported receipt format.');
      const receipt = messages.find(message => message.type === 'user' && message.session_id === agent.nativeSessionId && message.parent_tool_use_id == null && message.uuid === messageId
        && blocks(message.message).filter(block => block.type === 'text').map(block => block.text || '').join('\n') === text);
      if (receipt) return true;
      if (messages.length < 500) return false;
    }
    throw fail('Claude receipt verification reached its bounded history limit; the branch remains open.');
  }
  async closeForHandoff(agent, { timeoutMs = 10_000 } = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) throw fail('Choose a bounded Claude close timeout.', 400);
    const originalJob = this.runs.get(agent.id);
    const state = await this.inspectHandoff(agent);
    if (!state.safe) throw fail(state.reason);
    const job = this.runs.get(agent.id);
    if (job !== originalJob) throw fail('The Claude process changed during its handback close check.');
    const blocker = this.handoffBlocker(agent, job);
    if (blocker) throw fail(blocker);
    if (!job) return { closed: true, historyPreserved: true };
    // The SDK has no archive API. EOF releases an already settled managed
    // process without deleting history or force-cancelling native work/requests.
    job.closing = true; job.inputs.close();
    let timer;
    try {
      await Promise.race([job.done, new Promise((_, reject) => { timer = setTimeout(() => reject(fail('Claude process closure is unconfirmed; keep this branch and verify the existing process before retrying.')), timeoutMs); })]);
    } finally { clearTimeout(timer); }
    if (this.runs.has(agent.id) || agent.runError || agent.thread.status?.type !== 'idle') throw fail(agent.runError || 'Claude process closure could not be verified; the branch remains open.');
    return { closed: true, historyPreserved: true };
  }
  async shutdown() {
    this.stopped = true;
    const active = [...this.runs.values()];
    for (const job of active) { job.inputs.close(); try { job.query.close?.(); } finally { job.abortController.abort(); } }
    await Promise.allSettled([...this.starts.values(), ...active.map(job => job.done)]);
  }
}
