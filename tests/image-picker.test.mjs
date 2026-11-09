import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/image-drafts.tsx', import.meta.url), 'utf8');
let compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
compiled = compiled.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`)
  .replace(/from ['"]\.\.\/server\/image-limits.json['"]/, `from '${new URL('../server/image-limits.json', import.meta.url).href}'`);
const { ImageAttachmentPicker, prepareImageDrafts, readImageFile, finishImageDraft } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const file = { name: 'screenshot.png', type: 'image/png', size: 100 };
const input = () => Object.assign(new EventTarget(), { dataset: {}, files: [file], value: 'native-file-selection' });
const picker = (agentId, attach, disabled = false) => ImageAttachmentPicker({ agentId, name: agentId, attach, disabled });

test('attachment picker exposes a keyboard-accessible native multiple-image selection', () => {
  const html = renderToStaticMarkup(picker('Example project', () => assert.fail('Rendering cannot attach an image.')));
  assert.match(html, /Attach image/);
  assert.match(html, /type="file"/);
  assert.deepEqual(html.match(/accept="([^"]+)"/)[1].split(',').sort(), ['image/gif', 'image/jpeg', 'image/png', 'image/webp']);
  assert.match(html, /multiple=""/);
  assert.match(html, /aria-label="Attach images to Example project"/);
  assert.doesNotMatch(html, /disabled=|tabindex="-1"|type="submit"/);
});

test('selection stays with its originating chat and resetting the input allows the same file again', () => {
  const calls = [];
  const attach = (files, agentId) => calls.push({ files, agentId });
  const first = picker('original', attach).props.children[1];
  const other = picker('other', attach).props.children[1];
  const currentTarget = input();
  const stopFirst = first.props.ref(currentTarget);
  first.props.onClick({ currentTarget });
  // The same DOM input receives new props if the selected tab changes while its picker is open.
  stopFirst();
  const stopOther = other.props.ref(currentTarget);
  other.props.onChange({ currentTarget });
  assert.deepEqual(calls, [{ files: [file], agentId: 'original' }]);
  assert.equal(currentTarget.value, '');
  assert.equal(currentTarget.dataset.attachmentAgentId, undefined);
  other.props.onClick({ currentTarget });
  other.props.onChange({ currentTarget });
  assert.deepEqual(calls, [{ files: [file], agentId: 'original' }, { files: [file], agentId: 'other' }]);
  assert.equal(currentTarget.value, '');
  stopOther();
});

test('native cancellation and empty selections clear the old target, and ref cleanup removes the listener', () => {
  const calls = [];
  const first = picker('original', (files, id) => calls.push(id)).props.children[1];
  const other = picker('other', (files, id) => calls.push(id)).props.children[1];
  const currentTarget = input();
  const stop = first.props.ref(currentTarget);
  first.props.onClick({ currentTarget });
  currentTarget.dispatchEvent(new Event('cancel'));
  assert.equal(currentTarget.value, '');
  assert.deepEqual(currentTarget.dataset, {}); assert.deepEqual(calls, []);
  currentTarget.files = null;
  other.props.onChange({ currentTarget }); assert.deepEqual(calls, []);
  currentTarget.files = [file];
  other.props.onChange({ currentTarget }); assert.deepEqual(calls, ['other']);
  stop();
  currentTarget.dataset.attachmentAgentId = 'after-unmount'; currentTarget.value = 'unchanged';
  currentTarget.dispatchEvent(new Event('cancel'));
  assert.equal(currentTarget.dataset.attachmentAgentId, 'after-unmount');
  assert.equal(currentTarget.value, 'unchanged', 'unmounted picker listeners cannot mutate a reused input');
});

test('disabled picker cannot attach even if a delayed native change event arrives', () => {
  const currentTarget = input();
  const enabled = picker('original', () => assert.fail('Enabled render callback must not be reused.')).props.children[1];
  enabled.props.onClick({ currentTarget });
  const locked = picker('original', () => assert.fail('Locked drafts cannot gain an attachment.'), true);
  const disabled = locked.props.children[1];
  assert.match(renderToStaticMarkup(locked), /disabled=""/);
  disabled.props.onClick({ currentTarget });
  disabled.props.onChange({ currentTarget });
  assert.equal(currentTarget.value, ''); assert.deepEqual(currentTarget.dataset, {});
});

test('selected files use existing validation and async reads update only the captured chat draft', async () => {
  const otherImages = [{ id: 'existing', mimeType: 'image/png', size: 100, label: 'Other image' }];
  let drafts = { original: [], other: otherImages }, pending;
  let selected = 'original';
  const reader = { result: null, readAsDataURL(received) { assert.equal(received, file); } };
  const attach = (files, agentId) => {
    const added = prepareImageDrafts(drafts[agentId], files);
    drafts = { ...drafts, [agentId]: [...drafts[agentId], ...added] };
    pending = readImageFile(files[0], reader).then(url => { drafts = finishImageDraft(drafts, agentId, added[0].id, url); });
  };
  const original = picker('original', attach).props.children[1];
  const currentTarget = input(); original.props.onClick({ currentTarget });
  selected = 'other'; picker(selected, attach).props.children[1].props.onChange({ currentTarget });
  reader.result = 'data:image/png;base64,aW1hZ2U='; reader.onload(); await pending;
  assert.equal(selected, 'other', 'attachment processing must not navigate');
  assert.equal(drafts.original[0].dataUrl, reader.result);
  assert.equal(drafts.other, otherImages);
});

test('composer shares its per-chat image callback and draft-only lock with paste and attachment controls', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const controls = new Map();
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && ['ImageAttachmentPicker', 'ChatDraft'].includes(node.tagName.getText(ast))) {
      controls.set(node.tagName.getText(ast), Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => [attribute.name.getText(ast), attribute.initializer?.expression?.getText(ast)])));
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const attach = controls.get('ImageAttachmentPicker'), paste = controls.get('ChatDraft');
  assert.equal(attach.agentId, 'active.id'); assert.equal(paste.agentId, attach.agentId);
  assert.equal(attach.attach, paste.onPasteImages);
  assert.equal(attach.disabled, 'draftLocked'); assert.equal(paste.disabled, attach.disabled);
  assert.match(main, /const readyToSend =[^\n]*!active\.questions\.length && activeOwnStatus !== 'attention'/, 'drafting attachments cannot bypass pending-request send gates');
});
