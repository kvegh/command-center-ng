import React from 'react';

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
  const control = card.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled), textarea:not(:disabled)');
  (control || card).focus({ preventScroll: true });
}

export function OpenQuestions({ agentId, questions, attention }: { agentId: string; questions: Question[]; attention: boolean }) {
  const rows = questions.flatMap(question => {
    const clarification = question.method === 'item/tool/requestUserInput';
    const prompts: string[] = clarification && Array.isArray(question.params.questions)
      ? question.params.questions.map((item: any) => typeof item.question === 'string' ? item.question : '').filter(Boolean)
      : [];
    const kind = clarification ? 'Question' : question.method === 'item/commandExecution/requestApproval' ? 'Command approval' : question.method === 'item/fileChange/requestApproval' ? 'File approval' : 'Native action';
    const detail = [question.params.reason, question.params.message, question.params.title].find(value => typeof value === 'string' && value.trim());
    const fallback = detail || (clarification ? 'Answer the pending clarification.' : kind === 'Command approval' ? 'Review the requested command.' : kind === 'File approval' ? 'Review the proposed file changes.' : 'Complete this request in Codex.');
    return (prompts.length ? prompts : [fallback]).map((text, index) => ({ question, kind, text, key: JSON.stringify([question.id, index]) }));
  });
  const pending = rows.length > 0 || attention;
  return <section className={`open-questions ${pending ? 'has-questions' : ''}`} aria-label="Open questions">
    <div className="open-questions-heading"><span className="context-label">OPEN QUESTIONS</span><span className="question-count" role="status" aria-live="polite" aria-label={rows.length ? `${rows.length} open questions` : attention ? 'Pending request in another Codex client' : 'No open questions'}>{rows.length || (attention ? '!' : '0')}</span></div>
    {rows.length ? <ul>{rows.map(({ question, kind, text, key }) => <li key={key}>
      <button type="button" className="open-question" onClick={() => revealQuestion(agentId, question.id)} aria-label={`Open ${kind.toLowerCase()}: ${text}`}>
        <span className="open-question-kind">{kind}{question.review?.decision === 'ask' ? ' · Needs your decision' : ''}</span>
        <span className="open-question-text">{text}</span>
        {question.review?.decision === 'ask' && <span className="open-question-reason">{question.review.rationale}</span>}
        {question.error && <span className="error-text">{question.error}</span>}
        <span className="open-question-action">{question.responding ? 'Confirming answer…' : question.error ? 'Review answer error →' : 'Go to question →'}</span>
      </button>
    </li>)}</ul> : <p className="open-questions-empty">{attention ? 'A pending request belongs to another Codex client. Answer it there.' : 'No pending requests.'}</p>}
  </section>;
}
