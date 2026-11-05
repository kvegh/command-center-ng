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

const run = promisify(execFile);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const bounded = value => String(value ?? '').slice(0, 32_000);
export const CLAUDE_APPROVAL = 'claude/tool/requestApproval';
export const CLAUDE_QUESTION = 'claude/tool/requestUserInput';
export const CLAUDE_ELICITATION = 'claude/mcp/elicitation/request';
export const isClaudeId = id => typeof id === 'string' && id.startsWith('claude-') && uuid.test(id.slice(7));
const sessionId = id => { if (!isClaudeId(id)) throw fail('Choose a valid local Claude session.', 400); return id.slice(7); };

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
  if (record.type === 'activity') agent.activity = { text: record.text.split('\n')[0].slice(0, 180), state: record.state };
}

function blocks(message) { return typeof message?.content === 'string' ? [{ type: 'text', text: message.content }] : Array.isArray(message?.content) ? message.content : []; }

export function addClaudeMessage(agent, message, turnId = message.uuid || 'history', timing = {}) {
  const id = message.uuid || randomUUID();
  const nativeTime = messageTime(message.timestamp);
  const time = nativeTime ? { timestamp: nativeTime, timestampSource: 'native' } : timing;
  const content = blocks(message.message); let images = [];
  if (message.type === 'user') for (const block of content) if (block.type === 'image' && block.source?.type === 'base64') {
    try { images = validateImages([...images, readInlineImage('data:' + block.source.media_type + ';base64,' + block.source.data)]); } catch { /* Unsupported or oversized native images stay unavailable; never fetch alternatives. */ }
  }
  if (images.length) put(agent, { id: id + ':0', nativeMessageId: id, turnId, type: 'user', text: bounded(content.filter(block => block.type === 'text').map(block => block.text || '').join('\n')), images, state: 'completed', ...time });
  for (const [index, block] of content.entries()) {
    if (block.type === 'text' && block.text && !images.length) put(agent, { id: id + ':' + index, nativeMessageId: id, turnId, type: message.type === 'assistant' ? 'assistant' : 'user', text: bounded(block.text), state: 'completed', ...time });
    if (block.type === 'tool_use') put(agent, { id: 'tool:' + block.id, turnId, type: 'activity', text: bounded(block.name + '\n' + JSON.stringify(block.input, null, 2)), state: 'inProgress' });
    if (block.type === 'tool_result') {
      const item = agent.messages.find(item => item.id === 'tool:' + block.tool_use_id);
      const output = typeof block.content === 'string' ? block.content : (block.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');
      put(agent, { id: 'tool:' + block.tool_use_id, turnId: item?.turnId || turnId, type: 'activity', text: bounded((item?.text || 'Claude tool result') + '\n\n' + output), state: block.is_error ? 'failed' : 'completed' });
    }
  }
  if (message.type === 'assistant' && typeof message.message?.model === 'string') { agent.currentTurnModel = message.message.model; if (!agent.sdkModelOverride) agent.model = message.message.model; }
}

/** Local native session files and SDK-owned processes; no remote transport/store. */
export class ClaudeSessions extends EventEmitter {
  constructor({ loadSdk = () => import('@anthropic-ai/claude-agent-sdk'), executable = nativeExecutable, activeSessions = readActiveClaudeSessions } = {}) {
    super(); this.loadSdk = loadSdk; this.findExecutable = executable; this.readActive = activeSessions;
    this.records = new Map(); this.runs = new Map(); this.starts = new Map(); this.requests = new Map(); this.available = false; this.error = null; this.activeCache = null; this.stopped = false;
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
    return { id, nativeSessionId: info.sessionId, provider: 'claude', role: 'worker', name: info.customTitle || info.summary || goal || 'Claude agent', goal: goal || info.firstPrompt || info.summary || 'No goal recorded', cwd: info.cwd, model: null, reasoningEffort: null, modelSettingsAvailable: false, thread: { id, cwd: info.cwd, status: { type: 'idle' } }, parentId: null, canSend: true, canBranch: false, messages: [], tasks: [], workers: [], questions: [], turnId: null, lastCompletedTurnId: null, olderCursor: null, activity: null, summary: null, reportIntervalMinutes: 0, reportError: null, observingOnly: true };
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
    this.ready(); const agent = this.make({ sessionId: randomUUID(), cwd, summary: goal.split('\n')[0].slice(0, 120) }, goal.split('\n')[0]); agent.newSession = true; agent.observingOnly = false; this.records.set(agent.id, agent); return agent;
  }
  async refresh(agent) {
    this.ready(); if (this.runs.has(agent.id)) return;
    const before = JSON.stringify([agent.canSend, agent.externalSession, agent.thread.status, agent.observeError, agent.managementNotice, agent.name]);
    const info = await this.sdk.getSessionInfo(agent.nativeSessionId, { dir: agent.cwd });
    if (!info && !agent.newSession) { agent.canSend = false; throw fail('This local Claude conversation is no longer available.', 404); }
    const version = info && Number.isFinite(info.lastModified) && Number.isFinite(info.fileSize) ? JSON.stringify([info.lastModified, info.fileSize]) : null;
    const historyChanged = version === null || version !== agent.historyVersion;
    if (historyChanged) {
      const messages = await this.sdk.getSessionMessages(agent.nativeSessionId, { dir: agent.cwd, includeSystemMessages: true });
      const previous = new Map(agent.messages.map(message => [message.id, message]));
      agent.messages = []; for (const message of messages.slice(-600)) addClaudeMessage(agent, message);
      for (const message of agent.messages) if (!message.timestamp && previous.get(message.id)?.timestamp) {
        const before = previous.get(message.id); message.timestamp = before.timestamp; message.timestampSource = before.timestampSource;
      }
      agent.historyVersion = version;
    }
    if (info?.customTitle) agent.name = info.customTitle;
    try {
      const active = await this.active(); agent.externalSession = active.has(agent.nativeSessionId); agent.canSend = !agent.externalSession;
      agent.managementNotice = agent.externalSession ? 'Claude is running in another local process. This tab follows its transcript; send and interrupt become available after that process releases the session.' : null;
      agent.thread.status = { type: agent.externalSession ? 'active' : 'idle' }; agent.observeError = null;
    } catch (error) { agent.canSend = false; agent.managementNotice = error.message; agent.observeError = error.message; }
    const after = JSON.stringify([agent.canSend, agent.externalSession, agent.thread.status, agent.observeError, agent.managementNotice, agent.name]);
    if (historyChanged || before !== after) this.changed(agent);
  }
  async startRun(agent, instructions, stillOpen) {
      if ((await this.active(true)).has(agent.nativeSessionId)) { agent.canSend = false; agent.externalSession = true; agent.thread.status = { type: 'active' }; agent.managementNotice = 'Claude is still running in another local process. Wait for it to finish before resuming this session here.'; this.changed(agent); throw fail(agent.managementNotice); }
      if (this.stopped) throw fail('Command Center is shutting down; no Claude process was started.', 503);
      if (!stillOpen()) throw fail('The worker was closed before starting its Claude process.');
      const inputs = new Inputs(), abortController = new AbortController();
      const job = { inputs, abortController, turnId: null, result: null, nativeStateSeen: false, streamId: null, streamText: '' };
      this.runs.set(agent.id, job); agent.externalSession = false; agent.canSend = true; agent.observingOnly = false; agent.managementNotice = null;
      try {
        job.query = this.sdk.query({ prompt: inputs, options: {
          cwd: agent.cwd, pathToClaudeCodeExecutable: this.executable, settingSources: ['user', 'project', 'local'],
          ...(agent.newSession ? { sessionId: agent.nativeSessionId, title: agent.name } : { resume: agent.nativeSessionId }),
          systemPrompt: { type: 'preset', preset: 'claude_code', append: instructions }, includePartialMessages: true, abortController,
          canUseTool: (name, input, options) => this.permission(agent, name, input, options),
          onElicitation: (request, options) => this.elicitation(agent, request, options)
        } });
        agent.modelSettingsAvailable = ['supportedModels', 'setModel', 'applyFlagSettings'].every(name => typeof job.query[name] === 'function');
        job.done = this.consume(agent, job); job.done.catch(() => {});
      } catch (error) { this.runs.delete(agent.id); throw error; }
      return job;
  }
  async send(agent, text, { instructions = '', stillOpen = () => true, priority, images = [] } = {}) {
    this.ready(); images = validateImages(images); let job = this.runs.get(agent.id);
    if (!job || this.starts.has(agent.id)) {
      let start = this.starts.get(agent.id);
      if (!start) { start = this.startRun(agent, instructions, stillOpen); this.starts.set(agent.id, start); }
      try { job = await start; } finally { if (this.starts.get(agent.id) === start) this.starts.delete(agent.id); }
      if (!stillOpen()) throw fail('The worker was closed before sending its Claude message.');
    }
    const messageId = randomUUID(); agent.runError = null;
    if (!agent.turnId) { job.turnId = messageId; agent.turnId = messageId; agent.thread.status = { type: 'active' }; }
    const timestamp = new Date().toISOString();
    put(agent, { id: messageId + ':0', nativeMessageId: messageId, turnId: job.turnId, type: 'user', text, ...(images.length ? { images } : {}), state: 'completed', timestamp, timestampSource: 'received' });
    const content = images.length ? [...images.map(image => ({ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.dataUrl.slice(image.dataUrl.indexOf(',') + 1) } })), ...(text ? [{ type: 'text', text }] : [])] : text;
    job.inputs.push({ type: 'user', session_id: agent.nativeSessionId, uuid: messageId, timestamp, parent_tool_use_id: null, ...(priority ? { priority } : {}), message: { role: 'user', content } });
    this.changed(agent);
  }
  async consume(agent, job) {
    try { for await (const message of job.query) {
      if (message.session_id && message.session_id !== agent.nativeSessionId) throw new Error('Claude returned a different session identity; this run was stopped.');
      if (message.type === 'system' && message.subtype === 'init') { if (!agent.sdkModelOverride) agent.model = message.model || agent.model; agent.newSession = false; }
      if (message.type === 'stream_event') {
        const event = message.event;
        if (event?.type === 'message_start') { if (!agent.turnId) { job.turnId = message.uuid || randomUUID(); agent.turnId = job.turnId; agent.thread.status = { type: 'active' }; } job.streamId = 'stream-' + event.message.id; job.streamText = ''; job.streamTimestamp = new Date().toISOString(); agent.model = event.message.model || agent.model; }
        if (event?.type === 'content_block_start' && event.content_block?.type === 'thinking') put(agent, { id: 'thinking:' + job.turnId, turnId: job.turnId, type: 'activity', text: 'Claude is thinking…', state: 'inProgress' });
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') { job.streamText += event.delta.text; job.streamTimestamp ||= new Date().toISOString(); put(agent, { id: job.streamId || 'stream-' + job.turnId, turnId: job.turnId, type: 'assistant', text: bounded(job.streamText), state: 'inProgress', timestamp: job.streamTimestamp, timestampSource: 'received' }); }
      }
      if (['assistant', 'user'].includes(message.type)) {
        const streamedId = job.streamId || 'stream-' + job.turnId;
        const stream = message.type === 'assistant' ? agent.messages.find(item => item.id === streamedId) : null;
        const timing = { timestamp: stream?.timestamp || new Date().toISOString(), timestampSource: stream?.timestampSource || 'received' };
        if (message.type === 'assistant') { agent.messages = agent.messages.filter(item => item.id !== streamedId); const thinking = agent.messages.find(item => item.id === 'thinking:' + job.turnId); if (thinking) thinking.state = 'completed'; job.streamId = null; job.streamTimestamp = null; job.streamText = ''; }
        addClaudeMessage(agent, message, job.turnId, timing);
        for (const block of blocks(message.message)) if (block.type === 'tool_result') this.confirm(agent, block.tool_use_id);
      }
      if (message.type === 'tool_progress' && message.tool_use_id) this.confirm(agent, message.tool_use_id);
      if (message.type === 'system' && message.subtype === 'permission_denied') put(agent, { id: message.uuid, turnId: job.turnId, type: 'activity', text: bounded(message.message || message.decision_reason || 'Claude denied a tool call.'), state: 'failed' });
      if (message.type === 'system' && message.subtype === 'session_state_changed') {
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
      if (this.runs.get(agent.id) === job) this.runs.delete(agent.id);
      job.inputs.close(); agent.turnId = null; agent.modelSettingsAvailable = false; agent.modelChange = null; agent.reasoningEffort = null; delete agent.sdkModelOverride;
      for (const question of [...agent.questions]) this.cancel(agent, question.id, 'The native Claude process ended.');
      if (agent.thread.status.type !== 'systemError') agent.thread.status = { type: 'idle' };
      this.changed(agent);
    }
  }
  finishTurn(agent, job) {
    const message = job.result; if (!message) return;
    agent.finishedTurn = { id: job.turnId, status: message.is_error ? 'failed' : 'completed' }; agent.lastCompletedTurnId = job.turnId;
    if (message.is_error) agent.runError = bounded((message.errors || []).join('\n') || 'Claude did not complete this turn.');
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
  async shutdown() {
    this.stopped = true;
    const active = [...this.runs.values()];
    for (const job of active) { job.inputs.close(); try { job.query.close?.(); } finally { job.abortController.abort(); } }
    await Promise.allSettled([...this.starts.values(), ...active.map(job => job.done)]);
  }
}
