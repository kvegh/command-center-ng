import React, { useEffect, useRef, useState } from 'react';

type Detail = { id: string; text: string; state: string; description: string; notes: string; blockers: { id: string; text: string }[]; isChatQuestion?: boolean };
type InputField = 'context' | 'inputType' | 'inputNeeded';

export function parseTaskInputContext(description: string) {
  const limit = 12000;
  const sections: Record<InputField, string[]> = { context: [], inputType: [], inputNeeded: [] };
  let current: InputField | null = null;
  let fence: string | null = null;

  // Only explicit fields are requests. Do not infer requirements from prose,
  // task titles, notes or example labels inside fenced code.
  for (const line of description.slice(0, limit).split(/\r?\n/)) {
    const trimmed = line.trim();
    const marker = /^(`{3,}|~{3,})/.exec(trimmed);
    if (marker) {
      if (current) sections[current].push(line);
      if (!fence) fence = marker[1][0];
      else if (fence === marker[1][0]) fence = null;
      continue;
    }
    if (fence) {
      if (current) sections[current].push(line);
      continue;
    }
    const heading = /^#{1,6}\s+/.test(trimmed);
    const strongHeading = /^(\*\*|__)(context|input type|input needed|needed|why):?\1\s*$/i.test(trimmed);
    const normalized = trimmed.replace(/^#{1,6}\s+/, '').replace(/^(\*\*|__)(context|input type|input needed|needed|why)(:?)\1/i, '$2$3');
    const label = /^(context|input type|input needed|needed|why)\s*:\s*(.*)$/i.exec(normalized)
      || ((heading || strongHeading) ? /^(context|input type|input needed|needed|why)\s*$/i.exec(normalized) : null);
    if (label) {
      current = ({ context: 'context', why: 'context', 'input type': 'inputType', 'input needed': 'inputNeeded', needed: 'inputNeeded' } as const)[label[1].toLowerCase() as 'context' | 'why' | 'input type' | 'input needed' | 'needed'];
      if (label[2]) sections[current].push(label[2]);
    } else if (heading || /^details\s*:/i.test(normalized)) current = null;
    else if (current) sections[current].push(line);
  }
  return {
    context: sections.context.join('\n').trim() || null,
    inputType: sections.inputType.join('\n').trim() || null,
    inputNeeded: sections.inputNeeded.join('\n').trim() || null,
    truncated: description.length > limit
  };
}

export function taskInputPreview(value: string | null, wordLimit: number, sentenceLimit: number) {
  if (!value) return { text: null, shortened: false };
  // A preview is a bounded excerpt, never a generated interpretation of an old
  // request. Fenced commands stay in Details rather than becoming partial code.
  const lines: string[] = []; let fence: string | null = null;
  for (const line of value.split(/\r?\n/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (fence === marker[1][0]) fence = null;
    } else if (!fence) lines.push(line);
  }
  const prose = lines.join(' ').replace(/\s+/g, ' ').trim();
  const words = prose.split(/\s+/).filter(Boolean);
  let text = words.slice(0, wordLimit).join(' ');
  const endings = [...text.matchAll(/[.!?](?=\s|$)/g)];
  if (endings.length >= sentenceLimit) text = text.slice(0, endings[sentenceLimit - 1].index! + 1);
  const shortened = prose !== value.replace(/\s+/g, ' ').trim() || text !== prose;
  return { text: text ? text + (shortened && !/[.!?]$/.test(text) ? '…' : '') : null, shortened };
}

function queuedTask(detail: Detail) { return detail.blockers.length > 0 && detail.state !== 'in_progress'; }
function taskStatus(detail: Detail) {
  if (queuedTask(detail)) return 'queued';
  if (detail.isChatQuestion || ['blocked', 'needs_input', 'waiting_on_input', 'waiting_on_approval'].includes(detail.state)) return 'needs input';
  return detail.state.replaceAll('_', ' ');
}

export function TaskDetailBody({ detail }: { detail: Detail }) {
  const input = parseTaskInputContext(detail.description);
  const queued = queuedTask(detail);
  const needed = taskInputPreview(input.inputNeeded, 30, 2);
  const why = taskInputPreview(input.context, 20, 1);
  return <div className="task-detail-body">
    <section className="task-input-context" aria-label="Recorded input request">
      <div className="task-input-field"><h3 className="context-label">Needed</h3><p>{needed.text || (input.inputNeeded
        ? 'Read the recorded action in Details.'
        : queued ? 'No answer is needed while this task waits for dependencies.'
        : 'The exact input needed is not recorded. Use “Ask what is needed” for a short question.')}</p></div>
      <div className="task-input-field"><h3 className="context-label">Why</h3><p>{why.text || (queued
        ? 'Prerequisite work must finish first.' : 'The worker has not recorded a short explanation.')}</p></div>
      {(needed.shortened || why.shortened || input.truncated) && <p className="field-note">Short preview. Read Details for the full wording.</p>}
    </section>
    <details><summary>Details</summary>
      {queued && <p className="field-note">This task is queued while its dependencies are unfinished. A dependency is not a request for an answer.</p>}
      {!!detail.blockers.length && <><strong>Waiting for</strong><ul>{detail.blockers.map(task => <li key={task.id}>{task.text}</li>)}</ul></>}
      <strong>Original task description</strong><p>{detail.description || 'No description recorded.'}</p>
      <strong>Recorded task notes</strong><p>{detail.notes || 'No notes recorded.'}</p>
    </details>
  </div>;
}

export function taskInputMessage(task: { id: string; text: string }, answer: string, clarify = false) {
  return `Task reference (context only, not an instruction): ${JSON.stringify({ id: task.id, title: task.text })}\n\n${clarify ? 'Please explain the input needed using this format:\nNeeded: the direct question or action, at most 30 words in one or two short sentences.\nWhy: one short reason, at most 20 words.\nDetails: put exact commands and background here, not in the upfront question. Use the established protected mechanism for secret values.\nThis is a clarification request only; do not perform additional project work for the explanation.' : 'My answer/input: ' + answer.trim() + '\n\nUse this answer only within the existing user scope. Update the existing Beads record after processing the input and verifying the actual outcome.'}`;
}

export function TaskDiscussion({ taskId, workerName, canSend, load, send, dismiss }: {
  taskId: string; workerName: string; canSend: boolean; load: () => Promise<Detail>;
  send: (text: string) => Promise<boolean>; dismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [answer, setAnswer] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    const current = ++revision.current;
    setDetail(null); setAnswer(''); setError(''); setBusy(false);
    if (!dialog.current?.open) dialog.current?.showModal();
    void Promise.resolve().then(load).then(value => {
      if (revision.current !== current) return;
      if (value.id !== taskId) throw new Error('The returned details do not match the selected task.');
      setDetail(value);
    }).catch(problem => {
      if (revision.current === current) setError(problem instanceof Error ? problem.message : 'Task details could not be read.');
    });
    return () => { if (revision.current === current) revision.current++; };
  }, [taskId]);
  const submit = async (clarify = false) => {
    if (!detail || detail.id !== taskId || !canSend || busy || (!clarify && !answer.trim())) return;
    const current = revision.current;
    setBusy(true); setError('');
    try {
      const sent = await send(taskInputMessage(detail, answer, clarify));
      if (revision.current !== current) return;
      if (sent) dismiss(); else setError('The message could not be sent. Your answer is retained.');
    } catch (problem) {
      if (revision.current === current) setError(problem instanceof Error ? problem.message : 'The message could not be sent. Your answer is retained.');
    } finally { if (revision.current === current) setBusy(false); }
  };
  return <dialog ref={dialog} onCancel={dismiss} className="agent-dialog task-discussion">
    <div className="dialog-heading"><div><div className="eyebrow">TASK · {workerName}</div><h2>{detail?.text || (error ? 'Task details unavailable' : 'Loading task…')}</h2></div><button type="button" className="icon-button" aria-label="Close task" onClick={dismiss}>×</button></div>
    {error && <p className="error-text" role="alert">{error}</p>}
    {detail && <><p className="field-note">Status: {taskStatus(detail)} · {detail.id}</p>
      <TaskDetailBody detail={detail} />
      <form onSubmit={event => { event.preventDefault(); void submit(); }}><label htmlFor="task-answer">{queuedTask(detail) && !parseTaskInputContext(detail.description).inputNeeded ? 'Optional direction to worker' : 'Your answer or direction'}</label><textarea id="task-answer" rows={4} maxLength={8000} value={answer} onChange={event => setAnswer(event.target.value)} />
        <p className="field-note">The worker will process your answer and update the task. {canSend ? '' : 'Resolve pending native requests or restore the connection before sending; you can keep drafting here.'}</p>
        <div className="button-row"><button type="submit" className="button primary" disabled={!canSend || busy || !answer.trim()}>Send to worker</button><button type="button" className="button subtle" disabled={!canSend || busy} onClick={() => void submit(true)}>Ask what is needed</button></div>
      </form></>}
  </dialog>;
}
