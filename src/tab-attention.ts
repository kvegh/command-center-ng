import { nativeApprovalChoices } from '../server/approval-choices.mjs';
import type { Question } from './open-questions';

type RequestContext = {
  id: string; status: string; questions?: Question[]; needsInput?: boolean;
  requestError?: string | null; detailError?: string | null;
};
type TabWorker = RequestContext & {
  role?: string; provider?: string; ownStatus?: string; canSend?: boolean;
  observeError?: string | null; workers?: RequestContext[];
  messages?: { nativeQuestions?: { answerState?: string }[] }[];
};
type CoordinatorSnapshot = {
  connected: boolean; codexConnected?: boolean;
  coordinator?: { id: string | null; paused: boolean; starting: boolean } | null;
  agents: TabWorker[];
};
export type TabAttention = {
  needsUser: boolean; awaitingCoordinator: boolean; confirming: boolean; label: string;
};
const statusLabels: Record<string, string> = {
  running: 'Running', attention: 'Needs you', idle: 'Idle', offline: 'Offline', error: 'Error',
};
const view = (label: string, needsUser = false, awaitingCoordinator = false, confirming = false): TabAttention =>
  ({ label, needsUser, awaitingCoordinator, confirming });

export function coordinatorReviewAvailable(state: CoordinatorSnapshot) {
  const coordinator = state.coordinator;
  const agent = state.agents.find(agent => agent.id === coordinator?.id && agent.role === 'coordinator');
  // Generic coordinator errors also include report delivery failures. Only its
  // actual availability/request state establishes whether review can proceed.
  return !!(state.connected && (state.codexConnected ?? state.connected) && coordinator
    && !coordinator.paused && !coordinator.starting && agent && agent.provider !== 'claude'
    && agent.canSend && !agent.questions?.length
    && ['idle', 'running'].includes(agent.ownStatus ?? agent.status));
}

function requestAttention(context: RequestContext, question: Question, coordinatorAvailable: boolean) {
  if (question.responding) return view('Waiting for native confirmation', false, false, true);
  if (question.error) return view('Request answer error', true);
  if (question.review?.decision === 'ask') return view('Needs your decision', true);
  if (question.review && question.review.decision !== 'queued') return view('Approval answer not confirmed', true);
  if (!['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(question.method)) return view('Needs your answer', true);
  if (!question.reviewToken || question.params?.threadId !== context.id) return view('Request details unavailable', true);
  const once = nativeApprovalChoices(question, { allowPersistent: false })
    .some(choice => choice.answer.decision === 'accept');
  if (!once || !coordinatorAvailable) return view('Needs your decision', true);
  return view('Awaiting Coordinator review', false, true);
}

// Presentation only: never change native status, approvals, ownership or send
// gates. Backend-projected child questions already carry verified parentage.
export function tabAttentionView(agent: TabWorker, coordinatorAvailable: boolean): TabAttention {
  if (agent.role === 'coordinator') return view(statusLabels[agent.status] || agent.status, agent.status === 'attention');
  const states: TabAttention[] = [];
  const asyncStates = (agent.messages || []).flatMap(message => message.nativeQuestions || []);
  const contexts = [{ ...agent, status: agent.ownStatus ?? agent.status }, ...(agent.workers || [])];
  for (const context of contexts) {
    const questions = context.questions || [];
    const pending = questions.length || context.status === 'attention' || context.needsInput;
    if ((pending && (context.requestError || context.detailError)) || ('observeError' in context && context.observeError && questions.length)) {
      states.push(view('Request details unavailable', true));
    }
    for (const question of questions) states.push(requestAttention(context, question, coordinatorAvailable && agent.provider !== 'claude'));
    if (!questions.length && (context.status === 'attention' || context.needsInput)) states.push(view('Request details unavailable', true));
  }
  for (const question of asyncStates) {
    if (['available', 'unconfirmed'].includes(question.answerState || '')) states.push(view(question.answerState === 'unconfirmed' ? 'Answer delivery unconfirmed' : 'Needs your answer', true));
    else if (question.answerState === 'submitting') states.push(view('Waiting for native confirmation', false, false, true));
  }
  const human = states.find(state => state.needsUser);
  if (human) return human;
  const awaitingCoordinator = states.some(state => state.awaitingCoordinator);
  const confirming = states.some(state => state.confirming);
  if (awaitingCoordinator || confirming) return view(awaitingCoordinator ? 'Awaiting Coordinator review' : 'Waiting for native confirmation', false, awaitingCoordinator, confirming);
  if (agent.status === 'attention') return view('Request details unavailable', true);
  return view(statusLabels[agent.status] || agent.status);
}
