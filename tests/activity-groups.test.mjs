import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/activity-groups.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const { groupMessages, ActivityGroup, isVisibleMessage } = await import('data:text/javascript;base64,' + Buffer.from(compiled.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`)).toString('base64'));
const message = (id, type = 'activity', state = 'completed', text = `Action ${id}`) => ({ id, type, state, text });
const render = messages => renderToStaticMarkup(React.createElement(ActivityGroup, { messages }));

test('only consecutive activity collapses; conversation order and original records remain intact', () => {
  const messages = [message('user', 'user'), message('one'), message('two'), message('reply', 'assistant'), message('three')];
  const before = structuredClone(messages);
  const groups = groupMessages(messages);
  assert.deepEqual(groups.map(group => [group.kind, group.id]), [['message', 'user'], ['activity', 'one'], ['message', 'reply'], ['activity', 'three']]);
  assert.deepEqual(groups.flatMap(group => group.kind === 'activity' ? group.items : [group.message]), messages);
  assert.deepEqual(messages, before);
  assert.equal(groups[1].items[0], messages[1]);
});

test('groups and individual command details start closed without losing or executing command text', () => {
  const html = render([message('one', 'activity', 'completed', 'printf first\nprintf "<script>literal</script>"'), message('two')]);
  assert.equal((html.match(/<details\b/g) || []).length, 3);
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|\s|>)/);
  assert.match(html, /2 actions/);
  assert.match(html, /2 completed/);
  assert.match(html, /printf first\nprintf/);
  assert.match(html, /&lt;script&gt;literal&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('collapsed summaries expose running and failed counts without exposing the command list', () => {
  const html = render([message('one'), message('two', 'activity', 'inProgress', 'Running command'), message('three', 'activity', 'failed', 'Failed command')]);
  const summary = html.slice(0, html.indexOf('</summary>'));
  assert.match(summary, /activity-group failed/);
  assert.match(summary, /1 failed/);
  assert.match(summary, /1 running/);
  assert.match(summary, /1 completed/);
  assert.doesNotMatch(summary, /Running command|Failed command/);
});

test('appended progress retains group identity and stopped or unknown activity is not called completed', () => {
  const first = message('first');
  assert.equal(groupMessages([first])[0].id, groupMessages([first, message('later')])[0].id);
  assert.match(render([message('stopped', 'activity', 'interrupted')]), /1 stopped/);
  const unknown = render([message('unknown', 'activity', 'new-native-state')]);
  assert.doesNotMatch(unknown.slice(unknown.indexOf('<summary>'), unknown.indexOf('</summary>')), /completed/);
  assert.equal(render([]), '');
});

test('only typed internal inputs are silent; report answers, normal summaries and quoted user prompts remain visible', () => {
  const prompt = '[Command Center coordinator]\nStandard Task Report.';
  const hidden = [
    { ...message('scheduled', 'user', 'completed', prompt), internalReport: true },
    { ...message('control', 'user', 'completed', 'Cancel the old reporting loop.'), internalReportControl: true },
    { ...message('coordinator-event', 'user', 'completed', 'Workspace events'), internalCoordinatorEvent: true }
  ];
  const visible = [message('real-user', 'user', 'completed', prompt), message('actual-report', 'assistant', 'completed', '🟩 Done: useful outcome.'), message('summary', 'user', 'completed', '[Command Center coordinator]\nA relevant cross-project finding.')];
  const all = [...hidden, ...visible];
  assert.deepEqual(groupMessages(all).map(group => group.id), visible.map(item => item.id));
  assert.deepEqual(all.filter(isVisibleMessage), visible);
  assert.equal(all.length, 6, 'presentation filtering does not remove native conversation records');
  assert.deepEqual(groupMessages(hidden), []);
  assert.equal(isVisibleMessage({ ...visible[1], internalReport: true }), true, 'an assistant report is never hidden as an input');
});
