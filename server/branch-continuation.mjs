const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const statuses = new Set(['active', 'paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
// Internal branch-close safety only: inspect existing native continuation and
// pause it after a safe checkpoint. No Goal creation or general controls live here.

function validateThreadId(threadId) {
  if (typeof threadId !== 'string' || !threadId.trim() || threadId.length > 128) throw fail('Choose a valid native conversation.');
}

function nativeGoal(value, threadId) {
  if (!object(value) || value.threadId !== threadId) throw fail('Codex returned a goal for a different or invalid conversation. Refresh the native goal.', 502);
  if (typeof value.objective !== 'string' || !value.objective.trim() || !statuses.has(value.status)
    || (value.tokenBudget !== null && !nonnegative(value.tokenBudget))
    || !['tokensUsed', 'timeUsedSeconds', 'createdAt', 'updatedAt'].every(key => nonnegative(value[key]))) {
    throw fail('Codex returned an unsupported native goal state. Refresh the native runtime.', 502);
  }
  const { objective, status, tokenBudget, tokensUsed, timeUsedSeconds, createdAt, updatedAt } = value;
  return { threadId, objective, status, tokenBudget, tokensUsed, timeUsedSeconds, createdAt, updatedAt };
}

export async function readCodexGoal(rpc, threadId) {
  validateThreadId(threadId);
  const result = await rpc.call('thread/goal/get', { threadId });
  if (!object(result) || !Object.hasOwn(result, 'goal')) throw fail('Codex did not return native goal state.', 502);
  return result.goal === null ? null : nativeGoal(result.goal, threadId);
}

// Only the explicit Hand back & close workflow calls this after real idle.
export async function pauseCodexGoal(rpc, threadId) {
  validateThreadId(threadId);
  // Omitting objective/budget preserves native accounting and cannot create an
  // objective. The caller has just verified an existing active native Goal.
  const result = await rpc.call('thread/goal/set', { threadId, origin: 'user', status: 'paused' });
  if (!object(result) || !Object.hasOwn(result, 'goal')) throw fail('Codex did not confirm the native goal change.', 502);
  const goal = nativeGoal(result.goal, threadId);
  if (goal.status === 'active') throw fail('Native continuation is still active. The branch must remain open.', 502);
  return { goal };
}
