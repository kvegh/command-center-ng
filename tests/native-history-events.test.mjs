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

const historyTurn = (id, text = id) => ({ id, status: 'completed', items: [{ id: 'input-' + id, type: 'userMessage', content: [{ type: 'text', text }] }] });
function pagedFixture() {
  const f = fixture(); f.agent.messages = [];
  let latest = { data: [historyTurn('recent')], nextCursor: 'older-page' };
  f.rpc.call = async (method, params) => {
    f.calls.push({ method, params }); assert.equal(method, 'thread/turns/list');
    return params.cursor === 'older-page'
      ? { data: [historyTurn('older')], nextCursor: 'oldest-page' }
      : latest;
  };
  return { ...f, setLatest: page => { latest = page; } };
}

test('restored terminal history does not resurrect an older unfinished Coordinator or worker turn', async () => {
  for (const role of ['coordinator', 'worker']) for (const type of ['notLoaded', 'idle']) {
    for (const status of ['interrupted', 'completed', 'failed']) {
      const f = fixture();
      f.agent.role = role; f.agent.thread.status = { type };
      f.agent.turnId = 'orphan-old-turn';
      f.rpc.call = async (method, params) => {
        f.calls.push({ method, params }); assert.equal(method, 'thread/turns/list');
        return { data: [
          { ...historyTurn('latest-turn'), status },
          historyTurn('newer-completed-turn'),
          { ...historyTurn('orphan-old-turn'), status: 'inProgress' },
        ], nextCursor: null };
      };
      await f.workspace.history(f.agent.id);
      assert.equal(f.agent.turnId, null, `${role}/${type}/${status} must remain free of an obsolete active-turn binding`);
      assert.deepEqual(f.agent.finishedTurn, { id: 'latest-turn', status });
      assert.deepEqual(f.agent.messages.map(message => message.turnId), ['old-turn', 'orphan-old-turn', 'newer-completed-turn', 'latest-turn']);
      assert.deepEqual(f.calls.map(call => call.method), ['thread/turns/list'], 'history recovery must not resume, interrupt or answer native work');
    }
  }
});

test('restoration still binds the latest unfinished native turn rather than an older unfinished turn', async () => {
  for (const type of ['notLoaded', 'idle', 'active']) {
    const f = fixture(); f.agent.thread.status = { type };
    f.rpc.call = async (method, params) => {
      f.calls.push({ method, params }); assert.equal(method, 'thread/turns/list');
      return { data: [
        { ...historyTurn('latest-active-turn'), status: 'inProgress' },
        historyTurn('previous-completed-turn'),
        { ...historyTurn('orphan-old-turn'), status: 'inProgress' },
      ], nextCursor: null };
    };
    await f.workspace.history(f.agent.id);
    assert.equal(f.agent.turnId, 'latest-active-turn');
    assert.deepEqual(f.calls.map(call => call.method), ['thread/turns/list']);
  }
});

test('historical unfinished turns cannot replace newer native lifecycle events received during restoration', async () => {
  for (const outcome of ['started', 'completed']) {
    const f = fixture(); f.agent.thread.status = { type: 'notLoaded' };
    let finish;
    f.rpc.call = async (method, params) => {
      f.calls.push({ method, params }); assert.equal(method, 'thread/turns/list');
      return new Promise(resolve => { finish = resolve; });
    };
    const read = f.workspace.history(f.agent.id);
    f.workspace.notification({ method: 'turn/started', params: { threadId: f.agent.id, turn: { id: 'new-live-turn' } } });
    if (outcome === 'completed') f.workspace.notification({ method: 'turn/completed', params: { threadId: f.agent.id, turn: { id: 'new-live-turn', status: 'interrupted' } } });
    finish({ data: [
      historyTurn('previous-completed-turn'),
      { ...historyTurn('orphan-old-turn'), status: 'inProgress' },
    ], nextCursor: null });
    await read;
    assert.equal(f.agent.turnId, outcome === 'started' ? 'new-live-turn' : null);
    assert.equal(f.agent.thread.status.type, outcome === 'started' ? 'active' : 'idle');
    if (outcome === 'completed') assert.deepEqual(f.agent.finishedTurn, { id: 'new-live-turn', status: 'interrupted' });
    assert.deepEqual(f.calls.map(call => call.method), ['thread/turns/list']);
  }
});

