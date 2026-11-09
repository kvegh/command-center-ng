import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';

const input = (id, text) => ({ id, type: 'userMessage', content: [{ type: 'text', text }] });
const reply = (id, text) => ({ id, type: 'agentMessage', text });
const turn = (id, ...items) => ({ id, status: 'completed', itemsView: 'full', items });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
async function fixture() {
  const rpc = new EventEmitter(); rpc.ready = true;
  const w = new Workspace(rpc, { beads: null });
  const thread = { id: 'worker', ephemeral: false, turns: [], status: { type: 'idle' }, canAcceptDirectInput: true };
  const agent = { id: thread.id, name: 'Example', role: 'worker', canSend: true, thread, messages: [], tasks: [], workers: [], questions: [], turnId: null, tracker: { tasks: [{ id: 'work-1', state: 'in_progress' }] } };
  w.agents.set(agent.id, agent); w.watched.add(agent.id);
  const calls = [], state = { turns: [turn('t3', input('u3', 'Later work'), reply('a3', 'Later answer')), turn('t2', input('u2a', 'First input in this turn'), input('u2b', '  Edit this input\nwithout losing whitespace  '), reply('a2', 'Answer'), { id: 'command', type: 'commandExecution', command: 'example-command', status: 'completed' }, { id: 'reason', type: 'reasoning', summary: ['PRIVATE_REASONING_MUST_NOT_APPEAR'] }), turn('t1', input('u1', 'Retained input'), reply('a1', 'Retained answer'))], reverted: false };
  rpc.call = async (method, params) => {
    calls.push({ method, params });
    if (method === 'thread/read') return { thread: agent.thread };
    if (method === 'thread/resume') return { thread: { ...agent.thread, status: { type: 'idle' } } };
    if (method === 'thread/turns/list') return { data: structuredClone(state.turns), nextCursor: null };
    if (method === 'thread/revert') {
      const index = state.turns.findIndex(turn => turn.id === params.beforeTurnId);
      state.turns = state.turns.slice(index + 1); state.reverted = true;
      rpc.emit('notification', { method: 'thread/reverted', params: { threadId: 'worker' } });
      return { thread: { ...agent.thread, turns: [] }, turnsBackwardsCursor: state.turns.length ? 'retained-tail' : null, itemsBackwardsCursor: null };
    }
    throw new Error(`Unexpected native method ${method}`);
  };
  await w.history(agent.id);
  return { w, rpc, agent, state, calls, preview: () => w.rewindPreview('worker', { messageId: 'u2b', turnId: 't2' }) };
}

test('preview includes the selected real input and every affected whole turn without native writes', async () => {
  const f = await fixture(), preview = await f.preview();
  assert.deepEqual(preview.affectedTurns.map(turn => turn.id), ['t2', 't3']);
  assert.deepEqual(preview.affectedTurns[0].userInputs.map(message => message.messageId), ['u2a', 'u2b']);
  assert.equal(preview.selected.text, '  Edit this input\nwithout losing whitespace  ');
  assert.equal(preview.turnCount, 2); assert.equal(preview.messageCount, 7);
  assert.match(preview.warning, /entire selected native turn/); assert.match(preview.warning, /Beads task states are not undone/);
  assert.match(preview.warning, /schedules remain active/);
  assert.ok(!JSON.stringify(preview).includes('PRIVATE_REASONING_MUST_NOT_APPEAR'));
  assert.ok(!f.calls.some(call => ['thread/revert', 'thread/resume', 'turn/start'].includes(call.method)));
  assert.equal(f.agent.messages.find(message => message.id === 'u2b').rewindable, true);
});

test('explicit confirmation performs exact native whole-turn revert, replaces cache and returns an unsent editable draft', async () => {
  const f = await fixture(), preview = await f.preview(), tracker = structuredClone(f.agent.tracker);
  const result = await f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true });
  assert.deepEqual(result, { id: 'worker', draftText: preview.selected.text, rewound: true });
  assert.deepEqual(f.calls.find(call => call.method === 'thread/revert').params, { threadId: 'worker', beforeTurnId: 't2' });
  assert.deepEqual(f.agent.messages.map(message => message.id), ['u1', 'a1']);
  assert.deepEqual(f.agent.tracker, tracker); assert.equal(f.agent.lastCompletedTurnId, 't1');
  assert.ok(f.calls.some(call => call.method === 'thread/turns/list' && call.params.cursor === 'retained-tail'));
  assert.ok(!f.calls.some(call => ['turn/start', 'turn/steer', 'thread/rollback', 'thread/fork'].includes(call.method)));
  assert.equal(f.w.snapshot().agents[0].rewinding, false);
  assert.throws(() => f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true }), /fresh preview/);
});

test('first-turn rewind correctly hydrates empty retained history', async () => {
  const f = await fixture();
  const preview = await f.w.rewindPreview('worker', { messageId: 'u1', turnId: 't1' });
  await f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true });
  assert.deepEqual(f.agent.messages, []); assert.equal(f.agent.lastCompletedTurnId, null);
});

