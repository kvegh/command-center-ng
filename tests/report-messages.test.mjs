import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace, input } from '../server/workspace.mjs';
import { markInternalInput, reportMessageFlags } from '../server/report-messages.mjs';
import { isCoordinatorMessage } from '../server/coordinator.mjs';
import { WORKER_TASK_PING_REQUEST } from '../server/worker-instructions.mjs';

const id = '12345678-1234-1234-1234-123456789abc';
const body = '[Command Center coordinator]\nStandard Task Report. 🟩 Done.';
const nativeInput = (kind = 'report') => ({ id: `native-${kind}`, type: 'userMessage', clientId: `ccng-${kind}-${id}`, content: input(body) });

class Rpc extends EventEmitter {
  ready = true;
  items = [];
  calls = [];
  sequence = 0;
  async call(method, params) {
    this.calls.push({ method, params });
    if (method === 'thread/read') return { thread: { id: 'worker', cwd: '/tmp', status: { type: 'idle' } } };
    if (method === 'thread/turns/list') return { data: [{ id: 'history-turn', status: 'completed', items: this.items }], nextCursor: null };
    if (['turn/start', 'turn/steer'].includes(method)) {
      const turnId = params.expectedTurnId || 'active-turn';
      const item = { id: `input-${++this.sequence}`, type: 'userMessage', clientId: params.clientUserMessageId, content: params.input };
      this.items.push(item);
      this.emit('notification', { method: 'item/completed', params: { threadId: 'worker', turnId, item } });
      return method === 'turn/start' ? { turn: { id: turnId } } : { turnId };
    }
    throw new Error('Unexpected fixture method: ' + method);
  }
}

async function fixture(rpc = new Rpc()) {
  const workspace = new Workspace(rpc, { beads: null });
  const agent = await workspace.open('worker', { observeOnly: true });
  agent.observingOnly = false;
  workspace.instructionContext = async () => ({});
  return { rpc, workspace, agent };
}

test('typed report identities retain exact native text and coherent UTF-8 span metadata', () => {
  for (const [kind, flags] of [['report', { internalReport: true }], ['report-setting', { internalReportControl: true }], ['event', { internalCoordinatorEvent: true }], ['task-ping', { internalTaskPing: true }]]) {
    const item = nativeInput(kind);
    assert.deepEqual(reportMessageFlags(item), flags);
    const marked = markInternalInput(item.content, item.clientId);
    assert.equal(marked[0].text, body);
    assert.deepEqual(item.content[0].text_elements, [], 'adding metadata does not mutate the original input');
    assert.deepEqual(marked[0].text_elements, [{ byteRange: { start: 0, end: Buffer.byteLength(body, 'utf8') }, placeholder: item.clientId }]);
    assert.deepEqual(reportMessageFlags({ ...item, clientId: null, content: marked }), flags, 'full native history can classify the typed marker without a clientId');
  }
  const ordinary = input(body);
  assert.equal(markInternalInput(ordinary, 'ordinary-client-id'), ordinary);
  const spanned = [{ type: 'text', text: 'existing span', text_elements: [{ byteRange: { start: 0, end: 8 }, placeholder: 'Existing element' }] }];
  assert.equal(markInternalInput(spanned, `ccng-report-${id}`), spanned, 'existing user interface spans are preserved');
});

test('matching prose, invalid markers and assistant output never become internal inputs', () => {
  const item = nativeInput(); delete item.clientId;
  assert.deepEqual(reportMessageFlags(item), {});
  assert.deepEqual(reportMessageFlags({ ...item, internalReport: true }), {}, 'an untyped property is not native provenance');
  const marked = markInternalInput(item.content, `ccng-report-${id}`);
  const marker = marked[0].text_elements[0];
  for (const changed of [
    { ...marker, placeholder: 'ccng-report-not-a-native-id' },
    { ...marker, byteRange: { start: 0, end: body.length } },
    { ...marker, byteRange: { start: 1, end: Buffer.byteLength(body, 'utf8') } },
    { ...marker, byteRange: { start: 0, end: Buffer.byteLength(body, 'utf8') + 1 } }
  ]) assert.deepEqual(reportMessageFlags({ ...item, content: [{ ...marked[0], text_elements: [changed] }] }), {});
  assert.deepEqual(reportMessageFlags({ ...item, type: 'agentMessage', clientId: `ccng-report-${id}` }), {});
});

test('silent input flags survive completion and history updates that omit metadata for the same item', async () => {
  for (const [kind, flag] of [['report-setting', 'internalReportControl'], ['task-ping', 'internalTaskPing']]) {
    const f = await fixture();
    const original = nativeInput(kind);
    f.workspace.addItem(f.agent, original, 'active-turn', false, { live: true });
    const plain = { ...original, clientId: undefined };
    f.workspace.notification({ method: 'item/completed', params: { threadId: 'worker', turnId: 'active-turn', item: plain } });
    assert.equal(f.agent.messages[0][flag], true);
    f.rpc.items = [plain];
    await f.workspace.history('worker');
    assert.equal(f.agent.messages[0][flag], true);
    assert.deepEqual(reportMessageFlags({ ...plain, id: 'different-user-item' }, f.agent.messages[0]), {}, 'a previous record cannot hide another item');
  }
});

