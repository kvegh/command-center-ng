import test from 'node:test';
import assert from 'node:assert/strict';
import { readCodexGoal, changeCodexGoal } from '../server/native-goals.mjs';

const threadId = 'worker-example';
const goal = (changes = {}) => ({ threadId, objective: 'Complete the authorized checks with evidence.', status: 'active', tokenBudget: 40000, tokensUsed: 1234, timeUsedSeconds: 42, createdAt: 100, updatedAt: 142, ...changes });
function fixture(result) {
  const calls = [];
  return { calls, rpc: { call: async (method, params) => { calls.push({ method, params }); if (result instanceof Error) throw result; return result; } } };
}

test('native goal reads preserve real state without starting or resuming a turn', async () => {
  const current = goal({ status: 'budgetLimited' }); const f = fixture({ goal: current });
  assert.deepEqual(await readCodexGoal(f.rpc, threadId), current);
  assert.deepEqual(f.calls, [{ method: 'thread/goal/get', params: { threadId } }]);
  const absent = fixture({ goal: null });
  assert.equal(await readCodexGoal(absent.rpc, threadId), null);
});

test('starting a goal supplies user provenance and only an explicitly selected budget', async () => {
  const objective = 'Verify the authorized workflow.';
  const f = fixture({ goal: goal({ objective, tokenBudget: null }) });
  assert.deepEqual(await changeCodexGoal(f.rpc, threadId, { action: 'start', objective: '  Verify the authorized workflow.  ' }), { goal: goal({ objective, tokenBudget: null }) });
  assert.deepEqual(f.calls, [{ method: 'thread/goal/set', params: { threadId, origin: 'user', status: 'active', objective: 'Verify the authorized workflow.' } }]);
  for (const tokenBudget of [12345, null]) {
    const selected = fixture({ goal: goal({ objective, tokenBudget }) });
    await changeCodexGoal(selected.rpc, threadId, { action: 'start', objective: 'Verify the authorized workflow.', tokenBudget });
    assert.equal(selected.calls[0].params.tokenBudget, tokenBudget);
    assert.equal(selected.calls[0].params.origin, 'user');
  }
});

test('pause and resume omit objective and budget so native usage and limits are not reset', async () => {
  for (const [action, status] of [['pause', 'paused'], ['resume', 'active']]) {
    const current = goal({ status }); const f = fixture({ goal: current });
    assert.deepEqual(await changeCodexGoal(f.rpc, threadId, { action }), { goal: current });
    assert.deepEqual(f.calls, [{ method: 'thread/goal/set', params: { threadId, origin: 'user', status } }]);
  }
});

test('native clear keeps its confirmed boolean outcome and does not invent a completion state', async () => {
  for (const cleared of [true, false]) {
    const f = fixture({ cleared });
    assert.deepEqual(await changeCodexGoal(f.rpc, threadId, { action: 'clear' }), { cleared });
    assert.deepEqual(f.calls, [{ method: 'thread/goal/clear', params: { threadId, origin: 'user' } }]);
  }
});

test('invalid goal actions and injected provenance or settings cannot make an RPC call', async () => {
  const invalid = [null, [], {}, { action: 'complete' }, { action: 'pause', tokenBudget: 5 },
    { action: 'resume', origin: 'automatic' }, { action: 'clear', sandbox: 'danger-full-access' },
    { action: 'start', objective: '' }, { action: 'start', objective: '  ' },
    { action: 'start', objective: 'x'.repeat(4001) }, { action: 'start', objective: 5 },
    ...[0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, '2000', undefined].map(tokenBudget => ({ action: 'start', objective: 'Verify.', tokenBudget }))];
  for (const choice of invalid) {
    const f = fixture({ goal: goal() });
    await assert.rejects(changeCodexGoal(f.rpc, threadId, choice), error => error.status === 400);
    assert.deepEqual(f.calls, []);
  }
});

test('the documented objective limit counts Unicode characters without rejecting a valid native objective', async () => {
  const objective = '✓'.repeat(4000); const f = fixture({ goal: goal({ objective }) });
  await changeCodexGoal(f.rpc, threadId, { action: 'start', objective });
  assert.equal(f.calls[0].params.objective.length, 4000);
  const supplementaryObjective = '😀'.repeat(4000); const supplementary = fixture({ goal: goal({ objective: supplementaryObjective }) });
  await changeCodexGoal(supplementary.rpc, threadId, { action: 'start', objective: supplementaryObjective });
  assert.equal([...supplementary.calls[0].params.objective].length, 4000);
});

test('wrong-thread and malformed native results are rejected instead of reporting success', async () => {
  for (const result of [{}, { goal: undefined }, { goal: goal({ threadId: 'other-worker' }) },
    { goal: goal({ status: 'invented' }) }, { goal: goal({ objective: '' }) },
    { goal: goal({ tokensUsed: -1 }) }, { goal: goal({ timeUsedSeconds: NaN }) },
    { goal: goal({ tokenBudget: '40000' }) }, { goal: goal({ createdAt: undefined }) }]) {
    const f = fixture(result);
    await assert.rejects(readCodexGoal(f.rpc, threadId), error => error.status === 502);
  }
  const wrongChange = fixture({ goal: goal({ threadId: 'other-worker' }) });
  await assert.rejects(changeCodexGoal(wrongChange.rpc, threadId, { action: 'pause' }), error => error.status === 502);
  const badClear = fixture({ cleared: 'yes' });
  await assert.rejects(changeCodexGoal(badClear.rpc, threadId, { action: 'clear' }), error => error.status === 502);
});

test('a start response with stale objective or different selected budget is not confirmed as success', async () => {
  const objective = 'Verify the new workflow.';
  for (const current of [goal(), goal({ objective, tokenBudget: 50000 })]) {
    const f = fixture({ goal: current });
    await assert.rejects(changeCodexGoal(f.rpc, threadId, { action: 'start', objective, tokenBudget: 20000 }),
      error => error.status === 502 && /different goal settings/.test(error.message));
    assert.equal(f.calls.length, 1);
  }
  const blocked = goal({ objective, status: 'blocked' }); const f = fixture({ goal: blocked });
  assert.deepEqual(await changeCodexGoal(f.rpc, threadId, { action: 'start', objective }), { goal: blocked }, 'native resulting lifecycle is retained rather than synthesized as active');
});

test('native errors remain visible without fallback calls or automatic retries', async () => {
  for (const action of ['read', 'start', 'pause', 'resume', 'clear']) {
    const nativeError = Object.assign(new Error('Native goal method unavailable.'), { code: -32601 });
    const f = fixture(nativeError);
    await assert.rejects(action === 'read' ? readCodexGoal(f.rpc, threadId) : changeCodexGoal(f.rpc, threadId,
      action === 'start' ? { action, objective: 'Verify the workflow.' } : { action }), error => error === nativeError);
    assert.equal(f.calls.length, 1);
  }
});

test('invalid conversation IDs are refused before a native read or mutation', async () => {
  for (const id of ['', ' ', null, 5, 'x'.repeat(129)]) {
    const f = fixture({ goal: goal() });
    await assert.rejects(readCodexGoal(f.rpc, id), error => error.status === 400);
    await assert.rejects(changeCodexGoal(f.rpc, id, { action: 'clear' }), error => error.status === 400);
    assert.deepEqual(f.calls, []);
  }
});
