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
function fixture(props = {}, detailed = false) {
  let element;
  function Capture() {
    element = WorkerSettings({ ...defaults, children: advanced, ...props });
    const choice = descendants(element, node => node.type === 'input' && node.props.type === 'checkbox')[0];
    if (detailed && !choice.props.checked) choice.props.onChange({ target: { checked: true } });
    return null;
  }
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
  assert.equal(descendants(disclosure, node => node.type === 'input' && node.props.type === 'radio').length, 4);
  assert.equal(descendants(disclosure, node => node.type === 'input' && node.props.type === 'checkbox').length, 1);
  assert.equal(disclosure.props.children[4], advanced, 'the advanced subtree stays rendered inside the native disclosure');
  const directChildren = React.Children.toArray(element.props.children);
  const mobileActions = directChildren.find(node => node.props.className === 'worker-report-mobile');
  const mobileReport = descendants(mobileActions, node => node.type === 'button')[0];
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
  const radios = descendants(element, node => node.type === 'input' && node.props.type === 'radio');
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

test('desktop and mobile share an accessible detailed choice without changing cadence or other chats', async () => {
  for (const compact of [false, true]) {
    const calls = [], { element, html } = fixture({ compact, reportNow: async detailed => { calls.push(detailed); return { detailed }; } }, true);
    const choices = descendants(element, node => node.type === 'input' && node.props.type === 'checkbox');
    assert.equal(choices.length, 2); assert.ok(choices.every(choice => choice.props.checked));
    assert.ok(choices.every(choice => choice.props.disabled === false));
    assert.equal((html.match(/Detailed report<\/span>/g) || []).length, 2);
    const buttons = descendants(element, node => node.type === 'button');
    assert.equal(buttons[0].props.onClick, buttons[1].props.onClick);
    await buttons[compact ? 1 : 0].props.onClick();
    assert.deepEqual(calls, [true]);
    assert.deepEqual(descendants(element, node => node.type === 'input' && node.props.type === 'radio' && node.props.checked).map(node => node.props.value), [15]);
  }
  const other = fixture({ agentId: 'another-worker' });
  assert.ok(descendants(other.element, node => node.type === 'input' && node.props.type === 'checkbox').every(node => node.props.checked === false));
  const normalCalls = [], normal = fixture({ reportNow: async detailed => { normalCalls.push(detailed); return { detailed }; } });
  await descendants(normal.element, node => node.type === 'button')[0].props.onClick();
  assert.deepEqual(normalCalls, [false]);
});

test('detailed request feedback follows actual dispatched mode and never retries or bypasses current gates', async () => {
  const ast = ts.createSourceFile('worker-settings.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let requestReport;
  const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'requestReport') requestReport = node.initializer.getText(ast); ts.forEachChild(node, visit); }; visit(ast);
  const compiledRequest = ts.transpileModule(`return (${requestReport});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = async (result, changes = {}) => {
    const state = { calls: [], requesting: [], notice: '', error: '' };
    const environment = { reportDisabled: false, detailed: true,
      setRequesting: value => state.requesting.push(value), setRequestNotice: value => { state.notice = value; }, setRequestError: value => { state.error = value; },
      reportNow: async detailed => { state.calls.push(detailed); if (result instanceof Error) throw result; return result; }, ...changes };
    await new Function(...Object.keys(environment), compiledRequest)(...Object.values(environment))(); return state;
  };
  const detailed = await run({ detailed: true, queued: true });
  assert.equal(detailed.notice, 'Detailed report request accepted.'); assert.deepEqual(detailed.calls, [true]);
  const dispatched = await run({ detailed: false, alreadyPending: true, state: 'generating', upgradeUnavailable: true });
  assert.match(dispatched.notice, /current report request cannot be changed/); assert.doesNotMatch(dispatched.notice, /Detailed report request accepted/);
  assert.deepEqual(dispatched.calls, [true]); assert.deepEqual(dispatched.requesting, [true, false]);
  const failed = await run(new Error('Native report delivery unavailable.'));
  assert.equal(failed.error, 'Native report delivery unavailable.'); assert.equal(failed.notice, ''); assert.deepEqual(failed.requesting, [true, false]);
  const blocked = await run({ detailed: true }, { reportDisabled: true });
  assert.deepEqual(blocked.calls, []); assert.deepEqual(blocked.requesting, []);
  for (const props of [{ disabled: true }, { reportState: 'queued' }, { reportState: 'generating' }]) {
    const { element } = fixture(props);
    assert.ok(descendants(element, node => node.type === 'input' && node.props.type === 'checkbox').every(node => node.props.disabled));
  }
});

test('the keyed worker action posts only the chosen detail flag and returns actual backend feedback', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let settings;
  const visit = node => { if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'WorkerSettings') settings = node; ts.forEachChild(node, visit); }; visit(ast);
  const attribute = name => settings.attributes.properties.find(node => ts.isJsxAttribute(node) && node.name.text === name).initializer.expression.getText(ast);
  assert.equal(attribute('key'), 'active.id');
  const response = { detailed: false, upgradeUnavailable: true }, calls = [];
  const callback = ts.transpileModule(`return (${attribute('reportNow')});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const reportNow = new Function('active', 'api', callback)({ id: 'selected-worker' }, async (...args) => { calls.push(args); return response; });
  assert.equal(await reportNow(true), response);
  assert.deepEqual(calls, [['agents/selected-worker/report', { detailed: true }]]);
});
