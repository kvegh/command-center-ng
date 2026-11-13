import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const dialog = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AgentDialog');
let readyExpression, reconnectExpression;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'runtimeReady') readyExpression = node.initializer.getText(ast);
  if (ts.isJsxExpression(node) && node.expression && ts.isConditionalExpression(node.expression)
    && node.expression.condition.getText(ast) === 'workspaceReconnecting'
    && ts.isJsxElement(node.expression.whenTrue)
    && node.expression.whenTrue.openingElement.attributes.properties.some(attribute =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'className'
      && attribute.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === 'connection-banner')) {
    reconnectExpression = node.expression.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(dialog && readyExpression && reconnectExpression, 'exercise the actual picker and workspace reconnect banner');
function evaluate(source, environment) {
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(environment), compiled)(...Object.values(environment));
}
const runtimeReady = evaluate(`return (${readyExpression});`, {});
const Icon = () => null;
const checkpoint = () => new Promise(resolve => setImmediate(resolve));
const connected = () => ({ connected: true, codexConnected: true, claudeAvailable: false, error: null, agents: [] });
function elements(node) {
  return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(elements)] : [];
}
const text = node => renderToStaticMarkup(node);
function fixture(state = connected()) {
  const slots = [], pending = [], requests = [], actions = [];
  let cursor = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        slots[index] = { deps };
        pending.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const AgentDialog = evaluate(`${dialog.getText(ast)}\nreturn AgentDialog;`, {
    React, ...hooks, runtimeReady, Icon, limits: { maxWorkers: 16 },
    Badge: ({ status }) => React.createElement('span', null, status),
    api: (route, data) => new Promise((resolve, reject) => { requests.push({ route, data, resolve, reject }); }),
  });
  const f = {
    state, requests, actions,
    render() {
      cursor = 0;
      const tree = AgentDialog({ state: f.state, dismiss() {}, select() {}, act: async (...args) => { actions.push(args); return true; } });
      pending.splice(0).forEach(effect => effect());
      return tree;
    },
    button(tree, label) { return elements(tree).find(node => node.type === 'button' && text(node).includes(label)); },
    chooseCodex(tree) { elements(tree).find(node => node.type === 'select').props.onChange({ target: { value: 'codex' } }); },
  };
  return f;
}

test('Codex reconnect remains visible with Claude available and uses the existing connection action', async () => {
  const actions = [];
  const render = state => evaluate(`return (${reconnectExpression});`, { React, state, workspaceReconnecting: false, runtimeReady, Icon, act: async (...args) => actions.push(args) });
  const banner = render({ ...connected(), codexConnected: false, claudeAvailable: true });
  assert.match(text(banner), /Codex is disconnected/);
  const button = elements(banner).find(node => node.type === 'button');
  assert.match(text(button), /Reconnect Codex/);
  button.props.onClick(); await checkpoint();
  assert.deepEqual(actions, [['connect', {}]]);
  assert.equal(render(connected()), false);
  assert.match(text(render({ ...connected(), connected: false, codexConnected: false, error: 'Native daemon unavailable.' })), /Native daemon unavailable/);
});

test('a browser interruption shows transport recovery without offering native reconnect while state is refreshing', () => {
  for (const codexConnected of [true, false]) {
    const state = { ...connected(), connected: false, codexConnected, error: 'Last known native connection error.' };
    const banner = evaluate(`return (${reconnectExpression});`, {
      React, state, workspaceReconnecting: true, runtimeReady, Icon,
      act: () => assert.fail('browser recovery must not reconnect native sessions'),
    });
    assert.match(text(banner), /Connection to CCNG interrupted/);
    assert.match(text(banner), /Reconnecting automatically/);
    assert.match(text(banner), /unsent text is kept/);
    assert.doesNotMatch(text(banner), /Codex is disconnected|Last known native connection error/);
    assert.equal(elements(banner).some(node => node.type === 'button'), false);
    assert.equal(runtimeReady(state), false, 'transport opening cannot enable native input before authoritative refresh');
  }
});

