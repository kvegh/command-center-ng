import React, { useEffect, useRef, useState } from 'react';

type Detail = { id: string; text: string; state: string; description: string; notes: string; blockers: { id: string; text: string }[] };

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
  useEffect(() => { dialog.current?.showModal(); void load().then(setDetail).catch(problem => setError(problem.message)); }, []);
  const submit = async (clarify = false) => {
    if (!detail || !canSend || busy || (!clarify && !answer.trim())) return;
    setBusy(true); setError('');
    try { if (await send(taskInputMessage(detail, answer, clarify))) dismiss(); else setError('The message could not be sent. Your answer is retained.'); }
    catch (problem) { setError((problem as Error).message); } finally { setBusy(false); }
  };
  return <dialog ref={dialog} onCancel={dismiss} className="agent-dialog task-discussion">
    <div className="dialog-heading"><div><div className="eyebrow">TASK · {workerName}</div><h2>{detail?.text || 'Loading task…'}</h2></div><button type="button" className="icon-button" aria-label="Close task" onClick={dismiss}>×</button></div>
    {error && <p className="error-text" role="alert">{error}</p>}
    {detail && <><p className="field-note">Status: {detail.blockers.length && detail.state !== 'in_progress' ? 'queued' : detail.state.replaceAll('_', ' ')} · {detail.id}</p>
      <div className="task-detail-body"><p>{detail.description || 'No description recorded.'}</p>
        {!!detail.blockers.length && <><strong>Waiting for</strong><ul>{detail.blockers.map(task => <li key={task.id}>{task.text}</li>)}</ul></>}
        {!!detail.notes && <details><summary>Recorded task notes</summary><p>{detail.notes}</p></details>}
      </div>
      <form onSubmit={event => { event.preventDefault(); void submit(); }}><label htmlFor="task-answer">Your answer or direction</label><textarea id="task-answer" rows={4} maxLength={8000} value={answer} onChange={event => setAnswer(event.target.value)} />
        <p className="field-note">The worker will process your answer and update the task. {canSend ? '' : 'Resolve pending native requests or restore the connection before sending; you can keep drafting here.'}</p>
        <div className="button-row"><button type="submit" className="button primary" disabled={!canSend || busy || !answer.trim()}>Send to worker</button><button type="button" className="button subtle" disabled={!canSend || busy} onClick={() => void submit(true)}>Ask what is needed</button></div>
      </form></>}
  </dialog>;
}
