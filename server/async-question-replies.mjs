import { createHash } from 'node:crypto';

// Codex 0.167 async questions use ordinary input, not server-request approvals.
// Keep delivery state on the retained native question; never reconstruct pending
// questions from history or give a displayed/filtered index native authority.
const bindingKey = Symbol('native async question');
const seenKey = Symbol('seen native async question messages');
const answeredKey = Symbol('answered native async question identities');
const startTag = '<send_user_message_question_reply>';
const endTag = '</send_user_message_question_reply>';
const fail = (message, status = 409, code = 'async_question_not_current') => Object.assign(new Error(message), { status, code });

function questionPrefix(title) {
  let bytes = 0, prefix = '';
  for (const character of title) {
    const size = Buffer.byteLength(character);
    if (bytes + size > 512) break;
    bytes += size; prefix += character;
  }
  return prefix.replace(/[\r\n]/g, ' ');
}

export function bindAsyncQuestion(question, item, questionIndex, title) {
  const id = typeof item.id === 'string' && item.id ? JSON.stringify(['request_user_input_async', item.id, questionIndex]) : null;
  const fingerprint = createHash('sha256').update(JSON.stringify([title, item.questions[questionIndex].options ?? null])).digest('hex');
  const binding = id && Buffer.byteLength(id) <= 512 ? { id, question: questionPrefix(title), fingerprint, state: 'read-only', liveStarted: false, retired: false } : null;
  Object.defineProperty(question, bindingKey, { value: binding, configurable: true });
  return question;
}

function replyEnvelope(text) {
  if (typeof text !== 'string') return null;
  let trimmed = text.trim();
  if (trimmed.startsWith('# Context from my IDE setup:\n')) {
    const marker = '\n## My request for Codex:\n';
    const index = trimmed.lastIndexOf(marker); if (index < 0) return null;
    trimmed = trimmed.slice(index + marker.length).trim();
  }
  if (!trimmed.startsWith(startTag) || !trimmed.endsWith(endTag)) return null;
  return trimmed.slice(startTag.length, -endTag.length);
}

function parseReplies(text) {
  if (typeof text !== 'string' || text.length > 32_000) return null;
  const json = replyEnvelope(text); if (json === null) return null;
  try {
    const value = JSON.parse(json);
    const replies = Array.isArray(value) ? value : [value];
    if (!replies.length || replies.some(reply => !reply || typeof reply.questionItemId !== 'string' || typeof reply.answer !== 'string' || typeof reply.question !== 'string')) return null;
    return replies;
  } catch { return null; }
}

export function nativeQuestionAnswerTexts(text) {
  const replies = parseReplies(text);
  // An unsupported/oversized protocol envelope must never regain authority as
  // raw human prose. Keep parsing bounded and require another real instruction.
  return replies ? replies.map(reply => reply.answer) : replyEnvelope(text) !== null ? [] : null;
}

function markAnswered(agent, ids) {
  if (!agent[answeredKey]) Object.defineProperty(agent, answeredKey, { value: new Set() });
  for (const id of ids) agent[answeredKey].add(id);
  for (const message of agent.messages) for (const question of message.nativeQuestions || []) {
    const binding = question[bindingKey];
    if (binding && (ids.includes(binding.id) || ids.includes(message.id))) { binding.state = 'submitted'; binding.retired = true; binding.retirement = 'answer'; }
  }
}

export function retireAsyncQuestions(agent, notice, retirement = 'followup') {
  for (const message of agent.messages) for (const question of message.nativeQuestions || []) {
    const binding = question[bindingKey];
    if (binding && !binding.retired && !['submitted', 'unconfirmed'].includes(binding.state)) { binding.state = 'read-only'; binding.retired = true; binding.notice = notice; binding.retirement = retirement; }
  }
}

export function observeAsyncQuestionInput(agent, record, item) {
  const content = item.content?.filter(part => !['skill', 'mention'].includes(part.type));
  const replies = content && (content.length !== 1 || content[0].type !== 'text') ? null : parseReplies(record.text);
  if (replies) {
    markAnswered(agent, replies.map(reply => reply.questionItemId));
    let remaining = 8000, truncated = replies.length > 32;
    const take = (text, limit) => { const value = text.slice(0, Math.max(0, Math.min(limit, remaining))); remaining -= value.length; if (value.length < text.length) truncated = true; return value; };
    record.nativeQuestionReplies = replies.slice(0, 32).map(reply => ({ question: take(reply.question, 1000), answer: take(reply.answer, 4000) }));
    if (truncated) record.nativeQuestionRepliesTruncated = true;
  }
  else retireAsyncQuestions(agent, 'A later user input retired this question.');
}

export function retainAsyncQuestionState(agent, record, previous, { live, completed, item }) {
  if (!record.nativeQuestions?.length) return;
  if (!agent[seenKey]) Object.defineProperty(agent, seenKey, { value: new Set() });
  const seenBefore = agent[seenKey].has(record.id); agent[seenKey].add(record.id);
  for (const question of record.nativeQuestions || []) {
    const original = item.questions?.[question.questionIndex];
    if (!question[bindingKey] && original && typeof original.title === 'string') bindAsyncQuestion(question, item, question.questionIndex, original.title);
    let binding = question[bindingKey];
    const prior = previous?.nativeQuestions?.find(candidate => candidate.questionIndex === question.questionIndex)?.[bindingKey];
    if (binding && prior) {
      if (binding.id === prior.id && binding.fingerprint === prior.fingerprint) {
        binding = prior; Object.defineProperty(question, bindingKey, { value: binding, configurable: true });
      } else { binding.retired = true; binding.notice = 'The native question changed; use the native client.'; }
    }
    if (!binding || binding.retired) continue;
    if (!prior && live && !seenBefore) binding.liveStarted = true;
    if (live && completed && binding.liveStarted && !record.nativeQuestionsTruncated && agent.thread.status?.type === 'active' && agent.turnId === record.turnId) binding.state = 'available';
    if (agent[answeredKey]?.has(binding.id) || agent[answeredKey]?.has(record.id)) { binding.state = 'submitted'; binding.retired = true; }
  }
}

