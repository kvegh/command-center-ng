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
const { NativeMessageQuestions, NativeMessageQuestionItem } = await import('data:text/javascript;base64,' + Buffer.from(compile(source)).toString('base64'));
const groupsSource = await readFile(new URL('../src/activity-groups.tsx', import.meta.url), 'utf8');
const { groupMessages, isVisibleMessage } = await import('data:text/javascript;base64,' + Buffer.from(compile(groupsSource)).toString('base64'));
const handoffSource = await readFile(new URL('../src/branch-handoff.tsx', import.meta.url), 'utf8');
const { branchDraftLocked } = await import('data:text/javascript;base64,' + Buffer.from(compile(handoffSource)).toString('base64'));
const questions = [
  { title: 'Which test scope should run?', options: ['One test host', 'All selected test hosts'] },
  { title: 'Which release should be checked?', options: ['Current release', 'Previous release'] },
  { title: 'Any additional acceptance criterion?', options: null }
];
const render = props => renderToStaticMarkup(React.createElement(NativeMessageQuestions, props));
function descendants(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => descendants(child, predicate))];
}
const available = (index = 0) => ({ title: 'Choose the scope', options: ['One test', 'All selected tests'], questionIndex: index, answerState: 'available' });
function itemFixture(props = {}, draft) {
  let element;
  function Capture() {
    element = NativeMessageQuestionItem({ question: available(), supported: true, ...props });
    const input = descendants(element, node => node.type === 'textarea')[0];
    if (input && draft !== undefined && input.props.value !== draft) input.props.onChange({ target: { value: draft } });
    return null;
  }
  renderToStaticMarkup(React.createElement(Capture));
  return { element, html: renderToStaticMarkup(element) };
}

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

