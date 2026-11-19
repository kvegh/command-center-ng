import React, { useRef, useState } from 'react';
import { formContent, formFields } from '../server/native-requests.mjs';
import { questionTarget, type Question } from './open-questions';

type PermissionOption = { optionId: string; name: string; kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always' };
function permissionOptions(value: unknown): PermissionOption[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 128) return null;
  const ids = new Set<string>();
  for (const option of value) {
    if (!option || typeof option.optionId !== 'string' || !option.optionId || ids.has(option.optionId)
      || typeof option.name !== 'string' || !option.name.trim()
      || !['allow_once', 'allow_always', 'reject_once', 'reject_always'].includes(option.kind)) return null;
    ids.add(option.optionId);
  }
  return value;
}

export function MistralRequestCard({ question, agentId, workerName, act }: {
  question: Question; agentId: string; workerName: string;
  act: (path: string, data: unknown) => Promise<boolean>;
}) {
  const approval = question.method === 'mistral/permission/requestApproval';
  const asking = question.method === 'mistral/userInput/request';
  const options = approval ? permissionOptions(question.params.options) : null;
  const toolCall = question.params.toolCallContext || question.params.toolCall;
  const fields = asking && question.params.mode === 'form' ? formFields(question.params.requestedSchema) : null;
  const [content, setContent] = useState<Record<string, any>>(() => Object.fromEntries((fields || []).filter(field => field.default !== undefined).map(field => [field.name, field.default])));
  const [sending, setSending] = useState(false), [error, setError] = useState('');
  const submitted = useRef(false);
  const busy = sending || submitted.current || !!question.responding;
  const blocked = !!question.unavailable || !!question.unsupported;
  const disabled = busy || blocked;
  const submit = async (answer: Record<string, unknown>) => {
    if (disabled || submitted.current) return;
    // Lock synchronously too: two clicks before React renders must send only once.
    submitted.current = true; setSending(true); setError('');
    try {
      const accepted = await act(`agents/${agentId}/answer`, { requestId: question.id, ...(question.reviewToken ? { reviewToken: question.reviewToken } : {}), ...answer });
      if (!accepted) { submitted.current = false; setError('The answer was not confirmed. Your input is retained; check the request before retrying.'); }
    } catch (problem) {
      submitted.current = false; setError(problem instanceof Error ? problem.message : 'The answer could not be confirmed. Check the request before retrying.');
    } finally { setSending(false); }
  };
  const submitForm = () => {
    if (disabled || !fields) return;
    try { void submit({ action: 'accept', content: formContent(question.params.requestedSchema, content) }); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Check the requested fields.'); }
  };
  return <section id={questionTarget(agentId, question.id)} className="question-card native-request" tabIndex={-1} aria-busy={busy} aria-label={`Mistral ${approval ? 'tool approval' : asking ? 'question' : 'native request'} for ${workerName}`}>
    <div className="eyebrow">Mistral {approval ? 'tool approval' : asking ? 'question' : 'native request'} · {workerName}</div>
    {typeof question.params.message === 'string' && <p>{question.params.message}</p>}
    {(question.responding || submitted.current) && <p role="status">Answer submitted. Waiting for Mistral to continue or finish the turn…</p>}
    {blocked && <p className="field-note" role="status">{question.unavailableReason || 'This native request remains unanswered and cannot be answered here. Check native Vibe compatibility and connection status.'}</p>}
    {(error || question.error) && <p className="error-text" role="alert">{error || question.error}</p>}
    {approval ? <>
      {typeof toolCall?.title === 'string' && <p><strong>{toolCall.title}</strong></p>}
      <pre><code>{JSON.stringify(toolCall, null, 2)}</code></pre>
      {options ? <>
        <div className="button-row">{options.map(option => <button key={option.optionId} type="button" className={option.kind.startsWith('reject') ? 'button subtle' : 'button amber'} disabled={disabled} onClick={() => void submit({ optionId: option.optionId })}>{option.name}</button>)}</div>
        {options.some(option => option.kind.endsWith('_always')) && <p className="field-note">Always choices use the exact scope offered by native Vibe. Native Vibe owns their persistence; CCNG does not save permission rules.</p>}
      </> : <p>This permission format cannot be answered here. The request stays open; check native Vibe compatibility.</p>}
    </> : asking ? <>
      {fields !== null ? <form onSubmit={event => { event.preventDefault(); submitForm(); }}>
        <fieldset disabled={disabled}>{fields.map(field => <label key={field.name}>{field.label}{field.description && <span className="field-note">{field.description}</span>}
          {field.type === 'boolean' ? <select aria-label={field.label} required={field.required} value={content[field.name] === undefined ? '' : String(content[field.name])} onChange={event => setContent({ ...content, [field.name]: event.target.value === '' ? undefined : event.target.value === 'true' })}><option value="">Choose…</option><option value="true">Yes</option><option value="false">No</option></select>
            : field.type === 'array' ? <select multiple aria-label={field.label} required={field.required} value={content[field.name] || []} onChange={event => setContent({ ...content, [field.name]: Array.from(event.target.selectedOptions, option => option.value) })}>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            : field.options ? <select aria-label={field.label} required={field.required} value={content[field.name] ?? ''} onChange={event => setContent({ ...content, [field.name]: event.target.value })}><option value="">Choose…</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            : <input aria-label={field.label} required={field.required} type={['number', 'integer'].includes(field.type) ? 'number' : field.format === 'password' ? 'password' : field.format === 'email' ? 'email' : field.format === 'uri' ? 'url' : field.format === 'date' ? 'date' : 'text'} step={field.type === 'integer' ? 1 : 'any'} min={field.minimum} max={field.maximum} minLength={field.minLength} maxLength={Math.min(8000, field.maxLength ?? 8000)} value={content[field.name] ?? ''} onChange={event => setContent({ ...content, [field.name]: ['number', 'integer'].includes(field.type) ? event.target.value === '' ? undefined : Number(event.target.value) : event.target.value })} />}
        </label>)}</fieldset><button className="button amber" disabled={disabled}>Send answer</button>
      </form> : <p>This Mistral form uses an unsupported schema or mode. The request stays open; available native controls appear below.</p>}
      <div className="button-row"><button type="button" className="button subtle" disabled={disabled} onClick={() => void submit({ action: 'decline' })}>Decline question</button><button type="button" className="button subtle" disabled={disabled} onClick={() => void submit({ action: 'cancel' })}>Cancel request</button></div>
    </> : <p>This native request cannot be answered here yet. It remains pending; check native Vibe compatibility. No answer has been sent.</p>}
    <details className="native-request-details"><summary>Native request details</summary><pre><code>{JSON.stringify({ method: question.method, ...question.params }, null, 2)}</code></pre></details>
  </section>;
}
