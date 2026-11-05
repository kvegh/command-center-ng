import { activeTasks } from './beads.mjs';

export function taskSummary(agent) {
  const tasks = agent.tracker?.status === 'ready' ? activeTasks(agent.tracker.tasks).map(task => ({ ...task, displayState: task.blockedBy?.length && task.state !== 'in_progress' ? 'queued' : task.state })) : [];
  const taskCounts = { inProgress: 0, needsInput: 0, queued: 0, open: 0, deferred: 0, other: 0 };
  for (const task of tasks) {
    const state = String(task.displayState || task.state || '').replace(/[ _-]/g, '').toLowerCase();
    if (state === 'queued') taskCounts.queued++;
    else if (['inprogress', 'running'].includes(state)) taskCounts.inProgress++;
    else if (['blocked', 'needsinput', 'waitingoninput', 'waitingonapproval'].includes(state)) taskCounts.needsInput++;
    else if (['open', 'pending', 'ready'].includes(state)) taskCounts.open++;
    else if (state === 'deferred') taskCounts.deferred++;
    else taskCounts.other++;
  }
  return { tasks, taskCount: tasks.length, taskCounts };
}

export function reportedPlan(item) {
  if (item.type !== 'dynamicToolCall' || !/(^|[./])update_plan$/.test(item.tool)) return null;
  try {
    const args = typeof item.arguments === 'string' ? JSON.parse(item.arguments) : item.arguments;
    if (!Array.isArray(args?.plan)) return null;
    return args.plan.filter(task => typeof task.step === 'string' && typeof task.status === 'string').map((task, i) => ({ id: String(i), text: task.step, state: task.status }));
  } catch { return null; }
}
