import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/browser-workspace.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { browserWorkspace, emptyBrowserWorkspace, loadBrowserWorkspace, saveBrowserWorkspace } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
function storage() { let text = null; return { getItem: () => text, setItem: (_, value) => { text = value; } }; }

test('browser draft, selected chat, tab order and reading position survive a fresh load', () => {
  const local = storage(); const value = { version: 1, selected: 'two', order: ['two', 'one'], drafts: { two: 'An unfinished thought.' }, positions: { two: 240 }, bottom: { two: false } };
  assert.equal(saveBrowserWorkspace(value, local), null); assert.deepEqual(loadBrowserWorkspace(local).state, value);
});

test('browser serialization excludes authentication and approval answers', () => {
  const local = storage(); const value = { ...emptyBrowserWorkspace(), drafts: { one: 'Draft' }, password: 'synthetic-only', approvalAnswers: { decision: 'approve' }, cookie: 'synthetic-only' };
  saveBrowserWorkspace(value, local); const raw = local.getItem(); assert.ok(!raw.includes('synthetic-only')); assert.ok(!raw.includes('approvalAnswers')); assert.equal(loadBrowserWorkspace(local).state.drafts.one, 'Draft');
});

test('blocked, corrupt and oversized browser storage preserve in-memory operation', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.ok(loadBrowserWorkspace(blocked).error); assert.ok(saveBrowserWorkspace(emptyBrowserWorkspace(), blocked));
  assert.deepEqual(loadBrowserWorkspace({ getItem: () => '{invalid' }).state, emptyBrowserWorkspace());
  assert.ok(loadBrowserWorkspace({ getItem: () => 'x'.repeat(1_500_001) }).error);
});

test('malformed browser preferences are bounded and invalid scroll values are dropped', () => {
  const drafts = Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['worker-' + i, 'Draft']));
  const value = browserWorkspace({ version: 1, selected: '../invalid', order: ['one', 'one', '../bad'], drafts, positions: { one: -5, two: Infinity, three: 42 }, bottom: { one: false, two: 'false' } });
  assert.equal(value.selected, ''); assert.deepEqual(value.order, ['one']); assert.equal(Object.keys(value.drafts).length, 32);
  assert.deepEqual(value.positions, { three: 42 }); assert.deepEqual(value.bottom, { one: false });
});

test('overview width persists in existing browser preferences while invalid values are dropped', () => {
  const local = storage(); const value = { ...emptyBrowserWorkspace(), overviewWidth: 520 };
  saveBrowserWorkspace(value, local); assert.equal(loadBrowserWorkspace(local).state.overviewWidth, 520);
  for (const width of [0, -1, 279, 801, Infinity, '520']) assert.equal(browserWorkspace({ version: 1, overviewWidth: width }).overviewWidth, undefined);
});
