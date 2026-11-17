import React, { useEffect, useRef, useState } from 'react';

type Provider = 'codex' | 'claude';
export type HandoverCreate = { provider: Provider; cwd: string; confirmedName?: string };
export type HandoverCreateDraft = Pick<HandoverCreate, 'provider' | 'cwd'>;
export type HandoverProgress = {
  state: 'preparing' | 'starting' | 'started' | 'failed';
  name: string; provider: Provider; path: string; id?: string; error?: string;
};
export type HandoverNameConflict = {
  existing: { id: string; name: string; provider: Provider }[];
  nextName: string;
};
type HandoverAccepted = { accepted: true; path: string; state: 'preparing' };
type Availability = { codexReady: boolean; claudeReady: boolean; full: boolean };

function createReady(draft: HandoverCreateDraft, availability: Availability) {
  const ready = draft.provider === 'codex' ? availability.codexReady
    : draft.provider === 'claude' ? availability.claudeReady : false;
  // The backend checks collisions before capacity, so a full workspace can
  // still discover and open an existing version without allocating a worker.
  return ready && !!draft.cwd.trim();
}

function nameConflict(problem: unknown): HandoverNameConflict | null {
  const error = problem as { code?: unknown; handoverConflict?: HandoverNameConflict } | null;
  const conflict = error?.handoverConflict;
  if (error?.code !== 'handover_name_conflict' || !conflict
    || typeof conflict.nextName !== 'string' || !conflict.nextName.trim()
    || !Array.isArray(conflict.existing) || !conflict.existing.length
    || conflict.existing.some(item => !item || typeof item.id !== 'string' || !item.id
      || typeof item.name !== 'string' || !item.name
      || !['codex', 'claude'].includes(item.provider))) return null;
  return conflict;
}

