const rank = state => /in.?progress|running|working|failed|error/i.test(state) ? 0 : /pending|planned|queued|waiting/i.test(state) ? 1 : 2;
const line = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 200);

export function taskSummary(agent) {
  const reported = agent.tasks.filter(task => line(task.text)).map(task => ({ ...task, text: line(task.text) }));
  const workers = agent.workers.filter(worker => line(worker.task)).map(worker => ({ id: 'worker-' + worker.id, text: line(worker.task), state: worker.status || 'unknown', worker: worker.name }));
  const seen = new Set();
  const tasks = [...reported, ...workers].sort((a, b) => rank(a.state) - rank(b.state)).filter(task => {
    const key = task.text.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true;
  });
  if (!tasks.length && agent.thread.status?.type === 'active' && agent.summary) {
    tasks.push({ id: 'reported-summary', text: line(agent.summary), state: 'inProgress' });
  }
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
