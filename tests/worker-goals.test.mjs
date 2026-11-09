import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';

const goal = (changes = {}) => ({ threadId: 'worker', objective: 'Prove the authorized workflow.', status: 'active', tokenBudget: 2000, tokensUsed: 17, timeUsedSeconds: 3, createdAt: 10, updatedAt: 20, ...changes });
const expected = value => value ? { objective: value.objective, createdAt: value.createdAt, tokenBudget: value.tokenBudget } : null;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture(initial = null) {
  const rpc = new EventEmitter(); rpc.ready = true;
  const calls = [], w = new Workspace(rpc, { beads: null }); let current = initial;
  const agent = { id: 'worker', parentId: 'parent', provider: 'codex', role: 'worker', name: 'Title', goal: 'Existing conversation title', canSend: true, messages: [], questions: [], tasks: [], workers: [], thread: { id: 'worker', status: { type: 'idle' }, canAcceptDirectInput: true } };
  w.agents.set(agent.id, agent);
  rpc.call = async (method, params) => {
    calls.push({ method, params });
    if (method === 'thread/read') return { thread: agent.thread };
    if (method === 'thread/goal/get') return { goal: current };
    if (method === 'thread/goal/set') {
      current = goal({ ...(current || {}), ...(params.objective ? { objective: params.objective } : {}), ...(Object.hasOwn(params, 'tokenBudget') ? { tokenBudget: params.tokenBudget } : {}), status: params.status });
      return { goal: current };
    }
    if (method === 'thread/goal/clear') { const cleared = current !== null; current = null; return { cleared }; }
    throw new Error(`Unexpected native method ${method}`);
  };
  return { w, rpc, calls, agent, current: () => current, set: value => { current = value; } };
}

test('native Goal view reads only actual native state without inferring from title/tasks or activating a worker', async () => {
  const f = fixture(); f.agent.observingOnly = true; f.agent.thread.status = { type: 'notLoaded' };
  assert.deepEqual(await f.w.goalState('worker'), { goal: null, state: 'ready', error: null });
  assert.deepEqual(f.calls.map(call => call.method), ['thread/goal/get']);
  assert.equal(f.agent.goal, 'Existing conversation title');
  assert.equal(f.w.snapshot().agents[0].nativeGoal, null);
});

test('start changes only native Goal and verifies readback without starting/steering an extra turn', async () => {
  const f = fixture();
  const result = await f.w.updateGoal('worker', { action: 'start', objective: '  Verify the release.  ', tokenBudget: 5000 });
  assert.equal(result.state, 'ready'); assert.equal(result.goal.objective, 'Verify the release.'); assert.equal(result.goal.tokenBudget, 5000);
  assert.equal(f.agent.goal, 'Existing conversation title');
  assert.deepEqual(f.calls.map(call => call.method), ['thread/read', 'thread/goal/get', 'thread/goal/set', 'thread/goal/get']);
  assert.equal(f.calls[2].params.origin, 'user');
});

test('replacement requires explicit user confirmation and never performs clear plus set', async () => {
  const f = fixture(goal());
  await assert.rejects(f.w.updateGoal('worker', { action: 'start', objective: 'Different clarified objective.' }), /Confirm replacement/);
  assert.equal(f.calls.filter(call => call.method === 'thread/goal/set').length, 0);
  const result = await f.w.updateGoal('worker', { action: 'start', objective: 'Different clarified objective.', replace: true, expectedGoal: expected(goal()) });
  assert.equal(result.goal.objective, 'Different clarified objective.');
  assert.ok(!f.calls.some(call => call.method === 'thread/goal/clear'));
  assert.ok(!Object.hasOwn(f.calls.find(call => call.method === 'thread/goal/set').params, 'replace'));
});

test('pause/resume preserve objective, usage and budgets; limited native results remain visible', async () => {
  const f = fixture(goal());
  const paused = await f.w.updateGoal('worker', { action: 'pause' });
  assert.equal(paused.goal.status, 'paused');
  assert.equal(paused.goal.tokensUsed, 17); assert.equal(paused.goal.tokenBudget, 2000);
  const resumed = await f.w.updateGoal('worker', { action: 'resume' });
  assert.equal(resumed.goal.status, 'active');
  for (const call of f.calls.filter(call => call.method === 'thread/goal/set')) assert.deepEqual(Object.keys(call.params).sort(), ['origin', 'status', 'threadId']);
  f.set(goal({ status: 'budgetLimited' }));
  const original = f.rpc.call;
  f.rpc.call = async (method, params) => method === 'thread/goal/set' ? { goal: f.current() } : original(method, params);
  assert.equal((await f.w.updateGoal('worker', { action: 'resume' })).goal.status, 'budgetLimited');
});