function observedCoordinatorFixture({ nativeType = 'notLoaded', terminalStatus = 'interrupted' } = {}) {
  const f = fixture(), completions = [];
  f.agent.role = 'coordinator'; f.agent.observingOnly = false;
  f.agent.thread = { id: f.agent.id, status: { type: 'active' } };
  f.agent.turnId = 'cached-old-turn';
  const nativeThread = { id: f.agent.id, status: { type: nativeType } };
  f.workspace.coordinator = {
    id: f.agent.id, paused: false,
    completed: (id, turnId) => { completions.push({ id, turnId }); },
    flush: async () => {},
    mark: () => {},
  };
  f.rpc.call = async (method, params) => {
    f.calls.push({ method, params });
    if (method === 'thread/read') return { thread: structuredClone(nativeThread) };
    assert.equal(method, 'thread/turns/list');
    return { data: [
      { ...historyTurn('latest-native-turn'), status: terminalStatus },
      { ...historyTurn('older-orphan-turn'), status: 'inProgress' },
    ], nextCursor: null };
  };
  return { ...f, completions };
}

test('observation reconciles a cached Coordinator turn against fresh native terminal history without sending input', async () => {
  for (const nativeType of ['notLoaded', 'idle']) for (const terminalStatus of ['interrupted', 'completed', 'failed']) {
    const f = observedCoordinatorFixture({ nativeType, terminalStatus });
    await f.workspace.refreshObserved(f.agent.id);
    assert.equal(f.agent.thread.status.type, nativeType);
    assert.equal(f.agent.turnId, null, 'a stale Coordinator turn must not keep eligible approvals waiting');
    assert.deepEqual(f.agent.finishedTurn, { id: 'latest-native-turn', status: terminalStatus });
    assert.deepEqual(f.completions, [{ id: f.agent.id, turnId: 'latest-native-turn' }], 'wake existing completion handling only after terminal evidence');
    assert.deepEqual(f.calls.map(call => call.method), ['thread/read', 'thread/turns/list'], 'reconciliation must not resume, restart, steer or answer native work');
  }
});

test('Coordinator lifecycle reconciliation preserves pending native requests, pauses and explicit stop intent', async () => {
  const f = observedCoordinatorFixture();
  const question = { id: 41, method: 'item/commandExecution/requestApproval', params: { threadId: f.agent.id, turnId: 'cached-old-turn', kind: 'humanCommand' } };
  const stopIntent = {};
  f.agent.questions = [question]; f.agent.requestStopIntent = stopIntent;
  f.workspace.pending.set(JSON.stringify([f.agent.id, question.id]), question);
  f.workspace.coordinator.paused = true;
  await f.workspace.refreshObserved(f.agent.id);
  assert.deepEqual(f.agent.questions, [question]);
  assert.equal(f.workspace.pending.get(JSON.stringify([f.agent.id, question.id])), question);
  assert.equal(f.agent.requestStopIntent, stopIntent);
  assert.equal(f.workspace.coordinator.paused, true);
  assert.deepEqual(f.completions, [], 'inspection must not rearm work while a user control or stop is pending');
  assert.ok(f.calls.every(call => ['thread/read', 'thread/turns/list'].includes(call.method)), 'inspection must preserve the native decision control');
});

test('fresh native active Coordinator status preserves its current turn and pending question', async () => {
  const f = observedCoordinatorFixture({ nativeType: 'active' });
  const question = { id: 42, method: 'item/tool/requestUserInput', params: { threadId: f.agent.id } };
  f.agent.questions = [question];
  await f.workspace.refreshObserved(f.agent.id);
  assert.equal(f.agent.turnId, 'cached-old-turn');
  assert.equal(f.agent.thread.status.type, 'active');
  assert.deepEqual(f.agent.questions, [question]);
  assert.deepEqual(f.completions, []);
  assert.deepEqual(f.calls.map(call => call.method), ['thread/read'], 'an active native turn needs no terminal-history recovery');
});

