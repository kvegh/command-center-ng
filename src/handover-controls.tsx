import React, { useEffect, useRef, useState } from 'react';

type Provider = 'codex' | 'claude';
export type HandoverCreate = { provider: Provider; cwd: string };
export type HandoverCreateDraft = { provider: Provider | ''; cwd: string };
export type HandoverImport = { path: string };
type Receiver = { id: string; path: string };
type Availability = { codexReady: boolean; claudeReady: boolean; full: boolean };

function createReady(draft: HandoverCreateDraft, availability: Availability) {
  const ready = draft.provider === 'codex' ? availability.codexReady
    : draft.provider === 'claude' ? availability.claudeReady : false;
  return ready && !availability.full && !!draft.cwd.trim();
}

/** Agent selection belongs to creation; import uses the receiving chat itself. */
export function HandoverCreateForm({ id, draft, change, busy, error, codexReady, claudeReady, full, submit }: {
  id: string; draft: HandoverCreateDraft; change: (value: HandoverCreateDraft) => void;
  busy: boolean; error: string; submit: (value: HandoverCreate) => Promise<void>;
} & Availability) {
  const ready = createReady(draft, { codexReady, claudeReady, full });
  return <form className="new-agent" onSubmit={async event => {
    event.preventDefault();
    if (busy || !ready || !draft.provider) return;
    await submit({ provider: draft.provider, cwd: draft.cwd.trim() });
  }}>
    <label htmlFor={`${id}-provider`}>Which agent should continue?</label>
    <select id={`${id}-provider`} value={draft.provider} disabled={busy} required onChange={event => change({ ...draft, provider: event.target.value as Provider | '' })}>
      <option value="" disabled>Choose an agent</option>
      <option value="codex" disabled={!codexReady}>Codex{codexReady ? '' : ' — unavailable'}</option>
      <option value="claude" disabled={!claudeReady}>Claude{claudeReady ? '' : ' — unavailable'}</option>
    </select>
    <label htmlFor={`${id}-cwd`}>Project directory</label>
    <input id={`${id}-cwd`} className="mono" value={draft.cwd} disabled={busy} required onChange={event => change({ ...draft, cwd: event.target.value })} />
    <p className="field-note">Start a fresh receiving chat, then ask this agent to prepare its handover. You will import it from the receiving chat when ready. The source chat stays available.</p>
    {full && <p className="field-note" role="status">Close an agent tab to make room for the receiving chat.</p>}
    {!codexReady && !claudeReady && <p className="field-note" role="status">Connect an agent runtime before creating a receiving chat.</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    <button type="submit" className="button primary" disabled={busy || !ready}>{busy ? 'Creating…' : 'Create handover'}</button>
  </form>;
}

export function HandoverImportForm({ id, path, change, busy, canImport, error, submit }: {
  id: string; path: string; change: (value: string) => void; busy: boolean;
  canImport: boolean; error: string; submit: (value: HandoverImport) => Promise<void>;
}) {
  return <form className="new-agent" onSubmit={async event => {
    event.preventDefault();
    if (busy || !canImport || !path.trim()) return;
    await submit({ path: path.trim() });
  }}>
    <label htmlFor={`${id}-path`}>Handover path</label>
    <input id={`${id}-path`} className="mono" value={path} disabled={busy} maxLength={1024} placeholder="The handoff.md path assigned to this receiving chat" required onChange={event => change(event.target.value)} />
    <p className="field-note">Import into this receiving chat. The assigned path does not mean the file is ready: wait for the source agent to confirm it has saved the handover.</p>
    {!canImport && <p className="field-note" role="status">Open the assigned receiving chat to import its handover.</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    <button type="submit" className="button primary" disabled={busy || !canImport || !path.trim()}>{busy ? 'Requesting import…' : 'Import handover'}</button>
  </form>;
}

export function HandoverReadyNotice({ receiver, choose }: { receiver: Receiver; choose: (id: string) => void }) {
  return <div>
    <p className="field-note" role="status">Receiving chat started and handover requested. The source agent will report when the file is ready. Open the receiving chat and click Import handover there.</p>
    <button type="button" className="button subtle small" onClick={() => choose(receiver.id)}>Open receiving chat</button>
  </div>;
}

export function HandoverControls({ agentId, cwd, canCreate, canImport, defaultHandoverPath, codexReady, claudeReady, full, create, importHandover, choose }: {
  agentId: string; cwd: string; canCreate: boolean; canImport: boolean; defaultHandoverPath?: string;
  create: (value: HandoverCreate) => Promise<Receiver>;
  importHandover: (value: HandoverImport) => Promise<unknown>;
  choose: (id: string) => void;
} & Availability) {
  const createDialog = useRef<HTMLDialogElement>(null), importDialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true), creating = useRef(false), importing = useRef(false), pathEdited = useRef(false);
  const [createBusy, setCreateBusy] = useState(false), [importBusy, setImportBusy] = useState(false);
  const [receiver, setReceiver] = useState<Receiver | null>(null);
  const [notice, setNotice] = useState(''), [createError, setCreateError] = useState(''), [importError, setImportError] = useState('');
  const [draft, setDraft] = useState<HandoverCreateDraft>({ provider: '', cwd });
  const [path, setPath] = useState(defaultHandoverPath || '');
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!pathEdited.current) setPath(defaultHandoverPath || ''); }, [defaultHandoverPath]);
  const id = `${agentId}-handover`;
  const submitCreate = async (value: HandoverCreate) => {
    if (!canCreate || importing.current || creating.current || !createReady(value, { codexReady, claudeReady, full })) return;
    creating.current = true; setCreateBusy(true); setCreateError('');
    try {
      const result = await create(value);
      if (!result || typeof result.id !== 'string' || !result.id || typeof result.path !== 'string' || !result.path) throw new Error('The receiving chat could not be confirmed. Check existing chats before creating another handover.');
      if (!alive.current) return;
      setReceiver(result); createDialog.current?.close();
    } catch (problem) {
      if (alive.current) setCreateError(problem instanceof Error ? problem.message : 'The request could not be confirmed. Check existing chats before creating another handover.');
    } finally { creating.current = false; if (alive.current) setCreateBusy(false); }
  };
  const submitImport = async (value: HandoverImport) => {
    if (!canImport || importing.current || creating.current || !value.path.trim()) return;
    importing.current = true; setImportBusy(true); setImportError(''); setNotice('');
    try {
      await importHandover({ path: value.path.trim() });
      if (!alive.current) return;
      setNotice('Import requested. This chat will read the handover and check the current state before continuing.');
      importDialog.current?.close();
    } catch (problem) {
      if (alive.current) setImportError(problem instanceof Error ? problem.message : 'The import could not be confirmed. Check this chat before trying again.');
    } finally { importing.current = false; if (alive.current) setImportBusy(false); }
  };
  return <div className="handover-controls">
    <div className="button-row">
      <button type="button" className="button subtle small" disabled={!canCreate || createBusy || importBusy} title="Start a receiving chat and request a handover from this agent" onClick={() => { if (canCreate && !creating.current && !importing.current && !createDialog.current?.open) createDialog.current?.showModal(); }}>Create handover</button>
      <button type="button" className="button subtle small" disabled={!canImport || createBusy || importBusy} title={canImport ? 'Import the assigned handover into this receiving chat' : 'Import from the assigned receiving chat'} onClick={() => { if (canImport && !creating.current && !importing.current && !importDialog.current?.open) importDialog.current?.showModal(); }}>Import handover</button>
    </div>
    {receiver && <HandoverReadyNotice receiver={receiver} choose={choose} />}
    {notice && <p className="field-note" role="status">{notice}</p>}
    <dialog ref={createDialog} className="agent-dialog handover-dialog" aria-labelledby={`${id}-create-title`} onCancel={event => { if (creating.current) event.preventDefault(); }}>
      <div className="dialog-heading"><div><div className="eyebrow">PREPARE A FRESH RECEIVING CHAT</div><h2 id={`${id}-create-title`}>Create handover</h2></div><button type="button" className="icon-button" aria-label="Close handover creation" disabled={createBusy} onClick={() => createDialog.current?.close()}>×</button></div>
      <HandoverCreateForm id={id} draft={draft} change={setDraft} busy={createBusy} error={createError} codexReady={codexReady} claudeReady={claudeReady} full={full} submit={submitCreate} />
    </dialog>
    <dialog ref={importDialog} className="agent-dialog handover-dialog" aria-labelledby={`${id}-import-title`} onCancel={event => { if (importing.current) event.preventDefault(); }}>
      <div className="dialog-heading"><div><div className="eyebrow">CONTINUE IN THIS CHAT</div><h2 id={`${id}-import-title`}>Import handover</h2></div><button type="button" className="icon-button" aria-label="Close handover import" disabled={importBusy} onClick={() => importDialog.current?.close()}>×</button></div>
      <HandoverImportForm id={id} path={path} change={value => { pathEdited.current = true; setPath(value); }} busy={importBusy} canImport={canImport} error={importError} submit={submitImport} />
    </dialog>
  </div>;
}
