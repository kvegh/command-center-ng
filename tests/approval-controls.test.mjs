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
async function componentUrl(name) {
  const source = await readFile(new URL(`../src/${name}.tsx`, import.meta.url), 'utf8');
  let compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  for (const match of [...compiled.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const pkg = match[1];
    const url = pkg.startsWith('./') ? await componentUrl(pkg.slice(2)) : pathToFileURL(require.resolve(pkg)).href;
    compiled = compiled.replace(match[0], `from '${url}'`);
  }
  return 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64');
}
const { NativeApprovalControls, NativePermissionControls, NativeRequestCard } = await import(await componentUrl('native-request-card'));
const command = params => ({ id: 1, method: 'item/commandExecution/requestApproval', params });
const file = params => ({ id: 2, method: 'item/fileChange/requestApproval', params });
const exec = prefix => ({ acceptWithExecpolicyAmendment: { execpolicy_amendment: prefix } });
const network = host => ({ applyNetworkPolicyAmendment: { network_policy_amendment: { host, action: 'allow' } } });
const mcp = meta => ({ id: 3, method: 'mcpServer/elicitation/request', params: { mode: 'form', requestedSchema: { type: 'object', properties: {} }, _meta: meta } });
const controls = (question, extra = {}) => {
  let node;
  function Capture() { node = NativeApprovalControls({ question, busy: false, submit() { assert.fail('Rendering must not submit.'); }, ...extra }); return null; }
  renderToStaticMarkup(React.createElement(Capture)); return node;
};
const html = (question, extra) => renderToStaticMarkup(controls(question, extra));
const card = (question, extra = {}) => renderToStaticMarkup(React.createElement(NativeRequestCard, { question, agentId: 'worker-one', workerName: 'Example project', act: async () => true, ...extra }));

test('native and Claude approval cards expose pending submission state to site refresh', () => {
  for (const question of [command({ command: 'synthetic-check' }), { id: 4, method: 'claude/tool/requestApproval', params: { toolName: 'Bash', input: { command: 'synthetic-check' } } }]) {
    assert.match(card(question), /class="question-card native-request"[^>]*aria-busy="false"/);
    assert.match(card({ ...question, responding: true }), /class="question-card native-request"[^>]*aria-busy="true"/);
  }
});

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}
const buttons = node => elements(node).filter(element => element.type === 'button');

test('native prefix and network scopes remain exact after the compact action row and describe their numbered buttons', () => {
  const node = controls(command({ availableDecisions: ['accept', exec(['npm', 'test']), network('api.example.com'), network('other.example.com'), 'decline', 'cancel'] }));
  const rendered = renderToStaticMarkup(node);
  const row = elements(node).find(element => element.props.className === 'button-row native-approval-choices');
  assert.deepEqual(buttons(row).map(button => button.props.children), ['Allow once', 'Allow always (1)', 'Allow always (2)', 'Allow always (3)', 'Decline', 'Cancel turn']);
  assert.equal(elements(row).filter(element => element.type === 'p').length, 0, 'scope paragraphs cannot separate or stretch the buttons');
  const scopes = elements(node).filter(element => element.props.className === 'field-note native-approval-scope');
  for (const [index, scope] of ['Commands beginning with ["npm","test"]', 'Network host: api.example.com', 'Network host: other.example.com'].entries()) {
    assert.equal(scopes[index].props.children[2], scope);
    assert.equal(buttons(row)[index + 1].props['aria-describedby'], scopes[index].props.id);
    assert.equal(scopes[index].props.children[0].props.children[0], `Allow always (${index + 1})`);
    assert.ok(rendered.indexOf(`id="${scopes[index].props.id}"`) > rendered.indexOf('>Cancel turn</button>'));
  }
  assert.match(rendered, /asks Codex to save this rule for matching future requests\. Shared user settings may affect other sessions\./);
  assert.doesNotMatch(rendered, /saved successfully|verified on disk/i);
});

