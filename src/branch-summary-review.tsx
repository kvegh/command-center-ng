import React, { useEffect, useState } from 'react';

type Branch = { id: string; name: string; returnSummary?: { delivered: boolean } };

export function BranchSummaryReview({ agent, visible, connected, parentName, prepare, deliver, openParent, dismiss, returned }: {
  agent: Branch; visible: boolean; connected: boolean; parentName: string;
  prepare: () => Promise<{ text: string }>; deliver: (text: string) => Promise<{ id: string }>;
  openParent: () => Promise<void>; dismiss: () => void; returned: (id: string) => void;
}) {
  const [text, setText] = useState(''); const [preparing, setPreparing] = useState(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [returnFailed, setReturnFailed] = useState(false);
  const load = async () => {
    setPreparing(true); setError(''); setReturnFailed(false);
    try { setText((await prepare()).text); }
    catch (problem) { setError((problem as Error).message); }
    finally { setPreparing(false); }
  };
  useEffect(() => { void load(); }, []);
  const delivered = agent.returnSummary?.delivered;
  const inputId = `branch-findings-${agent.id}`;
  return <section hidden={!visible} className="return-dialog branch-summary-review" aria-label={`Return summary from ${agent.name}`}>
    <div className="dialog-heading"><div><div className="eyebrow">RETURN TO {parentName}</div><h2>Review branch summary</h2></div><button type="button" className="icon-button" disabled={busy} onClick={dismiss} aria-label="Close summary review">×</button></div>
    <p className="field-note">{delivered ? 'Your summary reached the parent. Close the branch to finish.' : 'Review the summary, then send it and close this branch. You can switch tabs; your edits stay here.'}</p>
    <form onSubmit={async event => {
      event.preventDefault(); if (busy || preparing || !connected || !text.trim()) return;
      setBusy(true); setError(''); setReturnFailed(false);
      try { returned((await deliver(text)).id); }
      catch (problem) { setError((problem as Error).message); setReturnFailed(true); }
      finally { setBusy(false); }
    }}>
      <label htmlFor={inputId}>Summary for {parentName}</label><textarea id={inputId} value={text} onChange={event => setText(event.target.value)} maxLength={2000} rows={8} required readOnly={delivered} disabled={preparing || busy} placeholder={preparing ? 'Preparing a concise summary…' : 'Prepare a summary to return to the parent.'} />
      <p className="field-note" role="status">{preparing ? 'Preparing summary in this branch…' : `${text.length} / 2000 characters · The branch history is kept in the archive.`}</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="button-row"><button type="button" className="button subtle" disabled={busy} onClick={dismiss}>Keep exploring</button>{!preparing && !text && <button type="button" className="button subtle" disabled={!connected} onClick={() => void load()}>Retry summary</button>}{returnFailed && <button type="button" className="button subtle" disabled={!connected || busy} onClick={() => { void openParent().catch(problem => setError(problem.message)); }}>Open parent</button>}<button className="button primary" disabled={!connected || preparing || busy || !text.trim()}>{busy ? 'Returning…' : delivered ? 'Close branch' : 'Send summary & close'}</button></div>
    </form>
  </section>;
}
