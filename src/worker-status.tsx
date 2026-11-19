import React, { useEffect, useState } from 'react';
import type { TabAttention } from './tab-attention';

export type InputReceipt = { state: 'sending' | 'queued' | 'received' | 'unconfirmed'; at: number; messageId?: string };
export type StreamHealth = { state: 'connecting' | 'connected' | 'reconnecting'; lastSignalAt: number | null };
export type NativeToolActivity = { name: string; description?: string; requestedAt?: string; requestedAtSource?: 'native' | 'received'; lastProgressAt?: string; elapsedSeconds?: number };
export type WorkerActivity = {
  provider?: 'claude' | 'codex' | 'mistral'; turnId?: string | null;
  messages?: { id: string; nativeMessageId?: string; turnId: string; state: string; nativeTool?: NativeToolActivity; inputState?: 'queued' | 'received' | 'unconfirmed' }[];
  status: string; ownStatus?: string; questions: unknown[];
  finishedTurn?: { status: string };
  lastNativeEventAt?: string;
};

// HTTP success follows native turn/start or turn/steer acknowledgement. It
// establishes acceptance by the runtime, not understanding by the model.
export async function sendWithReceipt(id: string, send: () => Promise<boolean | { accepted: boolean; messageId?: string; queued?: boolean }>, update: (id: string, receipt: InputReceipt) => void, now = Date.now) {
  update(id, { state: 'sending', at: now() });
  try {
    const result = await send(), accepted = typeof result === 'boolean' ? result : result.accepted;
    update(id, { state: accepted ? typeof result === 'object' && result.queued ? 'queued' : 'received' : 'unconfirmed', at: now(), ...(typeof result === 'object' && result.messageId ? { messageId: result.messageId } : {}) });
    return accepted;
  } catch (error) {
    update(id, { state: 'unconfirmed', at: now() });
    throw error;
  }
}

function duration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return value < 60 ? `${value}s` : value < 3600 ? `${Math.floor(value / 60)}m ${value % 60}s` : `${Math.floor(value / 3600)}h ${Math.floor(value % 3600 / 60)}m`;
}

export function claudeToolView(worker: WorkerActivity, now: number) {
  const tools = (worker.messages || []).filter(message => message.turnId === worker.turnId && message.state === 'inProgress' && message.nativeTool);
  const tool = tools.at(-1)?.nativeTool;
  if (!tool) return null;
  const progress = Date.parse(tool.lastProgressAt || ''), requested = Date.parse(tool.requestedAt || '');
  const details = [tool.description,
    Number.isFinite(requested) ? `${tool.requestedAtSource === 'native' ? 'Requested' : 'First seen'} ${duration((now - requested) / 1000)} ago` : 'Tool start time unknown',
    Number.isFinite(progress) ? `Last tool progress ${duration((now - progress) / 1000)} ago` : 'Tool execution progress not yet confirmed',
    Number.isFinite(tool.elapsedSeconds) && tool.elapsedSeconds! >= 0 ? `Reported run time ${duration(tool.elapsedSeconds!)}` : null
  ].filter(Boolean).join(' · ');
  return { activity: `${Number.isFinite(progress) ? 'Running' : 'Waiting on'} ${tool.name}${tools.length > 1 ? ` (${tools.length} tools pending)` : ''}`, details };
}

export function inputReceiptLabel(worker: WorkerActivity, receipt?: InputReceipt) {
  const managedLocal = worker.provider === 'claude' || worker.provider === 'mistral';
  const identity = (message: NonNullable<WorkerActivity['messages']>[number]) => worker.provider === 'mistral' ? message.id : message.nativeMessageId;
  const latest = !receipt && managedLocal ? worker.messages?.filter(message => message.inputState && identity(message)).at(-1) : undefined;
  const messageId = receipt?.messageId || (latest && identity(latest));
  if (!receipt && !messageId) return null;
  if (receipt?.state === 'sending') return 'Sending…';
  if (receipt?.state === 'unconfirmed') return 'Input not confirmed';
  if (!managedLocal) return receipt?.state === 'received' ? 'Input received' : 'Input queued';
  const message = messageId && worker.messages?.find(message => identity(message) === messageId);
  const provider = worker.provider === 'mistral' ? 'Mistral' : 'Claude';
  return message && message.inputState === 'received' ? `Received by ${provider}` : message && message.inputState === 'unconfirmed' ? 'Input not confirmed' : `Queued for ${provider}`;
}

