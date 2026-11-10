import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import postcss from 'postcss';

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
const { OverviewSections } = await import(await componentUrl('overview-sections'));
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
const NativeSubagentRoster = mainFunction('NativeSubagentRoster');
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
  let approvalControls;
  function CaptureControls() { approvalControls = NativeApprovalControls(controls.props); return null; }
  renderToStaticMarkup(React.createElement(CaptureControls));
  const buttons = all(approvalControls).filter(node => node.type === 'button');
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
  assert.doesNotMatch(renderToStaticMarkup(overview), /Lineage not verified|Worker idle|Worker unverified|data-status/);
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
  assert.match(overview, /Worker verified/); assert.doesNotMatch(overview, /Lineage not verified|Worker candidate/);
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

test('routine subagent rows stay out of the independent pending-question view', () => {
  const routine = ['idle', 'running', 'completed', 'failed', 'interrupted'].map(status => worker(`routine-${status}`, { status, questions: [], needsInput: false }));
  assert.equal(renderToStaticMarkup(React.createElement(NativeSubagentOverview, { workers: routine })), '');
  const subagentSection = (() => {
    let section;
    const visit = node => {
      if (ts.isObjectLiteralExpression(node) && node.properties.some(property => ts.isPropertyAssignment(property) && property.name.getText(ast) === 'id' && property.initializer.text === 'subagent-questions')) section = node;
      ts.forEachChild(node, visit);
    }; visit(ast); return section;
  })();
  const visible = subagentSection.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(ast) === 'visible').initializer.getText(ast);
  assert.equal(evaluate(`return (${visible});`, { nativeWorkers: routine }), false);
  const pending = worker('needs-answer'), missing = worker('needs-details', { questions: [], requestError: 'Request details unavailable' });
  const workers = [...routine, pending, missing];
  assert.equal(evaluate(`return (${visible});`, { nativeWorkers: workers }), true);
  const overview = renderToStaticMarkup(React.createElement(NativeSubagentOverview, { workers }));
  const cards = renderToStaticMarkup(React.createElement(NativeSubagentRequests, { workers, parentId: 'parent', connected: true, act: () => assert.fail('Rendering cannot answer'), recover: () => assert.fail('Rendering cannot reload'), prepareApprovalFocus: () => () => {} }));
  assert.doesNotMatch(overview + cards, /routine-|data-status/);
  assert.match(overview, /Worker needs-answer|Worker needs-details/);
  assert.ok(cards.includes(`id="${questionTarget('needs-answer', 1)}"`));
  assert.match(cards, /Allow once/); assert.match(cards, /Request details unavailable/); assert.match(cards, /Load pending request|Retry loading request/);
});

test('the optional roster is a default-closed native disclosure below Tasks with requests outside it', () => {
  const workers = [worker('routine', { status: 'running', questions: [], needsInput: false }), worker('pending')];
  const disclosure = NativeSubagentRoster({ workers });
  assert.equal(disclosure.type, 'details'); assert.equal(disclosure.props.open, undefined);
  const html = renderToStaticMarkup(disclosure);
  assert.match(html, /^<details class="subagent-roster"><summary/); assert.doesNotMatch(html, /<details[^>]*\sopen\b/);
  assert.match(html, /Subagents \(2\)/); assert.match(html, /Worker routine/); assert.match(html, /Worker pending/);
  assert.deepEqual(all(disclosure).filter(node => node.type === NativeRequestCard || node.type === OpenQuestions || node.type === RequestRecovery), []);
  const sections = [];
  const visit = node => {
    if (ts.isObjectLiteralExpression(node)) {
      const id = node.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(ast) === 'id');
      if (id && ts.isStringLiteral(id.initializer)) sections.push(id.initializer.text);
    }
    ts.forEachChild(node, visit);
  }; visit(ast);
  assert.ok(sections.indexOf('tasks') < sections.indexOf('subagents'));
  assert.ok(sections.indexOf('subagents') < sections.indexOf('subagent-questions'));
  const questions = renderToStaticMarkup(React.createElement(NativeSubagentOverview, { workers }));
  const requests = renderToStaticMarkup(React.createElement(NativeSubagentRequests, { workers, parentId: 'parent', connected: true, act: () => assert.fail('Rendering cannot answer'), recover: () => assert.fail('Rendering cannot recover'), prepareApprovalFocus: () => () => {} }));
  assert.match(questions, /Worker pending/); assert.match(requests, /Allow once/);
  assert.ok(requests.includes(`id="${questionTarget('pending', 1)}"`));
  assert.doesNotMatch(questions + requests, /subagent-roster|Worker routine/);
});

test('a closed roster overrides saved desktop height without changing expanded or mobile section sizing', async () => {
  const workers = [worker('example', { status: 'idle', questions: [], needsInput: false })];
  const html = renderToStaticMarkup(React.createElement(OverviewSections, {
    sections: [{ id: 'subagents', label: 'Subagents', content: React.createElement(NativeSubagentRoster, { workers }) }],
    heights: { subagents: 1200 }, change: () => assert.fail('Rendering cannot change saved heights')
  }));
  assert.match(html, /data-section="subagents"/); assert.match(html, /class="overview-section-body sized" style="--section-height:1200px"/);
  assert.match(html, /<details class="subagent-roster">/); assert.doesNotMatch(html, /<details[^>]*\sopen\b/);
  const sheet = postcss.parse(await readFile(new URL('../src/style.css', import.meta.url), 'utf8'));
  const desktop = sheet.nodes.find(node => node.type === 'atrule' && node.name === 'media' && node.params === '(min-width: 901px)' && node.nodes.some(rule => rule.selector === '.overview-section-body.sized'));
  const generic = desktop.nodes.find(rule => rule.selector === '.overview-section-body.sized');
  const closed = desktop.nodes.find(rule => rule.selector === '.overview-section[data-section="subagents"]:has(.subagent-roster:not([open])) > .overview-section-body.sized');
  assert.equal(generic.nodes.find(declaration => declaration.prop === 'height').value, 'var(--section-height)');
  assert.ok(closed, 'closed roster specifically overrides a saved section height');
  assert.equal(closed.nodes.find(declaration => declaration.prop === 'height').value, 'auto');
  assert.ok(desktop.nodes.indexOf(closed) > desktop.nodes.indexOf(generic));
  assert.equal(closed.nodes.length, 1, 'expanded scrolling, shared layout and mobile rules stay unchanged');
});

test('worker overview names its current project without changing coordinator heading', () => {
  let heading;
  const visit = node => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'h2'
      && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'title' && attribute.initializer?.expression?.getText(ast) === 'active.name')) heading = node;
    ts.forEachChild(node, visit);
  }; visit(ast);
  for (const name of ['Example project', 'Another <project>']) {
    const html = renderToStaticMarkup(evaluate(`return (${heading.getText(ast)});`, { React, active: { name } }));
    assert.match(html, /Project: /); assert.ok(html.includes(name.replaceAll('<', '&lt;').replaceAll('>', '&gt;')));
  }
  assert.match(main, /<h2>\{agent\?\.name \|\| 'Coordinator'\}<\/h2>/);
});
