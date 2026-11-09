import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/worker-goals.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  .replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
const { WorkerGoals, GoalActions, GoalEditor, NativeGoalSummary, goalStartChoice, goalIdentity, goalIdentityKey, GoalResponseGuard } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const goal = { threadId: 'worker', objective: 'Verify the sample application and publish its release', status: 'active', tokenBudget: 10000, tokensUsed: 1250, timeUsedSeconds: 125, createdAt: 1, updatedAt: 2 };
function fixture(props = {}) {
  let element;
  function Capture() {
    element = WorkerGoals({ agentId: 'worker', connected: true, currentState: 'ready', currentGoal: goal, load: () => assert.fail('Rendering must not change or load state.'), save: () => assert.fail('Rendering must not create a goal.'), ...props });
    return null;
  }
  renderToStaticMarkup(React.createElement(Capture));
  return { element, html: renderToStaticMarkup(element) };
}
function descendants(element, predicate) {
  const found = [];
  const visit = node => {
    if (!React.isValidElement(node)) return;
    if (predicate(node)) found.push(node);
    React.Children.forEach(node.props.children, visit);
  }; visit(element); return found;
}
const editor = (props = {}) => GoalEditor({ agentId: 'worker', existing: false, objective: 'Verify a concrete result', budget: '', confirmed: false, disabled: false, setObjective() {}, setBudget() {}, setConfirmed() {}, submit() {}, ...props });

test('goal controls show the actual native objective, status and accounting without confusing the chat title', () => {
  const { html } = fixture();
  assert.match(html, /Native goal/);
  assert.match(html, /Active:<\/strong> Verify the sample application and publish its release/);
  assert.match(html, /1,250 tokens used \/ 10,000 budget · 2 min recorded/);
  assert.match(html, /Pause goal/);
  assert.match(html, /Clear goal/);
  assert.doesNotMatch(html, /Last read/);
  const empty = fixture({ currentGoal: null });
  assert.match(empty.html, /No native goal is set/);
  assert.match(empty.html, /Start native goal/);
  assert.doesNotMatch(empty.html, /Pause goal|Resume goal|Clear goal/);
});

test('unknown, unsupported, failed and uncertain native states disable mutations and label stale values truthfully', () => {
  for (const state of ['unknown', 'loading', 'changing', 'unsupported', 'error', 'uncertain']) {
    const { element, html } = fixture({ currentState: state, currentError: state === 'error' ? 'Native read failed.' : null });
    const actions = descendants(element, node => node.type === GoalActions)[0];
    assert.equal(actions.props.disabled, true, state);
    assert.match(html, /Last read · Active/);
    if (state === 'unsupported') assert.match(html, /does not support native goal controls/);
    if (state === 'uncertain') assert.match(html, /outcome is unconfirmed/);
    if (state === 'error') assert.match(html, /role="alert">Native read failed\./);
  }
  const unsupported = fixture({ currentGoal: { ...goal, status: 'futureNativeStatus' } });
  assert.match(unsupported.html, /Unsupported native status \(futureNativeStatus\)/);
  assert.equal(descendants(unsupported.element, node => node.type === GoalActions)[0].props.disabled, true);
});

test('pause, resume and clear use exact native actions and keep limits rather than resetting their budget', () => {
  for (const status of ['active', 'paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete', 'futureNativeStatus']) {
    const calls = [];
    const element = GoalActions({ goal: { ...goal, status }, disabled: false, change: choice => calls.push(choice) });
    const buttons = descendants(element, node => node.type === 'button');
    const labels = buttons.map(button => button.props.children);
    assert.equal(labels.includes('Pause goal'), status === 'active');
    assert.equal(labels.includes('Resume goal'), ['paused', 'blocked', 'usageLimited', 'budgetLimited'].includes(status));
    for (const button of buttons) button.props.onClick();
    if (status === 'futureNativeStatus') assert.deepEqual(calls, []);
    else {
      assert.deepEqual(calls.at(-1), { action: 'clear', expectedGoal: goalIdentity(goal) });
      assert.ok(calls.every(choice => Object.keys(choice).length === 2 && choice.expectedGoal.objective === goal.objective));
    }
  }
  const calls = [];
  for (const button of descendants(GoalActions({ goal, disabled: true, change: choice => calls.push(choice) }), node => node.type === 'button')) {
    assert.equal(button.props.disabled, true); button.props.onClick();
  }
  assert.deepEqual(calls, []);
  assert.match(fixture({ currentGoal: { ...goal, status: 'budgetLimited' } }).html, /Resume preserves native limits and accounting/);
});

