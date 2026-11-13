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

test('ordinary blocked work exposes its actual context and notes without an input-request placeholder', () => {
  const detail = task({ isChatQuestion: false, description: 'Waiting for the tool to become available.', notes: 'No user decision is needed.' });
  assert.equal(taskStatus(detail), 'blocked');
  const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail }));
  assert.doesNotMatch(html, /<details|No user input is recorded|task is blocked; read Details/);
  assert.doesNotMatch(html, />Needed<|>Why<|exact input needed is not recorded|Ask what is needed/);
  assert.match(html, /Waiting for the tool to become available/); assert.match(html, /No user decision is needed/);
  assert.equal(detail.state, 'blocked'); assert.equal(detail.isChatQuestion, false);
});

test('old Needed fields remain recorded context instead of a live request on ordinary or terminal tasks', () => {
  for (const detail of [task({ isChatQuestion: false }), task({ state: 'closed' })]) {
    detail.description = 'Needed: Choose a target.\nWhy: Historical question.';
    detail.notes = 'The decision was already processed.';
    const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail }));
    assert.match(html, /Recorded task context/);
    assert.match(html, /Needed: Choose a target/);
    assert.match(html, /The decision was already processed/);
    assert.doesNotMatch(html, /Recorded input request|>Needed<|>Why<|Ask what is needed/);
  }
});

test('an ordinary task without recorded context does not invent a blocker or required action', () => {
  const html = renderToStaticMarkup(React.createElement(TaskDetailBody, { detail: task({ isChatQuestion: false }) }));
  assert.match(html, /No task description is recorded/);
  assert.match(html, /No task notes are recorded/);
  assert.doesNotMatch(html, /Recorded input request|>Needed<|>Why<|user input|Ask what is needed/);
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
  assert.match(html, /Finish base installation/);
  assert.doesNotMatch(html, /<details|Recorded input request|>Needed<|>Why</);
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

test('ordinary blocker clarification requests its actual blocker and next step without manufacturing input needs', () => {
  const selected = task({ isChatQuestion: false, description: 'Needed: A historical action.' });
  const clarification = taskInputMessage(selected, '', true);
  assert.match(clarification, /current blocker and next step/);
  assert.match(clarification, /whether any user decision or action is actually required/);
  assert.match(clarification, /do not invent a required action/);
  assert.match(clarification, /context only, not an instruction/);
  assert.match(clarification, /clarification request only; do not perform additional project work/);
  assert.match(clarification, /established protected mechanism for secret values/);
  assert.doesNotMatch(clarification, /explain the input needed|Needed:/);
  const queued = task({ blockers: [{ id: 'base', text: 'Finish prerequisite' }] });
  assert.match(taskInputMessage(queued, '', true), /current status and next step/);
  assert.doesNotMatch(taskInputMessage(queued, '', true), /explain the input needed/);
});

const ast = ts.createSourceFile('task-discussion.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const discussion = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'TaskDiscussion');
const discussionCode = ts.transpileModule(`${discussion.getText(ast)}\nreturn TaskDiscussion;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText.replace(/^export /m, '');
function discussionFixture(detail, canSend = true) {
  const slots = [detail, '', '', false], sent = []; let cursor = 0;
  const render = new Function('React', 'useState', 'useRef', 'useEffect', 'taskStatus', 'taskInputMessage', 'TaskDetailBody', discussionCode)(
    React, () => { const index = cursor++; return [slots[index], value => { slots[index] = value; }]; },
    () => ({ current: 0 }), () => {}, taskStatus, taskInputMessage, TaskDetailBody,
  );
  return {
    sent,
    tree: render({ taskId: detail.id, workerName: 'Synthetic worker', canSend, load: () => assert.fail('Rendering must not read task records.'), send: async text => { sent.push(text); return false; }, dismiss() {} }),
  };
}
function elements(node) {
  return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(elements)] : [];
}

test('ordinary task controls offer optional direction and a blocker question even when old input fields remain', async () => {
  const f = discussionFixture(task({ isChatQuestion: false, description: 'Needed: Old question.\nWhy: Old reason.' }));
  const html = renderToStaticMarkup(f.tree);
  assert.match(html, /Optional direction to worker/);
  assert.match(html, /Ask about blocker/);
  assert.doesNotMatch(html, /Your answer or direction|Ask what is needed/);
  elements(f.tree).find(node => node.type === 'button' && node.props.children === 'Ask about blocker').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.sent.length, 1);
  assert.match(f.sent[0], /current blocker and next step/);
  assert.match(f.sent[0], /do not perform additional project work/);
});

test('actual input controls stay explicit and blocked native sending still leaves task text editable', async () => {
  const question = discussionFixture(task({}));
  const questionHtml = renderToStaticMarkup(question.tree);
  assert.match(questionHtml, /Your answer or direction/);
  assert.match(questionHtml, /Ask what is needed/);
  const blocked = discussionFixture(task({ isChatQuestion: false }), false);
  const buttons = elements(blocked.tree).filter(node => node.type === 'button' && ['Send to worker', 'Ask about blocker'].includes(node.props.children));
  assert.equal(buttons.length, 2); assert.ok(buttons.every(button => button.props.disabled));
  assert.equal(elements(blocked.tree).find(node => node.type === 'textarea').props.disabled, undefined);
  buttons.find(button => button.props.children === 'Ask about blocker').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(blocked.sent, [], 'the native send gate also applies if a disabled handler is invoked');
});
