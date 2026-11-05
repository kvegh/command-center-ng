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
const { prepareImageDrafts, readImageFile, finishImageDraft, removeImageDrafts, hasReadyDraft, ImageDraftPreviews, MessageImages } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const MiB = 1024 * 1024;
const imageFile = (overrides = {}) => ({ type: 'image/png', size: 100, name: 'screenshot.png', ...overrides });
const dataUrl = 'data:image/png;base64,aW1hZ2U=';

test('image reservations enforce count, individual bytes, combined bytes and safe MIME types before reads', () => {
  const files = prepareImageDrafts([], [imageFile({ size: 4 * MiB }), imageFile({ size: 4 * MiB })]);
  assert.equal(files.length, 2);
  assert.notEqual(files[0].id, files[1].id, 'identical pasted files still have separate identities');
  assert.throws(() => prepareImageDrafts(files, [imageFile()]), /total 8 MiB/);
  assert.throws(() => prepareImageDrafts([], [imageFile({ size: 4 * MiB + 1 })]), /Each image.*4 MiB/);
  assert.throws(() => prepareImageDrafts([], Array.from({ length: 5 }, () => imageFile())), /up to 4 images/);
  assert.throws(() => prepareImageDrafts(prepareImageDrafts([], Array.from({ length: 4 }, () => imageFile())), [imageFile()]), /up to 4 images/);
  for (const type of ['image/svg+xml', 'text/html', '', 'application/pdf']) assert.throws(() => prepareImageDrafts([], [imageFile({ type })]), /PNG, JPEG, GIF or WebP/);
  assert.throws(() => prepareImageDrafts([], [imageFile({ size: 0 })]), /empty/);
  for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) assert.equal(prepareImageDrafts([], [imageFile({ type })])[0].mimeType, type);
});

test('async image reads stay bound to their original chat and removed previews cannot return', async () => {
  const file = imageFile();
  const [first, second] = prepareImageDrafts([], [file, file]);
  const other = prepareImageDrafts([], [file]);
  let drafts = { original: [first, second], other };
  const reader = () => ({ result: null, readAsDataURL(received) { assert.equal(received, file); } });
  const firstReader = reader(), secondReader = reader();
  const pendingFirst = readImageFile(file, firstReader).then(url => { drafts = finishImageDraft(drafts, 'original', first.id, url); });
  const pendingSecond = readImageFile(file, secondReader).then(url => { drafts = finishImageDraft(drafts, 'original', second.id, url); });
  drafts = removeImageDrafts(drafts, 'original', [first.id]);
  secondReader.result = dataUrl; secondReader.onload(); await pendingSecond;
  const afterSecondRead = drafts;
  firstReader.result = dataUrl; firstReader.onload(); await pendingFirst;
  assert.equal(drafts, afterSecondRead, 'a completed read for a removed image has no effect');
  assert.deepEqual(drafts.original, [{ ...second, dataUrl }]);
  assert.equal(drafts.other, other, 'switching chats cannot route the old file into the visible chat');
});

test('file reading rejects failures and unexpected result types without accepting arbitrary data URLs', async () => {
  for (const event of ['onerror', 'onabort']) {
    const reader = { readAsDataURL() {} };
    const pending = readImageFile(imageFile(), reader);
    reader[event](); await assert.rejects(pending, /could not be read/);
  }
  for (const result of [null, new ArrayBuffer(4), 'data:image/svg+xml;base64,PHN2Zz4=', 'https://example.invalid/image.png']) {
    const reader = { result, readAsDataURL() {} };
    const pending = readImageFile(imageFile(), reader);
    reader.onload(); await assert.rejects(pending, /could not be read/);
  }
});

test('image-only drafts become sendable after reading and acknowledgements retain newer attachments', () => {
  const [sent, newer] = prepareImageDrafts([], [imageFile(), imageFile()]);
  assert.equal(hasReadyDraft('', []), false);
  assert.equal(hasReadyDraft('Caption', [sent]), false, 'pending images block sending even with text');
  assert.equal(hasReadyDraft('', [{ ...sent, dataUrl }]), true, 'an image does not require a text caption');
  assert.equal(hasReadyDraft('Text only', []), true);
  const other = prepareImageDrafts([], [imageFile()]);
  const drafts = { worker: [{ ...sent, dataUrl }, newer], other };
  const acknowledged = removeImageDrafts(drafts, 'worker', [sent.id]);
  assert.deepEqual(acknowledged.worker, [newer]);
  assert.equal(acknowledged.other, other);
  assert.equal(drafts.worker.length, 2, 'draft updates do not mutate a submitted snapshot');
});

test('previews retain accessible removal, loading and failure feedback while warning about refresh loss', () => {
  const [first, second] = prepareImageDrafts([], [imageFile(), imageFile({ name: 'another.png' })]);
  const html = renderToStaticMarkup(React.createElement(ImageDraftPreviews, { images: [{ ...first, dataUrl }, second], disabled: false, error: 'The image was too large.', remove() {} }));
  assert.match(html, /aria-label="Image attachments"/);
  assert.match(html, /alt="screenshot.png"/);
  assert.match(html, /aria-label="Remove screenshot.png"/);
  assert.match(html, /Reading image…/);
  assert.match(html, /Unsent images disappear on refresh/);
  assert.match(html, /role="alert">The image was too large/);
  assert.doesNotMatch(html, /disabled=/);
  const locked = renderToStaticMarkup(React.createElement(ImageDraftPreviews, { images: [first], disabled: true, remove() {} }));
  assert.match(locked, /disabled=""/);
});

test('sent images use only their exact authenticated worker/message URLs with safe image types', () => {
  const url = '/api/agents/worker/messages/message%3Aone/images/0';
  const props = { agentId: 'worker', messageId: 'message:one' };
  const html = renderToStaticMarkup(React.createElement(MessageImages, { ...props, images: [{ url, mimeType: 'image/png', label: 'Image 1' }] }));
  assert.match(html, /href="\/api\/agents\/worker\/messages\/message%3Aone\/images\/0"/);
  assert.match(html, /src="\/api\/agents\/worker\/messages\/message%3Aone\/images\/0"/);
  assert.match(html, /alt="Image 1"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  for (const image of [
    { url: 'https://example.invalid/image.png', mimeType: 'image/png' },
    { url: dataUrl, mimeType: 'image/png' },
    { url: '/api/agents/other/messages/message%3Aone/images/0', mimeType: 'image/png' },
    { url: '/api/agents/worker/messages/another-message/images/0', mimeType: 'image/png' },
    { url, mimeType: 'image/svg+xml' }
  ]) {
    const unsafe = renderToStaticMarkup(React.createElement(MessageImages, { ...props, images: [image] }));
    assert.doesNotMatch(unsafe, /<img|<a\b/);
    assert.match(unsafe, /unavailable/);
  }
});