test('clear is read back; absent clear does not mutate and incomplete clear is not invented', async () => {
  const f = fixture(goal()); assert.equal((await f.w.updateGoal('worker', { action: 'clear', expectedGoal: expected(goal()) })).goal, null);
  const count = f.calls.filter(call => call.method === 'thread/goal/clear').length;
  await f.w.updateGoal('worker', { action: 'clear', expectedGoal: null });
  assert.equal(f.calls.filter(call => call.method === 'thread/goal/clear').length, count);
  f.set(goal()); const original = f.rpc.call;
  f.rpc.call = async (method, params) => method === 'thread/goal/clear' ? { cleared: false } : original(method, params);
  const incomplete = await f.w.updateGoal('worker', { action: 'clear', expectedGoal: expected(goal()) });
  assert.equal(incomplete.state, 'uncertain'); assert.equal(incomplete.goal.objective, goal().objective);
});

test('role, provider, direct-input, requests, restoration and handoff guards prevent native writes', async () => {
  const cases = [f => { f.agent.role = 'coordinator'; }, f => { f.agent.provider = 'claude'; },
    f => { f.agent.canSend = false; }, f => { f.agent.questions = [{ id: 'approval' }]; },
    f => { f.agent.thread.status = { type: 'active', activeFlags: ['waitingOnApproval'] }; },
    f => { f.w.restoring = true; }, f => { f.w.returnJobs.set('worker', Promise.resolve()); },
    f => { f.w.summaryJobs.set('worker', Promise.resolve()); }, f => { f.agent.returnSummary = { delivered: true }; },
    f => { f.w.handoffs.deliveringParents.set('worker', 'child'); }, f => { f.rpc.ready = false; }];
  for (const setup of cases) {
    const f = fixture(goal()); setup(f);
    assert.throws(() => f.w.updateGoal('worker', { action: 'pause' }));
    assert.deepEqual(f.calls, []);
  }
});

test('current native ownership is rechecked after thread read before any Goal mutation', async () => {
  const f = fixture(goal()), original = f.rpc.call;
  f.rpc.call = async (method, params) => method === 'thread/read' ? { thread: { ...f.agent.thread, canAcceptDirectInput: false } } : original(method, params);
  await assert.rejects(f.w.updateGoal('worker', { action: 'pause' }), /does not accept direct/);
  assert.equal(f.calls.filter(call => call.method === 'thread/goal/set').length, 0);
});

test('a request arriving during preflight stops mutation and remains unanswered', async () => {
  const f = fixture(goal()), original = f.rpc.call;
  f.rpc.call = async (method, params) => { const result = await original(method, params); if (method === 'thread/goal/get') f.agent.questions.push({ id: 'late-approval' }); return result; };
  await assert.rejects(f.w.updateGoal('worker', { action: 'pause' }), /pending native request/);
  assert.equal(f.calls.filter(call => call.method === 'thread/goal/set').length, 0); assert.equal(f.agent.questions[0].id, 'late-approval');
});

test('one mutation at a time; close and branch handoff cannot race it', async () => {
  const f = fixture(goal()), pending = deferred(), entered = deferred(), original = f.rpc.call;
  f.rpc.call = async (method, params) => { if (method === 'thread/goal/set') { entered.resolve(); return pending.promise; } return original(method, params); };
  const update = f.w.updateGoal('worker', { action: 'pause' });
  await entered.promise;
  assert.throws(() => f.w.updateGoal('worker', { action: 'clear' }), /current native Goal change/);
  assert.throws(() => f.w.close('worker'), /native Goal change/);
  assert.throws(() => f.w.startHandoff('worker'), /native Goal change/);
  f.set(goal({ status: 'paused' })); pending.resolve({ goal: f.current() }); await update;
});

test('uncertain mutation reads back once, never automatically retries, and needs a fresh read before another change', async () => {
  const f = fixture(goal()), original = f.rpc.call;
  f.rpc.call = async (method, params) => { if (method === 'thread/goal/set') { f.calls.push({ method, params }); throw new Error('Native timeout'); } return original(method, params); };
  const result = await f.w.updateGoal('worker', { action: 'pause' });
  assert.equal(result.state, 'uncertain'); assert.equal(f.calls.filter(call => call.method === 'thread/goal/set').length, 1);
  assert.throws(() => f.w.updateGoal('worker', { action: 'pause' }), /previous result is uncertain/);
  assert.equal((await f.w.goalState('worker')).state, 'ready');
});

