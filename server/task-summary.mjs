const rank = state => /in.?progress|running|working|failed|error|blocked/i.test(state) ? 0 : /pending|planned|queued|waiting|requested/i.test(state) ? 1 : 2;
const line = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 200);
const taskNumber = text => String(text).match(/^\s*task\s*#?(\d+)\b/i)?.[1];
const taskKey = text => line(text).replace(/^task\s*#?\d+\s*[:.)-]?\s*/i, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function requestedTasks(text) {
  const headers = [...String(text).matchAll(/\btask\s*#?(\d+)\s*[:.)-]\s*/gi)];
  return headers.map((header, index) => ({ id: 'request-' + header[1], number: header[1], text: line(text.slice(header.index + header[0].length, headers[index + 1]?.index).replace(/[\s,;]+$/, '')), state: 'requested' })).filter(task => task.text);
}

export function collectRequestedTasks(agent, text) {
  for (const task of requestedTasks(text)) agent.requestedTasks = [...(agent.requestedTasks || []).filter(existing => existing.id !== task.id), task];
}

export function reportTaskStates(agent, text) {
  for (const match of String(text).replaceAll('**', '').matchAll(/(?:^|\n)\s*(?:[-*]\s*)?task\s*#?(\d+)\s*(?:[:.)-]\s*)?(completed|done|in progress|running|blocked|pending)\b/gi)) {
    const state = ({ done: 'completed', running: 'inProgress', 'in progress': 'inProgress' })[match[2].toLowerCase()] || match[2].toLowerCase();
    agent.requestedTasks = (agent.requestedTasks || []).map(task => task.number === match[1] ? { ...task, state } : task);
  }
}

export function setReportedPlan(agent, plan) {
  agent.tasks = plan;
  agent.requestedTasks = (agent.requestedTasks || []).map(task => {
    const step = plan.find(step => taskNumber(step.text) === task.number || taskKey(step.text) === taskKey(task.text));
    return step ? { ...task, state: step.state } : task;
  });
}

export function taskSummary(agent) {
  const reported = agent.tasks.filter(task => line(task.text)).map(task => ({ ...task, text: line(task.text) }));
  const requested = (agent.requestedTasks || []).filter(task => !reported.some(step => taskNumber(step.text) === task.number || taskKey(step.text) === taskKey(task.text)));
  const workers = agent.workers.filter(worker => line(worker.task)).map(worker => ({ id: 'worker-' + worker.id, text: line(worker.task), state: worker.status || 'unknown', worker: worker.name }));
  const seen = new Set();
  const tasks = [...reported, ...requested, ...workers].sort((a, b) => rank(a.state) - rank(b.state)).filter(task => {
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
