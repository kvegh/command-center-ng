import { nativeApprovalChoices, isHumanCommandApproval } from '../server/approval-choices.mjs';
import type { Question } from './open-questions';

type RequestContext = {
  id: string; status: string; questions?: Question[]; needsInput?: boolean;
  requestError?: string | null; detailError?: string | null;
};
type TabWorker = RequestContext & {
  role?: string; provider?: string; ownStatus?: string; canSend?: boolean;
  observeError?: string | null; workers?: RequestContext[];
  messages?: { nativeQuestions?: { answerState?: string }[] }[];
  tasks?: { displayState?: string }[];
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

function requestAttention(context: RequestContext, question: Question, coordinatorConfigured: boolean) {
  if (question.responding) return view('Waiting for native confirmation', false, false, true);
  if (isHumanCommandApproval(question)) return view('Needs your personal approval', true);
  if (question.error) return view('Request answer error', true);
  if (question.review?.decision === 'ask') return view('Needs your decision', true);
  if (['approve', 'decline'].includes(question.review?.decision || '')) return view('Waiting for native confirmation', false, false, true);
  if (question.review && question.review.decision !== 'queued') return view('Approval answer not confirmed', true);
  if (!['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(question.method)) return view('Needs your answer', true);
  if (!question.reviewToken || question.params?.threadId !== context.id) return view('Request details unavailable', true);
  const once = nativeApprovalChoices(question, { allowPersistent: false })
    .some(choice => choice.answer.decision === 'accept');
  if (!once || !coordinatorConfigured) return view('Needs your decision', true);
  return view('Awaiting Coordinator review', false, true);
}

// Presentation only: never change native status, approvals, ownership or send
// gates. Backend-projected child questions already carry verified parentage.
export function tabAttentionView(agent: TabWorker, coordinatorAvailable: boolean, coordinatorConfigured = coordinatorAvailable): TabAttention {
  const states: TabAttention[] = [];
  const asyncStates = (agent.messages || []).flatMap(message => message.nativeQuestions || []);
  // taskSummary projects current linked Beads inputs explicitly, after dependency
  // and terminal-state checks. Ordinary blocked work is not a user question.
  if (agent.tasks?.some(task => task.displayState === 'needs_input')) states.push(view('Needs your task input', true));
  const contexts = [{ ...agent, status: agent.ownStatus ?? agent.status }, ...(agent.workers || [])];
  for (const context of contexts) {
    const questions = context.questions || [];
    const pending = questions.length || context.status === 'attention' || context.needsInput;
    if ((pending && (context.requestError || context.detailError)) || ('observeError' in context && context.observeError && questions.length)) {
      states.push(view('Request details unavailable', questions.length > 0));
    }
    // Startup, pause or a temporary Coordinator connection loss cannot create a
    // user decision. Only an actual referral/error changes an eligible wait.
    for (const question of questions) states.push(requestAttention(context, question, coordinatorConfigured && agent.role !== 'coordinator' && agent.provider !== 'claude'));
    if (!questions.length && (context.status === 'attention' || context.needsInput)) states.push(view('Request details unavailable'));
  }
  for (const question of asyncStates) {
    if (['available', 'unconfirmed'].includes(question.answerState || '')) states.push(view(question.answerState === 'unconfirmed' ? 'Answer delivery unconfirmed' : 'Needs your answer', true));
    else if (question.answerState === 'submitting') states.push(view('Waiting for native confirmation', false, false, true));
  }
  const human = states.find(state => state.needsUser);
  if (human) return human;
  // An empty native wait is a diagnostic, not an invented user question. Keep it
  // visible even when unrelated assistant metadata reports a confirmation wait.
  const unavailable = states.find(state => state.label === 'Request details unavailable');
  if (unavailable) return unavailable;
  const awaitingCoordinator = states.some(state => state.awaitingCoordinator);
  const confirming = states.some(state => state.confirming);
  if (awaitingCoordinator || confirming) return view(awaitingCoordinator ? 'Awaiting Coordinator review' : 'Waiting for native confirmation', false, awaitingCoordinator, confirming);
  if (agent.status === 'attention') return view('Request details unavailable');
  return view(statusLabels[agent.status] || agent.status);
}
