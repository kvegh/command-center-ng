import limits from '../server/limits.json';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { TabReorder, reorderTabs, type TabDragState } from './tab-reorder';
import { loadBrowserWorkspace, saveBrowserWorkspace, type ThemeName, type ChatColour } from './browser-workspace';
import { ThemeSwitcher } from './theme-switcher';
import { CoordinatorWorkerCard } from './coordinator-worker-card';
import { OpenQuestions, RequestRecovery, questionTarget, type Question } from './open-questions';
import { ActivityGroup, groupMessages, isVisibleMessage } from './activity-groups';
import { ChatDraft, clearSubmittedDraft } from './chat-draft';
import { ImageDraftPreviews, MessageImages, prepareImageDrafts, readImageFile, finishImageDraft, removeImageDrafts, hasReadyDraft, type ImageDrafts, type MessageImage } from './image-drafts';
import { WorkerSettings } from './worker-settings';
import { ChatHeader } from './chat-header';
import { ProgressRecap } from './progress-recap';
import { ResizableComposer } from './resizable-composer';
import { WorkerStatus, sendWithReceipt, observeWorkspaceStream, type InputReceipt, type StreamHealth } from './worker-status';
import { TaskTotals, type TaskCounts } from './task-totals';
import { TaskListViewport } from './task-list-viewport';
import { BackgroundRequests, type BackgroundWorker } from './background-requests';
import { TaskDiscussion } from './task-discussion';
import { TaskInputLink } from './task-input-link';
import { TaskNotifyToggle, TaskNotificationAlerts, type TaskNotificationEvent } from './task-notification-controls';
import { TaskNotificationEngine } from './task-notifications';
import { requestDesktopNotifications, showTaskDesktopNotification } from './desktop-notifications';
import { Markdown } from './markdown';
import { BranchSummaryReview } from './branch-summary-review';
import { NativeRequestCard } from './native-request-card';
import { captureApprovalFocus, type ApprovalFocusContext } from './approval-focus';
import { WorkerModelSettings } from './worker-model-settings';
import { SidebarDivider, sidebarSize } from './sidebar-divider';
import { OverviewSections } from './overview-sections';
import { MessageTime } from './message-time';
import { CopyButton } from './copy-button';
import { canInterrupt, handleEscapeInterrupt } from './escape-interrupt';
import './style.css';
import { version as VERSION } from '../package.json';
const brandIcon = new URL('./assets/command-center-icon.png', import.meta.url).href;
// Keep landscape phones in the same page layout as narrow portrait windows.
const compactLayoutQuery = '(max-width: 900px), (hover: none) and (pointer: coarse)';

type Provider = 'codex' | 'claude';
type Status = 'running' | 'attention' | 'idle' | 'offline' | 'error';
type Message = { images?: MessageImage[]; timestamp?: string; timestampSource?: 'native' | 'received'; internalReport?: boolean; internalReportControl?: boolean; internalCoordinatorEvent?: boolean; id: string; turnId: string; branchable?: boolean; type: 'user' | 'assistant' | 'activity'; text: string; state: string };
type Task = { isChatQuestion?: boolean; displayState?: string; blockedBy?: string[]; id: string; text: string; state: string; worker?: string; assignee?: string | null; priority?: number; parentId?: string | null };
type Tracker = { status: 'ready' | 'unavailable'; label: string; tasks: Task[]; checkedAt: string; error: string | null };
type Agent = { lastNativeEventAt?: string; finishedTurn?: { id: string; status: string }; nativeWarning?: string | null; modelSettingsAvailable?: boolean; provider?: Provider; canBranch?: boolean; managementNotice?: string | null; reasoningEffort?: string | null; modelChange?: { model: string; effort: string | null; status: string }; reportState?: 'queued' | 'generating' | null; reportIntervalMinutes?: number; reportSettingPending?: boolean; reportError?: string | null; taskCounts?: TaskCounts; recoveringRequests?: boolean; requestError?: string | null; id: string; role?: 'worker' | 'coordinator'; observingOnly?: boolean; observeError?: string | null; progress?: { summary: string; nextStep: string; blocker: string; updatedAt: string }; name: string; goal: string; cwd: string; model: string | null; status: Status; parentId: string | null; freshBranch?: boolean; summarizing?: boolean; returning?: boolean; returnSummary?: { text: string; turnId: string; delivered: boolean }; lastCompletedTurnId: string | null; canSend: boolean; messages: Message[]; tasks: Task[]; taskCount: number; tracker?: Tracker; questions: Question[]; turnId: string | null; olderCursor: string | null };
type CoordinatorState = { id: string | null; starting: boolean; paused: boolean; error: string | null; queuedMessages: number; audit: { agentId: string; action?: string; decision?: string; outcome: string; rationale?: string; at: string }[] };
type Snapshot = { nativeWarning?: string | null; backgroundQuestions?: number; backgroundWorkers?: BackgroundWorker[]; connected: boolean; codexConnected?: boolean; claudeAvailable?: boolean; claudeError?: string | null; error: string | null; version: string; agents: Agent[]; defaultCwd?: string; restoration?: { status: string; error: string | null; warnings: { id: string; message: string }[] } | null; coordinator?: CoordinatorState | null };
type Available = { provider?: Provider; id: string; name: string; cwd: string; status: Status; parentId: string | null; forkedFromId: string | null };
const runtimeReady = (state: Snapshot, provider: Provider = 'codex') => state.connected && (provider === 'claude' ? !!state.claudeAvailable : state.codexConnected ?? state.connected);
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
    compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chat: <path d="M20 11a8 8 0 0 1-8 8H5l-4 3 2-7a8 8 0 1 1 17-4Z" />
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.chat}</svg>;
}
function Brand() { return <div className="brand" role="img" aria-label="Command Center NG"><img className="brandmark" src={brandIcon} alt="" /><span>command center<span className="brand-ng"> NG</span></span></div>; }
function Badge({ status }: { status: Status }) { return <span className={`status ${status}`}><span className="status-dot" />{labels[status]}</span>; }
function Text({ value }: { value: string }) { return <Markdown value={value} />; }

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <main className="login-page"><div className="login-card"><Brand /><div className="eyebrow">YOUR WORK, IN FOCUS</div><h1>A little less switching.<br />A lot more clarity.</h1><p>One quiet workspace for your Codex and Claude agents.</p><form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await api('login', { password }); setPassword(''); onLogin(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}><label htmlFor="password">Application password</label><div className="password-input"><Icon name="lock" /><input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required autoFocus /></div>{error && <p className="error-text" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy ? 'Signing in…' : 'Enter workspace'}<Icon name="chevron" /></button></form><div className="login-foot">COMMAND CENTER NG <span>v{VERSION}</span></div></div></main>;
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
        {loading ? <p className="field-note">Reading Beads tasks…</p> : !loaded ? <p className="field-note">Beads tasks could not be loaded. See the error below.</p> : matches.slice(0, 100).map(task => <label className="task-option" key={task.id}>
          <input type="checkbox" checked={ids.includes(task.id)} disabled={busy} onChange={event => setIds(previous => event.target.checked ? [...previous, task.id] : previous.filter(id => id !== task.id))} />
          <span><strong>{task.text}</strong><small>{task.id} · {task.state.replaceAll('_', ' ')}{task.assignee ? ` · ${task.assignee}` : ''}</small></span>
        </label>)}
        {!loading && loaded && !matches.length && <p className="field-note">No matching tasks. An agent can create work in Beads, or add an existing task ID below.</p>}
      </div>
      {matches.length > 100 && <p className="field-note">Showing 100 of {matches.length} matches. Refine the search to find more.</p>}
      <label className="field-note" htmlFor="task-ids">Additional task IDs, separated by spaces or commas</label>
      <input id="task-ids" className="mono" value={extraIds} onChange={event => setExtraIds(event.target.value)} placeholder="project-123, project-456" maxLength={10_000} />
      {error && <p role="alert" className="error-text">{error}</p>}
      <div className="button-row"><button type="button" className="button subtle" disabled={busy} onClick={dismiss}>Cancel</button><button className="button primary" disabled={!loaded || busy}>{busy ? 'Saving…' : `Save task links (${ids.length})`}</button></div>
    </form>
  </dialog>;
}

