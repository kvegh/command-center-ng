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
  for (const match of [...compiled.matchAll(/from ['"]([^'"]+)['"]/g)]) compiled = compiled.replace(match[0], `from '${match[1].startsWith('./') ? await componentUrl(match[1].slice(2)) : pathToFileURL(require.resolve(match[1])).href}'`);
  const url = 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'); modules.set(name, url); return url;
}
const cards = await import(await componentUrl('native-request-card'));
const { NativeRequestCard, NativeApprovalControls, NativePermissionControls, NativeFileChanges } = cards;
const { questionTarget, OpenQuestions, RequestRecovery } = await import(await componentUrl('open-questions'));
const interruptSource = await readFile(new URL('../src/escape-interrupt.ts', import.meta.url), 'utf8');
const { canInterrupt } = await import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(interruptSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText).toString('base64'));
const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function evaluate(source, environment) {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(environment), compiled)(...Object.values(environment));
}
function mainFunction(name) {
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  return evaluate(`${node.getText(ast)}\nreturn ${name};`, { React, NativeRequestCard, OpenQuestions, RequestRecovery, questionTarget, labels: evaluate(`return (${expression('labels')});`, {}), Badge: ({ status }) => React.createElement('span', { 'data-status': status }, status) });
}
const NativeSubagentRequests = mainFunction('NativeSubagentRequests');
const NativeSubagentOverview = mainFunction('NativeSubagentOverview');
function expression(name) {
  let value; const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) value = node.initializer.getText(ast); ts.forEachChild(node, visit); }; visit(ast); return value;
}
function all(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(all)];
}
function capture(props) {
  let tree;
  function Capture() { const card = NativeRequestCard(props); tree = card.type(card.props); return tree; }
  const html = renderToStaticMarkup(React.createElement(Capture)); return { tree, html };
}
const question = (threadId = 'child-a', id = 1) => ({ id, method: 'item/commandExecution/requestApproval', reviewToken: 'current-review', params: { threadId, turnId: 'native-turn', itemId: 'native-item', command: 'read-example', availableDecisions: ['accept', 'decline'] } });
const worker = (id, changes = {}) => ({ id, name: `Worker ${id}`, status: 'attention', needsInput: true, questions: [question(id)], requestError: null, recoveringRequests: false, detailError: null, ...changes });

test('parent and children retain distinct native card targets, typed IDs and form identities', () => {
  const inputs = [{ agentId: 'parent' }, { agentId: 'parent', requestThreadId: 'child-a' }, { agentId: 'parent', requestThreadId: 'child-b' }];
  const keys = inputs.map(input => NativeRequestCard({ ...input, question: question(input.requestThreadId || 'parent'), workerName: 'Worker', act: async () => true }).key);
  assert.equal(new Set(keys).size, 3);
  const first = NativeRequestCard({ ...inputs[1], question: question(), workerName: 'Worker', act: async () => true });
  for (const changed of [{ id: '1' }, { reviewToken: 'new-review' }, { params: { ...question().params, turnId: 'next-turn' } }, { params: { ...question().params, itemId: 'next-item' } }]) {
    assert.notEqual(NativeRequestCard({ ...inputs[1], question: { ...question(), ...changed }, workerName: 'Worker', act: async () => true }).key, first.key);
  }
  for (const input of inputs) {
    const { html } = capture({ ...input, question: question(input.requestThreadId || 'parent'), workerName: 'Named child', act: () => assert.fail('Rendering cannot answer') });
    assert.ok(html.includes(`id="${questionTarget(input.requestThreadId || 'parent', 1)}"`));
    assert.match(html, /Named child/);
  }
  assert.notEqual(questionTarget('child-a', 1), questionTarget('child-a', '1'));
});

test('manual native child approvals preserve exact binding and parent focus callback', async () => {
  const calls = []; let focus = 0;
  const { tree } = capture({ agentId: 'parent', requestThreadId: 'child-a', workerName: 'Named child', question: question(), act: async (...args) => { calls.push(args); return true; }, prepareApprovalFocus: () => () => { focus++; } });
  const controls = all(tree).find(node => node.type === NativeApprovalControls);
  const buttons = all(NativeApprovalControls(controls.props)).filter(node => node.type === 'button');
  await buttons.find(node => node.props.children === 'Allow once').props.onClick();
  assert.deepEqual(calls, [['agents/parent/answer', { decision: 'accept', requestId: 1, requestThreadId: 'child-a', reviewToken: 'current-review', turnId: 'native-turn', itemId: 'native-item' }]]);
  assert.equal(focus, 1);
  controls.props.review();
  assert.deepEqual(calls[1], ['agents/parent/review', { requestId: 1, requestThreadId: 'child-a', reviewToken: 'current-review', turnId: 'native-turn', itemId: 'native-item' }]);
  const parent = capture({ agentId: 'parent', workerName: 'Parent', question: question('parent'), act: async (...args) => { calls.push(args); return true; } });
  await all(parent.tree).find(node => node.type === NativeApprovalControls).props.submit({ decision: 'decline' });
  assert.deepEqual(calls.at(-1), ['agents/parent/answer', { decision: 'decline', requestId: 1 }]);
});