test('start and active steering use typed report/control/event identities while normal messages remain plain', async () => {
  const f = await fixture();
  for (const [options, flag] of [[{ report: true }, 'internalReport'], [{ reportSetting: true }, 'internalReportControl'], [{ coordinatorEvent: true }, 'internalCoordinatorEvent']]) {
    await f.workspace.send('worker', body, options);
    const call = f.rpc.calls.at(-1);
    assert.deepEqual(reportMessageFlags({ type: 'userMessage', id: 'native', content: call.params.input }), { [flag]: true });
    assert.equal(f.agent.messages.at(-1)[flag], true);
    assert.equal(call.params.input[0].text, body);
  }
  assert.deepEqual(f.rpc.calls.filter(call => ['turn/start', 'turn/steer'].includes(call.method)).map(call => call.method), ['turn/start', 'turn/steer', 'turn/steer']);
  await f.workspace.send('worker', body);
  assert.equal(f.rpc.calls.at(-1).params.clientUserMessageId, undefined);
  assert.deepEqual(f.rpc.calls.at(-1).params.input, input(body));
  assert.equal(f.agent.messages.at(-1).internalReport, undefined);
});

test('fresh read-only restoration classifies native span markers without any app-memory mapping', async () => {
  const rpc = new Rpc();
  rpc.items = ['report', 'report-setting', 'event', 'task-ping'].map(kind => {
    const item = nativeInput(kind);
    return { id: item.id, type: item.type, content: markInternalInput(item.content, item.clientId) };
  });
  rpc.items.push({ id: 'real-user', type: 'userMessage', content: input(body) }, { id: 'report-answer', type: 'agentMessage', text: '🟩 Done: useful progress.' });
  const f = await fixture(rpc);
  assert.equal(f.agent.messages[0].internalReport, true);
  assert.equal(f.agent.messages[1].internalReportControl, true);
  assert.equal(f.agent.messages[2].internalCoordinatorEvent, true);
  assert.equal(f.agent.messages[3].internalTaskPing, true);
  assert.equal(f.agent.messages[4].internalReport, undefined);
  assert.equal(f.agent.messages[5].internalReport, undefined);
  assert.equal(f.agent.messages[4].internalTaskPing, undefined);
  assert.equal(f.agent.messages[5].internalTaskPing, undefined);
  assert.equal(f.agent.messages.length, 6, 'native records remain available; only presentation is silent');
  assert.equal(rpc.calls.some(call => ['turn/start', 'turn/steer', 'thread/resume'].includes(call.method)), false);
});

test('Claude receives explicit report/control transport options without changing user-message options', async () => {
  const f = await fixture();
  const sent = [];
  f.agent.provider = 'claude';
  f.workspace.claude = { available: true, send: async (...args) => { sent.push(args); } };
  await f.workspace.send('worker', body, { report: true });
  await f.workspace.send('worker', body, { reportSetting: true });
  await f.workspace.send('worker', body);
  await assert.rejects(f.workspace.send('worker', body, { taskPing: true }), /only for Codex workers/);
  assert.equal(sent[0][2].report, true); assert.equal(sent[0][2].priority, 'next');
  assert.equal(sent[1][2].reportSetting, true); assert.equal(sent[1][2].priority, 'next');
  assert.equal(sent[2][2].report, false); assert.equal(sent[2][2].reportSetting, false); assert.equal(sent[2][2].priority, undefined);
  assert.equal(sent.length, 3, 'task checks do not add postponed Claude transport behavior');
});

test('silent task checks carry native identity without renaming branches and steer only a known active native turn', async () => {
  const f = await fixture();
  f.agent.freshBranch = true;
  const text = '[Command Center coordinator]\n' + WORKER_TASK_PING_REQUEST;
  await f.workspace.send('worker', text, { taskPing: true });
  const call = f.rpc.calls.at(-1);
  assert.equal(call.method, 'turn/start');
  assert.match(call.params.clientUserMessageId, /^ccng-task-ping-[a-f0-9-]{36}$/);
  assert.equal(call.params.input[0].text, text);
  assert.equal(f.agent.messages.at(-1).internalTaskPing, true);
  assert.equal(f.agent.freshBranch, true);
  assert.equal(f.rpc.calls.some(call => call.method === 'thread/name/set'), false);
  await f.workspace.send('worker', text, { taskPing: true });
  const steer = f.rpc.calls.at(-1);
  assert.equal(steer.method, 'turn/steer');
  assert.equal(steer.params.expectedTurnId, 'active-turn');
  assert.equal(steer.params.input[0].text, text);
  assert.equal(f.agent.messages.at(-1).internalTaskPing, true);
  assert.equal(f.rpc.calls.some(call => call.method === 'turn/interrupt'), false);
  const count = f.rpc.calls.length;
  f.agent.turnId = null;
  await assert.rejects(f.workspace.send('worker', text, { taskPing: true }), /active native turn identity/);
  assert.equal(f.rpc.calls.length, count);
  f.agent.thread.status = { type: 'idle' };
  const question = { id: 'pending-choice', method: 'item/tool/requestUserInput', params: {} };
  f.agent.questions = [question];
  await assert.rejects(f.workspace.send('worker', text, { taskPing: true }), /pending question/);
  assert.deepEqual(f.agent.questions, [question]);
  assert.equal(f.rpc.calls.length, count, 'task check never answers, reloads or bypasses a pending request');
});

