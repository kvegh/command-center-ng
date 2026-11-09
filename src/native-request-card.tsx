import React, { useState } from 'react';
import { formFields, requestKind, COMMAND_APPROVAL, FILE_APPROVAL, CLARIFICATION, PERMISSIONS, MCP_REQUEST } from '../server/native-requests.mjs';
import { nativeApprovalChoices, isNativeToolApproval } from '../server/approval-choices.mjs';
import { questionTarget, type Question } from './open-questions';
import { ClaudeRequestCard } from './claude-request-card';
import { CopyButton } from './copy-button';

function safeExternalUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? value : null; } catch { return null; }
}

type RequestCardProps = {
  question: Question; agentId: string; workerName: string;
  readOnlyCoordinator?: boolean;
  prepareApprovalFocus?: () => () => void;
  act: (path: string, data: unknown) => Promise<boolean>;
};

export function NativeRequestCard(props: RequestCardProps) {
  const key = JSON.stringify([props.agentId, props.question.id, props.question.method]);
  return ['claude/tool/requestApproval', 'claude/tool/requestUserInput'].includes(props.question.method)
    ? <ClaudeRequestCard key={key} {...props} />
    : <NativeRequestFields key={key} {...props} />;
}

export function NativeApprovalControls({ question, busy, readOnlyCoordinator = false, submit, review, prepareApprovalFocus }: {
  question: Question;
  busy: boolean;
  readOnlyCoordinator?: boolean;
  submit: (answer: Record<string, unknown>) => void | boolean | Promise<boolean>;
  review?: () => void;
  prepareApprovalFocus?: () => () => void;
}) {
  const choices = nativeApprovalChoices(question, { allowPersistent: !readOnlyCoordinator });
  const persistent = choices.some(choice => choice.persistent);
  const toolApproval = isNativeToolApproval(question);
  return <>
    {persistent ? <p className="field-note">Allow always asks Codex to save this rule for matching future requests. Shared user settings may affect other sessions.</p>
      : <p className="field-note">{readOnlyCoordinator ? 'Coordinator restrictions stay in place; reusable approval rules are unavailable here.' : 'This request offers no native permanent approval choice.'}</p>}
    <div className="button-row native-approval-choices">{choices.map(choice => {
      const refusing = ['decline', 'cancel'].includes(String(choice.answer.decision || choice.answer.action));
      const disabled = busy || (readOnlyCoordinator && toolApproval && !refusing);
      return <div className="native-approval-choice" key={choice.key}>
        {choice.scope && <p className="field-note native-approval-scope">{choice.scope}</p>}
        <button type="button" className={refusing ? 'button subtle' : 'button amber'} disabled={disabled} onClick={async () => {
          if (disabled) return;
          const restoreFocus = refusing ? undefined : prepareApprovalFocus?.();
          if (await submit(choice.answer) === true) restoreFocus?.();
        }}>{choice.label}</button>
      </div>;
    })}
      {review && <button type="button" className="button subtle small" disabled={busy} onClick={review}>Ask coordinator to review</button>}
    </div>
  </>;
}

export function NativePermissionControls({ question, busy, readOnlyCoordinator = false, submit, prepareApprovalFocus }: {
  question: Question;
  busy: boolean;
  readOnlyCoordinator?: boolean;
  submit: (answer: Record<string, unknown>) => void | boolean | Promise<boolean>;
  prepareApprovalFocus?: () => () => void;
}) {
  const disabled = busy || readOnlyCoordinator || !question.params.permissions;
  return <>
    <p>Review the exact requested access. Allow once grants it for this turn; Allow for this session grants it within this native session. Neither changes global settings.</p>
    <pre><code>{JSON.stringify(question.params.permissions, null, 2)}</code></pre>
    {readOnlyCoordinator && <p className="field-note">Coordinator access restrictions stay in place; additional permissions cannot be granted here.</p>}
    <div className="button-row">
      {(['turn', 'session'] as const).map(scope => <button key={scope} type="button" className="button amber" disabled={disabled} onClick={async () => {
        if (disabled) return;
        const restoreFocus = prepareApprovalFocus?.();
        if (await submit({ decision: 'accept', scope }) === true) restoreFocus?.();
      }}>{scope === 'turn' ? 'Allow once' : 'Allow for this session'}</button>)}
      <button type="button" className="button subtle" disabled={busy} onClick={() => { if (!busy) void submit({ decision: 'decline' }); }}>Decline</button>
    </div>
  </>;
}

export function NativeFileChanges({ question, agentId, busy, load }: { question: Question; agentId: string; busy: boolean; load: () => void }) {
  const context = question.nativeItem;
  const matched = !!context && question.params.threadId === agentId && typeof question.params.turnId === 'string' && typeof question.params.itemId === 'string'
    && context.threadId === agentId && context.turnId === question.params.turnId && context.itemId === question.params.itemId && context.type === 'fileChange';
  if (!context || !matched || context.state !== 'available') return <div className="native-file-changes">
    <p className="field-note">{matched && context.notice ? context.notice : 'File paths and diff have not been loaded for this exact native request. No changes were inferred.'}</p>
    <button type="button" className="button subtle small" disabled={busy} onClick={() => { if (!busy) load(); }}>Load change details</button>
  </div>;
  return <div className="native-file-changes">
    <p>{context.totalChanges} proposed file change{context.totalChanges === 1 ? '' : 's'}</p>
    {context.notice && <p className="field-note" role={context.truncated ? 'alert' : undefined}>{context.notice}</p>}
    {context.changes.map((change, index) => <div key={`${index}-${change.path}`}>
      <p><strong>{change.kind.type}</strong> · <code>{change.path}</code>{change.kind.move_path && <> → <code>{change.kind.move_path}</code></>}</p>
      {change.diff ? <div className="markdown-code-block"><div className="markdown-code-actions"><CopyButton text={change.diff} label="Copy diff" compact /></div><pre><code>{change.diff}</code></pre></div> : <p className="field-note">No textual diff was supplied for this file.</p>}
    </div>)}
  </div>;
}

function NativeRequestFields({ question, agentId, workerName, readOnlyCoordinator = false, act, prepareApprovalFocus }: RequestCardProps) {
  const toolApproval = isNativeToolApproval(question);
  const approval = [COMMAND_APPROVAL, FILE_APPROVAL].includes(question.method) || toolApproval;
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
    if (busy) return false; setSending(true); setError('');
    try {
      const confirmed = await act(`agents/${agentId}/answer`, { requestId: question.id, ...answer });
      if (!confirmed) setError('The answer was not confirmed. Your input is retained.');
      return confirmed;
    } catch (problem) { setError((problem as Error).message); return false; } finally { setSending(false); }
  };
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
      {question.method === FILE_APPROVAL && <NativeFileChanges question={question} agentId={agentId} busy={busy} load={() => void act(`agents/${agentId}/requests`, {})} />}
      <NativeApprovalControls question={question} busy={busy} readOnlyCoordinator={readOnlyCoordinator} submit={submit} prepareApprovalFocus={prepareApprovalFocus} review={toolApproval ? undefined : () => void act(`agents/${agentId}/review`, { requestId: question.id })} />
    </> : permissions ? <NativePermissionControls question={question} busy={busy} readOnlyCoordinator={readOnlyCoordinator} submit={submit} prepareApprovalFocus={prepareApprovalFocus} /> : mcp ? <>
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