test('a newer Coordinator turn arriving during its status read prevents stale terminal reconciliation', async () => {
  const f = observedCoordinatorFixture();
  let finish;
  f.rpc.call = async (method, params) => {
    f.calls.push({ method, params }); assert.equal(method, 'thread/read');
    return new Promise(resolve => { finish = resolve; });
  };
  const read = f.workspace.refreshObserved(f.agent.id);
  f.workspace.notification({ method: 'turn/started', params: { threadId: f.agent.id, turn: { id: 'new-live-turn' } } });
  finish({ thread: { id: f.agent.id, status: { type: 'notLoaded' } } });
  await read;
  assert.equal(f.agent.turnId, 'new-live-turn');
  assert.equal(f.agent.thread.status.type, 'active');
  assert.deepEqual(f.completions, []);
  assert.deepEqual(f.calls.map(call => call.method), ['thread/read']);
});

test('a newer Coordinator turn arriving during terminal-history recovery remains current', async () => {
  const f = observedCoordinatorFixture();
  let finish;
  f.rpc.call = async (method, params) => {
    f.calls.push({ method, params });
    if (method === 'thread/read') return { thread: { id: f.agent.id, status: { type: 'notLoaded' } } };
    assert.equal(method, 'thread/turns/list');
    return new Promise(resolve => { finish = resolve; });
  };
  const read = f.workspace.refreshObserved(f.agent.id);
  await tick();
  assert.equal(typeof finish, 'function', 'terminal history is inspected before releasing the old binding');
  f.workspace.notification({ method: 'turn/started', params: { threadId: f.agent.id, turn: { id: 'new-live-turn' } } });
  finish({ data: [{ ...historyTurn('cached-old-turn'), status: 'interrupted' }], nextCursor: null });
  await read;
  assert.equal(f.agent.turnId, 'new-live-turn');
  assert.equal(f.agent.thread.status.type, 'active');
  assert.deepEqual(f.completions, [], 'a stale read must not synthesize completion of newer native work');
  assert.deepEqual(f.calls.map(call => call.method), ['thread/read', 'thread/turns/list']);
});

test('missing or unfinished native head evidence cannot release a cached Coordinator turn', async () => {
  for (const head of [null, { ...historyTurn('latest-native-turn'), status: 'unknown' }, { ...historyTurn('cached-old-turn'), status: 'inProgress' }]) {
    const f = observedCoordinatorFixture();
    f.rpc.call = async (method, params) => {
      f.calls.push({ method, params });
      if (method === 'thread/read') return { thread: { id: f.agent.id, status: { type: 'notLoaded' } } };
      assert.equal(method, 'thread/turns/list');
      return { data: head ? [head] : [], nextCursor: null };
    };
    await f.workspace.refreshObserved(f.agent.id);
    assert.equal(f.agent.turnId, 'cached-old-turn');
    assert.deepEqual(f.completions, [], 'an unloaded thread alone does not establish terminal completion');
    assert.deepEqual(f.calls.map(call => call.method), ['thread/read', 'thread/turns/list']);
  }
});

test('failed native observation retains the cached Coordinator turn and exposes the read error', async () => {
  for (const failure of ['thread/read', 'thread/turns/list']) {
    const f = observedCoordinatorFixture();
    f.rpc.call = async (method, params) => {
      f.calls.push({ method, params });
      if (method === failure) throw new Error('Synthetic native read unavailable.');
      assert.equal(method, 'thread/read');
      return { thread: { id: f.agent.id, status: { type: 'notLoaded' } } };
    };
    await f.workspace.refreshObserved(f.agent.id);
    assert.equal(f.agent.turnId, 'cached-old-turn');
    assert.equal(f.agent.observeError, 'Synthetic native read unavailable.');
    assert.deepEqual(f.completions, []);
    assert.ok(f.calls.every(call => ['thread/read', 'thread/turns/list'].includes(call.method)));
  }
});

