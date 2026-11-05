import React from 'react';

export type TaskCounts = { inProgress: number; needsInput: number; queued: number; open: number; deferred: number; other: number };

export function TaskTotals({ total, counts }: { total: number; counts?: TaskCounts }) {
  return <div className="task-totals" aria-label="Task totals">
    <span>{total} total</span>
    {!!counts?.inProgress && <span className="tasks-in-progress">{counts.inProgress} in progress</span>}
    {!!counts?.needsInput && <span className="tasks-need-input">{counts.needsInput} need input</span>}
    {!!counts?.queued && <span className="tasks-queued">{counts.queued} queued</span>}
    {!!counts?.open && <span>{counts.open} open</span>}
    {!!counts?.deferred && <span>{counts.deferred} deferred</span>}
    {!!counts?.other && <span>{counts.other} other</span>}
  </div>;
}
