import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import './style.css';
import { version as VERSION } from '../package.json';
const towerIcon = new URL('./assets/airport-control-tower.png', import.meta.url).href;

type Status = 'running' | 'attention' | 'idle' | 'offline' | 'error';
type Message = { id: string; turnId: string; branchable?: boolean; type: 'user' | 'assistant' | 'activity'; text: string; state: string };
type Task = { id: string; text: string; state: string; worker?: string; assignee?: string | null; priority?: number; parentId?: string | null };
type Tracker = { status: 'ready' | 'unavailable'; label: string; tasks: Task[]; checkedAt: string; error: string | null };
type Question = { id: string | number; method: string; params: Record<string, any>; responding?: boolean; error?: string | null; review?: { decision: string; rationale: string } };
type Agent = { id: string; role?: 'worker' | 'coordinator'; progress?: { summary: string; nextStep: string; blocker: string; updatedAt: string }; name: string; goal: string; cwd: string; model: string | null; status: Status; parentId: string | null; freshBranch?: boolean; summarizing?: boolean; returning?: boolean; returnSummary?: { text: string; turnId: string; delivered: boolean }; lastCompletedTurnId: string | null; canSend: boolean; messages: Message[]; tasks: Task[]; taskCount: number; tracker?: Tracker; questions: Question[]; turnId: string | null; olderCursor: string | null };
type CoordinatorState = { id: string | null; starting: boolean; paused: boolean; error: string | null; queuedMessages: number; audit: { agentId: string; action?: string; decision?: string; outcome: string; rationale?: string; at: string }[] };
type Snapshot = { connected: boolean; error: string | null; version: string; agents: Agent[]; defaultCwd?: string; coordinator?: CoordinatorState | null };
type Available = { id: string; name: string; cwd: string; status: Status; parentId: string | null; forkedFromId: string | null };
const labels: Record<Status, string> = { running: 'Running', attention: 'Needs you', idle: 'Idle', offline: 'Offline', error: 'Error' };

