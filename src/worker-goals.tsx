import React, { useEffect, useRef, useState } from 'react';

export type NativeGoal = {
  threadId: string; objective: string; status: string; tokenBudget: number | null;
  tokensUsed: number; timeUsedSeconds: number; createdAt: number; updatedAt: number;
};
export type NativeGoalState = 'unknown' | 'loading' | 'ready' | 'changing' | 'unsupported' | 'error' | 'uncertain';
export type GoalResult = { goal: NativeGoal | null; state: NativeGoalState; error: string | null };
export type GoalIdentity = Pick<NativeGoal, 'objective' | 'createdAt' | 'tokenBudget'>;
export type GoalChoice = { action: 'start'; objective: string; tokenBudget?: number; replace?: true; expectedGoal: GoalIdentity | null }
  | { action: 'pause' | 'resume' | 'clear'; expectedGoal: GoalIdentity };

export function goalIdentity(goal: NativeGoal | null): GoalIdentity | null {
  return goal ? { objective: goal.objective, createdAt: goal.createdAt, tokenBudget: goal.tokenBudget } : null;
}
export function goalIdentityKey(goal: NativeGoal | null) { return goal ? JSON.stringify(goalIdentity(goal)) : null; }

// HTTP reads/mutations can finish after a newer native event, including a clear.
// Loading/changing alone is not a newer outcome; its matching HTTP result may
// still be useful if the final event is delayed or the stream disconnects.
export class GoalResponseGuard {
  private goalKey = '';
  private outcomeKey = '';
  private revision = 0;
  private request = 0;
  observe(result: GoalResult) {
    const goalKey = JSON.stringify(result.goal);
    const outcomeKey = ['loading', 'changing'].includes(result.state) ? this.outcomeKey : JSON.stringify([result.state, result.error]);
    if (goalKey !== this.goalKey || outcomeKey !== this.outcomeKey) {
      this.goalKey = goalKey; this.outcomeKey = outcomeKey; this.revision++;
    }
    return this.revision;
  }
  async settle(operation: () => Promise<GoalResult>, success: (result: GoalResult) => void, failure: (error: Error) => void) {
    const revision = this.revision; const request = ++this.request;
    const current = () => this.revision === revision && this.request === request;
    try { const result = await operation(); if (current()) success(result); }
    catch (error) { if (current()) failure(error as Error); }
  }
}

const statusLabels: Record<string, string> = {
  active: 'Active', paused: 'Paused', blocked: 'Blocked', usageLimited: 'Usage limited', budgetLimited: 'Budget limited', complete: 'Complete'
};
const resumable = new Set(['paused', 'blocked', 'usageLimited', 'budgetLimited']);

export function NativeGoalSummary({ goal, state = 'unknown' }: { goal?: NativeGoal | null; state?: NativeGoalState }) {
  const labels: Record<NativeGoalState, string> = { unknown: 'Not read', loading: 'Reading', ready: 'Not set', changing: 'Changing', unsupported: 'Unavailable', error: 'Read failed', uncertain: 'Unconfirmed' };
  const current = state === 'ready';
  return <p className="field-note worker-goal-mobile-status">Native goal: <strong>{goal ? `${!current ? 'Last read · ' : ''}${statusLabels[goal.status] || goal.status}` : labels[state]}</strong>{goal && <span title={goal.objective}> · {goal.objective}</span>}</p>;
}

export function goalStartChoice(objective: string, budget: string, previousGoal: NativeGoal | null, confirmed: boolean): GoalChoice {
  const text = objective.trim();
  const replacing = !!previousGoal;
  if (!text || [...text].length > 4000) throw new Error('Enter a goal objective of up to 4000 characters.');
  if (replacing && !confirmed) throw new Error('Confirm replacing the native goal and its possible accounting reset.');
  const tokens = budget.trim() ? Number(budget) : undefined;
  if (tokens !== undefined && (!Number.isSafeInteger(tokens) || tokens <= 0)) throw new Error('Enter a positive whole-number token budget, or leave it empty.');
  return { action: 'start', objective: text, expectedGoal: goalIdentity(previousGoal), ...(tokens !== undefined ? { tokenBudget: tokens } : {}), ...(replacing ? { replace: true as const } : {}) };
}

