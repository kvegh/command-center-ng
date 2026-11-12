import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import postcss from 'postcss';

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

test('chat header limits the coloured folder tab to its title and keeps six choices/status outside it', () => {
  const props = {
    id: 'one', name: '<Example project>', colour: 'violet', changeColour() { assert.fail('Rendering must not change settings'); },
    children: React.createElement('span', null, 'Working'),
  };
  const element = ChatHeader(props);
  const html = renderToStaticMarkup(element);
  assert.match(html, /data-chat-colour="violet"/);
  assert.match(html, /<h2 title="&lt;Example project&gt;">&lt;Example project&gt;<\/h2>/);
  assert.match(html, /aria-label="Colour for &lt;Example project&gt;"/);
  assert.equal((html.match(/<option /g) || []).length, 6);
  assert.doesNotMatch(html, /value="amber"/);
  assert.match(html, /value="violet" selected=""/);
  assert.ok(html.indexOf('</select>') < html.indexOf('Working'));
  const [heading, status] = element.props.children;
  const [title, select] = heading.props.children;
  assert.equal(title.props.className, 'chat-title-tab');
  assert.equal(select.type, 'select');
  assert.equal(status.props.className, 'chat-header-status');
  assert.equal(status.props.children, props.children, 'the existing status component stays outside the title fill');
  assert.doesNotMatch(renderToStaticMarkup(title), /<select|Working/);
});

test('colour changes stay bound to the originating chat and reject arbitrary values', () => {
  const changed = [];
  const dropdown = id => ChatHeader({ id, name: id, colour: 'cyan', changeColour: (...args) => changed.push(args) }).props.children[0].props.children[1];
  const first = dropdown('one'); const second = dropdown('two');
  first.props.onChange({ target: { value: 'blue' } });
  second.props.onChange({ target: { value: 'green' } });
  first.props.onChange({ target: { value: 'teal' } });
  second.props.onChange({ target: { value: 'rose' } });
  first.props.onChange({ target: { value: 'amber' } });
  first.props.onChange({ target: { value: 'arbitrary-css' } });
  assert.deepEqual(changed, [['one', 'blue'], ['two', 'green'], ['one', 'teal'], ['two', 'rose']]);
});

