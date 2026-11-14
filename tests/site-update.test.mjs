import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function compiled(source) {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}
const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [];
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
    && node.arguments[0]?.getText(ast).includes('window.location.reload()')) effects.push(node.arguments[0]);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(effects.length, 1, 'exercise the actual site refresh effect');
const { makeEffect } = await compiled(`export function makeEffect({ authenticated, state, siteUpdate, VERSION, busy, dialog, taskAgent, taskQuestion, returnReviews, imageDrafts, messageQuestionInputs, document, composerInput, browserSave, window }) { return ${effects[0].getText(ast)}; }`);
const browserSource = await readFile(new URL('../src/browser-workspace.ts', import.meta.url), 'utf8');
const { saveBrowserWorkspace, loadBrowserWorkspace } = await compiled(browserSource);
function fixture() {
  let saved = null, saves = 0, reloads = 0;
  const storage = { getItem: () => saved, setItem: (_, text) => { saved = text; } };
  const workspace = { version: 1, selected: 'worker', order: ['worker'], drafts: { worker: 'Keep my unsent message' }, positions: { worker: 240 }, bottom: { worker: false } };
  const composer = { value: workspace.drafts.worker };
  const fields = [composer], nativeForms = [];
  const env = {
    authenticated: true, state: null, siteUpdate: { current: { instanceId: '', pending: false, reloading: false } }, VERSION: '1.28.0',
    busy: '', dialog: false, taskAgent: null, taskQuestion: null, returnReviews: [], imageDrafts: {}, messageQuestionInputs: {},
    document: { querySelectorAll: () => fields, querySelector: selector => { assert.equal(selector, '.native-request form, .native-request[aria-busy="true"]'); return nativeForms[0] || null; } }, composerInput: { current: composer },
    browserSave: { current: () => { saves++; return saveBrowserWorkspace(workspace, storage) === null; } },
    window: { location: { reload: () => { assert.equal(loadBrowserWorkspace(storage).state.drafts.worker, workspace.drafts.worker); reloads++; } } },
  };
  const render = (instance = 'first', extra = {}) => {
    env.state = { serverInstanceId: instance, version: '1.28.0', agents: [], ...extra }; makeEffect(env)();
  };
  return { env, fields, nativeForms, render, workspace, restored: () => loadBrowserWorkspace(storage).state, counts: () => ({ saves, reloads }) };
}

test('backend replacement refreshes once after flushing text, chat and reading position', () => {
  const f = fixture(); f.render(); assert.deepEqual(f.counts(), { saves: 0, reloads: 0 });
  f.render('replacement'); f.render('replacement');
  assert.deepEqual(f.counts(), { saves: 1, reloads: 1 }); assert.deepEqual(f.restored(), f.workspace);
});

test('ordinary snapshots and network/native reconnections to the same backend do not refresh', () => {
  const f = fixture(); f.render();
  for (const connected of [false, true, false, true]) f.render('first', { connected, error: connected ? null : 'Temporary disconnection' });
  assert.deepEqual(f.counts(), { saves: 0, reloads: 0 });
});

test('an outdated frontend refreshes once on its first current server snapshot', () => {
  const f = fixture(); f.render('first', { version: '1.29.0' }); f.render('first', { version: '1.29.0' });
  assert.deepEqual(f.counts(), { saves: 1, reloads: 1 });
});

test('initial authentication, unknown backend and workspace restoration cannot trigger refresh', () => {
  const f = fixture(); f.env.authenticated = false; f.render();
  f.env.authenticated = true; f.render('');
  f.render('first', { restoration: { status: 'restoring' } }); f.render();
  f.render('second', { restoration: { status: 'pending' } });
  assert.deepEqual(f.counts(), { saves: 0, reloads: 0 });
  f.render('second'); assert.equal(f.counts().reloads, 1);
});

test('pending refresh waits for in-memory attachments, answer drafts, open forms and current requests', () => {
  for (const [key, blocked, clear] of [
    ['imageDrafts', { otherChat: [{ id: 'image' }] }, {}],
    ['messageQuestionInputs', { question: { draft: 'Unsent answer', delivery: null } }, {}],
    ['busy', 'sending', ''], ['dialog', true, false], ['taskAgent', { id: 'worker' }, null],
    ['taskQuestion', { taskId: 'task' }, null], ['returnReviews', ['worker'], []],
  ]) {
    const f = fixture(); f.render(); f.env[key] = blocked; f.render('replacement');
    assert.equal(f.counts().reloads, 0, key); f.env[key] = clear; f.render('replacement');
    assert.equal(f.counts().reloads, 1, key);
  }
  const f = fixture(); f.render(); f.fields.push({ value: 'Unsent form value' }); f.render('replacement');
  assert.equal(f.counts().reloads, 0); f.fields.pop(); f.render('replacement'); assert.equal(f.counts().reloads, 1);
});

test('failed browser persistence retains the page and a later successful save permits refresh', () => {
  const f = fixture(); f.render(); const save = f.env.browserSave.current;
  f.env.browserSave.current = () => false; f.render('replacement'); assert.equal(f.counts().reloads, 0);
  f.env.browserSave.current = save; f.render('replacement'); assert.equal(f.counts().reloads, 1);
});

test('a native form with only dropdown or button choices retains its local answer until resolved', () => {
  const f = fixture(); f.render(); f.nativeForms.push({ selectedAnswer: 'Unsent dropdown choice' });
  f.render('replacement'); assert.equal(f.counts().reloads, 0);
  f.nativeForms.pop(); f.render('replacement'); assert.equal(f.counts().reloads, 1);
});

test('a pending native submission delays refresh until its receipt settles', () => {
  const f = fixture(); f.render(); f.nativeForms.push({ ariaBusy: true });
  f.render('replacement'); assert.equal(f.counts().reloads, 0);
  f.nativeForms.pop(); f.render('replacement'); assert.equal(f.counts().reloads, 1);
});

test('a responding request in another chat or child delays refresh while its card is unmounted', () => {
  for (const request of [{ questions: [{ responding: true }] }, { questions: [], workers: [{ questions: [{ responding: true }] }] }]) {
    const f = fixture(); f.render(); f.render('replacement', { agents: [request] });
    assert.equal(f.counts().reloads, 0); f.render('replacement'); assert.equal(f.counts().reloads, 1);
  }
});
