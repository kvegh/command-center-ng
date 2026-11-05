import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/chat-draft.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const { ChatDraft, clearSubmittedDraft } = await import('data:text/javascript;base64,' + Buffer.from(compiled.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`)).toString('base64'));
const props = { agentId: 'worker', name: 'Worker', text: 'Saved draft', placeholder: 'Draft while answering…', disabled: false, canSubmit: false, onChange: () => {}, onSubmit: () => {} };

test('a draft stays editable and retains its text while submission is unavailable', () => {
  let changed;
  const element = ChatDraft({ ...props, onChange: value => { changed = value; } });
  const html = renderToStaticMarkup(element);
  assert.doesNotMatch(html, /disabled|readonly/i);
  assert.match(html, /Saved draft/);
  element.props.onChange({ target: { value: 'Continue drafting while a question waits.' } });
  assert.equal(changed, 'Continue drafting while a question waits.');
});

test('Enter does not submit or swallow a newline while a question blocks sending', () => {
  let submitted = 0; let prevented = 0;
  const element = ChatDraft({ ...props, onSubmit: () => { submitted++; } });
  element.props.onKeyDown({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: false }, preventDefault: () => { prevented++; } });
  assert.equal(submitted, 0);
  assert.equal(prevented, 0);
});

test('ready drafts submit on Enter while Shift+Enter and composition remain ordinary input', () => {
  let submitted = 0; let prevented = 0;
  const element = ChatDraft({ ...props, canSubmit: true, onSubmit: () => { submitted++; } });
  const event = { key: 'Enter', shiftKey: false, nativeEvent: { isComposing: false }, preventDefault: () => { prevented++; } };
  element.props.onKeyDown({ ...event, shiftKey: true });
  element.props.onKeyDown({ ...event, nativeEvent: { isComposing: true } });
  assert.equal(submitted, 0);
  element.props.onKeyDown(event);
  assert.equal(submitted, 1);
  assert.equal(prevented, 1);
});

test('a delayed send acknowledgement preserves newer typing and another conversation draft', () => {
  const drafts = { worker: 'Already sent', other: 'Unrelated draft' };
  assert.deepEqual(clearSubmittedDraft(drafts, 'worker', 'Already sent'), { worker: '', other: 'Unrelated draft' });
  const newer = { ...drafts, worker: 'Text typed while the send was pending' };
  assert.equal(clearSubmittedDraft(newer, 'worker', 'Already sent'), newer);
  assert.equal(drafts.worker, 'Already sent');
});

test('pasted image files are routed to their originating editable conversation while ordinary text paste stays native', () => {
  const image = { type: 'image/png', size: 100 };
  const delivered = [];
  let prevented = 0;
  const element = ChatDraft({ ...props, agentId: 'original-chat', onPasteImages: (files, agentId) => delivered.push({ files, agentId }) });
  const event = items => ({ clipboardData: { items }, preventDefault: () => { prevented++; } });
  element.props.onPaste(event([{ kind: 'string', type: 'text/html', getAsFile: () => { throw new Error('Rich-text images must not be fetched.'); } }, { kind: 'string', type: 'text/plain' }]));
  assert.deepEqual(delivered, []);
  element.props.onPaste(event([{ kind: 'file', type: 'image/png', getAsFile: () => image }, { kind: 'string', type: 'text/plain' }, { kind: 'file', type: 'application/pdf', getAsFile: () => ({}) }, { kind: 'file', type: 'image/png', getAsFile: () => null }]));
  assert.deepEqual(delivered, [{ agentId: 'original-chat', files: [image] }]);
  assert.equal(prevented, 0, 'mixed clipboard text is still inserted by the browser');
  const locked = ChatDraft({ ...props, disabled: true, onPasteImages: () => { throw new Error('A locked handoff draft cannot receive images.'); } });
  locked.props.onPaste(event([{ kind: 'file', type: 'image/png', getAsFile: () => image }]));
});