test('an activated Coordinator without a cached turn adds no native observation work', async () => {
  const f = observedCoordinatorFixture(); f.agent.turnId = null;
  await f.workspace.refreshObserved(f.agent.id);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.completions, []);
});

test('refreshing recent history keeps already loaded older pages before it', async () => {
  const f = pagedFixture();
  await f.workspace.history('worker');
  await f.workspace.history('worker', 'older-page');
  assert.deepEqual(f.agent.messages.map(message => message.turnId), ['older', 'recent']);
  f.setLatest({ data: [historyTurn('newest'), historyTurn('recent')], nextCursor: 'older-page' });
  await f.workspace.history('worker');
  assert.deepEqual(f.agent.messages.map(message => message.turnId), ['older', 'recent', 'newest']);
  assert.equal(new Set(f.agent.messages.map(message => message.id)).size, 3);
  assert.deepEqual(f.calls.map(call => call.method), Array(3).fill('thread/turns/list'));
});

test('a latest-page refresh preserves the cursor beyond the oldest page already loaded', async () => {
  const f = pagedFixture();
  await f.workspace.history('worker');
  await f.workspace.history('worker', 'older-page');
  assert.equal(f.agent.olderCursor, 'oldest-page');
  await f.workspace.history('worker');
  assert.equal(f.agent.olderCursor, 'oldest-page', 'next older load must not fetch the same older page again');
});

test('a latest-page refresh does not reopen an exhausted older-history cursor', async () => {
  const f = pagedFixture();
  f.rpc.call = async (method, params) => {
    f.calls.push({ method, params }); assert.equal(method, 'thread/turns/list');
    return params.cursor
      ? { data: [historyTurn('oldest')], nextCursor: null }
      : { data: [historyTurn('recent')], nextCursor: 'older-page' };
  };
  await f.workspace.history('worker');
  await f.workspace.history('worker', 'older-page');
  assert.equal(f.agent.olderCursor, null);
  await f.workspace.history('worker');
  assert.equal(f.agent.olderCursor, null, 'already exhausted history must not advertise the same page again');
  assert.deepEqual(f.agent.messages.map(message => message.turnId), ['oldest', 'recent']);
});

test('an older page loaded during a latest refresh retains its order and current pagination boundary', async () => {
  for (const nextCursor of ['past-older', null]) {
    const f = fixture(); f.agent.messages = [];
    let latestReads = 0, finish;
    f.rpc.call = async (method, params) => {
      f.calls.push({ method, params }); assert.equal(method, 'thread/turns/list');
      if (params.cursor === 'older-page') return { data: [historyTurn('older')], nextCursor };
      if (latestReads++ === 0) return { data: [historyTurn('recent')], nextCursor: 'older-page' };
      return new Promise(resolve => { finish = resolve; });
    };
    await f.workspace.history('worker');
    const refresh = f.workspace.history('worker');
    await f.workspace.history('worker', 'older-page');
    assert.equal(f.agent.olderCursor, nextCursor);
    finish({ data: [historyTurn('recent')], nextCursor: 'older-page' });
    await refresh;
    assert.deepEqual({ turns: f.agent.messages.map(message => message.turnId), cursor: f.agent.olderCursor }, {
      turns: ['older', 'recent'], cursor: nextCursor,
    });
    assert.equal(f.calls.length, 3, 'the older page is not fetched again to repair a stale refresh');
  }
});

