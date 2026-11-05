import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/overview-sections.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
const { OverviewSections, sectionPairHeights } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('moving a horizontal boundary transfers height between adjacent sections, including the final section', () => {
  assert.deepEqual(sectionPairHeights(180, 220, 50), { before: 230, after: 170 });
  assert.deepEqual(sectionPairHeights(180, 220, -40), { before: 140, after: 260 });
  assert.deepEqual(sectionPairHeights(180, 220, 2400), { before: 1200, after: 64 });
  assert.deepEqual(sectionPairHeights(180, 220, -2400), { before: 64, after: 336 });
  assert.deepEqual(sectionPairHeights(64, 64, 200), { before: 264, after: 64 }, 'a short following section must not prevent Tasks growing into unused space');
  for (const [before, after] of [[64, 64], [1200, 1200], [100, 1200], [200.25, 190.25]]) {
    for (const delta of [-3000, -16, 0, 16, 3000]) {
      const result = sectionPairHeights(before, after, delta);
      assert.ok(result.before >= 64 && result.before <= 1200);
      assert.ok(result.after >= 64 && result.after <= 1200);
      if (before + delta >= 64 && before + delta <= 1200 && after - delta >= 64 && after - delta <= 1200) {
        assert.ok(Math.abs(result.before + result.after - before - after) <= 1);
      }
    }
  }
});

test('overview section boundaries are named keyboard-accessible horizontal separators without a trailing handle', () => {
  const sections = ['Goal', 'Tasks', 'Settings'].map(label => ({ id: label.toLowerCase(), label, content: React.createElement('p', null, label + ' content') }));
  const html = renderToStaticMarkup(React.createElement(OverviewSections, { sections, heights: {}, change: () => {} }));
  assert.equal((html.match(/role="separator"/g) || []).length, 2);
  assert.equal((html.match(/aria-orientation="horizontal"/g) || []).length, 2);
  assert.equal((html.match(/tabindex="0"/g) || []).length, 2);
  assert.match(html, /aria-label="Resize Goal and Tasks"/);
  assert.match(html, /aria-label="Resize Tasks and Settings"/);
  assert.match(html, /aria-valuetext="Automatic height"/);
  assert.doesNotMatch(html, /--section-height/);
  for (const count of [0, 1]) {
    const single = renderToStaticMarkup(React.createElement(OverviewSections, { sections: sections.slice(0, count), heights: {}, change: () => {} }));
    assert.doesNotMatch(single, /role="separator"/);
  }
  const resized = renderToStaticMarkup(React.createElement(OverviewSections, { sections, heights: { tasks: 240, settings: 180 }, change: () => {} }));
  assert.match(resized, /data-section="tasks"[^]*?overview-section-body sized[^]*?--section-height:240px/);
  assert.match(resized, /aria-valuenow="240"/);
});
