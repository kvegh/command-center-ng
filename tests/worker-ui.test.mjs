import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

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
async function component(name) { return import(await componentUrl(name)); }
const { Markdown } = await component('markdown');
const { copyText } = await component('copy-button');
const { WorkerSettings } = await component('worker-settings');
const { TaskTotals } = await component('task-totals');
const { ChatQuestions } = await component('chat-questions');
const { TaskListViewport, taskViewportHeight } = await component('task-list-viewport');
const { BackgroundRequests } = await component('background-requests');
const { taskInputMessage } = await component('task-discussion');
const { BranchSummaryReview } = await component('branch-summary-review');
const { NativeRequestCard } = await component('native-request-card');
const { OpenQuestions, RequestRecovery, questionTarget } = await component('open-questions');
const { ModelControls } = await component('worker-model-settings');
const { SidebarDivider, sidebarLimits, sidebarSize } = await component('sidebar-divider');
const markdown = value => renderToStaticMarkup(React.createElement(Markdown, { value }));

test('clipboard copy preserves exact text and does not retry after native permission denial', async () => {
  const text = '  systemctl --user status example.service\n\ntrailing spaces  \n';
  const copied = [];
  await copyText(text, { clipboard: { writeText: async value => { copied.push(value); } }, document: null });
  assert.deepEqual(copied, [text]);
  const denial = new Error('Permission denied');
  await assert.rejects(copyText(text, { clipboard: { writeText: async () => { throw denial; } }, document: { get body() { assert.fail('Must not bypass native clipboard rejection'); } } }), error => error === denial);
  await assert.rejects(copyText(text, { clipboard: null, document: null }), /Clipboard unavailable/);
});

test('legacy browser copying cleans up the temporary field and restores focus and selection even on failure', async () => {
  for (const succeeds of [true, false]) {
    const events = [];
    const savedRange = {};
    const field = { style: {}, setAttribute() {}, focus() { events.push('field focus'); }, select() { events.push('select'); }, remove() { events.push('remove'); } };
    const document = {
      body: { appendChild(node) { assert.equal(node, field); events.push('append'); } },
      createElement(tag) { assert.equal(tag, 'textarea'); return field; },
      activeElement: { focus() { events.push('restore focus'); } },
      getSelection() { return { rangeCount: 1, getRangeAt() { return { cloneRange: () => savedRange }; }, removeAllRanges() { events.push('clear selection'); }, addRange(range) { assert.equal(range, savedRange); events.push('restore selection'); } }; },
      execCommand(command) { assert.equal(command, 'copy'); assert.equal(field.value, '  exact\ntext  \n'); events.push('copy'); return succeeds; }
    };
    const result = copyText('  exact\ntext  \n', { clipboard: null, document });
    if (succeeds) await result; else await assert.rejects(result, /Copy failed/);
    assert.deepEqual(events, ['append', 'field focus', 'select', 'copy', 'remove', 'restore focus', 'clear selection', 'restore selection']);
  }
});

test('coordinator concerns retain short labeled lines and the original pending approval controls', () => {
  const rationale = 'Request: Check installed packages.\nConcern: I cannot read the helper functions.\nNext: Let the worker submit a readable check, or decide here.';
  const html = renderToStaticMarkup(React.createElement(NativeRequestCard, { agentId: 'worker', workerName: 'Example project', act: async () => true, question: { id: 1, method: 'item/commandExecution/requestApproval', params: { command: 'python3 check.py' }, review: { decision: 'ask', rationale } } }));
  assert.match(html, /class="field-note coordinator-review"/);
  assert.ok(html.includes(rationale));
  assert.match(html, /Needs your decision/);
  assert.match(html, /Allow once/);
});

