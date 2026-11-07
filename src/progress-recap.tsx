import React from 'react';
import { compactProgressRecap, type ProgressRecapFields } from '../server/progress-recap.mjs';

export function ProgressRecap({ progress }: { progress: ProgressRecapFields & { updatedAt?: string } }) {
  const compact = compactProgressRecap(progress);
  return <div className="progress-recap">
    <span className="context-label" title={progress.updatedAt ? new Date(progress.updatedAt).toLocaleString() : undefined}>COORDINATOR RECAP</span>
    {compact.summary && <p>{compact.summary}</p>}
    {compact.blocker && <p className="progress-blocker">{compact.blocker}</p>}
    {compact.nextStep && <p title="Next step">{compact.nextStep}</p>}
    {compact.condensed && <details className="progress-recap-details">
      <summary>Full recap</summary>
      {progress.summary && <p>{progress.summary}</p>}
      {progress.blocker && <p className="progress-blocker">{progress.blocker}</p>}
      {progress.nextStep && <p><strong>Next</strong> {progress.nextStep}</p>}
    </details>}
  </div>;
}