// Heartbeats confirm browser/backend transport only. They never become chat
// messages or refresh the worker's native activity timestamp.
export function observeWorkspaceStream(stream: EventSource, snapshot: (value: unknown) => void, health: (value: StreamHealth) => void, failed: () => void, now = Date.now) {
  health({ state: 'connecting', lastSignalAt: null });
  const signal = () => health({ state: 'connected', lastSignalAt: now() });
  const message = (event: MessageEvent) => { snapshot(JSON.parse(event.data)); signal(); };
  const disconnected = () => { health({ state: 'reconnecting', lastSignalAt: null }); failed(); };
  stream.addEventListener('open', signal);
  stream.addEventListener('message', message);
  stream.addEventListener('heartbeat', signal);
  stream.addEventListener('error', disconnected);
  return () => {
    stream.removeEventListener('open', signal);
    stream.removeEventListener('message', message);
    stream.removeEventListener('heartbeat', signal);
    stream.removeEventListener('error', disconnected);
    stream.close();
  };
}

export function workerStatusView(worker: WorkerActivity, stream: StreamHealth, runtimeConnected: boolean, now: number, presentation?: TabAttention) {
  // Three missed 15-second heartbeats make updates uncertain, not proof of a
  // stuck agent. No interruption, resend or restart follows this label.
  const fresh = stream.state === 'connected' && stream.lastSignalAt !== null && now - stream.lastSignalAt < 45_000;
  const connected = fresh && runtimeConnected;
  const connection = stream.state === 'connecting' ? 'Connecting to CCNG'
    : stream.state === 'reconnecting' ? 'CCNG reconnecting'
    : !fresh ? 'Connection unconfirmed'
    : !runtimeConnected ? worker.provider === 'claude' ? 'Claude unavailable' : worker.provider === 'mistral' ? 'Mistral unavailable' : 'Codex disconnected' : worker.provider === 'claude' ? 'CCNG connected' : 'Connected';
  const ownStatus = worker.ownStatus ?? worker.status;
  const ordinaryActivity = worker.questions.length ? 'Needs your answer'
    : ownStatus === 'attention' ? 'Request details unavailable'
    : ownStatus === 'running' ? 'Working'
    : ownStatus === 'error' || worker.finishedTurn?.status === 'failed' ? 'Error'
    : ownStatus === 'offline' ? 'Offline'
    : worker.finishedTurn?.status === 'interrupted' ? 'Stopped'
    : worker.finishedTurn?.status === 'completed' ? 'Finished' : 'Idle';
  const hasPresentation = presentation && (presentation.needsUser || presentation.awaitingCoordinator || presentation.confirming || presentation.label === 'Request details unavailable');
  const tool = worker.provider === 'claude' && ownStatus === 'running' && !worker.questions.length && !hasPresentation ? claudeToolView(worker, now) : null;
  const activity = hasPresentation ? presentation.label : tool?.activity || ordinaryActivity;
  const lastUpdate = Date.parse(worker.lastNativeEventAt || '');
  const elapsed = Number.isFinite(lastUpdate) ? Math.max(0, Math.floor((now - lastUpdate) / 1000)) : null;
  const age = elapsed === null ? null : elapsed < 60 ? `${elapsed}s` : elapsed < 3600 ? `${Math.floor(elapsed / 60)}m` : `${Math.floor(elapsed / 3600)}h`;
  return {
    connection, connected,
    activity: connected ? activity : `Last known: ${activity}`,
    working: connected && (activity === 'Working' || !!tool),
    attention: presentation ? presentation.needsUser || activity === 'Error' : activity === 'Needs your answer' || activity === 'Error',
    age: age === null ? 'Last agent update unknown' : `Last agent update ${age} ago`,
    details: tool ? `${connected ? '' : 'Last known tool: '}${tool.details}` : null,
  };
}

export function WorkerStatus({ worker, receipt, stream, runtimeConnected, presentation }: {
  worker: WorkerActivity; receipt?: InputReceipt; stream: StreamHealth; runtimeConnected: boolean;
  presentation?: TabAttention;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);
  const view = workerStatusView(worker, stream, runtimeConnected, now, presentation);
  const receiptLabel = inputReceiptLabel(worker, receipt);
  return <div className="worker-status">
    <span className={`worker-status-state ${view.working ? 'working' : ''} ${view.attention ? 'attention' : ''}`} role="status">
      <i aria-hidden="true" />{receiptLabel && <span title={worker.provider === 'claude' ? 'Queued means CCNG handed input to the Claude input stream. Received means its exact native echo arrived; neither confirms model processing.' : worker.provider === 'mistral' ? 'Queued means CCNG wrote input to the native Vibe transport. Received means the native prompt returned; neither confirms that the requested work succeeded.' : receipt?.state === 'received' ? 'The native runtime accepted your input.' : receipt?.state === 'unconfirmed' ? 'Delivery could not be confirmed. Your draft is retained; check the conversation before retrying.' : undefined}>{receiptLabel}<span aria-hidden="true"> · </span></span>}{view.activity}
    </span>
    <span className={`worker-status-connection ${view.connected ? 'connected' : ''}`} role="status">{view.connection}</span>
    <span className="worker-status-age" aria-live="off">{view.age}</span>
    {view.details && <span className="worker-status-detail" aria-live="off">{view.details}</span>}
  </div>;
}
