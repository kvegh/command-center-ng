import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/approval-focus.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { captureApprovalFocus } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
function fixture() {
  const calls = [];
  const context = { agentId: 'original-worker', blocked: false, revision: 1 };
  const input = { dataset: { agentId: 'original-worker' }, isConnected: true, disabled: false, value: 'Unsent draft',
    focus: options => calls.push(['focus', options]), setSelectionRange: (...positions) => calls.push(['caret', ...positions]) };
  return { input, context, calls, capture: () => captureApprovalFocus(input, () => ({ ...context })) };
}

test('confirmed approval focuses its editable draft without scrolling or changing text', () => {
  const { input, capture, calls } = fixture();
  const complete = capture();
  assert.deepEqual(calls, []);
  input.value += ' with newer typing';
  complete();
  assert.equal(input.value, 'Unsent draft with newer typing');
  assert.deepEqual(calls, [['focus', { preventScroll: true }], ['caret', input.value.length, input.value.length]]);
});

test('a delayed approval cannot focus a different worker or a replacement composer', () => {
  for (const change of [state => { state.context.agentId = 'another-worker'; }, state => { state.input.dataset.agentId = 'another-worker'; }, state => { state.input.isConnected = false; }]) {
    const state = fixture(); const complete = state.capture();
    change(state); complete(); assert.deepEqual(state.calls, []);
  }
});

test('switching away and back still cancels a delayed focus return', () => {
  const { capture, context, calls } = fixture(); const complete = capture();
  context.agentId = 'another-worker'; context.revision++;
  context.agentId = 'original-worker'; context.revision++;
  complete(); assert.deepEqual(calls, []);
});

test('dialog, hidden, locked, removed and unavailable inputs never receive delayed focus', () => {
  for (const change of [state => { state.context.blocked = true; }, state => { state.input.disabled = true; }, state => { state.context.agentId = null; }, state => { state.context.revision++; }]) {
    const state = fixture(); const complete = state.capture(); change(state); complete(); assert.deepEqual(state.calls, []);
  }
  const state = fixture(); state.context.blocked = true;
  const complete = state.capture(); state.context.blocked = false; complete(); assert.deepEqual(state.calls, []);
  captureApprovalFocus(null, () => ({ agentId: 'worker', blocked: false, revision: 1 }))();
});