test('unsupported Goal APIs stay visible and never fall back to a model message or resume', async () => {
  const f = fixture();
  f.rpc.call = async (method, params) => { f.calls.push({ method, params }); throw Object.assign(new Error('Native method unavailable'), { code: -32601 }); };
  const result = await f.w.goalState('worker'); assert.equal(result.state, 'unsupported'); assert.match(result.error, /unavailable/);
  assert.deepEqual(f.calls.map(call => call.method), ['thread/goal/get']);
});

test('Goal notifications update only the exact worker and keep title separate, including external null-turn events', () => {
  const f = fixture();
  f.rpc.emit('notification', { method: 'thread/goal/updated', params: { threadId: 'worker', turnId: null, goal: goal() } });
  assert.equal(f.agent.nativeGoal.objective, goal().objective); assert.equal(f.agent.goal, 'Existing conversation title');
  f.rpc.emit('notification', { method: 'thread/goal/updated', params: { threadId: 'worker', goal: goal({ threadId: 'other' }) } });
  assert.equal(f.agent.nativeGoalState, 'error'); assert.equal(f.agent.nativeGoal.threadId, 'worker');
  f.rpc.emit('notification', { method: 'thread/goal/cleared', params: { threadId: 'worker' } });
  assert.equal(f.agent.nativeGoal, null); assert.equal(f.agent.nativeGoalState, 'ready');
});

test('late native reads cannot resurrect a cleared Goal or overwrite newer native usage', async () => {
  for (const event of ['clear', 'update']) {
    const f = fixture(goal()), pending = deferred();
    f.rpc.call = async () => pending.promise;
    const read = f.w.goalState('worker');
    if (event === 'clear') f.rpc.emit('notification', { method: 'thread/goal/cleared', params: { threadId: 'worker' } });
    else f.rpc.emit('notification', { method: 'thread/goal/updated', params: { threadId: 'worker', turnId: null, goal: goal({ tokensUsed: 900, updatedAt: 30 }) } });
    pending.resolve({ goal: goal() }); const result = await read;
    assert.equal(result.goal?.tokensUsed ?? null, event === 'clear' ? null : 900);
  }
});

test('completed goals cannot be resumed and malformed/injected choices never mutate native settings', async () => {
  const f = fixture(goal({ status: 'complete' }));
  await assert.rejects(f.w.updateGoal('worker', { action: 'resume' }), /Completed Goals need/);
  for (const choice of [{ action: 'pause', origin: 'automatic' }, { action: 'start', objective: 'Work', replace: false }, { action: 'pause', replace: true }, { action: 'start', objective: '' }]) assert.throws(() => f.w.updateGoal('worker', choice));
  assert.equal(f.calls.filter(call => ['thread/goal/set', 'thread/goal/clear'].includes(call.method)).length, 0);
});

test('an older view read cannot overwrite a later explicit native Goal mutation', async () => {
  const f = fixture(goal()), pending = deferred(), original = f.rpc.call; let gets = 0;
  f.rpc.call = async (method, params) => {
    if (method === 'thread/goal/get' && ++gets === 1) return pending.promise;
    return original(method, params);
  };
  const read = f.w.goalState('worker');
  const changed = await f.w.updateGoal('worker', { action: 'pause' });
  assert.equal(changed.goal.status, 'paused');
  pending.resolve({ goal: goal() });
  assert.equal((await read).goal.status, 'paused');
  assert.equal(f.agent.nativeGoal.status, 'paused');
});

test('coalesced Goal reads issue one native call and never set a Goal', async () => {
  const f = fixture(goal()), pending = deferred();
  f.rpc.call = async (method, params) => { f.calls.push({ method, params }); return pending.promise; };
  const first = f.w.goalState('worker'), second = f.w.goalState('worker');
  pending.resolve({ goal: goal() });
  assert.deepEqual(await first, await second); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].method, 'thread/goal/get');
});

test('a clear notification during mutation preflight prevents acting on the stale returned Goal', async () => {
  const f = fixture(goal()), original = f.rpc.call;
  f.rpc.call = async (method, params) => {
    const result = await original(method, params);
    if (method === 'thread/goal/get') f.rpc.emit('notification', { method: 'thread/goal/cleared', params: { threadId: 'worker' } });
    return result;
  };
  await assert.rejects(f.w.updateGoal('worker', { action: 'pause' }), /Only an active/);
  assert.equal(f.agent.nativeGoal, null);
  assert.equal(f.calls.filter(call => call.method === 'thread/goal/set').length, 0);
});

