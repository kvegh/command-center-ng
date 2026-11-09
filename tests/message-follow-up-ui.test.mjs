import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let copyExpression, sendExpression;
const visit = node => {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'CopyButton') copyExpression = node.parent.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'send') sendExpression = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}; visit(ast);
function evaluate(source, environment = {}, jsx = false) {
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, ...(jsx ? { jsx: ts.JsxEmit.React } : {}) } }).outputText;
  return new Function(...Object.keys(environment), code)(...Object.values(environment));
}
async function component(file) {
  const source = await readFile(new URL(`../src/${file}.tsx`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
  return import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
}
async function plainFunction(file, name) {
  const source = await readFile(new URL(`../src/${file}.tsx`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file + '.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  return evaluate(node.getText(ast).replace('export ', '') + `\nreturn ${name};`);
}
const { CopyButton } = await component('copy-button');
const { ChatDraft, clearSubmittedDraft } = await component('chat-draft');
const sendWithReceipt = await plainFunction('worker-status', 'sendWithReceipt');
const removeImageDrafts = await plainFunction('image-drafts', 'removeImageDrafts');
const copy = message => evaluate(`return (${copyExpression});`, { React, CopyButton, message }, true);

test('ordinary user text and image captions regain exact Copy this controls without history mutation', () => {
  for (const message of [
    { type: 'user', text: '  Original input\nwith preserved spacing  ' },
    { type: 'user', text: 'Caption accompanying an image', images: [{ url: '/existing-image' }] },
    { type: 'assistant', text: 'An assistant reply' }
  ]) {
    const before = structuredClone(message);
    const element = copy(message);
    assert.equal(element.type, CopyButton); assert.equal(element.props.text, message.text);
    assert.match(renderToStaticMarkup(element), /Copy this/);
    assert.deepEqual(message, before);
  }
  for (const text of ['', ' \n ']) assert.equal(copy({ type: 'user', text, images: [{ url: '/existing-image' }] }), false);
});

test('follow-up corrections append through the normal message route and preserve prior conversation and other drafts', async () => {
  const history = [{ id: 'original-user', type: 'user', text: 'Original instruction' }, { id: 'reply', type: 'assistant', text: 'Original response' }];
  const before = structuredClone(history), requests = [];
  const correction = 'Correction to my earlier input: use the selected test scope.';
  let drafts = { worker: correction, other: 'Keep the other conversation draft' }, images = { worker: [], other: [{ id: 'keep-image' }] };
  let busy = '', receipts = {};
  const send = evaluate(`return (${sendExpression});`, {
    active: { id: 'worker' }, readyToSend: true, draftText: correction, draftImages: [], sendWithReceipt, clearSubmittedDraft, removeImageDrafts,
    act: async (path, data) => { requests.push({ path, data }); return true; },
    setBusy: value => { busy = value; }, setDrafts: update => { drafts = update(drafts); },
    updateImages: update => { images = update(images); }, setReceipts: update => { receipts = update(receipts); }
  });
  await send();
  assert.deepEqual(requests, [{ path: 'agents/worker/message', data: { text: correction, images: [] } }]);
  assert.deepEqual(history, before); assert.equal(drafts.worker, ''); assert.equal(drafts.other, 'Keep the other conversation draft');
  assert.deepEqual(images.other, [{ id: 'keep-image' }]); assert.equal(receipts.worker.state, 'received'); assert.equal(busy, '');
});

test('correction drafts remain editable while native questions block sending', () => {
  let changed = '', sent = 0;
  const input = ChatDraft({ agentId: 'worker', name: 'Worker', text: 'Correction draft', placeholder: 'Follow up', disabled: false, canSubmit: false, onChange: value => { changed = value; }, onSubmit: () => { sent++; } });
  assert.equal(input.props.disabled, false);
  input.props.onChange({ target: { value: 'A clearer follow-up correction' } });
  input.props.onKeyDown({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: false }, preventDefault() {} });
  assert.equal(changed, 'A clearer follow-up correction'); assert.equal(sent, 0);
  assert.match(main, /!active.questions.length && activeOwnStatus !== 'attention'/);
});

test('withdrawn history editing has no frontend action/dialog/state/styles while branching and native forms remain', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /EditRewindAction|RewindDialog|rewindTarget|rewindable|rewindBlockedReason|rewind-preview|\/rewind|message-rewind/);
  assert.doesNotMatch(css, /\.rewind-/);
  await assert.rejects(access(new URL('../src/message-rewind.tsx', import.meta.url)), { code: 'ENOENT' });
  assert.match(main, /message.type === 'assistant' && message.branchable/);
  assert.match(main, /<NativeRequestCard/); assert.match(main, /<NativeMessageQuestions/);
  assert.match(main, /const draftLocked = branchDraftLocked\(active, !!active && handoffStarting.includes\(active.id\)\)/);
});
