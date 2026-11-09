import React, { useRef, useState } from 'react';

export type BranchHandoffState = {
  phase: string;
  detail: string;
  parentId: string;
  taskCount?: number;
  error?: string | null;
};
export type HandoffCompletion = { branchId: string; parentId: string };

export function handoffActive(handoff?: BranchHandoffState) {
  return !!handoff && handoff.phase !== 'failed';
}

export function branchDraftLocked(agent?: {
  handoff?: BranchHandoffState;
  summarizing?: boolean;
  returning?: boolean;
  returnSummary?: { delivered: boolean };
}, starting = false) {
  return starting || handoffActive(agent?.handoff)
    || !!(agent?.summarizing || agent?.returning || agent?.returnSummary?.delivered);
}

// A completion may arrive while the user is reading another tab, or remain in a
// later snapshot. Only the removed, currently selected branch needs navigation.
export function handoffDestination(selected: string, agents: { id: string }[], completions: HandoffCompletion[] = []) {
  if (agents.some(agent => agent.id === selected)) return null;
  const completion = completions.find(entry => entry.branchId === selected);
  return completion && agents.some(agent => agent.id === completion.parentId) ? completion.parentId : null;
}

const phaseLabels: Record<string, string> = {
  waiting: 'Waiting for a safe handoff',
  stopping: 'Finishing branch work safely',
  summarizing: 'Preparing the branch summary',
  transferring: 'Linking branch tasks to the parent',
  sending: 'Delivering the summary to the parent',
  closing: 'Closing the branch',
  failed: 'Hand back needs attention'
};

export function BranchHandoffTab({ handoff, starting = false, requestError }: { handoff?: BranchHandoffState; starting?: boolean; requestError?: string }) {
  if (!handoff && !starting && !requestError) return null;
  const failed = handoff?.phase === 'failed' || !!requestError;
  return <span className={`tab-number${failed ? ' error-text' : ''}`} aria-label={failed ? 'Hand back failed' : 'Hand back in progress'} title={requestError || handoff?.error || handoff?.detail || 'Hand back requested'}>{failed ? '!' : '↩'}</span>;
}

export function BranchHandoff({ handoff, connected, provider = 'codex', starting = false, requestError, unsentText = false, unsentImages = 0, start }: {
  handoff?: BranchHandoffState; connected: boolean; provider?: string; starting?: boolean;
  requestError?: string;
  unsentText?: boolean; unsentImages?: number;
  start: () => Promise<unknown>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const posting = useRef(false);
  const pending = starting || submitting || handoffActive(handoff);
  const disabled = !connected || provider !== 'codex' || pending || unsentImages > 0;
  const failed = handoff?.phase === 'failed';
  const problem = requestError || error || handoff?.error;
  const title = provider !== 'codex' ? 'Branch handoff is currently available for Codex only'
    : !connected ? 'Connect the local Codex runtime to hand this branch back'
      : unsentImages ? 'Send or remove draft images before handing this branch back'
        : 'Transfer tasks back to parent, summarize and close branch';
  return <div className="branch-handoff">
    <button type="button" className="button subtle small" title={title} disabled={disabled} onClick={async () => {
      if (disabled || posting.current) return;
      posting.current = true; setSubmitting(true); setError('');
      try { await start(); }
      catch (problem) { setError((problem as Error).message); }
      finally { posting.current = false; setSubmitting(false); }
    }}>{pending ? 'Hand back requested…' : failed || problem ? 'Retry hand back' : 'Hand back & close'}</button>
    {unsentText && <p className="field-note">Unsent text stays saved in this browser. It is not included in the summary.</p>}
    {unsentImages > 0 && <p className="field-note">Send or remove draft images first. They are not included in the summary and disappear on refresh.</p>}
    {(handoff || pending) && <p className="field-note" role="status">
      <strong>{handoff ? phaseLabels[handoff.phase] || 'Hand back in progress' : 'Requesting hand back'}.</strong>
      {handoff?.detail && <> {handoff.detail}</>}
      {!failed && <> You can switch tabs. This branch closes when delivery and task transfer are confirmed.</>}
    </p>}
    {problem && <p className="error-text" role="alert">{problem}</p>}
  </div>;
}
