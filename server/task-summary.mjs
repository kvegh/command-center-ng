import { activeTasks } from './beads.mjs';

const inputStates = new Set(['needsinput', 'waitingoninput', 'waitingonapproval']);
const terminalStates = new Set(['closed', 'completed', 'failed', 'error', 'cancelled', 'withdrawn']);
const displayState = task => String(task.displayState || task.state || '').replace(/[ _-]/g, '').toLowerCase();
const attentionRank = task => inputStates.has(displayState(task)) ? 0 : displayState(task) === 'blocked' ? 1 : 2;

export function taskSummary(agent) {
  const tasks = agent.tracker?.status === 'ready' ? activeTasks(agent.tracker.tasks).map(task => {
    const state = displayState({ state: task.state });
    // A blocked task can be waiting on tools or other work, not a human answer.
    const needsInput = !terminalStates.has(state) && (task.isChatQuestion === true || inputStates.has(state));
    return { ...task, displayState: task.blockedBy?.length && task.state !== 'in_progress' ? 'queued' : needsInput ? 'needs_input' : task.state };
  }) : [];
  // Classify dependencies first, then surface input needs and actual blocked work.
  // Stable sorting preserves the established order within each remaining group.
  tasks.sort((a, b) => attentionRank(a) - attentionRank(b));
  const taskCounts = { inProgress: 0, needsInput: 0, queued: 0, open: 0, deferred: 0, other: 0 };
  for (const task of tasks) {
    const state = displayState(task);
    if (state === 'queued') taskCounts.queued++;
    else if (['inprogress', 'running'].includes(state)) taskCounts.inProgress++;
    else if (inputStates.has(state)) taskCounts.needsInput++;
    else if (['open', 'pending', 'ready'].includes(state)) taskCounts.open++;
    else if (state === 'deferred') taskCounts.deferred++;
    else taskCounts.other++;
  }
  const chatQuestions = tasks.filter(task => task.isChatQuestion === true).map(task => ({ id: task.id, workerId: agent.id, text: task.text, state: task.state, displayState: task.displayState }));
  return { tasks, taskCount: tasks.length, taskCounts, chatQuestions };
}

export function reportedPlan(item) {
  if (item.type !== 'dynamicToolCall' || !/(^|[./])update_plan$/.test(item.tool)) return null;
  try {
    const args = typeof item.arguments === 'string' ? JSON.parse(item.arguments) : item.arguments;
    if (!Array.isArray(args?.plan)) return null;
    return args.plan.filter(task => typeof task.step === 'string' && typeof task.status === 'string').map((task, i) => ({ id: String(i), text: task.step, state: task.status }));
  } catch { return null; }
}
