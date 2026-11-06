import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/escape-interrupt.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { canInterrupt, handleEscapeInterrupt } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const running = { agent: { id: 'visible-worker', status: 'running', turnId: 'current-turn' }, connected: true, blocked: false, pending: false };
function event(changes = {}) {
  return { key: 'Escape', defaultPrevented: false, repeat: false, isComposing: false, keyCode: 27,
    altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, target: null,
    preventDefault() { this.defaultPrevented = true; }, ...changes };
}

test('Escape interrupts only the eligible visible conversation for either provider', () => {
  for (const provider of ['codex', 'claude']) {
    const calls = []; const key = event();
    assert.equal(handleEscapeInterrupt(key, { ...running, agent: { ...running.agent, provider } }, id => calls.push(id)), true);
    assert.deepEqual(calls, ['visible-worker']);
    assert.equal(key.defaultPrevented, true);
  }
  const attention = { ...running.agent, status: 'attention' };
  assert.equal(canInterrupt(attention, true), true, 'same eligibility as the existing Interrupt control');
});

test('unavailable, completed and absent native turns are never interrupted', () => {
  const states = [
    { ...running, agent: undefined }, { ...running, connected: false },
    ...['idle', 'offline', 'error'].map(status => ({ ...running, agent: { ...running.agent, status } })),
    { ...running, agent: { ...running.agent, turnId: null } },
    { ...running, agent: { ...running.agent, turnId: '' } }
  ];
  for (const state of states) {
    const key = event();
    assert.equal(handleEscapeInterrupt(key, state, () => assert.fail('must not interrupt')), false);
    assert.equal(key.defaultPrevented, false);
  }
});

test('composition, repeat, modified keys and previously handled Escape keep their normal behavior', () => {
  const ignored = [{ key: 'Enter' }, { repeat: true }, { isComposing: true }, { keyCode: 229 },
    { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { defaultPrevented: true }];
  for (const changes of ignored) {
    let prevented = false;
    assert.equal(handleEscapeInterrupt(event({ ...changes, preventDefault: () => { prevented = true; } }), running,
      () => assert.fail('must not interrupt')), false);
    assert.equal(prevented, false);
  }
});

test('dialogs, resizing and an in-flight interrupt do not also stop an agent', () => {
  for (const changes of [{ blocked: true }, { pending: true }]) {
    const key = event();
    assert.equal(handleEscapeInterrupt(key, { ...running, ...changes }, () => assert.fail('must not interrupt')), false);
    assert.equal(key.defaultPrevented, false);
  }
});

test('question forms, dropdowns, branch review and separators retain Escape', () => {
  for (const selector of ['select', '[role="combobox"]', '[role="listbox"]', '[role="menu"]', '[role="separator"]', '[aria-expanded="true"]', 'input[type="search"]', '.question-card', '.branch-summary-review']) {
    const key = event({ target: { closest: selectors => { assert.ok(selectors.includes(selector)); return {}; } } });
    assert.equal(handleEscapeInterrupt(key, running, () => assert.fail('must not interrupt or answer a request')), false);
    assert.equal(key.defaultPrevented, false);
  }
});

test('Escape can interrupt from the composer without altering its draft', () => {
  const draft = { value: 'Keep this unfinished input', closest: () => null }; const calls = [];
  assert.equal(handleEscapeInterrupt(event({ target: draft }), running, id => calls.push(id)), true);
  assert.equal(draft.value, 'Keep this unfinished input');
  assert.deepEqual(calls, ['visible-worker']);
});

test('the workspace attaches a removable bubbling listener and shares the existing Interrupt action', async () => {
  const workspace = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /window\.addEventListener\('keydown', keydown\)/);
  assert.match(workspace, /window\.removeEventListener\('keydown', keydown\)/);
  assert.match(workspace, /document\.querySelector\('dialog\[open\], \.resizing'\)/);
  assert.match(workspace, /aria-keyshortcuts="Escape"/);
  assert.match(workspace, /onClick=\{\(\) => void interrupt\(active\.id\)\}/);
});
