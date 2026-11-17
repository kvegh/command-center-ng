import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/handover-controls.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  .replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
const { HandoverControls, HandoverCreateForm, HandoverConflictChoices, HandoverProgressNotice } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

function elements(value) {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!React.isValidElement(value)) return [];
  return [value, ...elements(value.props.children)];
}
const createValue = { provider: 'claude', cwd: '/example/project' };
const artifactPath = '/tmp/example-transfer/handoff.md';
const accepted = { accepted: true, path: artifactPath, state: 'preparing' };
const progress = { state: 'preparing', name: 'Example project v2', provider: 'claude', path: artifactPath };
const submitEvent = () => ({ preventDefault() {} });
function fixture(overrides = {}) {
  let element;
  const calls = [];
  const props = { agentId: 'synthetic-source', cwd: '/example/project', sourceProvider: 'codex', canCreate: true, codexReady: true, claudeReady: true, full: false,
    create: async value => { calls.push(['create', value]); return accepted; },
    openExisting: async id => { calls.push(['open-existing', id]); }, choose: id => calls.push(['choose', id]), ...overrides };
  function Capture() { element = HandoverControls(props); return null; }
  renderToStaticMarkup(React.createElement(Capture));
  const tree = elements(element);
  return { element, calls, html: renderToStaticMarkup(element), create: tree.find(node => node.type === 'button' && node.props.children === 'Create handover'),
    dialogs: tree.filter(node => node.type === 'dialog'), createForm: tree.find(node => node.type === HandoverCreateForm),
    progressNotice: tree.find(node => node.type === HandoverProgressNotice) };
}
function createForm(overrides = {}) {
  const calls = [];
  const props = { id: 'synthetic-create', draft: { provider: 'codex', cwd: '/example/project' }, change: value => calls.push(['change', value]), busy: false, error: '', codexReady: true, claudeReady: true, full: false,
    submit: async value => calls.push(['submit', value]), ...overrides };
  const element = HandoverCreateForm(props), tree = elements(element);
  return { element, calls, html: renderToStaticMarkup(element), select: tree.find(node => node.type === 'select'), field: tree.find(node => node.type === 'input'), button: tree.find(node => node.type === 'button' && node.props.type === 'submit') };
}

test('Create is the only action and opening it neither submits nor changes chats', async () => {
  const f = fixture();
  assert.equal(f.create.props.disabled, false); assert.equal(f.dialogs.length, 1);
  assert.match(f.html, /Create handover/); assert.doesNotMatch(f.html, /Import handover|Handover path|type="file"/);
  await f.create.props.onClick();
  assert.deepEqual(f.calls, [], 'opening controls does not submit work or switch chats');
  assert.equal(f.createForm.props.draft.cwd, '/example/project');
  const blocked = fixture({ canCreate: false });
  assert.equal(blocked.create.props.disabled, true);
  await blocked.create.props.onClick(); assert.deepEqual(blocked.calls, []);
});

test('the source provider is selected by default for both native agents', () => {
  for (const sourceProvider of ['codex', 'claude']) {
    const f = fixture({ sourceProvider });
    assert.equal(f.createForm.props.draft.provider, sourceProvider);
    assert.match(f.html, new RegExp(`<option value="${sourceProvider}" selected="">`));
    assert.doesNotMatch(f.html, /Choose an agent/);
  }
});