export function GoalActions({ goal, disabled, change }: { goal: NativeGoal; disabled: boolean; change: (choice: GoalChoice) => void }) {
  const supported = Object.hasOwn(statusLabels, goal.status);
  const expectedGoal = goalIdentity(goal)!;
  return <div className="button-row">
    {goal.status === 'active' && <button type="button" className="button subtle small" disabled={disabled} onClick={() => { if (!disabled) change({ action: 'pause', expectedGoal }); }}>Pause goal</button>}
    {resumable.has(goal.status) && <button type="button" className="button subtle small" disabled={disabled} onClick={() => { if (!disabled) change({ action: 'resume', expectedGoal }); }}>Resume goal</button>}
    <button type="button" className="button subtle small" disabled={disabled || !supported} onClick={() => { if (!disabled && supported) change({ action: 'clear', expectedGoal }); }}>Clear goal</button>
  </div>;
}

export function GoalEditor({ agentId, existing, objective, budget, confirmed, disabled, setObjective, setBudget, setConfirmed, submit }: {
  agentId: string; existing: boolean; objective: string; budget: string; confirmed: boolean; disabled: boolean;
  setObjective: (value: string) => void; setBudget: (value: string) => void; setConfirmed: (value: boolean) => void;
  submit: () => void;
}) {
  return <form className="worker-goal-editor" onSubmit={event => { event.preventDefault(); if (!disabled && (!existing || confirmed)) submit(); }}>
    <label htmlFor={`native-goal-objective-${agentId}`}>Objective</label>
    <textarea id={`native-goal-objective-${agentId}`} value={objective} rows={3} disabled={disabled} required onChange={event => setObjective(event.target.value)} placeholder="A concrete outcome for this worker" />
    <label htmlFor={`native-goal-budget-${agentId}`}>Token budget (optional)</label>
    <input id={`native-goal-budget-${agentId}`} type="number" min="1" step="1" value={budget} disabled={disabled} onChange={event => setBudget(event.target.value)} placeholder="Leave to Codex" />
    {existing && <label className="worker-goal-confirm"><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)} />Replace the current goal. Native usage, time and budget accounting may reset.</label>}
    <button type="submit" className="button subtle small" disabled={disabled || !objective.trim() || (existing && !confirmed)}>{existing ? 'Replace goal & reset accounting' : 'Start native goal'}</button>
  </form>;
}