function AgentDialog({ state, dismiss, act, select }: { state: Snapshot; dismiss: () => void; act: (path: string, data: unknown) => Promise<boolean>; select: (id: string) => void }) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [provider, setProvider] = useState<Provider>(state.codexConnected === false && state.claudeAvailable ? 'claude' : 'codex');
  const [available, setAvailable] = useState<Available[]>([]); const [goal, setGoal] = useState(''); const [cwd, setCwd] = useState('');
  const [search, setSearch] = useState(''); const [cursor, setCursor] = useState<string | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null); const request = useRef(0);
  const ready = runtimeReady(state, provider);
  const load = async (more?: string) => {
    const current = ++request.current; setError('');
    if (!ready) { setAvailable([]); setCursor(null); setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ provider, ...(more ? { cursor: more } : {}) });
      const result = await api('agents?' + params);
      if (request.current === current) { setAvailable(previous => more ? [...previous, ...result.agents] : result.agents); setCursor(result.nextCursor); }
    } catch (problem) { if (request.current === current) setError((problem as Error).message); }
    finally { if (request.current === current) setLoading(false); }
  };
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { setAvailable([]); setCursor(null); void load(); return () => { request.current++; }; }, [provider, ready]);
  return <dialog ref={dialog} onCancel={dismiss} className="agent-dialog">
    <div className="dialog-heading"><div><div className="eyebrow">MAKE ROOM FOR YOUR NEXT IDEA</div><h2>Add an agent</h2></div><button className="icon-button" onClick={dismiss} aria-label="Close dialog"><Icon name="close" /></button></div>
    <label className="provider-choice">Agent runtime<select aria-label="Agent runtime" value={provider} disabled={busy} onChange={event => { request.current++; setAvailable([]); setCursor(null); setError(''); setLoading(false); setProvider(event.target.value as Provider); }}><option value="codex">Codex</option><option value="claude">Claude</option></select></label>
    <div className="segmented"><button className={mode === 'existing' ? 'selected' : ''} disabled={busy} onClick={() => setMode('existing')}>Open existing</button><button className={mode === 'new' ? 'selected' : ''} disabled={busy} onClick={() => setMode('new')}>Start new</button></div>
    {!ready && <p role="status" className="field-note">{provider === 'claude' ? state.claudeError || 'The local Claude runtime is unavailable.' : 'Codex is disconnected. Reconnect it before opening or starting a Codex agent.'}</p>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {mode === 'existing' ? <>
      <input className="search" aria-label="Find an agent" placeholder="Find a conversation…" value={search} onChange={event => setSearch(event.target.value)} />
      <div className="agent-list">{available.filter(agent => !state.agents.some(open => open.id === agent.id) && agent.name.toLowerCase().includes(search.toLowerCase())).map(agent => <button className="agent-option" key={agent.id} disabled={busy || !ready} onClick={async () => { setBusy(true); if (await act(`agents/${agent.id}/open`, {})) { select(agent.id); dismiss(); } setBusy(false); }}><span className={`option-dot ${agent.status}`} /><span><strong>{agent.name}</strong><small>{provider === 'claude' ? 'Claude · ' : agent.forkedFromId ? 'Branch · ' : agent.parentId ? 'Subagent · ' : ''}{agent.cwd}</small></span><Badge status={agent.status} /></button>)}
        {loading && <p className="muted" role="status">Loading {provider === 'claude' ? 'Claude' : 'Codex'} conversations…</p>}{ready && !loading && !error && !available.length && <p className="muted">No conversations found for this runtime.</p>}
      </div>{cursor && <button className="button subtle" disabled={busy || loading || !ready} onClick={() => void load(cursor)}>Load more conversations</button>}
    </> : <form className="new-agent" onSubmit={async event => {
      event.preventDefault(); if (!ready || busy) return; setBusy(true); setError('');
      const directory = cwd.trim(); setCwd(directory);
      try { const result = await api('agents', { goal, cwd: directory, provider }); select(result.id); dismiss(); }
      catch (problem) { setError((problem as Error).message); } finally { setBusy(false); }
    }}>
      <label htmlFor="goal">What should this agent achieve?</label><input id="goal" placeholder="A clear, single-line goal" value={goal} maxLength={2000} onChange={event => setGoal(event.target.value)} required />
      <label htmlFor="cwd">Working directory on the Linux host</label><input id="cwd" className="mono" placeholder="/path/to/your/project" value={cwd} onChange={event => setCwd(event.target.value)} required />
      <p className="field-note">Choose an existing absolute project directory. Surrounding whitespace is ignored; spaces inside directory names are kept. Uses the existing local {provider === 'claude' ? 'Claude' : 'Codex'} sign-in, project instructions and permission settings.</p>
      <button className="button primary" disabled={!ready || busy || state.agents.filter(agent => agent.role !== 'coordinator').length >= limits.maxWorkers}>{busy ? 'Starting…' : 'Start agent'}<Icon name="arrow" /></button>
    </form>}
  </dialog>;
}

