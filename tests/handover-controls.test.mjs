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
const { HandoverControls, HandoverCreateForm, HandoverImportForm, HandoverReadyNotice } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

function elements(value) {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!React.isValidElement(value)) return [];
  return [value, ...elements(value.props.children)];
}
const createValue = { provider: 'claude', cwd: '/example/project' };
const importValue = { path: '/tmp/example-transfer/handoff.md' };
const submitEvent = () => ({ preventDefault() {} });
function fixture(overrides = {}) {
  let element;
  const calls = [];
  const props = { agentId: 'synthetic-source', cwd: '/example/project', canCreate: true, canImport: false, codexReady: true, claudeReady: true, full: false,
    create: async value => { calls.push(['create', value]); return { id: 'synthetic-receiver', path: importValue.path }; },
    importHandover: async value => { calls.push(['import', value]); }, choose: id => calls.push(['choose', id]), ...overrides };
  function Capture() { element = HandoverControls(props); return null; }
  renderToStaticMarkup(React.createElement(Capture));
  const tree = elements(element);
  return { element, calls, html: renderToStaticMarkup(element), create: tree.find(node => node.type === 'button' && node.props.children === 'Create handover'),
    openImport: tree.find(node => node.type === 'button' && node.props.children === 'Import handover'),
    dialogs: tree.filter(node => node.type === 'dialog'), createForm: tree.find(node => node.type === HandoverCreateForm), importForm: tree.find(node => node.type === HandoverImportForm) };
}
function createForm(overrides = {}) {
  const calls = [];
  const props = { id: 'synthetic-create', draft: { provider: '', cwd: '/example/project' }, change: value => calls.push(['change', value]), busy: false, error: '', codexReady: true, claudeReady: true, full: false,
    submit: async value => calls.push(['submit', value]), ...overrides };
  const element = HandoverCreateForm(props), tree = elements(element);
  return { element, calls, html: renderToStaticMarkup(element), select: tree.find(node => node.type === 'select'), field: tree.find(node => node.type === 'input'), button: tree.find(node => node.type === 'button') };
}
function importForm(overrides = {}) {
  const calls = [];
  const element = HandoverImportForm({ id: 'synthetic-import', path: importValue.path, change: value => calls.push(['change', value]), busy: false, canImport: true, error: '', submit: async value => calls.push(['submit', value]), ...overrides });
  const tree = elements(element);
  return { element, calls, html: renderToStaticMarkup(element), fields: tree.filter(node => node.type === 'input'), button: tree.find(node => node.type === 'button') };
}

test('the source offers Create and keeps Import assigned to the receiving chat', async () => {
  const f = fixture();
  assert.equal(f.create.props.disabled, false); assert.equal(f.openImport.props.disabled, true);
  assert.match(f.html, /Create handover/); assert.match(f.html, /Import handover/);
  await f.create.props.onClick(); await f.openImport.props.onClick();
  assert.deepEqual(f.calls, [], 'opening controls does not submit work or switch chats');
  assert.equal(f.createForm.props.draft.provider, ''); assert.equal(f.createForm.props.draft.cwd, '/example/project');
  assert.equal(f.importForm.props.canImport, false);
  const blocked = fixture({ canCreate: false });
  assert.equal(blocked.create.props.disabled, true);
});

test('agent choice is explicit at creation and no handover path is requested there', async () => {
  const f = createForm();
  assert.equal(f.select.props.required, true); assert.equal(f.select.props.value, ''); assert.equal(f.button.props.disabled, true);
  assert.match(f.html, /Which agent should continue\?/); assert.match(f.html, /Choose an agent/);
  assert.match(f.html, /The source chat stays available/);
  assert.doesNotMatch(f.html, /Handover path|type="file"/);
  await f.element.props.onSubmit(submitEvent()); assert.deepEqual(f.calls, []);
  const selected = createForm({ draft: { provider: 'claude', cwd: '  /example/project with spaces  ' } });
  await selected.element.props.onSubmit(submitEvent());
  assert.deepEqual(selected.calls, [['submit', { provider: 'claude', cwd: '/example/project with spaces' }]]);
  for (const overrides of [{ draft: { ...createValue, provider: '' } }, { draft: { ...createValue, cwd: ' ' } }, { full: true }, { claudeReady: false }, { busy: true }]) {
    const unavailable = createForm({ draft: createValue, ...overrides });
    assert.equal(unavailable.button.props.disabled, true); await unavailable.element.props.onSubmit(submitEvent()); assert.deepEqual(unavailable.calls, []);
  }
});

