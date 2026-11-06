import React from 'react';

export type TaskNotificationEvent = {
  id: string;
  workerId: string;
  taskId?: string;
  kind: 'needs-input' | 'error' | 'completed' | 'request';
  title: string;
  detail: string;
};

const notificationTooltip = 'Notify me when this task needs my input, encounters an error, or is completed.';
const kindLabels: Record<TaskNotificationEvent['kind'], string> = {
  'needs-input': 'Needs input', error: 'Error', completed: 'Completed', request: 'Request'
};

export function TaskNotifyToggle({ checked, onChange, taskTitle }: {
  checked: boolean; onChange: (checked: boolean) => void; taskTitle: string;
}) {
  return <label className="task-notify-control" title={notificationTooltip}
    onClick={event => event.stopPropagation()}>
    <input type="checkbox" checked={checked} aria-label={`Notify me about ${taskTitle}`}
      onChange={event => onChange(event.currentTarget.checked)} />
    <span>Notify me</span>
  </label>;
}

export function TaskNotificationAlerts({ events, open, dismiss }: {
  events: TaskNotificationEvent[];
  open: (event: TaskNotificationEvent) => void;
  dismiss: (id: string) => void;
}) {
  if (!events.length) return null;
  return <section className="task-notification-alerts" role="region" aria-label="Task notifications">
    <ul className="task-notification-list" aria-live="polite" aria-relevant="additions text" aria-atomic="false">
      {events.map(event => <li key={event.id} className={`task-notification-alert task-notification-${event.kind}`}>
        <div className="task-notification-content">
          <span className="task-notification-kind">{kindLabels[event.kind]}</span>
          <strong className="task-notification-title">{event.title}</strong>
          <p className="task-notification-detail">{event.detail}</p>
        </div>
        <div className="task-notification-actions">
          <button type="button" className="button subtle task-notification-open"
            aria-label={`${event.taskId ? 'Open task' : 'Open worker'}: ${event.title}`}
            onClick={() => open(event)}>{event.taskId ? 'Open task' : 'Open worker'}</button>
          <button type="button" className="icon-button task-notification-dismiss"
            aria-label={`Dismiss notification: ${event.title}`} title="Dismiss notification"
            onClick={() => dismiss(event.id)}>×</button>
        </div>
      </li>)}
    </ul>
  </section>;
}
