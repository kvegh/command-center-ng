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

function captureOverview(props) {
  let element;
  function Capture() { element = OverviewSections(props); return null; }
  renderToStaticMarkup(React.createElement(Capture));
  return element;
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
const sectionsFor = ids => ids.map(id => ({ id, label: id, content: React.createElement('p', null, id + ' content') }));

test('worker settings stay outside the scrolling group with their resize boundary, including without questions', () => {
  for (const ids of [['goal', 'tasks', 'questions', 'settings'], ['goal', 'tasks', 'settings'], ['settings']]) {
    const sections = sectionsFor(ids); const changes = [];
    const heights = Object.fromEntries(ids.map(id => [id, 1200]));
    const element = captureOverview({ sections, heights, bottomSection: 'settings', change: (...args) => changes.push(args) });
    const [scrolling, bottom] = React.Children.toArray(element.props.children);
    assert.equal(scrolling.props.className, 'overview-scroll-sections');
    assert.deepEqual(descendants(scrolling, node => node.type === 'section').map(node => node.props['data-section']), ids.slice(0, -1));
    assert.equal(descendants(scrolling, node => node.type === 'section' && node.props['data-section'] === 'settings').length, 0);
    const footer = descendants(bottom, node => node.type === 'section')[0];
    assert.equal(footer.props.className, 'overview-section overview-section-bottom');
    assert.equal(footer.props['data-section'], 'settings');
    assert.deepEqual(descendants(element, node => node.type === 'section').map(node => node.props['data-section']), ids, 'grouping preserves section order and content');
    assert.equal(descendants(element, node => node.props.role === 'separator').length, ids.length - 1);
    assert.equal(descendants(bottom, node => node.props.role === 'separator').length, ids.length > 1 ? 1 : 0);
    assert.equal(descendants(footer, node => node.props.className?.includes('overview-section-body'))[0].props.style['--section-height'], '1200px');
    assert.deepEqual(heights, Object.fromEntries(ids.map(id => [id, 1200])), 'layout constraints do not erase saved sizes');
    assert.deepEqual(changes, [], 'rendering oversized saved sections does not write preferences');
  }
});

test('coordinator and missing final settings retain every section inside the scrolling group', () => {
  for (const [ids, bottomSection] of [
    [['coordinator', 'workers', 'coordinator-questions', 'decisions'], undefined],
    [['goal', 'tasks'], 'settings'], [['goal', 'tasks', 'settings'], 'tasks'], [[], 'settings'],
  ]) {
    const element = captureOverview({ sections: sectionsFor(ids), heights: {}, bottomSection, change: () => {} });
    const scrolling = React.Children.toArray(element.props.children)[0];
    assert.deepEqual(descendants(scrolling, node => node.type === 'section').map(node => node.props['data-section']), ids);
    assert.equal(descendants(element, node => node.props.className?.includes('overview-section-bottom')).length, 0);
    assert.equal(descendants(element, node => node.props.role === 'separator').length, Math.max(0, ids.length - 1));
  }
});

test('the separated settings boundary retains keyboard resizing and resetting of the adjacent sections', () => {
  const changes = [];
  const element = captureOverview({ sections: sectionsFor(['tasks', 'settings']), heights: { tasks: 240, settings: 180 }, bottomSection: 'settings', change: (...args) => changes.push(args) });
  const boundary = descendants(React.Children.toArray(element.props.children)[1], node => node.props.role === 'separator')[0];
  assert.equal(boundary.props['aria-label'], 'Resize tasks and settings');
  let prevented = false;
  boundary.props.onKeyDown({ key: 'ArrowDown', shiftKey: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(changes.splice(0), [['tasks', 256], ['settings', 164]]);
  boundary.props.onKeyDown({ key: 'End', shiftKey: false, preventDefault() {} });
  assert.deepEqual(changes.splice(0), [['tasks', 1200], ['settings', 64]], 'large moves retain bounded saved heights');
  boundary.props.onDoubleClick();
  assert.deepEqual(changes, [['tasks', undefined], ['settings', undefined]]);
});
