import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/resizable-composer.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
const { ResizableComposer, composerLimits, composerSize } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('composer bounds preserve history, adapt to short windows and cap saved heights', () => {
  assert.deepEqual(composerLimits(800), { min: 180, max: 680 });
  assert.deepEqual(composerLimits(280), { min: 160, max: 160 });
  assert.deepEqual(composerLimits(1600), { min: 180, max: 1200 });
  assert.equal(composerSize(1100, 600), 480);
  assert.equal(composerSize(200, 280), 160);
  assert.equal(composerSize(100, 800), 180);
  assert.equal(composerSize(320.4, 800), 320);
});

function fixture(height, { stacked = false, panelHeight = 800, overviewHeight = 0, captureFails = false } = {}) {
  const changes = []; const captures = []; let form;
  // Capture the real React element/handlers while hooks have a valid renderer.
  function Capture() {
    form = ResizableComposer({ workerId: 'worker', height, change: value => changes.push(value), onSubmit() {}, children: React.createElement('textarea', { defaultValue: 'Unsent draft' }) });
    return null;
  }
  renderToStaticMarkup(React.createElement(Capture));
  const panel = { clientHeight: panelHeight, display: stacked ? 'flex' : 'grid', querySelector: () => ({ getBoundingClientRect: () => ({ height: overviewHeight }) }) };
  form.props.ref.current = { parentElement: panel, getBoundingClientRect: () => ({ height: height ?? 220 }) };
  const target = { setPointerCapture(id) { if (captureFails) throw new Error('unsupported'); captures.push(['set', id]); }, releasePointerCapture(id) { captures.push(['release', id]); }, focus() {} };
  const divider = form.props.children[0];
  const event = values => ({ pointerId: 1, button: 0, isPrimary: true, clientY: 500, currentTarget: target, preventDefault() {}, stopPropagation() {}, ...values });
  return { form, divider, event, panel, changes, captures };
}
const originalComputedStyle = globalThis.getComputedStyle;
test.before(() => { globalThis.getComputedStyle = node => ({ display: node.display }); });
test.after(() => { if (originalComputedStyle) globalThis.getComputedStyle = originalComputedStyle; else delete globalThis.getComputedStyle; });

test('dragging up enlarges the whole composer, down shrinks it, and only the captured pointer moves it', () => {
  const f = fixture(260);
  f.divider.props.onPointerDown(f.event());
  f.divider.props.onPointerMove(f.event({ pointerId: 2, clientY: 400 }));
  assert.deepEqual(f.changes, []);
  f.divider.props.onPointerMove(f.event({ clientY: 400 }));
  f.divider.props.onPointerMove(f.event({ clientY: 540 }));
  f.divider.props.onPointerMove(f.event({ clientY: -2000 }));
  assert.deepEqual(f.changes, [360, 220, 680]);
  f.divider.props.onPointerUp(f.event());
  f.divider.props.onLostPointerCapture();
  f.divider.props.onPointerMove(f.event({ clientY: 300 }));
  assert.deepEqual(f.changes, [360, 220, 680]);
  assert.deepEqual(f.captures, [['set', 1], ['release', 1]]);
  assert.equal(f.form.props.children[1].props.defaultValue, 'Unsent draft');
});

test('pointer cancellation, capture loss and Escape restore the original preference including automatic size', () => {
  for (const height of [undefined, 300]) for (const cancel of ['onPointerCancel', 'onLostPointerCapture', 'escape']) {
    const f = fixture(height);
    f.divider.props.onPointerDown(f.event());
    f.divider.props.onPointerMove(f.event({ clientY: 400 }));
    let stopped = false;
    if (cancel === 'escape') f.divider.props.onKeyDown(f.event({ key: 'Escape', stopPropagation() { stopped = true; } }));
    else f.divider.props[cancel]();
    assert.equal(f.changes.at(-1), height);
    if (cancel === 'escape') assert.equal(stopped, true, 'Escape cancels resizing before native interrupt');
    const count = f.changes.length;
    f.divider.props.onLostPointerCapture();
    f.divider.props.onPointerMove(f.event({ clientY: 300 }));
    assert.equal(f.changes.length, count);
  }
});

test('keyboard sizing and reset use available space excluding a stacked overview', () => {
  const f = fixture(300, { stacked: true, panelHeight: 800, overviewHeight: 250 });
  for (const values of [{ key: 'ArrowUp' }, { key: 'ArrowDown' }, { key: 'ArrowUp', shiftKey: true }, { key: 'Home' }, { key: 'End' }, { key: 'Enter' }]) f.divider.props.onKeyDown(f.event(values));
  assert.deepEqual(f.changes, [316, 284, 364, 180, 430]);
  f.divider.props.onDoubleClick();
  assert.equal(f.changes.at(-1), undefined);
  f.panel.clientHeight = 500;
  f.divider.props.onKeyDown(f.event({ key: 'End' }));
  assert.equal(f.changes.at(-1), 130, 'resize bounds follow current window size');
});

test('secondary buttons, nonprimary pointers and failed capture cannot start resizing', () => {
  for (const [options, event] of [[{}, { button: 2 }], [{}, { isPrimary: false }], [{ captureFails: true }, {}]]) {
    const f = fixture(260, options);
    f.divider.props.onPointerDown(f.event(event));
    f.divider.props.onPointerMove(f.event({ clientY: 300 }));
    assert.deepEqual(f.changes, []);
  }
});

test('composer separator is keyboard accessible and keeps its form and automatic reset semantics', () => {
  const html = renderToStaticMarkup(React.createElement(ResizableComposer, { workerId: 'worker', onSubmit() {}, change() {}, children: React.createElement('textarea', { defaultValue: 'Draft' }) }));
  assert.match(html, /<form[^>]*id="chat-composer"[^>]*class="composer"/);
  assert.match(html, /role="separator" tabindex="0" aria-label="Resize chat input and history" aria-orientation="horizontal"/);
  assert.match(html, /aria-controls="chat-composer"/);
  assert.match(html, /aria-valuetext="Automatic height"/);
  assert.match(html, /<textarea>Draft<\/textarea>/);
});