test('an in-flight history snapshot cannot roll back text streamed after its read began', async () => {
  const f = fixture(); f.agent.messages = [];
  f.agent.thread.status = { type: 'active' }; f.agent.turnId = 'active-turn';
  f.workspace.addItem(f.agent, { id: 'reply', type: 'agentMessage', text: 'First', status: 'inProgress' }, 'active-turn', false, { live: true });
  let finish;
  f.rpc.call = async (method, params) => {
    f.calls.push({ method, params }); assert.equal(method, 'thread/turns/list');
    return new Promise(resolve => { finish = resolve; });
  };
  const read = f.workspace.history('worker');
  f.workspace.notification({ method: 'item/agentMessage/delta', params: { threadId: 'worker', turnId: 'active-turn', itemId: 'reply', delta: ' second' } });
  finish({ data: [{ id: 'active-turn', status: 'inProgress', items: [{ id: 'reply', type: 'agentMessage', text: 'First', status: 'inProgress' }] }], nextCursor: null });
  await read;
  assert.equal(f.agent.messages.find(message => message.id === 'reply').text, 'First second');
  assert.equal(f.agent.turnId, 'active-turn');
});

test('an in-flight history snapshot cannot replace a newer completed reply with its old draft', async () => {
  const f = fixture(); f.agent.messages = [];
  f.agent.thread.status = { type: 'active' }; f.agent.turnId = 'active-turn';
  f.workspace.addItem(f.agent, { id: 'reply', type: 'agentMessage', text: 'Draft', status: 'inProgress' }, 'active-turn', false, { live: true });
  let finish;
  f.rpc.call = async (method, params) => {
    f.calls.push({ method, params }); assert.equal(method, 'thread/turns/list');
    return new Promise(resolve => { finish = resolve; });
  };
  const read = f.workspace.history('worker');
  f.workspace.notification({ method: 'item/completed', params: { threadId: 'worker', turnId: 'active-turn', item: { id: 'reply', type: 'agentMessage', text: 'Completed reply', status: 'completed' } } });
  finish({ data: [{ id: 'active-turn', status: 'inProgress', items: [{ id: 'reply', type: 'agentMessage', text: 'Draft', status: 'inProgress' }] }], nextCursor: null });
  await read;
  const reply = f.agent.messages.find(message => message.id === 'reply');
  assert.equal(reply.text, 'Completed reply');
  assert.equal(reply.state, 'completed');
  assert.equal(f.agent.turnId, 'active-turn');
});

test('a completed native turn keeps reply completion and branchability across an older history snapshot', async () => {
  const f = fixture(); f.agent.messages = [];
  f.agent.thread.status = { type: 'active' }; f.agent.turnId = 'active-turn';
  f.workspace.addItem(f.agent, { id: 'reply', type: 'agentMessage', text: 'Final text', status: 'inProgress' }, 'active-turn', false, { live: true });
  let finish;
  f.rpc.call = async (method, params) => {
    f.calls.push({ method, params }); assert.equal(method, 'thread/turns/list');
    return new Promise(resolve => { finish = resolve; });
  };
  const read = f.workspace.history('worker');
  f.workspace.notification({ method: 'turn/completed', params: { threadId: 'worker', turn: { id: 'active-turn', status: 'completed' } } });
  finish({ data: [{ id: 'active-turn', status: 'inProgress', items: [{ id: 'reply', type: 'agentMessage', text: 'Final text', status: 'inProgress' }] }], nextCursor: null });
  await read;
  const reply = f.agent.messages.find(message => message.id === 'reply');
  assert.equal(reply.state, 'completed'); assert.equal(reply.branchable, true);
  assert.equal(f.agent.turnId, null); assert.equal(f.agent.thread.status.type, 'idle');
  assert.equal(f.agent.lastCompletedTurnId, 'active-turn');
});

