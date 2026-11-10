import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/open-questions.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const module = await import('data:text/javascript;base64,' + Buffer.from(compiled.replace(/from ['"]([^'"]+)['"]/g, (_, pkg) => `from '${pathToFileURL(require.resolve(pkg)).href}'`)).toString('base64'));

test('an attention flag without request details does not claim another client owns the request', () => {
  const html = renderToStaticMarkup(React.createElement(module.OpenQuestions, { agentId: 'worker', questions: [], attention: true }));
  assert.doesNotMatch(html, /another Codex client|Answer it there/i);
  assert.match(html, /native wait is reported/); assert.match(html, /request details have not arrived/);
  assert.match(html, /Received requests appear automatically/);
  assert.doesNotMatch(html, /Load pending|Retry|Refresh|<button|waiting for your response|needs your answer/i);
});

function descendants(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => descendants(child, predicate))];
}
function recovery(props = {}) {
  let element;
  function Capture() { element = module.RequestRecovery({ recovering: false, disabled: false, recover: () => assert.fail('Rendering cannot reconnect a session'), ...props }); return null; }
  renderToStaticMarkup(React.createElement(Capture));
  return { element, html: renderToStaticMarkup(element) };
}

test('Codex missing details are a waiting status, not a user-answer or normal load action', () => {
  const calls = [];
  for (const props of [{}, { recovering: true }, { error: 'The request envelope has not been delivered.' }, { disabled: true }]) {
    const { html, element } = recovery({ ...props, recover: async () => { calls.push('unexpected recovery'); } });
    assert.match(html, /role="status"/); assert.match(html, /Received requests appear here automatically/);
    assert.match(html, /There is no answer to submit until their details arrive/);
    assert.doesNotMatch(html, /<button|<form|<details|Load pending|Retry|waiting for your response|Dismiss|Close request/i);
    assert.equal(descendants(element, node => node.type === 'button').length, 0);
    if (props.recovering) assert.match(html, /Loading request details/);
    else if (props.error) { assert.match(html, /Request details are unavailable/); assert.match(html, /role="alert">The request envelope has not been delivered/); }
    else assert.match(html, /Waiting for request details/);
  }
  assert.deepEqual(calls, []);
});

test('explicit parent recovery is an advanced closed disclosure and runs only on a permitted click', async () => {
  let calls = 0;
  const { element, html } = recovery({ allowManualRecovery: true, recover: async () => { calls++; } });
  assert.equal(calls, 0); assert.match(html, /Advanced recovery/); assert.match(html, /does not answer or dismiss a request/);
  const disclosure = descendants(element, node => node.type === 'details')[0];
  assert.equal(disclosure.props.open, undefined);
  const action = descendants(disclosure, node => node.type === 'button')[0];
  assert.equal(action.props.children, 'Reconnect and check details'); assert.equal(action.props.disabled, false);
  await action.props.onClick(); assert.equal(calls, 1);
  for (const props of [{ disabled: true }, { recovering: true }]) {
    const blocked = recovery({ ...props, allowManualRecovery: true, recover: async () => { calls++; } });
    const button = descendants(blocked.element, node => node.type === 'button')[0];
    assert.equal(button.props.disabled, true);
    await button.props.onClick(); assert.equal(calls, 1, 'unavailable/loading parent recovery cannot reconnect');
  }
});

test('recovery errors stay visible without a fake answer, dismissal or automatic reconnect', async () => {
  let calls = 0;
  const { element } = recovery({ allowManualRecovery: true, recover: async () => { calls++; throw new Error('Native connection unavailable.'); } });
  await descendants(element, node => node.type === 'button')[0].props.onClick();
  assert.equal(calls, 1, 'a failed explicit recovery does not retry itself');
  const { html } = recovery({ error: 'Native connection unavailable.', allowManualRecovery: true });
  assert.match(html, /role="alert">Native connection unavailable/);
  assert.doesNotMatch(html, /resolved|dismissed|successfully|Retry loading|waiting for your response/i);
});

test('Claude retains its original wording, refresh button and loading/error variants', async () => {
  for (const [props, label] of [[{}, 'Refresh request details'], [{ recovering: true }, 'Loading request…'], [{ error: 'Claude request unavailable.' }, 'Retry loading request']]) {
    const { html, element } = recovery({ ...props, provider: 'claude', allowManualRecovery: false });
    assert.match(html, /Claude is waiting for your response\./);
    assert.match(html, /Waiting for Claude’s request details. Refresh them here if needed\./);
    assert.equal(descendants(element, node => node.type === 'button')[0].props.children, label);
    assert.doesNotMatch(html, /Advanced recovery|Received requests appear|There is no answer/);
  }
  const empty = renderToStaticMarkup(React.createElement(module.OpenQuestions, { agentId: 'claude-worker', questions: [], attention: true, provider: 'claude' }));
  assert.match(empty, /Claude reports that it needs input; the request details have not arrived. Refresh request details in the conversation\./);
  let refreshed = 0;
  const active = recovery({ provider: 'claude', recover: async () => { refreshed++; } });
  await descendants(active.element, node => node.type === 'button')[0].props.onClick(); assert.equal(refreshed, 1);
});

test('delivered questions remain individually visible and no attention is resolved by rendering', () => {
  const questions = [
    { id: 1, method: 'item/tool/requestUserInput', params: { questions: [{ id: 'one', question: 'First decision?' }, { id: 'two', question: 'Second decision?' }] } },
    { id: '1', method: 'item/commandExecution/requestApproval', params: { reason: 'Review the requested read.' }, responding: true }
  ];
  const before = structuredClone(questions);
  const html = renderToStaticMarkup(React.createElement(module.OpenQuestions, { agentId: 'worker', questions, attention: true }));
  assert.match(html, /3 open questions/); assert.match(html, /First decision/); assert.match(html, /Second decision/);
  assert.match(html, /Review the requested read/); assert.match(html, /Confirming answer/);
  assert.equal((html.match(/class="open-question"/g) || []).length, 3);
  assert.deepEqual(questions, before);
});
