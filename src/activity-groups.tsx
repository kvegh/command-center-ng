import React from 'react';

type ActivityMessage = { id: string; type: 'user' | 'assistant' | 'activity'; text: string; state: string };
type MessageGroup<T> = { kind: 'message'; id: string; message: T } | { kind: 'activity'; id: string; items: T[] };

export function groupMessages<T extends ActivityMessage>(messages: T[]): MessageGroup<T>[] {
  const groups: MessageGroup<T>[] = [];
  for (const message of messages) {
    const last = groups.at(-1);
    if (message.type !== 'activity') groups.push({ kind: 'message', id: message.id, message });
    else if (last?.kind === 'activity') last.items.push(message);
    else groups.push({ kind: 'activity', id: message.id, items: [message] });
  }
  return groups;
}

function activityStatus(messages: ActivityMessage[]) {
  const counts = { failed: 0, running: 0, stopped: 0, completed: 0, other: 0 };
  for (const message of messages) {
    const state = message.state.replace(/[ _-]/g, '').toLowerCase();
    if (['failed', 'error', 'declined'].includes(state)) counts.failed++;
    else if (['inprogress', 'running', 'started', 'pending'].includes(state)) counts.running++;
    else if (['interrupted', 'cancelled', 'canceled'].includes(state)) counts.stopped++;
    else if (['completed', 'succeeded', 'success'].includes(state)) counts.completed++;
    else counts.other++;
  }
  const tone = counts.failed ? 'failed' : counts.running ? 'running' : counts.stopped ? 'stopped' : counts.other ? 'neutral' : 'completed';
  const labels = Object.entries(counts).filter(([, count]) => count).map(([state, count]) => `${count} ${state === 'other' ? 'updates' : state}`);
  return { tone, label: labels.join(' · ') };
}

export function ActivityGroup({ messages }: { messages: ActivityMessage[] }) {
  if (!messages.length) return null;
  const status = activityStatus(messages);
  return <details className={`activity-group ${status.tone}`}>
    <summary>
      <svg className="activity-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 2 4 4-4 4" /></svg>
      <span className="activity-dot" aria-hidden="true" />
      <span>{messages.length} {messages.length === 1 ? 'action' : 'actions'}</span>
      <small>{status.label}</small>
    </summary>
    <div className="activity-entries">{messages.map(message => <details key={message.id} className="activity-message">
      <summary><span className="activity-dot" aria-hidden="true" /><span>{message.text.split('\n')[0] || 'Action'}</span><small>{message.state}</small></summary>
      <pre><code>{message.text}</code></pre>
    </details>)}</div>
  </details>;
}
