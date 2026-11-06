// Match browser preferences: at most 32 workers with 128 subscribed tasks each.
export const MAX_TASK_WATCHES = 32 * 128;
const requestLimit = 128;

export type TaskWatch = { workerId: string; taskId: string };
export type NotificationTask = { id: string; text: string; state: string; blockedBy?: readonly string[] };
export type NotificationWorker = {
  id: string;
  name: string;
  status: string;
  turnId?: string | null;
  questions?: readonly { id: string | number }[];
  tracker?: { status: string; tasks: readonly NotificationTask[] };
};
export type TaskNotification = {
  id: string;
  scope: 'task' | 'worker';
  kind: 'needs-input' | 'completed' | 'request' | 'error';
  workerId: string;
  workerName: string;
  taskId?: string;
  taskTitle?: string;
};

type TaskState = 'other' | 'needs-input' | 'completed' | 'error';
type WorkerState = { currentRequests: Set<string>; seenRequests: Set<string>; errorKey: string | null };
const inputStates = new Set(['blocked', 'needsinput', 'waitingoninput', 'waitingonapproval']);
const watchKey = ({ workerId, taskId }: TaskWatch) => JSON.stringify([workerId, taskId]);
const compact = (text: string, fallback: string) => text.replace(/\s+/g, ' ').trim().slice(0, 200) || fallback;

function taskState(task: NotificationTask): TaskState {
  const state = task.state.replace(/[ _-]/g, '').toLowerCase();
  if (['closed', 'completed'].includes(state)) return 'completed';
  if (['failed', 'error'].includes(state)) return 'error';
  if (inputStates.has(state) && !task.blockedBy?.length) return 'needs-input';
  return 'other';
}

function requestKeys(worker: NotificationWorker) {
  const keys = new Set<string>();
  for (const request of worker.questions || []) {
    const id = request.id;
    if ((typeof id !== 'string' || !id || id.length > 512) && (typeof id !== 'number' || !Number.isFinite(id))) continue;
    keys.add(JSON.stringify([typeof id, id]));
    if (keys.size === requestLimit) break;
  }
  return keys;
}

/** Observes authoritative snapshots only; never sends messages or changes tasks. */
export class TaskNotificationEngine {
  private tasks = new Map<string, TaskState>();
  private workers = new Map<string, WorkerState>();
  private sequence = 0;

  reset() {
    this.tasks.clear();
    this.workers.clear();
  }

  update(workers: readonly NotificationWorker[], watches: readonly TaskWatch[], connected = true): TaskNotification[] {
    if (!connected) { this.reset(); return []; }
    const subscribed = new Map<string, TaskWatch>();
    for (const watch of watches) {
      if (typeof watch.workerId !== 'string' || !watch.workerId || watch.workerId.length > 512
        || typeof watch.taskId !== 'string' || !watch.taskId || watch.taskId.length > 512) continue;
      subscribed.set(watchKey(watch), watch);
      if (subscribed.size === MAX_TASK_WATCHES) break;
    }
    const watchedWorkers = new Set([...subscribed.values()].map(watch => watch.workerId));
    for (const key of this.tasks.keys()) if (!subscribed.has(key)) this.tasks.delete(key);
    for (const id of this.workers.keys()) if (!watchedWorkers.has(id)) this.workers.delete(id);

    const available = new Map(workers.map(worker => [worker.id, worker]));
    const events: TaskNotification[] = [];
    const emit = (worker: NotificationWorker, kind: TaskNotification['kind'], task?: NotificationTask) => {
      events.push({
        id: `task-notification-${++this.sequence}`,
        scope: task ? 'task' : 'worker', kind,
        workerId: worker.id, workerName: compact(worker.name, 'Worker'),
        ...(task ? { taskId: task.id, taskTitle: compact(task.text, task.id) } : {})
      });
    };

    for (const [key, watch] of subscribed) {
      const worker = available.get(watch.workerId);
      const task = worker && worker.status !== 'offline' && worker.tracker?.status === 'ready'
        ? worker.tracker.tasks.find(row => row.id === watch.taskId) : undefined;
      if (!task) {
        // A missing/unavailable record breaks observation; it is not completion.
        this.tasks.delete(key);
        continue;
      }
      const current = taskState(task);
      const previous = this.tasks.get(key);
      if (previous !== undefined && previous !== current && current !== 'other') emit(worker!, current, task);
      this.tasks.set(key, current);
    }

    for (const id of watchedWorkers) {
      const worker = available.get(id);
      if (!worker || worker.status === 'offline') { this.workers.delete(id); continue; }
      const currentRequests = requestKeys(worker);
      const errorKey = worker.status === 'error' ? String(worker.turnId || 'worker-error').slice(0, 512) : null;
      const previous = this.workers.get(id);
      if (previous) {
        for (const request of currentRequests) {
          if (!previous.currentRequests.has(request) && !previous.seenRequests.has(request)) emit(worker, 'request');
        }
        if (errorKey && errorKey !== previous.errorKey) emit(worker, 'error');
      }
      // Request bodies and errors never enter event payloads or remembered state.
      const seenRequests = previous?.seenRequests || new Set<string>();
      for (const request of currentRequests) { seenRequests.delete(request); seenRequests.add(request); }
      while (seenRequests.size > requestLimit) seenRequests.delete(seenRequests.values().next().value!);
      this.workers.set(id, { currentRequests, seenRequests, errorKey });
    }
    return events;
  }
}
