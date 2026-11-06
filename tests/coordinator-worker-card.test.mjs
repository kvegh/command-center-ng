import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/coordinator-worker-card.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const { CoordinatorWorkerCard } = await import('data:text/javascript;base64,' + Buffer.from(compiled.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`)).toString('base64'));
const task = (state, values = {}) => ({ id: 'task-one', text: 'Choose the target', state, ...values });
const worker = values => ({ id: 'worker-one', name: 'Example project', goal: 'Finish the current work', progress: { summary: 'Earlier useful outcome' }, reportIntervalMinutes: 15, tasks: [], tracker: { status: 'ready' }, ...values });
const card = values => renderToStaticMarkup(React.createElement(CoordinatorWorkerCard, { worker: worker(values), statusBadge: React.createElement('span', { className: 'existing-badge' }, 'Running'), choose() { assert.fail('Rendering must not navigate.'); } }));

test('current input task titles replace the old summary and include every pending task', () => {
  const tasks = [task('blocked'), task('waiting_on_input', { id: 'task-two', text: 'Confirm the maintenance window' })];
  const html = card({ tasks });
  assert.match(html, /Needs input/);
  for (const item of tasks) assert.ok(html.includes(item.text));
  assert.equal((html.match(/class="coordinator-input-task"/g) || []).length, 2);
  assert.ok(!html.includes('Earlier useful outcome'));
});

test('normalized display states identify actual input needs without queued or ordinary work', () => {
  const html = card({ tasks: [
    task('blocked', { displayState: 'queued', text: 'Dependency queued' }),
    task('blocked', { id: 'dependent', blockedBy: ['prerequisite'], text: 'Another dependency' }),
    task('in_progress', { id: 'active', text: 'Active work' }),
    task('closed', { id: 'closed', text: 'Finished work' }),
    task('open', { id: 'open', text: 'Ordinary open work' }),
    task('blocked', { id: 'input', displayState: 'Needs Input', text: 'Choose a version' })
  ] });
  assert.match(html, /Choose a version/);
  for (const hidden of ['Dependency queued', 'Another dependency', 'Active work', 'Finished work', 'Ordinary open work']) assert.ok(!html.includes(hidden));
});

test('all supported input spellings are accepted while noninput work keeps the summary', () => {
  for (const state of ['blocked', 'needs_input', 'waiting-on-input', 'waitingOnApproval']) assert.match(card({ tasks: [task(state)] }), /Choose the target/);
  assert.match(card({ tasks: [task('in_progress')] }), /Earlier useful outcome/);
  assert.doesNotMatch(card({ tasks: [task('in_progress')] }), /Needs input/);
});

test('missing and unavailable trackers never present stale task needs', () => {
  for (const tracker of [undefined, { status: 'unavailable' }]) {
    const html = card({ tracker, tasks: [task('blocked')] });
    assert.match(html, /Earlier useful outcome/);
    assert.doesNotMatch(html, /Choose the target|Needs input/);
  }
});

test('empty input sets fall back from progress to goal without claims about questions', () => {
  assert.match(card({ progress: undefined }), /Finish the current work/);
  assert.match(card({ progress: { summary: '' } }), /Finish the current work/);
  assert.doesNotMatch(card({ tasks: [] }), /[Nn]o (?:pending|open|current) questions/);
});

test('name and cadence share the heading, with the supplied native badge preserved', () => {
  for (const [interval, label] of [[0, 'Never'], [5, '5min'], [15, '15min'], [60, '1h'], [undefined, 'Unknown'], [10, 'Unknown']]) {
    const html = card({ reportIntervalMinutes: interval });
    assert.ok(html.includes(`<span class="coordinator-worker-heading"><strong>Example project</strong><span class="coordinator-report-cadence">Reports: ${label}</span></span>`));
    assert.match(html, /<span class="existing-badge">Running<\/span>/);
    assert.equal((html.match(/<button/g) || []).length, 1);
  }
});

test('each card renders and navigates only its own worker', () => {
  const chosen = [];
  const first = CoordinatorWorkerCard({ worker: worker({ tasks: [task('blocked')] }), statusBadge: null, choose: id => chosen.push(id) });
  const second = CoordinatorWorkerCard({ worker: worker({ id: 'worker-two', name: 'Second project', tasks: [] }), statusBadge: null, choose: id => chosen.push(id) });
  first.props.onClick(); second.props.onClick();
  assert.deepEqual(chosen, ['worker-one', 'worker-two']);
  assert.doesNotMatch(renderToStaticMarkup(second), /Choose the target|Needs input/);
});

test('project names and task titles remain escaped text', () => {
  const html = card({ name: '<script>example()</script>', tasks: [task('blocked', { text: '<img src=x onerror=example()>' })] });
  assert.doesNotMatch(html, /<script>|<img /);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;img/);
});
