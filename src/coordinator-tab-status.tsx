import React, { useEffect, useRef, useState } from 'react';
import { isHumanCommandApproval, nativeApprovalChoices } from '../server/approval-choices.mjs';
import type { Question } from './open-questions';
import type { CoordinatorAuditEntry } from './coordinator-audit';

type RequestContext = { id: string; questions?: Question[] };
type CoordinatorTabSnapshot = {
  connected: boolean; codexConnected?: boolean; restoration?: { status: string } | null;
  coordinator?: { id: string | null; paused: boolean; starting: boolean; audit: CoordinatorAuditEntry[];
    approvalAnalyses?: { reviewToken: string; status: string; current?: boolean; active?: boolean; turnId?: string | null }[] } | null;
  agents: (RequestContext & { role?: string; provider?: string; status: string; ownStatus?: string; turnId?: string | null; workers?: RequestContext[] })[];
};
type ConcernObservation = { coordinatorId: string | null; connected: boolean; ids: Set<string>; latestAt: number };
export const CONCERN_INDICATION_MS = 9000;

export function coordinatorEvaluating(state: CoordinatorTabSnapshot) {
  const coordinator = state.coordinator;
  if (!state.connected || !(state.codexConnected ?? state.connected) || ['pending', 'restoring'].includes(state.restoration?.status || '')
    || !coordinator?.id || coordinator.paused || coordinator.starting) return false;
  const main = state.agents.find(agent => agent.id === coordinator.id && agent.role === 'coordinator');
  if (!main || main.provider === 'claude') return false;
  const tokens = state.agents.filter(agent => agent.role !== 'coordinator' && agent.provider !== 'claude')
    .flatMap(agent => [agent, ...(agent.workers || [])]).flatMap(context => (context.questions || []).filter(question =>
      question.params.threadId === context.id && question.reviewToken && !question.responding && !question.error
      && (!question.review || question.review.decision === 'queued') && !isHumanCommandApproval(question)
      && ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(question.method)
      && nativeApprovalChoices(question, { allowPersistent: false }).some(choice => choice.answer.decision === 'accept'))
      .map(question => question.reviewToken));
  if (!tokens.length) return false;
  return !!(main.turnId && (main.ownStatus ?? main.status) === 'running')
    || !!coordinator.approvalAnalyses?.some(analysis => analysis.status === 'running' && analysis.current === true && analysis.active === true
      && typeof analysis.turnId === 'string' && !!analysis.turnId.trim() && tokens.includes(analysis.reviewToken));
}

export function observeCoordinatorConcerns(previous: ConcernObservation | undefined, coordinatorId: string | null, entries: CoordinatorAuditEntry[], connected: boolean) {
  const ids = new Set(entries.flatMap(entry => entry.id ? [entry.id] : []));
  const latestAt = Math.max(previous?.coordinatorId === coordinatorId ? previous.latestAt : 0,
    ...entries.map(entry => Date.parse(entry.at)).filter(Number.isFinite), 0);
  const reset = !previous || !connected || !previous.connected || previous.coordinatorId !== coordinatorId;
  const concern = !reset && [...entries].reverse().find(entry => entry.id && !previous.ids.has(entry.id)
    && entry.coordinatorId === coordinatorId && entry.decision === 'ask' && entry.outcome === 'needs_user'
    && Number.isFinite(Date.parse(entry.at)) && Date.parse(entry.at) >= previous.latestAt);
  return { observation: { coordinatorId, connected, ids, latestAt }, concernId: concern ? concern.id! : null, reset };
}

export function CoordinatorTabIndicator({ concernId, evaluating }: { concernId: string | null; evaluating: boolean }) {
  return <span className={`coordinator-tab-status ${concernId ? 'concerned' : evaluating ? 'evaluating' : ''}`} role="status" aria-live="polite">
    {concernId ? <span key={concernId} className="coordinator-concern-pulse">Concerned.</span> : evaluating ? 'Evaluating…' : null}
  </span>;
}

export function CoordinatorTabStatus({ state, streamConnected }: { state: CoordinatorTabSnapshot; streamConnected: boolean }) {
  const observation = useRef<ConcernObservation>(undefined);
  const [concernId, setConcernId] = useState<string | null>(null);
  const coordinatorId = state.coordinator?.id || null, entries = state.coordinator?.audit || [];
  const connected = streamConnected && state.connected && (state.codexConnected ?? state.connected) && !['pending', 'restoring'].includes(state.restoration?.status || '');
  useEffect(() => {
    const next = observeCoordinatorConcerns(observation.current, coordinatorId, entries, connected);
    observation.current = next.observation;
    if (next.concernId) setConcernId(next.concernId);
    else if (next.reset) setConcernId(null);
  }, [coordinatorId, entries, connected]);
  useEffect(() => {
    if (!concernId) return;
    // A finite presentation timeout also clears the static reduced-motion view,
    // where CSS deliberately disables animation and emits no animationend event.
    const timeout = window.setTimeout(() => setConcernId(null), CONCERN_INDICATION_MS);
    return () => window.clearTimeout(timeout);
  }, [concernId]);
  const evaluating = connected && coordinatorEvaluating(state);
  return <CoordinatorTabIndicator concernId={concernId} evaluating={evaluating} />;
}
