import { activeTasks } from './beads.mjs';

export function taskSummary(agent) {
  const tasks = agent.tracker?.status === 'ready' ? activeTasks(agent.tracker.tasks) : [];
  return { tasks: tasks.slice(0, 3), taskCount: tasks.length };
}

export function reportedPlan(item) {
  if (item.type !== 'dynamicToolCall' || !/(^|[./])update_plan$/.test(item.tool)) return null;
  try {
    const args = typeof item.arguments === 'string' ? JSON.parse(item.arguments) : item.arguments;
    if (!Array.isArray(args?.plan)) return null;
    return args.plan.filter(task => typeof task.step === 'string' && typeof task.status === 'string').map((task, i) => ({ id: String(i), text: task.step, state: task.status }));
  } catch { return null; }
}
