import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/branch-handoff.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  .replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
const { BranchHandoff, BranchHandoffTab, handoffActive, handoffDestination, branchDraftLocked } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const state = (phase, detail = 'Waiting for the branch to finish its current action.') => ({ phase, detail, parentId: 'parent' });
function fixture(props = {}) {
  let element;
  function Capture() {
    element = BranchHandoff({ connected: true, start: async () => ({ id: 'branch', parentId: 'parent' }), ...props });
    return null;
  }
  renderToStaticMarkup(React.createElement(Capture));
  return { element, button: element.props.children[0], html: renderToStaticMarkup(element) };
}

test('one-click hand back describes task transfer and closure without requiring an idle branch or review dialog', async () => {
  const calls = [];
  const { html, button } = fixture({ start: async () => { calls.push('start'); return { id: 'branch', parentId: 'parent' }; } });
  assert.match(html, /Hand back &amp; close/);
  assert.equal(button.props.title, 'Transfer tasks back to parent, summarize and close branch');
  assert.equal(button.props.type, 'button');
  assert.equal(button.props.disabled, false);
  await button.props.onClick();
  assert.deepEqual(calls, ['start']);
  assert.doesNotMatch(html, /<dialog|Review branch summary|Send summary/);
});

test('handoff posts once while the acceptance is outstanding and only explicit retry submits again', async () => {
  let release;
  let calls = 0;
  const { button } = fixture({ start: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  const pending = button.props.onClick();
  await button.props.onClick();
  assert.equal(calls, 1);
  release({ id: 'branch', parentId: 'parent' }); await pending;
  const retry = fixture({ handoff: { ...state('failed'), error: 'The parent needs an answer first.' }, start: async () => { calls++; } });
  assert.equal(retry.button.props.disabled, false);
  assert.match(retry.html, /Retry hand back/);
  assert.match(retry.html, /role="alert">The parent needs an answer first\./);
  assert.equal(calls, 1, 'rendering a failed handoff must not retry');
  await retry.button.props.onClick();
  assert.equal(calls, 2);
});

test('unsent draft text is retained with a note and image drafts must be sent or removed before closure', async () => {
  const text = fixture({ unsentText: true });
  assert.equal(text.button.props.disabled, false);
  assert.match(text.html, /Unsent text stays saved in this browser/);
  assert.match(text.html, /not included in the summary/);
  const images = fixture({ unsentImages: 2, start: () => assert.fail('Closing cannot hide unsent image drafts.') });
  assert.equal(images.button.props.disabled, true);
  assert.match(images.html, /Send or remove draft images first/);
  assert.match(images.html, /disappear on refresh/);
  await images.button.props.onClick();
});

test('each in-progress phase is visible and blocks another start while allowing the user to leave the tab', async () => {
  for (const phase of ['waiting', 'stopping', 'summarizing', 'transferring', 'sending', 'closing']) {
    const { html, button } = fixture({ handoff: state(phase), start: () => assert.fail('An active handoff cannot start again.') });
    assert.equal(button.props.disabled, true);
    await button.props.onClick();
    assert.match(html, /role="status"/);
    assert.match(html, /You can switch tabs/);
    assert.match(html, /closes when delivery and task transfer are confirmed/);
    assert.match(html, /Waiting for the branch to finish its current action\./);
    assert.equal(handoffActive(state(phase)), true);
  }
  assert.equal(fixture({ starting: true }).button.props.disabled, true);
});

test('unsupported or disconnected runtime cannot submit, but does not mistake native questions for a handoff failure', async () => {
  for (const props of [{ connected: false }, { provider: 'claude' }]) {
    const { button } = fixture({ ...props, start: () => assert.fail('Unavailable runtimes cannot submit.') });
    assert.equal(button.props.disabled, true);
    await button.props.onClick();
  }
  const waiting = fixture({ handoff: state('waiting', 'Answer the pending branch question to continue.') });
  assert.match(waiting.html, /Answer the pending branch question to continue\./);
  assert.doesNotMatch(waiting.html, /role="alert"|Retry hand back/);
});

test('tab markers identify handoff activity or failure without inventing a native runtime state', () => {
  assert.equal(BranchHandoffTab({}), null);
  const active = renderToStaticMarkup(BranchHandoffTab({ handoff: state('sending') }));
  assert.match(active, /aria-label="Hand back in progress"/);
  assert.doesNotMatch(active, /class="status|Running|Needs you/);
  const failed = renderToStaticMarkup(BranchHandoffTab({ handoff: { ...state('failed'), error: 'Task transfer could not be verified.' } }));
  assert.match(failed, /aria-label="Hand back failed"/);
  assert.match(failed, /Task transfer could not be verified/);
  const postFailure = fixture({ requestError: 'The handoff request could not be accepted.' });
  assert.match(postFailure.html, /Retry hand back/);
  assert.equal(postFailure.button.props.disabled, false);
  assert.match(renderToStaticMarkup(BranchHandoffTab({ requestError: 'Request failed.' })), /Hand back failed/);
});

test('only a removed selected branch navigates to its existing parent; background completion never steals selection', () => {
  const agents = [{ id: 'other' }, { id: 'parent' }];
  const completions = [{ branchId: 'branch', parentId: 'parent' }];
  assert.equal(handoffDestination('branch', agents, completions), 'parent');
  assert.equal(handoffDestination('other', agents, completions), null);
  assert.equal(handoffDestination('parent', agents, completions), null);
  assert.equal(handoffDestination('branch', [...agents, { id: 'branch' }], completions), null, 'a restored/reopened branch cannot be closed by an older completion');
  assert.equal(handoffDestination('branch', [{ id: 'other' }], completions), null, 'a missing parent cannot become the selected tab');
  assert.equal(handoffDestination('branch', agents), null);
});

test('handoff locks ordinary drafts while retaining failed and native-question state without answering anything', () => {
  const question = { id: 'request', answer: null };
  const worker = { handoff: state('waiting'), questions: [question] };
  assert.equal(branchDraftLocked(worker), true);
  assert.deepEqual(worker.questions, [question]);
  assert.equal(question.answer, null);
  assert.equal(branchDraftLocked({ handoff: state('failed') }), false);
  assert.equal(branchDraftLocked({ handoff: state('failed'), returnSummary: { delivered: true } }), true, 'a delivered summary keeps its existing draft lock during archive retry');
  assert.equal(branchDraftLocked(undefined, true), true);
  assert.equal(branchDraftLocked({ summarizing: true }), true);
  assert.equal(branchDraftLocked({ returning: true }), true);
  assert.equal(branchDraftLocked({}), false);
});

test('actual app wiring keeps background acceptance separate from navigation and preserves native answer controls', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const controls = new Map(); let start;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'startHandoff') start = node.initializer.getText(ast);
    if (ts.isJsxSelfClosingElement(node) && ['BranchHandoff', 'ChatDraft', 'NativeRequestCard', 'TaskDiscussion'].includes(node.tagName.getText(ast))) {
      controls.set(node.tagName.getText(ast), Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => [attribute.name.getText(ast), attribute.initializer?.expression?.getText(ast)])));
    }
    ts.forEachChild(node, visit);
  }; visit(ast);
  assert.match(start, /api\(`agents\/\$\{id\}\/handoff`, \{\}\)/);
  assert.doesNotMatch(start, /choose\(|setSelected\(|setDrafts\(|setTabOrder\(/);
  assert.equal(controls.get('BranchHandoff').start, '() => startHandoff(active.id)');
  assert.equal(controls.get('BranchHandoff').unsentText, '!!draftText.trim()');
  assert.equal(controls.get('BranchHandoff').unsentImages, 'draftImages.length');
  assert.equal(controls.get('ChatDraft').disabled, 'draftLocked');
  assert.match(controls.get('TaskDiscussion').canSend, /!branchDraftLocked\(worker, handoffStarting.includes\(worker.id\)\)/);
  assert.equal(controls.get('NativeRequestCard').act, 'act', 'answering a current native question must remain available');
  assert.equal(controls.get('NativeRequestCard').disabled, undefined);
  assert.match(main, /handoffDestination\(selected, state.agents, state.handoffCompletions\)/);
  const completionEffect = main.slice(main.indexOf('const parentId = handoffDestination('), main.indexOf('}, [selected, state.agents, state.handoffCompletions]'));
  assert.match(completionEffect, /if \(!parentId\) return/);
  assert.match(completionEffect, /focusTarget.current = parentId;\s*setSelected\(parentId\)/);
  assert.doesNotMatch(completionEffect, /previous.current|flushSync|choose\(/);
});