test('confirmed creation stays in the source and does not duplicate an outstanding request', async () => {
  let release;
  const f = fixture({ create: value => { f.calls.push(['create', value]); return new Promise(resolve => { release = resolve; }); } });
  const pending = f.createForm.props.submit(createValue);
  await f.createForm.props.submit(createValue);
  assert.deepEqual(f.calls, [['create', createValue]]);
  let prevented = false; f.dialogs[0].props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  release({ id: 'synthetic-receiver', path: importValue.path }); await pending;
  assert.deepEqual(f.calls, [['create', createValue]], 'successful creation does not choose the receiving tab or import its file');
});

test('the source offers explicit receiving-chat navigation without claiming the file is ready', () => {
  const calls = [], receiver = { id: 'synthetic-receiver', path: importValue.path };
  const element = HandoverReadyNotice({ receiver, choose: id => calls.push(id) });
  const html = renderToStaticMarkup(element);
  assert.match(html, /Receiving chat started and handover requested/);
  assert.match(html, /source agent will report when the file is ready/);
  assert.match(html, /click Import handover there/);
  assert.doesNotMatch(html, /Handover saved successfully|Import completed/);
  assert.deepEqual(calls, []);
  elements(element).find(node => node.type === 'button').props.onClick();
  assert.deepEqual(calls, ['synthetic-receiver']);
});

test('the receiving chat offers its assigned path by default and import asks no agent or directory', () => {
  const f = fixture({ agentId: 'synthetic-receiver', canImport: true, defaultHandoverPath: importValue.path });
  assert.equal(f.openImport.props.disabled, false); assert.equal(f.importForm.props.path, importValue.path);
  const body = importForm();
  assert.equal(body.fields.length, 1); assert.equal(body.fields[0].props.value, importValue.path);
  assert.doesNotMatch(body.html, /<select|Which agent|Project directory|Start chat/);
  assert.match(body.html, /assigned path does not mean the file is ready/);
  assert.match(body.html, /Import into this receiving chat/);
});

test('explicit import acts in the current receiver without creating or choosing another chat', async () => {
  let release;
  const f = fixture({ agentId: 'synthetic-receiver', canImport: true, defaultHandoverPath: importValue.path, full: true,
    importHandover: value => { f.calls.push(['import', value]); return new Promise(resolve => { release = resolve; }); } });
  const pending = f.importForm.props.submit({ path: '  ' + importValue.path + '  ' });
  await f.importForm.props.submit(importValue);
  assert.deepEqual(f.calls, [['import', importValue]]);
  let prevented = false; f.dialogs[1].props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); release(); await pending;
  assert.deepEqual(f.calls, [['import', importValue]], 'a full workspace still permits import into its existing receiver');
  const unavailable = fixture({ canImport: false });
  await unavailable.importForm.props.submit(importValue); assert.deepEqual(unavailable.calls, []);
});

test('creation and import drafts/errors remain independently available after failure', async () => {
  const create = createForm({ draft: createValue, error: 'Inspect the created receiving chat before trying again.' });
  assert.equal(create.select.props.value, 'claude'); assert.equal(create.field.props.value, '/example/project');
  assert.match(create.html, /role="alert"/);
  create.select.props.onChange({ target: { value: 'codex' } });
  create.field.props.onChange({ target: { value: '/example/another project' } });
  assert.deepEqual(create.calls, [['change', { provider: 'codex', cwd: '/example/project' }], ['change', { provider: 'claude', cwd: '/example/another project' }]]);
  const imported = importForm({ error: 'The file is not ready. Keep this assigned path.' });
  assert.equal(imported.fields[0].props.value, importValue.path); assert.match(imported.html, /Keep this assigned path/);
  imported.fields[0].props.onChange({ target: { value: '/tmp/another-transfer/handoff.md' } });
  assert.deepEqual(imported.calls, [['change', '/tmp/another-transfer/handoff.md']]);
  for (const overrides of [{ canImport: false }, { busy: true }, { path: ' ' }]) {
    const blocked = importForm(overrides); assert.equal(blocked.button.props.disabled, true);
    await blocked.element.props.onSubmit(submitEvent()); assert.deepEqual(blocked.calls, []);
  }
});

test('failed or unconfirmed requests never navigate or retry automatically', async () => {
  for (const result of ['reject', undefined, {}, { id: 'new' }]) {
    let attempts = 0;
    const f = fixture({ create: async () => { attempts++; if (result === 'reject') throw new Error('Check existing chats.'); return result; } });
    await f.createForm.props.submit(createValue);
    assert.equal(attempts, 1); assert.deepEqual(f.calls, []); await Promise.resolve(); assert.equal(attempts, 1);
  }
  let attempts = 0;
  const f = fixture({ canImport: true, importHandover: async () => { attempts++; throw new Error('Check this chat before retrying.'); } });
  await f.importForm.props.submit(importValue);
  assert.equal(attempts, 1); assert.deepEqual(f.calls, []); await Promise.resolve(); assert.equal(attempts, 1);
});