test('Markdown renders tables, lists, headings, links, quotes and inline/fenced code', () => {
  const html = markdown('# Status\n\n**Ready** and *checked* with `inline()`\n\n| Work | State |\n| --- | --- |\n| Build | Done |\n\n- [x] Checked\n- [ ] Pending\n\n1. First\n2. Second\n\n> A quoted note\n\n~~Old~~ [Docs](https://example.invalid/docs)\n\n```html\n<div>code only</div>\n```');
  for (const pattern of [/<h1>Status<\/h1>/, /<strong>Ready<\/strong>/, /<em>checked<\/em>/, /<code>inline\(\)<\/code>/, /<table>/, /<th>Work<\/th>/, /<td>Done<\/td>/, /<ul/, /<ol>/, /type="checkbox"/, /<blockquote>/, /<del>Old<\/del>/, /rel="noopener noreferrer"/, /&lt;div&gt;code only&lt;\/div&gt;/]) assert.match(html, pattern);
  assert.match(html, /class="markdown-table"/);
});

test('raw HTML and unsafe links stay inactive, remote Markdown images do not load automatically', () => {
  const html = markdown('<script>window.BAD=true</script>\n\n<iframe src="https://example.invalid"></iframe>\n\n[bad](javascript:alert(1))\n\n![Remote](https://example.invalid/image.png)');
  assert.doesNotMatch(html, /<script|<iframe|javascript:|onerror=|<img/);
  assert.match(html, /href="https:\/\/example.invalid\/image.png"/);
  assert.match(html, />Remote<\/a>/);
  for (const partial of ['| Work | State |\n| --', '**unfinished', '```json\n{"partial":', '<script>']) assert.doesNotThrow(() => markdown(partial));
});

test('each code block copies its own exact content and keeps its control outside the scrolling pre', () => {
  const first = '  systemctl --user status example.service\n\n  printf "done"  \n';
  const second = 'echo second\n  echo indented\n';
  const value = `Inline \`keep_inline()\`\n\n\`\`\`bash\n${first}\`\`\`\n\n    echo second\n      echo indented\n`;
  const rendered = Markdown({ value }).props.children;
  const original = rendered.props.components.pre;
  const targets = [];
  const observed = React.cloneElement(rendered, { components: { ...rendered.props.components, pre: props => {
    const block = original(props);
    const [actions, pre] = block.props.children;
    targets.push(actions.props.children.props.text);
    assert.equal(pre.type, 'pre');
    assert.equal(actions.props.children.props.label, 'Copy code');
    assert.equal(actions.props.children.props.compact, true);
    return block;
  } } });
  const html = renderToStaticMarkup(observed);
  assert.deepEqual(targets, [first, second]);
  assert.equal((html.match(/class="markdown-code-block"/g) || []).length, 2);
  assert.equal((html.match(/class="markdown-code-actions"/g) || []).length, 2);
  assert.match(html, /<code>keep_inline\(\)<\/code>/);
  for (const pre of html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g)) assert.doesNotMatch(pre[1], /<button|Copy code/);
  assert.match(html, /<pre><code class="language-bash">  systemctl --user status example.service\n\n  printf &quot;done&quot;  \n<\/code><\/pre>/);
});

test('inline code has no block copy control', () => {
  const html = markdown('Use `systemctl --user status example.service`.');
  assert.match(html, /<code>systemctl --user status example.service<\/code>/);
  assert.doesNotMatch(html, /markdown-code-block|markdown-code-actions|<button/);
});

test('worker settings say every once and use four independently named radio choices', () => {
  const props = { agentId: 'one', disabled: false, paused: false, save: async () => true, reportNow: async () => true };
  const html = renderToStaticMarkup(React.createElement(WorkerSettings, props));
  assert.match(html, /Worker specific settings/); assert.match(html, /<legend>Task report every<\/legend>/);
  assert.equal((html.match(/every/g) || []).length, 1);
  assert.equal((html.match(/type="radio"/g) || []).length, 4);
  for (const label of ['1h', '15min', '5min', 'Never']) assert.match(html, new RegExp(`>${label}<`));
  assert.match(html, /checked="" value="0"|value="0" checked=""/);
  const other = renderToStaticMarkup(React.createElement(WorkerSettings, { ...props, agentId: 'two', minutes: 15 }));
  assert.match(html, /name="report-interval-one"/); assert.match(other, /name="report-interval-two"/);
});