test('agent choice remains editable and creation needs no artifact path', async () => {
  const f = createForm();
  assert.equal(f.select.props.required, true); assert.equal(f.select.props.value, 'codex'); assert.equal(f.button.props.disabled, false);
  assert.match(f.html, /Which agent should continue\?/);
  assert.match(f.html, /The source chat stays available/);
  assert.match(f.html, /Prepare the handover first, then start a fresh receiving chat that imports it automatically/);
  assert.doesNotMatch(f.html, /Handover path|type="file"/);
  f.select.props.onChange({ target: { value: 'claude' } });
  assert.deepEqual(f.calls, [['change', createValue]]);
  const selected = createForm({ draft: { provider: 'claude', cwd: '  /example/project with spaces  ' } });
  await selected.element.props.onSubmit(submitEvent());
  assert.deepEqual(selected.calls, [['submit', { provider: 'claude', cwd: '/example/project with spaces' }]]);
  for (const overrides of [{ draft: { ...createValue, cwd: ' ' } }, { claudeReady: false }, { busy: true }]) {
    const unavailable = createForm({ draft: createValue, ...overrides });
    assert.equal(unavailable.button.props.disabled, true); await unavailable.element.props.onSubmit(submitEvent()); assert.deepEqual(unavailable.calls, []);
  }
});

test('an unavailable source-provider default never silently switches agents', async () => {
  const f = fixture({ sourceProvider: 'claude', claudeReady: false });
  assert.equal(f.createForm.props.draft.provider, 'claude');
  const form = HandoverCreateForm(f.createForm.props), nodes = elements(form);
  assert.equal(nodes.find(node => node.type === 'button').props.disabled, true);
  assert.equal(nodes.find(node => node.type === 'option' && node.props.value === 'claude').props.disabled, true);
  await f.createForm.props.submit(createValue); assert.deepEqual(f.calls, []);
  await f.createForm.props.submit({ ...createValue, provider: 'codex' });
  assert.deepEqual(f.calls, [['create', { ...createValue, provider: 'codex' }]]);
});

test('a full workspace can request duplicate discovery without selecting another agent', async () => {
  const f = fixture({ full: true, sourceProvider: 'claude' });
  assert.equal(f.create.props.disabled, false);
  assert.match(f.html, /You can check for an existing version; close a tab before creating a new one/);
  const form = createForm({ draft: createValue, full: true });
  assert.equal(form.button.props.disabled, false);
  await form.element.props.onSubmit(submitEvent());
  assert.deepEqual(form.calls, [['submit', createValue]], 'the existing backend owns collision and allocation checks');
});

test('an accepted preparation stays in the source without duplicate requests or navigation', async () => {
  let release;
  const f = fixture({ create: value => { f.calls.push(['create', value]); return new Promise(resolve => { release = resolve; }); } });
  const pending = f.createForm.props.submit(createValue);
  await f.createForm.props.submit(createValue);
  assert.deepEqual(f.calls, [['create', createValue]]);
  let prevented = false; f.dialogs[0].props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  release(accepted); await pending;
  await f.createForm.props.submit(createValue);
  assert.deepEqual(f.calls, [['create', createValue]], 'the backend owns later startup/import, without another browser action');
});

