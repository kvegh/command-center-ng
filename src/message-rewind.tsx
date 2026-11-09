import React, { useEffect, useRef, useState } from 'react';

export type RewindPreview = {
  previewToken: string; threadId: string;
  selected: { messageId: string; turnId: string; text: string; imageCount: number };
  affectedTurns: { id: string; status: string; userInputs: { messageId: string; text: string; imageCount: number }[]; assistantMessages: number; actions: number; messages?: { id: string; type: string; summary: string }[] }[];
  turnCount: number; messageCount: number; warning: string;
};
export type RewindReply = { id: string; draftText: string; rewound: true };
type RewindWorker = { provider?: string; role?: string; status: string; canSend: boolean; questions: unknown[]; rewindBlockedReason?: string | null; summarizing?: boolean; returning?: boolean; returnSummary?: { delivered: boolean }; handoff?: { phase: string } };

export function rewindUnavailable({ worker, connected, draft = '', imageCount = 0, busy = false }: {
  worker: RewindWorker; connected: boolean; draft?: string; imageCount?: number; busy?: boolean;
}) {
  if (worker.provider === 'claude') return 'Edit & rewind is currently available for Codex only.';
  if (worker.role === 'coordinator') return 'Edit & rewind is currently available in worker chats.';
  if (!connected) return 'Reconnect Codex before rewinding this conversation.';
  if (!worker.canSend) return 'This conversation is not currently editable here.';
  if (worker.rewindBlockedReason) return worker.rewindBlockedReason;
  if (worker.questions.length || worker.status === 'attention') return 'Answer the pending native request before rewinding.';
  if (worker.status !== 'idle') return 'Wait for this worker to finish its current action before rewinding.';
  if (worker.summarizing || worker.returning || worker.returnSummary || worker.handoff) return 'Finish the branch handoff before rewinding.';
  if (busy) return 'Wait for the current request to finish before rewinding.';
  if (draft.length || imageCount) return 'Send or clear this chat’s existing draft and attachments before rewinding. Your draft is kept.';
  return '';
}