test('new goal input validates an explicit objective and optional positive whole-number budget', () => {
  assert.deepEqual(goalStartChoice('  Verify the release  ', '', null, false), { action: 'start', objective: 'Verify the release', expectedGoal: null });
  assert.deepEqual(goalStartChoice('Verify the release', '25000', null, false), { action: 'start', objective: 'Verify the release', expectedGoal: null, tokenBudget: 25000 });
  for (const objective of ['', '  ', 'x'.repeat(4001)]) assert.throws(() => goalStartChoice(objective, '', null, false), /objective/);
  for (const budget of ['0', '-1', '1.5', 'bad', 'Infinity', '9007199254740992']) assert.throws(() => goalStartChoice('Verify', budget, null, false), /whole-number/);
  assert.equal(goalStartChoice('🎯'.repeat(4000), '', null, false).objective.length, 8000, 'native limits count Unicode characters, not UTF-16 code units');
  assert.equal(descendants(editor(), node => node.type === 'textarea')[0].props.maxLength, undefined);
  assert.match(renderToStaticMarkup(editor()), /Leave to Codex/);
});

test('a compact mobile summary keeps paused, blocked and limited goals visible without inventing a stuck diagnosis', () => {
  for (const [status, label] of [['active', 'Active'], ['paused', 'Paused'], ['blocked', 'Blocked'], ['usageLimited', 'Usage limited'], ['budgetLimited', 'Budget limited'], ['complete', 'Complete']]) {
    const html = renderToStaticMarkup(NativeGoalSummary({ goal: { ...goal, status }, state: 'ready' }));
    assert.ok(html.includes(`<strong>${label}</strong>`));
    assert.match(html, /worker-goal-mobile-status/);
    assert.match(html, /Verify the sample application/);
    assert.doesNotMatch(html, /stuck|idle/i);
  }
  assert.match(renderToStaticMarkup(NativeGoalSummary({ goal, state: 'uncertain' })), /Last read · Active/);
  assert.match(renderToStaticMarkup(NativeGoalSummary({ goal: null, state: 'ready' })), /Not set/);
});

test('replacement requires a separate explicit choice and a visible native accounting reset warning', () => {
  assert.throws(() => goalStartChoice('New objective', '1000', goal, false), /Confirm replacing/);
  assert.deepEqual(goalStartChoice('New objective', '1000', goal, true), { action: 'start', objective: 'New objective', expectedGoal: goalIdentity(goal), tokenBudget: 1000, replace: true });
  const calls = [];
  const unconfirmed = editor({ existing: true, submit: () => calls.push('replace') });
  assert.match(renderToStaticMarkup(unconfirmed), /Native usage, time and budget accounting may reset/);
  assert.equal(descendants(unconfirmed, node => node.type === 'button')[0].props.disabled, true);
  unconfirmed.props.onSubmit({ preventDefault() {} }); assert.deepEqual(calls, []);
  const confirmed = editor({ existing: true, confirmed: true, submit: () => calls.push('replace') });
  assert.equal(descendants(confirmed, node => node.type === 'button')[0].props.disabled, false);
  confirmed.props.onSubmit({ preventDefault() {} }); assert.deepEqual(calls, ['replace']);
  assert.match(renderToStaticMarkup(confirmed), /Replace goal &amp; reset accounting/);
});

test('confirmation and mutation preconditions bind to the displayed goal identity, including a refreshed or recreated goal', () => {
  const confirmedIdentity = goalIdentityKey(goal);
  for (const changed of [{ ...goal, objective: 'Different native objective' }, { ...goal, createdAt: goal.createdAt + 1 }, { ...goal, tokenBudget: 20000 }]) {
    const confirmed = confirmedIdentity === goalIdentityKey(changed);
    assert.equal(confirmed, false);
    assert.throws(() => goalStartChoice('Replacement', '', changed, confirmed), /Confirm replacing/);
  }
  assert.equal(confirmedIdentity, goalIdentityKey({ ...goal, tokensUsed: 2000, timeUsedSeconds: 250, updatedAt: 10, status: 'paused' }), 'normal accounting/status changes do not substitute another goal');
  assert.equal(goalIdentityKey(null), null);
  assert.deepEqual(goalIdentity(goal), { objective: goal.objective, createdAt: goal.createdAt, tokenBudget: goal.tokenBudget });
  const clear = descendants(GoalActions({ goal, disabled: false, change() {} }), node => node.type === 'button').find(button => button.props.children === 'Clear goal');
  assert.equal(clear.props.disabled, false);
  assert.match(source, /const displayedIdentity = goalIdentityKey\(result.goal\)/);
  assert.match(source, /confirmedIdentity === displayedIdentity/);
  assert.match(source, /goalStartChoice\(objective, budget, result.goal, confirmed\)/);
});

