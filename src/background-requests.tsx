import React from 'react';

export type BackgroundWorker = { id: string; name: string; provider: 'codex' | 'claude'; questionCount: number };

export function BackgroundRequests({ workers, available, opening, full, open }: {
  workers: BackgroundWorker[]; available: (provider: BackgroundWorker['provider']) => boolean;
  opening: boolean; full: boolean; open: (id: string) => void;
}) {
  if (!workers.length) return null;
  return <section className="background-requests" aria-label="Requests in closed tabs">
    <strong>Requests in closed tabs</strong>
    {workers.map(worker => <div className="background-request" key={worker.id}>
      <span><strong>{worker.name}</strong><small>{worker.provider === 'claude' ? 'Claude' : 'Codex'} · {worker.questionCount} pending</small></span>
      <button type="button" className="button amber small" disabled={opening || full || !available(worker.provider)} onClick={() => open(worker.id)} aria-label={`Open ${worker.name} to review pending requests`} title={full ? 'Close a tab to make room for this conversation' : undefined}>Open</button>
    </div>)}
  </section>;
}
