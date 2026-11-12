import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url), modules = new Map();
async function componentUrl(name) {
  if (modules.has(name)) return modules.get(name);
  const source = await readFile(new URL(`../src/${name}.tsx`, import.meta.url), 'utf8');
  let compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  for (const match of [...compiled.matchAll(/from ['"]([^'"]+)['"]/g)]) compiled = compiled.replace(match[0], `from '${match[1].startsWith('./') ? await componentUrl(match[1].slice(2)) : pathToFileURL(require.resolve(match[1])).href}'`);
  const url = 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'); modules.set(name, url); return url;
}
const { NativeRequestCard, approvalRequestTime } = await import(await componentUrl('native-request-card'));
const startedAtMs = Date.parse('2026-01-02T16:35:12.123Z');
const question = (method = 'item/commandExecution/requestApproval', params = {}) => ({
  id: 'request-one', method, reviewToken: 'exact-token',
  params: { threadId: 'worker', turnId: 'turn', itemId: 'item', command: 'example-tool --check', startedAtMs, ...params },
});
const render = (question, props = {}) => renderToStaticMarkup(React.createElement(NativeRequestCard, {
  question, agentId: 'worker', workerName: 'Example project',
  act: () => assert.fail('Rendering request time cannot send an approval or start work'), ...props,
}));

test('native approval time retains exact ISO milliseconds and shows date, seconds and timezone', () => {
  const utc = approvalRequestTime(startedAtMs, 'UTC');
  assert.equal(utc.iso, '2026-01-02T16:35:12.123Z');
  assert.match(utc.label, /2026/); assert.match(utc.label, /16:35:12/); assert.match(utc.label, /GMT/);
  assert.match(utc.title, /Native approval request started/); assert.match(utc.title, /2026/); assert.match(utc.title, /\(UTC\)/);
  const local = approvalRequestTime(startedAtMs, 'America/New_York');
  assert.equal(local.iso, utc.iso); assert.match(local.label, /11:35:12/); assert.match(local.label, /GMT-05:00/);
  assert.match(local.title, /America\/New_York/);
  assert.equal(approvalRequestTime(0, 'UTC').iso, '1970-01-01T00:00:00.000Z', 'Unix epoch is a recorded timestamp, not a missing-value fallback');
});

test('command and file cards show only the native approval timestamp before existing actions', () => {
  for (const method of ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval']) {
    const request = question(method);
    const before = structuredClone(request);
    const html = render(request);
    assert.match(html, /Requested at <time dateTime="2026-01-02T16:35:12.123Z" title="Native approval request started at/);
    assert.ok(html.includes(approvalRequestTime(startedAtMs).label));
    assert.match(html, /2026/); assert.match(html, /35:12/);
    assert.ok(html.indexOf('Requested at') < html.indexOf('>Allow once</button>'));
    assert.match(html, /Native request details/);
    assert.deepEqual(request, before, 'presentation cannot modify native request fields');
  }
});

test('absent or invalid native timestamps stay unavailable despite unrelated message, turn or receive times', () => {
  for (const value of [undefined, null, '', String(startedAtMs), NaN, Infinity, -Infinity, -1, 1.5, 9e20, 8_640_000_000_000_001, {}, false]) {
    assert.equal(approvalRequestTime(value), null);
    const request = { ...question('item/fileChange/requestApproval', {
      startedAtMs: value, timestamp: '2026-02-03T01:02:03Z', receivedAt: '2026-02-03T02:03:04Z',
      turnStartedAtMs: startedAtMs + 1000, completedAtMs: startedAtMs + 2000,
    }), timestamp: '2026-02-03T03:04:05Z', restoredAt: '2026-02-03T04:05:06Z' };
    const html = render(request);
    assert.match(html, /class="field-note approval-request-time">Request time unavailable<\/p>/);
    assert.doesNotMatch(html, /Requested at <time|<time dateTime=/);
  }
});

test('child requests, responding states and pending manual asks retain the same native request time', () => {
  for (const state of [{}, { responding: true }, { review: { decision: 'ask', rationale: 'Choose the permitted target.' } }]) {
    const request = { ...question('item/commandExecution/requestApproval', { threadId: 'child' }), ...state };
    const html = render(request, { requestThreadId: 'child', readOnlyCoordinator: true });
    assert.match(html, /dateTime="2026-01-02T16:35:12.123Z"/);
    assert.match(html, /Requested at/);
    if (state.responding) assert.match(html, /Waiting for the native agent to confirm resolution/);
    if (state.review) assert.match(html, /Needs your decision/);
  }
});

test('undocumented question and permission schemas do not acquire an inferred approval clock', () => {
  for (const method of ['item/tool/requestUserInput', 'item/permissions/requestApproval', 'mcpServer/elicitation/request']) {
    const html = render(question(method));
    assert.doesNotMatch(html, /approval-request-time|Requested at|Request time unavailable/);
  }
});
