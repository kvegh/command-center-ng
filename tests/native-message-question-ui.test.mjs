import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  .replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
const source = await readFile(new URL('../src/native-message-questions.tsx', import.meta.url), 'utf8');
const { NativeMessageQuestions } = await import('data:text/javascript;base64,' + Buffer.from(compile(source)).toString('base64'));
const groupsSource = await readFile(new URL('../src/activity-groups.tsx', import.meta.url), 'utf8');
const { groupMessages, isVisibleMessage } = await import('data:text/javascript;base64,' + Buffer.from(compile(groupsSource)).toString('base64'));
const questions = [
  { title: 'Which test scope should run?', options: ['One test host', 'All selected test hosts'] },
  { title: 'Which release should be checked?', options: ['Current release', 'Previous release'] },
  { title: 'Any additional acceptance criterion?', options: null }
];
const render = props => renderToStaticMarkup(React.createElement(NativeMessageQuestions, props));

test('native titles and options remain visible for an assistant message with empty text', () => {
  const message = { id: 'native-item', turnId: 'native-turn', type: 'assistant', text: '', state: 'completed', timestamp: '2027-01-15T16:45:00.000Z', nativeQuestions: questions };
  const before = structuredClone(message);
  assert.equal(isVisibleMessage(message), true);
  const grouped = groupMessages([message]);
  assert.equal(grouped.length, 1); assert.equal(grouped[0].kind, 'message'); assert.equal(grouped[0].message, message);
  const html = render({ questions: grouped[0].message.nativeQuestions });
  for (const question of questions) {
    assert.ok(html.includes(question.title));
    for (const option of question.options || []) assert.ok(html.includes(option));
  }
  assert.equal((html.match(/<strong>/g) || []).length, 3);
  assert.deepEqual(message, before, 'display does not rewrite text, timestamps or native metadata');
});

test('unsupported native question metadata has an explicit native-client limitation without answer or approval controls', () => {
  const html = render({ questions });
  assert.match(html, /Answer this question in the native Codex client; this format cannot be answered here yet\./);
  assert.match(html, /aria-label="Native Codex questions"/);
  assert.doesNotMatch(html, /<button|<input|<form|<select|Approve|Allow once|questionId|requestId|onclick/i);
  assert.doesNotMatch(source, /fetch\(|api\(|onClick|onSubmit|send\(|localStorage|sessionStorage/);
});

test('null/empty options show the native title without fabricating choices', () => {
  for (const options of [null, []]) {
    const html = render({ questions: [{ title: 'An open native prompt', options }] });
    assert.match(html, /An open native prompt/); assert.doesNotMatch(html, /<ul|Choose an answer|Yes|No/);
  }
});

test('titles and options render as escaped literal text without Markdown or raw HTML interpretation', () => {
  const html = render({ questions: [{ title: '<script>literal title</script>', options: ['<img src=x onerror=alert(1)>', '**literal stars**', '[literal](javascript:alert(1))'] }] });
  assert.match(html, /&lt;script&gt;literal title&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /\*\*literal stars\*\*/);
  assert.doesNotMatch(html, /<script|<img|<a /);
});

test('truncated metadata carries a visible limitation even when no supported title survived', () => {
  for (const selected of [questions, undefined]) {
    const html = render({ questions: selected, truncated: true });
    assert.match(html, /Some native question details were shortened or omitted/);
    assert.match(html, /Review the full details in the native Codex client/);
    if (!selected) assert.doesNotMatch(html, /<ol|<li/);
  }
});

test('ordinary assistant messages get no extra question UI', () => {
  for (const props of [{}, { questions: [] }, { questions: undefined, truncated: false }]) assert.equal(render(props), '');
});

test('main binds only assistant metadata, outside the text guard, while retaining timestamps/copy/native request rendering', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let props, parent;
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'NativeMessageQuestions') {
      props = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => [attribute.name.getText(ast), attribute.initializer?.expression?.getText(ast)]));
      parent = node.parent.getText(ast);
    }
    ts.forEachChild(node, visit);
  }; visit(ast);
  assert.equal(props.questions, 'message.nativeQuestions'); assert.equal(props.truncated, 'message.nativeQuestionsTruncated');
  assert.match(parent, /message.type === 'assistant' &&/);
  assert.doesNotMatch(parent, /message.text/);
  assert.match(main, /\{!!message.text && <Text value=\{message.text\} \/>\}\{message.type === 'assistant' && <NativeMessageQuestions/);
  assert.match(main, /<MessageTime timestamp=\{message.timestamp\} source=\{message.timestampSource\}/);
  assert.match(main, /!!message.text.trim\(\) && <CopyButton text=\{message.text\}/);
  assert.match(main, /active.questions.map\(question => <NativeRequestCard/);
});
