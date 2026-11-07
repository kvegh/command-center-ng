import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function component(name) {
  const source = await readFile(new URL(`../src/${name}.tsx`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(compiled.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`)).toString('base64'));
}
const { ChatHeader } = await component('chat-header');
const { WorkerStatus, workerStatusView, sendWithReceipt, observeWorkspaceStream } = await component('worker-status');
const now = Date.parse('2026-01-01T10:00:00Z');
const live = { state: 'connected', lastSignalAt: now };
const worker = values => ({ status: 'idle', questions: [], ...values });

test('chat header shows its escaped title, four choices and right-side status without sending input', () => {
  const html = renderToStaticMarkup(React.createElement(ChatHeader, {
    id: 'one', name: '<Example project>', colour: 'violet', changeColour() { assert.fail('Rendering must not change settings'); },
    children: React.createElement('span', null, 'Working'),
  }));
  assert.match(html, /data-chat-colour="violet"/);
  assert.match(html, /<h2 title="&lt;Example project&gt;">&lt;Example project&gt;<\/h2>/);
  assert.match(html, /aria-label="Colour for &lt;Example project&gt;"/);
  assert.equal((html.match(/<option /g) || []).length, 4);
  assert.match(html, /value="violet" selected=""/);
  assert.ok(html.indexOf('</select>') < html.indexOf('Working'));
});

test('colour changes stay bound to the originating chat and reject arbitrary values', () => {
  const changed = [];
  const dropdown = id => ChatHeader({ id, name: id, colour: 'cyan', changeColour: (...args) => changed.push(args) }).props.children[0].props.children[2];
  const first = dropdown('one'); const second = dropdown('two');
  first.props.onChange({ target: { value: 'amber' } });
  second.props.onChange({ target: { value: 'green' } });
  first.props.onChange({ target: { value: 'arbitrary-css' } });
  assert.deepEqual(changed, [['one', 'amber'], ['two', 'green']]);
});

test('input receipt waits for native-backed acknowledgement and stays with its worker across selection changes', async () => {
  const receipts = {}; let selected = 'one'; let accept;
  const sending = sendWithReceipt('one', () => new Promise(resolve => { accept = resolve; }), (id, receipt) => { receipts[id] = receipt; }, () => now);
  assert.equal(receipts.one.state, 'sending');
  selected = 'two';
  assert.equal(receipts[selected], undefined);
  accept(true); assert.equal(await sending, true);
  assert.deepEqual(receipts.one, { state: 'received', at: now });
  assert.equal(receipts.two, undefined);
});

test('failed or uncertain delivery is never labelled received or automatically retried', async () => {
  for (const throws of [false, true]) {
    const updates = []; let attempts = 0;
    const result = sendWithReceipt('one', async () => { attempts++; if (throws) throw new Error('Connection lost'); return false; }, (id, receipt) => updates.push([id, receipt.state]));
    if (throws) await assert.rejects(result, /Connection lost/); else assert.equal(await result, false);
    assert.deepEqual(updates, [['one', 'sending'], ['one', 'unconfirmed']]);
    assert.equal(attempts, 1);
  }
});

test('native status and outcomes distinguish working, questions, idle, finished, stopped and errors', () => {
  for (const [values, activity] of [
    [{ status: 'running', finishedTurn: { status: 'failed' } }, 'Working'],
    [{ status: 'attention' }, 'Needs your answer'],
    [{ status: 'running', questions: [{ id: 1 }] }, 'Needs your answer'],
    [{}, 'Idle'], [{ finishedTurn: { status: 'completed' } }, 'Finished'],
    [{ finishedTurn: { status: 'interrupted' } }, 'Stopped'],
    [{ finishedTurn: { status: 'failed' } }, 'Error'], [{ status: 'error' }, 'Error'], [{ status: 'offline' }, 'Offline'],
  ]) assert.equal(workerStatusView(worker(values), live, true, now).activity, activity);
});

test('transport freshness never invents worker activity or a stuck state', () => {
  const busy = worker({ status: 'running', lastNativeEventAt: new Date(now - 600_000).toISOString() });
  assert.equal(workerStatusView(busy, live, true, now).age, 'Last agent update 10m ago');
  for (const [stream, runtimeConnected, connection] of [
    [{ state: 'connecting', lastSignalAt: null }, true, 'Connecting to CCNG'],
    [{ state: 'reconnecting', lastSignalAt: now }, true, 'CCNG reconnecting'],
    [{ state: 'connected', lastSignalAt: now - 45_000 }, true, 'Connection unconfirmed'],
    [live, false, 'Codex disconnected'],
  ]) {
    const view = workerStatusView(busy, stream, runtimeConnected, now);
    assert.equal(view.connection, connection); assert.equal(view.activity, 'Last known: Working');
    assert.equal(view.working, false); assert.equal(view.age, 'Last agent update 10m ago');
  }
  assert.equal(workerStatusView(worker({}), live, true, now).age, 'Last agent update unknown');
});

test('SSE snapshots and named heartbeats update transport separately, with reconnection and cleanup', () => {
  const stream = new EventTarget(); let closed = false; stream.close = () => { closed = true; };
  const snapshots = []; const health = []; let errors = 0; let clock = now;
  const stop = observeWorkspaceStream(stream, value => snapshots.push(value), value => health.push(value), () => { errors++; }, () => clock);
  assert.deepEqual(health.at(-1), { state: 'connecting', lastSignalAt: null });
  stream.dispatchEvent(new Event('open'));
  stream.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ agents: [worker({ status: 'idle' })] }) }));
  clock += 15000; stream.dispatchEvent(new MessageEvent('heartbeat', { data: '{}' }));
  assert.equal(snapshots.length, 1); assert.equal(snapshots[0].agents[0].status, 'idle');
  assert.deepEqual(health.at(-1), { state: 'connected', lastSignalAt: clock });
  stream.dispatchEvent(new Event('error'));
  assert.equal(errors, 1); assert.equal(health.at(-1).state, 'reconnecting');
  clock += 1000; stream.dispatchEvent(new Event('open'));
  assert.deepEqual(health.at(-1), { state: 'connected', lastSignalAt: clock });
  stop(); assert.equal(closed, true);
  const count = health.length; stream.dispatchEvent(new Event('heartbeat'));
  assert.equal(health.length, count);
});

test('status renders receipt and connection words with update age outside the live announcement', () => {
  const html = renderToStaticMarkup(React.createElement(WorkerStatus, {
    worker: worker({ status: 'running' }), receipt: { state: 'received', at: Date.now() },
    stream: { state: 'connected', lastSignalAt: Date.now() }, runtimeConnected: true,
  }));
  assert.match(html, /Input received/); assert.match(html, /Working/); assert.match(html, />Connected</);
  assert.match(html, /class="worker-status-age" aria-live="off"/);
  assert.doesNotMatch(html, /stuck|setInterval|<button/);
});
