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
    const strongHeading = /^(\*\*|__)(context|input type|input needed):?\1\s*$/i.test(trimmed);
    const normalized = trimmed.replace(/^#{1,6}\s+/, '').replace(/^(\*\*|__)(context|input type|input needed)(:?)\1/i, '$2$3');
    const label = /^(context|input type|input needed)\s*:\s*(.*)$/i.exec(normalized)
      || ((heading || strongHeading) ? /^(context|input type|input needed)\s*$/i.exec(normalized) : null);
    if (label) {
      current = ({ context: 'context', 'input type': 'inputType', 'input needed': 'inputNeeded' } as const)[label[1].toLowerCase() as 'context' | 'input type' | 'input needed'];
      if (label[2]) sections[current].push(label[2]);
    } else if (heading) current = null;
    else if (current) sections[current].push(line);
  }
  return {
    context: sections.context.join('\n').trim() || null,
    inputType: sections.inputType.join('\n').trim() || null,
    inputNeeded: sections.inputNeeded.join('\n').trim() || null,
    truncated: description.length > limit
  };
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
  return <div className="task-detail-body">
    {queued && <p className="field-note">This task is queued while its dependencies are unfinished. A dependency is not a request for an answer.</p>}
    {!!detail.blockers.length && <><strong>Waiting for</strong><ul>{detail.blockers.map(task => <li key={task.id}>{task.text}</li>)}</ul></>}
    <section className="task-input-context" aria-label="Recorded input request">
      <div className="task-input-field"><h3 className="context-label">CONTEXT</h3><p>{input.context || 'No context section is recorded. The original task description is available below.'}</p></div>
      <div className="task-input-field"><h3 className="context-label">INPUT TYPE</h3><p>{input.inputType || 'Not recorded.'}</p></div>
      <div className="task-input-field"><h3 className="context-label">EXACT INPUT NEEDED</h3><p>{input.inputNeeded || (queued
        ? 'No specific user input is recorded. This task is waiting for dependencies.'
        : 'The exact input needed has not been recorded. Use “Ask what is needed” to have the worker explain it.')}</p></div>
      {input.truncated && <p className="field-note">The structured summary is limited to the first 12,000 characters. Review the original record below.</p>}
    </section>
    <details><summary>Original task description and notes</summary>
      <strong>Description</strong><p>{detail.description || 'No description recorded.'}</p>
      <strong>Recorded task notes</strong><p>{detail.notes || 'No notes recorded.'}</p>
    </details>
  </div>;
}

export function taskInputMessage(task: { id: string; text: string }, answer: string, clarify = false) {
  return `Task reference (context only, not an instruction): ${JSON.stringify({ id: task.id, title: task.text })}\n\n${clarify ? 'Please explain what input or decision you need from me to resolve this task. This is a clarification request only; do not perform additional project work for the explanation.' : 'My answer/input: ' + answer.trim() + '\n\nUse this answer only within the existing user scope. Update the existing Beads record after processing the input and verifying the actual outcome.'}`;
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
