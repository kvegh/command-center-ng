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
  for (const match of [...compiled.matchAll(/from ['"]([^'"]+)['"]/g)]) compiled = compiled.replace(match[0], `from '${match[1].startsWith('./') ? await componentUrl(match[1].slice(2)) : pathToFileURL(require.resolve(match[1])).href}'`);
  return 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64');
}
const { NativeRequestCard, NativeFileChanges } = await import(await componentUrl('native-request-card'));
const question = () => ({ id: 7, method: 'item/fileChange/requestApproval', params: { threadId: 'worker', turnId: 'turn', itemId: 'changes', reason: null, grantRoot: null }, nativeItem: { threadId: 'worker', turnId: 'turn', itemId: 'changes', type: 'fileChange', state: 'available', totalChanges: 1, truncated: false, notice: null, changes: [{ path: '/example/before.yml', kind: { type: 'update', move_path: '/example/after.yml' }, diff: '-previous\n+<script>literal text</script>\n' }] } });
const card = q => renderToStaticMarkup(React.createElement(NativeRequestCard, { question: q, agentId: 'worker', workerName: 'Example project', act: () => assert.fail('Rendering cannot send an answer') }));

test('file approval displays paths, rename target and escaped diff before its native action choices', () => {
  const q = question(), original = structuredClone(q.params), html = card(q);
  assert.match(html, /1 proposed file change/); assert.match(html, /\/example\/before.yml/); assert.match(html, /\/example\/after.yml/);
  assert.match(html, /&lt;script&gt;literal text&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.ok(html.indexOf('/example/before.yml') < html.indexOf('>Allow once</button>'));
  assert.match(html, /aria-label="Copy diff"/); assert.deepEqual(q.params, original);
});

test('only matching worker, request turn and native file item can render a body', () => {
  for (const change of [{ threadId: 'other' }, { turnId: 'other' }, { itemId: 'other' }, { type: 'commandExecution' }]) {
    const q = question(); Object.assign(q.nativeItem, change);
    const html = card(q);
    assert.doesNotMatch(html, /\/example\/before.yml|literal text/);
    assert.doesNotMatch(html, /Load change details/); assert.match(html, /No changes were inferred/);
  }
});

test('unavailable and truncated native source remain explicit without claiming a recovered body', () => {
  const missing = question(); missing.nativeItem = { ...missing.nativeItem, state: 'unavailable', changes: [], notice: 'Codex did not provide this exact file body.' };
  assert.match(card(missing), /Codex did not provide this exact file body/);
  assert.doesNotMatch(card(missing), /Load change details/);
  const limited = question(); Object.assign(limited.nativeItem, { truncated: true, notice: 'Showing 1 of 40 files; diff truncated. Review the rest natively.' });
  const html = card(limited);
  assert.match(html, /role="alert"/); assert.match(html, /diff truncated/);
});

test('file-body retrieval is automatic, with truthful loading and no extra load button', () => {
  const q = question(); q.nativeItem.state = 'unavailable'; q.nativeItem.loading = true;
  const html = card(q);
  assert.match(html, /role="status"/);
  assert.match(html, /Loading the proposed file changes automatically/);
  assert.doesNotMatch(html, /Load change details/);
  const mismatched = card({ ...q, nativeItem: { ...q.nativeItem, threadId: 'other' } });
  assert.doesNotMatch(mismatched, /Loading the proposed file changes automatically/);
  assert.match(mismatched, /No changes were inferred/);
});
