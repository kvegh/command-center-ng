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
  let compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  for (const match of [...compiled.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const pkg = match[1];
    const url = pkg.startsWith('./') ? await componentUrl(pkg.slice(2)) : pathToFileURL(require.resolve(pkg)).href;
    compiled = compiled.replace(match[0], `from '${url}'`);
  }
  return 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64');
}

const { Markdown } = await import(await componentUrl('markdown'));
const announcement = '**New Goal:** Deliver the validated feature.\n**Task title:** Finish the feature\n**Beads ID:** example-1.2';
const render = (value, goalAnnouncements) => renderToStaticMarkup(React.createElement(Markdown, { value, goalAnnouncements }));

test('only opted-in worker content gets the exact three-line Goal announcement presentation', () => {
  const html = render(announcement, true);
  assert.equal((html.match(/class="goal-announcement-row"/g) || []).length, 3);
  for (const label of ['New Goal:', 'Task title:', 'Beads ID:']) assert.ok(html.includes(`<span class="goal-announcement-label">${label}</span>`));
  for (const value of ['Deliver the validated feature.', 'Finish the feature', 'example-1.2']) assert.ok(html.includes(`<span class="goal-announcement-value">${value}</span>`));
  assert.doesNotMatch(html, /<strong>|<code>|<br/);
  for (const enabled of [false, undefined]) {
    const ordinary = render(announcement, enabled);
    assert.doesNotMatch(ordinary, /goal-announcement/);
    assert.match(ordinary, /<strong>New Goal:<\/strong>/);
  }
  assert.equal(render(announcement.replaceAll('\n', '\r\n') + '\r\n', true), html);
});

test('Goal values remain escaped normal text rather than Markdown or HTML instructions', () => {
  const value = '**New Goal:** Check <script>alert(1)</script> & **bold**.\n**Task title:** [A link](https://example.invalid) `code`\n**Beads ID:** example-2';
  const html = render(value, true);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; \*\*bold\*\*/);
  assert.ok(html.includes('[A link](https://example.invalid) `code`'));
  assert.doesNotMatch(html, /<script|<strong|<a |<code|<img/);
});

test('examples, code, ordinary bold text and incomplete or expanded announcements stay ordinary Markdown', () => {
  for (const value of [
    '```text\n' + announcement + '\n```',
    announcement.split('\n').map(line => `> ${line}`).join('\n'),
    'A proposed example:\n\n' + announcement,
    announcement + '\nNext step: run the checks.',
    announcement + '\n\n',
    announcement.replace('**Task title:**', '**Task:**'),
    announcement.replace('example-1.2', 'not a Beads ID'),
    announcement.replace('Deliver the validated feature.', ' '),
    '**New Goal:** Proposed only.',
    '**Task title:** Bold label in ordinary text.'
  ]) assert.doesNotMatch(render(value, true), /class="goal-announcement/);
  assert.match(render('```text\n' + announcement + '\n```', true), /markdown-code-actions/);
});

test('opt-in keeps the normal GFM and raw-HTML exclusions for all other Markdown', () => {
  const html = render('| Work | State |\n| --- | --- |\n| Test | Done |\n\n- [x] Checked\n\n<script>bad()</script>\n\n[Unsafe](javascript:alert(1))', true);
  assert.match(html, /<table>/);
  assert.match(html, /type="checkbox"/);
  assert.doesNotMatch(html, /goal-announcement|<script|javascript:/);
});
