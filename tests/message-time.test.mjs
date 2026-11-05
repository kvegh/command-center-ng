import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { messageTime } from '../server/message-time.mjs';
import { Workspace } from '../server/workspace.mjs';

class Rpc extends EventEmitter {
  ready = true;
  items = [];
  async call(method) {
    if (method === 'thread/read') return { thread: { id: 'worker', cwd: '/tmp', status: { type: 'idle' } } };
    if (method === 'thread/turns/list') return { data: [{ id: 'turn', status: 'completed', items: this.items }], nextCursor: null };
    throw new Error('Unexpected fixture operation: ' + method);
  }
}
async function fixture(items = []) {
  const rpc = new Rpc(); rpc.items = items;
  const workspace = new Workspace(rpc, { beads: null });
  const agent = await workspace.open('worker', { observeOnly: true });
  const notify = (method, params) => workspace.notification({ method, params: { threadId: 'worker', turnId: 'turn', ...params } });
  return { rpc, workspace, agent, notify };
}

test('native time normalization accepts recorded milliseconds/ISO while absent and invalid values remain absent', () => {
  assert.equal(messageTime(0), '1970-01-01T00:00:00.000Z');
  assert.equal(messageTime(1793894400123), '2026-11-05T16:00:00.123Z');
  assert.equal(messageTime('2026-11-05T17:35:00+01:00'), '2026-11-05T16:35:00.000Z');
  for (const value of [undefined, null, '', '0', '2026-11-05T16:35:00', '2026-13-40T25:00:00Z', 'not a date', NaN, Infinity, {}, false, 9e20]) assert.equal(messageTime(value), undefined);
});

test('native history uses recorded item times without inventing a timestamp for older untimed messages', async () => {
  const f = await fixture([
    { id: 'user', type: 'userMessage', content: [{ type: 'text', text: 'Synthetic question.' }], startedAtMs: 1793894400000, completedAtMs: 1793894402000 },
    { id: 'reply', type: 'agentMessage', text: 'Synthetic answer.', completedAtMs: 1793894404000 },
    { id: 'old', type: 'agentMessage', text: 'Untimed old answer.' }
  ]);
  assert.equal(f.agent.messages[0].timestamp, '2026-11-05T16:00:00.000Z');
  assert.equal(f.agent.messages[0].timestampSource, 'native');
  assert.equal(f.agent.messages[1].timestamp, '2026-11-05T16:00:04.000Z');
  assert.equal(f.agent.messages[2].timestamp, undefined);
});

test('live arrival time remains stable across deltas, completion and untimed history refresh', async t => {
  let now = 1793894400000; t.mock.method(Date, 'now', () => now);
  const f = await fixture();
  f.notify('item/agentMessage/delta', { itemId: 'live-reply', delta: 'First' });
  const first = f.agent.messages[0].timestamp;
  assert.equal(first, '2026-11-05T16:00:00.000Z'); assert.equal(f.agent.messages[0].timestampSource, 'received');
  now += 90_000;
  f.notify('item/agentMessage/delta', { itemId: 'live-reply', delta: ' second' });
  f.notify('item/completed', { item: { id: 'live-reply', type: 'agentMessage', text: 'First second' } });
  assert.equal(f.agent.messages[0].timestamp, first);
  f.rpc.items = [{ id: 'live-reply', type: 'agentMessage', text: 'First second' }, { id: 'old', type: 'agentMessage', text: 'Untimed history.' }];
  await f.workspace.history('worker');
  assert.equal(f.agent.messages[0].timestamp, first); assert.equal(f.agent.messages[1].timestamp, undefined);
  await f.workspace.history('worker', 'older-page');
  assert.equal(f.agent.messages[0].timestamp, first); assert.equal(f.agent.messages[1].timestamp, undefined);
});

test('recorded native start supersedes receive time and is not replaced by completion-only updates', async t => {
  t.mock.method(Date, 'now', () => 1793894500000);
  const f = await fixture();
  f.notify('item/started', { item: { id: 'native-reply', type: 'agentMessage', text: 'Draft' } });
  assert.equal(f.agent.messages[0].timestampSource, 'received');
  const received = f.agent.messages[0].timestamp;
  f.notify('item/completed', { item: { id: 'native-reply', type: 'agentMessage', text: 'Answer', completedAtMs: 1793894501000 } });
  assert.equal(f.agent.messages[0].timestamp, received); assert.equal(f.agent.messages[0].timestampSource, 'received');
  f.notify('item/completed', { item: { id: 'native-reply', type: 'agentMessage', text: 'Answer', startedAtMs: 1793894400000, completedAtMs: 1793894405000 } });
  assert.equal(f.agent.messages[0].timestamp, '2026-11-05T16:00:00.000Z'); assert.equal(f.agent.messages[0].timestampSource, 'native');
  f.notify('item/completed', { item: { id: 'native-reply', type: 'agentMessage', text: 'Answer', completedAtMs: 1793894409000 } });
  assert.equal(f.agent.messages[0].timestamp, '2026-11-05T16:00:00.000Z');
});
