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
    workerCount: 2, busy: '', messageQuestionBlocked: null, messageQuestionInputs: {},
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
    { messageQuestionInputs: { 'question-a': { draft: 'Native answer' } } }, { navigate() {} }
  ]) assert.equal(equalReferences(before[0], dependencies('messageHistory', { ...environment, ...changed })), false, 'real history/control changes must invalidate the boundary');
  assert.equal(equalReferences(before[1], dependencies('navigate', { ...environment, activeId: 'worker-b' })), false);
  assert.equal(equalReferences(before[3], dependencies('focusComposer', { ...environment, dialog: true })), false);
  const app = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'App');
  const firstReturn = app.body.statements.find(node => ts.isIfStatement(node) && ts.isReturnStatement(node.thenStatement));
  assert.ok(hooks.get('messageHistory').pos < firstReturn.pos, 'the history hook must execute before conditional authentication returns');
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
