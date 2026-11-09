import React from 'react';

export type NativeMessageQuestion = { title: string; options: string[] | null };

export function NativeMessageQuestions({ questions, truncated = false }: { questions?: NativeMessageQuestion[]; truncated?: boolean }) {
  if (!questions?.length && !truncated) return null;
  return <section className="native-message-questions" aria-label="Native Codex questions">
    {!!questions?.length && <ol>{questions.map((question, index) => <li key={index}>
      <strong>{question.title}</strong>
      {!!question.options?.length && <ul>{question.options.map((option, optionIndex) => <li key={optionIndex}>{option}</li>)}</ul>}
    </li>)}</ol>}
    {truncated && <p className="field-note">Some native question details were shortened or omitted. Review the full details in the native Codex client.</p>}
    <p className="field-note">Answer this question in the native Codex client; this format cannot be answered here yet.</p>
  </section>;
}