test('task totals expose meaningful progress/input/queued counts without the old preview fraction', () => {
  const html = renderToStaticMarkup(React.createElement(TaskTotals, { total: 10, counts: { inProgress: 3, needsInput: 5, queued: 2, open: 0, deferred: 0, other: 0 } }));
  for (const label of ['10 total', '3 in progress', '5 need input', '2 queued']) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /3\s*\/\s*10/);
});

test('task answers keep automatic context separate from user input and clarification does not authorize project work', () => {
  const task = { id: 'sample-1', text: 'Choose the deployment option' };
  const answer = taskInputMessage(task, '  Use the approved test target.  ');
  assert.match(answer, /context only, not an instruction/); assert.ok(answer.includes(task.id) && answer.includes(task.text));
  assert.match(answer, /My answer\/input: Use the approved test target\./);
  const clarify = taskInputMessage(task, '', true);
  assert.match(clarify, /clarification request only/); assert.match(clarify, /do not perform additional project work/);
});

test('branch summary reviews are nonmodal, hidden outside their own tab and independently identify their editor and parent', () => {
  const props = { agent: { id: 'branch-one', name: 'First branch' }, visible: true, connected: true, parentName: 'Main project', prepare: async () => ({ text: 'Reviewed result' }), deliver: async () => ({ id: 'parent' }), openParent: async () => {}, dismiss() {}, returned() {} };
  const first = renderToStaticMarkup(React.createElement(BranchSummaryReview, props));
  assert.doesNotMatch(first, /<dialog|aria-modal|inert|autofocus/i);
  assert.match(first, /<section class="return-dialog branch-summary-review"/);
  assert.match(first, /Summary for Main project/);
  assert.match(first, /id="branch-findings-branch-one"/);
  assert.match(first, /You can switch tabs; your edits stay here/);
  const other = renderToStaticMarkup(React.createElement(BranchSummaryReview, { ...props, agent: { id: 'branch-two', name: 'Other branch' }, visible: false }));
  assert.match(other, /<section hidden=""/);
  assert.match(other, /id="branch-findings-branch-two"/);
});

test('worker report settings expose queued and generating states without the old idle wording', () => {
  const props = { agentId: 'queued-worker', minutes: 5, disabled: false, paused: false, save: async () => true, reportNow: async () => true };
  const queued = renderToStaticMarkup(React.createElement(WorkerSettings, { ...props, reportState: 'queued' }));
  assert.match(queued, /Report queued/); assert.match(queued, /current work and questions/);
  assert.doesNotMatch(queued, /Reports wait for idle/);
  const generating = renderToStaticMarkup(React.createElement(WorkerSettings, { ...props, reportState: 'generating' }));
  assert.match(generating, /Generating task report/);
  const setting = renderToStaticMarkup(React.createElement(WorkerSettings, { ...props, minutes: 0, settingPending: true }));
  assert.match(setting, /Reporting instruction queued/);
  const selected = renderToStaticMarkup(React.createElement(WorkerSettings, props));
  assert.match(selected, /agent handles this interval/); assert.match(selected, /no recurring reminders/);
});