test('each action passes only its exact native answer and review remains separate', () => {
  const submitted = []; let reviews = 0;
  const expected = ['accept', exec(['git', 'fetch']), network('api.example.com'), 'decline', 'cancel'];
  const node = controls(command({ availableDecisions: expected }), { submit: answer => submitted.push(answer), review: () => reviews++ });
  const actions = buttons(node);
  for (const button of actions.slice(0, -1)) button.props.onClick();
  assert.deepEqual(submitted, expected.map(decision => ({ decision })));
  assert.equal(reviews, 0);
  actions.at(-1).props.onClick();
  assert.equal(reviews, 1); assert.equal(submitted.length, expected.length);
});

test('fresh-human checkpoints expose manual-only choices with no coordinator or reusable grant', async () => {
  const question = command({ kind: 'humanCommand', command: 'example-tool --check', availableDecisions: ['accept', 'acceptForSession', exec(['example-tool']), network('api.example.com'), 'decline', 'cancel'] });
  const submitted = []; let restored = 0;
  const node = controls(question, { review() { assert.fail('Human-only checkpoints cannot be sent for review.'); }, submit: async answer => { submitted.push(answer); return true; }, prepareApprovalFocus: () => () => restored++ });
  assert.deepEqual(buttons(node).map(button => button.props.children), ['Allow once', 'Decline', 'Cancel turn']);
  for (const button of buttons(node)) await button.props.onClick();
  assert.deepEqual(submitted, ['accept', 'decline', 'cancel'].map(decision => ({ decision })));
  assert.equal(restored, 1);
  const rendered = card(question);
  assert.match(rendered, /Human approval required/);
  assert.match(rendered, /requires your personal decision/);
  assert.doesNotMatch(rendered, />Allow always|>Allow for this session|Ask coordinator to review/);
  assert.ok(buttons(controls(question, { busy: true })).every(button => button.props.disabled));
});

test('unsupported command kinds remain visible with compatibility advice and no answer or delegation buttons', () => {
  const question = command({ kind: 'futureKind', command: 'example-tool --check', reason: 'Preserve this native reason.', availableDecisions: ['accept', 'decline'] });
  const actions = controls(question, { review() { assert.fail('Unsupported kinds cannot enter review.'); } });
  assert.equal(buttons(actions).length, 0);
  const rendered = card(question);
  assert.match(rendered, /Unsupported command approval/);
  assert.match(rendered, /CCNG cannot answer this native command approval kind/);
  assert.match(rendered, /Leave it pending and check native-runtime compatibility or update CCNG/);
  assert.match(rendered, /no decision has been sent/);
  assert.match(rendered, /example-tool --check/); assert.match(rendered, /Preserve this native reason/);
  assert.doesNotMatch(rendered, /Ask coordinator to review|>Allow once|>Decline|>Cancel turn/);
});

test('restored referrals show their date and reason while preserving manual choices and explicit re-review', () => {
  const historicalAt = '2026-01-01T12:49:00.000Z';
  const rendered = card({ ...command({ command: 'example-tool --check' }), review: { decision: 'ask', rationale: 'Choose the intended target.', historicalAt, decisionId: 'past-decision' } });
  assert.match(rendered, /Earlier review/); assert.match(rendered, /dateTime="2026-01-01T12:49:00.000Z"/);
  assert.match(rendered, /Choose the intended target/); assert.match(rendered, /Needs your decision/);
  assert.match(rendered, /Answer below or ask the coordinator to review again/);
  assert.match(rendered, />Allow once<\/button>/); assert.match(rendered, />Ask coordinator to review<\/button>/);
});

