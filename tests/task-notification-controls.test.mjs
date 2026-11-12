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
const { TaskNotifyToggle } = await import('data:text/javascript;base64,' + Buffer.from(compiled.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`)).toString('base64'));

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
