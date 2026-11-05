import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';
import { readInlineImage, validateImages, codexImages } from '../server/image-input.mjs';
import limits from '../server/image-limits.json' with { type: 'json' };

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7hkAAAAASUVORK5CYII=';
const image = { dataUrl: png };
const sizedPng = size => { const bytes = Buffer.alloc(size); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes); return { dataUrl: 'data:image/png;base64,' + bytes.toString('base64') }; };

test('image inputs accept bounded inline formats and reject URLs, MIME mismatches and malformed content', () => {
  assert.equal(readInlineImage(png).mimeType, 'image/png');
  assert.equal(readInlineImage(png).byteLength, 68);
  for (const dataUrl of ['https://example.invalid/image.png', 'file:///tmp/image.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,bm90LWFuLWltYWdl', png.replace('image/png', 'image/jpeg'), png + '=', png.replace(',', ',\n')]) assert.throws(() => readInlineImage(dataUrl), { status: 400 });
  assert.throws(() => validateImages(null), { status: 400 });
  assert.throws(() => validateImages([{}]), { status: 400 });
  assert.deepEqual(validateImages(), []);
  assert.deepEqual(codexImages([{ type: 'image', url: png }, { type: 'image', url: 'https://example.invalid/private.png' }, { type: 'localImage', path: '/tmp/unrelated.png' }]), [readInlineImage(png)]);
});

test('image count, per-image and combined byte bounds apply before native delivery', () => {
  assert.throws(() => validateImages(Array(5).fill(image)), /four images/);
  assert.throws(() => validateImages([sizedPng(limits.maxImageBytes + 1)]), /4 MiB/);
  const large = sizedPng(limits.maxImageBytes);
  assert.equal(validateImages([large, large]).length, 2);
  assert.throws(() => validateImages([large, large, image]), /8 MiB/);
});

class Rpc extends EventEmitter {
  ready = true; calls = []; items = [];
  async call(method, params) {
    this.calls.push({ method, params });
    if (['thread/read', 'thread/resume'].includes(method)) return { thread: { id: params.threadId, name: 'Image fixture', cwd: '/tmp', status: { type: 'idle' } } };
    if (method === 'thread/turns/list') return { data: [{ id: 'history-turn', status: 'completed', items: this.items }], nextCursor: null };
    if (method === 'turn/start') return { turn: { id: 'new-turn' } };
    if (method === 'turn/steer') return { turnId: params.expectedTurnId };
    throw new Error('Unexpected native call: ' + method);
  }
}

async function fixture(items = []) {
  const rpc = new Rpc(); rpc.items = items;
  const workspace = new Workspace(rpc, { beads: null });
  workspace.instructionContext = async () => ({});
  const agent = await workspace.open('worker', { observeOnly: true });
  return { rpc, workspace, agent };
}

test('Codex receives image-only and captioned input through native start/steer without changing permissions', async () => {
  const f = await fixture();
  await f.workspace.send('worker', '', { images: [image] });
  assert.deepEqual(f.rpc.calls.find(call => call.method === 'turn/start').params, { threadId: 'worker', input: [{ type: 'image', url: png }], additionalContext: {} });
  await f.workspace.send('worker', 'Explain this screenshot.', { images: [image] });
  assert.deepEqual(f.rpc.calls.at(-1), { method: 'turn/steer', params: { threadId: 'worker', expectedTurnId: 'new-turn', input: [{ type: 'text', text: 'Explain this screenshot.', text_elements: [] }, { type: 'image', url: png }] } });
});

test('pending questions, missing request details and handoffs still block image messages', async () => {
  for (const state of ['question', 'flag', 'handoff']) {
    const f = await fixture();
    if (state === 'question') f.agent.questions.push({ id: 'pending' });
    if (state === 'flag') f.agent.thread.status.activeFlags = ['waitingOnApproval'];
    if (state === 'handoff') f.workspace.summaryJobs.set('worker', Promise.resolve());
    const before = f.rpc.calls.length;
    await assert.rejects(f.workspace.send('worker', '', { images: [image] }), { status: 409 });
    assert.equal(f.rpc.calls.length, before);
  }
});

test('native image history and live updates preserve images while snapshots contain only scoped HTTP references', async () => {
  const record = { id: 'image/message', type: 'userMessage', content: [{ type: 'image', url: png }] };
  const f = await fixture([record]);
  assert.equal(f.agent.messages.length, 1);
  assert.equal(f.agent.messages[0].text, '');
  const snapshot = f.workspace.snapshot();
  assert.ok(!JSON.stringify(snapshot).includes('base64'));
  assert.deepEqual(snapshot.agents[0].messages[0].images, [{ url: '/api/agents/worker/messages/image%2Fmessage/images/0', mimeType: 'image/png', label: 'Image 1' }]);
  const result = f.workspace.messageImage('worker', record.id, 0);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.bytes.toString('base64'), png.split(',')[1]);
  for (const [agentId, messageId, index] of [['other', record.id, 0], ['worker', 'other', 0], ['worker', record.id, 1]]) assert.throws(() => f.workspace.messageImage(agentId, messageId, index), { status: 404 });
  f.workspace.notification({ method: 'item/completed', params: { threadId: 'worker', turnId: 'new-turn', item: { ...record, id: 'captioned', content: [{ type: 'text', text: 'Caption.' }, { type: 'image', url: png }] } } });
  assert.equal(f.agent.messages.at(-1).text, 'Caption.');
  assert.equal(f.agent.messages.at(-1).images[0].dataUrl, png);
});
