import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';

const turn = text => ({ id: 'turn', status: 'completed', items: [{ id: 'input', type: 'userMessage', content: [{ type: 'text', text }] }] });
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const rpc = new EventEmitter(); rpc.ready = true; const calls = [];
  rpc.call = async (method, params) => { calls.push({ method, params }); assert.equal(method, 'thread/turns/list'); return { data: [turn('Native retained input.')], nextCursor: null }; };
  const workspace = new Workspace(rpc, { beads: null });
  const agent = { id: 'worker', name: 'Example', role: 'worker', canSend: true, thread: { status: { type: 'idle' } }, messages: [], tasks: [], workers: [], questions: [], turnId: null, tracker: { tasks: [{ id: 'work-1', state: 'in_progress' }] }, reportIntervalMinutes: 15 };
  workspace.agents.set(agent.id, agent);
  workspace.addItem(agent, { id: 'old-input', type: 'userMessage', content: [{ type: 'text', text: 'Previously visible input.' }] }, 'old-turn');
  return { rpc, calls, workspace, agent };
}

test('external native history changes only trigger observation and preserve task/report settings', async () => {
  const f = fixture(), tracker = f.agent.tracker;
  f.agent.questions = [{ id: 7, method: 'item/tool/requestUserInput', params: { threadId: 'worker' } }];
  f.workspace.notification({ method: 'thread/reverted', params: { threadId: 'worker' } });
  assert.deepEqual(f.agent.messages, [], 'old file/item bodies are immediately invalidated');
  await tick();
  assert.deepEqual(f.calls.map(call => call.method), ['thread/turns/list']);
  assert.equal(f.calls[0].params.itemsView, 'full'); assert.equal(f.agent.messages[0].text, 'Native retained input.');
  assert.equal(f.agent.questions[0].id, 7); assert.equal(f.agent.tracker, tracker); assert.equal(f.agent.reportIntervalMinutes, 15);
  assert.equal(Object.hasOwn(f.agent.messages[0], 'rewindable'), false);
});

test('a history read predating an external change cannot resurrect the previous transcript', async () => {
  const f = fixture(); let finishOld;
  f.rpc.call = async method => { f.calls.push({ method }); assert.equal(method, 'thread/turns/list'); return new Promise(resolve => { finishOld = resolve; }); };
  const oldRead = f.workspace.history('worker');
  f.rpc.call = async method => { f.calls.push({ method }); assert.equal(method, 'thread/turns/list'); return { data: [turn('Current native input.')], nextCursor: null }; };
  f.workspace.notification({ method: 'thread/reverted', params: { threadId: 'worker' } });
  await tick();
  finishOld({ data: [turn('Obsolete input.')], nextCursor: null }); await oldRead;
  assert.deepEqual(f.agent.messages.map(message => message.text), ['Current native input.']);
  assert.deepEqual(f.calls.map(call => call.method), ['thread/turns/list', 'thread/turns/list']);
});

test('unavailable external native history is visible without replay, mutation or answering a request', async () => {
  const f = fixture();
  f.rpc.call = async method => { f.calls.push({ method }); throw new Error('Native history unavailable.'); };
  f.workspace.notification({ method: 'thread/reverted', params: { threadId: 'worker' } }); await tick();
  assert.equal(f.agent.observeError, 'Native history unavailable.'); assert.deepEqual(f.agent.messages, []);
  assert.deepEqual(f.calls.map(call => call.method), ['thread/turns/list']);
  assert.equal(Object.hasOwn(f.agent, 'rewindError'), false);
});

test('successful current external history refresh clears the preceding observation failure', async () => {
  const f = fixture(), read = f.rpc.call;
  f.rpc.call = async () => { throw new Error('Temporary history failure.'); };
  f.workspace.notification({ method: 'thread/reverted', params: { threadId: 'worker' } }); await tick();
  assert.equal(f.agent.observeError, 'Temporary history failure.');
  f.rpc.call = read;
  f.workspace.notification({ method: 'thread/reverted', params: { threadId: 'worker' } }); await tick();
  assert.equal(f.agent.observeError, null); assert.equal(f.agent.messages[0].text, 'Native retained input.');
});

test('late external refresh success or failure cannot overwrite a newer refresh outcome', async () => {
  for (const oldFails of [false, true]) {
    const f = fixture(); let finish, fail;
    f.rpc.call = async () => new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    f.workspace.notification({ method: 'thread/reverted', params: { threadId: 'worker' } });
    f.rpc.call = async () => { if (!oldFails) throw new Error('Current refresh failed.'); return { data: [turn('Current input.')], nextCursor: null }; };
    f.workspace.notification({ method: 'thread/reverted', params: { threadId: 'worker' } }); await tick();
    if (oldFails) fail(new Error('Obsolete failure.')); else finish({ data: [turn('Obsolete input.')], nextCursor: null });
    await tick();
    assert.equal(f.agent.observeError, oldFails ? null : 'Current refresh failed.');
    assert.deepEqual(f.agent.messages.map(message => message.text), oldFails ? ['Current input.'] : []);
  }
});