test('live message replacement and history refresh preserve an unanswered assistant-question binding', async () => {
  const f = fixture(); f.agent.messages = [];
  f.agent.thread.status = { type: 'active' }; f.agent.turnId = 'active-turn';
  f.workspace.notification({ method: 'item/completed', params: { threadId: 'worker', turnId: 'active-turn', item: {
    id: 'question-message', type: 'agentMessage', text: 'Choose the destination.',
    questions: [{ title: 'Which destination?', options: ['Existing', 'New'] }],
  } } });
  const question = () => f.workspace.snapshot().agents[0].messages.find(message => message.id === 'question-message').nativeQuestions[0];
  assert.equal(question().answerState, 'available');
  let finish;
  f.rpc.call = async (method, params) => {
    f.calls.push({ method, params }); assert.equal(method, 'thread/turns/list');
    return new Promise(resolve => { finish = resolve; });
  };
  const read = f.workspace.history('worker');
  f.workspace.notification({ method: 'item/agentMessage/delta', params: { threadId: 'worker', turnId: 'active-turn', itemId: 'question-message', delta: ' Original choices remain available.' } });
  finish({ data: [{ id: 'active-turn', status: 'inProgress', items: [{ id: 'question-message', type: 'agentMessage', text: 'Choose the destination.' }] }], nextCursor: null });
  await read;
  assert.equal(question().title, 'Which destination?');
  assert.equal(question().questionIndex, 0);
  assert.equal(question().answerState, 'available');
  assert.equal(f.workspace.pending.size, 0); assert.deepEqual(f.agent.questions, []);
  assert.deepEqual(f.calls.map(call => call.method), ['thread/turns/list'], 'observation must not submit a choice');
});

test('messages received after a recent-history read starts remain after its fetched items', async () => {
  const f = fixture(); f.agent.messages = [];
  let finish;
  f.rpc.call = async (method, params) => {
    f.calls.push({ method, params }); assert.equal(method, 'thread/turns/list');
    return new Promise(resolve => { finish = resolve; });
  };
  const read = f.workspace.history('worker');
  f.workspace.notification({ method: 'item/completed', params: { threadId: 'worker', turnId: 'live-turn', item: { id: 'live-reply', type: 'agentMessage', text: 'Arrived during observation.' } } });
  finish({ data: [historyTurn('recent')], nextCursor: null }); await read;
  assert.deepEqual(f.agent.messages.map(message => message.id), ['input-recent', 'live-reply']);
  assert.equal(f.agent.messages[1].timestampSource, 'received');
});

test('a native history page with more than 600 items retains every returned record', async () => {
  const f = fixture(); f.agent.messages = [];
  const items = Array.from({ length: 601 }, (_, index) => ({ id: 'native-' + index, type: 'userMessage', content: [{ type: 'text', text: 'Native record ' + index }] }));
  f.rpc.call = async (method, params) => {
    f.calls.push({ method, params }); assert.equal(method, 'thread/turns/list');
    return { data: [{ id: 'long-turn', status: 'completed', items }], nextCursor: 'older-page' };
  };
  await f.workspace.history('worker');
  assert.equal(f.agent.messages.length, 601);
  assert.equal(f.agent.messages[0].id, 'native-0');
  assert.equal(f.agent.messages.at(-1).id, 'native-600');
  assert.equal(f.calls[0].params.limit, 20, 'preserve the bounded native page request');
  assert.equal(f.agent.olderCursor, 'older-page');
});

test('loading older history at 600 records retains the fetched page rather than silently skipping it', async () => {
  const f = fixture(); f.agent.messages = [];
  const items = Array.from({ length: 600 }, (_, index) => ({ id: 'recent-' + index, type: 'userMessage', content: [{ type: 'text', text: 'Recent record ' + index }] }));
  f.rpc.call = async (method, params) => {
    f.calls.push({ method, params }); assert.equal(method, 'thread/turns/list');
    return params.cursor
      ? { data: [historyTurn('older')], nextCursor: 'past-older' }
      : { data: [{ id: 'recent-turn', status: 'completed', items }], nextCursor: 'older-page' };
  };
  await f.workspace.history('worker');
  assert.equal(f.agent.messages.length, 600);
  await f.workspace.history('worker', 'older-page');
  assert.equal(f.agent.messages.length, 601);
  assert.equal(f.agent.messages[0].id, 'input-older');
  assert.equal(f.agent.messages.at(-1).id, 'recent-599');
  assert.equal(f.agent.olderCursor, 'past-older');
  assert.equal(f.calls.length, 2, 'do not silently fetch extra native pages');
});

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
