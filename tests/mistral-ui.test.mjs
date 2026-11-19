import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url), modules = new Map();
async function componentUrl(name) {
  if (modules.has(name)) return modules.get(name);
  const source = await readFile(new URL(`../src/${name}.tsx`, import.meta.url), 'utf8');
  let compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  for (const match of [...compiled.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const specifier = match[1];
    const url = specifier.startsWith('./') ? await componentUrl(specifier.slice(2))
      : specifier.startsWith('../') ? new URL(specifier, new URL('../src/', import.meta.url)).href
      : pathToFileURL(require.resolve(specifier)).href;
    compiled = compiled.replace(match[0], `from '${url}'`);
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'); modules.set(name, url); return url;
}
const { MistralRequestCard } = await import(await componentUrl('mistral-request-card'));
const { HandoverCreateForm, HandoverControls, HandoverConflictChoices } = await import(await componentUrl('handover-controls'));
const { OpenQuestions, RequestRecovery, questionTarget } = await import(await componentUrl('open-questions'));
const { BackgroundRequests } = await import(await componentUrl('background-requests'));
const { workerStatusView, inputReceiptLabel, sendWithReceipt } = await import(await componentUrl('worker-status'));
const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const selected = parsed.statements.filter(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'AgentDialog'
  || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => ['runtimeReady', 'providerLabel'].includes(declaration.name.getText(parsed)))).map(statement => statement.getText(parsed)).join('\n');
const extracted = ts.transpileModule(`import React, {useState,useRef,useEffect} from 'react'; const limits={maxWorkers:16}; function Icon(){return null}; function Badge(){return null}; ${selected}; export {runtimeReady,AgentDialog}`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
const { runtimeReady, AgentDialog } = await import('data:text/javascript;base64,' + Buffer.from(extracted).toString('base64'));
function elements(value) {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!React.isValidElement(value)) return [];
  return [value, ...elements(value.props.children)];
}
function capture(component, props) {
  let tree;
  function Capture() { tree = component(props); return null; }
  renderToStaticMarkup(React.createElement(Capture));
  return { tree, elements: elements(tree), html: renderToStaticMarkup(tree) };
}
function question(overrides = {}) {
  return { id: 17, method: 'mistral/permission/requestApproval', reviewToken: 'exact-request', params: { toolCall: { title: 'Read project source', rawInput: { path: '/example/project/file' } }, options: [{ optionId: 'yes-native', name: 'Allow this call', kind: 'allow_once' }, { optionId: 'no-native', name: 'Reject this call', kind: 'reject_once' }] }, ...overrides };
}
function card(q = question(), action = async () => true) {
  const calls = [];
  return { ...capture(MistralRequestCard, { question: q, agentId: 'mistral:session', workerName: 'Example Mistral', act: async (...args) => { calls.push(args); return action(...args); } }), calls };
}

test('Mistral readiness uses its own runtime, and Add agent offers its native provider', () => {
  const state = { connected: true, codexConnected: false, claudeAvailable: false, mistral: { available: true }, agents: [] };
  assert.equal(runtimeReady(state, 'mistral'), true);
  assert.equal(runtimeReady(state, 'codex'), false);
  assert.equal(runtimeReady({ ...state, mistral: { available: false } }, 'mistral'), false);
  assert.equal(runtimeReady({ ...state, connected: false }, 'mistral'), false);
  const dialog = capture(AgentDialog, { state, dismiss() {}, select() {}, act: async () => true });
  const select = dialog.elements.find(node => node.type === 'select');
  assert.equal(select.props.value, 'mistral');
  assert.match(dialog.html, /<option value="mistral" selected="">Mistral Vibe/);
  assert.doesNotMatch(dialog.html, /Reconnect Codex/);
});

test('permission cards submit exact offered IDs and tokens once, with no invented native controls', async () => {
  let resolve;
  const f = card(question(), () => new Promise(done => { resolve = done; }));
  const buttons = f.elements.filter(node => node.type === 'button');
  assert.deepEqual(buttons.map(node => node.props.children), ['Allow this call', 'Reject this call']);
  assert.match(f.html, /Mistral tool approval/); assert.match(f.html, /Read project source/);
  assert.equal(f.tree.props.id, questionTarget('mistral:session', 17));
  assert.doesNotMatch(f.html, /Ask coordinator|Allow always|Claude|Codex/);
  buttons[0].props.onClick(); buttons[1].props.onClick();
  assert.deepEqual(f.calls, [['agents/mistral:session/answer', { requestId: 17, reviewToken: 'exact-request', optionId: 'yes-native' }]]);
  resolve(true); await Promise.resolve();
  buttons[0].props.onClick(); assert.equal(f.calls.length, 1);
  const rejected = card(); await rejected.elements.find(node => node.type === 'button' && node.props.children === 'Reject this call').props.onClick();
  assert.equal(rejected.calls[0][1].optionId, 'no-native');
});

test('always choices appear only when Vibe offers them and report native scope honestly', async () => {
  const q = question(); q.params.options.push({ optionId: 'allow-session-tool', name: 'Allow native scope', kind: 'allow_always' });
  const f = card(q);
  assert.match(f.html, /Native Vibe owns their persistence/);
  await f.elements.find(node => node.type === 'button' && node.props.children === 'Allow native scope').props.onClick();
  assert.deepEqual(f.calls[0][1], { requestId: 17, reviewToken: 'exact-request', optionId: 'allow-session-tool' });
});

test('malformed permission options and unknown methods stay visible without guessed answers', () => {
  for (const options of [[], [{ optionId: 'new', name: 'Unknown scope', kind: 'superuser' }], [{ optionId: 'same', name: 'A', kind: 'allow_once' }, { optionId: 'same', name: 'B', kind: 'reject_once' }]]) {
    const q = question(); q.params.options = options;
    const f = card(q); assert.equal(f.elements.filter(node => node.type === 'button').length, 0); assert.match(f.html, /request stays open/); assert.deepEqual(f.calls, []);
  }
  const f = card(question({ method: 'mistral/future/request' }));
  assert.match(f.html, /remains pending/); assert.equal(f.elements.filter(node => node.type === 'button').length, 0);
});

const formQuestion = (params = {}) => question({ id: 'form-17', method: 'mistral/userInput/request', params: { mode: 'form', message: 'Approve the explained plan?', requestedSchema: { type: 'object', properties: { confirmed: { type: 'boolean', default: true } }, required: ['confirmed'] }, ...params } });
test('forms preserve native action/content and supported default value types', async () => {
  const f = card(formQuestion());
  await f.elements.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(f.calls, [['agents/mistral:session/answer', { requestId: 'form-17', reviewToken: 'exact-request', action: 'accept', content: { confirmed: true } }]]);
  for (const [label, action] of [['Decline question', 'decline'], ['Cancel request', 'cancel']]) {
    const f = card(formQuestion()); await f.elements.find(node => node.type === 'button' && node.props.children === label).props.onClick();
    assert.deepEqual(f.calls[0][1], { requestId: 'form-17', reviewToken: 'exact-request', action });
  }
});

test('unsupported forms and required missing values never submit an acceptance', async () => {
  for (const params of [{ mode: 'url' }, { requestedSchema: { type: 'object', properties: { nested: { type: 'object' } } } }]) {
    const f = card(formQuestion(params));
    assert.equal(f.elements.find(node => node.type === 'form'), undefined);
    assert.match(f.html, /request stays open/); assert.deepEqual(f.calls, []);
  }
  const f = card(formQuestion({ requestedSchema: { type: 'object', properties: { confirmation: { type: 'string' } }, required: ['confirmation'] } }));
  await f.elements.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); assert.deepEqual(f.calls, []);
});