test('six chat colours share matching active agent/title fills with readable text in all three themes', async () => {
  const sheet = postcss.parse(await readFile(new URL('../src/style.css', import.meta.url), 'utf8'));
  const header = sheet.nodes.find(rule => rule.type === 'rule' && rule.selector === '.chat-header');
  const title = sheet.nodes.find(rule => rule.type === 'rule' && rule.selector === '.chat-title-tab');
  const sharedColours = sheet.nodes.find(rule => rule.type === 'rule' && rule.selector === '[data-chat-colour]');
  const activeTab = sheet.nodes.find(rule => rule.type === 'rule' && rule.selector === '.tab-wrap.active');
  const declaration = (rule, property) => rule.nodes.filter(node => node.type === 'decl' && node.prop === property).at(-1)?.value;
  const background = declaration(title, 'background');
  const mix = /^color-mix\(in srgb, var\(--chat-colour\) (\d+)%, var\(--surface\)\)$/.exec(declaration(sharedColours, '--chat-tab-background'));
  assert.ok(mix, 'one shared colour mix defines both backgrounds');
  assert.equal(background, 'var(--chat-tab-background)');
  assert.equal(declaration(activeTab, 'background'), background, 'active worker and Coordinator tabs use the same fill token as the input title');
  assert.equal(declaration(activeTab, 'border-color'), 'var(--accent)', 'selected frame colour is unchanged');
  assert.equal(declaration(activeTab, 'box-shadow'), 'inset 1px 0 var(--accent), inset -1px 0 var(--accent)');
  for (const [state, colour] of [['running', 'var(--green)'], ['attention', 'var(--amber)'], ['idle', '#778aa6'], ['error', '#ff8b8b']]) {
    const rule = sheet.nodes.find(rule => rule.type === 'rule' && rule.selector === `.tab-wrap.${state}`);
    assert.equal(declaration(rule, 'border-top-color'), colour, `${state} keeps its status frame`);
    assert.equal(declaration(rule, 'background'), undefined);
  }
  const inactiveTab = sheet.nodes.find(rule => rule.type === 'rule' && rule.selector === '.tab-wrap');
  assert.equal(declaration(inactiveTab, 'background'), 'var(--surface)', 'inactive tabs keep their neutral fill');
  assert.equal(declaration(header, 'background'), 'transparent');
  assert.equal(declaration(header, 'border'), '0');
  assert.equal(declaration(header, 'margin-bottom'), '0');
  assert.equal(declaration(title, 'border-bottom'), '0');
  assert.equal(declaration(title, 'border-radius'), '7px 7px 0 0');
  assert.equal(declaration(title, 'transform'), 'translateY(1px)', 'the title meets the input without a separating seam');
  const select = sheet.nodes.find(rule => rule.type === 'rule' && rule.selector === '.chat-heading select');
  assert.equal(declaration(select, 'background'), 'var(--surface)');
  const status = sheet.nodes.find(rule => rule.type === 'rule' && rule.selector === '.chat-header-status');
  assert.equal(declaration(status, 'background'), 'transparent');
  const channels = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const luminance = rgb => rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  for (const theme of ['classic', 'contrastful', 'light']) {
    const palette = {};
    sheet.walkRules(rule => {
      if (rule.selectors.includes(':root') || rule.selectors.includes(`:root[data-theme="${theme}"]`)) {
        rule.walkDecls(decl => { palette[decl.prop] = decl.value; });
      }
      if (rule.selectors.some(selector => /\.composer(?:\b|-box)/.test(selector))) {
        assert.ok(!rule.nodes.some(node => node.type === 'decl' && node.value.includes('--chat-colour')), 'chat colouring stays outside the composer/input frame');
      }
    });
    sharedColours.walkDecls(decl => { if (decl.prop.startsWith('--chat-')) palette[decl.prop] = decl.value; });
    const themedColours = sheet.nodes.find(rule => rule.type === 'rule' && rule.selector === `:root[data-theme="${theme}"] [data-chat-colour]`);
    themedColours?.walkDecls(decl => { palette[decl.prop] = decl.value; });
    const themedActive = sheet.nodes.find(rule => rule.type === 'rule' && rule.selector === `:root[data-theme="${theme}"] .tab-wrap.active`);
    assert.equal(themedActive && declaration(themedActive, 'background'), undefined, `${theme}: no theme-specific gradient overrides the shared fill`);
    const backgrounds = new Set();
    for (const colour of ['cyan', 'violet', 'green', 'blue', 'teal', 'rose']) {
      const rule = sheet.nodes.find(rule => rule.type === 'rule' && rule.selector === `[data-chat-colour="${colour}"]`);
      const selected = declaration(rule || sharedColours, '--chat-colour');
      const variable = /^var\((--[a-z-]+)\)$/.exec(selected)?.[1];
      assert.ok(variable && palette[variable], `${theme}/${colour}: selected colour resolves through the current theme`);
      const fraction = Number(mix[1]) / 100;
      const surface = channels(palette['--surface']);
      const tinted = channels(palette[variable]).map((value, index) => value * fraction + surface[index] * (1 - fraction));
      backgrounds.add(JSON.stringify(tinted));
      for (const text of ['--ink']) {
        const [light, dark] = [luminance(channels(palette[text])), luminance(tinted)].sort((a, b) => b - a);
        const ratio = (light + .05) / (dark + .05);
        assert.ok(ratio >= 4.5, `${theme}/${colour}/${text}: text contrast ${ratio.toFixed(2)} must remain readable`);
      }
    }
    assert.equal(backgrounds.size, 6, `${theme}: all six choices produce distinct persistent backgrounds`);
  }
  const mobile = sheet.nodes.find(node => node.type === 'atrule' && node.name === 'media' && node.params === '(max-width: 600px)');
  assert.equal(declaration(mobile.nodes.find(rule => rule.selector === '.chat-heading'), 'grid-row'), '2');
  assert.equal(declaration(mobile.nodes.find(rule => rule.selector === '.chat-header-status'), 'grid-row'), '1', 'wrapped status stays above the attached title');
  const focus = sheet.nodes.find(rule => rule.type === 'rule' && rule.selector === '.chat-heading select:focus-visible');
  assert.equal(declaration(focus, 'outline'), '2px solid var(--accent)');
});

