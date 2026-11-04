import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/tab-reorder.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { TabReorder, reorderTabs } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

function fixture(ids = ['alpha', 'beta', 'gamma']) {
  let order = [...ids], target = 'alpha', now = 1000, capture = null;
  const changes = [], commits = [], prevented = [];
  const element = {
    setPointerCapture(id) { capture = id; },
    hasPointerCapture(id) { return capture === id; },
    releasePointerCapture(id) { assert.equal(capture, id); capture = null; }
  };
  const drag = new TabReorder({
    targetAt: () => target, now: () => now,
    commit: (source, target) => { commits.push([source, target]); order = reorderTabs(order, source, target); },
    change: state => changes.push(state)
  });
  const event = (x, y = 10, extras = {}) => ({ pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: y, currentTarget: element, preventDefault: () => prevented.push(true), ...extras });
  return { drag, element, event, changes, commits, prevented, order: () => order, capture: () => capture, target: value => { target = value; }, replace: value => { order = value; }, advance: ms => { now += ms; } };
}

test('a mouse drag captured on the source button commits the tab under the pointer', () => {
  const f = fixture(); f.drag.down(f.event(10), 'alpha'); assert.equal(f.capture(), 1);
  f.target('beta'); f.drag.move(f.event(180)); f.target('gamma'); f.drag.move(f.event(350)); f.drag.up(f.event(350));
  assert.deepEqual(f.order(), ['beta', 'gamma', 'alpha']); assert.deepEqual(f.commits, [['alpha', 'gamma']]);
  assert.equal(f.capture(), null); assert.equal(f.changes.at(-1), null);
  assert.equal(f.drag.consumeClick(1), true, 'the click generated after a drag must not activate the source tab');
  assert.equal(f.drag.consumeClick(1), false);
});

test('ordinary clicks, small pointer movement and keyboard activation do not reorder', () => {
  const f = fixture(); f.drag.down(f.event(10), 'alpha'); f.drag.move(f.event(13, 12)); f.drag.up(f.event(13, 12));
  assert.equal(f.commits.length, 0); assert.equal(f.drag.consumeClick(1), false); assert.equal(f.capture(), null);
  assert.equal(f.drag.consumeClick(0), false);
});

test('touch and pen use the same drag path and can move a worker left', () => {
  for (const pointerType of ['touch', 'pen']) {
    const f = fixture(); f.drag.down(f.event(350, 10, { pointerType }), 'gamma');
    f.target('alpha'); f.drag.move(f.event(12, 10, { pointerType })); f.drag.up(f.event(12, 10, { pointerType }));
    assert.deepEqual(f.order(), ['gamma', 'alpha', 'beta']); assert.equal(f.capture(), null);
  }
});

test('vertical scrolling cancels without changing order or blocking a later click', () => {
  const f = fixture(); f.drag.down(f.event(10), 'alpha'); f.drag.move(f.event(12, 70)); f.drag.up(f.event(12, 70));
  assert.equal(f.commits.length, 0); assert.equal(f.capture(), null); assert.equal(f.drag.consumeClick(1), false);
});

test('pointer cancellation and lost capture discard the drop', () => {
  const f = fixture(); f.drag.down(f.event(10), 'alpha'); f.target('beta'); f.drag.move(f.event(180));
  f.drag.cancel({ pointerId: 1 }); f.drag.up(f.event(180));
  assert.equal(f.commits.length, 0); assert.equal(f.changes.at(-1), null); assert.equal(f.capture(), null);
});

test('coordinator and space outside the worker strip are not drop targets', () => {
  const f = fixture(); f.drag.down(f.event(10), 'alpha'); f.target(null); f.drag.move(f.event(500)); f.drag.up(f.event(500));
  assert.equal(f.commits.length, 0); assert.deepEqual(f.order(), ['alpha', 'beta', 'gamma']);
  assert.deepEqual(reorderTabs(f.order(), 'alpha', 'coordinator'), f.order());
});

test('right clicks and secondary pointers cannot start or finish another pointer drag', () => {
  const f = fixture(); f.drag.down(f.event(10, 10, { button: 2 }), 'alpha'); assert.equal(f.capture(), null);
  f.drag.down(f.event(10, 10, { isPrimary: false }), 'alpha'); assert.equal(f.capture(), null);
  f.drag.down(f.event(10), 'alpha'); f.target('beta'); f.drag.move(f.event(180, 10, { pointerId: 2 })); f.drag.up(f.event(180, 10, { pointerId: 2 }));
  assert.equal(f.commits.length, 0); assert.equal(f.capture(), 1);
  f.drag.move(f.event(180)); f.drag.up(f.event(180)); assert.deepEqual(f.order(), ['beta', 'alpha', 'gamma']);
});

test('live agent changes preserve new workers and reject a source that was closed during dragging', () => {
  const f = fixture(); f.drag.down(f.event(10), 'alpha'); f.target('gamma'); f.drag.move(f.event(350));
  f.replace(['alpha', 'beta', 'gamma', 'new-worker']); f.drag.up(f.event(350));
  assert.deepEqual(f.order(), ['beta', 'gamma', 'alpha', 'new-worker']);
  const g = fixture(); g.drag.down(g.event(10), 'alpha'); g.target('gamma'); g.drag.move(g.event(350)); g.replace(['beta', 'gamma']); g.drag.up(g.event(350));
  assert.deepEqual(g.order(), ['beta', 'gamma']);
});

test('a new press clears click suppression; delayed and keyboard clicks remain usable', () => {
  const f = fixture(); f.drag.down(f.event(10), 'alpha'); f.target('beta'); f.drag.move(f.event(180)); f.drag.up(f.event(180));
  assert.equal(f.drag.consumeClick(0), false); f.drag.down(f.event(180), 'beta'); f.drag.up(f.event(180));
  assert.equal(f.drag.consumeClick(1), false);
  f.drag.down(f.event(10), 'alpha'); f.target('beta'); f.drag.move(f.event(180)); f.drag.up(f.event(180)); f.advance(251);
  assert.equal(f.drag.consumeClick(1), false);
});

test('failure to capture a pointer keeps the tab available as a normal button', () => {
  const f = fixture(); f.element.setPointerCapture = () => { throw new Error('Pointer is no longer active'); };
  f.drag.down(f.event(10), 'alpha'); f.target('beta'); f.drag.move(f.event(180)); f.drag.up(f.event(180));
  assert.equal(f.commits.length, 0); assert.equal(f.drag.consumeClick(1), false);
});
