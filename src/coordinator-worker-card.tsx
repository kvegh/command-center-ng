import React from 'react';

type WorkerTask = {
  id: string;
  text: string;
  state: string;
  displayState?: string;
  blockedBy?: string[];
};
type CoordinatorWorker = {
  id: string;
  name: string;
  goal: string;
  progress?: { summary: string };
  reportIntervalMinutes?: number;
  tasks: WorkerTask[];
  tracker?: { status: string };
};

const inputStates = new Set(['blocked', 'needsinput', 'waitingoninput', 'waitingonapproval']);
const cadences: Record<number, string> = { 0: 'Never', 5: '5min', 15: '15min', 60: '1h' };

export function CoordinatorWorkerCard({ worker, statusBadge, choose }: {
  worker: CoordinatorWorker;
  statusBadge: React.ReactNode;
  choose: (id: string) => void;
}) {
  // Only current tracker records establish input needs; native attention is separate.
  const inputTasks = worker.tracker?.status === 'ready' ? worker.tasks.filter(task =>
    !task.blockedBy?.length && inputStates.has((task.displayState || task.state).replace(/[ _-]/g, '').toLowerCase())
  ) : [];

  return <button type="button" className="coordinator-worker" onClick={() => choose(worker.id)}>
    <span className="coordinator-worker-heading">
      <strong>{worker.name}</strong>
      <span className="coordinator-report-cadence">Reports: {cadences[worker.reportIntervalMinutes ?? -1] || 'Unknown'}</span>
    </span>
    {statusBadge}
    <span className="coordinator-worker-summary">
      {inputTasks.length ? <>
        <span className="coordinator-input-label">Needs input</span>
        {inputTasks.map(task => <span className="coordinator-input-task" key={task.id}>{task.text}</span>)}
      </> : worker.progress?.summary || worker.goal}
    </span>
  </button>;
}
