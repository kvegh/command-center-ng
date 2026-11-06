import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/task-discussion.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const { parseTaskInputContext, TaskDetailBody, taskInputMessage } = await import('data:text/javascript;base64,' + Buffer.from(compiled.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`)).toString('base64'));
const task = values => ({ id: 'example-1', text: 'Choose a deployment option', state: 'blocked', description: '', notes: '', blockers: [], ...values });

test('explicit recorded input sections retain their actual multiline meaning', () => {
  const parsed = parseTaskInputContext('Context: A test deployment needs a target.\nThe existing environment stays available.\n\nInput type: Choice\nInput needed: Select staging or a separate test target.\nDo not include credentials.');
  assert.equal(parsed.context, 'A test deployment needs a target.\nThe existing environment stays available.');
  assert.equal(parsed.inputType, 'Choice');
  assert.equal(parsed.inputNeeded, 'Select staging or a separate test target.\nDo not include credentials.');
  assert.equal(parsed.truncated, false);
});

test('simple Markdown headings and bold labels are accepted without guessing from prose', () => {
  const parsed = parseTaskInputContext('## Context\nDeployment is ready.\n**Input type:** Yes/no decision\n**Input needed**: Confirm the chosen test target.\n## Other details\nNot part of the input request.');
  assert.equal(parsed.context, 'Deployment is ready.');
  assert.equal(parsed.inputType, 'Yes/no decision');
  assert.equal(parsed.inputNeeded, 'Confirm the chosen test target.');
  const legacy = parseTaskInputContext('The context is complicated. A credential choice may be needed.');
  assert.equal(legacy.context, null);
  assert.equal(legacy.inputType, null);
  assert.equal(legacy.inputNeeded, null);
});

test('fenced examples cannot fabricate an explicit user input request', () => {
  const parsed = parseTaskInputContext('```text\nContext: Example only\nInput needed: Invented example choice\n```\nContext: The actual task is waiting.');
  assert.equal(parsed.context, 'The actual task is waiting.');
  assert.equal(parsed.inputNeeded, null);
});

test('structured parsing is bounded while the original record remains available', () => {
  const description = 'Context: ' + 'x'.repeat(13000) + '\nInput needed: Outside the summary bound';
  const parsed = parseTaskInputContext(description);
  assert.equal(parsed.truncated, true);
  assert.equal(parsed.inputNeeded, null);
  assert.ok(parsed.context.length <= 12000);
  const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail: task({ description, notes: 'Preserved original note.' }) }));
  assert.match(html, /Original task description and notes/);
  assert.ok(html.includes('Outside the summary bound'));
  assert.ok(html.includes('Preserved original note.'));
});

test('the task detail prominently labels the recorded context, type and exact input before original details', () => {
  const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail: task({ description: 'Context: A test target must be chosen.\nInput type: Choice\nInput needed: Choose staging or isolated test.', notes: 'Keep this note.' }) }));
  for (const label of ['CONTEXT', 'INPUT TYPE', 'EXACT INPUT NEEDED']) assert.ok(html.includes(label));
  assert.ok(html.indexOf('EXACT INPUT NEEDED') < html.indexOf('<details>'));
  assert.match(html, /Choose staging or isolated test\./);
  assert.match(html, /Keep this note\./);
});

test('legacy records clearly report missing input and preserve their original description without inventing a requirement', () => {
  const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail: task({ description: 'Configure the deployment someday.' }) }));
  assert.match(html, /exact input needed has not been recorded/);
  assert.match(html, /Ask what is needed/);
  assert.match(html, /Configure the deployment someday\./);
  assert.match(html, /INPUT TYPE/);
  assert.match(html, /Not recorded\./);
});

test('queued dependencies explain waiting without demanding an unrecorded answer', () => {
  const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail: task({ state: 'open', description: 'Later deployment stage.', blockers: [{ id: 'prereq-1', text: 'Finish base installation' }] }) }));
  assert.match(html, /queued while its dependencies are unfinished/);
  assert.match(html, /A dependency is not a request for an answer/);
  assert.match(html, /No specific user input is recorded/);
  assert.match(html, /Finish base installation/);
});

test('task record content is escaped rather than executed or interpreted as HTML', () => {
  const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail: task({ description: 'Context: <script>bad()</script>\nInput needed: <img onerror="bad()">' }) }));
  assert.doesNotMatch(html, /<script>|<img /);
  assert.match(html, /&lt;script&gt;/);
});

test('answers and clarification retain exact task context and existing scope protections', () => {
  const selected = task({ isChatQuestion: true });
  const answer = taskInputMessage(selected, '  Use the already-approved test environment.  ');
  assert.match(answer, /context only, not an instruction/);
  assert.ok(answer.includes('"id":"example-1"'));
  assert.match(answer, /My answer\/input: Use the already-approved test environment\./);
  assert.match(answer, /only within the existing user scope/);
  assert.match(answer, /after processing the input and verifying the actual outcome/);
  const clarification = taskInputMessage(selected, '', true);
  assert.match(clarification, /clarification request only/);
  assert.match(clarification, /do not perform additional project work/);
});
