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
const source = await readFile(new URL('../src/coordinator-tab-status.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  .replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`)
  .replace('../server/approval-choices.mjs', new URL('../server/approval-choices.mjs', import.meta.url).href);
const { coordinatorEvaluating, observeCoordinatorConcerns, CoordinatorTabIndicator, CoordinatorTabStatus, CONCERN_INDICATION_MS } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const question = extra => ({ id: 'request', method: 'item/commandExecution/requestApproval', reviewToken: 'token', params: { threadId: 'worker', command: 'example-tool --check' }, ...extra });
const main = extra => ({ id: 'main', role: 'coordinator', provider: 'codex', status: 'running', turnId: 'main-turn', questions: [], ...extra });
const worker = extra => ({ id: 'worker', role: 'worker', provider: 'codex', status: 'attention', questions: [question()], ...extra });
const snapshot = extra => ({ connected: true, codexConnected: true, coordinator: { id: 'main', paused: false, starting: false, audit: [], approvalAnalyses: [] }, agents: [main(), worker()], ...extra });
const analyst = extra => ({ reviewToken: 'token', status: 'running', current: true, active: true, threadId: 'analyst', turnId: 'analysis-turn', ...extra });
const entry = extra => ({ id: 'ask-one', coordinatorId: 'main', agentId: 'worker', decision: 'ask', outcome: 'needs_user', at: '2027-01-01T12:00:01.000Z', ...extra });

test('evaluation requires an active main review and still-reviewable current request, then clears on its outcome', () => {
  assert.equal(coordinatorEvaluating(snapshot()), true);
  for (const state of [
    snapshot({ connected: false }), snapshot({ codexConnected: false }), snapshot({ restoration: { status: 'pending' } }), snapshot({ restoration: { status: 'restoring' } }),
    snapshot({ coordinator: { id: 'main', paused: true, audit: [] } }), snapshot({ coordinator: { id: 'main', starting: true, audit: [] } }),
    snapshot({ agents: [worker()] }), snapshot({ agents: [main({ status: 'idle' }), worker()] }),
    snapshot({ agents: [main({ turnId: null }), worker()] }), snapshot({ agents: [main(), worker({ questions: [] })] }),
    ...[{ responding: true }, { error: 'A native answer failed.' }, { reviewToken: undefined },
      ...['approve', 'decline', 'ask'].map(decision => ({ review: { decision } })),
      { method: 'item/tool/requestUserInput' }, { params: { threadId: 'worker', kind: 'humanCommand' } },
      { params: { threadId: 'different-worker' } }, { params: { threadId: 'worker', availableDecisions: ['decline'] } }]
      .map(extra => snapshot({ agents: [main(), worker({ questions: [question(extra)] })] })),
  ]) assert.equal(coordinatorEvaluating(state), false, JSON.stringify(state));
  assert.equal(coordinatorEvaluating(snapshot({ agents: [main(), worker({ questions: [question({ review: { decision: 'queued' } })] })] })), true);
  assert.equal(coordinatorEvaluating(snapshot({ agents: [main(), worker({ questions: [question({ review: { decision: 'ask' } }), question({ id: 'remaining', reviewToken: 'remaining' })] })] })), true, 'another active request keeps evaluation visible');
});

test('only a token-matched running analyst or a verified child request contributes delegated evaluation', () => {
  for (const status of ['queued', 'ready', 'stale', 'failed', 'unknown']) {
    const state = snapshot({ agents: [main({ status: 'idle', turnId: null }), worker()] });
    state.coordinator.approvalAnalyses = [analyst({ status, active: false })];
    assert.equal(coordinatorEvaluating(state), false, status);
  }
  const state = snapshot({ agents: [main({ status: 'idle', turnId: null }), worker()] });
  state.coordinator.approvalAnalyses = [analyst()];
  assert.equal(coordinatorEvaluating(state), true);
  for (const extra of [{ current: false }, { current: undefined }, { active: false }, { active: undefined }, { turnId: null }, { turnId: undefined }, { turnId: '' }, { turnId: ' ' }]) {
    state.coordinator.approvalAnalyses = [analyst(extra)];
    assert.equal(coordinatorEvaluating(state), false, 'same-token superseded or unconfirmed runs are not evidence: ' + JSON.stringify(extra));
  }
  state.coordinator.approvalAnalyses = [analyst({ current: false }), analyst({ status: 'queued', active: false, turnId: null })];
  assert.equal(coordinatorEvaluating(state), false, 'a superseded active run cannot make its queued same-token replacement green');
  state.coordinator.approvalAnalyses = [analyst()];
  state.coordinator.approvalAnalyses[0].reviewToken = 'old-token';
  assert.equal(coordinatorEvaluating(state), false);
  state.coordinator.approvalAnalyses[0].reviewToken = 'token';
  state.agents[1].questions[0].review = { decision: 'approve' };
  assert.equal(coordinatorEvaluating(state), false, 'completed review cannot leave delegated green status behind');
  const child = { id: 'child', questions: [question({ params: { threadId: 'child' } })] };
  assert.equal(coordinatorEvaluating(snapshot({ agents: [main(), worker({ questions: [], workers: [child] })] })), true);
  child.questions[0].params.threadId = 'wrong-child';
  assert.equal(coordinatorEvaluating(snapshot({ agents: [main(), worker({ questions: [], workers: [child] })] })), false);
});

test('concerns pulse only for newly observed main asks, never initial/restored audit or storage updates', () => {
  const old = entry({ id: 'old-ask', at: '2027-01-01T12:00:00.000Z' });
  const baseline = observeCoordinatorConcerns(undefined, 'main', [old], true);
  assert.equal(baseline.concernId, null);
  const current = entry(), fresh = observeCoordinatorConcerns(baseline.observation, 'main', [old, current], true);
  assert.equal(fresh.concernId, current.id);
  const saved = observeCoordinatorConcerns(fresh.observation, 'main', [{ ...old }, { ...current, storageState: 'saved' }], true);
  assert.equal(saved.concernId, null, 'new SSE objects and save-state updates cannot restart the pulse');
  assert.equal(observeCoordinatorConcerns(saved.observation, 'main', [old, current, entry({ id: 'restored', at: '2026-01-01T12:00:00.000Z' })], true).concernId, null, 'late old history cannot generate a new concern');
  for (const extra of [{ decision: 'approve', outcome: 'resolved' }, { decision: 'decline', outcome: 'resolved' }, { outcome: 'unconfirmed' }, { coordinatorId: 'another-main' }, { id: undefined }, { at: 'unknown' }]) {
    assert.equal(observeCoordinatorConcerns(fresh.observation, 'main', [old, current, entry({ id: 'different', ...extra })], true).concernId, null, JSON.stringify(extra));
  }
});

test('reconnect and Coordinator changes establish fresh baselines instead of replaying concerns', () => {
  const initial = observeCoordinatorConcerns(undefined, 'main', [], true);
  const disconnected = observeCoordinatorConcerns(initial.observation, 'main', [], false);
  const reconnected = observeCoordinatorConcerns(disconnected.observation, 'main', [entry()], true);
  assert.equal(reconnected.concernId, null);
  const newer = entry({ id: 'newer', at: '2027-01-01T12:00:02.000Z' });
  assert.equal(observeCoordinatorConcerns(reconnected.observation, 'main', [entry(), newer], true).concernId, newer.id);
  assert.equal(observeCoordinatorConcerns(initial.observation, 'different-main', [entry({ coordinatorId: 'different-main' })], true).concernId, null);
});

test('actual indicator markup gives Concerned priority, then returns to evaluation or an empty reserved row', () => {
  const render = props => renderToStaticMarkup(React.createElement(CoordinatorTabIndicator, props));
  const evaluating = render({ concernId: null, evaluating: true });
  assert.match(evaluating, /coordinator-tab-status evaluating/); assert.match(evaluating, /Evaluating…/);
  const concerned = render({ concernId: 'new-ask', evaluating: true });
  assert.match(concerned, /coordinator-tab-status concerned/); assert.match(concerned, /coordinator-concern-pulse/); assert.match(concerned, /Concerned\./);
  assert.doesNotMatch(concerned, /Evaluating…/); assert.match(concerned, /aria-live="polite"/);
  assert.doesNotMatch(render({ concernId: null, evaluating: false }), /Concerned|Evaluating/);
  assert.match(renderToStaticMarkup(React.createElement(CoordinatorTabStatus, { state: snapshot(), streamConnected: true })), /Evaluating…/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(CoordinatorTabStatus, { state: snapshot(), streamConnected: false })), /Evaluating/);
  for (const status of ['pending', 'restoring']) {
    assert.doesNotMatch(renderToStaticMarkup(React.createElement(CoordinatorTabStatus, { state: snapshot({ restoration: { status } }), streamConnected: true })), /Evaluating|Concerned/);
  }
});

test('actual status text resolves to the intended color across themes, selection and native tab activity classes', async () => {
  const css = postcss.parse(await readFile(new URL('../src/style.css', import.meta.url), 'utf8'));
  const textColor = (theme, status, active, indication, coordinator = true) => {
    const wrapperClasses = new Set(['tab-wrap', status, ...(active ? ['active'] : []), ...(coordinator ? ['coordinator-tab'] : [])]);
    const classes = new Set(['tab-text', 'coordinator-tab-status', indication]);
    let winner = { specificity: -1, value: undefined };
    for (const rule of css.nodes.filter(node => node.type === 'rule')) for (const selector of rule.selectors) {
      if (!selector.endsWith('span') && !selector.includes('.coordinator-tab-status')) continue;
      if (!selector.includes('.tab-text')) continue;
      const themeMatch = selector.match(/:root\[data-theme="([^"]+)"\]/);
      if (themeMatch && themeMatch[1] !== theme) continue;
      const local = selector.replace(/:root\[data-theme="[^"]+"\]\s*/, '');
      if (/[#:[]/.test(local)) continue;
      const [wrapper, target] = local.split(/\s+\.tab-text\s*>\s*/);
      if (!target || !wrapper.startsWith('.')) continue;
      const requiredWrapper = [...wrapper.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
      const requiredTarget = [...target.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
      if (!requiredWrapper.every(name => wrapperClasses.has(name)) || !requiredTarget.every(name => classes.has(name))) continue;
      const specificity = (selector.match(/\.[\w-]+|\[[^\]]+\]|:root/g) || []).length * 100 + (target === 'span' ? 1 : 0);
      for (const decl of rule.nodes.filter(node => node.type === 'decl' && node.prop === 'color')) {
        if (specificity >= winner.specificity) winner = { specificity, value: decl.value };
      }
    }
    return winner.value;
  };
  for (const theme of ['classic', 'contrastful', 'light']) for (const active of [false, true]) for (const status of ['running', 'attention', 'idle', 'waiting']) {
    assert.equal(textColor(theme, status, active, 'concerned'), 'var(--amber)', `${theme} ${status} selected=${active}: a new concern stays amber`);
    assert.equal(textColor(theme, status, active, 'evaluating'), 'var(--green)', `${theme} ${status} selected=${active}: actual evaluation stays green`);
  }
  assert.equal(textColor('light', 'running', false, '', false), 'var(--green)', 'ordinary worker running color remains unchanged');
  assert.equal(textColor('light', 'attention', true, '', false), 'var(--amber)', 'ordinary worker attention color remains unchanged');
});

test('Coordinator alone doubles height with separate name and status rows, including narrow mobile width', async () => {
  const css = postcss.parse(await readFile(new URL('../src/style.css', import.meta.url), 'utf8'));
  const declarations = selector => {
    const values = {}; css.nodes.filter(node => node.type === 'rule' && node.selectors.includes(selector)).forEach(rule => rule.walkDecls(decl => { values[decl.prop] = decl.value; })); return values;
  };
  assert.equal(declarations('.coordinator-tab-group .coordinator-tab').height, '68px');
  assert.equal(declarations('.coordinator-tab-group .coordinator-tab.active').height, '80px');
  assert.equal(declarations('.tabs > .tab-wrap').height, '34px'); assert.equal(declarations('.tabs > .tab-wrap.active').height, '40px');
  assert.equal(declarations('.coordinator-tab .agent-tab')['grid-template-rows'], '1fr 1fr');
  assert.equal(declarations('.coordinator-tab .tab-text strong')['grid-row'], '1');
  assert.equal(declarations('.coordinator-tab .tab-text > .coordinator-tab-status')['grid-row'], '2');
  assert.equal(declarations('.coordinator-tab .tab-text > .coordinator-tab-status')['grid-column'], '1 / -1', 'status spans icon/name columns so the 90px mobile tab can fit it');
  assert.equal(declarations('.coordinator-tab .tab-text > .coordinator-tab-status.evaluating').color, 'var(--green)');
  assert.equal(declarations('.coordinator-tab .tab-text > .coordinator-tab-status.concerned').color, 'var(--amber)');
  const mobile = css.nodes.find(node => node.type === 'atrule' && node.params === '(max-width: 430px)');
  assert.ok(mobile.nodes.some(rule => rule.selector === '.coordinator-tab-group .tab-wrap' && rule.nodes.some(decl => decl.prop === 'max-width' && decl.value === '90px')));
});

test('concern animation is three gentle finite fades with a reduced-motion-safe finite cleanup', async () => {
  const css = postcss.parse(await readFile(new URL('../src/style.css', import.meta.url), 'utf8'));
  const pulse = css.nodes.find(node => node.type === 'rule' && node.selector === '.coordinator-concern-pulse');
  assert.equal(pulse.nodes.find(decl => decl.prop === 'animation').value, 'coordinator-concern-fade 3s ease-in-out 3 forwards');
  const frames = css.nodes.find(node => node.type === 'atrule' && node.name === 'keyframes' && node.params === 'coordinator-concern-fade');
  assert.deepEqual(frames.nodes.map(frame => [frame.selector, frame.nodes[0].value]), [['0%, 100%', '0'], ['45%, 55%', '.85']]);
  const reduced = css.nodes.find(node => node.type === 'atrule' && node.params === '(prefers-reduced-motion: reduce)');
  assert.ok(reduced.nodes.some(rule => rule.nodes.some(decl => decl.prop === 'animation' && decl.value === 'none' && decl.important)));
  assert.equal(CONCERN_INDICATION_MS, 9000);
  assert.match(source, /window\.setTimeout\(\(\) => setConcernId\(null\), CONCERN_INDICATION_MS\)/);
  assert.match(source, /return \(\) => window\.clearTimeout\(timeout\)/);
  const mainSource = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(mainSource, /agent\.role === 'coordinator' && <CoordinatorTabStatus state=\{state\} streamConnected=\{streamHealth\.state === 'connected' && !workspaceReconnecting\}/);
});