export function WorkerGoals({ agentId, connected, blocked, currentGoal, currentState = 'unknown', currentError, load, save }: {
  agentId: string; connected: boolean; blocked?: string;
  currentGoal?: NativeGoal | null; currentState?: NativeGoalState; currentError?: string | null;
  load: () => Promise<GoalResult>; save: (choice: GoalChoice) => Promise<GoalResult>;
}) {
  const [result, setResult] = useState<GoalResult>({ goal: currentGoal || null, state: currentState, error: currentError || null });
  const [reading, setReading] = useState(false); const [changing, setChanging] = useState(false);
  const [error, setError] = useState(''); const [objective, setObjective] = useState('');
  const [budget, setBudget] = useState(''); const [confirmedIdentity, setConfirmedIdentity] = useState<string | null>(null);
  const request = useRef(false);
  const responses = useRef(new GoalResponseGuard());
  const propsRevision = responses.current.observe({ goal: currentGoal || null, state: currentState, error: currentError || null });
  useEffect(() => { setResult({ goal: currentGoal || null, state: currentState, error: currentError || null }); setError(''); }, [propsRevision]);
  const displayedIdentity = goalIdentityKey(result.goal);
  const confirmed = displayedIdentity !== null && confirmedIdentity === displayedIdentity;
  const setConfirmed = (value: boolean) => setConfirmedIdentity(value ? displayedIdentity : null);
  const failed = (problem: Error) => { setError(problem.message); setResult(previous => ({ ...previous, state: 'uncertain' })); };
  const refresh = async () => {
    if (!connected || request.current) return;
    request.current = true; setReading(true); setError('');
    try { await responses.current.settle(load, setResult, failed); }
    finally { request.current = false; setReading(false); }
  };
  // Opening settings only reads native state. Goal execution requires a user action.
  useEffect(() => { if (connected) void refresh(); }, [agentId, connected]);
  const busy = reading || changing || ['loading', 'changing'].includes(result.state) || ['loading', 'changing'].includes(currentState);
  const supportedStatus = !result.goal || Object.hasOwn(statusLabels, result.goal.status);
  const disabled = !connected || !!blocked || busy || result.state !== 'ready' || !supportedStatus;
  const change = async (choice: GoalChoice) => {
    if (disabled || request.current) return;
    request.current = true; setChanging(true); setError('');
    try { await responses.current.settle(() => save(choice), data => { setResult(data); setConfirmedIdentity(null); }, failed); }
    finally { request.current = false; setChanging(false); }
  };
  const submit = () => {
    try { void change(goalStartChoice(objective, budget, result.goal, confirmed)); }
    catch (problem) { setError((problem as Error).message); }
  };
  const editor = <GoalEditor agentId={agentId} existing={!!result.goal} objective={objective} budget={budget} confirmed={confirmed} disabled={disabled} setObjective={setObjective} setBudget={setBudget} setConfirmed={setConfirmed} submit={submit} />;
  return <section className="worker-goals" aria-label="Native Codex goal">
    <div className="task-heading"><h3 className="context-label">Native goal</h3><button type="button" className="task-link-button" disabled={!connected || busy} onClick={() => void refresh()}>Refresh goal</button></div>
    {result.goal ? <>
      <p className="field-note"><strong>{(!connected || result.state !== 'ready' || busy) && 'Last read · '}{statusLabels[result.goal.status] || `Unsupported native status (${result.goal.status})`}:</strong> {result.goal.objective}</p>
      <p className="field-note">{result.goal.tokensUsed.toLocaleString()} tokens used{result.goal.tokenBudget !== null ? ` / ${result.goal.tokenBudget.toLocaleString()} budget` : ' · no token budget'} · {Math.floor(result.goal.timeUsedSeconds / 60)} min recorded</p>
      <GoalActions goal={result.goal} disabled={disabled} change={choice => { void change(choice); }} />
      {['usageLimited', 'budgetLimited'].includes(result.goal.status) && <p className="field-note">Resume preserves native limits and accounting. The goal may remain limited.</p>}
      <details><summary className="task-link-button">Replace goal</summary>{editor}</details>
    </> : result.state === 'ready' ? <><p className="field-note">No native goal is set.</p>{editor}</> : null}
    {!connected && <p className="field-note" role="status">Connect Codex to read or change its native goal.</p>}
    {busy && <p className="field-note" role="status">{changing || result.state === 'changing' ? 'Waiting for native goal confirmation…' : 'Reading the native goal…'}</p>}
    {!busy && result.state === 'unknown' && <p className="field-note" role="status">Native goal state has not been read.</p>}
    {result.state === 'unsupported' && <p className="field-note" role="status">This Codex runtime does not support native goal controls.</p>}
    {result.state === 'uncertain' && <p className="field-note" role="status">The native goal outcome is unconfirmed. Refresh before making another change.</p>}
    {blocked && <p className="field-note" role="status">{blocked}</p>}
    {(error || result.error) && <p className="error-text" role="alert">{error || result.error}</p>}
  </section>;
}
