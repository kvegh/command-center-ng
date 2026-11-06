import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/theme-switcher.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const { ThemeSwitcher, handleThemeMenuKey } = await import('data:text/javascript;base64,' + Buffer.from(compiled.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`)).toString('base64'));

function press(key, current) {
  const effects = { prevented: 0, stopped: 0, focus: [], chosen: [], closed: [] };
  handleThemeMenuKey({ key, preventDefault() { effects.prevented++; }, stopPropagation() { effects.stopped++; } }, current, {
    focus: value => effects.focus.push(value), choose: value => effects.chosen.push(value), close: value => effects.closed.push(value)
  });
  return effects;
}

test('the theme trigger exposes its purpose, selected theme and closed menu state', () => {
  const html = renderToStaticMarkup(React.createElement(ThemeSwitcher, { theme: 'classic', onChange() { throw new Error('Rendering must not change the theme.'); } }));
  assert.match(html, /aria-label="Choose theme; current theme: classic"/);
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /role="menu"/);
});

test('arrow and boundary keys navigate all three themes without applying one', () => {
  assert.deepEqual(press('ArrowDown', 'classic').focus, ['contrastful']);
  assert.deepEqual(press('ArrowDown', 'light').focus, ['classic']);
  assert.deepEqual(press('ArrowUp', 'classic').focus, ['light']);
  assert.deepEqual(press('Home', 'light').focus, ['classic']);
  assert.deepEqual(press('End', 'classic').focus, ['light']);
  assert.deepEqual(press('ArrowDown', 'classic').chosen, []);
});

test('Enter and Space select only the focused theme', () => {
  for (const key of ['Enter', ' ']) {
    const result = press(key, 'contrastful');
    assert.deepEqual(result.chosen, ['contrastful']);
    assert.deepEqual(result.focus, []);
    assert.equal(result.prevented, 1);
    assert.equal(result.stopped, 1);
  }
});

test('Escape dismisses the menu, returns trigger focus and cannot reach agent interruption', () => {
  const result = press('Escape', 'light');
  assert.deepEqual(result.closed, [true]);
  assert.deepEqual(result.chosen, []);
  assert.equal(result.prevented, 1);
  assert.equal(result.stopped, 1);
});

test('Tab dismisses without trapping focus, and unrelated typing is untouched', () => {
  const result = press('Tab', 'classic');
  assert.deepEqual(result.closed, [false]);
  assert.equal(result.prevented, 0);
  assert.equal(result.stopped, 0);
  assert.deepEqual(press('x', 'classic'), { prevented: 0, stopped: 0, focus: [], chosen: [], closed: [] });
});