async function api(path: string, data?: unknown) {
  const response = await fetch('/api/' + path, { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <><path d="m5 12 14-7-7 14-2-7-5-0Z" /><path d="m10 12 9-7" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 11-2l3 3M4 16l3 3a7 7 0 0 0 11-2" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    logout: <><path d="M9 4H5v16h4M13 8l4 4-4 4M9 12h12" /></>,
    branch: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="6" r="2" /><path d="M6 7v10M6 14c8 0 12-1 12-6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chat: <path d="M20 11a8 8 0 0 1-8 8H5l-4 3 2-7a8 8 0 1 1 17-4Z" />
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.chat}</svg>;
}
function Brand() { return <div className="brand" role="img" aria-label="Command Center NG"><img className="brandmark" src={towerIcon} alt="" /><span>command center<span className="brand-ng">.ng</span></span></div>; }
function Badge({ status }: { status: Status }) { return <span className={`status ${status}`}><span className="status-dot" />{labels[status]}</span>; }
function Text({ value }: { value: string }) {
  return <>{value.split(/(```[\s\S]*?```)/g).map((part, i) => part.startsWith('```') ? <pre key={i}><code>{part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}</code></pre> : <div className="prose" key={i}>{part.split(/(\*\*[^*]+\*\*)/g).map((piece, k) => piece.startsWith('**') ? <strong key={k}>{piece.slice(2, -2)}</strong> : piece)}</div>)}</>;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <main className="login-page"><div className="login-card"><Brand /><div className="eyebrow">YOUR WORK, IN FOCUS</div><h1>A little less switching.<br />A lot more clarity.</h1><p>One quiet workspace for your Codex agents.</p><form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await api('login', { password }); setPassword(''); onLogin(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}><label htmlFor="password">Application password</label><div className="password-input"><Icon name="lock" /><input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required autoFocus /></div>{error && <p className="error-text" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy ? 'Signing in…' : 'Enter workspace'}<Icon name="chevron" /></button></form><div className="login-foot">COMMAND CENTER NG <span>v{VERSION}</span></div></div></main>;
}

function QuestionCard({ question, agentId, act }: { question: Question; agentId: string; act: (path: string, data: unknown) => Promise<boolean> }) {
  const [answers, setAnswers] = useState<Record<string, string>>({}); const [localBusy, setBusy] = useState(false);
  const busy = localBusy || !!question.responding;
  const form = question.method === 'item/tool/requestUserInput';
  const approval = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(question.method);
  const submit = async (data: unknown) => { setBusy(true); await act(`agents/${agentId}/answer`, { requestId: question.id, ...data as object }); setBusy(false); };
  return <section className="question-card" aria-label="Question needing your answer"><div className="question-heading"><span className="attention-mark">!</span><span>{form ? 'A question for you' : approval ? 'Your approval is needed' : 'Action needed in Codex'}</span></div>
    {question.responding && <p role="status">Waiting for Codex to confirm resolution…</p>}
    {question.error && <p className="error-text" role="alert">{question.error}</p>}
    {question.review && <p className="field-note">Coordinator · {question.review.decision === 'ask' ? 'Needs your decision' : question.review.decision}: {question.review.rationale}</p>}
    {approval && <button className="button subtle small" disabled={busy} onClick={() => void act(`agents/${agentId}/review`, { requestId: question.id })}>Ask coordinator to review</button>}
    {form ? <form onSubmit={event => { event.preventDefault(); void submit({ answers }); }}>{(question.params.questions || []).map((q: any) => <fieldset key={q.id}><legend>{q.question}</legend>{q.options && <div className="choices">{q.options.map((option: any) => <button key={option.label} type="button" className={answers[q.id] === option.label ? 'choice selected' : 'choice'} onClick={() => setAnswers({ ...answers, [q.id]: option.label })}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div>}<input aria-label={q.question} type={q.isSecret ? 'password' : 'text'} placeholder="Type your answer…" required value={answers[q.id] || ''} onChange={event => setAnswers({ ...answers, [q.id]: event.target.value })} /></fieldset>)}<button className="button amber" disabled={busy}>Send answer<Icon name="arrow" /></button></form> : <><p>{question.params.reason || (approval ? 'Review this action before continuing.' : 'Complete this permission or app form in the native Codex client.')}</p>{question.params.command && <pre><code>{typeof question.params.command === 'string' ? question.params.command : JSON.stringify(question.params.command)}</code></pre>}<div className="button-row">{approval && <button className="button amber" disabled={busy} onClick={() => void submit({ decision: 'accept' })}>Allow once</button>}<button className="button subtle" disabled={busy} onClick={() => void submit({ decision: 'decline' })}>Decline</button>{approval && <button className="button subtle" disabled={busy} onClick={() => void submit({ decision: 'cancel' })}>Cancel turn</button>}</div></>}
  </section>;
}

function ReturnDialog({ agent, dismiss, returned }: { agent: Agent; dismiss: () => void; returned: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(''); const [preparing, setPreparing] = useState(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const prepare = async () => {
    setPreparing(true); setError('');
    try { const result = await api(`agents/${agent.id}/summary`, {}); setText(result.text); }
    catch (error) { setError((error as Error).message); }
    finally { setPreparing(false); }
  };
  useEffect(() => { dialog.current?.showModal(); void prepare(); }, []);
  const delivered = agent.returnSummary?.delivered;
  return <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else dismiss(); }} className="agent-dialog return-dialog">
    <div className="dialog-heading"><div><div className="eyebrow">PICK UP THE MAIN THREAD</div><h2>Return a summary</h2></div><button className="icon-button" disabled={busy} onClick={dismiss} aria-label="Close"><Icon name="close" /></button></div>
    <p className="field-note">{delivered ? 'Your summary has reached the parent. Close the branch to finish.' : 'Codex summarizes the branch’s findings, decisions, and next steps. Review it, then send it and close this branch.'}</p>
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { const result = await api(`agents/${agent.id}/return`, { text }); returned(result.id); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>
      <label htmlFor="branch-findings">Summary for the parent</label><textarea id="branch-findings" value={text} onChange={event => setText(event.target.value)} maxLength={2000} rows={8} required autoFocus readOnly={delivered} disabled={preparing || busy} placeholder={preparing ? 'Preparing a concise summary…' : 'Prepare a summary to return to the parent.'} />
      <p className="field-note" role="status">{preparing ? 'Preparing summary in this branch…' : `${text.length} / 2000 characters · The branch history is kept in the archive.`}</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="button-row"><button type="button" className="button subtle" disabled={busy} onClick={dismiss}>Keep exploring</button>{!preparing && !text && <button type="button" className="button subtle" onClick={() => void prepare()}>Retry summary</button>}<button className="button primary" disabled={preparing || busy || !text.trim()}>{busy ? 'Returning…' : delivered ? 'Close branch' : 'Send summary & close'}<Icon name="arrow" /></button></div>
    </form>
  </dialog>;
}

function TaskDialog({ agent, dismiss, saved }: { agent: Agent; dismiss: () => void; saved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]); const [ids, setIds] = useState<string[]>([]);
  const [search, setSearch] = useState(''); const [extraIds, setExtraIds] = useState('');
  const [loading, setLoading] = useState(true); const [loaded, setLoaded] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    api(`agents/${agent.id}/tasks`).then(result => { setTasks(result.tasks); setIds(result.linkedIds); setLoaded(true); }).catch(error => setError(error.message)).finally(() => setLoading(false));
  }, []);
  const matches = tasks.filter(task => `${task.id} ${task.text}`.toLowerCase().includes(search.toLowerCase()));
  return <dialog ref={dialog} className="agent-dialog task-dialog" onCancel={event => { if (busy) event.preventDefault(); else dismiss(); }}>
    <div className="dialog-heading"><div><div className="eyebrow">BEADS TASK TRACKING</div><h2>Tasks for this conversation</h2></div><button className="icon-button" onClick={dismiss} disabled={busy} aria-label="Close"><Icon name="close" /></button></div>
    <p className="field-note">Choose existing tasks from the Beads tracker for this working directory. Linking changes the conversation association; agents update task states.</p>
    <form onSubmit={async event => {
      event.preventDefault(); setError(''); setBusy(true);
      try { const chosen = [...new Set([...ids, ...extraIds.split(/[\s,]+/).filter(Boolean)])]; await api(`agents/${agent.id}/tasks`, { ids: chosen }); saved(); }
      catch (error) { setError((error as Error).message); } finally { setBusy(false); }
    }}>
      <input className="search" aria-label="Find Beads tasks" placeholder="Find a task by title or ID…" value={search} onChange={event => setSearch(event.target.value)} />
      <div className="task-picker" aria-busy={loading}>
        {loading ? <p className="field-note">Reading Beads tasks…</p> : matches.slice(0, 100).map(task => <label className="task-option" key={task.id}>
          <input type="checkbox" checked={ids.includes(task.id)} disabled={busy} onChange={event => setIds(previous => event.target.checked ? [...previous, task.id] : previous.filter(id => id !== task.id))} />
          <span><strong>{task.text}</strong><small>{task.id} · {task.state.replaceAll('_', ' ')}{task.assignee ? ` · ${task.assignee}` : ''}</small></span>
        </label>)}
        {!loading && !matches.length && <p className="field-note">No matching tasks. An agent can create work in Beads, or add an existing task ID below.</p>}
      </div>
      {matches.length > 100 && <p className="field-note">Showing 100 of {matches.length} matches. Refine the search to find more.</p>}
      <label className="field-note" htmlFor="task-ids">Additional task IDs, separated by spaces or commas</label>
      <input id="task-ids" className="mono" value={extraIds} onChange={event => setExtraIds(event.target.value)} placeholder="project-123, project-456" maxLength={10_000} />
      {error && <p role="alert" className="error-text">{error}</p>}
      <div className="button-row"><button type="button" className="button subtle" disabled={busy} onClick={dismiss}>Cancel</button><button className="button primary" disabled={!loaded || busy}>{busy ? 'Saving…' : `Save task links (${ids.length})`}</button></div>
    </form>
  </dialog>;
}

function AgentDialog({ state, defaultCwd, dismiss, act, select }: { state: Snapshot; defaultCwd: string; dismiss: () => void; act: (path: string, data: unknown) => Promise<boolean>; select: (id: string) => void }) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing'); const [available, setAvailable] = useState<Available[]>([]); const [goal, setGoal] = useState(''); const [cwd, setCwd] = useState(defaultCwd); const [search, setSearch] = useState(''); const [cursor, setCursor] = useState<string | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const load = async (more?: string) => { try { const result = await api('agents' + (more ? '?cursor=' + encodeURIComponent(more) : '')); setAvailable(previous => more ? [...previous, ...result.agents] : result.agents); setCursor(result.nextCursor); } catch (error) { setError((error as Error).message); } };
  useEffect(() => { dialog.current?.showModal(); void load(); }, []);
  return <dialog ref={dialog} onCancel={dismiss} className="agent-dialog"><div className="dialog-heading"><div><div className="eyebrow">MAKE ROOM FOR YOUR NEXT IDEA</div><h2>Add an agent</h2></div><button className="icon-button" onClick={dismiss} aria-label="Close dialog"><Icon name="close" /></button></div><div className="segmented"><button className={mode === 'existing' ? 'selected' : ''} onClick={() => setMode('existing')}>Open existing</button><button className={mode === 'new' ? 'selected' : ''} onClick={() => setMode('new')}>Start new</button></div>{error && <p role="alert" className="error-text">{error}</p>}
    {mode === 'existing' ? <><input className="search" aria-label="Find an agent" placeholder="Find a conversation…" value={search} onChange={e => setSearch(e.target.value)} /><div className="agent-list">{available.filter(agent => !state.agents.some(a => a.id === agent.id) && agent.name.toLowerCase().includes(search.toLowerCase())).map(agent => <button className="agent-option" key={agent.id} disabled={busy} onClick={async () => { setBusy(true); if (await act(`agents/${agent.id}/open`, {})) { select(agent.id); dismiss(); } setBusy(false); }}><span className={`option-dot ${agent.status}`} /><span><strong>{agent.name}</strong><small>{agent.forkedFromId ? 'Branch · ' : agent.parentId ? 'Subagent · ' : ''}{agent.cwd}</small></span><Badge status={agent.status} /></button>)}{!available.length && <p className="muted">No conversations found. Start your first agent.</p>}</div>{cursor && <button className="button subtle" onClick={() => void load(cursor)}>Load more conversations</button>}</> : <form className="new-agent" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { const result = await api('agents', { goal, cwd }); select(result.id); dismiss(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}><label htmlFor="goal">What should this agent achieve?</label><input id="goal" placeholder="A clear, single-line goal" value={goal} maxLength={2000} onChange={event => setGoal(event.target.value)} required /><label htmlFor="cwd">Working directory on the Linux host</label><input id="cwd" className="mono" value={cwd} onChange={event => setCwd(event.target.value)} required /><p className="field-note">Uses your existing Codex sign-in, model, and permission settings.</p><button className="button primary" disabled={busy || state.agents.filter(agent => agent.role !== 'coordinator').length >= 4}>{busy ? 'Starting…' : 'Start agent'}<Icon name="arrow" /></button></form>}
  </dialog>;
}

function CoordinatorContext({ state, act, choose }: { state: Snapshot; act: (path: string, data: unknown) => Promise<boolean>; choose: (id: string) => void }) {
  const coordinator = state.coordinator;
  return <aside className="context coordinator-context" aria-label="Coordinator overview">
    <div className="eyebrow">WORKSPACE COORDINATOR</div><h2>Keep the bigger picture.</h2>
    <p className="field-note">Summaries and approval reviews follow your project instructions. Uncertain scope comes back to you.</p>
    <div className="button-row"><button className="button subtle small" disabled={!state.connected} onClick={() => void act('coordinator', { paused: !coordinator?.paused })}>{coordinator?.paused ? 'Resume coordinator' : 'Pause coordinator'}</button><button className="button subtle small" disabled={!state.connected || coordinator?.paused} onClick={() => void act('coordinator', { action: 'refresh' })}>Summarize now</button></div>
    {coordinator?.error && <p className="error-text" role="alert">{coordinator.error}</p>}
    <div className="coordinator-workers">{state.agents.filter(agent => agent.role !== 'coordinator').map(agent => <button key={agent.id} className="coordinator-worker" onClick={() => choose(agent.id)}><strong>{agent.name}</strong><Badge status={agent.status} /><span>{agent.progress?.summary || agent.goal}</span></button>)}</div>
    {!!coordinator?.queuedMessages && <div className="field-note">{coordinator.queuedMessages} message(s) waiting for workers to become idle.<button className="button subtle small" onClick={() => void act('coordinator', { action: 'clear-messages' })}>Clear queued messages</button></div>}
    {!!coordinator?.audit.length && <details className="coordinator-audit"><summary>Recent decisions and deliveries</summary>{coordinator.audit.slice().reverse().map((entry, index) => <div key={`${entry.at}-${index}`}><strong>{entry.decision || entry.action} · {entry.outcome.replaceAll('_', ' ')}</strong><span>{state.agents.find(agent => agent.id === entry.agentId)?.name || 'Worker'} · {new Date(entry.at).toLocaleTimeString()}</span>{entry.rationale && <p>{entry.rationale}</p>}</div>)}</details>}
  </aside>;
}

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null); const [state, setState] = useState<Snapshot>({ connected: false, error: null, version: VERSION, agents: [] });
  const [selected, setSelected] = useState(''); const [drafts, setDrafts] = useState<Record<string, string>>({}); const [dialog, setDialog] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(''); const [defaultCwd, setDefaultCwd] = useState(''); const [returnAgent, setReturnAgent] = useState<Agent | null>(null); const [taskAgent, setTaskAgent] = useState<Agent | null>(null);
  const scroll = useRef<HTMLDivElement>(null); const positions = useRef<Record<string, number>>({}); const previous = useRef(''); const nearBottom = useRef(true);
  const composerInput = useRef<HTMLTextAreaElement>(null); const focusTarget = useRef<string | null>(null);
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const active = state.agents.find(agent => agent.id === selected) || state.agents[0];
  useEffect(() => { api('session').then(result => setAuthenticated(result.authenticated)).catch(error => { setError(error.message); setAuthenticated(false); }); }, []);
  useEffect(() => {
    if (!authenticated) return;
    api('state').then(data => { setState(data); setDefaultCwd(data.defaultCwd); }).catch(error => setError(error.message));
    const stream = new EventSource('/api/events');
    stream.onmessage = event => setState(JSON.parse(event.data));
    stream.onerror = () => { setState(previous => ({ ...previous, connected: false })); api('session').then(data => { if (!data.authenticated) setAuthenticated(false); }).catch(() => {}); };
    return () => stream.close();
  }, [authenticated]);
  useLayoutEffect(() => {
    const node = scroll.current; if (!node || !active) return;
    if (previous.current !== active.id) { node.scrollTop = positions.current[active.id] ?? node.scrollHeight; previous.current = active.id; }
    else if (nearBottom.current) node.scrollTop = node.scrollHeight;
  }, [active?.id, active?.messages, active?.questions]);
  function focusComposer(id: string) {
    const node = composerInput.current;
    if (focusTarget.current !== id || dialog || returnAgent || taskAgent || !node || node.dataset.agentId !== id) return;
    focusTarget.current = null;
    if (node.disabled) return;
    node.focus({ preventScroll: true }); node.setSelectionRange(node.value.length, node.value.length);
  }
  useLayoutEffect(() => { if (active) focusComposer(active.id); }, [active?.id, dialog, returnAgent, taskAgent]);
  const choose = (id: string) => {
    if (active && scroll.current) positions.current[active.id] = scroll.current.scrollTop;
    nearBottom.current = true; focusTarget.current = id;
    flushSync(() => setSelected(id)); focusComposer(id);
  };
  const act = async (path: string, data: unknown) => { setError(''); try { await api(path, data); return true; } catch (error) { setError((error as Error).message); return false; } };
  const navigate = async (action: 'fork' | 'parent', data: unknown = {}) => {
    if (!active) return; setError(''); setBusy('navigate');
    try { const result = await api(`agents/${active.id}/${action}`, data); choose(result.id); } catch (error) { setError((error as Error).message); } finally { setBusy(''); }
  };
  const send = async () => {
    if (!active || !drafts[active.id]?.trim()) return;
    setBusy(active.id); if (await act(`agents/${active.id}/message`, { text: drafts[active.id] })) setDrafts(previous => ({ ...previous, [active.id]: '' })); setBusy('');
  };
  if (authenticated === null) return <div className="loading-page"><Brand /><p>Opening your workspace…</p></div>;
  if (!authenticated) return <Login onLogin={() => setAuthenticated(true)} />;
  const attention = state.agents.filter(agent => agent.status === 'attention').length;
  const workerRows = state.agents.filter(agent => agent.role !== 'coordinator');
  const ids = [...tabOrder.filter(id => workerRows.some(agent => agent.id === id)), ...workerRows.map(agent => agent.id).filter(id => !tabOrder.includes(id))];
  const workers = ids.map(id => workerRows.find(agent => agent.id === id)!);
  const moveTab = (source: string, target: string) => {
    if (source === target || !ids.includes(source) || !ids.includes(target)) return;
    const order = ids.filter(id => id !== source); order.splice(ids.indexOf(target), 0, source); setTabOrder(order);
  };
  const coordinator = state.agents.find(agent => agent.role === 'coordinator');
  const tab = (agent: Agent, index: number) => <div className={`tab-wrap ${agent.status} ${active?.id === agent.id ? 'active' : ''} ${agent.role === 'coordinator' ? 'coordinator-tab' : ''}`} key={agent.id} draggable={agent.role !== 'coordinator'} onDragStart={event => { event.dataTransfer.setData('application/x-ccng-tab', agent.id); event.dataTransfer.effectAllowed = 'move'; }} onDragOver={event => { if (agent.role !== 'coordinator') { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }} onDrop={event => { event.preventDefault(); if (agent.role !== 'coordinator') moveTab(event.dataTransfer.getData('application/x-ccng-tab'), agent.id); }}><button role="tab" aria-selected={active?.id === agent.id} aria-controls="agent-panel" className="agent-tab" aria-label={`${agent.name}: ${labels[agent.status]}`} onClick={() => choose(agent.id)} onKeyDown={event => { if (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key) && agent.role !== 'coordinator') { event.preventDefault(); const other = workers[index + (event.key === 'ArrowLeft' ? -1 : 1)]; if (other) moveTab(agent.id, other.id); } }} title={`${agent.goal} · ${labels[agent.status]}`}><span className="tab-number">{agent.role === 'coordinator' ? <Icon name="branch" size={12} /> : agent.parentId ? <Icon name="branch" size={12} /> : String(index + 1).padStart(2, '0')}</span><i className="status-dot" /><span className="tab-text"><strong>{agent.name}</strong></span></button>{agent.role !== 'coordinator' && active?.id === agent.id && workers.length > 1 && <span className="tab-order-controls"><button className="tab-move" disabled={index === 0} aria-label={`Move ${agent.name} tab left`} title="Move tab left (Alt + Left)" onClick={() => moveTab(agent.id, workers[index - 1].id)}>←</button><button className="tab-move" disabled={index === workers.length - 1} aria-label={`Move ${agent.name} tab right`} title="Move tab right (Alt + Right)" onClick={() => moveTab(agent.id, workers[index + 1].id)}>→</button></span>}{agent.role !== 'coordinator' && <button className="tab-close" aria-label={`Close ${agent.name} tab; agent keeps running`} title="Close tab; agent keeps running" onClick={() => void act(`agents/${agent.id}/close`, {})}><Icon name="close" size={13} /></button>}</div>;
  return <div className="app-shell"><header className="topbar"><div className="tabs-row"><div className="tabs" role="tablist" aria-label="Workers and coordinator">{workers.map(tab)}{state.coordinator && <div className="coordinator-tab-group" aria-label="Coordinator">{coordinator ? tab(coordinator, 0) : <button className="coordinator-start" disabled={!state.connected || state.coordinator.starting || !workers.length} onClick={() => void act('coordinator', {})}>{state.coordinator.starting ? 'Starting coordinator…' : state.coordinator.error ? 'Retry coordinator' : 'Coordinator'}</button>}</div>}</div><button className="new-tab" disabled={!state.connected || workers.length >= 4} onClick={() => setDialog(true)} aria-label="Add agent" title="Open an existing agent or start a new one"><Icon name="plus" /><span>Add agent</span></button></div><div className="topbar-right"><span className={`connection ${state.connected ? 'connected' : ''}`} title={state.connected ? 'Codex connected' : 'Codex disconnected'} aria-label={state.connected ? 'Codex connected' : 'Codex disconnected'}><span />{state.connected ? 'Codex connected' : 'Codex disconnected'}</span><span className={`agent-count ${attention ? 'needs-attention' : ''}`} title={`${workers.length} of 4 workers open${coordinator ? ' plus coordinator' : ''}${attention ? ` · ${attention} need attention` : ''}`}>{workers.length}<span>/4</span>{attention > 0 && <i aria-label={`${attention} need attention`} />}</span><span className="version">v{VERSION}</span><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={async () => { if (await act('logout', {})) setAuthenticated(false); }}><Icon name="logout" /></button></div><Brand /></header>
    <main className="workspace" aria-label="Agent workspace">
      {!state.connected && <div className="connection-banner" role="status"><span>{state.error || 'The live connection is unavailable.'}</span><button className="button subtle small" onClick={() => void act('connect', {})}><Icon name="refresh" />Reconnect</button></div>}
      {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Dismiss error"><Icon name="close" /></button></div>}
      <section className="workspace-frame">
        {active ? <div id="agent-panel" role="tabpanel" className="agent-panel">{active.role === 'coordinator' ? <CoordinatorContext state={state} act={act} choose={choose} /> : <aside className="context" aria-label="Goal and current tasks">{active.parentId && <div className="branch-context"><button className="parent-link" onClick={() => void navigate('parent')} disabled={busy === 'navigate'}><Icon name="branch" size={14} />Back to parent<span>{state.agents.find(agent => agent.id === active.parentId)?.name || 'Parent chat'}</span></button><button className="button subtle small" disabled={!state.connected || active.status !== 'idle' || active.summarizing || active.returning} onClick={() => setReturnAgent(active)}>Return summary<Icon name="arrow" size={13} /></button></div>}<div className="goal-row"><span className="context-label">GOAL</span><h2 title={active.goal}>{active.goal}</h2><Badge status={active.status} /><button className="button branch-button small" disabled={!state.connected || !active.lastCompletedTurnId || state.agents.filter(agent => agent.role !== 'coordinator').length >= 4 || busy === 'navigate'} title={state.agents.filter(agent => agent.role !== 'coordinator').length >= 4 ? 'Close a tab to make room for a branch' : 'Branch with context through the last completed reply'} onClick={() => void navigate('fork')}><Icon name="branch" size={14} />Branch chat</button></div>{active.progress && <div className="progress-recap"><span className="context-label" title={new Date(active.progress.updatedAt).toLocaleString()}>COORDINATOR RECAP</span><p>{active.progress.summary}</p>{active.progress.blocker && <p className="progress-blocker">{active.progress.blocker}</p>}{active.progress.nextStep && <p><strong>Next</strong> {active.progress.nextStep}</p>}</div>}<div className="task-summary"><div className="task-heading"><span className="context-label" title={`${active.taskCount} current Beads tasks`}>TASKS <small className="task-source">BEADS</small>{active.taskCount > 3 && <small className="task-count">3 / {active.taskCount}</small>}</span><button className="task-link-button" onClick={() => setTaskAgent(active)}>Link tasks</button></div><div>{active.tasks.length ? active.tasks.map(task => <div className="task-row" key={task.id} title={`${task.id}${task.parentId ? ` · parent ${task.parentId}` : ''}`}><span className={`task-indicator ${task.state}`}>{task.state === 'completed' ? <Icon name="check" size={12} /> : task.worker ? <Icon name="branch" size={10} /> : null}</span><span>{task.text}{(task.assignee || task.worker) && <em>{task.assignee || task.worker}</em>}</span><small>{task.state.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ').toLowerCase()}</small></div>) : <div className="task-row empty-task"><span className="task-indicator" /><span>{!active.tracker ? 'Reading Beads tasks…' : active.tracker.status === 'unavailable' ? 'Beads tracker unavailable.' : active.tracker.tasks.length ? 'All linked tasks are closed.' : 'No linked tasks. Link existing work or ask the agent to create it.'}</span></div>}</div>{active.tracker?.error && <details className="tracker-error"><summary>Tracker details</summary><p>{active.tracker.error}</p></details>}</div></aside>}
          <div className="conversation" ref={scroll} onScroll={event => { const node = event.currentTarget; nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90; if (active) positions.current[active.id] = node.scrollTop; }}><div className="conversation-top"><span>CONVERSATION</span><span>{active.model || 'Codex'}<span className="tiny-dot">·</span>{active.cwd.split('/').filter(Boolean).pop() || active.cwd}</span></div>{active.olderCursor && <button className="older-button" onClick={() => void act(`agents/${active.id}/history`, { cursor: active.olderCursor })}>Load earlier messages</button>}{!active.messages.length && <div className="conversation-empty"><Icon name="chat" size={30} /><h3>A clear goal. A fresh start.</h3><p>Send a message to begin this conversation.</p></div>}{active.messages.map(message => message.type === 'activity' ? <details key={message.id} className="activity-message"><summary><span className="activity-dot" /><span>{message.text.split('\n')[0]}</span><small>{message.state}</small></summary><pre><code>{message.text}</code></pre></details> : <article className={`message ${message.type}`} key={message.id}><div className="message-avatar">{message.type === 'user' ? 'Y' : <span className="mini-mark">✳</span>}</div><div className="message-body"><div className="message-author">{message.text.startsWith('[Command Center coordinator]') || (message.type === 'assistant' && active.role === 'coordinator') ? 'Coordinator' : message.type === 'user' ? 'You' : 'Codex'}{message.state === 'inProgress' && <span className="writing">writing</span>}{active.role !== 'coordinator' && message.type === 'assistant' && message.branchable && <button className="message-branch" title="Branch with context through this completed reply" disabled={!state.connected || state.agents.filter(agent => agent.role !== 'coordinator').length >= 4 || busy === 'navigate'} onClick={() => void navigate('fork', { lastTurnId: message.turnId })}><Icon name="branch" size={12} />Branch here</button>}</div><Text value={message.text} /></div></article>)}{active.questions.map(question => <QuestionCard key={`${typeof question.id}:${question.id}`} question={question} agentId={active.id} act={act} />)}{active.status === 'attention' && !active.questions.length && <div className="external-question"><strong>This agent needs your attention.</strong><span>Its pending request belongs to another Codex client. Answer it there; this view continues to follow the conversation.</span></div>}</div>
          <form className="composer" onSubmit={event => { event.preventDefault(); void send(); }}><div className="composer-box"><textarea ref={composerInput} data-agent-id={active.id} aria-label={`Message ${active.name}`} placeholder={active.summarizing ? 'Preparing the branch summary…' : active.questions.length ? 'Answer the question above to continue…' : 'A follow-up, a direction, a new idea…'} value={drafts[active.id] || ''} onChange={event => setDrafts({ ...drafts, [active.id]: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} rows={2} disabled={!state.connected || !active.canSend || !!active.questions.length || active.summarizing || active.returning || active.returnSummary?.delivered} /><div className="composer-controls"><span><kbd>Enter</kbd> send <span className="composer-separator">·</span><kbd>Shift Enter</kbd> new line</span><div>{active.status === 'running' || active.status === 'attention' ? <button type="button" className="button interrupt small" onClick={() => void act(`agents/${active.id}/interrupt`, {})} disabled={!state.connected || !active.turnId}><Icon name="stop" size={14} />Interrupt</button> : null}<button type="submit" className="send-button" aria-label="Send message" disabled={!drafts[active.id]?.trim() || busy === active.id || !state.connected || !active.canSend || !!active.questions.length || active.summarizing || active.returning || active.returnSummary?.delivered}><Icon name="arrow" /></button></div></div></div><div className="composer-foot"><span>Connected to your Codex workspace</span><span>{active.status === 'running' ? 'Messages steer the active turn' : 'Your next message starts a new turn'}</span></div></form></div> : <div className="empty-workspace"><div className="empty-glyph"><Icon name="branch" size={36} /></div><div className="eyebrow">ONE PLACE TO PICK UP THE THREAD</div><h2>Your agents. In focus.</h2><p>Open a running conversation or start something new.<br />Keep up to four agents close, without losing your place.</p><button className="button primary" disabled={!state.connected} onClick={() => setDialog(true)}><Icon name="plus" />Add your first agent</button><div className="empty-legend"><Badge status="running" /><Badge status="attention" /><Badge status="idle" /></div></div>}
      </section>
    </main>{dialog && <AgentDialog state={state} defaultCwd={defaultCwd} dismiss={() => setDialog(false)} act={act} select={choose} />}
    {taskAgent && <TaskDialog key={taskAgent.id} agent={taskAgent} dismiss={() => { choose(taskAgent.id); setTaskAgent(null); }} saved={() => { choose(taskAgent.id); setTaskAgent(null); }} />}
    {returnAgent && <ReturnDialog key={returnAgent.id} agent={state.agents.find(agent => agent.id === returnAgent.id) || returnAgent} dismiss={() => setReturnAgent(null)} returned={id => { choose(id); setReturnAgent(null); }} />}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
