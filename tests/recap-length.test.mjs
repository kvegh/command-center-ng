import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { compactProgressRecap, progressWordCount, RECAP_WORD_LIMIT, RECAP_WORD_TARGET } from '../server/progress-recap.mjs';

const words = count => Array.from({ length: count }, (_, index) => `word${index}`).join(' ');
const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/progress-recap.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  .replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`)
  .replace(/from ['"]\.\.\/server\/progress-recap.mjs['"]/, `from '${new URL('../server/progress-recap.mjs', import.meta.url).href}'`);
const { ProgressRecap } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('word count combines all fields with whitespace normalization and a 20-word target', () => {
  assert.equal(RECAP_WORD_TARGET, 20); assert.equal(RECAP_WORD_LIMIT, 25);
  assert.equal(progressWordCount({ summary: '  Ready\nfor\t review ', blocker: '', nextStep: 'Confirm\u00a0the target.' }), 6);
  assert.equal(progressWordCount({ summary: words(12), blocker: words(8), nextStep: words(5) }), 25);
  assert.equal(progressWordCount({ summary: words(12), blocker: words(8), nextStep: words(6) }), 26);
  assert.equal(progressWordCount({}), 0);
});

test('concise recaps preserve every field rather than clipping each independently', () => {
  const progress = { summary: words(12), blocker: words(8), nextStep: words(5) };
  assert.deepEqual(compactProgressRecap(progress), { ...progress, condensed: false });
});

test('legacy long recaps prioritize the complete blocker without losing original context', () => {
  const progress = { summary: words(30), blocker: 'Choose which certificate source to use.', nextStep: words(30) };
  const snapshot = structuredClone(progress);
  const compact = compactProgressRecap(progress);
  assert.deepEqual(compact, { summary: '', blocker: progress.blocker, nextStep: '', condensed: true });
  assert.ok(progressWordCount(compact) <= 25);
  assert.deepEqual(progress, snapshot);
});

test('a long blocker is flagged explicitly instead of cutting qualifications in half', () => {
  const progress = { summary: 'Implementation ready.', blocker: words(26), nextStep: 'Wait for the answer.' };
  const compact = compactProgressRecap(progress);
  assert.match(compact.blocker, /blocker needs attention.*full recap/);
  assert.equal(compact.summary, ''); assert.equal(compact.nextStep, '');
  assert.ok(progressWordCount(compact) <= 25);
});

test('legacy recap without a blocker retains a whole short field or an explicit full-context notice', () => {
  for (const progress of [
    { summary: 'The build passed.', nextStep: words(30) },
    { summary: words(30), nextStep: 'Verify the installed version.' },
    { summary: words(30), nextStep: words(30) },
  ]) {
    const compact = compactProgressRecap(progress);
    assert.equal(compact.condensed, true);
    assert.ok(progressWordCount(compact) <= 25);
  }
  assert.equal(compactProgressRecap({ summary: 'The build passed.', nextStep: words(30) }).summary, 'The build passed.');
  assert.equal(compactProgressRecap({ summary: words(30), nextStep: 'Verify the installed version.' }).nextStep, 'Verify the installed version.');
});

test('legacy full details retain the exact fields while short recap output stays compact', () => {
  const progress = { summary: words(30), blocker: 'User choice needed.', nextStep: 'Preserve the running service.', updatedAt: '2026-01-01T00:00:00Z' };
  const html = renderToStaticMarkup(React.createElement(ProgressRecap, { progress }));
  const beforeDetails = html.slice(0, html.indexOf('<details'));
  assert.match(beforeDetails, /User choice needed/); assert.ok(!beforeDetails.includes(progress.summary));
  assert.match(html, /<details class="progress-recap-details"><summary>Full recap<\/summary>/);
  for (const value of [progress.summary, progress.blocker, progress.nextStep]) assert.ok(html.includes(value));
  assert.equal((html.match(/<details/g) || []).length, 1);
  const short = renderToStaticMarkup(React.createElement(ProgressRecap, { progress: { summary: 'Build passed.', blocker: '', nextStep: 'Check the running app.' } }));
  assert.doesNotMatch(short, /<details/); assert.match(short, /Build passed/); assert.match(short, /Check the running app/);
});

test('recap text stays escaped and rendering never adds approval or navigation actions', () => {
  const html = renderToStaticMarkup(React.createElement(ProgressRecap, { progress: { summary: '<script>private()</script>', blocker: '<img src=x>', nextStep: '' } }));
  assert.doesNotMatch(html, /<script>|<img|<button|<a /);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;img/);
});
