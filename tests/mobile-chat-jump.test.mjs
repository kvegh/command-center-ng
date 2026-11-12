import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = await readFile(new URL('../src/mobile-chat-jump.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('mobile-chat-jump.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'MobileChatJump');
assert.ok(component, 'exercise the actual component and its handlers');
const compiled = ts.transpileModule(component.getText(ast).replace(/^export /, ''), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;

function fixture({ scrollY = 0, compact = true, conversationId = 'chat-one', resizeObserver = true, scrollEvents = true } = {}) {
  const slots = [], pending = [], listeners = new Map(), observers = [], calls = [];
  let cursor = 0;
  const page = {
    scrollY, innerHeight: 800,
    addEventListener(name, callback, options) {
      const rows = listeners.get(name) || []; rows.push({ callback, options }); listeners.set(name, rows);
    },
    removeEventListener(name, callback) { listeners.set(name, (listeners.get(name) || []).filter(row => row.callback !== callback)); },
    scrollTo(options) { calls.push(options); page.scrollY = options.top; if (scrollEvents) f.emit('scroll'); },
  };
  class Observer {
    constructor(callback) { this.callback = callback; this.nodes = []; this.disconnected = false; observers.push(this); }
    observe(node) { this.nodes.push(node); }
    disconnect() { this.disconnected = true; }
  }
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        slots[index] = { deps };
        pending.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const Component = new Function('React', 'useState', 'useEffect', 'window', 'ResizeObserver', `${compiled}\nreturn MobileChatJump;`)(
    React, hooks.useState, hooks.useEffect, page, resizeObserver ? Observer : undefined,
  );
  const composer = { end: 5200, getBoundingClientRect() { return { bottom: this.end - page.scrollY }; } };
  const conversation = {
    start: 600, end: 5000, scrollTop: 123,
    getBoundingClientRect() { return { top: this.start - page.scrollY, bottom: this.end - page.scrollY }; },
    parentElement: { querySelector(selector) { assert.equal(selector, '.composer'); return composer; } },
  };
  const props = { compact, conversationId, conversationRef: { current: conversation } };
  const f = {
    props, page, conversation, composer, calls, listeners, observers,
    render() { cursor = 0; const tree = Component(props); pending.splice(0).forEach(effect => effect()); return tree; },
    settled() { f.render(); return f.render(); },
    emit(name) { for (const { callback } of listeners.get(name) || []) callback(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
  return f;
}

const buttons = tree => React.Children.toArray(tree?.props.children).filter(child => child.type === 'button');
const labels = tree => buttons(tree).map(button => button.props.children);
function button(tree, label) {
  const found = buttons(tree).find(control => control.props.children === label);
  assert.ok(found, `${label} is available`);
  return found;
}

test('visible app section offers an accessible Bottom button using current composer geometry', () => {
  const f = fixture({ scrollY: 120 });
  const navigation = f.settled();
  assert.equal(navigation.type, 'div');
  assert.equal(navigation.props.className, 'mobile-chat-jump');
  assert.deepEqual(labels(navigation), ['Jump to bottom'], 'app section remains visible despite nonzero page scrolling');
  const bottom = button(navigation, 'Jump to bottom');
  assert.equal(bottom.props.type, 'button');
  assert.match(renderToStaticMarkup(navigation), />Jump to bottom<\/button>/);
  bottom.props.onClick();
  assert.deepEqual(f.calls, [{ top: 4400, behavior: 'instant' }]);
  assert.equal(f.conversation.scrollTop, 123, 'desktop reading position is untouched');
  assert.deepEqual(labels(f.render()), ['Jump to top']);
  f.unmount();
});

test('Top and Bottom appear independently in the middle, at the history beginning and at its end', () => {
  const f = fixture({ scrollY: 599 });
  assert.deepEqual(labels(f.settled()), ['Jump to bottom'], 'one pixel of the section above chat remains visible');
  f.page.scrollY = 600; f.emit('scroll');
  assert.deepEqual(labels(f.render()), ['Jump to top', 'Jump to bottom'], 'history reached the viewport top while its end remains below');
  f.page.scrollY = 900; f.emit('scroll');
  assert.deepEqual(labels(f.render()), ['Jump to top', 'Jump to bottom']);
  f.page.scrollY = 4199; f.emit('scroll');
  assert.deepEqual(labels(f.render()), ['Jump to top', 'Jump to bottom'], 'history end is one pixel below the viewport');
  f.page.scrollY = 4200; f.emit('scroll');
  assert.deepEqual(labels(f.render()), ['Jump to top'], 'history end has entered the viewport');
  f.page.scrollY = 5001; f.emit('scroll');
  assert.deepEqual(labels(f.render()), ['Jump to top', 'Jump to bottom'], 'an end above the viewport also remains reachable');
  assert.equal(f.listeners.get('scroll')[0].options.passive, true);
  f.unmount();
});

test('short histories show neither button when the app section and history end are visible', () => {
  const f = fixture();
  f.conversation.start = 100; f.conversation.end = 500; f.composer.end = 700;
  const navigation = f.settled();
  assert.ok(navigation, 'retain the stable navigation row without moving document content');
  assert.deepEqual(labels(navigation), []);
  assert.deepEqual(f.calls, []);
  f.unmount();
});

test('overview layout and viewport changes refresh visibility without moving the page', () => {
  const f = fixture({ scrollY: 500 });
  assert.deepEqual(labels(f.settled()), ['Jump to bottom']);
  assert.ok(f.observers[0].nodes.includes(f.conversation.parentElement), 'observe overview layout through the shared panel');
  f.conversation.start = 450; f.observers[0].callback();
  assert.deepEqual(labels(f.render()), ['Jump to top', 'Jump to bottom']);
  f.conversation.start = 750; f.conversation.end = 1200; f.observers[0].callback();
  assert.deepEqual(labels(f.render()), []);
  f.page.innerHeight = 400; f.emit('resize');
  assert.deepEqual(labels(f.render()), ['Jump to bottom']);
  assert.deepEqual(f.calls, [], 'observation never scrolls automatically');
  assert.equal(f.conversation.scrollTop, 123);
  f.unmount();
});

test('each button retains its own direction when a scroll event has not been processed', () => {
  const f = fixture({ scrollY: 900 });
  let navigation = f.settled();
  const top = button(navigation, 'Jump to top');
  f.page.scrollY = 0;
  top.props.onClick();
  assert.deepEqual(f.calls.at(-1), { top: 0, behavior: 'instant' }, 'Top does not turn into Bottom after an unprocessed scroll');
  navigation = f.render();
  const bottom = button(navigation, 'Jump to bottom');
  f.page.scrollY = 900;
  bottom.props.onClick();
  assert.deepEqual(f.calls.at(-1), { top: 4400, behavior: 'instant' }, 'Bottom does not turn into Top after an unprocessed scroll');
  f.unmount();
});

test('Top followed by Bottom refreshes controls without synchronous scroll events', () => {
  const f = fixture({ scrollY: 900, scrollEvents: false });
  button(f.settled(), 'Jump to top').props.onClick();
  assert.deepEqual(f.calls.at(-1), { top: 0, behavior: 'instant' });
  const navigation = f.render();
  assert.deepEqual(labels(navigation), ['Jump to bottom']);
  button(navigation, 'Jump to bottom').props.onClick();
  assert.deepEqual(f.calls.at(-1), { top: 4400, behavior: 'instant' });
  assert.deepEqual(labels(f.render()), ['Jump to top']);
  f.unmount();
});

test('streamed growth and tab switches use current geometry without automatically scrolling', () => {
  const f = fixture({ scrollY: 4400 });
  assert.deepEqual(labels(f.settled()), ['Jump to top']);
  f.conversation.end = 8000; f.composer.end = 8200; f.observers[0].callback();
  assert.deepEqual(f.calls, []);
  button(f.render(), 'Jump to bottom').props.onClick();
  assert.equal(f.calls.at(-1).top, 7400);
  const oldObserver = f.observers[0];
  f.props.conversationId = 'chat-two';
  f.props.conversationRef.current = { scrollTop: 789, getBoundingClientRect: () => ({ top: 300 - f.page.scrollY, bottom: 1200 - f.page.scrollY }) };
  f.page.scrollY = 0;
  const navigation = f.settled();
  assert.equal(oldObserver.disconnected, true);
  assert.equal(f.listeners.get('scroll').length, 1, 'switching tabs does not accumulate listeners');
  assert.deepEqual(labels(navigation), ['Jump to bottom']);
  button(navigation, 'Jump to bottom').props.onClick();
  assert.equal(f.calls.at(-1).top, 400, 'history end is the fallback without a composer');
  assert.equal(f.props.conversationRef.current.scrollTop, 789);
  f.unmount();
});

test('Bottom clamps its target to page start and follows the current viewport height', () => {
  const f = fixture();
  const bottom = button(f.settled(), 'Jump to bottom');
  // Content can collapse between displaying the control and processing its tap.
  f.conversation.start = 100; f.conversation.end = 500; f.composer.end = 600;
  bottom.props.onClick();
  assert.equal(f.calls.at(-1).top, 0);
  f.conversation.start = 600; f.conversation.end = 5000; f.composer.end = 5200; f.page.innerHeight = 400; f.emit('resize');
  button(f.render(), 'Jump to bottom').props.onClick();
  assert.equal(f.calls.at(-1).top, 4800);
  f.unmount();
});

test('desktop and inactive conversations render no controls and release observers/listeners', () => {
  for (const patch of [{ compact: false }, { conversationId: '' }]) {
    const f = fixture(); f.settled(); Object.assign(f.props, patch);
    assert.equal(f.settled(), null);
    assert.equal(f.listeners.get('scroll').length, 0); assert.equal(f.listeners.get('resize').length, 0);
    assert.ok(f.observers.every(observer => observer.disconnected)); assert.deepEqual(f.calls, []);
    f.unmount();
  }
  const desktop = fixture({ compact: false }); assert.equal(desktop.settled(), null);
  assert.equal(desktop.listeners.size, 0); assert.equal(desktop.observers.length, 0);
});

test('unmount and unavailable history are safe, and navigation works without ResizeObserver', () => {
  const f = fixture({ resizeObserver: false });
  const bottom = button(f.settled(), 'Jump to bottom');
  f.page.scrollY = 900; f.emit('scroll');
  assert.deepEqual(labels(f.render()), ['Jump to top', 'Jump to bottom']);
  f.props.conversationRef.current = null; bottom.props.onClick(); assert.deepEqual(f.calls, []);
  f.unmount(); assert.equal(f.listeners.get('scroll').length, 0); assert.equal(f.listeners.get('resize').length, 0);
  const absent = fixture(); absent.props.conversationRef.current = null; assert.equal(absent.settled(), null);
  assert.equal(absent.listeners.size, 0);
});