test('native nullable binding fields remain exact rather than disappearing from child responses', async () => {
  const calls = [], q = { ...question(), params: { ...question().params, turnId: null, itemId: null } };
  const { tree } = capture({ agentId: 'parent', requestThreadId: 'child-a', workerName: 'Child', question: q, act: async (...args) => { calls.push(args); return true; } });
  await all(tree).find(node => node.type === NativeApprovalControls).props.submit({ decision: 'accept' });
  assert.deepEqual(calls, [['agents/parent/answer', { decision: 'accept', requestId: 1, requestThreadId: 'child-a', reviewToken: 'current-review', turnId: null, itemId: null }]]);
  const absent = { ...q, params: { threadId: 'child-a' } };
  assert.deepEqual(cards.childRequestBinding(absent, 'child-a'), { requestThreadId: 'child-a', reviewToken: 'current-review' });
});

test('file details and detail recovery use the child native item without weakening exact matches', () => {
  const calls = [], q = { ...question(), method: 'item/fileChange/requestApproval', nativeItem: { threadId: 'child-a', turnId: 'native-turn', itemId: 'native-item', type: 'fileChange', state: 'available', totalChanges: 1, truncated: false, changes: [{ path: '/example/file', kind: { type: 'update' }, diff: '-before\n+after' }] } };
  const props = { agentId: 'parent', requestThreadId: 'child-a', workerName: 'Child', question: q, act: async (...args) => { calls.push(args); return true; } };
  const { tree, html } = capture(props);
  assert.match(html, /1 proposed file change/); assert.match(html, /\/example\/file/);
  all(tree).find(node => node.type === NativeFileChanges).props.load();
  assert.deepEqual(calls, [['agents/parent/requests', { requestId: 1, requestThreadId: 'child-a', reviewToken: 'current-review', turnId: 'native-turn', itemId: 'native-item' }]]);
  assert.doesNotMatch(capture({ ...props, question: { ...q, nativeItem: { ...q.nativeItem, threadId: 'other-child' } } }).html, /1 proposed file change/);
  const own = capture({ ...props, requestThreadId: undefined, question: { ...q, params: { ...q.params, threadId: 'parent' } } });
  all(own.tree).find(node => node.type === NativeFileChanges).props.load();
  assert.deepEqual(calls.at(-1), ['agents/parent/requests', {}]);
});

test('child clarification, MCP form and permission responses retain their existing native answer formats', async () => {
  const calls = [], props = { agentId: 'parent', requestThreadId: 'child-a', workerName: 'Child', act: async (...args) => { calls.push(args); return true; } };
  const clarification = capture({ ...props, question: { ...question(), method: 'item/tool/requestUserInput', params: { ...question().params, questions: [{ id: 'choice', question: 'Which option?' }] } } });
  all(clarification.tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls.at(-1)[1].answers, {}); assert.equal(calls.at(-1)[1].requestThreadId, 'child-a');
  const form = capture({ ...props, question: { ...question(), method: 'mcpServer/elicitation/request', params: { ...question().params, mode: 'form', requestedSchema: { type: 'object', properties: { count: { type: 'integer', default: 2 } } } } } });
  all(form.tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls.at(-1)[1].content, { count: 2 }); assert.equal(calls.at(-1)[1].reviewToken, 'current-review');
  const permissions = capture({ ...props, question: { ...question(), method: 'item/permissions/requestApproval', params: { ...question().params, permissions: { network: { enabled: true } } } } });
  await all(permissions.tree).find(node => node.type === NativePermissionControls).props.submit({ decision: 'accept', scope: 'turn' });
  assert.equal(calls.at(-1)[1].scope, 'turn'); assert.equal(calls.at(-1)[1].itemId, 'native-item');
});

