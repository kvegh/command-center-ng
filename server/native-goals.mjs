const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const statuses = new Set(['active', 'paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

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

function goalChange(choice) {
  if (!object(choice) || !['start', 'pause', 'resume', 'clear'].includes(choice.action)) throw fail('Choose a native goal action.');
  const allowed = choice.action === 'start' ? ['action', 'objective', 'tokenBudget'] : ['action'];
  if (Object.keys(choice).some(key => !allowed.includes(key))) throw fail('Submit only the fields for this native goal action.');
  if (choice.action !== 'start') return choice;

  if (typeof choice.objective !== 'string' || !choice.objective.trim() || [...choice.objective.trim()].length > 4000) {
    throw fail('Enter a goal objective of up to 4000 characters.');
  }
  if (Object.hasOwn(choice, 'tokenBudget') && choice.tokenBudget !== null
    && (!Number.isSafeInteger(choice.tokenBudget) || choice.tokenBudget <= 0)) {
    throw fail('Choose a positive whole-number token budget, or no budget.');
  }
  return { ...choice, objective: choice.objective.trim() };
}

// Only authenticated, explicit user controls may call this mutation helper.
// Workspace guards own session availability, current identity and request state.
export async function changeCodexGoal(rpc, threadId, choice) {
  validateThreadId(threadId);
  const change = goalChange(choice);
  if (change.action === 'clear') {
    const result = await rpc.call('thread/goal/clear', { threadId, origin: 'user' });
    if (!object(result) || typeof result.cleared !== 'boolean') throw fail('Codex did not confirm the native goal clear outcome.', 502);
    return { cleared: result.cleared };
  }

  // Omitting objective/budget for pause and resume preserves native accounting.
  const params = { threadId, origin: 'user', status: change.action === 'pause' ? 'paused' : 'active' };
  if (change.action === 'start') {
    params.objective = change.objective;
    if (Object.hasOwn(change, 'tokenBudget')) params.tokenBudget = change.tokenBudget;
  }
  const result = await rpc.call('thread/goal/set', params);
  if (!object(result) || !Object.hasOwn(result, 'goal')) throw fail('Codex did not confirm the native goal change.', 502);
  const goal = nativeGoal(result.goal, threadId);
  if (change.action === 'start' && (goal.objective !== change.objective
    || (Object.hasOwn(change, 'tokenBudget') && goal.tokenBudget !== change.tokenBudget))) {
    throw fail('Codex returned different goal settings. Refresh the native goal before trying again.', 502);
  }
  return { goal };
}