test('native requests identify the worker and render permission, MCP form, external and unsupported controls faithfully', () => {
  const props = { agentId: 'worker', workerName: 'Example project', act: async () => true };
  const render = question => renderToStaticMarkup(React.createElement(NativeRequestCard, { ...props, question }));
  const permission = render({ id: 1, method: 'item/permissions/requestApproval', params: { reason: 'Read the selected fixture', permissions: { fileSystem: { read: ['/example/project'], write: null }, network: null } } });
  assert.match(permission, /Permission request.*Example project/);
  assert.match(permission, /Allow requested access for this turn/); assert.match(permission, /\/example\/project/);
  assert.doesNotMatch(permission, /native Codex client|Ask coordinator/);
  const form = render({ id: 'mcp', method: 'mcpServer/elicitation/request', params: { mode: 'form', serverName: 'Example connector', message: 'Choose a permitted action', requestedSchema: { type: 'object', properties: { decision: { type: 'string', oneOf: [{ const: 'once', title: 'Allow once' }, { const: 'deny', title: 'Decline' }] } }, required: ['decision'] } } });
  assert.match(form, /Example connector/); assert.match(form, /<select/); assert.match(form, /Allow once/); assert.match(form, /Submit response/);
  const external = render({ id: 2, method: 'mcpServer/elicitation/request', params: { mode: 'url', message: 'Sign in', url: 'https://example.invalid/login' } });
  assert.match(external, /Open external page/); assert.match(external, /noopener noreferrer/); assert.match(external, /I completed this step/);
  const unsafe = render({ id: 3, method: 'mcpServer/elicitation/request', params: { mode: 'url', url: 'javascript:alert(1)' } });
  assert.doesNotMatch(unsafe, /href=|I completed this step/);
  const unknown = render({ id: 4, method: 'item/future/requestApproval', params: { reason: 'Future operation' } });
  assert.match(unknown, /Unsupported native request/); assert.match(unknown, /has not been declined or dismissed/); assert.doesNotMatch(unknown, /<button/);
});

test('Report now follows Never and keeps the report cadence as four radio choices', () => {
  const html = renderToStaticMarkup(React.createElement(WorkerSettings, { agentId: 'manual-worker', disabled: false, paused: false, minutes: 0, save: async () => true, reportNow: async () => true }));
  assert.match(html, /Never<\/span><\/label><button[^>]+>Report now<\/button>/);
  assert.equal((html.match(/type="radio"/g) || []).length, 4);
});

test('model controls render only native catalog models and efforts for the selected model', () => {
  const models = [{ model: 'first', displayName: 'First native model', description: '', defaultEffort: 'low', efforts: [{ value: 'low', description: 'Lower effort' }, { value: 'high', description: 'Higher effort' }] }, { model: 'second', displayName: 'Second native model', description: '', defaultEffort: 'medium', efforts: [{ value: 'medium', description: 'Middle effort' }] }];
  const html = renderToStaticMarkup(React.createElement(ModelControls, { models, model: 'second', effort: 'medium', disabled: false, chooseModel() {}, chooseEffort() {} }));
  assert.match(html, /First native model/); assert.match(html, /Second native model/); assert.match(html, /Worker reasoning effort/);
  assert.match(html, /value="medium"/); assert.doesNotMatch(html, /value="low"|value="high"/);
});

test('sidebar sizing bounds retain usable chat space and expose an accessible separator', () => {
  assert.deepEqual(sidebarLimits(1200), { min: 280, max: 800 });
  assert.equal(sidebarSize(900, 1000), 640); assert.equal(sidebarSize(100, 1200), 280);
  const html = renderToStaticMarkup(React.createElement(SidebarDivider, { width: 420, panelWidth: 1200, change() {} }));
  assert.match(html, /role="separator"/); assert.match(html, /aria-orientation="vertical"/); assert.match(html, /aria-valuenow="420"/); assert.match(html, /tabindex="0"/);
});


test('chat-question cards keep exact worker/task identity separate from native approval controls', () => {
  const questions = [
    { id: 'decision-one', workerId: 'alpha', text: 'Choose the backup interval', state: 'blocked' },
    { id: 'decision-two', workerId: 'beta', text: 'Other worker decision', state: 'blocked' },
    { id: 'decision-closed', workerId: 'alpha', text: 'Already answered', state: 'closed' }
  ];
  const html = renderToStaticMarkup(React.createElement(ChatQuestions, { agentId: 'alpha', questions, reply() {} }));
  assert.match(html, /CHAT QUESTIONS/); assert.match(html, /1 recorded chat questions/);
  assert.match(html, /Choose the backup interval/); assert.match(html, /Read context and reply/);
  assert.match(html, /worker resolves the question after processing your answer/);
  assert.doesNotMatch(html, /Other worker decision|Already answered|Approve|Decline|ccng-question-/);
  const empty = renderToStaticMarkup(React.createElement(ChatQuestions, { agentId: 'unknown-worker', questions, reply() {} }));
  assert.equal(empty, '');
});


