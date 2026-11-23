import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeSessions } from '../server/claude.mjs';

const sessionId = '11111111-2222-4333-8444-555555555555';
const id = 'claude-' + sessionId;
const requestId = '22222222-2222-4333-8444-555555555555';
const nextId = '33333333-2222-4333-8444-555555555555';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) {
  for (let attempt = 0; attempt < 50; attempt++) { if (check()) return; await tick(); }
  assert.ok(check(), 'Expected native event was not processed.');
}
class Events {
  values = []; waiting = null; ended = false;
  push(value) { if (this.waiting) { this.waiting({ value, done: false }); this.waiting = null; } else this.values.push(value); }
  next() { if (this.values.length) return Promise.resolve({ value: this.values.shift(), done: false }); if (this.ended) return Promise.resolve({ done: true }); return new Promise(resolve => { this.waiting = resolve; }); }
  close() { this.ended = true; this.waiting?.({ done: true }); this.waiting = null; }
  [Symbol.asyncIterator]() { return this; }
}
async function fixture() {
  const history = [], inputs = [], queries = [], controls = [], active = [];
  let closeOnEof = true;
  const info = { sessionId, cwd: '/example/project', summary: 'Branch work' };
  const sdk = {
    listSessions: async () => [info], getSessionInfo: async () => info,
    getSessionMessages: async (_id, { offset = 0, limit = Infinity } = {}) => history.slice(offset, offset + limit),
    renameSession: async () => { controls.push('rename'); },
    query({ prompt, options }) {
      const query = new Events(); query.options = options; queries.push(query);
      query.close = () => { controls.push('force-close'); Events.prototype.close.call(query); };
      void (async () => { for await (const input of prompt) inputs.push(input); controls.push('eof'); if (closeOnEof) Events.prototype.close.call(query); })();
      return query;
    }
  };
  const runtime = new ClaudeSessions({ loadSdk: async () => sdk, executable: async () => '/example/claude', activeSessions: async () => active });
  await runtime.initialize(); const agent = await runtime.open(id);
  const emit = message => queries[0].push({ session_id: sessionId, ...message });
  async function complete(input = inputs.at(-1), text = 'Verified summary') {
    emit({ type: 'system', subtype: 'session_state_changed', state: 'running' });
    if (input) emit(input);
    emit({ type: 'assistant', uuid: 'assistant-' + (input?.uuid || 'other'), parent_tool_use_id: null, message: { content: [{ type: 'text', text }], stop_reason: 'end_turn' } });
    emit({ type: 'result', is_error: false, result: text });
    emit({ type: 'system', subtype: 'session_state_changed', state: 'idle' });
    await until(() => agent.thread.status.type === 'idle' && agent.handoffCompletedSequence > 0);
  }
  return { runtime, agent, sdk, history, inputs, queries, controls, active, emit, complete, holdEof: () => { closeOnEof = false; }, close: () => runtime.shutdown() };
}

test('Claude handback internal messages preserve branch title and caller UUID; requireIdle prevents active enqueue', async () => {
  const f = await fixture();
  try {
    f.agent.freshBranch = true;
    await assert.rejects(f.runtime.send(f.agent, 'checkpoint', { clientMessageId: 'invalid' }), /valid Claude message/);
    assert.equal(f.queries.length, 0);
    await f.runtime.send(f.agent, 'checkpoint', { clientMessageId: requestId, internal: true, requireIdle: true });
    await until(() => f.inputs.length === 1);
    assert.equal(f.inputs[0].uuid, requestId); assert.equal(f.agent.freshBranch, true); assert.deepEqual(f.controls, []);
    await assert.rejects(f.runtime.send(f.agent, 'second checkpoint', { requireIdle: true }), error => error.code === 'native_input_not_sent' && /no longer idle/.test(error.message));
    assert.equal(f.inputs.length, 1);
    assert.equal((await f.runtime.inspectHandoff(f.agent)).safe, false);
    await f.complete();
    const state = await f.runtime.inspectHandoff(f.agent);
    assert.equal(state.safe, true); assert.equal(state.completedSequence, 1);
    assert.deepEqual(state.lastCompleted.messageIds, [requestId]); assert.equal(state.lastCompleted.text, 'Verified summary');
    assert.equal(Object.keys(f.agent).includes('handoffCompletions'), false); assert.equal(Object.keys(f.agent).includes('handoffCompletedSequence'), false);
    await assert.rejects(f.runtime.send(f.agent, 'duplicate', { clientMessageId: requestId }), /already submitted/);
  } finally { await f.close(); }
});