test('a long native prefix cannot put scope text or a wide wrapper between Allow once and Allow always', async () => {
  const prefix = ['example-tool', '--selected-work', 'path/'.repeat(800)];
  const node = controls(command({ proposedExecpolicyAmendment: prefix }));
  const row = elements(node).find(element => element.props.className === 'button-row native-approval-choices');
  const actions = React.Children.toArray(row.props.children);
  assert.ok(actions.every(action => action.type === 'button'), 'only compact buttons participate in the wrapping flex row');
  assert.deepEqual(actions.slice(0, 2).map(action => action.props.children), ['Allow once', 'Allow always']);
  assert.equal(actions[0].props['aria-describedby'], undefined);
  const scope = elements(node).find(element => element.props.id === actions[1].props['aria-describedby']);
  assert.ok(scope); assert.equal(scope.props.children[2], 'Commands beginning with ' + JSON.stringify(prefix));
  assert.equal(elements(row).filter(element => element.props.className === 'field-note native-approval-scope').length, 0);
  assert.equal(actions[1].props.children.length, 'Allow always'.length, 'the scope length cannot enlarge its visible button label');
  const sheet = postcss.parse(await readFile(new URL('../src/style.css', import.meta.url), 'utf8'));
  const rule = selector => sheet.nodes.find(node => node.type === 'rule' && node.selector === selector);
  const declaration = (selector, property) => rule(selector)?.nodes.find(node => node.prop === property)?.value;
  assert.equal(declaration('.button-row', 'display'), 'flex');
  assert.equal(declaration('.native-approval-choices', 'flex-wrap'), 'wrap');
  assert.equal(declaration('.native-approval-choices > .button', 'white-space'), 'nowrap');
  assert.equal(declaration('.native-approval-choices > .button', 'flex'), '0 0 auto');
  assert.equal(declaration('.native-approval-scopes .native-approval-scope', 'overflow-wrap'), 'anywhere');
});