test('generated controls, assistant messages and attached/image inputs cannot be rewind targets', async () => {
  for (const item of [reply('u2b', 'Assistant'), input('u2b', '[Command Center coordinator]\nSummary'), { ...input('u2b', 'Report'), clientId: 'ccng-report-01234567-1234-1234-1234-123456789012' }, { ...input('u2b', 'Photo'), content: [{ type: 'text', text: 'Photo' }, { type: 'image', url: 'data:image/png;base64,example' }] }, { ...input('u2b', 'Skill'), content: [{ type: 'skill', name: 'example', path: '/example/skill' }] }]) {
    const f = await fixture(); f.state.turns[1].items[1] = item;
    await assert.rejects(f.preview(), /original text-only user input/);
    assert.ok(!f.calls.some(call => call.method === 'thread/revert'));
  }
});

test('busy, pending, external, coordinator, Claude and branch handoff workers cannot rewind', async () => {
  for (const setup of [f => { f.agent.turnId = 'running'; }, f => { f.agent.questions = [{ id: 7 }]; }, f => { f.agent.thread.canAcceptDirectInput = false; }, f => { f.agent.role = 'coordinator'; }, f => { f.agent.provider = 'claude'; }, f => { f.agent.handoff = { phase: 'failed' }; }, f => { f.w.returnJobs.set('worker', {}); }]) {
    const f = await fixture(); setup(f);
    assert.throws(() => f.preview()); assert.ok(!f.calls.some(call => call.method === 'thread/revert'));
    assert.ok(f.w.snapshot().agents[0].rewindBlockedReason);
  }
});

test('queued, pending and uncertain reports block rewind without cancelling controls or schedules', async () => {
  const f = await fixture();
  const rows = [{ kind: 'report', error: 'Acceptance uncertain' }];
  f.w.coordinator = { deliveries: new Map([['worker', rows]]), reportPending: new Set(), reportResponses: new Map(), snapshot: () => null, reportState: () => null };
  assert.throws(() => f.preview(), /queued, pending or uncertain/);
  assert.equal(f.w.coordinator.deliveries.get('worker'), rows);
  assert.ok(!f.calls.some(call => call.method === 'thread/revert'));
});

test('changed native suffix, stale token and missing explicit confirmation cannot mutate history', async () => {
  const f = await fixture(), preview = await f.preview();
  assert.throws(() => f.w.rewind('worker', { previewToken: preview.previewToken }), /explicitly confirm/);
  assert.throws(() => f.w.rewind('worker', { previewToken: 'wrong', confirm: true }), /fresh preview/);
  f.state.turns[0].items.push(input('u3b', 'New input since preview'));
  await assert.rejects(f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true }), /history changed after preview/);
  assert.ok(!f.calls.some(call => call.method === 'thread/revert'));
});

test('pending requests or ownership changes arriving during native preflight stop the exact write', async () => {
  for (const change of [f => { f.agent.questions.push({ id: 'late' }); }, f => { f.agent.canSend = false; }]) {
    const f = await fixture(), preview = await f.preview(), original = f.rpc.call;
    f.rpc.call = async (method, params) => { const result = await original(method, params); if (method === 'thread/turns/list') change(f); return result; };
    await assert.rejects(f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true }));
    assert.ok(!f.calls.some(call => call.method === 'thread/revert'));
  }
});

test('an explicit confirmation can resume an unloaded worker but never starts a model turn', async () => {
  const f = await fixture(); f.agent.observingOnly = true; f.agent.thread.status = { type: 'notLoaded' };
  const preview = await f.preview(); assert.ok(!f.calls.some(call => call.method === 'thread/resume'));
  await f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true });
  assert.equal(f.calls.filter(call => call.method === 'thread/resume').length, 1);
  assert.ok(!f.calls.some(call => call.method === 'turn/start'));
});

test('uncertain native acknowledgement never retries the destructive write from the same preview', async () => {
  const f = await fixture(), preview = await f.preview(), original = f.rpc.call;
  let attempts = 0;
  f.rpc.call = async (method, params) => { if (method === 'thread/revert') { attempts++; throw new Error('Native acknowledgement lost'); } return original(method, params); };
  await assert.rejects(f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true }), /may already have been applied/);
  assert.throws(() => f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true }), /fresh preview/);
  assert.equal(attempts, 1);
});

test('in-flight rewind blocks new input, close, branching, model/task-link writes and handoff', async () => {
  const f = await fixture(), preview = await f.preview(), pending = deferred(), original = f.rpc.call;
  f.rpc.call = async (method, params) => { if (method === 'thread/revert') await pending.promise; return original(method, params); };
  const rewind = f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true });
  assert.throws(() => f.w.close('worker'), /rewind operation/);
  await assert.rejects(f.w.send('worker', 'New input'), /rewind operation/);
  await assert.rejects(f.w.fork('worker'), /rewind operation/);
  await assert.rejects(f.w.updateModel('worker', {}), /rewind operation/);
  await assert.rejects(f.w.linkTasks('worker', []), /rewind operation/);
  assert.throws(() => f.w.startHandoff('worker'), /rewind operation/);
  pending.resolve(); await rewind;
});