test('unsupported or unbound native metadata remains read-only without answer or approval controls', () => {
  const html = render({ questions });
  assert.match(html, /This question is read-only here. Review its current state in the native Codex client\./);
  assert.match(html, /aria-label="Native Codex questions"/);
  assert.doesNotMatch(html, /<button|<input|<form|<select|Approve|Allow once|questionId|requestId|onclick/i);
  assert.doesNotMatch(source, /fetch\(|api\(|localStorage|sessionStorage/);
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

test('each live question has its own explicit option/free-text form without default answers', () => {
  const calls = [], props = { agentId: 'worker-a', messageId: 'message-a', questions: [available(2), { ...available(5), options: null }], answer: async (...args) => { calls.push(args); return { accepted: true }; } };
  const html = render(props);
  assert.equal((html.match(/<form /g) || []).length, 2); assert.equal((html.match(/>Send answer<\/button>/g) || []).length, 2);
  assert.equal((html.match(/<textarea/g) || []).length, 2); assert.match(html, /maxLength="30000"|maxlength="30000"/);
  assert.doesNotMatch(html, /aria-pressed="true"/); assert.deepEqual(calls, []);
  const { element } = itemFixture({ answer: props.answer });
  for (const choice of descendants(element, node => node.type === 'button' && node.props.type === 'button')) choice.props.onClick();
  assert.deepEqual(calls, [], 'choosing an option fills a draft without sending it');
  assert.ok(descendants(element, node => node.type === 'button' && node.props.type === 'submit')[0].props.disabled);
});

test('explicit answer submission preserves original index and exact text and prevents duplicate sends', async () => {
  const calls = []; let resolve;
  const answer = (...args) => { calls.push(args); return new Promise(done => { resolve = done; }); };
  const text = '  Exact answer\nwith intentional spaces  ';
  const { element } = itemFixture({ question: available(5), answer }, text);
  const form = descendants(element, node => node.type === 'form')[0], event = { preventDefault() {} };
  const first = form.props.onSubmit(event); await form.props.onSubmit(event);
  assert.deepEqual(calls, [[5, text]]);
  resolve({ accepted: true, turnId: 'same-native-turn' }); await first;
  await form.props.onSubmit(event); assert.equal(calls.length, 1, 'accepted native input is not resent');
});

test('unconfirmed transport errors lock the editor while definite preflight rejection permits only explicit retry', async () => {
  for (const [code, status, attempts] of [['async_question_delivery_unconfirmed', 400, 1], [undefined, undefined, 1], ['invalid_async_question_answer', 400, 2], ['async_question_not_current', 409, 2], [undefined, 413, 2], ['async_question_delivery_unconfirmed', 413, 1]]) {
    const calls = [], error = Object.assign(new Error('Native request result'), { code, status });
    const { element } = itemFixture({ answer: async (...args) => { calls.push(args); throw error; } }, 'Keep this answer');
    const form = descendants(element, node => node.type === 'form')[0];
    await form.props.onSubmit({ preventDefault() {} }); assert.equal(calls.length, 1, 'failure never starts an automatic retry');
    await form.props.onSubmit({ preventDefault() {} });
    assert.equal(calls.length, attempts);
  }
});

test('read-only, truncated, historical and accepted states never expose answer controls or claim resolution', () => {
  for (const state of ['submitted', 'submitting', 'unconfirmed', 'read-only', undefined]) {
    const html = render({ agentId: 'worker', messageId: 'message', questions: [{ ...available(), answerState: state, answerNotice: 'Native turn ended; this question is historical.' }], answer: () => assert.fail('Rendering cannot send') });
    assert.doesNotMatch(html, /<form|<textarea|Send answer/);
    if (state === 'submitted') assert.match(html, /accepted the answer as input.*does not confirm/);
    if (state === 'unconfirmed') assert.match(html, /delivery is unconfirmed.*will not resend it automatically/);
  }
  for (const changes of [{ truncated: true }, { agentId: undefined }, { messageId: undefined }, { answer: undefined }]) {
    const html = render({ agentId: 'worker', messageId: 'message', questions: [available()], answer: async () => ({ accepted: true }), ...changes });
    assert.doesNotMatch(html, /<form|<textarea|Send answer/);
  }
});

test('parent request, handoff and connection gates block sends while preserving editable answer drafts', async () => {
  for (const disabledReason of ['Reconnect to Codex.', 'Answer the current approval.', 'Branch hand back is active.']) {
    const { element, html } = itemFixture({ disabledReason, answer: () => assert.fail('Gate must block the answer') }, 'Prepared answer');
    assert.match(html, /Prepared answer/); assert.ok(html.includes(disabledReason));
    assert.equal(descendants(element, node => node.type === 'textarea')[0].props.disabled, false);
    assert.equal(descendants(element, node => node.type === 'button' && node.props.type === 'submit')[0].props.disabled, true);
    await descendants(element, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  }
});

test('a retiring or uncertain question retains its local answer text without a retry editor', () => {
  for (const answerState of ['read-only', 'unconfirmed']) {
    let element;
    function Capture() {
      const [retired, setRetired] = React.useState(false);
      element = NativeMessageQuestionItem({ question: { ...available(), answerState: retired ? answerState : 'available' }, supported: true, answer: () => assert.fail('Retirement cannot send') });
      if (!retired) {
        descendants(element, node => node.type === 'textarea')[0].props.onChange({ target: { value: 'Retain this local answer' } });
        setRetired(true);
      }
      return null;
    }
    renderToStaticMarkup(React.createElement(Capture));
    const html = renderToStaticMarkup(element);
    assert.match(html, /answer text is retained in this tab/); assert.match(html, /Retain this local answer/);
    assert.doesNotMatch(html, /<form|<textarea|Send answer|unsent/);
  }
});

test('partial answers and filtered metadata retain original per-chat question identity', () => {
  const props = { agentId: 'worker-a', messageId: 'message-a', questions: [available(2), available(5)], answer: async () => ({ accepted: true }) };
  const items = value => descendants(NativeMessageQuestions(value), node => node.type === NativeMessageQuestionItem);
  const before = items(props), partial = items({ ...props, questions: [{ ...available(2), answerState: 'submitted' }, available(5)] });
  assert.equal(before[1].key, partial[1].key, 'answering another question cannot remount this draft');
  assert.equal(before[1].key, items({ ...props, questions: [available(5)] })[0].key, 'filtered display order cannot renumber native index');
  assert.notEqual(before[1].key, items({ ...props, agentId: 'worker-b' })[1].key);
  assert.notEqual(before[1].key, items({ ...props, messageId: 'message-b' })[1].key);
});

test('App-owned question drafts and delivery state survive unmounts, chat switches and partial answers', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let change;
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'NativeMessageQuestions') change = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'changeInput').initializer.expression.getText(ast);
    ts.forEachChild(node, visit);
  }; visit(ast);
  let inputs = {};
  const compiledChange = ts.transpileModule(`return (${change});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const changeInput = new Function('setMessageQuestionInputs', compiledChange)(update => { inputs = update(inputs); });
  const calls = [], composer = { text: 'Keep the ordinary draft', images: [{ id: 'ordinary-image' }] };
  const mount = (agentId, questionIndex, answer = async (...args) => { calls.push([agentId, ...args]); return { accepted: true }; }) => {
    const group = NativeMessageQuestions({ agentId, messageId: 'shared-message-id', questions: [available(questionIndex)], inputs, changeInput, answer });
    return itemFixture(descendants(group, node => node.type === NativeMessageQuestionItem)[0].props);
  };
  const type = (fixture, value) => descendants(fixture.element, node => node.type === 'textarea')[0].props.onChange({ target: { value } });
  type(mount('worker-a', 2), 'First answer draft');
  type(mount('worker-a', 5), 'Second answer draft');
  type(mount('worker-b', 2), 'Other chat draft');
  assert.match(mount('worker-a', 2).html, /First answer draft/);
  assert.match(mount('worker-a', 5).html, /Second answer draft/);
  assert.match(mount('worker-b', 2).html, /Other chat draft/);
  type(mount('worker-c', 2), 'Pending answer draft');
  let finish;
  const pending = mount('worker-c', 2, () => new Promise(resolve => { finish = resolve; }));
  const pendingSend = descendants(pending.element, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  const switchedBack = mount('worker-c', 2, () => assert.fail('A remount cannot duplicate an in-flight answer'));
  assert.match(switchedBack.html, /answer is being sent/); assert.match(switchedBack.html, /Pending answer draft/);
  assert.doesNotMatch(switchedBack.html, /<form|Send answer/);
  finish({ accepted: true }); await pendingSend;
  assert.match(mount('worker-c', 2).html, /accepted the answer as input/);
  await descendants(mount('worker-a', 2).element, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls, [['worker-a', 2, 'First answer draft']]);
  assert.doesNotMatch(mount('worker-a', 2).html, /<form|<textarea/);
  assert.match(mount('worker-a', 5).html, /Second answer draft/);
  assert.match(mount('worker-b', 2).html, /Other chat draft/);
  const uncertain = mount('worker-b', 2, async () => { throw new Error('Connection lost before confirmation.'); });
  await descendants(uncertain.element, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  const returned = mount('worker-b', 2, () => assert.fail('A remount cannot retry an uncertain answer'));
  assert.match(returned.html, /delivery is unconfirmed/); assert.match(returned.html, /Connection lost before confirmation/); assert.match(returned.html, /Other chat draft/);
  assert.doesNotMatch(returned.html, /<form|<textarea|Send answer/);
  const confirmed = itemFixture({ question: { ...available(2), answerState: 'submitted' }, supported: true, input: inputs[JSON.stringify(['worker-b', 'shared-message-id', 2])] });
  assert.match(confirmed.html, /accepted the answer as input/); assert.doesNotMatch(confirmed.html, /Connection lost before confirmation|delivery is unconfirmed/);
  descendants(returned.element, node => node.type === 'button' && node.props.children === 'Discard retained text')[0].props.onClick();
  const discarded = mount('worker-b', 2, () => assert.fail('Discarding text cannot resend an uncertain answer'));
  assert.doesNotMatch(discarded.html, /Other chat draft|Discard retained text|<form|Send answer/);
  assert.match(discarded.html, /delivery is unconfirmed/);
  assert.equal(inputs[JSON.stringify(['worker-b', 'shared-message-id', 2])].delivery, 'unconfirmed', 'discard clears only text, not native delivery protection');
  assert.deepEqual(composer, { text: 'Keep the ordinary draft', images: [{ id: 'ordinary-image' }] });
  assert.doesNotMatch(main.match(/saveBrowserWorkspace\([\s\S]*?\);/)?.[0] || '', /messageQuestionInputs/);
});

test('oversized HTTP body rejection preserves the draft and allows shortening before an explicit new send', async () => {
  let input = { draft: '😀'.repeat(17000).slice(0, 30000) };
  const changeInput = patch => { input = { ...input, ...patch }; };
  const failed = itemFixture({ question: available(4), supported: true, input, changeInput, answer: async () => { throw Object.assign(new Error('Request body too large.'), { status: 413 }); } });
  await descendants(failed.element, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  assert.equal(input.delivery, null); assert.equal(input.draft.length, 30000);
  const returned = itemFixture({ question: available(4), supported: true, input, changeInput, answer: () => assert.fail('Editing cannot send') });
  assert.match(returned.html, /Request body too large/);
  descendants(returned.element, node => node.type === 'textarea')[0].props.onChange({ target: { value: 'Shortened answer' } });
  const calls = [], retry = itemFixture({ question: available(4), supported: true, input, changeInput, answer: async (...args) => { calls.push(args); return { accepted: true }; } });
  await descendants(retry.element, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls, [[4, 'Shortened answer']]); assert.equal(input.delivery, 'submitted');
});

test('source-bound answers stay usable during only their own waiting or stopping hand back', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), expressions = {};
  const visit = node => { if (ts.isVariableDeclaration(node) && ['ownQuestionHandoff', 'messageQuestionBlocked', 'readyToSend', 'unsentQuestionText'].includes(node.name.getText(ast))) expressions[node.name.getText(ast)] = node.initializer.getText(ast); ts.forEachChild(node, visit); }; visit(ast);
  const evaluate = (expression, environment) => new Function(...Object.keys(environment), ts.transpileModule(`return (${expression});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(...Object.values(environment));
  const active = { id: 'worker-a', provider: 'codex', role: 'worker', canSend: true, questions: [], returning: true };
  for (const phase of ['waiting', 'stopping', 'summarizing', 'transferring', 'sending', 'closing']) {
    const worker = { ...active, handoff: { phase } }, draftLocked = branchDraftLocked(worker);
    const ownQuestionHandoff = evaluate(expressions.ownQuestionHandoff, { active: worker });
    const environment = { active: worker, activeConnected: true, activeOwnStatus: 'running', draftLocked, ownQuestionHandoff, busy: '' };
    assert.equal(draftLocked, true, 'ordinary composer stays locked for every active handoff phase');
    const blocked = evaluate(expressions.messageQuestionBlocked, environment);
    assert.equal(blocked === null, ['waiting', 'stopping'].includes(phase));
    assert.equal(evaluate(expressions.readyToSend, { ...environment, hasReadyDraft: () => true, draftText: 'Keep ordinary draft', draftImages: [] }), false);
    for (const change of [{ activeConnected: false }, { activeOwnStatus: 'attention' }, { active: { ...worker, questions: [{ id: 'real-approval' }] } }]) assert.equal(typeof evaluate(expressions.messageQuestionBlocked, { ...environment, ...change }), 'string');
  }
  for (const extra of [{ summarizing: true }, { returnSummary: { delivered: true } }, { handoff: undefined }]) {
    const worker = { ...active, handoff: { phase: 'waiting' }, ...extra };
    assert.equal(evaluate(expressions.ownQuestionHandoff, { active: worker }), false);
  }
  const failed = { ...active, returning: false, handoff: { phase: 'failed' } };
  assert.equal(branchDraftLocked(failed), false, 'a failed residual handoff with no active job does not lock answers');
  const inputs = { [JSON.stringify(['worker-a', 'message', 2])]: { draft: 'Keep this answer' }, [JSON.stringify(['worker-b', 'message', 2])]: { draft: 'Other worker answer' } };
  assert.equal(evaluate(expressions.unsentQuestionText, { active, messageQuestionInputs: inputs }), true);
  assert.equal(evaluate(expressions.unsentQuestionText, { active: { id: 'worker' }, messageQuestionInputs: inputs }), false);
  assert.equal(evaluate(expressions.unsentQuestionText, { active, messageQuestionInputs: { [JSON.stringify(['worker-a', 'message', 2])]: { draft: 'Already accepted', delivery: 'submitted' } } }), false);
  assert.match(main, /unsentText=\{!!draftText.trim\(\) \|\| unsentQuestionText\}/);
  let startExpression;
  const findStart = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'BranchHandoff') startExpression = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'start').initializer.expression.getText(ast);
    ts.forEachChild(node, findStart);
  }; findStart(ast);
  const calls = [], startHandoff = async id => { calls.push(id); };
  const blockedStart = evaluate(startExpression, { active, unsentQuestionText: true, startHandoff });
  await assert.rejects(blockedStart(), /Send or discard retained question answer text/); assert.deepEqual(calls, []);
  await evaluate(startExpression, { active, unsentQuestionText: false, startHandoff })(); assert.deepEqual(calls, ['worker-a']);
});