test('disconnected Codex picker neither queries history nor claims it is empty, and surfaces reconnect failures', async () => {
  const f = fixture({ ...connected(), codexConnected: false, claudeAvailable: true });
  f.chooseCodex(f.render()); f.render();
  let tree = f.render();
  assert.equal(f.requests.length, 1, 'only the initial Claude history request started');
  assert.equal(f.requests[0].route, 'agents?provider=claude');
  assert.match(text(tree), /Codex is disconnected/);
  assert.doesNotMatch(text(tree), /No conversations found/);
  const pending = f.button(tree, 'Reconnect Codex').props.onClick();
  assert.deepEqual({ route: f.requests[1].route, data: f.requests[1].data }, { route: 'connect', data: {} });
  f.requests[1].reject(new Error('The native socket is unavailable.')); await pending;
  tree = f.render();
  assert.match(text(tree), /The native socket is unavailable/);
  assert.equal(f.button(tree, 'Reconnect Codex').props.disabled, false);
  assert.deepEqual(f.actions, [], 'reconnect does not open or create a conversation');
});

test('history is only declared empty after a successful completed read', async () => {
  const f = fixture();
  assert.doesNotMatch(text(f.render()), /No conversations found/);
  assert.match(text(f.render()), /Loading Codex conversations/);
  f.requests[0].resolve({ agents: [], nextCursor: null }); await checkpoint();
  assert.match(text(f.render()), /No conversations found for this runtime/);
});

test('history failures remain explicit and retry the existing history API', async () => {
  const f = fixture(); f.render();
  f.requests[0].reject(new Error('Native history database is unavailable.')); await checkpoint();
  let tree = f.render();
  assert.match(text(tree), /Native history database is unavailable/);
  assert.doesNotMatch(text(tree), /No conversations found/);
  f.button(tree, 'Retry loading conversations').props.onClick();
  assert.equal(f.requests[1].route, 'agents?provider=codex');
  f.requests[1].resolve({ agents: [{ id: 'worker', name: 'Recovered worker', cwd: '/example/project', status: 'idle' }], nextCursor: null }); await checkpoint();
  tree = f.render();
  assert.match(text(tree), /Recovered worker/);
  assert.doesNotMatch(text(tree), /Native history database is unavailable|No conversations found/);
});

test('an empty native page with a cursor offers more history without claiming no conversations exist', async () => {
  const f = fixture(); f.render();
  f.requests[0].resolve({ agents: [], nextCursor: 'page-two' }); await checkpoint();
  const tree = f.render();
  assert.match(text(tree), /No conversations on this page/);
  assert.doesNotMatch(text(tree), /No conversations found for this runtime/);
  f.button(tree, 'Load more conversations').props.onClick();
  assert.equal(f.requests[1].route, 'agents?provider=codex&cursor=page-two');
});

test('already-open conversations and search misses are distinguished from absent native history', async () => {
  const f = fixture(); f.render();
  f.requests[0].resolve({ agents: [{ id: 'worker', name: 'Existing worker', cwd: '/example/project', status: 'idle' }], nextCursor: null }); await checkpoint();
  f.state = { ...f.state, agents: [{ id: 'worker' }] };
  assert.match(text(f.render()), /All loaded conversations are already open/);
  f.state = { ...f.state, agents: [] };
  const tree = f.render();
  elements(tree).find(node => node.type === 'input' && node.props['aria-label'] === 'Find an agent').props.onChange({ target: { value: 'unmatched' } });
  assert.match(text(f.render()), /No matching unopened conversations in the loaded history/);
});

test('a response from before disconnect cannot replace the disconnected picker state', async () => {
  const f = fixture(); f.render();
  f.state = { ...f.state, codexConnected: false, claudeAvailable: true };
  f.render();
  f.requests[0].resolve({ agents: [], nextCursor: null }); await checkpoint();
  const tree = f.render();
  assert.match(text(tree), /Codex is disconnected/);
  assert.doesNotMatch(text(tree), /No conversations found|Loading Codex conversations/);
});