test('a history read begun before native rewind cannot merge deleted messages into the replacement cache', async () => {
  const f = await fixture(), pending = deferred(), original = f.rpc.call;
  const old = structuredClone(f.state.turns); let intercept = true;
  f.rpc.call = async (method, params) => {
    if (method === 'thread/turns/list' && intercept) { intercept = false; await pending.promise; return { data: old, nextCursor: null }; }
    return original(method, params);
  };
  const staleHistory = f.w.history('worker'), preview = await f.preview();
  await f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true });
  pending.resolve(); await staleHistory;
  assert.deepEqual(f.agent.messages.map(message => message.id), ['u1', 'a1']);
});

test('late thread/reverted notification during hydration cannot invalidate the confirmed operation', async () => {
  const f = await fixture(), preview = await f.preview(), original = f.rpc.call;
  f.rpc.call = async (method, params) => {
    if (method === 'thread/turns/list' && f.state.reverted) f.rpc.emit('notification', { method: 'thread/reverted', params: { threadId: 'worker' } });
    return original(method, params);
  };
  assert.equal((await f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true })).rewound, true);
});

test('prepared undelivered branch summaries are preserved and block rewind', async () => {
  const f = await fixture(), summary = { text: 'Prepared handoff', delivered: false, turnId: 't3' };
  f.agent.returnSummary = summary;
  assert.throws(() => f.preview(), /prepared branch handoff/);
  assert.equal(f.agent.returnSummary, summary);
});

test('partial or summary-only turn payloads cannot stand in for complete affected history', async () => {
  for (const itemsView of ['summary', 'notLoaded', undefined]) {
    const f = await fixture(); f.state.turns[0].itemsView = itemsView;
    await assert.rejects(f.preview(), /not fully loaded/);
    assert.ok(!f.calls.some(call => call.method === 'thread/revert'));
  }
});

test('preview paginates the entire affected suffix and verifies its retained anchor across page boundaries', async () => {
  const f = await fixture(), original = f.rpc.call;
  f.rpc.call = async (method, params) => {
    if (method === 'thread/turns/list' && !f.state.reverted) {
      if (!params.cursor) return { data: [structuredClone(f.state.turns[0])], nextCursor: 'target-page' };
      if (params.cursor === 'target-page') return { data: [structuredClone(f.state.turns[1])], nextCursor: 'older-page' };
      return { data: [structuredClone(f.state.turns[2])], nextCursor: null };
    }
    return original(method, params);
  };
  const preview = await f.preview();
  assert.deepEqual(preview.affectedTurns.map(turn => turn.id), ['t2', 't3']);
  assert.equal((await f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true })).rewound, true);
});

test('a stale status read cannot hide newly active native work', async () => {
  const f = await fixture(), preview = await f.preview(), original = f.rpc.call;
  f.rpc.call = async (method, params) => {
    const result = await original(method, params);
    if (method === 'thread/read') {
      const stale = structuredClone(result);
      f.rpc.emit('notification', { method: 'thread/status/changed', params: { threadId: 'worker', status: { type: 'active' } } });
      return stale;
    }
    return result;
  };
  await assert.rejects(f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true }), /activity changed/);
  assert.ok(!f.calls.some(call => call.method === 'thread/revert'));
});

test('new native items arriving after suffix validation prevent the destructive write', async () => {
  const f = await fixture(), preview = await f.preview(), original = f.rpc.call; let reads = 0;
  f.rpc.call = async (method, params) => {
    const result = await original(method, params);
    if (method === 'thread/read' && ++reads === 3) f.rpc.emit('notification', { method: 'item/completed', params: { threadId: 'worker', turnId: 't3', item: input('u3-new', 'Newer input') } });
    return result;
  };
  await assert.rejects(f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true }), /history changed before rewind/);
  assert.ok(!f.calls.some(call => call.method === 'thread/revert'));
});

test('an external native rewrite invalidates a suffix already validated by the confirmation flow', async () => {
  const f = await fixture(), preview = await f.preview(), original = f.rpc.call; let reads = 0;
  f.rpc.call = async (method, params) => {
    const result = await original(method, params);
    if (method === 'thread/read' && ++reads === 3) f.rpc.emit('notification', { method: 'thread/reverted', params: { threadId: 'worker' } });
    return result;
  };
  await assert.rejects(f.w.rewind('worker', { previewToken: preview.previewToken, confirm: true }), /history changed before rewind|activity changed/);
  assert.ok(!f.calls.some(call => call.method === 'thread/revert'));
});
