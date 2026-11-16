import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function componentUrl(name) {
  const source = await readFile(new URL(`../src/${name}.tsx`, import.meta.url), 'utf8');
  let code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  } }).outputText;
  for (const match of [...code.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const value = match[1];
    const url = value.startsWith('./') ? await componentUrl(value.slice(2)) : pathToFileURL(require.resolve(value)).href;
    code = code.replace(match[0], `from '${url}'`);
  }
  return 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
}
const { NativeRequestCard } = await import(await componentUrl('native-request-card'));
const { ClaudeRequestCard } = await import(await componentUrl('claude-request-card'));
const rationale = 'Request: Check the selected example.\nConcern: Confirm the intended scope.\nNext: Choose that scope.';
const question = review => ({ id: 'native-request-one', method: 'claude/tool/requestApproval', reviewToken: 'existing-token',
  params: { threadId: 'claude-worker', toolName: 'Bash', input: { command: 'example-tool --check' }, reason: 'Native approval reason.' },
  ...(review ? { review } : {}) });
const card = request => renderToStaticMarkup(React.createElement(NativeRequestCard, {
  question: request, agentId: 'claude-worker', workerName: 'Example project',
  act: async () => assert.fail('Rendering cannot answer a native request.'),
}));
function descendants(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => descendants(child, predicate))];
}
function actionFixture(request, act) {
  let element;
  function Capture() { element = ClaudeRequestCard({ question: request, agentId: 'claude-worker', workerName: 'Example project', act }); return null; }
  renderToStaticMarkup(React.createElement(Capture));
  return descendants(element, node => node.type === 'button');
}

test('bound Claude ask and decline reviews appear on the original approval card', () => {
  for (const decision of ['ask', 'decline']) {
    const request = question({ decision, rationale }), before = structuredClone(request);
    const html = card(request);
    assert.match(html, /class="field-note coordinator-review"/);
    assert.ok(html.includes(decision === 'ask' ? 'Coordinator · Needs your decision' : 'Coordinator · decline'));
    assert.ok(html.includes(rationale));
    assert.match(html, /Native approval reason/);
    assert.match(html, /example-tool --check/);
    assert.match(html, />Allow once<\/button>/); assert.match(html, />Decline<\/button>/);
    assert.deepEqual(request, before, 'display preserves the exact request and review metadata');
  }
});

test('multiline rationale is escaped literal text with Request, Concern and Next intact', () => {
  const rationale = 'Request: Check <example>.\nConcern: <script>alert(1)</script>\nNext: Preserve **literal** text & scope.';
  const html = card(question({ decision: 'ask', rationale }));
  assert.ok(html.includes('Request: Check &lt;example&gt;.\nConcern: &lt;script&gt;alert(1)&lt;/script&gt;\nNext: Preserve **literal** text &amp; scope.'));
  assert.doesNotMatch(html, /<script>|<strong>literal/);
});

test('historical referrals retain their timestamp and needs-decision label', () => {
  const historicalAt = '2026-01-01T12:49:00.000Z';
  const html = card(question({ decision: 'ask', rationale, historicalAt, decisionId: 'saved-review' }));
  assert.match(html, /Earlier review/);
  assert.match(html, /dateTime="2026-01-01T12:49:00.000Z"/);
  assert.match(html, /Needs your decision/);
  assert.ok(html.includes(rationale));
});

test('a request without bound review metadata invents no review from native reason or command text', () => {
  const request = question();
  request.params.reason = 'Concern: This is the native reason, not a Coordinator review.';
  const html = card(request);
  assert.match(html, /This is the native reason/);
  assert.doesNotMatch(html, /coordinator-review|Coordinator ·|Needs your decision/);
});

test('review display preserves exact once/decline answers and does not add coordinator actions', async () => {
  for (const decision of ['ask', 'decline']) {
    const calls = [], request = question({ decision, rationale });
    const buttons = actionFixture(request, async (...args) => { calls.push(args); return true; });
    assert.deepEqual(buttons.map(button => button.props.children), ['Allow once', 'Decline']);
    assert.deepEqual(calls, []);
    await buttons[0].props.onClick(); await buttons[1].props.onClick();
    assert.deepEqual(calls, [
      ['agents/claude-worker/answer', { requestId: 'native-request-one', decision: 'accept' }],
      ['agents/claude-worker/answer', { requestId: 'native-request-one', decision: 'decline' }],
    ]);
  }
});

test('responding and native error states retain the review and existing disabled actions', () => {
  const request = { ...question({ decision: 'ask', rationale }), responding: true, error: 'Native response is not confirmed.' };
  const html = card(request);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Native response is not confirmed/);
  assert.ok(html.includes(rationale));
  assert.ok(actionFixture(request, async () => true).every(button => button.props.disabled));
});