test('Claude handback completion requires exact native input echo and authoritative idle', async () => {
  const f = await fixture();
  try {
    await f.runtime.send(f.agent, 'checkpoint', { clientMessageId: requestId }); await until(() => f.inputs.length);
    f.emit({ ...f.inputs[0], parent_tool_use_id: 'child-agent' });
    f.emit({ ...f.inputs[0], message: { role: 'user', content: 'wrong text' } });
    f.emit({ type: 'system', subtype: 'session_state_changed', state: 'running' });
    f.emit({ type: 'result', is_error: false, result: 'A preceding result' });
    f.emit({ type: 'system', subtype: 'session_state_changed', state: 'idle' });
    await until(() => f.agent.handoffCompletedSequence === 1);
    let state = await f.runtime.inspectHandoff(f.agent);
    assert.equal(state.safe, false); assert.deepEqual(state.queuedInputIds, [requestId]); assert.deepEqual(state.lastCompleted.messageIds, []);
    f.emit(f.inputs[0]); await until(() => f.runtime.runs.get(id).pendingInputs.size === 0);
    assert.equal((await f.runtime.inspectHandoff(f.agent)).safe, false, 'An acknowledgement without a later completion stays unsafe');
    f.emit({ type: 'system', subtype: 'session_state_changed', state: 'running' });
    f.emit({ type: 'result', is_error: false, result: 'Checkpoint done' }); await tick();
    assert.equal(f.agent.handoffCompletedSequence, 1, 'A result alone cannot finish a current runtime turn');
    f.emit({ type: 'system', subtype: 'session_state_changed', state: 'idle' });
    await until(() => f.agent.handoffCompletedSequence === 2);
    state = await f.runtime.inspectHandoff(f.agent); assert.equal(state.safe, true); assert.deepEqual(state.lastCompleted.messageIds, [requestId]);
  } finally { await f.close(); }
});

test('Claude handback native background replacement snapshots guard closure without cancelling tasks', async () => {
  const f = await fixture();
  try {
    await f.runtime.send(f.agent, 'checkpoint'); await until(() => f.inputs.length); await f.complete();
    f.emit({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'shell-1', task_type: 'local_bash', description: 'Build' }] });
    await until(() => f.runtime.runs.get(id).backgroundTasks.size === 1);
    assert.equal((await f.runtime.inspectHandoff(f.agent)).safe, false);
    await assert.rejects(f.runtime.closeForHandoff(f.agent), /background tasks/); assert.deepEqual(f.controls, []);
    f.emit({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
    f.emit({ type: 'system', subtype: 'task_started', task_id: 'shell-1', description: 'Late edge' });
    await until(() => f.runtime.runs.get(id).backgroundTasks.size === 0);
    assert.equal((await f.runtime.inspectHandoff(f.agent)).safe, true, 'Out-of-order edge cannot recreate a completed background task');
    f.emit({ type: 'system', subtype: 'background_tasks_changed', tasks: null });
    await until(() => !f.runtime.runs.get(id).backgroundTrackingValid);
    assert.equal((await f.runtime.inspectHandoff(f.agent)).safe, false);
  } finally { await f.close(); }
});

test('Claude handback receipts use exact persisted main transcript UUID and full text', async () => {
  const f = await fixture();
  try {
    await f.runtime.send(f.agent, 'handoff text', { clientMessageId: requestId }); await until(() => f.inputs.length);
    assert.equal(await f.runtime.handoffReceipt(f.agent, { messageId: requestId, text: 'handoff text' }), false);
    f.history.push({ ...f.inputs[0], parent_tool_use_id: 'child' }, { ...f.inputs[0], message: { content: 'wrong text' } });
    assert.equal(await f.runtime.handoffReceipt(f.agent, { messageId: requestId, text: 'handoff text' }), false);
    f.history.push(f.inputs[0]);
    assert.equal(await f.runtime.handoffReceipt(f.agent, { messageId: requestId, text: 'handoff text' }), true);
    assert.equal(await f.runtime.handoffReceipt(f.agent, { messageId: nextId, text: 'handoff text' }), false);
  } finally { await f.close(); }
});