test('multiple native saved scopes have unique accessible descriptions and exact action associations', async () => {
  const offered = ['accept', 'acceptForSession', network('api.example.com'), exec(['first-tool']), exec(['second-tool']), 'decline'];
  const question = command({ availableDecisions: offered });
  const submitted = [], node = controls(question, { submit: answer => { submitted.push(answer); return true; } });
  const actions = buttons(node);
  assert.deepEqual(actions.map(action => action.props.children), ['Allow once', 'Allow always (1)', 'Allow always (2)', 'Allow always (3)', 'Allow for this session', 'Decline']);
  const expected = new Map([
    ['Network host: api.example.com', network('api.example.com')],
    ['Commands beginning with ["first-tool"]', exec(['first-tool'])],
    ['Commands beginning with ["second-tool"]', exec(['second-tool'])]
  ]);
  for (const action of actions.filter(action => String(action.props.children).startsWith('Allow always'))) {
    const scope = elements(node).find(element => element.props.id === action.props['aria-describedby']);
    assert.ok(scope); assert.equal(scope.props.children[0].props.children[0], action.props.children);
    await action.props.onClick(); assert.deepEqual(submitted.at(-1), { decision: expected.get(scope.props.children[2]) });
  }
  const props = { question, busy: false, submit: () => assert.fail('Rendering cannot approve') };
  const rendered = renderToStaticMarkup(React.createElement('div', null, React.createElement(NativeApprovalControls, props), React.createElement(NativeApprovalControls, props)));
  const ids = [...rendered.matchAll(/id="([^"]+-scope-\d+)"/g)].map(match => match[1]);
  const descriptions = [...rendered.matchAll(/aria-describedby="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, 8); assert.equal(new Set(ids).size, ids.length, 'separate mounted request cards cannot share description IDs');
  assert.deepEqual(new Set(descriptions), new Set(ids));
});

test('only native offered permanent choices render; session approval retains its limited label', () => {
  for (const question of [command({}), file({}), file({ availableDecisions: ['accept', 'acceptForSession', 'decline'] }), command({ availableDecisions: ['accept', 'cancel'], proposedExecpolicyAmendment: ['npm', 'test'] })]) {
    const rendered = html(question);
    assert.doesNotMatch(rendered, />Allow always<\/button>/);
    assert.match(rendered, /no native permanent approval choice/);
  }
  const session = html(command({ availableDecisions: ['acceptForSession'] }));
  assert.match(session, /Allow for this session/);
  assert.match(session, /This native approval for this session\./);
  assert.doesNotMatch(session, /Codex saves this rule/);
});

test('native MCP persist choices submit the exact offered persistence without a form body', () => {
  const question = mcp({ codex_approval_kind: 'mcp_tool_call', persist: ['session', 'always'] });
  const submitted = [];
  const node = controls(question, { submit: answer => submitted.push(answer) });
  const expected = { 'Allow once': { decision: 'accept' }, 'Allow for this session': { decision: 'accept', persistence: 'session' },
    'Allow always': { decision: 'accept', persistence: 'always' }, Decline: { decision: 'decline' }, Cancel: { decision: 'cancel' } };
  for (const button of buttons(node)) { button.props.onClick(); assert.deepEqual(submitted.at(-1), expected[button.props.children]); }
  assert.equal(submitted.length, 5);
  const rendered = card(question);
  assert.match(rendered, />Allow always<\/button>/);
  assert.match(rendered, /This native tool; Codex manages the saved permission\./);
  assert.doesNotMatch(rendered, />Submit response<\/button>/);
  assert.doesNotMatch(html(mcp({ codex_approval_kind: 'mcp_tool_call' })), />Allow always<\/button>/);
});

test('ordinary MCP forms and URL steps keep their original controls even with persist metadata', () => {
  const form = mcp({ persist: 'always' });
  form.params.requestedSchema.properties.choice = { type: 'string', title: 'Choose a value' };
  const rendered = card(form);
  assert.match(rendered, /aria-label="Choose a value"/);
  assert.match(rendered, />Submit response<\/button>/);
  assert.doesNotMatch(rendered, />Allow always<\/button>/);
  const external = card({ ...form, params: { mode: 'url', url: 'https://example.com/authorize', _meta: { persist: 'always', codex_approval_kind: 'mcp_tool_call' } } });
  assert.match(external, /Open external page/); assert.match(external, /I completed this step/);
  assert.doesNotMatch(external, />Allow always<\/button>/);
});

test('coordinators receive no reusable choices and native MCP permission grants remain disabled', () => {
  const questions = [command({ availableDecisions: ['accept', 'acceptForSession', exec(['npm', 'test']), 'decline'] }), mcp({ codex_approval_kind: 'mcp_tool_call', persist: ['session', 'always'] })];
  for (const question of questions) {
    const rendered = html(question, { readOnlyCoordinator: true });
    assert.doesNotMatch(rendered, />Allow always<\/button>|>Allow for this session<\/button>/);
    assert.match(rendered, /Coordinator restrictions stay in place/);
  }
  const toolButtons = buttons(controls(questions[1], { readOnlyCoordinator: true }));
  assert.equal(toolButtons[0].props.disabled, true);
  assert.ok(toolButtons.slice(1).every(button => button.props.disabled === false));
});

test('busy controls and native confirmation preserve disabled actions and visible errors/review', () => {
  const question = command({ availableDecisions: ['accept', exec(['npm', 'test']), 'decline', 'cancel'] });
  assert.ok(buttons(controls(question, { busy: true, review() {} })).every(button => button.props.disabled));
  const rendered = card({ ...question, responding: true, error: 'Native answer was not confirmed', review: { decision: 'ask', rationale: 'Request: Run checks.\nConcern: Confirm the target.' } });
  assert.match(rendered, /Waiting for the native agent to confirm resolution/);
  assert.match(rendered, /Native answer was not confirmed/);
  assert.match(rendered, /Request: Run checks\.\nConcern: Confirm the target\./);
  assert.match(rendered, /Ask coordinator to review/);
});

test('filesystem/network permission requests offer exact native turn and session scopes without permanent approvals', async () => {
  const question = { id: 4, method: 'item/permissions/requestApproval', params: { permissions: { fileSystem: { write: ['<requested-path>'] } } } };
  const rendered = card(question);
  assert.match(rendered, />Allow once<\/button>/);
  assert.match(rendered, />Allow for this session<\/button>/);
  assert.match(rendered, /Neither changes global settings/);
  assert.doesNotMatch(rendered, />Allow always<\/button>/);
  const submitted = []; let focused = 0;
  const node = NativePermissionControls({ question, busy: false, submit: async answer => { submitted.push(answer); return true; }, prepareApprovalFocus: () => () => { focused++; } });
  for (const button of buttons(node)) await button.props.onClick();
  assert.deepEqual(submitted, [{ decision: 'accept', scope: 'turn' }, { decision: 'accept', scope: 'session' }, { decision: 'decline' }]);
  assert.equal(focused, 2);
  const coordinator = NativePermissionControls({ question, busy: false, readOnlyCoordinator: true, submit: () => assert.fail('Coordinator cannot grant permissions') });
  assert.ok(buttons(coordinator).slice(0, 2).every(button => button.props.disabled));
  for (const button of buttons(coordinator).slice(0, 2)) await button.props.onClick();
});

test('scope details remain escaped text', () => {
  const rendered = html(command({ proposedExecpolicyAmendment: ['echo', '<script>example()</script>'] }));
  assert.doesNotMatch(rendered, /<script>/);
  assert.match(rendered, /&lt;script&gt;/);
});

test('schema-shaped file requests show Allow once and Allow for this session without inventing Allow always', async () => {
  const question = file({ threadId: 'worker', turnId: 'turn', itemId: 'changes', startedAtMs: 1, grantRoot: '/example/project' });
  const rendered = card(question);
  assert.match(rendered, />Allow once<\/button>/);
  assert.match(rendered, />Allow for this session<\/button>/);
  assert.doesNotMatch(rendered, />Allow always<\/button>/);
  assert.match(rendered, /Requested write root for this session/);
  assert.doesNotMatch(html(question, { readOnlyCoordinator: true }), />Allow for this session<\/button>/);
  const submitted = []; let restored = false;
  const node = controls(question, { submit: async answer => { submitted.push(answer); return true; }, prepareApprovalFocus: () => () => { restored = true; } });
  await buttons(node).find(button => button.props.children === 'Allow for this session').props.onClick();
  assert.deepEqual(submitted, [{ decision: 'acceptForSession' }]); assert.equal(restored, true);
});

test('command and MCP cards expose all three choices when those exact native scopes are offered', () => {
  const questions = [command({ availableDecisions: ['accept', exec(['git', 'status']), 'acceptForSession', 'decline'] }), mcp({ codex_approval_kind: 'mcp_tool_call', persist: ['session', 'always'] })];
  for (const question of questions) {
    const rendered = card(question);
    for (const label of ['Allow once', 'Allow always', 'Allow for this session']) assert.ok(rendered.includes(`>${label}</button>`));
  }
});
test('manual positive approvals restore composer focus only after confirmed native success', async () => {
  const cases = [command({ availableDecisions: ['accept'] }), command({ availableDecisions: [exec(['npm', 'test'])] }), command({ availableDecisions: [network('api.example.com')] }), file({ availableDecisions: ['accept'] }), mcp({ codex_approval_kind: 'mcp_tool_call', persist: 'always' })];
  for (const question of cases) {
    for (const buttonIndex of question.method === 'mcpServer/elicitation/request' ? [0, 1] : [0]) {
      let complete; let captured = 0; let focused = 0;
      const node = controls(question, {
        prepareApprovalFocus: () => { captured++; return () => focused++; },
        submit: () => new Promise(resolve => { complete = resolve; })
      });
      const pending = buttons(node)[buttonIndex].props.onClick();
      assert.equal(captured, 1); assert.equal(focused, 0, 'sending is not confirmation');
      complete(true); await pending;
      assert.equal(focused, 1);
    }
  }
});

test('failed and rejected native answers never return focus', async () => {
  for (const submit of [async () => false, async () => { throw new Error('Native answer failed'); }]) {
    let focused = 0;
    const action = buttons(controls(command({}), { submit, prepareApprovalFocus: () => () => focused++ }))[0];
    await action.props.onClick().catch(error => assert.match(error.message, /Native answer failed/));
    assert.equal(focused, 0);
  }
});

test('decline, cancel, coordinator review and disabled controls do not request composer focus', async () => {
  const captured = () => assert.fail('This action must not request composer focus');
  const actions = buttons(controls(command({}), { submit: async () => true, prepareApprovalFocus: captured, review() {} }));
  for (const action of actions.slice(1)) await action.props.onClick();
  for (const action of buttons(controls(command({}), { busy: true, submit: () => assert.fail('disabled'), prepareApprovalFocus: captured }))) await action.props.onClick();
});

test('approval controls work without a composer callback', async () => {
  let submitted = 0;
  await buttons(controls(command({}), { submit: async () => { submitted++; return true; } }))[0].props.onClick();
  assert.equal(submitted, 1);
});
