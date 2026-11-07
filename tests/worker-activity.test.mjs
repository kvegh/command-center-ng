import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';

const previousUpdate = '2000-01-01T00:00:00.000Z';

function fixture(options = {}) {
  const rpc = new EventEmitter(); rpc.ready = true;
  rpc.respond = () => {}; rpc.refuse = () => {};
  const workspace = new Workspace(rpc, { beads: null, ...options });
  for (const id of ['one', 'two']) {
    workspace.agents.set(id, {
      id, name: id, provider: 'codex', cwd: '/example/project',
      thread: { id, status: { type: 'active', activeFlags: [] } },
      messages: [], questions: [], tasks: [], workers: [], turnId: `turn-${id}`,
    });
    workspace.watched.add(id);
  }
  return { workspace, rpc, agent: workspace.agent('one') };
}

function assertReceived(timestamp, earliest) {
  assert.equal(typeof timestamp, 'string');
  assert.equal(new Date(timestamp).toISOString(), timestamp);
  assert.ok(Date.parse(timestamp) >= earliest);
  assert.ok(Date.parse(timestamp) <= Date.now());
}

test('live Codex message, reasoning and tool updates expose receipt time only for their worker', () => {
  const { workspace, rpc, agent } = fixture();
  const methods = [
    'item/agentMessage/delta', 'item/reasoning/textDelta',
    'item/reasoning/summaryPartAdded', 'item/commandExecution/outputDelta',
    'item/mcpToolCall/progress', 'turn/diff/updated', 'turn/plan/updated',
  ];
  for (const method of methods) {
    agent.lastNativeEventAt = previousUpdate;
    const start = Date.now(); let changes = 0;
    const changed = () => changes++;
    workspace.on('change', changed);
    rpc.emit('notification', { method, params: { threadId: agent.id, turnId: agent.turnId, itemId: 'reply', delta: 'Update' } });
    workspace.off('change', changed);
    assertReceived(agent.lastNativeEventAt, start);
    assert.equal(changes, 1, `${method} uses the existing snapshot publication`);
    assert.equal(workspace.agent('two').lastNativeEventAt, undefined);
    assert.equal(workspace.snapshot().agents.find(row => row.id === agent.id).lastNativeEventAt, agent.lastNativeEventAt);
  }
  assert.equal(agent.messages.find(message => message.id === 'reply').text, 'Update');
});

test('turn and item lifecycle plus native status updates retain finished-turn outcome', () => {
  const { rpc, agent } = fixture();
  rpc.emit('notification', { method: 'turn/started', params: { threadId: agent.id, turn: { id: 'next-turn' } } });
  assert.equal(agent.turnId, 'next-turn');
  for (const method of ['item/started', 'item/completed']) {
    agent.lastNativeEventAt = previousUpdate; const start = Date.now();
    rpc.emit('notification', { method, params: { threadId: agent.id, turnId: 'next-turn', item: { id: 'reply', type: 'agentMessage', text: 'Done', status: 'completed' } } });
    assertReceived(agent.lastNativeEventAt, start);
  }
  agent.lastNativeEventAt = previousUpdate; const statusStart = Date.now();
  rpc.emit('notification', { method: 'thread/status/changed', params: { threadId: agent.id, status: { type: 'active', activeFlags: ['waitingOnApproval'] } } });
  assertReceived(agent.lastNativeEventAt, statusStart);
  assert.deepEqual(agent.thread.status.activeFlags, ['waitingOnApproval']);
  agent.lastNativeEventAt = previousUpdate; const start = Date.now();
  rpc.emit('notification', { method: 'turn/completed', params: { threadId: agent.id, turn: { id: 'next-turn', status: 'interrupted' } } });
  assertReceived(agent.lastNativeEventAt, start);
  assert.equal(agent.turnId, null);
  assert.deepEqual(agent.finishedTurn, { id: 'next-turn', status: 'interrupted' });
});