test('replacement and clear refuse a different native Goal than the one the user confirmed', async () => {
  for (const action of ['start', 'clear']) {
    const confirmed = goal(), newer = goal({ objective: 'Different work from another client.', createdAt: 40 });
    const f = fixture(newer);
    const choice = action === 'start' ? { action, objective: 'Replacement objective.', replace: true } : { action };
    await assert.rejects(f.w.updateGoal('worker', { ...choice, expectedGoal: expected(confirmed) }), error => error.status === 409 && /changed since it was displayed/.test(error.message));
    assert.equal(f.calls.filter(call => ['thread/goal/set', 'thread/goal/clear'].includes(call.method)).length, 0);
    assert.equal(f.agent.nativeGoal.objective, newer.objective);
  }
});

test('expected identity checks ignore ongoing usage but retain exact objective, creation and budget', async () => {
  const f = fixture(goal({ tokensUsed: 999, timeUsedSeconds: 45, updatedAt: 80 }));
  const paused = await f.w.updateGoal('worker', { action: 'pause', expectedGoal: expected(goal()) });
  assert.equal(paused.state, 'ready'); assert.equal(paused.goal.tokensUsed, 999);
  const current = paused.goal;
  f.set({ ...current, tokenBudget: 9000 });
  await assert.rejects(f.w.updateGoal('worker', { action: 'clear', expectedGoal: expected(current) }), /changed since it was displayed/);
  assert.equal(f.calls.filter(call => call.method === 'thread/goal/clear').length, 0);
});

test('replacement/clear require a valid displayed identity and initial creation can require no current Goal', async () => {
  const f = fixture(goal());
  assert.throws(() => f.w.updateGoal('worker', { action: 'start', objective: 'New', replace: true }), /displayed native Goal/);
  assert.throws(() => f.w.updateGoal('worker', { action: 'clear' }), /displayed native Goal/);
  for (const expectedGoal of [{}, { ...expected(goal()), tokensUsed: 1 }, { ...expected(goal()), createdAt: '10' }, { ...expected(goal()), tokenBudget: -1 }]) {
    assert.throws(() => f.w.updateGoal('worker', { action: 'clear', expectedGoal }), /displayed native Goal/);
  }
  assert.deepEqual(f.calls, []);
  await assert.rejects(f.w.updateGoal('worker', { action: 'start', objective: 'Initial work', expectedGoal: null }), /changed since it was displayed/);
  assert.equal(f.calls.filter(call => call.method === 'thread/goal/set').length, 0);
});

test('an older successful GET cannot clear later mutation uncertainty or unlock another write', async () => {
  const f = fixture(goal()), pending = deferred(), original = f.rpc.call; let first = true;
  f.rpc.call = async (method, params) => {
    if (method === 'thread/goal/get' && first) { first = false; return pending.promise; }
    if (method === 'thread/goal/set') throw new Error('Mutation acknowledgement lost');
    return original(method, params);
  };
  const oldRead = f.w.goalState('worker');
  const changed = await f.w.updateGoal('worker', { action: 'pause' });
  assert.equal(changed.state, 'uncertain');
  pending.resolve({ goal: goal() });
  assert.equal((await oldRead).state, 'uncertain');
  assert.equal(f.agent.nativeGoalState, 'uncertain');
  assert.throws(() => f.w.updateGoal('worker', { action: 'pause' }), /previous result is uncertain/);
});

test('an older rejected GET cannot replace a later native clear or update with an error', async () => {
  const f = fixture(goal()), pending = deferred();
  f.rpc.call = async () => pending.promise;
  const oldRead = f.w.goalState('worker');
  f.rpc.emit('notification', { method: 'thread/goal/cleared', params: { threadId: 'worker' } });
  pending.reject(new Error('Older get failed'));
  assert.deepEqual(await oldRead, { goal: null, state: 'ready', error: null });
});

test('a read started for a closed worker view cannot update or coalesce into a reopened view', async () => {
  const f = fixture(goal()), pending = deferred(), original = f.rpc.call; let first = true;
  f.rpc.call = async (method, params) => {
    if (method === 'thread/goal/get' && first) { first = false; return pending.promise; }
    return original(method, params);
  };
  const oldRead = f.w.goalState('worker');
  const reopened = { ...f.agent, nativeGoal: null, nativeGoalState: 'unknown', nativeGoalError: null };
  f.w.agents.set('worker', reopened);
  const current = goal({ objective: 'Current reopened work.', createdAt: 100 }); f.set(current);
  assert.equal((await f.w.goalState('worker')).goal.objective, current.objective);
  pending.resolve({ goal: goal() });
  await assert.rejects(oldRead, /worker view changed/);
  assert.equal(reopened.nativeGoal.objective, current.objective);
  assert.equal(reopened.nativeGoalState, 'ready'); assert.equal(reopened.nativeGoalError, null);
});