test('provider request routing resets answer state for the exact worker, typed request ID and method', () => {
  const props = { agentId: 'claude-worker-one', workerName: 'Local Claude project', act: async () => true };
  const question = { id: 1, method: 'claude/tool/requestApproval', params: { toolName: 'Bash', input: { command: 'read project state' } } };
  const first = NativeRequestCard({ ...props, question });
  const anotherWorker = NativeRequestCard({ ...props, agentId: 'claude-worker-two', question });
  const anotherType = NativeRequestCard({ ...props, question: { ...question, id: '1' } });
  const native = NativeRequestCard({ ...props, question: { ...question, method: 'item/commandExecution/requestApproval' } });
  assert.notEqual(first.key, anotherWorker.key); assert.notEqual(first.key, anotherType.key); assert.notEqual(first.type, native.type);
  const html = renderToStaticMarkup(React.createElement(NativeRequestCard, { ...props, question }));
  assert.ok(html.includes(questionTarget(props.agentId, 1))); assert.match(html, /Claude tool approval.*Local Claude project/);
  assert.match(html, /Allow once/); assert.match(html, /Decline/); assert.match(html, /No persistent permission rule/);
  assert.doesNotMatch(html, /Ask coordinator to review|native Codex client/);
  const pending = renderToStaticMarkup(React.createElement(NativeRequestCard, { ...props, question: { ...question, responding: true } }));
  assert.match(pending, /Waiting for Claude/); assert.match(pending, /disabled=""[^>]*>Allow once/);
  const restricted = renderToStaticMarkup(React.createElement(NativeRequestCard, { ...props, question, readOnlyCoordinator: true }));
  assert.match(restricted, /disabled=""[^>]*>Allow once/);
});

test('Claude clarification cards show choices and preserve unsupported native question formats without approving them', () => {
  const props = { agentId: 'claude-worker', workerName: 'Local Claude project', act: async () => true };
  const question = { id: 'choice', method: 'claude/tool/requestUserInput', params: { input: { questions: [{ question: 'Choose the target', multiSelect: true, options: [{ label: 'Read, then verify', description: 'Inspect the approved target' }, { label: 'Read only' }] }] } } };
  const html = renderToStaticMarkup(React.createElement(NativeRequestCard, { ...props, question }));
  assert.match(html, /Choose the target/); assert.match(html, /Read, then verify/); assert.match(html, /aria-pressed="false"/);
  assert.match(html, /maxLength="8000"|maxlength="8000"/); assert.match(html, /disabled=""[^>]*>Send answer/);
  assert.doesNotMatch(html, />Allow once</);
  for (const questions of [null, { question: 'Invalid object' }, [{ question: '__proto__' }], [{ question: 'Duplicate' }, { question: 'Duplicate' }], [{ question: 'Bad options', options: {} }]]) {
    const unsupported = renderToStaticMarkup(React.createElement(NativeRequestCard, { ...props, question: { ...question, params: { input: { questions } } } }));
    assert.match(unsupported, /request stays open; decline it here or use Interrupt/); assert.doesNotMatch(unsupported, /Send answer/);
  }
});