test('Claude handback closes settled input with EOF, preserves history, and never force-closes', async () => {
  const f = await fixture();
  try {
    await f.runtime.send(f.agent, 'checkpoint'); await until(() => f.inputs.length); f.history.push(f.inputs[0]); await f.complete();
    assert.deepEqual(await f.runtime.closeForHandoff(f.agent), { closed: true, historyPreserved: true });
    assert.deepEqual(f.controls, ['eof']); assert.equal(f.runtime.runs.has(id), false); assert.equal(f.history.length, 1);
    assert.equal(f.runtime.records.get(id), f.agent);
  } finally { await f.close(); }
});

test('Claude handback close timeout keeps the existing process; retry awaits its outcome', async () => {
  const f = await fixture();
  try {
    await f.runtime.send(f.agent, 'checkpoint'); await until(() => f.inputs.length); await f.complete(); f.holdEof();
    const job = f.runtime.runs.get(id);
    await assert.rejects(f.runtime.closeForHandoff(f.agent, { timeoutMs: 5 }), /closure is unconfirmed/);
    assert.equal(f.runtime.runs.get(id), job); assert.equal(job.closing, true); assert.deepEqual(f.controls, ['eof']);
    await assert.rejects(f.runtime.send(f.agent, 'must not restart'), /process is closing/); assert.equal(f.queries.length, 1);
    Events.prototype.close.call(f.queries[0]); await job.done;
    assert.deepEqual(await f.runtime.closeForHandoff(f.agent), { closed: true, historyPreserved: true });
  } finally { await f.close(); }
});

test('Claude handback keeps native pending requests manual and refuses external owners', async () => {
  const f = await fixture();
  try {
    f.active.push(sessionId);
    assert.equal((await f.runtime.inspectHandoff(f.agent)).safe, false);
    await assert.rejects(f.runtime.closeForHandoff(f.agent), /another local process/); assert.equal(f.queries.length, 0);
    f.active.length = 0; await f.runtime.inspectHandoff(f.agent);
    await f.runtime.send(f.agent, 'checkpoint'); await until(() => f.inputs.length); await f.complete();
    void f.queries[0].options.canUseTool('Bash', { command: 'read-project-metadata' }, { requestId: 'approval', toolUseID: 'tool', signal: new AbortController().signal });
    assert.equal(f.agent.questions.length, 1);
    await assert.rejects(f.runtime.closeForHandoff(f.agent), /human response/);
    assert.equal(f.agent.questions.length, 1); assert.deepEqual(f.controls, []);
  } finally { await f.close(); }
});


test('Claude handback rejects a process identity change while fresh external ownership is being inspected', async () => {
  const f = await fixture();
  try {
    let release;
    f.runtime.readActive = () => new Promise(resolve => { release = resolve; });
    const inspection = f.runtime.inspectHandoff(f.agent);
    await until(() => Boolean(release));
    f.runtime.readActive = async () => [];
    await f.runtime.send(f.agent, 'New managed work');
    release([]);
    const state = await inspection;
    assert.equal(state.safe, false); assert.equal(state.status, 'unknown'); assert.match(state.reason, /process changed/);
  } finally { await f.close(); }
});


test('Claude handback retains uncertainty when new native background work appears during EOF closure', async () => {
  const f = await fixture();
  try {
    await f.runtime.send(f.agent, 'checkpoint'); await until(() => f.inputs.length); await f.complete(); f.holdEof();
    const closing = f.runtime.closeForHandoff(f.agent);
    await until(() => f.controls.includes('eof'));
    f.emit({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'late-shell', task_type: 'local_bash', description: 'Late native work' }] });
    await until(() => f.runtime.runs.get(id).backgroundTasks.size === 1);
    Events.prototype.close.call(f.queries[0]);
    await assert.rejects(closing, /without confirming all local work settled/);
    assert.equal((await f.runtime.inspectHandoff(f.agent)).safe, false);
    await assert.rejects(f.runtime.closeForHandoff(f.agent), /without confirming all local work settled/);
    assert.deepEqual(f.controls, ['eof']);
  } finally { await f.close(); }
});


