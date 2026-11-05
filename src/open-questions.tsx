import React, { useState } from 'react';
import { requestKind } from '../server/native-requests.mjs';

export type Question = {
  id: string | number; method: string; params: Record<string, any>;
  responding?: boolean; error?: string | null;
  review?: { decision: string; rationale: string };
};

export const questionTarget = (agentId: string, requestId: string | number) =>
  'ccng-question-' + encodeURIComponent(JSON.stringify([agentId, requestId]));

export function revealQuestion(agentId: string, requestId: string | number) {
  const card = document.getElementById(questionTarget(agentId, requestId));
  if (!card) return;
  card.scrollIntoView({ block: 'start', behavior: 'instant' });
  const control = card.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled), textarea:not(:disabled)');
  (control || card).focus({ preventScroll: true });
}

export function RequestRecovery({ recovering, error, disabled, recover, provider = 'codex' }: { recovering: boolean; error?: string | null; disabled: boolean; recover: () => Promise<unknown>; provider?: 'codex' | 'claude' }) {
  const [busy, setBusy] = useState(false); const [localError, setError] = useState('');
  const loading = busy || recovering;
  return <section className="request-recovery" aria-label="Pending request details">
    <strong>{provider === 'claude' ? 'Claude' : 'Codex'} is waiting for your response.</strong>
    <span>{provider === 'claude' ? 'Waiting for Claude’s request details. Refresh them here if needed.' : 'The request details are not loaded in Command Center. Load them to review the request here.'}</span>
    {(localError || error) && <span className="error-text" role="alert">{localError || error}</span>}
    <button type="button" className="button subtle small" disabled={disabled || loading} onClick={async () => {
      setBusy(true); setError('');
      try { await recover(); } catch (problem) { setError((problem as Error).message); } finally { setBusy(false); }
    }}>{loading ? 'Loading request…' : localError || error ? 'Retry loading request' : provider === 'claude' ? 'Refresh request details' : 'Load pending request'}</button>
  </section>;
}

export function OpenQuestions({ agentId, questions, attention, provider = 'codex' }: { agentId: string; questions: Question[]; attention: boolean; provider?: 'codex' | 'claude' }) {
  const rows = questions.flatMap(question => {
    const clarification = ['item/tool/requestUserInput', 'claude/tool/requestUserInput'].includes(question.method);
    const fields = question.method === 'claude/tool/requestUserInput' ? question.params.input?.questions : question.params.questions;
    const prompts: string[] = clarification && Array.isArray(fields)
      ? fields.map((item: any) => typeof item?.question === 'string' ? item.question : '').filter(Boolean)
      : [];
    const kind = requestKind(question);
    const detail = [question.params.reason, question.params.message, question.params.title].find(value => typeof value === 'string' && value.trim());
    const fallback = detail || (clarification ? 'Answer the pending clarification.' : kind === 'Command approval' ? 'Review the requested command.' : kind === 'File approval' ? 'Review the proposed file changes.' : 'Review this native request.');
    return (prompts.length ? prompts : [fallback]).map((text, index) => ({ question, kind, text, key: JSON.stringify([question.id, index]) }));
  });
  const pending = rows.length > 0 || attention;
  return <section className={`open-questions ${pending ? 'has-questions' : ''}`} aria-label="Open questions">
    <div className="open-questions-heading"><span className="context-label">OPEN QUESTIONS</span><span className="question-count" role="status" aria-live="polite" aria-label={rows.length ? `${rows.length} open questions` : attention ? 'Pending request details not loaded' : 'No open questions'}>{rows.length || (attention ? '!' : '0')}</span></div>
    {rows.length ? <ul>{rows.map(({ question, kind, text, key }) => <li key={key}>
      <button type="button" className="open-question" onClick={() => revealQuestion(agentId, question.id)} aria-label={`Open ${kind.toLowerCase()}: ${text}`}>
        <span className="open-question-kind">{kind}{question.review?.decision === 'ask' ? ' · Needs your decision' : ''}</span>
        <span className="open-question-text">{text}</span>
        {question.review?.decision === 'ask' && <span className="open-question-reason">{question.review.rationale}</span>}
        {question.error && <span className="error-text">{question.error}</span>}
        <span className="open-question-action">{question.responding ? 'Confirming answer…' : question.error ? 'Review answer error →' : 'Go to question →'}</span>
      </button>
    </li>)}</ul> : <p className="open-questions-empty">{attention ? provider === 'claude' ? 'Claude reports that it needs input; the request details have not arrived. Refresh request details in the conversation.' : 'Codex reports a pending request. Its details are not loaded here; use Load pending request in the conversation.' : 'No pending requests.'}</p>}
  </section>;
}