test('children render inside the parent with native-target overview links and independently recover missing details', async () => {
  const workers = [worker('child-a'), worker('child-b'), worker('missing', { questions: [], requestError: 'Details unavailable' }), worker('idle', { questions: [], needsInput: false, status: 'idle' }), worker('unverified', { questions: [], needsInput: false, status: 'error', detailError: 'Lineage not verified' })];
  const calls = [], props = { workers, parentId: 'parent', connected: true, act: () => assert.fail('Rendering cannot answer'), recover: async id => calls.push(id), prepareApprovalFocus: () => () => {} };
  const tree = NativeSubagentRequests(props), html = renderToStaticMarkup(tree);
  assert.match(html, /Subagent · Worker child-a/); assert.match(html, /Subagent · Worker child-b/);
  assert.match(html, /Details unavailable/); assert.doesNotMatch(html, /Worker idle|Worker unverified/);
  const requests = all(tree).filter(node => node.type === NativeRequestCard);
  assert.deepEqual(requests.map(node => [node.props.agentId, node.props.requestThreadId]), [['parent', 'child-a'], ['parent', 'child-b']]);
  const recovery = all(tree).find(node => node.type === RequestRecovery); await recovery.props.recover(); assert.deepEqual(calls, ['missing']);
  const overview = NativeSubagentOverview({ workers });
  assert.deepEqual(all(overview).filter(node => node.type === OpenQuestions).map(node => node.props.agentId), ['child-a', 'child-b', 'missing']);
  assert.match(renderToStaticMarkup(overview), /Lineage not verified/);
  const disconnected = NativeSubagentRequests({ ...props, connected: false }); assert.equal(all(disconnected).find(node => node.type === RequestRecovery).props.disabled, true);
  assert.match(main, /<NativeSubagentRequests workers=\{nativeWorkers\} parentId=\{active.id\}/);
  assert.match(main, /const nativeWorkers = active\?\.provider === 'claude' \? \[\]/);
});

test('child attention leaves parent compose and interrupt gates bound to its own native state', () => {
  const environment = { activeConnected: true, draftText: 'Follow up', draftImages: [], busy: '', draftLocked: false, hasReadyDraft: text => !!text };
  for (const ownStatus of ['idle', 'running', 'attention']) {
    const active = { id: 'parent', status: 'attention', ownStatus, canSend: true, questions: [], turnId: 'parent-turn' };
    const activeOwnStatus = evaluate(`return (${expression('activeOwnStatus')});`, { active });
    const activeNative = evaluate(`return (${expression('activeNative')});`, { active, activeOwnStatus });
    const ready = evaluate(`return (${expression('readyToSend')});`, { ...environment, active, activeOwnStatus });
    assert.equal(ready, ownStatus !== 'attention'); assert.equal(canInterrupt(activeNative, true), ownStatus !== 'idle');
    active.questions.push(question('parent')); assert.equal(evaluate(`return (${expression('readyToSend')});`, { ...environment, active, activeOwnStatus }), false);
  }
  assert.match(main, /agent: activeNative, connected: activeConnected/);
  assert.match(main, /activeOwnStatus === 'attention' && !active.questions.length && <RequestRecovery/);
  assert.match(main, /worker.canSend && \(worker.ownStatus \?\? worker.status\) !== 'attention'/);
});

test('legacy collaboration activities are not projected as native child request views', () => {
  const active = { provider: 'codex', workers: [
    { id: 'wait-target', name: 'Waiting', status: 'running' },
    { id: 'send-target', name: 'Input delivered', status: 'idle', questions: null },
    worker('verified'), worker('candidate', { questions: [], needsInput: false, detailError: 'Lineage not verified' })
  ] };
  const workers = evaluate(`return (${expression('nativeWorkers')});`, { active });
  assert.deepEqual(workers.map(worker => worker.id), ['verified', 'candidate']);
  const overview = renderToStaticMarkup(React.createElement(NativeSubagentOverview, { workers }));
  const requests = renderToStaticMarkup(React.createElement(NativeSubagentRequests, { workers, parentId: 'parent', connected: true, act: () => assert.fail('Rendering cannot answer'), recover: () => assert.fail('Rendering cannot reload'), prepareApprovalFocus: () => () => {} }));
  assert.match(overview, /Worker verified/); assert.match(overview, /Lineage not verified/);
  assert.match(requests, /Worker verified/);
  assert.doesNotMatch(overview + requests, /Waiting|Input delivered|wait-target|send-target/);
});

test('actual terminal child states have explicit labels without inferring completion from idle', () => {
  const Badge = mainFunction('Badge');
  for (const [status, label] of [['idle', 'Idle'], ['completed', 'Completed'], ['failed', 'Failed'], ['interrupted', 'Interrupted']]) {
    const html = renderToStaticMarkup(React.createElement(Badge, { status }));
    assert.match(html, new RegExp(`>${label}</span>`));
    if (status === 'failed') assert.match(html, /class="status error"/);
    if (status === 'idle') assert.doesNotMatch(html, /Completed|Failed/);
  }
});