test('worker and Coordinator tabs bind the same saved chat colour and default as their input title', async () => {
  const source = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const main = ts.createSourceFile('main.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let tabColour, inputColour;
  const visit = node => {
    if (ts.isJsxAttribute(node) && node.name.text === 'data-chat-colour') tabColour = node.initializer.expression;
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(main) === 'ChatHeader') {
      inputColour = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'colour')?.initializer.expression;
    }
    ts.forEachChild(node, visit);
  };
  visit(main);
  assert.ok(tabColour && inputColour);
  const compiled = ts.transpileModule(`
    export const topColour = (chatColours, agent) => (${tabColour.getText(main)});
    export const titleColour = (chatColours, active) => (${inputColour.getText(main)});
  `, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { topColour, titleColour } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
  for (const role of ['worker', 'coordinator']) {
    const agent = { id: role, role };
    const colours = {};
    assert.equal(topColour(colours, agent), 'cyan');
    assert.equal(topColour(colours, agent), titleColour(colours, agent));
    for (const colour of ['cyan', 'violet', 'green', 'blue', 'teal', 'rose']) {
      colours[agent.id] = colour;
      assert.equal(topColour(colours, agent), colour, 'changing the existing selection updates the top tab');
      assert.equal(topColour(colours, agent), titleColour(colours, agent));
    }
  }
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
    [{ status: 'attention' }, 'Request details unavailable'],
    [{ status: 'running', questions: [{ id: 1 }] }, 'Needs your answer'],
    [{}, 'Idle'], [{ finishedTurn: { status: 'completed' } }, 'Finished'],
    [{ finishedTurn: { status: 'interrupted' } }, 'Stopped'],
    [{ finishedTurn: { status: 'failed' } }, 'Error'], [{ status: 'error' }, 'Error'], [{ status: 'offline' }, 'Offline'],
  ]) assert.equal(workerStatusView(worker(values), live, true, now).activity, activity);
});

test('footer uses shared request presentation without turning neutral waits into human-answer prompts', () => {
  const base = { status: 'attention', ownStatus: 'idle', questions: [] };
  for (const [presentation, expectedAttention] of [
    [{ label: 'Request details unavailable', needsUser: false, awaitingCoordinator: false, confirming: false }, false],
    [{ label: 'Awaiting Coordinator review', needsUser: false, awaitingCoordinator: true, confirming: false }, false],
    [{ label: 'Waiting for native confirmation', needsUser: false, awaitingCoordinator: false, confirming: true }, false],
    [{ label: 'Needs your answer', needsUser: true, awaitingCoordinator: false, confirming: false }, true],
    [{ label: 'Needs your decision', needsUser: true, awaitingCoordinator: false, confirming: false }, true],
    [{ label: 'Request answer error', needsUser: true, awaitingCoordinator: false, confirming: false }, true]
  ]) {
    const before = structuredClone(base), view = workerStatusView(base, live, true, now, presentation);
    assert.equal(view.activity, presentation.label); assert.equal(view.attention, expectedAttention);
    const html = renderToStaticMarkup(React.createElement(WorkerStatus, { worker: base, presentation, stream: { state: 'connected', lastSignalAt: Date.now() }, runtimeConnected: true }));
    assert.ok(html.includes(presentation.label));
    assert.equal(/class="worker-status-state[^\"]*attention/.test(html), expectedAttention);
    if (!expectedAttention) assert.doesNotMatch(html, /Needs your answer|Needs your decision/);
    assert.deepEqual(base, before);
  }
  assert.equal(workerStatusView(worker({ status: 'attention', ownStatus: 'running' }), live, true, now).activity, 'Working', 'child-only aggregate attention is not a parent answer request');
  const unknown = workerStatusView(worker({ status: 'attention' }), live, true, now);
  assert.equal(unknown.activity, 'Request details unavailable'); assert.equal(unknown.attention, false);
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
