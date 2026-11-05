import React from 'react';

export function formatMessageTime(timestamp?: string, timeZone?: string) {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return null;
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(timeZone ? { timeZone } : {}) }).format(new Date(timestamp));
}

export function MessageTime({ timestamp, source }: { timestamp?: string; source?: 'native' | 'received' }) {
  const label = formatMessageTime(timestamp);
  const title = label ? `${source === 'received' ? 'First received by Command Center' : 'Recorded by the agent runtime'} · ${new Date(timestamp!).toLocaleString()}` : 'Message time unavailable in the recorded history';
  return <span className="message-time" title={title}><span aria-hidden="true">|</span>{label ? <time dateTime={timestamp}>{label}</time> : <span aria-label="Message time unavailable">—</span>}</span>;
}
