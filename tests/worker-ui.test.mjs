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
const { WorkerSettings } = await component('worker-settings');
const { TaskTotals } = await component('task-totals');
const { taskInputMessage } = await component('task-discussion');
const { BranchSummaryReview } = await component('branch-summary-review');
const { NativeRequestCard } = await component('native-request-card');
const markdown = value => renderToStaticMarkup(React.createElement(Markdown, { value }));

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
