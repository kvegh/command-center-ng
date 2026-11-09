import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/worker-settings.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  .replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
const { WorkerSettings } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const defaults = { agentId: 'worker-one', minutes: 15, disabled: false, paused: false, save: async () => true, reportNow: async () => true };
const advanced = React.createElement('select', { 'aria-label': 'Worker model', defaultValue: 'example-model' }, React.createElement('option', { value: 'example-model' }, 'Example model'));
function fixture(props = {}) {
  let element;
  function Capture() { element = WorkerSettings({ ...defaults, children: advanced, ...props }); return null; }
  renderToStaticMarkup(React.createElement(Capture));
  return { element, html: renderToStaticMarkup(element) };
}
function descendants(element, predicate) {
  const found = [];
  const visit = node => {
    if (!React.isValidElement(node)) return;
    if (predicate(node)) found.push(node);
    React.Children.forEach(node.props.children, visit);
  };
  visit(element); return found;
}

test('compact settings collapse cadence and model controls into one row with Report now outside', () => {
  const { element, html } = fixture({ compact: true });
  assert.match(html, /class="worker-settings compact"/);
  assert.match(html, /<details class="worker-settings-disclosure"><summary class="worker-settings-summary">Worker settings <span class="worker-settings-cadence">Reports: 15min<\/span><\/summary>/);
  const disclosure = descendants(element, node => node.type === 'details')[0];
  assert.equal(disclosure.props.open, false);
  assert.equal(descendants(disclosure, node => node.type === 'input').length, 4);
  assert.equal(disclosure.props.children[4], advanced, 'the advanced subtree stays rendered inside the native disclosure');
  const directChildren = React.Children.toArray(element.props.children);
  const mobileReport = directChildren.find(node => node.type === 'button');
  assert.match(mobileReport.props.className, /worker-report-mobile/);
  assert.equal(mobileReport.props.children, 'Report now');
  assert.equal(mobileReport.props.disabled, false);
  assert.doesNotMatch(html, /Command Center schedules/);
});

test('desktop retains open advanced settings and uses the same subtree across breakpoint states', () => {
  for (const compact of [false, true, false]) {
    const { element, html } = fixture({ compact });
    const disclosure = descendants(element, node => node.type === 'details')[0];
    assert.equal(disclosure.props.open, !compact);
    assert.equal(disclosure.props.children[4], advanced);
    assert.equal(descendants(element, node => node.type === 'select').length, 1);
    if (!compact) {
      assert.match(html, /<details class="worker-settings-disclosure" open="">/);
      assert.match(html, /Command Center schedules reports at this interval/);
      assert.doesNotMatch(html, /class="worker-settings compact"/);
    }
  }
});

test('queued, generating, setting updates and report errors remain outside collapsed settings', () => {
  for (const [props, expected] of [
    [{ reportState: 'queued' }, /Report queued for the next safe checkpoint/],
    [{ reportState: 'queued', paused: true }, /Report queued\. Delivery is paused/],
    [{ reportState: 'generating' }, /Report requested; waiting for response/],
    [{ settingPending: true }, /Reporting update queued for this agent/],
    [{ settingPending: true, paused: true }, /Reporting update queued\. Delivery is paused/],
    [{ error: 'Delivery failed.' }, /role="alert">Delivery failed\./],
  ]) {
    const { html, element } = fixture({ compact: true, ...props });
    assert.match(html.slice(html.indexOf('</details>') + '</details>'.length), expected);
    assert.doesNotMatch(renderToStaticMarkup(descendants(element, node => node.type === 'details')[0]), expected);
    if (props.reportState) assert.ok(descendants(element, node => node.type === 'button').every(button => button.props.disabled));
  }
});

test('compact report controls retain per-worker radio selection, disabled guards and callbacks', async () => {
  const calls = [];
  const { element, html } = fixture({ compact: true, save: async value => { calls.push(['interval', value]); return true; }, reportNow: async () => { calls.push(['report']); return true; } });
  const radios = descendants(element, node => node.type === 'input');
  assert.deepEqual(radios.map(radio => radio.props.value), [60, 15, 5, 0]);
  assert.ok(radios.every(radio => radio.props.name === 'report-interval-worker-one'));
  assert.deepEqual(radios.filter(radio => radio.props.checked).map(radio => radio.props.value), [15]);
  await radios[2].props.onChange();
  const reportButtons = descendants(element, node => node.type === 'button');
  assert.equal(reportButtons.length, 2);
  assert.equal(reportButtons[0].props.onClick, reportButtons[1].props.onClick, 'desktop and mobile share the same delivery callback');
  await reportButtons[1].props.onClick();
  assert.deepEqual(calls, [['interval', 5], ['report']]);
  assert.equal(descendants(element, node => node.type === 'fieldset')[0].props.disabled, false);
  const disabled = fixture({ compact: true, disabled: true });
  assert.match(disabled.html, /<fieldset disabled="">/);
  assert.ok(descendants(disabled.element, node => node.type === 'button').every(button => button.props.disabled));
  const other = fixture({ compact: true, agentId: 'worker-two' }).html;
  assert.match(other, /name="report-interval-worker-two"/);
  assert.doesNotMatch(html, /report-interval-worker-two/);
});

test('collapsed settings summary reflects each saved report cadence', () => {
  for (const [minutes, label] of [[60, '1h'], [15, '15min'], [5, '5min'], [0, 'Never']]) {
    const { element } = fixture({ compact: true, minutes });
    const summary = descendants(element, node => node.type === 'summary')[0];
    assert.ok(renderToStaticMarkup(summary).includes(`Reports: ${label}`));
  }
});

test('desktop feedback retains its position before model controls without duplicate status or alerts', () => {
  for (const compact of [false, true]) {
    const { html, element } = fixture({ compact, reportState: 'queued', error: 'Delivery failed.' });
    assert.equal((html.match(/role="status"/g) || []).length, 1);
    assert.equal((html.match(/role="alert"/g) || []).length, 1);
    const disclosure = descendants(element, node => node.type === 'details')[0];
    const inside = renderToStaticMarkup(disclosure);
    if (compact) {
      assert.doesNotMatch(inside, /role="status"|role="alert"/);
      assert.ok(html.indexOf('</details>') < html.indexOf('role="status"'));
    } else {
      assert.ok(inside.indexOf('</fieldset>') < inside.indexOf('role="status"'));
      assert.ok(inside.indexOf('role="status"') < inside.indexOf('aria-label="Worker model"'));
      assert.ok(inside.indexOf('role="alert"') < inside.indexOf('aria-label="Worker model"'));
    }
  }
});