test('snapshot preparation and startup prevent duplicate work after a remount', async () => {
  for (const state of ['preparing', 'starting']) {
    const f = fixture({ progress: { ...progress, state } });
    assert.equal(f.create.props.disabled, true); assert.equal(f.createForm.props.busy, true);
    await f.createForm.props.submit(createValue); assert.deepEqual(f.calls, []);
    let prevented = false; f.dialogs[0].props.onCancel({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
});

test('progress distinguishes preparing, starting, started and failed without claiming completed import', () => {
  for (const state of ['preparing', 'starting']) {
    const node = HandoverProgressNotice({ progress: { ...progress, state }, choose: () => assert.fail('No receiving chat exists yet.') });
    assert.equal(elements(node).filter(item => item.type === 'button').length, 0);
    assert.match(renderToStaticMarkup(node), state === 'preparing' ? /will start after the file is ready/ : /Starting Example project v2 with automatic import/);
  }
  const calls = [];
  const node = HandoverProgressNotice({ progress: { ...progress, state: 'started', id: 'synthetic-receiver' }, choose: id => calls.push(id) });
  const html = renderToStaticMarkup(node);
  assert.match(html, /Automatic handover import was requested/); assert.doesNotMatch(html, /Import handover|Import completed/);
  assert.deepEqual(calls, []);
  elements(node).find(item => item.type === 'button').props.onClick();
  assert.deepEqual(calls, ['synthetic-receiver']);
  const failed = fixture({ progress: { ...progress, state: 'failed', error: 'The prepared file is unavailable. Check the source.' } });
  assert.match(failed.html, /role="alert"/); assert.match(failed.html, /The prepared file is unavailable/);
  assert.equal(failed.create.props.disabled, false);
});

const collision = {
  existing: [{ id: 'existing-codex', name: 'Example project v2', provider: 'codex' }, { id: 'existing-claude', name: 'Example project v2', provider: 'claude' }],
  nextName: 'Example project v3'
};
test('a name conflict requires an explicit existing-chat or next-version action', async () => {
  const calls = [];
  const node = HandoverConflictChoices({ conflict: collision, busy: false,
    openExisting: async id => calls.push(['open', id]), createNext: async name => calls.push(['create-next', name]) });
  const html = renderToStaticMarkup(node), buttons = elements(node).filter(item => item.type === 'button');
  assert.match(html, /Open Example project v2 \(Codex\)/); assert.match(html, /Open Example project v2 \(Claude\)/);
  assert.match(html, /Create Example project v3/); assert.deepEqual(calls, []);
  await buttons[0].props.onClick(); assert.deepEqual(calls, [['open', 'existing-codex']]);
  await buttons[1].props.onClick(); assert.deepEqual(calls, [['open', 'existing-codex'], ['open', 'existing-claude']]);
  await buttons[2].props.onClick();
  assert.deepEqual(calls, [['open', 'existing-codex'], ['open', 'existing-claude'], ['create-next', 'Example project v3']]);
});

test('a pending conflict action disables every alternative and suppresses normal form submission', async () => {
  const choices = HandoverConflictChoices({ conflict: collision, busy: true,
    openExisting: async () => assert.fail('Already opening a chat.'), createNext: async () => assert.fail('Already creating a chat.') });
  for (const button of elements(choices).filter(item => item.type === 'button')) {
    assert.equal(button.props.disabled, true); await button.props.onClick();
  }
  const f = createForm({ conflictChoices: choices });
  assert.equal(f.button, undefined);
  await f.element.props.onSubmit(submitEvent()); assert.deepEqual(f.calls, []);
});

test('creation retains editable drafts and visible errors while preparation text is accurate', async () => {
  const create = createForm({ draft: createValue, error: 'Inspect the source chat before trying again.' });
  assert.equal(create.select.props.value, 'claude'); assert.equal(create.field.props.value, '/example/project');
  assert.match(create.html, /role="alert"/);
  create.select.props.onChange({ target: { value: 'codex' } });
  create.field.props.onChange({ target: { value: '/example/another project' } });
  assert.deepEqual(create.calls, [['change', { provider: 'codex', cwd: '/example/project' }], ['change', { provider: 'claude', cwd: '/example/another project' }]]);
  const preparing = createForm({ busy: true });
  assert.match(preparing.html, /Preparing handover…/);
  assert.equal(preparing.select.props.disabled, true); assert.equal(preparing.field.props.disabled, true);
  await preparing.element.props.onSubmit(submitEvent()); assert.deepEqual(preparing.calls, []);
});

test('failed or unconfirmed requests never navigate or retry automatically', async () => {
  const conflictError = Object.assign(new Error('The receiving name already exists.'), { code: 'handover_name_conflict', handoverConflict: collision });
  for (const result of [conflictError, new Error('Check the source chat.'), undefined, {}, { id: 'new' }]) {
    let attempts = 0;
    const f = fixture({ create: async () => { attempts++; if (result instanceof Error) throw result; return result; } });
    await f.createForm.props.submit(createValue);
    assert.equal(attempts, 1); assert.deepEqual(f.calls, []); await Promise.resolve(); assert.equal(attempts, 1);
  }
});