test('recognized native replies display quoted questions and normal answer text while raw copy stays exact', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'MessageText');
  const Text = ({ value }) => React.createElement('span', { className: 'existing-text' }, value);
  const MessageText = new Function('React', 'Text', ts.transpileModule(`${node.getText(ast)}\nreturn MessageText;`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText)(React, Text);
  const raw = '<send_user_message_question_reply>\n[{"questionItemId":"native-original-id","answer":"exact native text"}]\n</send_user_message_question_reply>';
  const message = { type: 'user', text: raw, nativeQuestionReplies: [{ question: 'Choose <scope> **literally**?', answer: '**Chosen answer**\nwith another line' }] }, before = structuredClone(message);
  const element = MessageText({ message }), html = renderToStaticMarkup(element);
  assert.match(html, /<blockquote>Choose &lt;scope&gt; \*\*literally\*\*\?/);
  assert.deepEqual(descendants(element, child => child.type === Text).map(child => child.props.value), [message.nativeQuestionReplies[0].answer]);
  assert.doesNotMatch(html, /send_user_message_question_reply|questionItemId|native-original-id/);
  let copy;
  const visit = node => { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'CopyButton') copy = node.parent.getText(ast); ts.forEachChild(node, visit); }; visit(ast);
  const CopyButton = () => null;
  const copyElement = new Function('React', 'CopyButton', 'message', ts.transpileModule(`return (${copy});`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText)(React, CopyButton, message);
  assert.equal(copyElement.props.text, raw); assert.deepEqual(message, before);
  for (const ordinary of [{ type: 'user', text: raw }, { type: 'user', text: '<send_user_message_question_reply>malformed', nativeQuestionReplies: [] }, { ...message, type: 'assistant' }]) {
    assert.equal(MessageText({ message: ordinary }).props.value, ordinary.text, 'unrecognized or non-user content retains normal text rendering');
  }
  assert.match(renderToStaticMarkup(MessageText({ message: { ...message, nativeQuestionRepliesTruncated: true } })), /shortened for display.*original native message/);
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
  assert.equal(props.agentId, 'active.id'); assert.equal(props.messageId, 'message.id'); assert.equal(props.disabledReason, 'messageQuestionBlocked');
  assert.equal(props.key, 'JSON.stringify([active.id, message.id])');
  assert.match(parent, /message.type === 'assistant' &&/);
  assert.doesNotMatch(parent, /message.text/);
  assert.match(main, /<MessageText message=\{message\} \/>\{message.type === 'assistant' && <NativeMessageQuestions/);
  assert.match(main, /<MessageTime timestamp=\{message.timestamp\} source=\{message.timestampSource\}/);
  assert.match(main, /!!message.text.trim\(\) && <CopyButton text=\{message.text\}/);
  assert.match(main, /active.questions.map\(question => <NativeRequestCard/);
  const requests = [], response = { accepted: true, turnId: 'origin-turn' };
  const answerCode = ts.transpileModule(`return (${props.answer});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const answer = new Function('active', 'message', 'api', answerCode)({ id: 'worker-a', provider: 'codex', role: 'worker' }, { id: 'native-message' }, async (...args) => { requests.push(args); return response; });
  assert.equal(await answer(5, '  Exact text  '), response);
  assert.deepEqual(requests, [['agents/worker-a/message-question-answer', { messageId: 'native-message', questionIndex: 5, answer: '  Exact text  ' }]]);
  for (const active of [{ provider: 'claude' }, { role: 'coordinator' }]) assert.equal(new Function('active', 'message', 'api', answerCode)(active, {}, () => assert.fail('Unsupported provider cannot send')), undefined);
  let blocked;
  const findBlocked = node => { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'messageQuestionBlocked') blocked = node.initializer.getText(ast); ts.forEachChild(node, findBlocked); }; findBlocked(ast);
  const blockCode = ts.transpileModule(`return (${blocked});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const environment = { activeConnected: true, active: { provider: 'codex', role: 'worker', canSend: true, questions: [] }, activeOwnStatus: 'running', draftLocked: false, ownQuestionHandoff: false, busy: '' };
  const evaluateBlock = changes => { const values = { ...environment, ...changes }; return new Function(...Object.keys(values), blockCode)(...Object.values(values)); };
  assert.equal(evaluateBlock({}), null);
  for (const changes of [{ activeConnected: false }, { draftLocked: true }, { activeOwnStatus: 'attention' }, { busy: 'navigate' }, { active: { ...environment.active, canSend: false } }, { active: { ...environment.active, questions: [{ id: 'actual-approval' }] } }]) assert.equal(typeof evaluateBlock(changes), 'string');
});
