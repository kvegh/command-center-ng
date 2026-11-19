import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { AcpRpc } from './acp.mjs';
import { formContent, formFields } from './native-requests.mjs';
import { validateImages } from './image-input.mjs';
import { validateModelChoice } from './worker-models.mjs';

export const MISTRAL_APPROVAL = 'mistral/permission/requestApproval';
export const MISTRAL_QUESTION = 'mistral/userInput/request';
export const MISTRAL_UNSUPPORTED = 'mistral/unsupported/request';
const nativeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
export const isMistralId = id => typeof id === 'string' && id.startsWith('mistral-') && nativeId(id.slice(8));
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const bounded = value => String(value ?? '').slice(0, 32_000);
const textContent = content => content?.type === 'text' && typeof content.text === 'string' ? content.text : '';
const receiptTime = () => ({ timestamp: new Date().toISOString(), timestampSource: 'received' });

export async function findMistralExecutable({ path = process.env.PATH || '' } = {}) {
  for (const directory of path.split(delimiter).filter(isAbsolute)) {
    const executable = join(directory, 'vibe-acp');
    try { await access(executable, constants.X_OK); return executable; } catch { /* Try the next existing PATH entry. */ }
  }
  throw new Error('Install the official Mistral Vibe executable separately and make vibe-acp available on PATH.');
}

