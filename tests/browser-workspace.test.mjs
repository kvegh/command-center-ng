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

test('composer height survives refresh, resets to automatic and rejects invalid preferences', () => {
  const local = storage();
  const value = { ...emptyBrowserWorkspace(), composerHeight: 340, drafts: { one: 'Keep this draft' } };
  assert.equal(saveBrowserWorkspace(value, local), null);
  assert.deepEqual(loadBrowserWorkspace(local).state, value);
  assert.equal(saveBrowserWorkspace({ ...value, composerHeight: undefined }, local), null);
  assert.equal(loadBrowserWorkspace(local).state.composerHeight, undefined);
  assert.equal(loadBrowserWorkspace(local).state.drafts.one, 'Keep this draft');
  for (const height of [0, -1, 79, 1201, Infinity, NaN, '340', {}, null]) {
    assert.equal(browserWorkspace({ version: 1, composerHeight: height }).composerHeight, undefined);
  }
  assert.equal(browserWorkspace(emptyBrowserWorkspace()).composerHeight, undefined);
});

test('overview section heights survive reload and reject invalid or unrelated preferences', () => {
  const local = storage();
  saveBrowserWorkspace({ ...emptyBrowserWorkspace(), overviewHeights: { tasks: 240, questions: 160, settings: 64 } }, local);
  assert.deepEqual(loadBrowserWorkspace(local).state.overviewHeights, { tasks: 240, questions: 160, settings: 64 });
  assert.deepEqual(browserWorkspace({ version: 1, overviewHeights: { tasks: Infinity, goal: 63, settings: 1201, questions: '180', password: 200 } }).overviewHeights, {});
  assert.equal(browserWorkspace({ version: 1 }).overviewHeights, undefined);
});

test('theme choice survives reload in the existing workspace without changing older saved objects', () => {
  const local = storage();
  for (const theme of ['classic', 'contrastful', 'light']) {
    const value = { ...emptyBrowserWorkspace(), drafts: { worker: 'Keep this draft' }, theme };
    assert.equal(saveBrowserWorkspace(value, local), null);
    assert.deepEqual(loadBrowserWorkspace(local).state, value);
  }
  const older = { version: 1, selected: 'worker', order: ['worker'], drafts: {}, positions: {}, bottom: {} };
  assert.deepEqual(browserWorkspace(older), older);
  assert.equal(browserWorkspace(older).theme, undefined, 'the app supplies classic without rewriting older data');
});

test('invalid theme preferences do not replace the default or affect other browser state', () => {
  for (const theme of ['dark', 'system', '', null, 0, true, {}, ['light']]) {
    const result = browserWorkspace({ ...emptyBrowserWorkspace(), selected: 'worker', theme });
    assert.equal(result.theme, undefined);
    assert.equal(result.selected, 'worker');
  }
});

test('each chat colour survives reload without changing another chat or existing preferences', () => {
  const local = storage();
  const value = {
    ...emptyBrowserWorkspace(), selected: 'one', theme: 'light', drafts: { one: 'Keep this draft' },
    chatColours: { one: 'cyan', two: 'violet', three: 'green', four: 'blue', five: 'teal', six: 'rose' },
    taskWatches: { one: ['project-123'] }
  };
  assert.equal(saveBrowserWorkspace(value, local), null);
  assert.deepEqual(loadBrowserWorkspace(local).state, value);
  const next = { ...value, chatColours: { ...value.chatColours, one: 'green' } };
  assert.equal(saveBrowserWorkspace(next, local), null);
  assert.deepEqual(loadBrowserWorkspace(local).state, next);
  assert.equal(loadBrowserWorkspace(local).state.chatColours.two, 'violet');
});

test('legacy amber chat preferences migrate to blue without losing other workspace preferences', () => {
  const local = storage();
  const older = {
    ...emptyBrowserWorkspace(), selected: 'legacy', theme: 'contrastful', order: ['legacy', 'other'],
    drafts: { legacy: 'Keep this draft' }, positions: { legacy: 125 }, bottom: { legacy: false },
    overviewWidth: 520, composerHeight: 300, overviewHeights: { tasks: 200 },
    taskWatches: { legacy: ['project-123'] }, chatColours: { legacy: 'amber', other: 'violet' },
  };
  const expected = { ...older, chatColours: { legacy: 'blue', other: 'violet' } };
  local.setItem('ccng.workspace.v1', JSON.stringify(older));
  assert.deepEqual(loadBrowserWorkspace(local).state, expected);
  assert.equal(saveBrowserWorkspace(expected, local), null);
  assert.deepEqual(loadBrowserWorkspace(local).state, expected, 'migration is stable across subsequent saves');
  assert.equal(older.chatColours.legacy, 'amber', 'sanitization does not mutate its input');
});

test('chat colours reject invalid values and worker IDs without adding defaults to older data', () => {
  const older = { ...emptyBrowserWorkspace(), selected: 'one', drafts: { one: 'Keep this draft' } };
  assert.deepEqual(browserWorkspace(older), older);
  assert.equal(browserWorkspace(older).chatColours, undefined);
  for (const chatColours of [null, 'cyan', ['cyan'], false, 1]) {
    assert.deepEqual(browserWorkspace({ ...older, chatColours }), older);
  }
  const chatColours = JSON.parse('{"one":"cyan","two":"violet","bad-colour":"red","../invalid":"green","constructor":"amber","prototype":"amber","__proto__":"cyan","wrong-type":{},"empty":""}');
  const result = browserWorkspace({ ...older, chatColours });
  assert.deepEqual(result.chatColours, { one: 'cyan', two: 'violet' });
  assert.equal(result.selected, 'one');
  assert.deepEqual(result.drafts, older.drafts);
});

test('chat colour preference count uses the existing workspace bound', () => {
  const chatColours = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`worker-${i}`, i % 2 ? 'cyan' : 'amber']));
  const result = browserWorkspace({ ...emptyBrowserWorkspace(), chatColours });
  assert.equal(Object.keys(result.chatColours).length, 32);
  assert.equal(result.chatColours['worker-0'], undefined);
  assert.equal(result.chatColours['worker-39'], 'cyan');
});

test('task notification subscriptions survive reload including hierarchical Beads IDs', () => {
  const local = storage();
  const value = { ...emptyBrowserWorkspace(), taskWatches: { worker: ['project-123', 'project-123.4'] } };
  assert.equal(saveBrowserWorkspace(value, local), null);
  assert.deepEqual(loadBrowserWorkspace(local).state, value);
  assert.equal(browserWorkspace(emptyBrowserWorkspace()).taskWatches, undefined);
});

test('task subscriptions reject malformed IDs and are bounded without storing notification content', () => {
  const value = browserWorkspace({ version: 1, taskWatches: {
    worker: ['project-123', 'project-123', '../invalid', '', 'constructor', ...Array.from({ length: 150 }, (_, i) => `project-${i}`)],
    '../invalid': ['project-123'], other: 'project-123'
  }, notifications: ['Do not persist message or question text'] });
  assert.equal(value.taskWatches.worker.length, 128);
  assert.equal(new Set(value.taskWatches.worker).size, 128);
  assert.ok(value.taskWatches.worker.every(id => !['../invalid', '', 'constructor'].includes(id)));
  assert.deepEqual(Object.keys(value.taskWatches), ['worker']);
  assert.equal(value.notifications, undefined);
});
