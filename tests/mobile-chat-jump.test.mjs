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

function fixture({ scrollY = 0, compact = true, conversationId = 'chat-one', resizeObserver = true } = {}) {
  const slots = [], pending = [], listeners = new Map(), observers = [], calls = [];
  let cursor = 0;
  const page = {
    scrollY, innerHeight: 800,
    addEventListener(name, callback, options) {
      const rows = listeners.get(name) || []; rows.push({ callback, options }); listeners.set(name, rows);
    },
    removeEventListener(name, callback) { listeners.set(name, (listeners.get(name) || []).filter(row => row.callback !== callback)); },
    scrollTo(options) { calls.push(options); page.scrollY = options.top; f.emit('scroll'); },
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
    end: 5000, scrollTop: 123, getBoundingClientRect() { return { bottom: this.end - page.scrollY }; },
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

test('mobile page top offers an accessible non-submit button that jumps to the active chat end', () => {
  const f = fixture();
  const button = f.settled();
  assert.equal(button.type, 'button'); assert.equal(button.props.type, 'button');
  assert.equal(button.props.className, 'mobile-chat-jump');
  assert.match(renderToStaticMarkup(button), />Jump to end<\/button>/);
  button.props.onClick();
  assert.deepEqual(f.calls, [{ top: 4400, behavior: 'instant' }]);
  assert.equal(f.conversation.scrollTop, 123, 'desktop scroll state is untouched');
  assert.equal(f.render().props.children, 'Jump to top');
  f.unmount();
});

test('scrolling anywhere down the mobile page offers document top, including before the history begins', () => {
  const f = fixture({ scrollY: 120 });
  let button = f.settled();
  assert.equal(button.props.children, 'Jump to top');
  button.props.onClick();
  assert.deepEqual(f.calls.at(-1), { top: 0, behavior: 'instant' });
  button = f.render(); assert.equal(button.props.children, 'Jump to end');
  f.page.scrollY = 4; f.emit('scroll'); assert.equal(f.render().props.children, 'Jump to end');
  f.page.scrollY = 5; f.emit('scroll'); assert.equal(f.render().props.children, 'Jump to top');
  assert.equal(f.listeners.get('scroll')[0].options.passive, true);
  f.unmount();
});

test('streamed history and tab switches use current conversation geometry without scrolling automatically', () => {
  const f = fixture(); f.settled();
  f.conversation.end = 8000; f.composer.end = 8200; f.observers[0].callback();
  assert.deepEqual(f.calls, [], 'history growth is observation only');
  f.render().props.onClick(); assert.equal(f.calls.at(-1).top, 7400);
  const oldObserver = f.observers[0];
  f.props.conversationId = 'chat-two';
  f.props.conversationRef.current = { scrollTop: 789, getBoundingClientRect: () => ({ bottom: 1200 - f.page.scrollY }) };
  f.page.scrollY = 0;
  let button = f.settled();
  assert.equal(oldObserver.disconnected, true);
  assert.equal(f.listeners.get('scroll').length, 1, 'switching tabs does not accumulate listeners');
  button.props.onClick(); assert.equal(f.calls.at(-1).top, 400, 'history is the fallback when no composer exists');
  f.page.scrollY = 0; f.emit('resize'); button = f.render();
  assert.equal(button.props.children, 'Jump to end');
  assert.equal(f.props.conversationRef.current.scrollTop, 789);
  f.unmount();
});

test('shorter chats clamp at page start and end alignment follows the current viewport height', () => {
  const f = fixture(); f.settled();
  f.composer.end = 600; f.render().props.onClick(); assert.equal(f.calls.at(-1).top, 0);
  f.composer.end = 5200; f.page.innerHeight = 400; f.emit('resize');
  f.render().props.onClick(); assert.equal(f.calls.at(-1).top, 4800);
  f.unmount();
});

test('desktop and inactive conversations render no control and release mobile observers/listeners', () => {
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

test('unmount and unavailable history are safe, and scrolling works without ResizeObserver', () => {
  const f = fixture({ resizeObserver: false }); const button = f.settled();
  f.page.scrollY = 200; f.emit('scroll'); assert.equal(f.render().props.children, 'Jump to top');
  f.props.conversationRef.current = null; button.props.onClick(); assert.deepEqual(f.calls, []);
  f.unmount(); assert.equal(f.listeners.get('scroll').length, 0); assert.equal(f.listeners.get('resize').length, 0);
  const absent = fixture(); absent.props.conversationRef.current = null; assert.equal(absent.settled(), null);
  assert.equal(absent.listeners.size, 0);
});