/** Keep the source provider selected while allowing an explicit provider change. */
export function HandoverCreateForm({ id, draft, change, busy, error, codexReady, claudeReady, full, submit, conflictChoices }: {
  id: string; draft: HandoverCreateDraft; change: (value: HandoverCreateDraft) => void;
  busy: boolean; error: string; submit: (value: HandoverCreate) => Promise<void>;
  conflictChoices?: React.ReactNode;
} & Availability) {
  const ready = createReady(draft, { codexReady, claudeReady, full });
  return <form className="new-agent" onSubmit={async event => {
    event.preventDefault();
    if (busy || !ready || conflictChoices) return;
    await submit({ provider: draft.provider, cwd: draft.cwd.trim() });
  }}>
    <label htmlFor={`${id}-provider`}>Which agent should continue?</label>
    <select id={`${id}-provider`} value={draft.provider} disabled={busy} required onChange={event => change({ ...draft, provider: event.target.value as Provider })}>
      <option value="codex" disabled={!codexReady}>Codex{codexReady ? '' : ' — unavailable'}</option>
      <option value="claude" disabled={!claudeReady}>Claude{claudeReady ? '' : ' — unavailable'}</option>
    </select>
    <label htmlFor={`${id}-cwd`}>Project directory</label>
    <input id={`${id}-cwd`} className="mono" value={draft.cwd} disabled={busy} required onChange={event => change({ ...draft, cwd: event.target.value })} />
    <p className="field-note">Prepare the handover first, then start a fresh receiving chat that imports it automatically. The source chat stays available.</p>
    {full && <p className="field-note" role="status">All worker tabs are open. You can check for an existing version; close a tab before creating a new one.</p>}
    {!codexReady && !claudeReady && <p className="field-note" role="status">Connect an agent runtime before creating a receiving chat.</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    {conflictChoices || <button type="submit" className="button primary" disabled={busy || !ready}>{busy ? 'Preparing handover…' : 'Create handover'}</button>}
  </form>;
}

export function HandoverConflictChoices({ conflict, busy, openExisting, createNext }: {
  conflict: HandoverNameConflict; busy: boolean;
  openExisting: (id: string) => Promise<void>; createNext: (name: string) => Promise<void>;
}) {
  return <div>
    <p className="field-note" role="status">A receiving chat with that name already exists. Open it, or explicitly create the next unused version.</p>
    <div className="button-row">
      {conflict.existing.map(item => <button key={item.id} type="button" className="button subtle small" disabled={busy} onClick={() => { if (!busy) void openExisting(item.id); }}>Open {item.name} ({item.provider === 'claude' ? 'Claude' : 'Codex'})</button>)}
      <button type="button" className="button primary small" disabled={busy} onClick={() => { if (!busy) void createNext(conflict.nextName); }}>Create {conflict.nextName}</button>
    </div>
  </div>;
}

export function HandoverProgressNotice({ progress, choose }: { progress: HandoverProgress; choose: (id: string) => void }) {
  if (progress.state === 'failed') return <p className="error-text" role="alert">{progress.error || 'The handover could not be completed. Check the source chat before trying again.'}</p>;
  const receiverId = progress.state === 'started' ? progress.id : undefined;
  return <div>
    <p className="field-note" role="status">{progress.state === 'preparing'
      ? 'Preparing handover' + (progress.name ? ' for ' + progress.name : '') + '. The receiving chat will start after the file is ready.'
      : progress.state === 'starting' ? 'Handover prepared. Starting ' + progress.name + ' with automatic import.'
      : 'Receiving chat ' + progress.name + ' started. Automatic handover import was requested; check that chat for the result.'}</p>
    {receiverId && <button type="button" className="button subtle small" onClick={() => choose(receiverId)}>Open receiving chat</button>}
  </div>;
}

export function HandoverControls({ agentId, cwd, sourceProvider, canCreate, progress, codexReady, claudeReady, full, create, openExisting, choose }: {
  agentId: string; cwd: string; sourceProvider: Provider; canCreate: boolean; progress?: HandoverProgress;
  create: (value: HandoverCreate) => Promise<HandoverAccepted>;
  openExisting: (id: string) => Promise<void>; choose: (id: string) => void;
} & Availability) {
  const createDialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true), creating = useRef(false), opening = useRef(false), acceptedRequest = useRef<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false), [openBusy, setOpenBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [conflict, setConflict] = useState<HandoverNameConflict | null>(null);
  const [draft, setDraft] = useState<HandoverCreateDraft>({ provider: sourceProvider, cwd });
  const [accepted, setAccepted] = useState<{ path: string; provider: Provider } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (progress?.path === acceptedRequest.current && ['started', 'failed'].includes(progress.state)) acceptedRequest.current = null;
    if (accepted && progress?.path === accepted.path) setAccepted(null);
  }, [accepted, progress]);
  // The response can arrive before the snapshot, or while an older completed
  // handover remains visible. Keep preparation locked until its own path appears.
  const currentProgress = accepted && accepted.path !== progress?.path
    ? { state: 'preparing' as const, name: '', path: accepted.path, provider: accepted.provider }
    : progress;
  const preparing = currentProgress?.state === 'preparing' || currentProgress?.state === 'starting';
  const busy = createBusy || openBusy || preparing;
  const id = `${agentId}-handover`;
  const submitCreate = async (value: HandoverCreate) => {
    if (!canCreate || creating.current || opening.current || acceptedRequest.current || preparing || !createReady(value, { codexReady, claudeReady, full })) return;
    creating.current = true; setCreateBusy(true); setCreateError(''); setConflict(null);
    try {
      const result = await create(value);
      if (!result || result.accepted !== true || result.state !== 'preparing' || typeof result.path !== 'string' || !result.path) throw new Error('Handover preparation could not be confirmed. Check the source chat before trying again.');
      if (!alive.current) return;
      acceptedRequest.current = result.path;
      setAccepted({ path: result.path, provider: value.provider }); createDialog.current?.close();
    } catch (problem) {
      if (alive.current) {
        setConflict(nameConflict(problem));
        setCreateError(problem instanceof Error ? problem.message : 'The request could not be confirmed. Check existing chats before creating another handover.');
      }
    } finally { creating.current = false; if (alive.current) setCreateBusy(false); }
  };
  const openConflict = async (targetId: string) => {
    if (creating.current || opening.current || acceptedRequest.current || preparing) return;
    opening.current = true; setOpenBusy(true); setCreateError('');
    try {
      await openExisting(targetId);
      if (alive.current) createDialog.current?.close();
    } catch (problem) {
      if (alive.current) setCreateError(problem instanceof Error ? problem.message : 'The existing chat could not be opened. Check its current state.');
    } finally { opening.current = false; if (alive.current) setOpenBusy(false); }
  };
  const changeDraft = (value: HandoverCreateDraft) => { setDraft(value); setConflict(null); setCreateError(''); };
  return <div className="handover-controls">
    <div className="button-row">
      <button type="button" className="button subtle small" disabled={!canCreate || busy} title="Prepare a handover and start a receiving chat that imports it automatically" onClick={() => { if (canCreate && !creating.current && !opening.current && !preparing && !createDialog.current?.open) createDialog.current?.showModal(); }}>Create handover</button>
    </div>
    {currentProgress && <HandoverProgressNotice progress={currentProgress} choose={choose} />}
    <dialog ref={createDialog} className="agent-dialog handover-dialog" aria-labelledby={`${id}-create-title`} onCancel={event => { if (creating.current || opening.current || preparing) event.preventDefault(); }}>
      <div className="dialog-heading"><div><div className="eyebrow">PREPARE A FRESH RECEIVING CHAT</div><h2 id={`${id}-create-title`}>Create handover</h2></div><button type="button" className="icon-button" aria-label="Close handover creation" disabled={busy} onClick={() => createDialog.current?.close()}>×</button></div>
      <HandoverCreateForm id={id} draft={draft} change={changeDraft} busy={busy} error={createError} codexReady={codexReady} claudeReady={claudeReady} full={full} submit={submitCreate}
        conflictChoices={conflict && <HandoverConflictChoices conflict={conflict} busy={busy} openExisting={openConflict} createNext={name => submitCreate({ ...draft, cwd: draft.cwd.trim(), confirmedName: name })} />} />
    </dialog>
  </div>;
}
