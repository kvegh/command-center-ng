import React from 'react';

type InputTask = { id: string; text: string; isChatQuestion?: boolean };

export function TaskInputLink({ task, open }: { task: InputTask; open: (id: string) => void }) {
  return <button type="button" className="task-title-button"
    aria-label={`${task.isChatQuestion ? 'Reply to question' : 'Open task'}: ${task.text}`}
    title="Read context and provide the required input" onClick={() => open(task.id)}>
    {task.isChatQuestion && <span className="task-question-label">Question</span>}
    {task.text}
  </button>;
}