export function EditRewindAction({ disabledReason, edit }: { disabledReason?: string; edit: () => void }) {
  return <button type="button" className="message-branch message-edit-rewind" disabled={!!disabledReason} aria-label={disabledReason ? `Edit & rewind: ${disabledReason}` : 'Edit & rewind'} title={disabledReason || 'Edit this input and rewind its entire turn plus all later turns'} onClick={() => { if (!disabledReason) edit(); }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1 12-12a3 3 0 0 0-4-4L4 15Z" /></svg>Edit &amp; rewind
  </button>;
}

export function RewindPreviewDetails({ preview }: { preview: RewindPreview }) {
  return <div className="rewind-affected" aria-label="Affected conversation history">
    <p className="field-note">{preview.turnCount} {preview.turnCount === 1 ? 'whole turn' : 'whole turns'} · {preview.messageCount} recorded messages/items will be removed.</p>
    {preview.affectedTurns.map((turn, index) => <details key={turn.id} open={index === 0}>
      <summary>Turn {index + 1} · {turn.userInputs.length} inputs · {turn.assistantMessages} replies · {turn.actions} actions</summary>
      <ul>{turn.userInputs.map(input => <li key={input.messageId}><strong>{input.messageId === preview.selected.messageId ? 'Selected input' : 'Other input in this turn'}:</strong><p className="rewind-input-text">{input.text || '(No text)'}</p>{input.imageCount > 0 && <span className="field-note">{input.imageCount} image attachments</span>}</li>)}</ul>
      {!!turn.messages?.length && <details><summary>All affected message summaries</summary><ul>{turn.messages.map(message => <li key={message.id}><strong>{message.type}:</strong> {message.summary}</li>)}</ul></details>}
    </details>)}
  </div>;
}

export function RewindDialog({ workerId, workerName, messageId, turnId, blocked, preview, commit, dismiss, applied }: {
  workerId: string; workerName: string; messageId: string; turnId: string; blocked?: string;
  preview: () => Promise<RewindPreview>; commit: (previewToken: string) => Promise<RewindReply>;
  dismiss: () => void; applied: (text: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<RewindPreview | null>(null); const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [confirmedToken, setConfirmedToken] = useState<string | null>(null); const [needsPreview, setNeedsPreview] = useState(false);
  const inFlight = useRef(false); const generation = useRef(0);
  const load = async () => {
    if (inFlight.current) return;
    const current = ++generation.current;
    setLoading(true); setError(''); setConfirmedToken(null); setNeedsPreview(true);
    try {
      const result = await preview();
      if (generation.current !== current) return;
      if (result.threadId !== workerId || result.selected.messageId !== messageId || result.selected.turnId !== turnId) throw new Error('The preview does not match this input. No rewind was submitted.');
      setData(result); setNeedsPreview(false);
    } catch (problem) { if (generation.current === current) setError((problem as Error).message); }
    finally { if (generation.current === current) setLoading(false); }
  };
  useEffect(() => { dialog.current?.showModal(); void load(); return () => { generation.current++; }; }, []);
  const attachments = !!data?.selected.imageCount;
  const disabled = loading || busy || needsPreview || !data || confirmedToken !== data.previewToken || !!blocked || attachments;
  const close = () => { if (!inFlight.current) dismiss(); };
  return <dialog ref={dialog} className="agent-dialog rewind-dialog" aria-labelledby="rewind-title" onCancel={event => { if (inFlight.current) event.preventDefault(); else dismiss(); }}>
    <div className="dialog-heading"><div><div className="eyebrow">{workerName}</div><h2 id="rewind-title">Edit &amp; rewind</h2></div><button type="button" className="icon-button" aria-label="Cancel rewind" disabled={busy} onClick={close}>×</button></div>
    <p className="rewind-warning">This removes the entire turn containing your input and all later turns, including other inputs within that turn.</p>
    <p className="field-note">Conversation history only. Commands already run, file changes, commits and deployments are not undone. Saved permissions are not revoked. Files, tasks and saved report/task-check schedules stay unchanged. After confirmation, edit your original input in the normal chat draft. It is never sent automatically.</p>
    <p className="field-note">Do not change this conversation from another client while confirming: new messages added there could also be removed.</p>
    {loading && <p className="field-note" role="status">Reading the native history preview…</p>}
    {data && <RewindPreviewDetails preview={data} />}
    {attachments && <p className="error-text" role="alert">This input has attachments. Restoring attachments is not supported yet, so it cannot be rewound here. Its history remains unchanged.</p>}
    <form onSubmit={async event => {
      event.preventDefault(); if (disabled || inFlight.current || !data) return;
      inFlight.current = true; setBusy(true); setError('');
      try {
        const result = await commit(data.previewToken);
        if (result.id !== workerId || result.rewound !== true || result.draftText !== data.selected.text) throw new Error('Native rewind confirmation did not match this input. Refresh the preview before taking another action.');
        applied(result.draftText);
      } catch (problem) { setError((problem as Error).message); setNeedsPreview(true); setConfirmedToken(null); }
      finally { inFlight.current = false; setBusy(false); }
    }}>
      <label className="rewind-confirm"><input type="checkbox" checked={!!data && confirmedToken === data.previewToken} disabled={loading || busy || !data || needsPreview || !!blocked || attachments} onChange={event => setConfirmedToken(event.target.checked ? data!.previewToken : null)} />I understand this rewinds whole turns and does not undo work.</label>
      {blocked && <p className="field-note" role="status">{blocked}</p>}
      {busy && <p className="field-note" role="status">Waiting for native rewind confirmation…</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      {needsPreview && !loading && <p className="field-note">Refresh the preview before trying again. No automatic retry will be sent.</p>}
      <div className="button-row"><button type="button" className="button subtle" disabled={busy} onClick={close}>Cancel</button><button type="button" className="button subtle" disabled={loading || busy} onClick={() => void load()}>Refresh preview</button><button className="button primary" disabled={disabled}>Rewind &amp; edit input</button></div>
    </form>
  </dialog>;
}
