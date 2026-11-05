import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace, input } from '../server/workspace.mjs';
import { markInternalInput, reportMessageFlags } from '../server/report-messages.mjs';

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
  for (const [kind, flags] of [['report', { internalReport: true }], ['report-setting', { internalReportControl: true }], ['event', { internalCoordinatorEvent: true }]]) {
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
  const f = await fixture();
  const original = nativeInput('report-setting');
  f.workspace.addItem(f.agent, original, 'active-turn', false, { live: true });
  const plain = { ...original, clientId: undefined };
  f.workspace.notification({ method: 'item/completed', params: { threadId: 'worker', turnId: 'active-turn', item: plain } });
  assert.equal(f.agent.messages[0].internalReportControl, true);
  f.rpc.items = [plain];
  await f.workspace.history('worker');
  assert.equal(f.agent.messages[0].internalReportControl, true);
  assert.deepEqual(reportMessageFlags({ ...plain, id: 'different-user-item' }, f.agent.messages[0]), {}, 'a previous record cannot hide another item');
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
  rpc.items = ['report', 'report-setting', 'event'].map(kind => {
    const item = nativeInput(kind);
    return { id: item.id, type: item.type, content: markInternalInput(item.content, item.clientId) };
  });
  rpc.items.push({ id: 'real-user', type: 'userMessage', content: input(body) }, { id: 'report-answer', type: 'agentMessage', text: '🟩 Done: useful progress.' });
  const f = await fixture(rpc);
  assert.equal(f.agent.messages[0].internalReport, true);
  assert.equal(f.agent.messages[1].internalReportControl, true);
  assert.equal(f.agent.messages[2].internalCoordinatorEvent, true);
  assert.equal(f.agent.messages[3].internalReport, undefined);
  assert.equal(f.agent.messages[4].internalReport, undefined);
  assert.equal(f.agent.messages.length, 5, 'native records remain available; only presentation is silent');
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
  assert.equal(sent[0][2].report, true); assert.equal(sent[0][2].priority, 'next');
  assert.equal(sent[1][2].reportSetting, true); assert.equal(sent[1][2].priority, 'next');
  assert.equal(sent[2][2].report, false); assert.equal(sent[2][2].reportSetting, false); assert.equal(sent[2][2].priority, undefined);
});
