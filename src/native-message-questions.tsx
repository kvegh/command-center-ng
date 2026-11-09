import React, { useRef, useState } from 'react';

export type NativeMessageQuestion = {
  title: string; options: string[] | null; questionIndex?: number;
  answerState?: 'available' | 'submitting' | 'submitted' | 'unconfirmed' | 'read-only';
  answerNotice?: string;
};
type AnswerResult = { accepted: boolean; turnId?: string };
export type NativeQuestionInput = { draft: string; delivery?: 'submitting' | 'submitted' | 'unconfirmed' | null; error?: string };
type QuestionItemProps = {
  question: NativeMessageQuestion; supported: boolean; disabledReason?: string | null;
  input?: NativeQuestionInput; changeInput?: (patch: Partial<NativeQuestionInput>) => void;
  answer?: (questionIndex: number, answer: string) => Promise<AnswerResult>;
};

export function NativeMessageQuestionItem({ question, supported, disabledReason, input, changeInput, answer }: QuestionItemProps) {
  const [localDraft, setLocalDraft] = useState('');
  const draft = input?.draft ?? localDraft;
  const setDraft = (draft: string) => { if (changeInput) changeInput({ draft }); else setLocalDraft(draft); };
  const [sending, setSending] = useState(false);
  const [localState, setLocalState] = useState<'submitted' | 'unconfirmed' | null>(null);
  const [localError, setLocalError] = useState('');
  const error = question.answerState === 'submitted' ? '' : input?.error ?? localError;
  const attempt = useRef<'none' | 'sending' | 'submitted' | 'unconfirmed'>('none');
  const state = question.answerState === 'submitted' ? 'submitted' : input?.delivery || localState || question.answerState || 'read-only';
  const indexed = Number.isSafeInteger(question.questionIndex) && question.questionIndex! >= 0;
  const editable = supported && indexed && state === 'available' && !!answer;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editable || disabledReason || sending || attempt.current !== 'none' || !draft.trim() || draft.length > 30000) return;
    attempt.current = 'sending'; setSending(true); setLocalError(''); changeInput?.({ delivery: 'submitting', error: '' });
    try {
      const result = await answer!(question.questionIndex!, draft);
      if (!result?.accepted) throw new Error('Codex did not confirm this answer. Check the native client before trying again.');
      attempt.current = 'submitted'; setLocalState('submitted'); changeInput?.({ delivery: 'submitted', error: '' });
    } catch (problem) {
      const failure = problem as Error & { code?: string; status?: number };
      setLocalError(failure.message);
      const rejectedBeforeSend = failure.code !== 'async_question_delivery_unconfirmed'
        && (failure.status === 413 || ['async_question_not_current', 'invalid_async_question_answer'].includes(failure.code || ''));
      if (rejectedBeforeSend) { attempt.current = 'none'; changeInput?.({ delivery: null, error: failure.message }); }
      else { attempt.current = 'unconfirmed'; setLocalState('unconfirmed'); changeInput?.({ delivery: 'unconfirmed', error: failure.message }); }
    } finally { setSending(false); }
  };
  return <li>
    <strong>{question.title}</strong>
    {editable ? <form className="native-message-question-form" onSubmit={submit} aria-label={`Answer: ${question.title}`}>
      {!!question.options?.length && <div className="choices">{question.options.map((option, index) => <button type="button" className={draft === option ? 'choice selected' : 'choice'} key={index} aria-pressed={draft === option} disabled={sending} onClick={() => setDraft(option)}>{option}</button>)}</div>}
      <label>Answer<textarea rows={3} maxLength={30000} value={draft} disabled={sending} onChange={event => setDraft(event.target.value)} /></label>
      <button type="submit" className="button subtle small" disabled={sending || !!disabledReason || !draft.trim() || draft.length > 30000}>{sending ? 'Sending answer…' : 'Send answer'}</button>
      {disabledReason && <p className="field-note">{disabledReason}</p>}
    </form> : <>
      {!!question.options?.length && <ul>{question.options.map((option, index) => <li key={index}>{option}</li>)}</ul>}
      <p className="field-note" role={state === 'submitted' || state === 'submitting' || state === 'unconfirmed' ? 'status' : undefined}>{state === 'submitted'
        ? 'Codex accepted the answer as input. This does not confirm that the question or task is resolved.'
        : state === 'submitting' ? 'An answer is being sent. Its acceptance is not confirmed yet.'
          : state === 'unconfirmed' ? 'Answer delivery is unconfirmed. Check the native Codex client; CCNG will not resend it automatically.'
            : question.answerNotice || 'This question is read-only here. Review its current state in the native Codex client.'}</p>
      {!!draft.trim() && state !== 'submitted' && <><p className="field-note">Your answer text is retained in this tab:</p><pre>{draft}</pre><button type="button" className="button subtle small" onClick={() => setDraft('')}>Discard retained text</button></>}
    </>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </li>;
}

export function NativeMessageQuestions({ questions, truncated = false, agentId, messageId, disabledReason, inputs, changeInput, answer }: {
  questions?: NativeMessageQuestion[]; truncated?: boolean; agentId?: string; messageId?: string;
  disabledReason?: string | null;
  inputs?: Record<string, NativeQuestionInput>; changeInput?: (key: string, patch: Partial<NativeQuestionInput>) => void;
  answer?: (questionIndex: number, answer: string) => Promise<AnswerResult>;
}) {
  if (!questions?.length && !truncated) return null;
  return <section className="native-message-questions" aria-label="Native Codex questions">
    {!!questions?.length && <ol>{questions.map((question, index) => {
      const key = JSON.stringify([agentId, messageId, question.questionIndex ?? `read-only-${index}`]);
      return <NativeMessageQuestionItem key={key} question={question} supported={!!agentId && !!messageId && !truncated} disabledReason={disabledReason} input={inputs?.[key]}
        changeInput={changeInput ? patch => changeInput(key, patch) : undefined} answer={answer} />;
    })}</ol>}
    {truncated && <p className="field-note">Some native question details were shortened or omitted. Review the full details in the native Codex client.</p>}
  </section>;
}