test('a delayed HTTP read cannot overwrite a newer native objective, clear, status or error', async () => {
  const original = { goal, state: 'ready', error: null };
  for (const newer of [
    { ...original, goal: { ...goal, objective: 'A newer objective', createdAt: 10, updatedAt: 11 } },
    { ...original, goal: null },
    { ...original, goal: { ...goal, status: 'paused', updatedAt: 12 } },
    { ...original, state: 'error', error: 'The current native read failed.' },
  ]) {
    const responses = new GoalResponseGuard(); responses.observe(original);
    const applied = []; let resolve;
    const pending = responses.settle(() => new Promise(done => { resolve = done; }), result => applied.push(result), error => applied.push(error));
    responses.observe(newer);
    resolve(original); await pending;
    assert.deepEqual(applied, []);
  }
});

test('a delayed mutation result or rejection cannot replace newer SSE state with an old goal or stale error', async () => {
  const responses = new GoalResponseGuard(); const original = { goal, state: 'ready', error: null };
  responses.observe(original);
  const applied = []; let resolve;
  const saved = responses.settle(() => new Promise(done => { resolve = done; }), result => applied.push(result), error => applied.push(error));
  responses.observe({ goal: null, state: 'ready', error: null });
  resolve({ goal: { ...goal, status: 'paused' }, state: 'ready', error: null }); await saved;
  assert.deepEqual(applied, []);
  let reject;
  const failed = responses.settle(() => new Promise((_done, fail) => { reject = fail; }), result => applied.push(result), error => applied.push(error));
  responses.observe({ ...original, goal: { ...goal, createdAt: 100, objective: 'Newest goal' } });
  reject(new Error('An old HTTP request failed.')); await failed;
  assert.deepEqual(applied, []);
});

test('loading/changing snapshots do not discard their matching HTTP result when a final stream event is unavailable', async () => {
  const original = { goal, state: 'ready', error: null };
  for (const state of ['loading', 'changing']) {
    const responses = new GoalResponseGuard(); responses.observe(original);
    let resolve; const applied = [];
    const pending = responses.settle(() => new Promise(done => { resolve = done; }), result => applied.push(result), error => applied.push(error));
    responses.observe({ ...original, state });
    const result = { ...original, goal: { ...goal, status: 'paused' } };
    resolve(result); await pending;
    assert.deepEqual(applied, [result]);
  }
  assert.match(source, /responses.current.settle\(load, setResult, failed\)/);
  assert.match(source, /responses.current.settle\(\(\) => save\(choice\)/);
  assert.doesNotMatch(source, /setResult\(await (?:load|save)/);
});

test('disconnected, handoff and pending-question guards preserve inputs and do not submit native mutations', () => {
  for (const props of [{ connected: false }, { blocked: 'Answer the pending native request before changing the goal.' }, { blocked: 'Finish the branch handoff before changing its native goal.' }]) {
    const { element, html } = fixture(props);
    assert.equal(descendants(element, node => node.type === GoalActions)[0].props.disabled, true);
    assert.equal(descendants(element, node => node.type === GoalEditor)[0].props.disabled, true);
    if (props.blocked) assert.ok(html.includes(props.blocked));
  }
  const calls = [];
  const locked = editor({ confirmed: true, disabled: true, submit: () => calls.push('start') });
  locked.props.onSubmit({ preventDefault() {} }); assert.deepEqual(calls, []);
});

test('refresh uses the supplied read interface; mount effects never create native goals', async () => {
  let reads = 0;
  const { element } = fixture({ load: async () => { reads++; return { goal, state: 'ready', error: null }; } });
  const refresh = descendants(element, node => node.type === 'button' && node.props.children === 'Refresh goal')[0];
  await refresh.props.onClick();
  assert.equal(reads, 1);
  const ast = ts.createSourceFile('worker-goals.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const effects = [];
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects.push(node.arguments[0].getText(ast));
    ts.forEachChild(node, visit);
  }; visit(ast);
  assert.ok(effects.some(effect => /refresh\(\)/.test(effect)));
  assert.ok(effects.every(effect => !/save\(|change\(|goalStartChoice\(/.test(effect)));
});

test('app integration is Codex-only, reads nativeGoal rather than title, and sends mutations through the explicit route', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let attributes;
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'WorkerGoals') attributes = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => [attribute.name.getText(ast), attribute.initializer?.expression?.getText(ast)]));
    ts.forEachChild(node, visit);
  }; visit(ast);
  assert.equal(attributes.currentGoal, 'active.nativeGoal');
  assert.equal(attributes.currentState, 'active.nativeGoalState');
  assert.equal(attributes.load, '() => api(`agents/${active.id}/goal`)');
  assert.equal(attributes.save, 'choice => api(`agents/${active.id}/goal`, choice)');
  assert.match(attributes.blocked, /draftLocked/);
  assert.match(attributes.blocked, /active.questions.length/);
  assert.match(main, /active.provider !== 'claude' && <WorkerGoals/);
  assert.match(main, /<\/WorkerSettings>\{compactLayout && active.provider !== 'claude' && <NativeGoalSummary goal=\{active.nativeGoal\} state=\{active.nativeGoalState\}/);
});