test('Claude known no-send rejects stay retryable while input-stream push failures remain uncertain', async () => {
  const f = await fixture();
  try {
    await f.runtime.send(f.agent, 'checkpoint'); await until(() => f.inputs.length); await f.complete();
    f.emit({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'shell', task_type: 'local_bash', description: 'Work' }] });
    await until(() => f.runtime.runs.get(id).backgroundTasks.size === 1);
    await assert.rejects(f.runtime.send(f.agent, 'summary', { clientMessageId: nextId, requireIdle: true }), error => error.code === 'native_input_not_sent');
    assert.equal(f.runtime.runs.get(id).pendingInputs.has(nextId), false);
    f.emit({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
    await until(() => f.runtime.runs.get(id).backgroundTasks.size === 0);
    await f.runtime.send(f.agent, 'summary', { clientMessageId: nextId, requireIdle: true });
    await until(() => f.inputs.length === 2); assert.equal(f.inputs[1].uuid, nextId);
    const job = f.runtime.runs.get(id); job.inputs.close();
    await assert.rejects(f.runtime.send(f.agent, 'uncertain queue'), error => error.code !== 'native_input_not_sent' && /stream has ended/.test(error.message));
  } finally { await f.close(); }
});


test('Claude internal handback retry tolerates only the matching authoritative completed failure', async () => {
  const f = await fixture();
  try {
    await f.runtime.send(f.agent, 'summary request', { clientMessageId: requestId, internal: true, requireIdle: true }); await until(() => f.inputs.length);
    f.emit({ type: 'system', subtype: 'session_state_changed', state: 'running' }); f.emit(f.inputs[0]);
    f.emit({ type: 'result', is_error: true, errors: ['Provider could not finish this request'] });
    f.emit({ type: 'system', subtype: 'session_state_changed', state: 'idle' });
    await until(() => f.agent.handoffCompletedSequence === 1);
    assert.equal((await f.runtime.inspectHandoff(f.agent)).safe, false);
    assert.equal(f.agent.handoffCompletions[0].error, f.agent.runError);
    await assert.rejects(f.runtime.send(f.agent, 'ordinary retry', { clientMessageId: nextId, requireIdle: true }), error => error.code === 'native_input_not_sent');
    const knownError = f.agent.runError;
    f.agent.runError = 'Claude session stopped: transport failure';
    await assert.rejects(f.runtime.send(f.agent, 'unsafe internal retry', { clientMessageId: nextId, internal: true, requireIdle: true }), error => error.code === 'native_input_not_sent');
    f.agent.runError = knownError;
    f.agent.observeError = 'Native history unavailable';
    await assert.rejects(f.runtime.send(f.agent, 'unsafe observation retry', { clientMessageId: nextId, internal: true, requireIdle: true }), error => error.code === 'native_input_not_sent');
    f.agent.observeError = null;
    await f.runtime.send(f.agent, 'explicit internal retry', { clientMessageId: nextId, internal: true, requireIdle: true });
    await until(() => f.inputs.length === 2); assert.equal(f.agent.runError, null); assert.equal(f.inputs[1].uuid, nextId);
  } finally { await f.close(); }
});


