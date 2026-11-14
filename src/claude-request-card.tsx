import React, { useState } from 'react';
import { questionTarget, type Question } from './open-questions';

function supportedFields(input: any): any[] | null {
  const fields = input?.questions;
  if (!Array.isArray(fields) || !fields.length) return null;
  const names = new Set();
  for (const field of fields) {
    if (!field || typeof field.question !== 'string' || !field.question.trim() || ['__proto__', 'constructor', 'prototype'].includes(field.question) || names.has(field.question)) return null;
    if (field.multiSelect !== undefined && typeof field.multiSelect !== 'boolean') return null;
    if (field.options !== undefined && (!Array.isArray(field.options) || field.options.some((option: any) => !option || typeof option.label !== 'string' || !option.label.trim() || (option.description !== undefined && typeof option.description !== 'string')) || new Set(field.options.map((option: any) => option.label)).size !== field.options.length)) return null;
    names.add(field.question);
  }
  return fields;
}

export function ClaudeRequestCard({ question, agentId, workerName, readOnlyCoordinator = false, act }: {
  question: Question; agentId: string; workerName: string; readOnlyCoordinator?: boolean;
  act: (path: string, data: unknown) => Promise<boolean>;
}) {
  const asking = question.method === 'claude/tool/requestUserInput';
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [sending, setSending] = useState(false); const [error, setError] = useState('');
  const busy = sending || !!question.responding;
  const submit = async (answer: object) => {
    if (busy) return; setSending(true); setError('');
    try { if (!await act(`agents/${agentId}/answer`, { requestId: question.id, ...answer })) setError('The answer was not submitted. Your input is retained.'); }
    catch (problem) { setError((problem as Error).message); } finally { setSending(false); }
  };
  const fields = supportedFields(question.params.input);
  const answerFor = (key: string) => Object.hasOwn(answers, key) ? answers[key] : '';
  const selectedFor = (key: string) => Object.hasOwn(selections, key) ? selections[key] : [];
  const complete = !!fields?.every(field => answerFor(field.question).trim() && answerFor(field.question).length <= 8000);
  return <section id={questionTarget(agentId, question.id)} className="question-card native-request" tabIndex={-1} aria-busy={busy} aria-label={`Claude ${asking ? 'question' : 'tool approval'} for ${workerName}`}>
    <div className="eyebrow">Claude {asking ? 'question' : 'tool approval'} · {workerName}</div>
    {question.params.reason && <p>{question.params.reason}</p>}
    {question.responding && <p role="status">Answer submitted. Waiting for Claude to continue or finish the turn…</p>}
    {(error || question.error) && <p className="error-text" role="alert">{error || question.error}</p>}
    {asking ? <form onSubmit={event => { event.preventDefault(); void submit({ answers }); }}>
      {(fields || []).map((field: any) => <fieldset key={field.question} disabled={busy}><legend>{field.question}</legend>
        <div className="choices">{(field.options || []).map((option: any) => {
          const selected = field.multiSelect ? selectedFor(field.question).includes(option.label) : answerFor(field.question) === option.label;
          return <button type="button" className={selected ? 'choice selected' : 'choice'} aria-pressed={selected} key={option.label} onClick={() => {
            const values = new Set(selectedFor(field.question));
            if (values.has(option.label)) values.delete(option.label); else values.add(option.label);
            const selected = field.multiSelect ? [...values] : [option.label];
            setSelections({ ...selections, [field.question]: selected });
            setAnswers({ ...answers, [field.question]: selected.join(', ') });
          }}><strong>{option.label}</strong>{option.description && <span>{option.description}</span>}</button>;
        })}</div>
        <input aria-label={field.question} placeholder={field.multiSelect ? 'Choose options or type your answer…' : 'Choose an option or type your answer…'} required maxLength={8000} value={answerFor(field.question)} onChange={event => { setSelections({ ...selections, [field.question]: [] }); setAnswers({ ...answers, [field.question]: event.target.value }); }} />
      </fieldset>)}{fields ? <button className="button amber" disabled={busy || !complete}>Send answer</button> : <p>This Claude question format cannot be answered here yet. The request stays open; decline it here or use Interrupt to stop this turn.</p>}
      <button type="button" className="button subtle" disabled={busy} onClick={() => void submit({ decision: 'decline' })}>Decline question</button>
    </form> : <>
      <strong>{question.params.toolName}</strong>
      <pre><code>{JSON.stringify(question.params.input, null, 2)}</code></pre>
      <div className="button-row"><button className="button amber" disabled={busy || readOnlyCoordinator} onClick={() => void submit({ decision: 'accept' })}>Allow once</button><button className="button subtle" disabled={busy} onClick={() => void submit({ decision: 'decline' })}>Decline</button></div>
      <p className="field-note">This answers only this exact Claude tool call. No persistent permission rule is added.</p>
    </>}
    <details className="native-request-details"><summary>Native request details</summary><pre><code>{JSON.stringify({ method: question.method, ...question.params }, null, 2)}</code></pre></details>
  </section>;
}