test('answer confirmation disables controls and retains native error context', async () => {
  const f = card(question({ responding: true, error: 'Native response pending' }));
  assert.ok(f.elements.filter(node => node.type === 'button').every(node => node.props.disabled));
  assert.match(f.html, /Waiting for Mistral/); assert.match(f.html, /Native response pending/);
  for (const button of f.elements.filter(node => node.type === 'button')) await button.props.onClick();
  assert.deepEqual(f.calls, []);
});

test('handover supports an explicit Mistral receiver and never switches an unavailable source', async () => {
  const calls = [], props = { id: 'handover', draft: { provider: 'mistral', cwd: '  /example/project  ' }, change() {}, busy: false, error: '', codexReady: true, claudeReady: true, mistralReady: true, full: false, submit: async value => calls.push(value) };
  const f = capture(HandoverCreateForm, props);
  assert.match(f.html, /<option value="mistral" selected="">Mistral Vibe/);
  await f.tree.props.onSubmit({ preventDefault() {} }); assert.deepEqual(calls, [{ provider: 'mistral', cwd: '/example/project' }]);
  const unavailable = capture(HandoverCreateForm, { ...props, mistralReady: false });
  assert.equal(unavailable.elements.find(node => node.type === 'button').props.disabled, true);
  await unavailable.tree.props.onSubmit({ preventDefault() {} }); assert.equal(calls.length, 1);
  const controls = capture(HandoverControls, { agentId: 'source', cwd: '/example/project', sourceProvider: 'mistral', canCreate: true, codexReady: true, claudeReady: true, mistralReady: false, full: false, create: async () => assert.fail('No request during rendering'), openExisting() {}, choose() {} });
  assert.equal(controls.elements.find(node => node.type === HandoverCreateForm).props.draft.provider, 'mistral');
  const conflict = capture(HandoverConflictChoices, { conflict: { existing: [{ id: 'native', name: 'Example v2', provider: 'mistral' }], nextName: 'Example v3' }, busy: false, openExisting() {}, createNext() {} });
  assert.match(conflict.html, /Example v2 \(Mistral\)/);
});

