import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/coordinator-audit.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  .replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
const { DecisionHistory, auditDecision } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const entry = {
  id: 'decision-one', agentId: 'closed-worker', workerName: 'Recorded worker', projectName: 'Example project',
  requestSummary: 'Run the targeted application checks.', decision: 'approve', outcome: 'resolved',
  rationale: 'These checks fit the authorized development work.', at: '2027-01-15T16:45:00.000Z', storageState: 'saved'
};
const render = (entries = [entry], props = {}) => renderToStaticMarkup(React.createElement(DecisionHistory, { entries, workers: [], ...props }));

test('saved decisions show the high-level request, actual decision, rationale and original worker/project when tabs are closed', () => {
  const html = render();
  assert.match(html, /Recorded worker · Example project/);
  assert.match(html, /🟦 <b>Request:<\/b> Run the targeted application checks/);
  assert.match(html, /🟢 <b>Approved once:<\/b> These checks fit the authorized development work/);
  assert.match(html, /<time dateTime=|<time datetime=/);
  assert.match(html, /Saved/);
  assert.equal((html.match(/<li>/g) || []).length, 2);
  assert.match(html, /Acknowledged decisions do not prove execution/);
  assert.match(html, /Check Open questions for current requests/);
  assert.doesNotMatch(html, /<button|<input|onclick/i);
});

test('storage state stays separate from native decisions, including unsaved acknowledged approvals', () => {
  for (const [storageState, label] of [['saved', 'Saved'], ['pending', 'Saving…'], ['failed', 'Not saved'], [undefined, 'Storage status unknown']]) {
    const html = render([{ ...entry, storageState }]);
    assert.match(html, /Approved once/);
    assert.ok(html.includes(label));
    if (storageState === 'failed') assert.match(html, /role="alert"/);
    else assert.doesNotMatch(html, /role="alert"/);
  }
  const uncertain = render([{ ...entry, outcome: 'unconfirmed', storageState: 'saved' }]);
  assert.match(uncertain, /🟣 <b>Approval unconfirmed/);
  assert.match(uncertain, /Saved/);
  assert.doesNotMatch(uncertain, /Approved once/);
});

test('load/write warnings remain outside the collapsed history and visible even with no rows', () => {
  const html = render([], { error: 'The local history file could not be read.' });
  assert.match(html, /role="alert"/);
  assert.match(html, /Some entries may be missing or unsaved/);
  assert.match(html, /The local history file could not be read/);
  assert.doesNotMatch(html, /class="coordinator-audit"/);
  const rows = render([entry], { error: 'A write could not be completed.' });
  assert.ok(rows.indexOf('role="alert"') < rows.indexOf('class="coordinator-audit"'));
  assert.doesNotMatch(rows, /<details class="coordinator-audit" open/);
  assert.equal(render([]), '');
});

test('last twenty entries render newest first without mutating the restored audit array', () => {
  const entries = Array.from({ length: 30 }, (_unused, index) => ({ ...entry, id: `decision-${index}`, requestSummary: `Request number ${String(index).padStart(2, '0')}.` }));
  const before = structuredClone(entries);
  const html = render(entries);
  assert.deepEqual(entries, before);
  assert.equal((html.match(/<b>Request:<\/b>/g) || []).length, 20);
  assert.doesNotMatch(html, /Request number 00\.|Request number 09\./);
  assert.match(html, /Request number 10\./);
  assert.ok(html.indexOf('Request number 29.') < html.indexOf('Request number 28.'));
});

test('legacy optional fields use truthful labels and current names without inventing a persisted record', () => {
  const old = { agentId: 'open-worker', action: 'report', outcome: 'delivered', at: 'invalid-date' };
  const html = render([old], { workers: [{ id: 'open-worker', name: 'Current worker' }] });
  assert.match(html, /Current worker/); assert.match(html, /Request a task report/);
  assert.match(html, /Delivered/); assert.match(html, /Delivery event \(not saved\)/);
  assert.match(html, /Time unavailable/); assert.doesNotMatch(html, /Invalid Date|undefined|null/);
  assert.match(render([{ ...old, action: undefined }]), /Coordinator action/);
  assert.match(render([{ ...entry, workerName: undefined, projectName: undefined }]), />Worker<\/strong>/);
  const renamed = render([entry], { workers: [{ id: entry.agentId, name: 'Renamed tab' }] });
  assert.match(renamed, /Recorded worker/); assert.doesNotMatch(renamed, /Renamed tab/);
});

test('unknown native fields, commands, approval identities and form/token bodies are not rendered', () => {
  const html = render([{ ...entry, command: 'RAW_COMMAND_SENTINEL', requestId: 'REQUEST_ID_SENTINEL', authorizationMessageId: 'AUTHORITY_ID_SENTINEL', reviewToken: 'TOKEN_SENTINEL', params: { form: 'FORM_SENTINEL' }, turnId: 'TURN_ID_SENTINEL', itemId: 'ITEM_ID_SENTINEL' }]);
  for (const value of ['RAW_COMMAND_SENTINEL', 'REQUEST_ID_SENTINEL', 'AUTHORITY_ID_SENTINEL', 'TOKEN_SENTINEL', 'FORM_SENTINEL', 'TURN_ID_SENTINEL', 'ITEM_ID_SENTINEL']) assert.ok(!html.includes(value));
  assert.match(render([{ ...entry, requestSummary: '<script>literal text</script>' }]), /&lt;script&gt;/);
  assert.doesNotMatch(source, /JSON.stringify|localStorage|fetch\(|api\(|onClick/);
});

test('review outcome labels do not turn ask/decline/unconfirmed records into completed work', () => {
  assert.equal(auditDecision({ ...entry, decision: 'decline' }).label, 'Declined');
  assert.equal(auditDecision({ ...entry, decision: 'ask', outcome: 'needs_user' }).label, 'Asked for your decision');
  assert.equal(auditDecision({ ...entry, decision: 'decline', outcome: 'unconfirmed' }).label, 'Decline unconfirmed');
  const unknown = auditDecision({ ...entry, decision: undefined, outcome: 'unknown_native_outcome' });
  assert.match(unknown.label, /unknown native outcome/);
  assert.doesNotMatch(unknown.label, /Approved|completed|executed/);
});

test('main shows storage errors with an empty history and passes only decision history to this read-only panel', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let props;
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'DecisionHistory') props = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => [attribute.name.getText(ast), attribute.initializer?.expression?.getText(ast)]));
    ts.forEachChild(node, visit);
  }; visit(ast);
  assert.equal(props.entries, 'coordinator?.audit || []');
  assert.equal(props.error, 'coordinator?.decisionLogError');
  assert.match(main, /visible: !!\(coordinator\?\.audit.length \|\| coordinator\?\.decisionLogError\)/);
  assert.match(main, /questions=\{agent.questions\}/, 'live native questions remain independent from historical outcomes');
});
