import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/message-rewind.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  .replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
const { EditRewindAction, RewindPreviewDetails, RewindDialog, rewindUnavailable } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const worker = { provider: 'codex', role: 'worker', status: 'idle', canSend: true, questions: [] };
const preview = {
  previewToken: 'preview-token', threadId: 'worker', selected: { messageId: 'chosen', turnId: 'turn-one', text: 'Original input', imageCount: 0 },
  affectedTurns: [
    { id: 'turn-one', status: 'completed', userInputs: [{ messageId: 'earlier', text: 'Earlier input in the same turn', imageCount: 0 }, { messageId: 'chosen', text: 'Original input', imageCount: 0 }], assistantMessages: 1, actions: 2, messages: [{ id: 'reply', type: 'agentMessage', summary: 'A bounded reply summary' }] },
    { id: 'turn-two', status: 'completed', userInputs: [{ messageId: 'later', text: 'A later input', imageCount: 1 }], assistantMessages: 2, actions: 1, messages: [{ id: 'action', type: 'commandExecution', summary: 'An existing action' }] }
  ], turnCount: 2, messageCount: 9, warning: 'History only'
};
const ast = ts.createSourceFile('message-rewind.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map(); let onSubmit, onCancel;
function visit(node) {
  if (ts.isVariableDeclaration(node)) declarations.set(node.name.getText(ast), node.initializer?.getText(ast));
  if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onSubmit') onSubmit = node.initializer.expression.getText(ast);
  if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onCancel') onCancel = node.initializer.expression.getText(ast);
  ts.forEachChild(node, visit);
} visit(ast);
function evaluate(expression, environment) {
  const code = ts.transpileModule(`const callback = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return new Function(...Object.keys(environment), code + '\nreturn callback;')(...Object.values(environment));
}
const event = () => ({ preventDefault() {} });
function submitFixture(props = {}) {
  const state = { busy: false, error: '', needsPreview: false, confirmedToken: preview.previewToken, calls: [], applied: [], inFlight: { current: false } };
  const environment = {
    disabled: false, data: preview, workerId: 'worker', inFlight: state.inFlight,
    commit: async token => { state.calls.push(token); return { id: 'worker', draftText: preview.selected.text, rewound: true }; },
    applied: text => state.applied.push(text),
    setBusy: value => { state.busy = value; }, setError: value => { state.error = value; },
    setNeedsPreview: value => { state.needsPreview = value; }, setConfirmedToken: value => { state.confirmedToken = value; }, ...props
  };
  return { state, submit: evaluate(onSubmit, environment) };
}

test('Edit & rewind has an explicit action and disabled reasons cannot submit', () => {
  const calls = [];
  const button = EditRewindAction({ edit: () => calls.push('open') });
  assert.equal(button.props.type, 'button'); assert.equal(button.props.disabled, false);
  assert.match(renderToStaticMarkup(button), /Edit &amp; rewind/);
  button.props.onClick(); assert.deepEqual(calls, ['open']);
  const disabled = EditRewindAction({ disabledReason: 'Images cannot be restored.', edit: () => assert.fail('Disabled actions cannot submit.') });
  assert.equal(disabled.props.disabled, true); assert.match(disabled.props['aria-label'], /Images cannot be restored/);
  disabled.props.onClick();
});

test('availability preserves pending native requests, busy work, handoffs and unsent target drafts', () => {
  assert.equal(rewindUnavailable({ worker, connected: true }), '');
  for (const [props, reason] of [
    [{ worker: { ...worker, provider: 'claude' } }, /Codex only/],
    [{ connected: false }, /Reconnect/],
    [{ worker: { ...worker, questions: [{ id: 'approval' }] } }, /pending native request/],
    [{ worker: { ...worker, status: 'running' } }, /finish its current action/],
    [{ worker: { ...worker, returning: true } }, /branch handoff/],
    [{ worker: { ...worker, handoff: { phase: 'waiting' } } }, /branch handoff/],
    [{ worker: { ...worker, handoff: { phase: 'failed' } } }, /branch handoff/],
    [{ worker: { ...worker, returnSummary: { delivered: false } } }, /branch handoff/],
    [{ worker: { ...worker, rewindBlockedReason: 'An uncertain coordinator input is pending.' } }, /uncertain coordinator/],
    [{ draft: 'Unsent text' }, /draft is kept/], [{ draft: ' ' }, /draft is kept/], [{ imageCount: 1 }, /draft is kept/],
    [{ busy: true }, /current request/]
  ]) assert.match(rewindUnavailable({ worker, connected: true, ...props }), reason);
});

test('preview enumerates all affected turns, earlier inputs in the same turn, later images and message summaries', () => {
  const html = renderToStaticMarkup(React.createElement(RewindPreviewDetails, { preview }));
  assert.match(html, /2 whole turns · 9 recorded messages\/items/);
  for (const text of ['Earlier input in the same turn', 'Original input', 'A later input', 'A bounded reply summary', 'An existing action']) assert.ok(html.includes(text));
  assert.match(html, /Other input in this turn/); assert.match(html, /Selected input/); assert.match(html, /1 image attachments/);
  assert.equal((html.match(/All affected message summaries/g) || []).length, 2);
});

test('the confirmation explains whole-turn scope, work/schedule preservation and draft-only editing', () => {
  function Capture() { return RewindDialog({ workerId: 'worker', workerName: 'Example', messageId: 'chosen', turnId: 'turn-one', preview: () => assert.fail('Server rendering must not start a preview.'), commit: () => assert.fail('No confirmation was given.'), dismiss() {}, applied() {} }); }
  const html = renderToStaticMarkup(React.createElement(Capture));
  assert.match(html, /entire turn containing your input and all later turns/);
  assert.match(html, /Commands already run, file changes, commits and deployments are not undone/);
  assert.match(html, /Saved permissions are not revoked/);
  assert.match(html, /Files, tasks and saved report\/task-check schedules stay unchanged/);
  assert.match(html, /never sent automatically/);
  assert.match(html, /normal chat draft/);
  assert.doesNotMatch(html, /<textarea/, 'editing starts in the persistent composer only after native confirmation');
  assert.match(html, /another client/);
  assert.match(html, /type="checkbox"/);
});

test('only native acknowledgement loads the original text into the normal editable draft, and duplicate clicks are coalesced', async () => {
  let resolve; const calls = [];
  const f = submitFixture({ commit: token => { calls.push(token); return new Promise(done => { resolve = done; }); } });
  const pending = f.submit(event()); await f.submit(event());
  assert.deepEqual(calls, ['preview-token']); assert.deepEqual(f.state.applied, []);
  assert.equal(f.state.busy, true);
  resolve({ id: 'worker', draftText: 'Original input', rewound: true }); await pending;
  assert.deepEqual(f.state.applied, ['Original input']); assert.equal(f.state.busy, false);
});

test('stale or uncertain outcomes require a fresh preview and never retry or replace the draft', async () => {
  for (const result of [{ id: 'other', draftText: 'Original input', rewound: true }, { id: 'worker', draftText: 'Different input', rewound: true }, { id: 'worker', draftText: 'Original input', rewound: false }]) {
    const f = submitFixture({ commit: async () => result }); await f.submit(event());
    assert.deepEqual(f.state.applied, []); assert.equal(f.state.needsPreview, true); assert.equal(f.state.confirmedToken, null);
    assert.match(f.state.error, /confirmation did not match/);
  }
  let calls = 0;
  const f = submitFixture({ commit: async () => { calls++; throw new Error('The native outcome is uncertain.'); } }); await f.submit(event());
  assert.equal(calls, 1); assert.equal(f.state.needsPreview, true); assert.deepEqual(f.state.applied, []);
});

test('preview does not touch the composer draft, and stale/unmounted preview responses are ignored', async () => {
  const state = { data: null, edited: 'An already edited draft', loading: false, error: '', confirmed: 'old', needsPreview: false };
  const generation = { current: 0 };
  const environment = {
    inFlight: { current: false }, generation, workerId: 'worker', messageId: 'chosen', turnId: 'turn-one',
    preview: async () => preview, setLoading: value => { state.loading = value; }, setError: value => { state.error = value; },
    setConfirmedToken: value => { state.confirmed = value; }, setNeedsPreview: value => { state.needsPreview = value; },
    setData: value => { state.data = value; }
  };
  await evaluate(declarations.get('load'), environment)();
  assert.equal(state.edited, 'An already edited draft'); assert.equal(state.confirmed, null); assert.equal(state.data, preview);
  let resolve; state.data = null;
  const load = evaluate(declarations.get('load'), { ...environment, preview: () => new Promise(done => { resolve = done; }) });
  const pending = load(); generation.current++; resolve(preview); await pending;
  assert.equal(state.data, null);
});

test('selected attachments and native busy guards cannot be confirmed, even when the earlier snapshot missed them', async () => {
  const disabledFor = props => evaluate(declarations.get('disabled'), { loading: false, busy: false, needsPreview: false, data: preview, confirmedToken: preview.previewToken, blocked: '', attachments: false, ...props });
  assert.equal(disabledFor({}), false);
  assert.equal(disabledFor({ attachments: true }), true);
  assert.equal(disabledFor({ blocked: 'Answer a native request first.' }), true);
  for (const disabled of [true, 'Answer a native request first.']) {
    const f = submitFixture({ disabled }); await f.submit(event()); assert.deepEqual(f.state.calls, []);
  }
});

test('in-flight native mutation cannot be dismissed with Escape or a late Cancel click', () => {
  let dismissed = 0, prevented = 0;
  const inFlight = { current: true };
  const environment = { inFlight, dismiss: () => { dismissed++; } };
  evaluate(declarations.get('close'), environment)();
  evaluate(onCancel, environment)({ preventDefault: () => { prevented++; } });
  assert.equal(dismissed, 0); assert.equal(prevented, 1);
  inFlight.current = false; evaluate(declarations.get('close'), environment)(); assert.equal(dismissed, 1);
});

test('main applies a successful edit only to its originating draft and never steals another chat’s focus', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let attributes;
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'RewindDialog') attributes = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => [attribute.name.getText(ast), attribute.initializer?.expression?.getText(ast)]));
    ts.forEachChild(node, visit);
  }; visit(ast);
  for (const selected of ['worker', 'other']) {
    let drafts = { worker: '', other: 'Keep this other draft' }, target = { agentId: 'worker' };
    const currentDrafts = { current: drafts }, images = { other: [{ id: 'keep-image' }] }, focusTarget = { current: null };
    const applied = evaluate(attributes.applied, { worker: { id: 'worker' }, currentDrafts, imageDraftsRef: { current: images }, currentChat: { current: selected }, focusTarget, setDrafts: update => { drafts = update(drafts); }, setRewindTarget: value => { target = value; } });
    applied('Edited input');
    assert.deepEqual(drafts, { worker: 'Edited input', other: 'Keep this other draft' });
    assert.deepEqual(images, { other: [{ id: 'keep-image' }] }); assert.equal(target, null);
    assert.equal(focusTarget.current, selected === 'worker' ? 'worker' : null);
  }
  assert.match(attributes.commit, /currentDrafts.current\[worker.id\]/);
  assert.match(attributes.commit, /confirm: true/);
  assert.doesNotMatch(attributes.applied, /\/message|choose\(|setSelected\(|updateImages/);
  assert.match(main, /message.rewindable === true \|\| !!message.images\?\.length/);
  assert.match(main, /This input has image attachments/);
  assert.match(main, /message.type === 'assistant' && message.branchable/);
  assert.match(main, /const worker = opened \|\| \{ id: target.agentId, name: target.name \}/);
  assert.match(main, /This chat is no longer open\. Reopen it before rewinding/);
  assert.doesNotMatch(main, /rewindTarget && state.agents.some/);
});
