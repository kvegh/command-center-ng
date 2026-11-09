import { readCodexGoal, changeCodexGoal, parseNativeGoal, validateGoalChange } from './native-goals.mjs';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const attention = agent => agent.questions.length || agent.thread.status?.activeFlags?.some(flag => ['waitingOnApproval', 'waitingOnUserInput'].includes(flag));
const resumable = new Set(['paused', 'blocked', 'usageLimited', 'budgetLimited']);
const unsupported = error => error.code === -32601;
function validateExpectedGoal(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'createdAt,objective,tokenBudget'
    || typeof value.objective !== 'string' || !value.objective.trim()
    || [...value.objective].length > 4000
    || !Number.isFinite(value.createdAt) || value.createdAt < 0
    || (value.tokenBudget !== null && (!Number.isFinite(value.tokenBudget) || value.tokenBudget < 0))) {
    throw fail('Refresh and confirm the displayed native Goal before this change.', 400);
  }
  return value;
}
const matchesExpected = (goal, expected) => expected === null ? goal === null
  : !!goal && ['objective', 'createdAt', 'tokenBudget'].every(key => goal[key] === expected[key]);

// The native runtime owns objectives, usage and continuation. These process-local
// maps serialize UI operations; they are not a second goal store or scheduler.
export class WorkerGoals {
  constructor(workspace) {
    this.workspace = workspace; this.reads = new Map(); this.mutations = new Map(); this.revisions = new Map();
  }
  agent(id) {
    const agent = this.workspace.agent(id);
    if (agent.provider === 'claude' || agent.role === 'coordinator') throw fail('Native Goal controls are available for local Codex workers only.', 400);
    return agent;
  }
  result(agent) { return { goal: agent.nativeGoal ?? null, state: agent.nativeGoalState || 'unknown', error: agent.nativeGoalError || null }; }
  state(agent, state, error = null) {
    agent.nativeGoalState = state; agent.nativeGoalError = error;
    this.workspace.changed(); return this.result(agent);
  }
  current(agent) {
    const w = this.workspace;
    if (w.agents.get(agent.id) !== agent) throw fail('The worker changed before its native Goal operation.');
    if (!w.rpc.ready) throw fail('Reconnect Codex before changing its native Goal.', 503);
    if (w.restoring) throw fail('Wait for workspace restoration before changing a native Goal.');
    if (!agent.canSend || agent.thread.canAcceptDirectInput === false) throw fail('This native worker does not accept direct user changes.');
    if (attention(agent)) throw fail('Answer or load this worker’s pending native request before changing its Goal.');
    if (w.summaryJobs.has(agent.id) || w.returnJobs.has(agent.id) || agent.returnSummary?.delivered || w.handoffs.incoming(agent.id)) throw fail('Finish the branch handoff before changing its native Goal.');
  }
  async read(id) {
    const agent = this.agent(id);
    if (this.mutations.has(id)) return this.mutations.get(id);
    if (this.reads.get(id)?.agent === agent) return this.reads.get(id).job;
    this.state(agent, 'loading');
    const revision = this.revisions.get(id) || 0;
    const job = (async () => {
      try {
        if (!this.workspace.rpc.ready) throw fail('Reconnect Codex to read its native Goal.', 503);
        const goal = await readCodexGoal(this.workspace.rpc, id);
        if (this.workspace.agents.get(id) !== agent) throw fail('The worker was closed before its Goal was read.');
        // A live update received during get is newer evidence than its snapshot.
        if ((this.revisions.get(id) || 0) !== revision) return this.result(agent);
        agent.nativeGoal = goal;
        return this.mutations.has(id) ? this.result(agent) : this.state(agent, 'ready');
      } catch (error) {
        if (this.workspace.agents.get(id) !== agent) throw fail('The worker view changed before its native Goal was read. Refresh the new view.');
        if ((this.revisions.get(id) || 0) !== revision) return this.result(agent);
        return this.state(agent, unsupported(error) ? 'unsupported' : 'error', error.message);
      }
    })();
    const reading = { agent, job }; this.reads.set(id, reading);
    try { return await job; } finally { if (this.reads.get(id) === reading) this.reads.delete(id); }
  }
  update(id, choice) {
    const agent = this.agent(id); this.current(agent);
    if (this.mutations.has(id)) throw fail('Wait for the current native Goal change to finish.');
    if (agent.nativeGoalState === 'uncertain') throw fail('Refresh the native Goal before requesting another change; the previous result is uncertain.');
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)) throw fail('Choose a native Goal action.', 400);
    const { replace, expectedGoal, ...selection } = choice;
    const change = validateGoalChange(selection);
    if (replace !== undefined && (change.action !== 'start' || replace !== true)) throw fail('Only an explicitly confirmed Goal replacement may use replace: true.', 400);
    const hasExpected = Object.hasOwn(choice, 'expectedGoal');
    if ((replace === true || change.action === 'clear') && !hasExpected) throw fail('Refresh and confirm the displayed native Goal before replacing or clearing it.', 400);
    const expected = hasExpected ? validateExpectedGoal(expectedGoal) : undefined;
    this.revisions.set(id, (this.revisions.get(id) || 0) + 1);
    this.state(agent, 'changing');
    const job = Promise.resolve().then(() => this.change(agent, change, replace === true, expected)).finally(() => {
      this.mutations.delete(id); this.workspace.changed();
    });
    this.mutations.set(id, job); return job;
  }
  async change(agent, change, replace, expected) {
    const w = this.workspace, id = agent.id; let attempted = false, acknowledgement;
    try {
      // Do not resume/start a turn for a read or control. Native API availability
      // and ownership are verified before the single explicit native mutation.
      const { thread } = await w.rpc.call('thread/read', { threadId: id });
      if (!thread || thread.id !== id) throw fail('Codex returned a different worker.');
      agent.thread = thread; this.current(agent);
      const beforeRevision = this.revisions.get(id) || 0;
      const beforeRead = await readCodexGoal(w.rpc, id);
      const before = (this.revisions.get(id) || 0) === beforeRevision ? beforeRead : agent.nativeGoal;
      agent.nativeGoal = before;
      this.current(agent);
      if (expected !== undefined && !matchesExpected(before, expected)) throw fail('The native Goal changed since it was displayed. Refresh it and confirm the current Goal before trying again.');
      if (change.action === 'start' && before && !replace) throw fail('A native Goal already exists. Confirm replacement and its effect on native usage before changing it.');
      if (change.action === 'pause' && before?.status !== 'active') throw fail('Only an active native Goal can be paused. Refresh its current state.');
      if (change.action === 'resume' && !resumable.has(before?.status)) throw fail('Resume a paused, blocked or limited native Goal. Completed Goals need an explicit new objective.');
      if (change.action === 'clear' && !before) return this.state(agent, 'ready');
      attempted = true;
      acknowledgement = await changeCodexGoal(w.rpc, id, change);
      const revision = this.revisions.get(id) || 0;
      const readback = await readCodexGoal(w.rpc, id);
      if (w.agents.get(id) !== agent) throw fail('The worker changed before native Goal confirmation.');
      const goal = (this.revisions.get(id) || 0) === revision ? readback : agent.nativeGoal;
      agent.nativeGoal = goal;
      if (change.action === 'clear' && goal !== null) throw fail('The native Goal is still present after Clear. Refresh before another change.');
      if (change.action === 'start' && (!goal || goal.objective !== change.objective || (Object.hasOwn(change, 'tokenBudget') && goal.tokenBudget !== change.tokenBudget))) throw fail('Native Goal readback differs from the requested objective or budget.');
      if (change.action !== 'clear' && !goal) throw fail('The native Goal disappeared before confirmation.');
      if (change.action === 'pause' && goal.status === 'active') throw fail('Native Goal readback is still active after Pause.');
      // Resume may immediately hit its existing budget or another native stop
      // condition; return the real lifecycle without resetting accounting.
      return this.state(agent, 'ready');
    } catch (error) {
      if (!attempted) {
        this.state(agent, unsupported(error) ? 'unsupported' : 'error', error.message); throw error;
      }
      // A timeout/error is not a rejection guarantee. Read back once and never
      // repeat the mutation automatically. Fresh explicit read is required
      // before another mutation when the exact result remains uncertain.
      try {
        const revision = this.revisions.get(id) || 0;
        const goal = await readCodexGoal(w.rpc, id);
        if (w.agents.get(id) === agent && (this.revisions.get(id) || 0) === revision) agent.nativeGoal = goal;
        if (acknowledgement && change.action === 'clear' && goal === null) return this.state(agent, 'ready');
      } catch { /* Preserve the last real state and explain uncertainty below. */ }
      return this.state(agent, unsupported(error) ? 'unsupported' : 'uncertain', `Native Goal change was not confirmed. Refresh before another change. ${error.message}`);
    }
  }
  notification(method, params) {
    if (!['thread/goal/updated', 'thread/goal/cleared'].includes(method)) return false;
    const agent = this.workspace.agents.get(params.threadId);
    if (!agent || agent.provider === 'claude' || agent.role === 'coordinator') return true;
    try {
      const goal = method === 'thread/goal/cleared' ? null : parseNativeGoal(params.goal, agent.id);
      if (goal && agent.nativeGoal && goal.updatedAt < agent.nativeGoal.updatedAt) return true;
      agent.nativeGoal = goal; this.revisions.set(agent.id, (this.revisions.get(agent.id) || 0) + 1);
      if (!this.mutations.has(agent.id)) this.state(agent, 'ready');
      else this.workspace.changed();
    } catch (error) { this.state(agent, 'error', error.message); }
    return true;
  }
}
