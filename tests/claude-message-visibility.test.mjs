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
  let compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React
  } }).outputText;
  for (const match of [...compiled.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const pkg = match[1];
    const url = pkg.startsWith('./') ? await componentUrl(pkg.slice(2)) : pathToFileURL(require.resolve(pkg)).href;
    compiled = compiled.replace(match[0], `from '${url}'`);
  }
  return 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64');
}

const { Markdown } = await import(await componentUrl('markdown'));
const render = (value, props = {}) => renderToStaticMarkup(React.createElement(Markdown, { value, ...props }));
const renderUser = value => render(value, { preserveHtmlText: true });

test('user task-notification markup and its contents stay visible as literal text', () => {
  const value = '<task-notification>\n<task-id>example-task</task-id>\n<summary>Finished the review.</summary>\n</task-notification>';
  const html = renderUser(value);
  assert.match(html, /&lt;task-notification&gt;/);
  assert.match(html, /&lt;task-id&gt;example-task&lt;\/task-id&gt;/);
  assert.match(html, /&lt;summary&gt;Finished the review\.&lt;\/summary&gt;/);
  assert.match(html, /&lt;\/task-notification&gt;/);
  assert.doesNotMatch(html, /<task-notification|<task-id|<summary/);
});

test('genuine user HTML pastes remain readable without interpreting the tags', () => {
  const html = renderUser('<p>This is my input.</p>\n\nPlease preserve <custom-tag>these words</custom-tag>.');
  assert.match(html, /&lt;p&gt;This is my input\.&lt;\/p&gt;/);
  assert.match(html, /Please preserve &lt;custom-tag&gt;these words&lt;\/custom-tag&gt;\./);
  assert.doesNotMatch(html, /<custom-tag>|<p>This is my input/);
});

test('raw script, iframe, image and event attributes are escaped in user messages', () => {
  const value = '<script>alert("example")</script>\n\n<iframe src="https://example.invalid"></iframe>\n\n<img src="x" onerror="alert(1)">\n\n<a href="javascript:alert(1)" onclick="alert(2)">text</a>';
  const html = renderUser(value);
  for (const tag of ['script', 'iframe', 'img', 'a']) assert.ok(html.includes(`&lt;${tag}`));
  assert.match(html, /onerror=&quot;alert\(1\)&quot;/);
  assert.match(html, /onclick=&quot;alert\(2\)&quot;/);
  assert.doesNotMatch(html, /<(?:script|iframe|img|a)\b/i);
});

test('user Markdown still renders prose, quotes, code, tables and safe links', () => {
  const value = 'First line\nSecond line\n\n**Visible** `inline`\n\n> Quoted\n\n| Task | State |\n| --- | --- |\n| Review | Done |\n\n[Docs](https://example.invalid/docs)\n\n```xml\n<sample>code</sample>\n```';
  const html = renderUser(value);
  for (const pattern of [/<p>First line\nSecond line<\/p>/, /<strong>Visible<\/strong>/, /<code>inline<\/code>/, /<blockquote>/, /<table>/, /<td>Done<\/td>/, /rel="noopener noreferrer"/, /&lt;sample&gt;code&lt;\/sample&gt;/, /Copy code/]) assert.match(html, pattern);
  assert.equal(html, render(value));
});

test('unsafe Markdown links and remote images remain inactive in user messages', () => {
  const html = renderUser('[bad](javascript:alert(1))\n\n![Remote](https://example.invalid/image.png)');
  assert.doesNotMatch(html, /javascript:|<img\b/);
  assert.match(html, /href="https:\/\/example.invalid\/image.png"/);
  assert.match(html, />Remote<\/a>/);
});

test('default assistant policy still omits raw HTML and keeps ordinary prose', () => {
  const value = '<p>HTML text</p>\n\nOrdinary reply.';
  const html = render(value);
  assert.doesNotMatch(html, /HTML text|&lt;p&gt;/);
  assert.match(html, /<p>Ordinary reply\.<\/p>/);
  assert.equal(html, render(value, { preserveHtmlText: false }));
});

test('preserving raw HTML text leaves the original input and code-copy contents intact', () => {
  const code = '  <sample>keep exact spacing</sample>  \n';
  const value = `<p>Original text</p>\n\n\`\`\`xml\n${code}\`\`\``;
  const rendered = Markdown({ value, preserveHtmlText: true }).props.children;
  const originalPre = rendered.props.components.pre;
  const copyTargets = [];
  const observed = React.cloneElement(rendered, { components: { ...rendered.props.components, pre: props => {
    const block = originalPre(props);
    copyTargets.push(block.props.children[0].props.children.props.text);
    return block;
  } } });
  renderToStaticMarkup(observed);
  assert.equal(rendered.props.children, value);
  assert.deepEqual(copyTargets, [code]);
});

test('actual MessageText integration preserves only user markup, including structured answers', async () => {
  // Load the real routing functions without mounting App or starting its browser effects.
  const mainSource = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('main.tsx', mainSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = parsed.statements.filter(statement => ts.isFunctionDeclaration(statement)
    && ['Text', 'MessageText'].includes(statement.name?.text)).map(statement => statement.getText(parsed));
  assert.equal(functions.length, 2);
  const compiled = ts.transpileModule(functions.join('\n') + '\nexport { MessageText };', { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React
  } }).outputText;
  const moduleSource = `import React from '${pathToFileURL(require.resolve('react')).href}';\nimport { Markdown } from '${await componentUrl('markdown')}';\n${compiled}`;
  const { MessageText } = await import('data:text/javascript;base64,' + Buffer.from(moduleSource).toString('base64'));
  const message = { type: 'user', text: '<task-notification>Visible source</task-notification>' };
  const before = structuredClone(message);
  const renderMessage = message => renderToStaticMarkup(React.createElement(MessageText, { message }));
  assert.match(renderMessage(message), /&lt;task-notification&gt;Visible source&lt;\/task-notification&gt;/);
  assert.deepEqual(message, before);
  for (const type of ['assistant', 'activity']) assert.equal(renderMessage({ ...message, type }), render(message.text));
  const answers = renderMessage({ ...message, nativeQuestionReplies: [{ question: 'Which <format>?', answer: '<p>My answer</p>' }] });
  assert.match(answers, /<blockquote>Which &lt;format&gt;\?<\/blockquote>/);
  assert.match(answers, /&lt;p&gt;My answer&lt;\/p&gt;/);
  const question = { type: 'activity', state: 'completed', text: 'Original native tool text', nativeQuestionTranscript: {
    questions: ['Keep <existing> settings?', 'Which next step?'], result: 'User answered: **Keep them**.\n<script>literal native output</script>'
  } };
  const original = structuredClone(question), html = renderMessage(question);
  assert.match(html, /aria-label="Question and response"/);
  assert.match(html, /<blockquote>Keep &lt;existing&gt; settings\?<\/blockquote>/);
  assert.match(html, /Which next step\?/);
  assert.match(html, /<strong>Keep them<\/strong>/);
  assert.match(html, /&lt;script&gt;literal native output&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|<form|<input|<textarea|Send answer|Original native tool text/);
  assert.deepEqual(question, original, 'visible native output retains original copy and provenance');
  assert.match(renderMessage({ ...question, state: 'failed' }), /Question response failed/);
  assert.match(renderMessage({ ...question, nativeQuestionTranscript: { questions: ['Keep settings?'], result: '' } }), /Claude returned no response text/);
});