test('Mistral question overview, closed-tab requests and connection labels preserve identity', () => {
  const overview = renderToStaticMarkup(React.createElement(OpenQuestions, { agentId: 'mistral:session', questions: [question(), formQuestion()], attention: true, provider: 'mistral' }));
  assert.match(overview, /Mistral tool approval/); assert.match(overview, /Mistral question/); assert.match(overview, /Approve the explained plan/);
  const background = renderToStaticMarkup(React.createElement(BackgroundRequests, { workers: [{ id: 'mistral:session', name: 'Example', provider: 'mistral', questionCount: 1 }], available: provider => provider === 'mistral', opening: false, full: false, open() {} }));
  assert.match(background, /Mistral · 1 pending/); assert.doesNotMatch(background, /disabled/);
  const now = 1000;
  assert.equal(workerStatusView({ provider: 'mistral', status: 'offline', questions: [] }, { state: 'connected', lastSignalAt: now }, false, now).connection, 'Mistral unavailable');
  const recovery = capture(RequestRecovery, { provider: 'mistral', recovering: false, disabled: false, allowManualRecovery: true, recover: async () => assert.fail('No guessed Codex recovery') });
  assert.doesNotMatch(recovery.html, /Reconnect this parent|Reconnect and check/);
});


test('unavailable or unsupported native requests remain visible with disabled answers and exact reasons', async () => {
  for (const flag of ['unavailable', 'unsupported']) for (const q of [question(), formQuestion()]) {
    const reason = flag === 'unavailable' ? 'The native answer could not be confirmed. It has not been retried.' : 'The installed native request format cannot be answered here.';
    const f = card({ ...q, [flag]: true, unavailableReason: reason });
    assert.ok(f.elements.filter(node => node.type === 'button').every(node => node.props.disabled));
    assert.match(f.html, new RegExp(reason.replaceAll('.', '\\.')));
    assert.equal(f.tree.props.id, questionTarget('mistral:session', q.id));
    for (const button of f.elements.filter(node => node.type === 'button')) await button.props.onClick?.();
    const form = f.elements.find(node => node.type === 'form');
    if (form) {
      assert.equal(f.elements.find(node => node.type === 'fieldset').props.disabled, true);
      await form.props.onSubmit({ preventDefault() {} });
    }
    assert.deepEqual(f.calls, [], 'blocked native callbacks never receive guessed or duplicate answers');
  }
});


test('permission approval shows native tool context while retaining the untouched callback and exact answer binding', async () => {
  const q = question();
  q.params.toolCall = { toolCallId: 'native-tool-17' };
  q.params.toolCallContext = { toolCallId: 'native-tool-17', title: 'Read the project status', kind: 'execute', rawInput: { command: 'git status --short' }, locations: [{ path: '/example/project' }] };
  const f = card(q);
  assert.match(f.html, /Read the project status/); assert.match(f.html, /git status --short/); assert.match(f.html, /example\/project/);
  const details = f.elements.find(node => node.type === 'details');
  const nativeDetails = JSON.parse(elements(details).find(node => node.type === 'code').props.children);
  assert.deepEqual(nativeDetails.toolCall, { toolCallId: 'native-tool-17' });
  assert.deepEqual(nativeDetails.toolCallContext, q.params.toolCallContext);
  await f.elements.find(node => node.type === 'button' && node.props.children === 'Allow this call').props.onClick();
  assert.deepEqual(f.calls[0][1], { requestId: 17, reviewToken: 'exact-request', optionId: 'yes-native' });
});


test('Mistral transport acceptance stays queued until its exact native prompt returns', async () => {
  const receipt = { state: 'queued', messageId: 'mistral-input-17', at: 0 };
  const worker = { provider: 'mistral', status: 'running', questions: [], messages: [{ id: 'mistral-input-17', turnId: 'turn-17', state: 'completed', inputState: 'queued' }] };
  assert.equal(inputReceiptLabel(worker, receipt), 'Queued for Mistral');
  assert.equal(inputReceiptLabel(worker), 'Queued for Mistral', 'reload uses the recorded exact input state');
  assert.equal(inputReceiptLabel({ ...worker, messages: [{ ...worker.messages[0], inputState: 'unconfirmed' }] }, receipt), 'Input not confirmed');
  const received = { ...worker, messages: [{ ...worker.messages[0], inputState: 'received' }] };
  assert.equal(inputReceiptLabel(received, receipt), 'Received by Mistral');
  assert.equal(inputReceiptLabel(received), 'Received by Mistral');
  assert.equal(inputReceiptLabel(received, { ...receipt, messageId: 'other-pending' }), 'Queued for Mistral', 'another input cannot establish receipt for this request');
  const updates = [];
  await sendWithReceipt('mistral-session', async () => ({ accepted: true, messageId: receipt.messageId, queued: true }), (id, value) => updates.push([id, value]));
  assert.equal(updates.at(-1)[1].state, 'queued');
  const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let queued;
  const visit = node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'queued') queued = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }; visit(ast);
  const queuedFor = new Function('provider', `return (${queued});`);
  assert.equal(queuedFor('mistral'), true); assert.equal(queuedFor('claude'), true); assert.equal(queuedFor('codex'), false);
});
