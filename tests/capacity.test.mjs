import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';

class Rpc extends EventEmitter {
  ready = true;
  calls = [];
  sequence = 0;
  thread(id) { return { id, name: id, cwd: '/tmp', status: { type: 'idle' }, canAcceptDirectInput: true }; }
  async call(method, params) {
    this.calls.push({ method, params });
    if (method === 'thread/read' || method === 'thread/resume') return { thread: this.thread(params.threadId) };
    if (method === 'thread/start' || method === 'thread/fork') return { thread: this.thread('created-' + ++this.sequence) };
    if (method === 'thread/name/set') return {};
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    if (method === 'turn/start') return { turn: { id: 'turn-' + params.threadId } };
    throw new Error('Unexpected native action: ' + method);
  }
}
const fixture = () => { const rpc = new Rpc(); return { rpc, workspace: new Workspace(rpc, { beads: null }) }; };

test('seventeen concurrent opens reserve only sixteen worker tabs', async () => {
  const { rpc, workspace } = fixture();
  const results = await Promise.allSettled(Array.from({ length: 17 }, (_, i) => workspace.open('worker-' + i)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 16);
  assert.equal(workspace.workerCount(), 16);
  assert.equal(rpc.calls.filter(call => call.method === 'thread/resume').length, 16);
  assert.equal(workspace.workerSlots(), 16);
  const before = rpc.calls.length;
  await assert.rejects(workspace.open('overflow'), /16 worker tabs/);
  assert.equal(rpc.calls.length, before);
});

test('seventeen concurrent creates start only sixteen native workers with unchanged settings', async () => {
  const { rpc, workspace } = fixture();
  const results = await Promise.allSettled(Array.from({ length: 17 }, (_, i) => workspace.create({ goal: 'Task ' + i, cwd: '/tmp' })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 16);
  const starts = rpc.calls.filter(call => call.method === 'thread/start');
  assert.equal(starts.length, 16);
  for (const call of starts) assert.deepEqual(call.params, { cwd: '/tmp' });
  assert.equal(workspace.workerSlots(), 16);
});

test('branching can fill the sixteenth slot and a full workspace still permits parent navigation', async () => {
  const { rpc, workspace } = fixture();
  await workspace.open('parent');
  for (let i = 1; i < 15; i++) await workspace.open('worker-' + i);
  const id = await workspace.fork('parent');
  assert.equal(workspace.workerCount(), 16);
  const before = rpc.calls.length;
  await assert.rejects(workspace.fork('parent'), /Close an agent tab/);
  await assert.rejects(workspace.create({ goal: 'Overflow', cwd: '/tmp' }), /16 worker tabs/);
  assert.equal(rpc.calls.length, before);
  workspace.close('parent');
  await workspace.open('replacement');
  assert.equal(workspace.workerCount(), 16);
  assert.equal(await workspace.parent(id), 'parent');
  assert.equal(workspace.workerCount(), 16);
  assert.equal(workspace.agents.has(id), false);
  assert.equal(rpc.calls.filter(call => call.method === 'turn/interrupt').length, 0);
});