function CoordinatorContext({ state, act, choose, heights, resize, compact }: { compact: boolean; state: Snapshot; act: (path: string, data: unknown) => Promise<boolean>; choose: (id: string) => void; heights: Record<string, number>; resize: (id: string, height: number | undefined) => void }) {
  const coordinator = state.coordinator;
  const agent = state.agents.find(agent => agent.id === coordinator?.id);
  return <aside id="overview-panel" className="context coordinator-context" aria-label="Coordinator overview">
<OverviewSections heights={heights} change={resize} sections={[
{ id: 'coordinator', label: 'Coordinator', visible: true, content: <><h2>{agent?.name || 'Coordinator'}</h2>
    <p className="field-note coordinator-guidance">Summaries and approval reviews follow your project instructions. Uncertain scope comes back to you.</p>
    <div className="button-row"><button className="button subtle small" disabled={!runtimeReady(state, 'codex')} onClick={() => void act('coordinator', { paused: !coordinator?.paused })}>{coordinator?.paused ? 'Resume coordinator' : 'Pause coordinator'}</button><button className="button subtle small" disabled={!runtimeReady(state, 'codex') || coordinator?.paused} onClick={() => void act('coordinator', { action: 'refresh' })}>Summarize now</button></div>
    {coordinator?.error && <p className="error-text" role="alert">{coordinator.error}</p>}
    </> },
{ id: 'workers', label: 'Workers', visible: true, content: <><div className="coordinator-workers">{state.agents.filter(agent => agent.role !== 'coordinator').map(agent => <CoordinatorWorkerCard key={agent.id} worker={agent} statusBadge={<Badge status={agent.status} />} choose={choose} />)}</div>
    {!!coordinator?.queuedMessages && <div className="field-note">{coordinator.queuedMessages} message(s) waiting for workers to become idle.<button className="button subtle small" onClick={() => void act('coordinator', { action: 'clear-messages' })}>Clear queued messages</button></div>}
    </> },
{ id: 'coordinator-questions', label: 'Open questions', visible: !!agent && (!compact || !!agent.questions.length || agent.status === 'attention'), content: <>{agent && <OpenQuestions agentId={agent.id} questions={agent.questions} attention={agent.status === 'attention'} />}
    </> },
{ id: 'decisions', label: 'Recent decisions and deliveries', visible: !!coordinator?.audit.length, content: <>{!!coordinator?.audit.length && <details className="coordinator-audit"><summary>Recent decisions and deliveries</summary>{coordinator.audit.slice().reverse().map((entry, index) => <div key={`${entry.at}-${index}`}><strong>{entry.decision || entry.action} · {entry.outcome.replaceAll('_', ' ')}</strong><span>{state.agents.find(agent => agent.id === entry.agentId)?.name || 'Worker'} · {new Date(entry.at).toLocaleTimeString()}</span>{entry.rationale && <p>{entry.rationale}</p>}</div>)}</details>}
  </> }
].filter(section => section.visible)} />
</aside>;
}

