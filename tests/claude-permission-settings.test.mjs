import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/claude-permission-settings.tsx', import.meta.url), 'utf8');
const options = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React };
const compiled = ts.transpileModule(source, { compilerOptions: options }).outputText
  .replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
const { ClaudePermissionSettings } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const defaults = { agentId: 'claude-worker', connected: true, available: true, permissionMode: 'default', permissionChange: null,
  load: async () => ({ available: true, mode: 'default', change: null }),
  save: async ({ mode }) => ({ available: true, mode: 'default', change: { mode, status: 'acknowledged' } }) };

function descendants(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => descendants(child, predicate))];
}
function fixture(props = {}) {
  let element;
  function Capture() { element = ClaudePermissionSettings({ ...defaults, ...props }); return null; }
  renderToStaticMarkup(React.createElement(Capture));
  return { element, html: renderToStaticMarkup(element), buttons: descendants(element, node => node.type === 'button') };
}

test('permission choices are explicit per-session actions without a selected provider default', async () => {
  const calls = [];
  const { html, buttons } = fixture({ save: async choice => { calls.push(choice); return defaults.save(choice); } });
  assert.match(html, /aria-label="Claude permission mode"/);
  assert.match(html, /Claude reports Manual mode/);
  assert.deepEqual(buttons.map(button => button.props.children), ['Enable Auto', 'Use Manual', 'Refresh permissions']);
  assert.ok(buttons.every(button => button.props.type === 'button'));
  assert.deepEqual(calls, [], 'rendering never changes the native permission mode');
  await buttons[0].props.onClick();
  await buttons[1].props.onClick();
  assert.deepEqual(calls, [{ mode: 'auto' }, { mode: 'default' }]);
});

test('reported mode and acknowledged request remain separate, including native fallback', () => {
  const changed = { mode: 'auto', status: 'acknowledged' };
  const manual = fixture({ permissionMode: 'default', permissionChange: changed }).html;
  assert.match(manual, /Claude reports Manual mode/);
  assert.match(manual, /Auto mode request acknowledged/);
  assert.doesNotMatch(manual, /Claude reports Auto mode/);
  const actual = fixture({ permissionMode: 'auto', permissionChange: changed }).html;
  assert.match(actual, /Claude reports Auto mode/);
  const unknown = fixture({ permissionMode: null, permissionChange: changed }).html;
  assert.match(unknown, /has not reported its current permission mode/);
  assert.doesNotMatch(unknown, /Claude reports Auto mode/);
});

test('configured Auto remains distinct from native mode for an unmanaged session', async () => {
  const calls = [];
  const { html, buttons } = fixture({ available: false, permissionMode: null, configuredAuto: true,
    save: async choice => { calls.push(choice); return defaults.save(choice); } });
  assert.match(html, /Auto is configured for this session’s next managed process/);
  assert.match(html, /has not reported its current permission mode/);
  assert.match(html, /Available only while this Claude session is connected and managed/);
  assert.doesNotMatch(html, /Claude reports Auto mode|Auto mode request acknowledged|Auto enabled/);
  assert.ok(buttons.every(button => button.props.disabled));
  await buttons[0].props.onClick(); assert.deepEqual(calls, []);
  const fallback = fixture({ configuredAuto: true, permissionMode: 'default',
    permissionChange: { mode: 'auto', status: 'acknowledged' } }).html;
  assert.match(fallback, /Claude reports Manual mode/);
  assert.match(fallback, /Auto is configured for this session’s next managed process/);
  assert.doesNotMatch(fallback, /Claude reports Auto mode/);
  assert.doesNotMatch(fixture({ configuredAuto: false }).html, /Auto is configured/);
});

test('pending native changes disable setters and cannot be bypassed through their callbacks', async () => {
  const calls = [];
  const { html, buttons } = fixture({ permissionChange: { mode: 'auto', status: 'pending' },
    save: async choice => { calls.push(choice); return defaults.save(choice); } });
  assert.match(html, /Waiting for Claude to confirm/);
  assert.ok(buttons.slice(0, 2).every(button => button.props.disabled));
  await buttons[0].props.onClick(); await buttons[1].props.onClick();
  assert.deepEqual(calls, []);
});

test('disconnected, externally owned and ended sessions have no writable controls or read attempts', async () => {
  for (const props of [{ connected: false }, { available: false }, { available: false, permissionMode: null }]) {
    const calls = [];
    const { html, buttons } = fixture({ ...props, load: async () => { calls.push('load'); return defaults.load(); },
      save: async choice => { calls.push(choice); return defaults.save(choice); } });
    assert.match(html, /Available only while this Claude session is connected and managed/);
    assert.ok(buttons.every(button => button.props.disabled));
    for (const button of buttons) await button.props.onClick();
    assert.deepEqual(calls, []);
  }
});

test('duplicate clicks during a native setter share no second mode request', async () => {
  const calls = []; let finish;
  const { buttons } = fixture({ save: choice => { calls.push(choice); return new Promise(resolve => { finish = resolve; }); } });
  const first = buttons[0].props.onClick();
  await buttons[0].props.onClick(); await buttons[1].props.onClick(); await buttons[2].props.onClick();
  assert.deepEqual(calls, [{ mode: 'auto' }]);
  finish({ available: true, mode: null, change: { mode: 'auto', status: 'acknowledged' } }); await first;
});

test('unconfirmed outcomes and native errors remain visible alongside actual observed mode', () => {
  const html = fixture({ permissionMode: 'auto', permissionChange: {
    mode: 'auto', status: 'unconfirmed', error: 'Native acknowledgement was lost.' } }).html;
  assert.match(html, /Claude reports Auto mode/);
  assert.match(html, /Permission change is unconfirmed/);
  assert.match(html, /role="alert">Native acknowledgement was lost/);
  assert.doesNotMatch(html, /request acknowledged/);
});

test('refresh reads settings only and failed setters do not retry or answer requests', async () => {
  const calls = [];
  const { buttons } = fixture({ load: async () => { calls.push('read'); return defaults.load(); },
    save: async choice => { calls.push(choice); throw new Error('Native control disconnected.'); } });
  await buttons[2].props.onClick();
  assert.deepEqual(calls, ['read']);
  await buttons[0].props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['read', { mode: 'auto' }]);
});

test('native unsupported modes and errors are escaped literal values rather than Auto claims', () => {
  const html = fixture({ permissionMode: '<script>other-mode</script>', permissionChange: {
    mode: 'default', status: 'unconfirmed', error: '<img src=x onerror=bad>' } }).html;
  assert.match(html, /&lt;script&gt;other-mode&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=bad&gt;/);
  assert.doesNotMatch(html, /<script|<img|Claude reports Auto mode/);
});
