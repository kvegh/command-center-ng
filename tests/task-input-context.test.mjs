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
const { parseTaskInputContext, taskInputPreview, TaskDetailBody, taskInputMessage, taskStatus } = await import('data:text/javascript;base64,' + Buffer.from(compiled.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`)).toString('base64'));
const task = values => ({ id: 'example-1', text: 'Choose a deployment option', state: 'blocked', description: '', notes: '', blockers: [], isChatQuestion: true, ...values });

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
  assert.match(html, /<summary>Details<\/summary>/);
  assert.ok(html.includes('Outside the summary bound'));
  assert.ok(html.includes('Preserved original note.'));
});

test('the task detail leads with Needed and Why while preserving type and original details inside the closed disclosure', () => {
  const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail: task({ description: 'Context: A test target must be chosen.\nInput type: Choice\nInput needed: Choose staging or isolated test.', notes: 'Keep this note.' }) }));
  const upfront = html.slice(0, html.indexOf('<details>'));
  assert.match(upfront, />Needed<\/h3>/); assert.match(upfront, />Why<\/h3>/);
  assert.ok(upfront.indexOf('Choose staging or isolated test.') < upfront.indexOf('A test target must be chosen.'));
  assert.doesNotMatch(upfront, /CONTEXT|INPUT TYPE|EXACT INPUT NEEDED|Choice|Keep this note/);
  assert.doesNotMatch(html, /<details open/);
  assert.match(html, /Choose staging or isolated test\./);
  assert.match(html, /Keep this note\./);
});

test('legacy records clearly report missing input and preserve their original description without inventing a requirement', () => {
  const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail: task({ description: 'Configure the deployment someday.' }) }));
  assert.match(html, /exact input needed is not recorded/);
  assert.match(html, /Ask what is needed/);
  assert.match(html, /Configure the deployment someday\./);
  assert.match(html, /worker has not recorded a short explanation/);
});

test('ordinary blocked work does not become an unrecorded human question', () => {
  const detail = task({ isChatQuestion: false, description: 'Waiting for the tool to become available.', notes: 'No user decision is needed.' });
  assert.equal(taskStatus(detail), 'blocked');
  const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail }));
  const upfront = html.slice(0, html.indexOf('<details>'));
  assert.match(upfront, /No user input is recorded for this task/);
  assert.match(upfront, /task is blocked; read Details/);
  assert.doesNotMatch(upfront, /exact input needed is not recorded|Ask what is needed/);
  assert.match(html, /Waiting for the tool to become available/); assert.match(html, /No user decision is needed/);
  assert.equal(detail.state, 'blocked'); assert.equal(detail.isChatQuestion, false);
});

test('only explicit question metadata or input states classify input, with dependencies still queued', () => {
  assert.equal(taskStatus(task({ state: 'in_progress' })), 'needs input');
  for (const state of ['needs_input', 'waiting-on-input', 'waitingOnApproval']) assert.equal(taskStatus(task({ state, isChatQuestion: false })), 'needs input');
  for (const state of ['open', 'in_progress', 'blocked', 'closed', 'failed', 'withdrawn']) assert.equal(taskStatus(task({ state, isChatQuestion: false })), state.replaceAll('_', ' '));
  for (const state of ['closed', 'completed', 'failed', 'error', 'cancelled', 'withdrawn']) assert.notEqual(taskStatus(task({ state })), 'needs input');
  assert.equal(taskStatus(task({ blockers: [{ id: 'base', text: 'Finish prerequisite' }] })), 'queued');
  assert.equal(taskStatus(task({ isChatQuestion: false, description: 'Needed: Choose a target.\nWhy: Old notes remain.' })), 'blocked', 'description fields are not current question metadata');
});

test('queued dependencies explain waiting without demanding an unrecorded answer', () => {
  const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail: task({ state: 'open', description: 'Later deployment stage.', blockers: [{ id: 'prereq-1', text: 'Finish base installation' }] }) }));
  assert.match(html, /queued while its dependencies are unfinished/);
  assert.match(html, /A dependency is not a request for an answer/);
  assert.match(html, /No answer is needed while this task waits for dependencies/);
  assert.match(html, /Finish base installation/);
});

test('concise Needed and Why fields work with plain, Markdown and bold labels and stop at Details', () => {
  for (const description of [
    'Needed: Choose a test target.\nWhy: The deployment needs one destination.\nDetails: A much longer background follows.',
    '## Needed\nChoose a test target.\n## Why\nThe deployment needs one destination.\n## Details\nA much longer background follows.',
    '**Needed:** Choose a test target.\n**Why**: The deployment needs one destination.\n## Details\nA much longer background follows.',
  ]) {
    const input = parseTaskInputContext(description);
    assert.equal(input.inputNeeded, 'Choose a test target.');
    assert.equal(input.context, 'The deployment needs one destination.');
    const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail: task({ description }) }));
    assert.doesNotMatch(html.slice(0, html.indexOf('<details>')), /much longer background/);
    assert.match(html.slice(html.indexOf('<details>')), /much longer background/);
  }
});

test('long legacy requests show only bounded exact excerpts and retain every original word in Details', () => {
  const question = Array.from({ length: 90 }, (_, index) => `action${index}`).join(' ');
  const reason = Array.from({ length: 60 }, (_, index) => `reason${index}`).join(' ');
  const description = `Context: ${reason}\nInput type: Confirmation\nInput needed: ${question}`;
  const needed = taskInputPreview(question, 30, 2); const why = taskInputPreview(reason, 20, 1);
  assert.equal(needed.text, question.split(' ').slice(0, 30).join(' ') + '…');
  assert.equal(why.text, reason.split(' ').slice(0, 20).join(' ') + '…');
  assert.equal(needed.shortened, true); assert.equal(why.shortened, true);
  const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail: task({ description, notes: 'Important original note.' }) }));
  const upfront = html.slice(0, html.indexOf('<details>')); const details = html.slice(html.indexOf('<details>'));
  assert.match(upfront, /Short preview/); assert.match(upfront, /action29…/); assert.doesNotMatch(upfront, /action30|reason20/);
  assert.ok(details.includes(question)); assert.ok(details.includes(reason)); assert.match(details, /Important original note/);
});

test('Needed has at most two sentence excerpts and Why one, without changing full recorded requests', () => {
  const needed = taskInputPreview('Choose the target. Confirm the window. Then explain the earlier experiments.', 30, 2);
  assert.deepEqual(needed, { text: 'Choose the target. Confirm the window.', shortened: true });
  const why = taskInputPreview('The deployment needs a target. Earlier work is preserved.', 20, 1);
  assert.deepEqual(why, { text: 'The deployment needs a target.', shortened: true });
  assert.deepEqual(taskInputPreview('Choose the target.', 30, 2), { text: 'Choose the target.', shortened: false });
});

test('fenced commands stay in Details and are never exposed as a cut-off command preview', () => {
  const command = 'python3 /example/check_status.py --read-only --target example';
  const description = `Needed: Run the recorded check and report its result.\n\n\`\`\`sh\n${command}\n\`\`\`\nWhy: The saved state needs confirmation.`;
  const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail: task({ description }) }));
  const upfront = html.slice(0, html.indexOf('<details>'));
  assert.match(upfront, /Run the recorded check and report its result/);
  assert.doesNotMatch(upfront, /python3|check_status|--read-only/);
  assert.ok(html.slice(html.indexOf('<details>')).includes(command));
  const codeOnly = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail: task({ description: `Needed:\n\`\`\`sh\n${command}\n\`\`\`` }) }));
  assert.match(codeOnly, /Read the recorded action in Details/);
});

test('concise field names inside fenced examples cannot become the real request', () => {
  const parsed = parseTaskInputContext('```text\nNeeded: Example only\nWhy: Example reason\n```\nNeeded: Confirm the test result.\nWhy: The check finished.');
  assert.equal(parsed.inputNeeded, 'Confirm the test result.'); assert.equal(parsed.context, 'The check finished.');
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
  assert.match(clarification, /Needed: the direct question or action, at most 30 words/);
  assert.match(clarification, /Why: one short reason, at most 20 words/);
  assert.match(clarification, /Details: put exact commands and background here/);
  assert.match(clarification, /established protected mechanism for secret values/);
  assert.match(clarification, /clarification request only/);
  assert.match(clarification, /do not perform additional project work/);
});
