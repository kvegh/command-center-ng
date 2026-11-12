import React from 'react';

export type TaskNotificationEvent = {
  id: string;
  workerId: string;
  taskId?: string;
  kind: 'needs-input' | 'error' | 'completed' | 'request';
};

const notificationTooltip = 'Notify me when this task needs my input, encounters an error, or is completed.';

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