function unavailable(agent, message, question, submitting = false) {
  const binding = question[bindingKey];
  if (!binding) return 'This question has no supported native reply identity.';
  if (binding.retired || binding.state !== (submitting ? 'submitting' : 'available')) return binding.notice || 'This historical or unfinished question is read-only.';
  if (message.nativeQuestionsTruncated) return 'The displayed native question details are incomplete; use the native client.';
  if (agent.provider === 'claude' || agent.role === 'coordinator') return 'This reply path is supported only for Codex workers.';
  if (agent.thread.status?.type !== 'active' || !agent.turnId || agent.turnId !== message.turnId) return 'The originating native turn is no longer active.';
  if (!agent.canSend) return agent.managementNotice || 'This session does not accept direct input.';
  if (agent.questions.length || agent.thread.status?.activeFlags?.some(flag => ['waitingOnApproval', 'waitingOnUserInput'].includes(flag))) return 'Answer or load the pending native request first.';
  return null;
}

export function asyncQuestionView(agent, message, question, handoffBlocked = false) {
  const binding = question[bindingKey];
  const state = binding?.state;
  if (['submitting', 'submitted', 'unconfirmed'].includes(state)) return { ...question, answerState: state, answerNotice: state === 'submitted' ? 'Submitted as native user input; model processing is not confirmed.' : state === 'unconfirmed' ? 'Delivery is unconfirmed. Check the native conversation before another response.' : 'Submitting through the native input path.' };
  const notice = unavailable(agent, message, question) || (handoffBlocked ? 'Finish the current summary or handoff step before answering.' : null);
  return { ...question, answerState: notice ? 'read-only' : 'available', ...(notice ? { answerNotice: notice } : {}) };
}

export function hasOpenAsyncQuestions(agent) {
  return agent.thread.status?.type === 'active' && !!agent.turnId && agent.messages.some(message => message.turnId === agent.turnId && message.nativeQuestions?.some(question => {
    const binding = question[bindingKey];
    return binding?.liveStarted && ['available', 'submitting', 'unconfirmed'].includes(binding.state);
  }));
}

export function observeHandoffQuestions(agent, observed) {
  if (agent.thread.status?.type !== 'active' || !agent.turnId) return;
  for (const message of agent.messages) if (message.turnId === agent.turnId) for (const question of message.nativeQuestions || []) {
    const binding = question[bindingKey];
    if (binding?.liveStarted && ['available', 'submitting', 'unconfirmed'].includes(binding.state)) observed.set(binding.id, { binding, messageId: message.id, questionIndex: question.questionIndex, turnId: message.turnId });
  }
}

export function handoffQuestionNeedsReview(agent, observed) {
  for (const question of observed.values()) {
    const { binding } = question;
    if (binding.state === 'submitted' || ['answer', 'followup'].includes(binding.retirement)) continue;
    const current = agent.messages.find(message => message.id === question.messageId && message.turnId === question.turnId)?.nativeQuestions?.find(candidate => candidate.questionIndex === question.questionIndex);
    if (current?.[bindingKey] !== binding || binding.retired || binding.state === 'unconfirmed' || agent.thread.status?.type !== 'active' || agent.turnId !== question.turnId) return true;
  }
  return false;
}

export function assertAsyncQuestionsAllowControl(agent) {
  if (hasOpenAsyncQuestions(agent)) throw fail('Answer the current native message question before internal control delivery.', 409, 'async_question_pending');
}

export function currentAsyncQuestion(agent, messageId, questionIndex, expected) {
  if (typeof messageId !== 'string' || !messageId || !Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= 32) throw fail('Choose an exact native message and original question index.', 400, 'invalid_async_question_answer');
  const message = agent.messages.find(candidate => candidate.id === messageId && candidate.nativeType === 'agentMessage');
  const question = message?.nativeQuestions?.find(candidate => candidate.questionIndex === questionIndex);
  const binding = question?.[bindingKey];
  if (!question || !binding) throw fail('This native question is no longer available.');
  if (expected && (expected.message !== message || expected.binding !== binding || expected.turnId !== agent.turnId)) throw fail('The native question changed before delivery.');
  // Only the same local submission may pass its final preflight while locked.
  const reason = unavailable(agent, message, question, !!expected);
  if (reason) throw fail(reason);
  return { message, question, binding, turnId: agent.turnId };
}

export function asyncQuestionReply(binding, answer) {
  if (typeof answer !== 'string' || !answer.trim() || answer.length > 30_000) throw fail('Enter an answer of up to 30000 characters.', 400, 'invalid_async_question_answer');
  const text = startTag + '\n' + JSON.stringify([{ answer, question: binding.question, questionItemId: binding.id }]) + '\n' + endTag;
  if (text.length > 32_000) throw fail('Shorten this answer to fit the native input limit.', 400, 'invalid_async_question_answer');
  return text;
}

export function setAsyncQuestionDelivery(context, state, notice) {
  context.binding.state = state;
  if (notice) context.binding.notice = notice;
  if (['submitted', 'unconfirmed'].includes(state)) { context.binding.retired = true; context.binding.retirement = state === 'submitted' ? 'answer' : 'unconfirmed'; }
}