function App() {
  const [savedBrowser] = useState(loadBrowserWorkspace);
  const [browserError, setBrowserError] = useState(savedBrowser.error);
  const [theme, setTheme] = useState<ThemeName>(() => savedBrowser.state.theme || 'classic');
  const [taskWatches, setTaskWatches] = useState<Record<string, string[]>>(savedBrowser.state.taskWatches || {});
  const [taskAlerts, setTaskAlerts] = useState<TaskNotificationEvent[]>([]);
  const [notificationNotice, setNotificationNotice] = useState('');
  const notificationEngine = useRef(new TaskNotificationEngine());
  const openTaskAlert = useRef<(event: TaskNotificationEvent) => void>(() => {});
  useLayoutEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [compactLayout, setCompactLayout] = useState(() => window.matchMedia(compactLayoutQuery).matches);
  useEffect(() => {
    const query = window.matchMedia(compactLayoutQuery);
    const update = () => setCompactLayout(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const [overviewWidth, setOverviewWidth] = useState(() => savedBrowser.state.overviewWidth ?? Math.round(Math.max(364, Math.min(448, window.innerWidth * .322))));
  const [composerHeight, setComposerHeight] = useState<number | undefined>(savedBrowser.state.composerHeight);
  const [overviewHeights, setOverviewHeights] = useState<Record<string, number>>(savedBrowser.state.overviewHeights || {});
  const resizeOverview = (id: string, height: number | undefined) => setOverviewHeights(previous => { const next = { ...previous }; if (height === undefined) delete next[id]; else next[id] = height; return next; });
  const effectiveOverviewWidth = sidebarSize(overviewWidth, viewportWidth - 26);
  useEffect(() => { const resize = () => setViewportWidth(window.innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);

  const [authenticated, setAuthenticated] = useState<boolean | null>(null); const [state, setState] = useState<Snapshot>({ connected: false, error: null, version: VERSION, agents: [] });
  const [streamHealth, setStreamHealth] = useState<StreamHealth>({ state: 'connecting', lastSignalAt: null });
  const [receipts, setReceipts] = useState<Record<string, InputReceipt>>({});
  const [chatColours, setChatColours] = useState<Record<string, ChatColour>>(savedBrowser.state.chatColours || {});
  const [taskQuestion, setTaskQuestion] = useState<{ agentId: string; taskId: string } | null>(null);
  const [openingBackground, setOpeningBackground] = useState(false);
  const [selected, setSelected] = useState(savedBrowser.state.selected); const [drafts, setDrafts] = useState<Record<string, string>>(savedBrowser.state.drafts); const [dialog, setDialog] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(''); const [returnReviews, setReturnReviews] = useState<string[]>([]); const [taskAgent, setTaskAgent] = useState<Agent | null>(null);
  const [imageDrafts, setImageDrafts] = useState<ImageDrafts>({}); const imageDraftsRef = useRef<ImageDrafts>({});
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
  const updateImages = (update: (drafts: ImageDrafts) => ImageDrafts) => { const next = update(imageDraftsRef.current); imageDraftsRef.current = next; setImageDrafts(next); };
  const pasteImages = (files: File[], agentId: string) => {
    try {
      const added = prepareImageDrafts(imageDraftsRef.current[agentId] || [], files);
      updateImages(previous => ({ ...previous, [agentId]: [...(previous[agentId] || []), ...added] }));
      setImageErrors(previous => ({ ...previous, [agentId]: '' }));
      added.forEach((image, index) => { void Promise.resolve().then(() => readImageFile(files[index])).then(dataUrl => {
        updateImages(previous => finishImageDraft(previous, agentId, image.id, dataUrl));
      }).catch(error => {
        if (!imageDraftsRef.current[agentId]?.some(current => current.id === image.id)) return;
        updateImages(previous => removeImageDrafts(previous, agentId, [image.id]));
        setImageErrors(previous => ({ ...previous, [agentId]: (error as Error).message }));
      }); });
    } catch (error) { setImageErrors(previous => ({ ...previous, [agentId]: (error as Error).message })); }
  };
  const scroll = useRef<HTMLDivElement>(null); const positions = useRef<Record<string, number>>(savedBrowser.state.positions); const bottom = useRef<Record<string, boolean>>(savedBrowser.state.bottom); const previous = useRef(''); const nearBottom = useRef(true);
  const composerInput = useRef<HTMLTextAreaElement>(null); const focusTarget = useRef<string | null>(null);
  const approvalFocusContext = useRef<ApprovalFocusContext>({ agentId: null, blocked: true, revision: 0 });
  const interrupting = useRef(new Set<string>());
  const [tabOrder, setTabOrder] = useState<string[]>(savedBrowser.state.order);
  const browserSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const browserSave = useRef<() => void>(() => {});
  const [tabDrag, setTabDrag] = useState<TabDragState>(null);
  const orderedIds = useRef<string[]>([]); const tabStrip = useRef<HTMLDivElement>(null);
  const tabReorder = useRef<TabReorder | null>(null);
  if (!tabReorder.current) tabReorder.current = new TabReorder({
    targetAt: (x, y) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-worker-tab]')?.dataset.workerTab || null,
    commit: (source, target) => setTabOrder(reorderTabs(orderedIds.current, source, target)),
    change: setTabDrag
  });
  useEffect(() => () => tabReorder.current?.cancel(), []);
  const active = state.restoration?.status === 'restoring' ? undefined : state.agents.find(agent => agent.id === selected) || state.agents[0];
  const activeConnected = runtimeReady(state, active?.provider);
  const draftText = active ? drafts[active.id] || '' : '';
  const draftImages = active ? imageDrafts[active.id] || [] : [];
  const draftLocked = !!(active?.summarizing || active?.returning || active?.returnSummary?.delivered);
  useLayoutEffect(() => {
    approvalFocusContext.current = {
      agentId: active?.id || null,
      blocked: !authenticated || !active || active.provider === 'claude' || draftLocked
        || !!(dialog || taskAgent || taskQuestion || returnReviews.includes(active.id) || tabDrag),
      revision: approvalFocusContext.current.revision + 1
    };
  }, [active?.id, active?.provider, authenticated, draftLocked, dialog, taskAgent, taskQuestion, returnReviews, tabDrag]);
  const prepareApprovalFocus = () => captureApprovalFocus(composerInput.current, () => ({
    ...approvalFocusContext.current,
    blocked: approvalFocusContext.current.blocked || document.visibilityState === 'hidden'
      || !!document.querySelector('dialog[open], .resizing')
  }));
  const readyToSend = !!(active && activeConnected && active.canSend && hasReadyDraft(draftText, draftImages) && !busy && !draftLocked && !active.questions.length && active.status !== 'attention');
  useEffect(() => { if (authenticated === false) { imageDraftsRef.current = {}; setImageDrafts({}); setImageErrors({}); setReceipts({}); } }, [authenticated]);
  browserSave.current = () => {
    if (!authenticated || ['pending', 'restoring'].includes(state.restoration?.status || '')) return;
    const problem = saveBrowserWorkspace({ version: 1, selected: active?.id || selected, order: tabOrder, overviewWidth, overviewHeights, composerHeight, theme, taskWatches, chatColours, drafts, positions: positions.current, bottom: bottom.current });
    setBrowserError(problem);
  };
  const scheduleBrowserSave = () => { if (browserSaveTimer.current) clearTimeout(browserSaveTimer.current); browserSaveTimer.current = setTimeout(() => browserSave.current(), 250); };
  useEffect(() => { if (authenticated) scheduleBrowserSave(); }, [authenticated, active?.id, drafts, tabOrder, overviewWidth, overviewHeights, composerHeight, theme, taskWatches, chatColours, state.restoration?.status]);
  useEffect(() => {
    const flush = () => browserSave.current();
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); if (browserSaveTimer.current) clearTimeout(browserSaveTimer.current); };
  }, []);
  useEffect(() => { api('session').then(result => setAuthenticated(result.authenticated)).catch(error => { setError(error.message); setAuthenticated(false); }); }, []);
  useEffect(() => {
    if (!authenticated) return;
    api('state').then(data => setState(data)).catch(error => setError(error.message));
    const stream = new EventSource('/api/events');
    return observeWorkspaceStream(stream, data => setState(data as Snapshot), setStreamHealth, () => {
      setState(previous => ({ ...previous, connected: false }));
      api('session').then(data => { if (!data.authenticated) setAuthenticated(false); }).catch(() => {});
    });
  }, [authenticated]);
  useLayoutEffect(() => {
    const node = scroll.current; if (!node || !active) return;
    if (previous.current !== active.id) { nearBottom.current = bottom.current[active.id] !== false; node.scrollTop = nearBottom.current ? node.scrollHeight : (positions.current[active.id] ?? 0); previous.current = active.id; }
    else if (nearBottom.current) node.scrollTop = node.scrollHeight;
  }, [active?.id, active?.messages, active?.questions]);
  function focusComposer(id: string) {
    const node = composerInput.current;
    if (focusTarget.current !== id || dialog || returnReviews.includes(id) || taskAgent || !node || node.dataset.agentId !== id) return;
    focusTarget.current = null;
    if (node.disabled) return;
    node.focus({ preventScroll: true }); node.setSelectionRange(node.value.length, node.value.length);
  }
  useLayoutEffect(() => { if (active) focusComposer(active.id); }, [active?.id, dialog, returnReviews, taskAgent]);
  const choose = (id: string) => {
    if (active && scroll.current) positions.current[active.id] = scroll.current.scrollTop;
    nearBottom.current = bottom.current[id] !== false; focusTarget.current = id;
    flushSync(() => setSelected(id)); focusComposer(id);
  };
  openTaskAlert.current = event => {
    if (!authenticated || !state.agents.some(worker => worker.id === event.workerId)) return;
    choose(event.workerId);
    if (event.taskId) setTaskQuestion({ agentId: event.workerId, taskId: event.taskId });
  };
  const enableDesktopAlerts = async () => {
    const result = await requestDesktopNotifications();
    setNotificationNotice(result.notice);
  };
  const watchTask = (workerId: string, taskId: string, enabled: boolean) => {
    setTaskWatches(previous => {
      const ids = previous[workerId] || [];
      return { ...previous, [workerId]: enabled ? [...new Set([...ids, taskId])].slice(0, 128) : ids.filter(id => id !== taskId) };
    });
    // Only this explicit user gesture may request browser notification access.
    if (enabled) void enableDesktopAlerts();
  };
  useEffect(() => {
    if (!authenticated) { notificationEngine.current.reset(); setTaskAlerts([]); return; }
    const watches = Object.entries(taskWatches).flatMap(([workerId, ids]) => ids.map(taskId => ({ workerId, taskId })));
    const connected = state.connected && !['pending', 'restoring'].includes(state.restoration?.status || '');
    const events = notificationEngine.current.update(state.agents, watches, connected).map(event => ({
      id: event.id, workerId: event.workerId, taskId: event.taskId, kind: event.kind,
      title: event.taskTitle || event.workerName,
      detail: event.scope === 'worker'
        ? `${event.workerName}: ${event.kind === 'request' ? 'a new question or approval needs attention' : 'the worker encountered an error'} while you are watching its tasks. The event is not assigned to a particular task.`
        : `${event.workerName}: ${event.kind === 'completed' ? 'this task was marked completed in Beads' : event.kind === 'needs-input' ? 'this task now needs your input' : 'this task was marked failed'}.`
    }));
    if (!events.length) return;
    setTaskAlerts(previous => [...previous, ...events].slice(-20));
    if (document.visibilityState === 'hidden' || !document.hasFocus()) {
      for (const event of events) {
        const problem = showTaskDesktopNotification(event, () => openTaskAlert.current(event));
        if (problem) setNotificationNotice(problem);
      }
    }
  }, [authenticated, state, taskWatches]);
  const act = async (path: string, data: unknown) => { setError(''); try { await api(path, data); return true; } catch (error) { setError((error as Error).message); return false; } };
  const interrupt = async (id: string) => {
    if (!active || active.id !== id || !canInterrupt(active, activeConnected) || interrupting.current.has(id)) return;
    interrupting.current.add(id);
    try { await act(`agents/${id}/interrupt`, {}); }
    finally { interrupting.current.delete(id); }
  };
  useEffect(() => {
    if (!authenticated) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      handleEscapeInterrupt(event, {
        agent: active, connected: activeConnected, pending: !!active && interrupting.current.has(active.id),
        blocked: !!(dialog || taskAgent || taskQuestion || tabDrag || document.querySelector('dialog[open], .resizing'))
      }, id => { void interrupt(id); });
    };
    // Bubble after component handlers so local Escape cancellation wins.
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [authenticated, active, activeConnected, dialog, taskAgent, taskQuestion, tabDrag]);
  const navigate = async (action: 'fork' | 'parent', data: unknown = {}) => {
    if (!active) return; setError(''); setBusy('navigate');
    try { const result = await api(`agents/${active.id}/${action}`, data); choose(result.id); } catch (error) { setError((error as Error).message); } finally { setBusy(''); }
  };
  const send = async () => {
    if (!active || !readyToSend) return;
    const id = active.id; const text = draftText;
    const images = draftImages.map(image => ({ dataUrl: image.dataUrl! })); const imageIds = draftImages.map(image => image.id);
    setBusy(id);
    const accepted = await sendWithReceipt(id, () => act(`agents/${id}/message`, { text, images }), (workerId, receipt) => {
      setReceipts(previous => ({ ...previous, [workerId]: receipt }));
    });
    if (accepted) {
      setDrafts(previous => clearSubmittedDraft(previous, id, text));
      updateImages(previous => removeImageDrafts(previous, id, imageIds));
    }
    setBusy('');
  };
  if (authenticated === null) return <div className="loading-page"><Brand /><p>Opening your workspace…</p></div>;
  if (!authenticated) return <Login onLogin={() => setAuthenticated(true)} />;
  const attention = state.agents.filter(agent => agent.status === 'attention').length;
  const workerRows = state.agents.filter(agent => agent.role !== 'coordinator');
  const ids = [...tabOrder.filter(id => workerRows.some(agent => agent.id === id)), ...workerRows.map(agent => agent.id).filter(id => !tabOrder.includes(id))];
  const workers = ids.map(id => workerRows.find(agent => agent.id === id)!);
  orderedIds.current = ids;
  const moveTab = (source: string, target: string) => {
    setTabOrder(reorderTabs(ids, source, target));
  };
  const dragMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const strip = tabStrip.current;
    if (tabReorder.current?.dragging && strip) {
      const rect = strip.getBoundingClientRect();
      if (event.clientY >= rect.top && event.clientY <= rect.bottom && event.clientX >= rect.left && event.clientX <= rect.right) {
        if (event.clientX < rect.left + 24) strip.scrollLeft -= 16;
        else if (event.clientX > rect.right - 24) strip.scrollLeft += 16;
      }
    }
    tabReorder.current?.move(event);
  };
  const coordinator = state.agents.find(agent => agent.role === 'coordinator');
  const tab = (agent: Agent, index: number) => <div className={`tab-wrap ${agent.status} ${active?.id === agent.id ? 'active' : ''} ${agent.role === 'coordinator' ? 'coordinator-tab' : ''} ${tabDrag?.source === agent.id ? 'drag-source' : ''} ${tabDrag?.target === agent.id && tabDrag.source !== agent.id ? (ids.indexOf(tabDrag.source) < index ? 'drop-after' : 'drop-before') : ''}`} key={agent.id} data-worker-tab={agent.role !== 'coordinator' ? agent.id : undefined}><button role="tab" aria-selected={active?.id === agent.id} aria-controls="agent-panel" className="agent-tab" aria-label={`${agent.name}: ${labels[agent.status]}`} draggable={false} onDragStart={event => event.preventDefault()} onPointerDown={event => { tabReorder.current?.consumeClick(1); if (agent.role !== 'coordinator') tabReorder.current?.down(event, agent.id); }} onPointerMove={dragMove} onPointerUp={event => tabReorder.current?.up(event)} onPointerCancel={event => tabReorder.current?.cancel(event)} onLostPointerCapture={event => tabReorder.current?.cancel(event)} onClick={event => { if (tabReorder.current?.consumeClick(event.detail)) { event.preventDefault(); return; } choose(agent.id); }} onKeyDown={event => { if (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key) && agent.role !== 'coordinator') { event.preventDefault(); const other = workers[index + (event.key === 'ArrowLeft' ? -1 : 1)]; if (other) moveTab(agent.id, other.id); } }} title={`${agent.goal} · ${labels[agent.status]}`}><span className="tab-number">{agent.role === 'coordinator' ? <Icon name="compass" size={16} /> : agent.parentId ? <Icon name="branch" size={12} /> : agent.provider === 'claude' ? 'CL' : String(index + 1).padStart(2, '0')}</span><i className="status-dot" /><span className="tab-text"><strong>{agent.role === 'coordinator' ? <><span className="coordinator-name">Coordinator</span><span className="coordinator-short" aria-hidden="true">Coord</span></> : agent.name}</strong></span></button>{agent.role !== 'coordinator' && active?.id === agent.id && workers.length > 1 && <span className="tab-order-controls"><button className="tab-move" disabled={index === 0} aria-label={`Move ${agent.name} tab left`} title="Move tab left (Alt + Left)" onClick={() => moveTab(agent.id, workers[index - 1].id)}>←</button><button className="tab-move" disabled={index === workers.length - 1} aria-label={`Move ${agent.name} tab right`} title="Move tab right (Alt + Right)" onClick={() => moveTab(agent.id, workers[index + 1].id)}>→</button></span>}{agent.role !== 'coordinator' && <button className="tab-close" aria-label={`Close ${agent.name} tab; agent keeps running`} title="Close tab; agent keeps running" onClick={() => void act(`agents/${agent.id}/close`, {})}><Icon name="close" size={13} /></button>}</div>;
  return <div className="app-shell" style={{ '--overview-width': `${effectiveOverviewWidth}px` } as React.CSSProperties}>
    <header className="topbar">
      <div className="tabs-row">
        <div className={`tabs ${tabDrag ? 'reordering' : ''}`} ref={tabStrip} role="tablist" aria-label="Worker agents">{workers.map(tab)}</div>
        {state.coordinator && <div className="coordinator-tab-group" role="tablist" aria-label="Workspace coordinator">{coordinator ? tab(coordinator, 0) : <div className={`tab-wrap coordinator-tab ${state.coordinator.error ? 'error' : ''}`}><button className="agent-tab" disabled={!runtimeReady(state, 'codex') || state.coordinator.starting || !workers.length} onClick={() => void act('coordinator', {})}><span className="tab-number"><Icon name="compass" size={16} /></span><span className="tab-text"><strong>{state.coordinator.starting ? 'Starting coordinator…' : state.coordinator.error ? 'Retry coordinator' : 'Coordinator'}</strong></span></button></div>}</div>}
      </div>
      <div className="overview-header">
        <div className="agent-create-group" role="group" aria-label="Agent controls">
          <button className="new-tab" disabled={!state.connected || workers.length >= limits.maxWorkers} onClick={() => setDialog(true)} aria-label="Add agent" title="Open an existing agent or start a new one"><Icon name="plus" /><span>Add agent</span></button>
          <span className={`agent-count ${attention ? 'needs-attention' : ''}`} title={`${workers.length} of ${limits.maxWorkers} workers open${coordinator ? ' plus coordinator' : ''}${attention ? ` · ${attention} need attention` : ''}`}>{workers.length}<span>/{limits.maxWorkers}</span>{attention > 0 && <i aria-label={`${attention} need attention`} />}</span>
        </div>
        <div className="topbar-right">
          <span className={`connection ${state.connected ? 'connected' : ''}`} title={`Codex: ${state.codexConnected ?? state.connected ? 'connected' : 'disconnected'} · Claude: ${state.claudeAvailable ? 'available' : 'unavailable'}`} aria-label={state.connected ? 'Local agent runtime available' : 'Agent runtimes disconnected'}><span />{state.connected ? 'Local agents available' : 'Agents disconnected'}</span>
          <ThemeSwitcher theme={theme} onChange={setTheme} />
        </div>
        <Brand />
        <button className="icon-button logout-button" aria-label="Sign out" title="Sign out" onClick={async () => { if (await act('logout', {})) setAuthenticated(false); }}><Icon name="logout" /></button>
      </div>
    </header>
    <main className="workspace" aria-label="Agent workspace">
      {!state.connected && <div className="connection-banner" role="status"><span>{state.error || 'The live connection is unavailable.'}</span><button className="button subtle small" onClick={() => void act('connect', {})}><Icon name="refresh" />Reconnect</button></div>}
      {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Dismiss error"><Icon name="close" /></button></div>}
      <BackgroundRequests workers={(state.backgroundWorkers || []).filter(worker => !state.agents.some(agent => agent.id === worker.id))} available={provider => runtimeReady(state, provider)} opening={openingBackground} full={workers.length >= limits.maxWorkers} open={async id => { if (openingBackground) return; setOpeningBackground(true); try { if (await act(`agents/${id}/open`, {})) choose(id); } finally { setOpeningBackground(false); } }} />
      {state.restoration?.status === 'restoring' && <div className="connection-banner" role="status">Restoring your open conversations…</div>}
      {active?.observeError && <div className="error-banner" role="alert">This conversation could not be refreshed: {active.observeError}</div>}
      {state.restoration?.error && <div className="error-banner" role="alert">{state.restoration.error}</div>}
      {!!state.restoration?.warnings.length && <div className="connection-banner" role="status">Some saved conversations could not be restored. Other tabs remain available.</div>}
      {browserError && <div className="connection-banner" role="status">{browserError}</div>}
      {state.nativeWarning && <div className="connection-banner" role="alert">Codex warning: {state.nativeWarning}</div>}
      {active?.nativeWarning && <div className="connection-banner" role="alert">Codex warning · {active.name}: {active.nativeWarning}</div>}
      <TaskNotificationAlerts events={taskAlerts.filter(event => state.agents.some(worker => worker.id === event.workerId))} open={event => openTaskAlert.current(event)} dismiss={id => setTaskAlerts(previous => previous.filter(event => event.id !== id))} />
      <section className="workspace-frame">
        {state.restoration?.status === 'restoring' ? <div className="workspace-restoring" role="status">Restoring your conversations…</div> : active ? <div id="agent-panel" role="tabpanel" className="agent-panel"><SidebarDivider width={effectiveOverviewWidth} panelWidth={viewportWidth - 26} change={setOverviewWidth} />{active.role === 'coordinator' ? <CoordinatorContext compact={compactLayout} state={state} act={act} choose={choose} heights={overviewHeights} resize={resizeOverview} /> : <aside id="overview-panel" className="context" aria-label="Project, current tasks and open questions">
<OverviewSections heights={overviewHeights} change={resizeOverview} sections={[
{ id: 'goal', label: 'Project', visible: true, content: <><div className="goal-row"><h2 title={active.name}>{active.name}</h2><Badge status={active.status} /></div></> },
{ id: 'branch', label: 'Branch', visible: !!active.parentId, content: <>{active.parentId && <div className="branch-context"><button className="parent-link" onClick={() => void navigate('parent')} disabled={busy === 'navigate'}><Icon name="branch" size={14} />Back to parent<span>{state.agents.find(agent => agent.id === active.parentId)?.name || 'Parent chat'}</span></button><button className="button subtle small" disabled={!activeConnected || active.status !== 'idle' || active.summarizing || active.returning} onClick={() => { flushSync(() => setReturnReviews(ids => ids.includes(active.id) ? ids : [...ids, active.id])); if (scroll.current) { nearBottom.current = false; bottom.current[active.id] = false; scroll.current.scrollTop = 0; } }}>Return summary<Icon name="arrow" size={13} /></button></div>}</> },
{ id: 'recap', label: 'Coordinator recap', visible: !!active.progress, content: active.progress ? <ProgressRecap progress={active.progress} /> : null },
{ id: 'tasks', label: 'Tasks', visible: true, content: <><div className="task-summary">
  <div className="task-heading"><span className="context-label" title={active.tracker?.status === 'ready' ? `${active.taskCount} current Beads tasks` : 'Beads task count unavailable'}>TASKS <small className="task-source">BEADS</small></span>
    {active.tracker?.status === 'ready' && <TaskTotals total={active.taskCount} counts={active.taskCounts} />}
    <button className="task-link-button" onClick={() => setTaskAgent(active)}>Link tasks</button>
  </div>
  <TaskListViewport key={active.id}>{active.tasks.length ? active.tasks.map(task => <div className="task-row task-row-notifiable" key={task.id} title={`${task.id}${task.parentId ? ` · parent ${task.parentId}` : ''}`}>
    <span className={`task-indicator ${task.displayState || task.state}`}>{task.state === 'completed' ? <Icon name="check" size={12} /> : task.worker ? <Icon name="branch" size={10} /> : null}</span>
    <span><TaskInputLink task={task} open={taskId => setTaskQuestion({ agentId: active.id, taskId })} /></span>
    <small className="task-state">{(task.displayState || task.state) === 'blocked' ? 'needs input' : (task.displayState || task.state).replace(/([A-Z])/g, ' $1').replaceAll('_', ' ').toLowerCase()}</small>
    <TaskNotifyToggle taskTitle={task.text} checked={!!taskWatches[active.id]?.includes(task.id)} onChange={enabled => watchTask(active.id, task.id, enabled)} />
  </div>) : <div className="task-row empty-task"><span className="task-indicator" /><span>{!active.tracker ? 'Reading Beads tasks…' : active.tracker.status === 'unavailable' ? 'Beads tracker unavailable.' : active.tracker.tasks.length ? 'All linked tasks are closed.' : 'No linked tasks. Link existing work or ask the agent to create it.'}</span></div>}</TaskListViewport>
  {!!taskWatches[active.id]?.length && <div className="task-notification-settings"><button type="button" className="task-link-button" onClick={() => void enableDesktopAlerts()}>Enable desktop alerts</button><span className="field-note">Alerts work while CCNG is open.</span></div>}
  {notificationNotice && <p className="field-note" role="status">{notificationNotice}</p>}
  {active.tracker?.error && <details className="tracker-error"><summary>Tracker details</summary><p>{active.tracker.error}</p></details>}
</div></> },
{ id: 'questions', label: 'Open questions', visible: !compactLayout || !!active.questions.length || active.status === 'attention', content: <><OpenQuestions agentId={active.id} questions={active.questions} attention={active.status === 'attention'} provider={active.provider} /></> },
{ id: 'settings', label: 'Worker specific settings', visible: true, content: <><WorkerSettings key={active.id} compact={compactLayout} agentId={active.id} minutes={active.reportIntervalMinutes} reportState={active.reportState} settingPending={active.reportSettingPending} disabled={!activeConnected || !active.canSend} paused={!!state.coordinator?.paused} error={active.reportError} save={minutes => act(`agents/${active.id}/report-settings`, { minutes })} reportNow={() => act(`agents/${active.id}/report`, {})}><WorkerModelSettings key={active.id} agentId={active.id} connected={activeConnected && active.canSend && active.modelSettingsAvailable !== false} currentModel={active.model} currentEffort={active.reasoningEffort} change={active.modelChange} load={() => api(`agents/${active.id}/model-settings`)} save={choice => api(`agents/${active.id}/model-settings`, choice)} />{active.provider === 'claude' && active.modelSettingsAvailable === false && active.canSend && <p className="field-note">Start this session here to load its model settings.</p>}</WorkerSettings></> }
].filter(section => section.visible)} />
</aside>}

          <div className="conversation" ref={scroll} onScroll={event => { const node = event.currentTarget; nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90; if (active) { positions.current[active.id] = node.scrollTop; bottom.current[active.id] = nearBottom.current; scheduleBrowserSave(); } }}>{(active.managementNotice || active.observeError) && <p className="field-note session-notice" role="status">{active.managementNotice || active.observeError}</p>}{returnReviews.map(id => state.agents.find(agent => agent.id === id)).filter((agent): agent is Agent => !!agent).map(branch => <BranchSummaryReview key={branch.id} agent={branch} visible={active.id === branch.id} connected={runtimeReady(state, branch.provider)} parentName={state.agents.find(agent => agent.id === branch.parentId)?.name || 'Parent chat'} prepare={() => api(`agents/${branch.id}/summary`, {})} deliver={text => api(`agents/${branch.id}/return`, { text })} openParent={async () => { const result = await api(`agents/${branch.id}/parent`, {}); choose(result.id); }} dismiss={() => setReturnReviews(ids => ids.filter(id => id !== branch.id))} returned={parentId => { setReturnReviews(ids => ids.filter(id => id !== branch.id)); if (previous.current === branch.id) choose(parentId); }} />)}{active.olderCursor && <button className="older-button" onClick={() => void act(`agents/${active.id}/history`, { cursor: active.olderCursor })}>Load earlier messages</button>}{!active.messages.some(isVisibleMessage) && <div className="conversation-empty"><Icon name="chat" size={30} /><h3>A clear goal. A fresh start.</h3><p>Send a message to begin this conversation.</p></div>}{groupMessages(active.messages).map(group => { if (group.kind === 'activity') return <ActivityGroup key={group.id} messages={group.items} />; const message = group.message; return <article className={`message ${message.type}`} key={message.id}><div className="message-avatar">{message.type === 'user' ? 'Y' : <span className="mini-mark">✳</span>}</div><div className="message-body"><div className="message-author">{message.text.startsWith('[Command Center coordinator]') || (message.type === 'assistant' && active.role === 'coordinator') ? 'Coordinator' : message.type === 'user' ? 'You' : active.provider === 'claude' ? 'Claude' : 'Codex'}<MessageTime timestamp={message.timestamp} source={message.timestampSource} />{message.state === 'inProgress' && <span className="writing">writing</span>}<span className="message-actions">{!!message.text.trim() && <CopyButton text={message.text} />}{active.role !== 'coordinator' && active.canBranch !== false && message.type === 'assistant' && message.branchable && <button className="message-branch" title="Branch with context through this completed reply" disabled={!activeConnected || state.agents.filter(agent => agent.role !== 'coordinator').length >= limits.maxWorkers || busy === 'navigate'} onClick={() => void navigate('fork', { lastTurnId: message.turnId })}><Icon name="branch" size={12} />Branch here</button>}</span></div>{!!message.text && <Text value={message.text} />}<MessageImages images={message.images || []} agentId={active.id} messageId={message.id} /></div></article>; })}{active.questions.map(question => <NativeRequestCard key={questionTarget(active.id, question.id)} question={question} agentId={active.id} workerName={active.name} readOnlyCoordinator={active.role === 'coordinator'} act={act} prepareApprovalFocus={active.provider === 'claude' ? undefined : prepareApprovalFocus} />)}{active.status === 'attention' && !active.questions.length && <RequestRecovery key={active.id} recovering={!!active.recoveringRequests} error={active.requestError} disabled={!activeConnected} provider={active.provider} recover={() => api(`agents/${active.id}/requests`, {})} />}</div>
          <ResizableComposer workerId={active.id} compact={compactLayout} height={composerHeight} change={setComposerHeight} onSubmit={event => { event.preventDefault(); void send(); }}><ChatHeader id={active.id} name={active.name} colour={chatColours[active.id] || 'cyan'} changeColour={(id, colour) => setChatColours(previous => ({ ...previous, [id]: colour }))}>{active.provider !== 'claude' && <WorkerStatus key={active.id} worker={active} receipt={receipts[active.id]} stream={streamHealth} runtimeConnected={activeConnected} />}</ChatHeader><div className="composer-box"><ImageDraftPreviews images={draftImages} error={imageErrors[active.id]} disabled={draftLocked} remove={imageId => { updateImages(previous => removeImageDrafts(previous, active.id, [imageId])); setImageErrors(previous => ({ ...previous, [active.id]: '' })); }} /><ChatDraft inputRef={composerInput} agentId={active.id} name={active.name} placeholder={active.summarizing ? 'Preparing the branch summary…' : active.questions.length || active.status === 'attention' ? 'Draft your next message while answering the question…' : 'A follow-up, a direction, a pasted image…'} text={draftText} onChange={text => setDrafts(previous => ({ ...previous, [active.id]: text }))} onPasteImages={pasteImages} onSubmit={() => void send()} canSubmit={readyToSend} disabled={draftLocked} /><div className="composer-controls"><span>{active.questions.length || active.status === 'attention' ? 'You can draft · answer the question to send' : <><kbd>Enter</kbd> send <span className="composer-separator">·</span><kbd>Shift Enter</kbd> new line</>}</span><div>{active.role !== 'coordinator' && active.canBranch !== false && <button type="button" className="button branch-button small" disabled={!activeConnected || !active.messages.length || state.agents.filter(agent => agent.role !== 'coordinator').length >= limits.maxWorkers || busy === 'navigate'} title={state.agents.filter(agent => agent.role !== 'coordinator').length >= limits.maxWorkers ? 'Close a tab to make room for a branch' : 'Branch from the current conversation, including the ongoing exchange'} onClick={() => void navigate('fork')}><Icon name="branch" size={14} />Branch chat</button>}{active.status === 'running' || active.status === 'attention' ? <button type="button" className="button interrupt small" onClick={() => void interrupt(active.id)} disabled={!canInterrupt(active, activeConnected)} title="Interrupt the visible agent (Escape)" aria-keyshortcuts="Escape"><Icon name="stop" size={14} />Interrupt <kbd>Esc</kbd></button> : null}<button type="submit" className="send-button" aria-label="Send message" disabled={!readyToSend}><Icon name="arrow" /></button></div></div></div><div className="composer-foot"><span>Local {active.provider === 'claude' ? 'Claude' : 'Codex'} workspace</span><span className="version">v{VERSION}</span></div></ResizableComposer></div> : <div className="empty-workspace"><div className="empty-glyph"><Icon name="branch" size={36} /></div><div className="eyebrow">ONE PLACE TO PICK UP THE THREAD</div><h2>Your agents. In focus.</h2><p>Open a running conversation or start something new.<br />Keep up to {limits.maxWorkers} agents close, without losing your place.</p><button className="button primary" disabled={!state.connected} onClick={() => setDialog(true)}><Icon name="plus" />Add your first agent</button><div className="empty-legend"><Badge status="running" /><Badge status="attention" /><Badge status="idle" /></div></div>}
      </section>
    </main>{dialog && <AgentDialog state={state} dismiss={() => setDialog(false)} act={act} select={choose} />}
    {taskQuestion && state.agents.some(agent => agent.id === taskQuestion.agentId) && (() => { const worker = state.agents.find(agent => agent.id === taskQuestion.agentId)!; return <TaskDiscussion key={`${worker.id}:${taskQuestion.taskId}`} taskId={taskQuestion.taskId} workerName={worker.name} canSend={runtimeReady(state, worker.provider) && worker.canSend && worker.status !== 'attention' && !worker.questions.length && !worker.summarizing && !worker.returning && !worker.returnSummary?.delivered} load={() => api(`agents/${worker.id}/tasks/${encodeURIComponent(taskQuestion.taskId)}`)} send={text => act(`agents/${worker.id}/message`, { text })} dismiss={() => setTaskQuestion(null)} />; })()}
    {taskAgent && <TaskDialog key={taskAgent.id} agent={taskAgent} dismiss={() => { choose(taskAgent.id); setTaskAgent(null); }} saved={() => { choose(taskAgent.id); setTaskAgent(null); }} />}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