test('stale, unrelated and unscoped notifications do not freshen the current worker', () => {
  const { workspace, rpc, agent } = fixture();
  agent.lastNativeEventAt = previousUpdate;
  for (const event of [
    { method: 'item/reasoning/textDelta', params: { threadId: agent.id, turnId: 'earlier-turn', delta: 'Late' } },
    { method: 'turn/completed', params: { threadId: 'unopened', turn: { id: 'old', status: 'completed' } } },
    { method: 'item/reasoning/textDelta', params: { threadId: 'unopened', delta: 'Other worker' } },
    { method: 'heartbeat', params: { threadId: agent.id } },
    { method: 'heartbeat', params: {} },
    { method: 'thread/name/updated', params: { threadId: agent.id, name: 'Renamed' } },
    { method: 'thread/settings/updated', params: { threadId: agent.id, threadSettings: { model: 'example' } } },
  ]) rpc.emit('notification', event);
  rpc.emit('notification', { method: 'item/reasoning/textDelta', params: { threadId: 'two', turnId: 'turn-two', delta: 'Own update' } });
  assert.equal(agent.lastNativeEventAt, previousUpdate);
  assertReceived(workspace.agent('two').lastNativeEventAt, Date.parse(previousUpdate));
});

test('new delivered native questions count once; duplicates and internal requests do not', () => {
  const { workspace, rpc, agent } = fixture();
  const request = { id: 7, method: 'item/tool/requestUserInput', params: { threadId: agent.id, turnId: agent.turnId, questions: [] } };
  const start = Date.now(); rpc.emit('request', request);
  assertReceived(agent.lastNativeEventAt, start);
  assert.equal(agent.questions.length, 1);
  agent.lastNativeEventAt = previousUpdate;
  rpc.emit('request', request);
  rpc.emit('request', { id: 8, method: 'currentTime/read', params: { threadId: agent.id } });
  rpc.emit('request', { id: 9, method: 'attestation/generate', params: { threadId: agent.id } });
  rpc.emit('request', { id: 10, method: request.method, params: { threadId: 'unwatched', questions: [] } });
  rpc.emit('notification', { method: 'serverRequest/resolved', params: { threadId: agent.id, requestId: 7 } });
  assert.equal(agent.lastNativeEventAt, previousUpdate);
  assert.equal(agent.questions.length, 0);
  assert.equal(workspace.agent('two').lastNativeEventAt, undefined);
});

test('history rereads, tracker polling, snapshots and transport changes preserve activity evidence', async () => {
  const { workspace, rpc, agent } = fixture({ beads: { linked: async () => ({ status: 'ready', tasks: [], checkedAt: new Date().toISOString() }) } });
  rpc.call = async method => {
    if (method === 'thread/read') return { thread: { id: agent.id, status: { type: 'active' }, updatedAt: Date.now() } };
    if (method === 'thread/turns/list') return { data: [{ id: agent.turnId, status: 'inProgress', items: [{ id: 'history-reply', type: 'agentMessage', text: 'Historical message' }] }] };
    throw new Error(`Unexpected fixture method: ${method}`);
  };
  agent.observingOnly = true;
  for (const timestamp of [undefined, previousUpdate]) {
    agent.lastNativeEventAt = timestamp;
    await workspace.history(agent.id);
    await workspace.refreshObserved(agent.id);
    await workspace.refreshTasks(agent.id);
    workspace.changed(); workspace.snapshot();
    rpc.emit('disconnected', 'Transport disconnected');
    rpc.emit('connected');
    assert.equal(agent.lastNativeEventAt, timestamp);
  }
});

test('Codex activity metadata does not change postponed Claude behavior', () => {
  const { rpc, agent } = fixture();
  agent.provider = 'claude';
  rpc.emit('notification', { method: 'item/reasoning/textDelta', params: { threadId: agent.id, turnId: agent.turnId, delta: 'Not a Claude SDK event' } });
  assert.equal(agent.lastNativeEventAt, undefined);
});
