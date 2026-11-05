import React, { useState } from 'react';
import { formFields, requestKind, COMMAND_APPROVAL, FILE_APPROVAL, CLARIFICATION, PERMISSIONS, MCP_REQUEST } from '../server/native-requests.mjs';
import { questionTarget, type Question } from './open-questions';
import { ClaudeRequestCard } from './claude-request-card';

function safeExternalUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? value : null; } catch { return null; }
}

type RequestCardProps = {
  question: Question; agentId: string; workerName: string;
  readOnlyCoordinator?: boolean;
  act: (path: string, data: unknown) => Promise<boolean>;
};

export function NativeRequestCard(props: RequestCardProps) {
  const key = JSON.stringify([props.agentId, props.question.id, props.question.method]);
  return ['claude/tool/requestApproval', 'claude/tool/requestUserInput'].includes(props.question.method)
    ? <ClaudeRequestCard key={key} {...props} />
    : <NativeRequestFields key={key} {...props} />;
}

function NativeRequestFields({ question, agentId, workerName, readOnlyCoordinator = false, act }: RequestCardProps) {
  const approval = [COMMAND_APPROVAL, FILE_APPROVAL].includes(question.method);
  const clarification = question.method === CLARIFICATION;
  const permissions = question.method === PERMISSIONS;
  const mcp = question.method === MCP_REQUEST || question.method === 'claude/mcp/elicitation/request';
  const fields = mcp && ['form', 'openai/form', 'openaiForm'].includes(question.params.mode) ? formFields(question.params.requestedSchema) : null;
  const external = mcp && question.params.mode === 'url';
  const url = external ? safeExternalUrl(question.params.url) : null;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [content, setContent] = useState<Record<string, any>>(() => Object.fromEntries((fields || []).filter(field => field.default !== undefined).map(field => [field.name, field.default])));
  const [sending, setSending] = useState(false); const [error, setError] = useState('');
  const busy = sending || !!question.responding;
  const submit = async (answer: Record<string, any>) => {
    if (busy) return; setSending(true); setError('');
    try { if (!await act(`agents/${agentId}/answer`, { requestId: question.id, ...answer })) setError('The answer was not confirmed. Your input is retained.'); }
    catch (problem) { setError((problem as Error).message); } finally { setSending(false); }
  };
  const offered = (decision: string) => !Array.isArray(question.params.availableDecisions) || question.params.availableDecisions.includes(decision);
  return <section id={questionTarget(agentId, question.id)} className="question-card native-request" tabIndex={-1} aria-label={`${requestKind(question)} for ${workerName}`}>
    <div className="eyebrow">{requestKind(question)} · {workerName}{question.params.serverName ? ` · ${question.params.serverName}` : ''}</div>
    {question.params.message && <p className="native-request-message">{question.params.message}</p>}
    {question.params.reason && <p>{question.params.reason}</p>}
    {question.responding && <p role="status">Waiting for the native agent to confirm resolution…</p>}
    {(error || question.error) && <p className="error-text" role="alert">{error || question.error}</p>}
    {question.review && <p className="field-note coordinator-review">Coordinator · {question.review.decision === 'ask' ? 'Needs your decision' : question.review.decision}:{'\n'}{question.review.rationale}</p>}
    {clarification ? <form onSubmit={event => { event.preventDefault(); void submit({ answers }); }}>
      {(question.params.questions || []).map((field: any) => <fieldset key={field.id} disabled={busy}><legend>{field.question}</legend>
        {field.options && <div className="choices">{field.options.map((option: any) => <button type="button" key={option.label} className={answers[field.id] === option.label ? 'choice selected' : 'choice'} onClick={() => setAnswers({ ...answers, [field.id]: option.label })}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div>}
        <input aria-label={field.question} type={field.isSecret ? 'password' : 'text'} placeholder="Type your answer…" required value={answers[field.id] || ''} onChange={event => setAnswers({ ...answers, [field.id]: event.target.value })} />
      </fieldset>)}<button className="button amber" disabled={busy}>Send answer</button>
    </form> : approval ? <>
      {question.params.command && <pre><code>{typeof question.params.command === 'string' ? question.params.command : JSON.stringify(question.params.command)}</code></pre>}
      {question.params.grantRoot && <p>Requested change root: {question.params.grantRoot}</p>}
      <div className="button-row">{offered('accept') && <button className="button amber" disabled={busy} onClick={() => void submit({ decision: 'accept' })}>Allow once</button>}{offered('decline') && <button className="button subtle" disabled={busy} onClick={() => void submit({ decision: 'decline' })}>Decline</button>}{offered('cancel') && <button className="button subtle" disabled={busy} onClick={() => void submit({ decision: 'cancel' })}>Cancel turn</button>}
        <button className="button subtle small" disabled={busy} onClick={() => void act(`agents/${agentId}/review`, { requestId: question.id })}>Ask coordinator to review</button></div>
      {question.params.availableDecisions?.some((choice: unknown) => typeof choice !== 'string' || !['accept', 'decline', 'cancel'].includes(choice as string)) && <p className="field-note">Additional policy-changing choices are available in the native client.</p>}
    </> : permissions ? <>
      <p>Review the exact requested access. Allowing applies only to the current turn; it does not change global settings.</p>
      <pre><code>{JSON.stringify(question.params.permissions, null, 2)}</code></pre>
      {readOnlyCoordinator && <p className="field-note">Coordinator access restrictions stay in place; additional permissions cannot be granted here.</p>}
      <div className="button-row"><button className="button amber" disabled={busy || readOnlyCoordinator || !question.params.permissions} onClick={() => void submit({ decision: 'accept' })}>Allow requested access for this turn</button><button className="button subtle" disabled={busy} onClick={() => void submit({ decision: 'decline' })}>Decline</button></div>
    </> : mcp ? <>
      {fields !== null ? <form onSubmit={event => { event.preventDefault(); void submit({ decision: 'accept', content }); }}>
        <fieldset disabled={busy} className="native-form-fields">{fields.map(field => <label key={field.name}><span>{field.label}{field.required ? ' *' : ''}</span>{field.description && <small>{field.description}</small>}
          {field.type === 'boolean' ? <select required={field.required} aria-label={field.label} value={content[field.name] === undefined ? '' : String(content[field.name])} onChange={event => setContent({ ...content, [field.name]: event.target.value === '' ? undefined : event.target.value === 'true' })}><option value="">Choose…</option><option value="true">Yes</option><option value="false">No</option></select>
            : field.type === 'array' ? <select multiple aria-label={field.label} required={field.required} value={content[field.name] || []} onChange={event => setContent({ ...content, [field.name]: Array.from(event.target.selectedOptions, option => option.value) })}>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            : field.options ? <select aria-label={field.label} required={field.required} value={content[field.name] ?? ''} onChange={event => setContent({ ...content, [field.name]: event.target.value })}><option value="">Choose…</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            : <input aria-label={field.label} required={field.required} type={['number', 'integer'].includes(field.type) ? 'number' : field.format === 'password' ? 'password' : field.format === 'email' ? 'email' : field.format === 'uri' ? 'url' : field.format === 'date' ? 'date' : 'text'} step={field.type === 'integer' ? 1 : 'any'} min={field.minimum} max={field.maximum} minLength={field.minLength} maxLength={Math.min(8000, field.maxLength ?? 8000)} value={content[field.name] ?? ''} onChange={event => setContent({ ...content, [field.name]: ['number', 'integer'].includes(field.type) ? event.target.value === '' ? undefined : Number(event.target.value) : event.target.value })} />}
        </label>)}</fieldset><button className="button amber" disabled={busy || readOnlyCoordinator}>Submit response</button>
      </form> : external ? <div className="native-external-step"><p>This step must be completed on the external page, then confirmed here.</p>{url ? <a className="button subtle" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open external page</a> : <p className="error-text">{question.method.startsWith('claude/') ? 'Claude supplied no supported browser URL. Decline or cancel this request here.' : 'The native agent supplied no supported browser URL. Check this request in its native client.'}</p>}{url && <button className="button amber" disabled={busy || readOnlyCoordinator} onClick={() => void submit({ decision: 'accept' })}>I completed this step</button>}</div>
        : <p>{question.method.startsWith('claude/') ? 'This Claude form uses a schema or mode CCNG cannot answer yet. The request stays open; decline or cancel it here.' : 'This native form uses a schema or mode CCNG cannot answer yet. The request stays open; complete this exact request in the native client.'}</p>}
      <div className="button-row"><button className="button subtle" disabled={busy} onClick={() => void submit({ decision: 'decline' })}>Decline</button><button className="button subtle" disabled={busy} onClick={() => void submit({ decision: 'cancel' })}>Cancel request</button></div>
    </> : <p>This blocking request is visible, but its answer format is not supported yet. Open {workerName} in the native client to answer this exact request. It has not been declined or dismissed.</p>}
    <details className="native-request-details"><summary>Native request details</summary><pre><code>{JSON.stringify({ method: question.method, ...question.params }, null, 2)}</code></pre></details>
  </section>;
}
