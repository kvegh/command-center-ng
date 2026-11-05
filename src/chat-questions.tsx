import React from 'react';

export type ChatQuestion = { id: string; workerId: string; text: string; state: string; displayState?: string };

export function ChatQuestions({ agentId, questions, reply }: {
  agentId: string; questions: ChatQuestion[]; reply: (taskId: string) => void;
}) {
  const rows = questions.filter(question => question.workerId === agentId && question.state !== 'closed');
  if (!rows.length) return null;
  return <section className="open-questions has-questions" aria-label="Chat questions">
    <div className="open-questions-heading"><span className="context-label">CHAT QUESTIONS</span><span className="question-count" role="status" aria-label={`${rows.length} recorded chat questions`}>{rows.length}</span></div>
    <ul>{rows.map(question => <li key={JSON.stringify([agentId, question.id])}>
      <button type="button" className="open-question" onClick={() => reply(question.id)} aria-label={`Reply to chat question: ${question.text}`}>
        <span className="open-question-kind">Chat question · {(question.displayState || question.state) === 'blocked' ? 'Needs your answer' : (question.displayState || question.state).replaceAll('_', ' ')}</span>
        <span className="open-question-text">{question.text}</span>
        <span className="open-question-action">Read context and reply →</span>
      </button>
    </li>)}</ul>
    <p className="field-note">The worker resolves the question after processing your answer.</p>
  </section>;
}
