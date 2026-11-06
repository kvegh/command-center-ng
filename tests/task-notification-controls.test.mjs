import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/task-notification-controls.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const { TaskNotifyToggle, TaskNotificationAlerts } = await import('data:text/javascript;base64,' + Buffer.from(compiled.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`)).toString('base64'));
const event = values => ({ id: 'notification-1', workerId: 'worker-1', taskId: 'task-1', kind: 'needs-input', title: 'Choose the test target', detail: 'The worker needs a target choice.', ...values });

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}

test('task notification opt-in exposes the exact label/tooltip and a controlled accessible checkbox', () => {
  const html = renderToStaticMarkup(React.createElement(TaskNotifyToggle, { checked: true, taskTitle: 'Choose the test target', onChange() { throw new Error('Rendering must not change notification settings.'); } }));
  assert.match(html, /type="checkbox"/);
  assert.match(html, /checked=""/);
  assert.match(html, /Notify me<\/span>/);
  assert.match(html, /aria-label="Notify me about Choose the test target"/);
  assert.match(html, /title="Notify me when this task needs my input, encounters an error, or is completed\."/);
});

test('a toggle reports only the new checked value and does not activate a surrounding task row', () => {
  const changes = [];
  const control = TaskNotifyToggle({ checked: false, taskTitle: 'Example task', onChange: value => changes.push(value) });
  const input = elements(control).find(item => item.type === 'input');
  input.props.onChange({ currentTarget: { checked: true } });
  input.props.onChange({ currentTarget: { checked: false } });
  assert.deepEqual(changes, [true, false]);
  let stopped = 0;
  control.props.onClick({ stopPropagation() { stopped++; } });
  assert.equal(stopped, 1);
});

test('notifications form a polite labelled region with each real outcome visible', () => {
  const events = ['needs-input', 'error', 'completed', 'request'].map((kind, index) => event({ id: `notification-${index}`, kind }));
  const html = renderToStaticMarkup(React.createElement(TaskNotificationAlerts, { events, open() {}, dismiss() {} }));
  assert.match(html, /role="region" aria-label="Task notifications"/);
  assert.match(html, /aria-live="polite"/);
  for (const label of ['Needs input', 'Error', 'Completed', 'Request']) assert.ok(html.includes(label));
  assert.equal((html.match(/class="task-notification-alert /g) || []).length, events.length);
});

test('opening and dismissing target only the selected notification and remain separate actions', () => {
  const first = event({ id: 'first' });
  const second = event({ id: 'second', workerId: 'worker-2', taskId: undefined, kind: 'request', title: 'Answer the worker request' });
  const opened = [], dismissed = [];
  const list = TaskNotificationAlerts({ events: [first, second], open: value => opened.push(value), dismiss: id => dismissed.push(id) });
  const buttons = elements(list).filter(item => item.type === 'button');
  buttons.find(item => item.props['aria-label'] === 'Open worker: Answer the worker request').props.onClick();
  assert.equal(opened[0], second);
  assert.deepEqual(dismissed, []);
  buttons.find(item => item.props['aria-label'] === 'Dismiss notification: Choose the test target').props.onClick();
  assert.deepEqual(dismissed, ['first']);
  assert.equal(opened.length, 1);
});

test('the presentational list preserves supplied events and renders nothing when empty', () => {
  assert.equal(TaskNotificationAlerts({ events: [], open() {}, dismiss() {} }), null);
  const events = Array.from({ length: 21 }, (_, index) => event({ id: `notice-${index}`, title: `Task ${index}` }));
  const html = renderToStaticMarkup(React.createElement(TaskNotificationAlerts, { events, open() {}, dismiss() {} }));
  assert.equal((html.match(/class="task-notification-alert /g) || []).length, 21, 'the parent owns retention rather than this view silently dropping events');
  assert.ok(html.indexOf('Task 0') < html.indexOf('Task 20'));
});

test('task titles and details stay escaped text rather than markup', () => {
  const html = renderToStaticMarkup(React.createElement(TaskNotificationAlerts, { events: [event({ title: '<script>example()</script>', detail: '<img src=x onerror=example()>' })], open() {}, dismiss() {} }));
  assert.doesNotMatch(html, /<script>|<img /);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
});