test('Claude handback cannot use an unbound native idle, result or empty background snapshot', async () => {
  const f = await fixture();
  try {
    await f.runtime.send(f.agent, 'checkpoint', { clientMessageId: requestId }); await until(() => f.inputs.length);
    f.emit(f.inputs[0]);
    f.queries[0].push({ type: 'system', subtype: 'session_state_changed', state: 'idle' });
    f.queries[0].push({ type: 'result', is_error: false, result: 'Unbound result' });
    await tick();
    assert.equal(f.agent.handoffCompletedSequence, undefined);
    assert.equal((await f.runtime.inspectHandoff(f.agent)).safe, false);
    f.emit({ type: 'system', subtype: 'session_state_changed', state: 'idle' }); await tick();
    assert.equal(f.agent.handoffCompletedSequence, undefined, 'An unbound result stays unconfirmed even after bound idle');
    f.emit({ type: 'result', is_error: false, result: 'Bound result' });
    f.emit({ type: 'system', subtype: 'session_state_changed', state: 'idle' });
    await until(() => f.agent.handoffCompletedSequence === 1);
    f.queries[0].push({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
    await until(() => !f.runtime.runs.get(id).backgroundTrackingValid);
    assert.equal((await f.runtime.inspectHandoff(f.agent)).safe, false);
    f.emit({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
    await until(() => f.runtime.runs.get(id).backgroundTrackingValid);
    assert.equal((await f.runtime.inspectHandoff(f.agent)).safe, true);
  } finally { await f.close(); }
});

test('Claude handback keeps closure unconfirmed when a native approval arrives after EOF preflight', async () => {
  const f = await fixture();
  try {
    await f.runtime.send(f.agent, 'checkpoint'); await until(() => f.inputs.length); await f.complete(); f.holdEof();
    const closing = f.runtime.closeForHandoff(f.agent);
    await until(() => f.controls.includes('eof'));
    void f.queries[0].options.canUseTool('Bash', { command: 'read-project-metadata' }, { requestId: 'late-approval', toolUseID: 'late-tool', signal: new AbortController().signal });
    assert.equal(f.agent.questions.length, 1);
    Events.prototype.close.call(f.queries[0]);
    await assert.rejects(closing, /without confirming all local work settled/);
    assert.equal((await f.runtime.inspectHandoff(f.agent)).safe, false);
    assert.deepEqual(f.controls, ['eof']);
  } finally { await f.close(); }
});


test('Claude unexpected managed EOF preserves unfinished background and queued-input uncertainty', async () => {
  for (const unfinished of ['background', 'queued-input']) {
    const f = await fixture();
    try {
      await f.runtime.send(f.agent, 'checkpoint'); await until(() => f.inputs.length); await f.complete();
      if (unfinished === 'background') {
        f.emit({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'shell', task_type: 'local_bash', description: 'Work' }] });
        await until(() => f.runtime.runs.get(id).backgroundTasks.size === 1);
      } else {
        await f.runtime.send(f.agent, 'queued followup'); await until(() => f.inputs.length === 2);
      }
      const job = f.runtime.runs.get(id); Events.prototype.close.call(f.queries[0]); await job.done;
      assert.equal(f.runtime.runs.has(id), false); assert.match(f.agent.runError, /without confirming all local work settled/);
      assert.equal((await f.runtime.inspectHandoff(f.agent)).safe, false, unfinished);
      await assert.rejects(f.runtime.closeForHandoff(f.agent), /without confirming all local work settled/);
    } finally { await f.close(); }
  }
});

test('Claude explicitly enables native user replay while handback still verifies persisted receipt', async () => {
  const f = await fixture();
  try {
    await f.runtime.send(f.agent, 'checkpoint', { clientMessageId: requestId, internal: true, requireIdle: true });
    await until(() => f.inputs.length === 1);
    assert.deepEqual(f.queries[0].options.extraArgs, { 'replay-user-messages': null }, 'The SDK must request the official stream-json user acknowledgement flag.');
    assert.deepEqual((await f.runtime.inspectHandoff(f.agent)).queuedInputIds, [requestId]);
    await f.complete();
    assert.deepEqual((await f.runtime.inspectHandoff(f.agent)).queuedInputIds, []);
    assert.equal(await f.runtime.handoffReceipt(f.agent, { messageId: requestId, text: 'checkpoint' }), false, 'Live native replay alone does not establish persisted receipt.');
    f.history.push(f.inputs[0]);
    assert.equal(await f.runtime.handoffReceipt(f.agent, { messageId: requestId, text: 'checkpoint' }), true);
  } finally { await f.close(); }
});
