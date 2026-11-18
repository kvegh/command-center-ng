import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const hooks = new Map();
const visit = node => {
  if (ts.isVariableDeclaration(node) && ['focusComposer', 'choose', 'navigate', 'messageHistory'].includes(node.name.getText(ast))) hooks.set(node.name.getText(ast), node.initializer);
  ts.forEachChild(node, visit);
};
visit(ast);
function evaluate(expression, environment) {
  const code = ts.transpileModule(`return (${expression.getText(ast)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(environment), code)(...Object.values(environment));
}
const dependencies = (name, environment) => evaluate(hooks.get(name).arguments[1], environment);
const callback = (name, environment) => evaluate(hooks.get(name).arguments[0], environment);
const equalReferences = (before, after) => before.length === after.length && before.every((value, index) => Object.is(value, after[index]));

// These checks inspect the production hook inputs and execute its callbacks.
// They do not imitate React's memo cache or claim browser render/typing timings.
test('ordinary composer edits leave the real history and navigation dependencies unchanged', () => {
  const environment = {
    activeId: 'worker-a', activeMessages: [{ id: 'reply', type: 'assistant', text: 'Existing reply' }],
    activeProvider: 'codex', activeRole: 'worker', activeCanBranch: true, activeConnected: true,
    workerCount: 2, busy: '', messageQuestionBlocked: null, messageQuestionInputs: {}, showSubagentMessages: true,
    navigate() {}, choose() {}, focusComposer() {}, compactLayout: false, dialog: false, returnReviews: [], taskAgent: null
  };
  const names = ['messageHistory', 'navigate', 'choose', 'focusComposer'];
  const before = names.map(name => dependencies(name, environment));
  for (const draftText of ['a', 'a longer follow-up', 'A correction with another line\nkept in this composer']) {
    const changed = { ...environment, draftText, drafts: { 'worker-a': draftText }, imageDrafts: { 'worker-a': [{ id: 'unsent-image' }] } };
    names.forEach((name, index) => assert.ok(equalReferences(before[index], dependencies(name, changed)), `${name} must not depend on the ordinary draft`));
  }
  for (const changed of [
    { activeId: 'worker-b' }, { activeMessages: [...environment.activeMessages] },
    { activeProvider: 'claude' }, { activeRole: 'coordinator' }, { activeCanBranch: false },
    { activeConnected: false }, { workerCount: 16 }, { busy: 'navigate' },
    { messageQuestionBlocked: 'Answer the current request first.' },
    { messageQuestionInputs: { 'question-a': { draft: 'Native answer' } } }, { showSubagentMessages: false }, { navigate() {} }
  ]) assert.equal(equalReferences(before[0], dependencies('messageHistory', { ...environment, ...changed })), false, 'real history/control changes must invalidate the boundary');
  assert.equal(equalReferences(before[1], dependencies('navigate', { ...environment, activeId: 'worker-b' })), false);
  assert.equal(equalReferences(before[3], dependencies('focusComposer', { ...environment, dialog: true })), false);
  const app = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'App');
  const firstReturn = app.body.statements.find(node => ts.isIfStatement(node) && ts.isReturnStatement(node.thenStatement));
  assert.ok(hooks.get('messageHistory').pos < firstReturn.pos, 'the history hook must execute before conditional authentication returns');
});

test('the Project toggle changes only its originating chat preference and retains independent question controls', () => {
  let toggle, visibility, saved;
  const controls = [];
  const find = node => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'label'
      && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'className' && attribute.initializer?.text === 'subagent-message-toggle')) toggle = node;
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'showSubagentMessages') visibility = node.initializer;
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'saveBrowserWorkspace') saved = node.arguments[0];
    if (ts.isJsxSelfClosingElement(node) && ['NativeRequestCard', 'NativeSubagentRequests'].includes(node.tagName.getText(ast))) controls.push(node);
    ts.forEachChild(node, find);
  }; find(ast);
  assert.ok(toggle && visibility && saved);
  let project = toggle.parent;
  while (project && !ts.isObjectLiteralExpression(project)) project = project.parent;
  assert.equal(project.properties.find(property => property.name?.getText(ast) === 'id').initializer.text, 'goal', 'the toggle belongs beside Create handover in Project');
  assert.match(project.getText(ast), /<HandoverControls/);
  const input = toggle.children.find(node => ts.isJsxSelfClosingElement(node));
  const attribute = name => input.attributes.properties.find(property => property.name?.getText(ast) === name).initializer;
  assert.equal(attribute('role').text, 'switch');
  assert.equal(attribute('checked').expression.getText(ast), 'showSubagentMessages');
  let preferences = {};
  const setSubagentMessageVisibility = update => { preferences = update(preferences); };
  const change = id => evaluate(attribute('onChange').expression, { active: { id }, setSubagentMessageVisibility });
  const shown = id => evaluate(visibility, { activeId: id, subagentMessageVisibility: preferences });
  assert.equal(shown('chat-a'), true); assert.equal(shown('chat-b'), true);
  change('chat-a')({ currentTarget: { checked: false } });
  assert.equal(shown('chat-a'), false); assert.equal(shown('chat-b'), true);
  change('chat-b')({ currentTarget: { checked: true } });
  assert.deepEqual(preferences, { 'chat-a': false, 'chat-b': true });
  assert.ok(saved.properties.some(property => property.name?.getText(ast) === 'subagentMessageVisibility'), 'the normal browser save path includes visibility');
  assert.ok(controls.length >= 2 && controls.every(node => node.end <= hooks.get('messageHistory').pos || node.pos >= hooks.get('messageHistory').end), 'native request controls stay outside the filtered history');
});

test('current branch navigation binds the originating chat and preserves normal busy/error handling', async () => {
  const calls = [], choices = [], errors = [], busy = [];
  const bind = activeId => callback('navigate', {
    activeId, setError: value => errors.push(value), setBusy: value => busy.push(value),
    api: async (...args) => { calls.push(args); return { id: 'new-branch' }; }, choose: id => choices.push(id)
  });
  await bind('worker-a')('fork', { lastTurnId: 'reply-a' });
  await bind('worker-b')('fork', { lastTurnId: 'reply-b' });
  assert.deepEqual(calls, [
    ['agents/worker-a/fork', { lastTurnId: 'reply-a' }],
    ['agents/worker-b/fork', { lastTurnId: 'reply-b' }]
  ]);
  assert.deepEqual(choices, ['new-branch', 'new-branch']);
  assert.deepEqual(busy, ['navigate', '', 'navigate', '']);
  assert.deepEqual(errors, ['', '']);
  await bind(undefined)('parent');
  assert.equal(calls.length, 2);
});

test('stable selection callbacks retain current modal guards and the selected chat scroll position', () => {
  const events = [], input = { dataset: { agentId: 'worker-b' }, value: 'Retained draft', disabled: false,
    focus: options => events.push(['focus', options]), setSelectionRange: (...range) => events.push(['selection', ...range]) };
  const focusTarget = { current: 'worker-b' }, composerInput = { current: input };
  const environment = { focusTarget, composerInput, dialog: true, returnReviews: [], taskAgent: null };
  callback('focusComposer', environment)('worker-b');
  assert.deepEqual(events, []); assert.equal(focusTarget.current, 'worker-b');
  const focusComposer = callback('focusComposer', { ...environment, dialog: false });
  const positions = { current: {} }, bottom = { current: { 'worker-b': false } }, nearBottom = { current: true };
  callback('choose', { compactLayout: false, activeId: 'worker-a', scroll: { current: { scrollTop: 123 } }, positions, bottom, nearBottom, focusTarget,
    flushSync: run => run(), setSelected: id => events.push(['selected', id]), focusComposer })('worker-b');
  assert.deepEqual(positions.current, { 'worker-a': 123 });
  assert.equal(nearBottom.current, false); assert.equal(focusTarget.current, null);
  assert.deepEqual(events, [['selected', 'worker-b'], ['focus', { preventScroll: true }], ['selection', 14, 14]]);
  assert.equal(input.value, 'Retained draft');
});
