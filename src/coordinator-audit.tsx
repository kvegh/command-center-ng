import React from 'react';

export type CoordinatorAuditEntry = {
  id?: string; agentId: string; workerName?: string; projectName?: string; requestSummary?: string;
  turnId?: string; itemId?: string; coordinatorId?: string;
  action?: string; decision?: string; outcome: string; rationale?: string; at: string;
  storageState?: 'pending' | 'saved' | 'failed';
};

const requests: Record<string, string> = {
  report: 'Request a task report', 'report-setting': 'Change the task-report interval',
  summary: 'Send a context summary to the worker', event: 'Refresh coordinator context', 'task-ping': 'Check current task progress'
};

export function auditDecision(entry: CoordinatorAuditEntry) {
  if (entry.outcome === 'unconfirmed') return { marker: '🟣', label: entry.decision === 'approve' ? 'Approval unconfirmed' : entry.decision === 'decline' ? 'Decline unconfirmed' : 'Outcome unconfirmed' };
  if (entry.outcome === 'needs_user') return { marker: '🟠', label: 'Asked for your decision' };
  if (entry.outcome === 'resolved' && entry.decision === 'approve') return { marker: '🟢', label: 'Approved once' };
  if (entry.outcome === 'resolved' && entry.decision === 'decline') return { marker: '🔴', label: 'Declined' };
  if (entry.outcome === 'delivered') return { marker: '🟦', label: 'Delivered' };
  if (entry.outcome === 'missing-response') return { marker: '🟣', label: 'Report not confirmed' };
  if (entry.outcome === 'not-queued') return { marker: '🟠', label: 'Not queued' };
  return { marker: '🟣', label: `Recorded outcome: ${entry.outcome.replaceAll('_', ' ').replaceAll('-', ' ')}` };
}

export function DecisionHistory({ entries, workers, error }: {
  entries: CoordinatorAuditEntry[]; workers: { id: string; name: string }[]; error?: string | null;
}) {
  const failed = entries.some(entry => entry.storageState === 'failed');
  return <>
    {(error || failed) && <div className="error-text" role="alert">
      Decision history could not be fully loaded or saved. Some entries may be missing or unsaved.
      {error && <details><summary>Storage details</summary><p>{error}</p></details>}
    </div>}
    {!!entries.length && <details className="coordinator-audit">
      <summary>Recent decisions and deliveries</summary>
      <p>Acknowledged decisions do not prove execution. Check Open questions for current requests.</p>
      {entries.slice(-20).reverse().map((entry, index) => {
        const name = entry.workerName || workers.find(worker => worker.id === entry.agentId)?.name || entry.projectName || 'Worker';
        const decision = auditDecision(entry);
        const request = entry.requestSummary || (entry.decision ? 'Review a native approval request' : requests[entry.action || ''] || 'Coordinator action');
        const storage = !entry.decision ? 'Delivery event (not saved)' : entry.storageState === 'saved' ? 'Saved' : entry.storageState === 'pending' ? 'Saving…' : entry.storageState === 'failed' ? 'Not saved' : 'Storage status unknown';
        const validTime = Number.isFinite(Date.parse(entry.at));
        return <div key={entry.id || `${entry.agentId}:${entry.at}:${index}`}>
          <strong>{name}{entry.projectName && entry.projectName !== name ? ` · ${entry.projectName}` : ''}</strong>
          <span>{validTime ? <time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time> : 'Time unavailable'} · <small className={entry.storageState === 'failed' ? 'error-text' : undefined}>{storage}</small></span>
          <ul>
            <li>🟦 <b>Request:</b> {request}</li>
            <li>{decision.marker} <b>{decision.label}:</b> {entry.rationale || (entry.outcome === 'resolved' ? 'Native decision acknowledged; execution is not verified.' : 'No rationale was recorded.')}</li>
          </ul>
        </div>;
      })}
    </details>}
  </>;
}