test('Claude MCP and sidebar controls retain provider identity and supported manual response shapes', () => {
  const props = { agentId: 'claude-worker', workerName: 'Local Claude project', act: async () => true };
  const question = { id: 'mcp', method: 'claude/mcp/elicitation/request', params: { mode: 'form', requestedSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['inspect'] } }, required: ['mode'] } } };
  const form = renderToStaticMarkup(React.createElement(NativeRequestCard, { ...props, question }));
  assert.match(form, /MCP form.*Local Claude project/); assert.match(form, /value="inspect"/); assert.match(form, /Submit response/);
  const unsupported = renderToStaticMarkup(React.createElement(NativeRequestCard, { ...props, question: { ...question, params: { mode: 'form', requestedSchema: { type: 'string' } } } }));
  assert.match(unsupported, /decline or cancel it here/); assert.doesNotMatch(unsupported, /complete this exact request in the native client/);
  const input = { id: 'ask', method: 'claude/tool/requestUserInput', params: { input: { questions: [{ question: 'First decision' }, { question: 'Second decision' }] } } };
  const sidebar = renderToStaticMarkup(React.createElement(OpenQuestions, { agentId: props.agentId, questions: [question, input], attention: true, provider: 'claude' }));
  assert.match(sidebar, /3 open questions/); assert.match(sidebar, /First decision/); assert.match(sidebar, /Second decision/);
  const recovery = renderToStaticMarkup(React.createElement(RequestRecovery, { recovering: false, disabled: false, provider: 'claude', recover: async () => ({}) }));
  assert.match(recovery, /Claude is waiting for your response/); assert.match(recovery, /Refresh request details/); assert.doesNotMatch(recovery, /Codex is waiting/);
  const missing = renderToStaticMarkup(React.createElement(OpenQuestions, { agentId: props.agentId, questions: [], attention: true, provider: 'claude' }));
  assert.match(missing, /request details have not arrived/); assert.doesNotMatch(missing, /Codex reports|native client/);
});


test('task viewport follows the natural heights of at most the first three rows as text reflows', () => {
  assert.equal(taskViewportHeight([19, 38, 19, 50], 6), 88);
  assert.equal(taskViewportHeight([19, 19, 19, 50], 6), 69, 'one-line titles shrink the viewport');
  assert.equal(taskViewportHeight([19], 6), 19, 'one task does not reserve three task slots');
  assert.equal(taskViewportHeight([], 6), 0);
  const html = renderToStaticMarkup(React.createElement(TaskListViewport, null, React.createElement('div', { className: 'task-row' }, 'Natural task row')));
  assert.match(html, /role="region"/); assert.match(html, /aria-label="Linked tasks"/); assert.match(html, /Natural task row/);
});

test('model controls keep concise labels and omit routine effort descriptions', () => {
  const models = [{ model: 'first', displayName: 'First native model', description: '', defaultEffort: 'high', efforts: [{ value: 'high', description: 'Routine effort explanation' }] }];
  const html = renderToStaticMarkup(React.createElement(ModelControls, { models, model: 'first', effort: 'high', disabled: false, chooseModel() {}, chooseEffort() {} }));
  assert.match(html, /<span>Model<\/span><select/); assert.match(html, /<span>Effort<\/span><select/);
  assert.match(html, /aria-label="Worker reasoning effort"/); assert.doesNotMatch(html, /Routine effort explanation|field-note/);
});


test('closed-tab pending requests stay explicit and only offer opening the exact conversation', () => {
  const workers = [{ id: 'closed-claude', name: 'Claude project', provider: 'claude', questionCount: 2 }, { id: 'closed-codex', name: 'Codex project', provider: 'codex', questionCount: 1 }];
  const html = renderToStaticMarkup(React.createElement(BackgroundRequests, { workers, available: provider => provider === 'claude', opening: false, full: false, open() {} }));
  assert.match(html, /Requests in closed tabs/); assert.match(html, /Claude project/); assert.match(html, /2 pending/); assert.match(html, /Codex project/);
  assert.match(html, /aria-label="Open Claude project to review pending requests"/);
  assert.match(html, /disabled=""[^>]*aria-label="Open Codex project/);
  assert.doesNotMatch(html, /Allow once|Decline|Submit response/);
  const empty = renderToStaticMarkup(React.createElement(BackgroundRequests, { workers: [], available: () => true, opening: false, full: false, open() {} }));
  assert.equal(empty, '');
});