/** Local Vibe ACP ownership. Saved sessions are listed without session/load or takeover. */
export class MistralSessions extends EventEmitter {
  constructor({ executable = findMistralExecutable, createTransport = options => new AcpRpc(options), clientVersion = 'unknown' } = {}) {
    super(); this.findExecutable = executable; this.createTransport = createTransport; this.clientVersion = clientVersion;
    this.records = new Map(); this.runs = new Map(); this.requests = new Map(); this.unboundRequests = new Map(); this.sessionInfo = new Map(); this.toolCalls = new Map(); this.available = false; this.error = null; this.stopped = false;
  }
  async initialize() {
    try { this.executable = await this.findExecutable(); this.available = true; this.error = null; }
    catch (error) { this.available = false; this.error = 'Local Mistral is unavailable: ' + bounded(error.message); }
    return this.available;
  }
  ready() { if (!this.available || this.stopped) throw fail(this.error || 'Local Mistral is unavailable or shutting down.', 503); }
  changed(agent) { this.emit('change', agent.id); }
  async connect() {
    this.ready();
    if (!this.connection) this.connection = this.startConnection();
    return this.connection;
  }
  async startConnection() {
    const rpc = this.createTransport({ executable: this.executable }); this.rpc = rpc;
    rpc.on('notification', message => this.notification(message)); rpc.on('request', request => this.request(request));
    rpc.on('disconnected', error => this.disconnected(error));
    await rpc.start();
    const result = await rpc.call('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false, elicitation: { form: {} } }, clientInfo: { name: 'command-center-ng', title: 'Command Center NG', version: this.clientVersion } });
    if (result?.protocolVersion !== 1 || !object(result.agentCapabilities)) { await rpc.close(); throw fail('The installed Mistral ACP protocol is incompatible; version 1 is required.', 503); }
    this.capabilities = result.agentCapabilities; this.agentInfo = result.agentInfo || null;
    return rpc;
  }
  make(info, { managed = false, goal = '' } = {}) {
    if (!nativeId(info.sessionId) || typeof info.cwd !== 'string' || !isAbsolute(info.cwd)) throw fail('Mistral returned an unsupported local session identity or directory.', 502);
    const id = 'mistral-' + info.sessionId, name = bounded(goal || info.title || 'Mistral agent').split('\n')[0].slice(0, 120);
    return { id, nativeSessionId: info.sessionId, provider: 'mistral', role: 'worker', name, goal: goal || info.title || 'No goal recorded', cwd: info.cwd, model: null, reasoningEffort: null, modelSettingsAvailable: false, permissionSettingsAvailable: false, permissionMode: null, thread: { id, cwd: info.cwd, status: { type: managed ? 'idle' : 'notLoaded' } }, parentId: null, canSend: managed, canBranch: false, messages: [], tasks: [], workers: [], questions: [], turnId: null, lastCompletedTurnId: null, olderCursor: null, activity: null, summary: null, reportIntervalMinutes: 0, reportError: null, observingOnly: !managed, externalSession: !managed, managementNotice: managed ? null : 'This saved Mistral session is metadata only. ACP loading starts a native engine, so CCNG has not loaded history, resumed work or taken control. Continue in its original client or create a new Mistral chat.', configOptions: [] };
  }
  async list(cursor) {
    if (cursor != null && (typeof cursor !== 'string' || cursor.length > 2048)) throw fail('Invalid Mistral session page.', 400);
    const rpc = await this.connect();
    if (!object(this.capabilities.sessionCapabilities?.list)) throw fail('The installed Mistral ACP runtime does not advertise session discovery.', 503);
    const result = await rpc.call('session/list', cursor ? { cursor } : {});
    if (!Array.isArray(result?.sessions) || result.sessions.length > 1000 || result.nextCursor != null && (typeof result.nextCursor !== 'string' || result.nextCursor.length > 2048 || result.nextCursor === cursor)) throw fail('Mistral returned an invalid session page.', 502);
    const agents = [];
    for (const info of result.sessions) {
      if (!nativeId(info?.sessionId) || typeof info.cwd !== 'string' || !isAbsolute(info.cwd)) continue;
      this.sessionInfo.set(info.sessionId, { sessionId: info.sessionId, cwd: info.cwd, title: typeof info.title === 'string' ? info.title.slice(0, 120) : 'Mistral agent' });
      const id = 'mistral-' + info.sessionId, agent = this.records.get(id);
      agents.push({ id, provider: 'mistral', name: agent?.name || info.title || 'Mistral agent', cwd: info.cwd, status: this.runs.has(id) ? 'running' : agent?.canSend ? 'idle' : 'offline', parentId: null });
    }
    // Bound passive metadata independently of the native history store.
    while (this.sessionInfo.size > 5000) this.sessionInfo.delete(this.sessionInfo.keys().next().value);
    return { agents, nextCursor: result.nextCursor || null };
  }
  async open(id) {
    this.ready(); if (!isMistralId(id)) throw fail('Choose a valid local Mistral session.', 400);
    if (this.records.has(id)) return this.records.get(id);
    const sessionId = id.slice(8); let info = this.sessionInfo.get(sessionId), cursor = null;
    for (let page = 0; !info && page < 20; page++) {
      const result = await this.list(cursor); info = this.sessionInfo.get(sessionId); if (!result.nextCursor) break; cursor = result.nextCursor;
    }
    if (!info) throw fail('This local Mistral session is unavailable in the native session list.', 404);
    const agent = this.make(info); this.records.set(id, agent); return agent;
  }
  async create(cwd, goal) {
    if (typeof cwd !== 'string' || !isAbsolute(cwd) || typeof goal !== 'string') throw fail('Choose an absolute directory and a goal for Mistral.', 400);
    const rpc = await this.connect(); const result = await rpc.call('session/new', { cwd, mcpServers: [] });
    if (!nativeId(result?.sessionId) || this.records.has('mistral-' + result.sessionId)) throw fail('Mistral did not return a new supported session identity. Check native sessions before retrying.', 502);
    const agent = this.make({ sessionId: result.sessionId, cwd }, { managed: true, goal }); this.records.set(agent.id, agent); this.applySettings(agent, result);
    for (const request of this.unboundRequests.values()) if (request.params?.sessionId === agent.nativeSessionId) { this.unboundRequests.delete(request.id); this.request(request); }
    return agent;
  }
  managed(agent) {
    this.ready();
    if (this.records.get(agent?.id) !== agent || agent.provider !== 'mistral' || agent.observingOnly || !agent.canSend || this.rpc?.closed) throw fail('This Mistral session is not controlled by the current CCNG process. No work was resumed.');
  }
  async refresh(agent) {
    this.ready(); if (this.records.get(agent?.id) !== agent) throw fail('Choose an open Mistral session.', 400);
    // There is no passive ACP history-read interface. In particular do not load,
    // resume, replay prompts or infer that another client's saved session is idle.
    return agent;
  }
  async send(agent, text, { instructions = '', context = '', images = [], stillOpen = () => true, report = false, reportSetting = false } = {}) {
    this.managed(agent); if (this.runs.has(agent.id) || agent.questions.length) throw fail('Wait for the current Mistral turn or answer its native request first.');
    if (typeof text !== 'string' || text.length > 500_000) throw fail('The Mistral message is invalid or too large.', 400);
    images = validateImages(images);
    if (images.length && this.capabilities.promptCapabilities?.image !== true) throw fail('This Mistral runtime does not advertise image input.', 400);
    if (!stillOpen()) throw fail('The worker was closed before sending its Mistral message.');
    const turnId = randomUUID(), messageId = randomUUID(), job = { turnId, assistantIds: new Set(), segment: 0 };
    const prompt = [], runtimeContext = [instructions, context].filter(value => typeof value === 'string' && value).join('\n\n');
    if (runtimeContext) {
      if (runtimeContext.length > 500_000) throw fail('Mistral runtime instructions are too large.', 400);
      if (this.capabilities.promptCapabilities?.embeddedContext) prompt.push({ type: 'resource', resource: { uri: 'ccng://runtime-instructions/' + turnId, mimeType: 'text/plain', text: runtimeContext } });
      else prompt.push({ type: 'text', text: '[CCNG runtime instructions]\n' + runtimeContext + '\n[End runtime instructions]' });
    }
    for (const image of images) prompt.push({ type: 'image', mimeType: image.mimeType, data: image.dataUrl.slice(image.dataUrl.indexOf(',') + 1) });
    if (text) prompt.push({ type: 'text', text });
    if (!prompt.length) throw fail('Enter a message or attach an image.', 400);
    if (!report && !reportSetting) this.put(agent, { id: messageId, nativeMessageId: messageId, turnId, type: 'user', text, ...(images.length ? { images } : {}), state: 'completed', inputState: 'unconfirmed', ...receiptTime() });
    agent.turnId = turnId; agent.thread.status = { type: 'active' }; agent.runError = null; this.runs.set(agent.id, job);
    // A prompt remains pending across native approvals. A long bound reports an
    // unknown outcome; it never retries or treats expiry as native completion.
    const operation = this.rpc.call('session/prompt', { sessionId: agent.nativeSessionId, prompt }, { timeoutMs: 24 * 60 * 60 * 1000 });
    job.done = operation.then(result => this.finish(agent, job, result), error => this.finish(agent, job, null, error));
    this.changed(agent);
    await operation.written;
    const input = agent.messages.find(message => message.nativeMessageId === messageId); if (input && this.runs.get(agent.id) === job && !agent.observingOnly) input.inputState = 'queued';
    this.changed(agent); return { turnId, messageId };
  }
  put(agent, message) {
    const index = agent.messages.findIndex(item => item.id === message.id);
    if (index >= 0) agent.messages[index] = { ...agent.messages[index], ...message }; else agent.messages.push(message);
  }
  notification(message) {
    if (message.method !== 'session/update') return;
    const { sessionId, update } = message.params || {}, agent = this.records.get('mistral-' + sessionId);
    if (!agent || agent.observingOnly || !object(update)) return;
    agent.lastNativeEventAt = new Date().toISOString(); const job = this.runs.get(agent.id);
    if (['agent_message_chunk', 'agent_thought_chunk'].includes(update.sessionUpdate) && job) {
      const thinking = update.sessionUpdate === 'agent_thought_chunk', id = `${thinking ? 'thinking' : 'assistant'}:${job.turnId}:${job.segment}`, old = agent.messages.find(item => item.id === id);
      this.put(agent, { id, turnId: job.turnId, type: thinking ? 'activity' : 'assistant', text: (old?.text || '') + textContent(update.content), state: 'inProgress', ...(old ? {} : receiptTime()) });
      if (!thinking) job.assistantIds.add(id);
    } else if (['tool_call', 'tool_call_update'].includes(update.sessionUpdate) && typeof update.toolCallId === 'string') {
      const id = 'tool:' + update.toolCallId, old = agent.messages.find(item => item.id === id);
      const key = JSON.stringify([agent.id, update.toolCallId]);
      this.toolCalls.set(key, { ...this.toolCalls.get(key), ...structuredClone(update) });
      const content = (Array.isArray(update.content) ? update.content : []).map(part => textContent(part.content)).filter(Boolean).join('\n');
      this.put(agent, { id, turnId: job?.turnId || null, type: 'activity', text: [update.title || old?.nativeTool?.name || 'Mistral tool', content].filter(Boolean).join('\n'), state: update.status === 'completed' ? 'completed' : update.status === 'failed' ? 'failed' : 'inProgress', nativeTool: { name: update.title || old?.nativeTool?.name || 'Mistral tool', description: bounded(update.kind || old?.nativeTool?.description || '') }, ...(old ? {} : receiptTime()) });
      if (job && update.sessionUpdate === 'tool_call') job.segment++;
      for (const pending of [...this.requests.values()]) if (pending.agent === agent && pending.question.responding && (pending.question.params.toolCall?.toolCallId || pending.question.params.toolCallId) === update.toolCallId) this.confirm(pending);
    } else if (update.sessionUpdate === 'config_option_update') this.applySettings(agent, update);
    else if (update.sessionUpdate === 'current_mode_update') agent.nativeMode = update.currentModeId;
    else if (update.sessionUpdate === 'available_commands_update') agent.nativeCommands = Array.isArray(update.availableCommands) ? update.availableCommands.slice(0, 200) : [];
    else if (update.sessionUpdate === 'plan') {
      this.put(agent, { id: 'plan:' + agent.nativeSessionId, turnId: job?.turnId || null, type: 'activity', text: bounded('Mistral plan\n' + (update.entries || []).map(entry => `${entry.status}: ${entry.content}`).join('\n')), state: 'completed', ...receiptTime() });
    }
    this.changed(agent);
  }
  finish(agent, job, result, error) {
    if (this.runs.get(agent.id) !== job) return;
    const known = !error && ['end_turn', 'cancelled', 'max_tokens', 'max_turn_requests', 'refusal'].includes(result?.stopReason);
    if (!known) {
      // A lost result is not permission to submit another turn into the same engine.
      agent.canSend = false; agent.observingOnly = true; agent.runError = bounded(error?.message || 'Mistral returned no native turn outcome.'); agent.thread.status = { type: 'notLoaded' };
      for (const message of agent.messages) if (message.turnId === job.turnId && message.type === 'user') message.inputState = 'unconfirmed';
      for (const pending of this.requests.values()) if (pending.agent === agent) { pending.question.unavailable = true; pending.question.unavailableReason = 'Native execution is unconfirmed; this request cannot be answered here.'; }
      this.changed(agent); return;
    }
    this.runs.delete(agent.id); agent.turnId = null; agent.lastCompletedTurnId = job.turnId; agent.thread.status = { type: 'idle' }; agent.stopReason = result.stopReason;
    agent.finishedTurn = { id: job.turnId, status: result.stopReason === 'cancelled' ? 'interrupted' : result.stopReason === 'end_turn' ? 'completed' : 'failed' };
    if (agent.finishedTurn.status === 'failed') agent.runError = 'Mistral stopped: ' + result.stopReason + '.';
    for (const message of agent.messages) if (message.turnId === job.turnId && message.type === 'user') message.inputState = 'received';
    for (const message of agent.messages) if (message.turnId === job.turnId && message.state === 'inProgress') message.state = 'completed';
    for (const pending of [...this.requests.values()]) if (pending.agent === agent) this.confirm(pending);
    for (const id of job.assistantIds) { const message = agent.messages.find(item => item.id === id); if (message) this.emit('assistantMessageCompleted', agent.id, message); }
    this.changed(agent); this.emit('completed', agent.id);
  }
  request(request) {
    const agent = this.records.get('mistral-' + request.params?.sessionId);
    if (!agent || agent.observingOnly) { this.unboundRequests.set(request.id, request); this.error = 'Mistral has an unsupported or unbound native request. Use its native client; CCNG has not answered it.'; return; }
    const permission = request.method === 'session/request_permission', elicitation = request.method === 'elicitation/create';
    const params = structuredClone(request.params || {});
    const toolCallId = params.toolCall?.toolCallId || params.toolCallId;
    if (toolCallId) { const details = this.toolCalls.get(JSON.stringify([agent.id, toolCallId])); if (details) params.toolCallContext = structuredClone(details); }
    const permissionSupported = permission && object(params.toolCall) && typeof params.toolCall.toolCallId === 'string' && Array.isArray(params.options) && params.options.length > 0 && params.options.length <= 64 && params.options.every(option => typeof option.optionId === 'string' && option.optionId.length <= 512 && typeof option.name === 'string' && ['allow_once', 'allow_always', 'reject_once', 'reject_always'].includes(option.kind)) && new Set(params.options.map(option => option.optionId)).size === params.options.length;
    const formSupported = elicitation && params.mode === 'form' && !!formFields(params.requestedSchema) && !Object.values(params.requestedSchema.properties).some(field => field.format === 'password');
    const supported = permissionSupported || formSupported;
    const question = { id: request.id, method: permission ? MISTRAL_APPROVAL : elicitation ? MISTRAL_QUESTION : MISTRAL_UNSUPPORTED, params: { ...params, threadId: agent.id, nativeMethod: request.method }, reviewToken: randomUUID(), requestedAt: new Date().toISOString(), requestedAtSource: 'received', ...(!supported ? { unsupported: true, unavailableReason: 'This native request format requires the Mistral native client. It remains unanswered.' } : {}) };
    this.requests.set(request.id, { agent, question, request, supported }); agent.questions.push(question); this.changed(agent);
  }
  async answer(agent, id, answer) {
    this.managed(agent); const pending = this.requests.get(id);
    if (!pending || pending.agent !== agent || !agent.questions.includes(pending.question) || pending.question.responding) throw fail('This Mistral request is no longer answerable.');
    const question = pending.question;
    if (!object(answer) || answer.requestId !== id || answer.reviewToken !== question.reviewToken) throw fail('Answer only this exact current Mistral request.', 400);
    if (!pending.supported) throw fail(question.unavailableReason, 400);
    let result;
    if (question.method === MISTRAL_APPROVAL) {
      if (Object.keys(answer).some(key => !['requestId', 'reviewToken', 'optionId', 'cancel'].includes(key)) || answer.cancel !== undefined && answer.cancel !== true || answer.cancel && answer.optionId !== undefined) throw fail('Choose only an exact native permission option or cancel.', 400);
      if (answer.cancel) result = { outcome: { outcome: 'cancelled' } };
      else {
        if (!question.params.options.some(option => option.optionId === answer.optionId)) throw fail('Choose a permission option offered by Mistral.', 400);
        result = { outcome: { outcome: 'selected', optionId: answer.optionId } };
      }
    } else {
      if (Object.keys(answer).some(key => !['requestId', 'reviewToken', 'action', 'content'].includes(key)) || !['accept', 'decline', 'cancel'].includes(answer.action)) throw fail('Choose an explicit native form action.', 400);
      result = { action: answer.action, ...(answer.action === 'accept' ? { content: formContent(question.params.requestedSchema, answer.content) } : {}) };
    }
    question.responding = true; this.changed(agent);
    try { await this.rpc.respond(id, result); question.submitted = true; this.changed(agent); return { submitted: true }; }
    catch (error) { question.unavailable = true; question.unavailableReason = 'The native answer could not be confirmed. It has not been retried.'; this.changed(agent); throw error; }
  }
  confirm(pending) { if (this.requests.get(pending.request.id) !== pending) return; this.requests.delete(pending.request.id); pending.agent.questions = pending.agent.questions.filter(question => question !== pending.question); }
  async interrupt(agent) { this.managed(agent); if (!this.runs.has(agent.id)) throw fail('Only a Mistral turn owned by this CCNG process can be interrupted here.'); Object.defineProperty(agent, 'requestStopIntent', { configurable: true, value: {} }); await this.rpc.notify('session/cancel', { sessionId: agent.nativeSessionId }); }
  applySettings(agent, result) {
    if (Array.isArray(result.configOptions)) agent.configOptions = structuredClone(result.configOptions.slice(0, 100));
    if (result.modes?.currentModeId) agent.nativeMode = result.modes.currentModeId;
    const model = agent.configOptions.find(option => option.category === 'model' && option.type === 'select');
    if (typeof model?.currentValue === 'string') agent.model = model.currentValue;
    agent.modelSettingsAvailable = !!model && !agent.observingOnly;
  }
  async modelSettings(agent) {
    this.managed(agent); const option = agent.configOptions.find(option => option.category === 'model' && option.type === 'select');
    if (!option || !Array.isArray(option.options)) throw fail('The installed Mistral ACP runtime has not offered model choices for this session.');
    const rows = option.options.flatMap(row => Array.isArray(row.options) ? row.options : [row]);
    const models = rows.filter(row => typeof row.value === 'string' && typeof row.name === 'string').slice(0, 200).map(row => ({ model: row.value, displayName: row.name, description: row.description || '', defaultEffort: null, efforts: [] }));
    return { models, model: agent.model, effort: null, change: agent.modelChange || null };
  }
  async updateModel(agent, choice) {
    this.managed(agent); if (this.runs.has(agent.id) || agent.questions.length) throw fail('Wait until Mistral is idle before changing its model.');
    const { models } = await this.modelSettings(agent); validateModelChoice(models, choice);
    const option = agent.configOptions.find(option => option.category === 'model' && option.type === 'select');
    agent.modelChange = { ...choice, status: 'pending' }; this.changed(agent);
    try {
      const result = await this.rpc.call('session/set_config_option', { sessionId: agent.nativeSessionId, configId: option.id, value: choice.model }); this.applySettings(agent, result);
      if (agent.model !== choice.model) throw fail('Mistral did not confirm the selected model. Refresh its native settings.');
      agent.modelChange.status = 'saved'; this.changed(agent); return { model: agent.model, effort: null, change: agent.modelChange };
    } catch (error) { agent.modelChange = { ...choice, status: 'unconfirmed', error: bounded(error.message) }; this.changed(agent); throw error; }
  }
  disconnected(error) {
    this.error = bounded(error.message);
    for (const agent of this.records.values()) if (!agent.observingOnly) {
      agent.canSend = false; agent.observingOnly = true; agent.thread.status = { type: 'notLoaded' }; agent.observeError = this.error;
      for (const message of agent.messages) if (message.turnId === agent.turnId && message.type === 'user') message.inputState = 'unconfirmed';
      for (const question of agent.questions) { question.unavailable = true; question.unavailableReason = 'The Mistral connection ended. This native request cannot be answered here.'; }
      this.changed(agent);
    }
  }
  async shutdown() { this.stopped = true; if (this.rpc) await this.rpc.close(); }
}