test('task checks recheck native turn identity and pending requests after asynchronous context loading', async () => {
  for (const change of ['unknown-turn', 'pending-request']) {
    const f = await fixture();
    f.workspace.instructionContext = async () => {
      if (change === 'unknown-turn') { f.agent.thread.status = { type: 'active' }; f.agent.turnId = null; }
      else f.agent.questions = [{ id: 'new-pending-request' }];
      return {};
    };
    await assert.rejects(f.workspace.send('worker', WORKER_TASK_PING_REQUEST, { taskPing: true }), /active native turn identity|pending request/);
    assert.equal(f.rpc.calls.some(call => ['turn/start', 'turn/steer', 'turn/interrupt'].includes(call.method)), false);
  }
});

test('task-ping provenance excludes real-user authority without hiding identical real-user prose or useful replies', async () => {
  const f = await fixture();
  const item = { id: 'silent-check', type: 'userMessage', clientId: `ccng-task-ping-${id}`, content: input(WORKER_TASK_PING_REQUEST) };
  f.workspace.addItem(f.agent, item, 'check-turn');
  const generated = f.agent.messages.at(-1);
  assert.equal(generated.internalTaskPing, true);
  assert.equal(isCoordinatorMessage(generated), true, 'typed internal checks are not real user authority even without their display prefix');
  f.workspace.addItem(f.agent, { ...item, id: 'actual-user', clientId: undefined }, 'user-turn');
  assert.equal(f.agent.messages.at(-1).internalTaskPing, undefined);
  assert.equal(isCoordinatorMessage(f.agent.messages.at(-1)), false);
  f.workspace.addItem(f.agent, { id: 'useful-result', type: 'agentMessage', text: 'Implemented the remaining authorized fix.', clientId: item.clientId }, 'check-turn');
  assert.equal(f.agent.messages.at(-1).internalTaskPing, undefined, 'useful assistant output stays visible even if native metadata contains an internal client ID');
  for (const clientId of ['ccng-task-ping-invalid', `ccng-task-ping-${id}-extra`]) assert.deepEqual(reportMessageFlags({ ...item, clientId }), {});
  assert.deepEqual(reportMessageFlags({ ...item, clientId: undefined, internalTaskPing: true }), {}, 'untyped input flags are not native provenance');
});

test('read-only restoration keeps the latest native interrupted or failed outcome without guessing from idle', async () => {
  class TerminalRpc extends Rpc {
    status = 'interrupted';
    async call(method, params) {
      if (method === 'thread/turns/list') {
        this.calls.push({ method, params });
        return { data: [{ id: 'latest-turn', status: this.status, items: [] }, { id: 'older-turn', status: 'completed', items: [] }], nextCursor: 'older' };
      }
      return super.call(method, params);
    }
  }
  for (const status of ['interrupted', 'failed', 'completed', undefined]) {
    const rpc = new TerminalRpc(); rpc.status = status;
    const f = await fixture(rpc);
    assert.deepEqual(f.agent.finishedTurn, status ? { id: 'latest-turn', status } : undefined);
    assert.equal(rpc.calls.some(call => ['turn/start', 'turn/steer', 'thread/resume'].includes(call.method)), false);
    const current = { id: 'newer-live-turn', status: 'interrupted' };
    f.agent.finishedTurn = current;
    await f.workspace.history('worker', 'older');
    assert.equal(f.agent.finishedTurn, current, 'older history cannot replace the current stop outcome');
  }
});

test('history arriving after a live turn event cannot overwrite its finished or active state', async () => {
  const f = await fixture();
  const call = f.rpc.call.bind(f.rpc);
  let resolve;
  f.rpc.call = (method, params) => method === 'thread/turns/list' ? new Promise(done => { resolve = done; }) : call(method, params);
  const history = f.workspace.history('worker');
  f.workspace.notification({ method: 'turn/started', params: { threadId: 'worker', turn: { id: 'new-live-turn' } } });
  resolve({ data: [{ id: 'old-native-turn', status: 'interrupted', items: [] }], nextCursor: null });
  await history;
  assert.equal(f.agent.turnId, 'new-live-turn');
  assert.equal(f.agent.thread.status.type, 'active');
  assert.deepEqual(f.agent.finishedTurn, { id: 'history-turn', status: 'completed' });

  const completedHistory = f.workspace.history('worker');
  f.workspace.notification({ method: 'turn/completed', params: { threadId: 'worker', turn: { id: 'new-live-turn', status: 'failed' } } });
  resolve({ data: [{ id: 'old-native-turn', status: 'completed', items: [] }], nextCursor: null });
  await completedHistory;
  assert.deepEqual(f.agent.finishedTurn, { id: 'new-live-turn', status: 'failed' });
  assert.equal(f.agent.turnId, null);
});
