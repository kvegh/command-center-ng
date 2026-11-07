import React, { useEffect, useState } from 'react';

export type InputReceipt = { state: 'sending' | 'received' | 'unconfirmed'; at: number };
export type StreamHealth = { state: 'connecting' | 'connected' | 'reconnecting'; lastSignalAt: number | null };
export type WorkerActivity = {
  status: string; questions: unknown[];
  finishedTurn?: { status: string };
  lastNativeEventAt?: string;
};

// HTTP success follows native turn/start or turn/steer acknowledgement. It
// establishes acceptance by the runtime, not understanding by the model.
export async function sendWithReceipt(id: string, send: () => Promise<boolean>, update: (id: string, receipt: InputReceipt) => void, now = Date.now) {
  update(id, { state: 'sending', at: now() });
  try {
    const accepted = await send();
    update(id, { state: accepted ? 'received' : 'unconfirmed', at: now() });
    return accepted;
  } catch (error) {
    update(id, { state: 'unconfirmed', at: now() });
    throw error;
  }
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

export function workerStatusView(worker: WorkerActivity, stream: StreamHealth, runtimeConnected: boolean, now: number) {
  // Three missed 15-second heartbeats make updates uncertain, not proof of a
  // stuck agent. No interruption, resend or restart follows this label.
  const fresh = stream.state === 'connected' && stream.lastSignalAt !== null && now - stream.lastSignalAt < 45_000;
  const connected = fresh && runtimeConnected;
  const connection = stream.state === 'connecting' ? 'Connecting to CCNG'
    : stream.state === 'reconnecting' ? 'CCNG reconnecting'
    : !fresh ? 'Connection unconfirmed'
    : !runtimeConnected ? 'Codex disconnected' : 'Connected';
  const activity = worker.questions.length || worker.status === 'attention' ? 'Needs your answer'
    : worker.status === 'running' ? 'Working'
    : worker.status === 'error' || worker.finishedTurn?.status === 'failed' ? 'Error'
    : worker.status === 'offline' ? 'Offline'
    : worker.finishedTurn?.status === 'interrupted' ? 'Stopped'
    : worker.finishedTurn?.status === 'completed' ? 'Finished' : 'Idle';
  const lastUpdate = Date.parse(worker.lastNativeEventAt || '');
  const elapsed = Number.isFinite(lastUpdate) ? Math.max(0, Math.floor((now - lastUpdate) / 1000)) : null;
  const age = elapsed === null ? null : elapsed < 60 ? `${elapsed}s` : elapsed < 3600 ? `${Math.floor(elapsed / 60)}m` : `${Math.floor(elapsed / 3600)}h`;
  return {
    connection, connected,
    activity: connected ? activity : `Last known: ${activity}`,
    working: connected && activity === 'Working',
    attention: activity === 'Needs your answer' || activity === 'Error',
    age: age === null ? 'Last agent update unknown' : `Last agent update ${age} ago`,
  };
}

export function WorkerStatus({ worker, receipt, stream, runtimeConnected }: {
  worker: WorkerActivity; receipt?: InputReceipt; stream: StreamHealth; runtimeConnected: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);
  const view = workerStatusView(worker, stream, runtimeConnected, now);
  const receiptLabel = receipt?.state === 'sending' ? 'Sending…' : receipt?.state === 'received' ? 'Input received' : receipt ? 'Input not confirmed' : null;
  return <div className="worker-status">
    <span className={`worker-status-state ${view.working ? 'working' : ''} ${view.attention ? 'attention' : ''}`} role="status">
      <i aria-hidden="true" />{receiptLabel && <span title={receipt?.state === 'received' ? 'The native runtime accepted your input.' : receipt?.state === 'unconfirmed' ? 'Delivery could not be confirmed. Your draft is retained; check the conversation before retrying.' : undefined}>{receiptLabel}<span aria-hidden="true"> · </span></span>}{view.activity}
    </span>
    <span className={`worker-status-connection ${view.connected ? 'connected' : ''}`} role="status">{view.connection}</span>
    <span className="worker-status-age" aria-live="off">{view.age}</span>
  </div>;
}
