import React from 'react';
import { formatMessageTime } from './message-time';

export function TaskPingSchedule({ nextAt, paused, running, connected }: {
  nextAt?: string | null; paused: boolean; running: boolean; connected: boolean;
}) {
  const time = formatMessageTime(nextAt || undefined);
  const inactive = paused ? 'Paused' : !running ? 'Stopped' : !connected ? 'Disconnected' : null;
  return <p className="field-note coordinator-task-ping" title="Scheduled dispatch time. Delivery may wait for current work or pending requests.">Next chat task-ping to send{' '}
    {!inactive && time ? <time dateTime={nextAt!} title={new Date(nextAt!).toLocaleString()}>{time}</time> : <span>{inactive || 'Not scheduled'}</span>}
  </p>;
}
