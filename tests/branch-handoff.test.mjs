import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';
import { summaryPrompt, isBranchControlMessage } from '../server/branch-summary.mjs';

function fixture(options = {}) {
  const rpc = new EventEmitter(); rpc.ready = true;
  const calls = [], turns = new Map(), archived = [], links = [];
  const native = new Map();
  const agent = (id, parentId = null) => ({ id, parentId, name: id, goal: `Work ${id}`, cwd: '/tmp', canSend: true, messages: [], tasks: [], workers: [], questions: [], turnId: null, thread: { id, status: { type: 'idle' } } });
  const branch = agent('child', 'parent'), parent = agent('parent');
  native.set(branch.id, branch.thread); native.set(parent.id, parent.thread);
  let sequence = 0, goalStatus = options.goal ? 'active' : null;
  const beads = {
    linked: async () => ({ tasks: [], status: 'available' }),
    handoff: async (cwd, child, parentId) => {
      links.push({ cwd, child, parentId });
      if (options.failLinks) throw new Error('Task transfer failed');
      return { taskIds: Array.from({ length: 75 }, (_, i) => `task-${i}`), tasks: [] };
    },
  };
  const w = new Workspace(rpc, { beads, handoffOptions: { timeout: options.noReceipt ? 80 : 2000, poll: 2 }, summaryTimeout: 2000 });
  w.agents.set(branch.id, branch); w.agents.set(parent.id, parent);
  w.instructionContext = async () => ({});
  w.activate = async () => {};
  function complete(id, turn, { summary = false } = {}) {
    setImmediate(() => {
      if (summary) rpc.emit('notification', { method: 'item/completed', params: { threadId: id, turnId: turn.id, item: { type: 'agentMessage', id: `reply-${turn.id}`, text: JSON.stringify({ summary: 'Decisions are saved. Continue the unfinished deployment task.' }) } } });
      native.get(id).status = { type: 'idle' }; turn.status = 'completed';
      rpc.emit('notification', { method: 'turn/completed', params: { threadId: id, turn } });
    });
  }
  rpc.call = async (method, params) => {
    calls.push({ method, params });
    if (method === 'thread/read') return { thread: native.get(params.threadId) };
    if (method === 'thread/list') return { data: options.descendants || [], nextCursor: null };
    if (method === 'thread/backgroundTerminals/list') return { data: options.terminals?.[params.threadId] || [], nextCursor: null };
    if (method === 'thread/goal/get') return { goal: goalStatus && params.threadId === branch.id ? { threadId: branch.id, objective: 'Finish feature', status: goalStatus, tokenBudget: 10000, tokensUsed: 7, timeUsedSeconds: 3, createdAt: 1, updatedAt: 2 } : null };
    if (method === 'thread/goal/set') { goalStatus = params.status; return rpc.call('thread/goal/get', params); }
    if (method === 'thread/turns/list') return { data: turns.get(params.threadId) || [], nextCursor: null };
    if (method === 'thread/archive') {
      if (options.failArchive) throw new Error('Archive acknowledgement lost');
      assert.ok(links.length >= 2, 'all links verified before archive');
      assert.ok((turns.get(parent.id) || []).some(turn => turn.items.some(item => item.clientId?.startsWith('ccng-handoff-'))), 'exact parent receipt precedes archive');
      archived.push(params.threadId); return {};
    }
    if (method === 'turn/steer') {
      if (params.threadId === branch.id) {
        const turn = { id: params.expectedTurnId, status: 'inProgress', items: [] };
        turns.set(branch.id, [turn]); if (!options.holdCheckpoint) complete(branch.id, turn);
      }
      return { turnId: params.expectedTurnId };
    }
    if (method === 'turn/start') {
      if (params.threadId === branch.id && options.failCheckpoint && !params.outputSchema) throw new Error('Checkpoint acknowledgement lost');
      const turn = { id: `turn-${++sequence}`, status: 'inProgress', items: [] };
      if (params.clientUserMessageId && !options.noReceipt) turn.items.push({ id: `user-${sequence}`, type: 'userMessage', clientId: options.nullClientId ? null : params.clientUserMessageId, content: params.input });
      turns.set(params.threadId, [turn, ...(turns.get(params.threadId) || [])]);
      native.get(params.threadId).status = { type: 'active', activeFlags: [] };
      if (params.threadId === branch.id) complete(branch.id, turn, { summary: !!params.outputSchema });
      if (params.threadId === parent.id && options.loseSendAck) throw new Error('Send acknowledgement lost');
      return { turn };
    }
    throw new Error(`Unexpected call ${method}`);
  };
  return { w, rpc, branch, parent, calls, turns, native, archived, links, options };
}
const done = async f => { const job = f.w.returnJobs.get(f.branch.id); if (job) await job; };
const until = async predicate => { const deadline = Date.now() + 2000; while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 2)); assert.ok(predicate()); };

test('busy handoff accepts immediately, cooperates then transfers all tasks and archives only after native receipt', async () => {
  const f = fixture({ goal: true });
  f.branch.thread.status = { type: 'active', activeFlags: [] }; f.branch.turnId = 'running';
  assert.deepEqual(f.w.startHandoff('child'), { id: 'child', parentId: 'parent' });
  assert.ok(f.w.returnJobs.has('child')); assert.ok(f.w.agents.has('child'));
  await done(f);
  assert.deepEqual(f.archived, ['child']); assert.ok(!f.w.agents.has('child'));
  assert.deepEqual(f.w.snapshot().handoffCompletions, [{ branchId: 'child', parentId: 'parent' }]);
  const steer = f.calls.find(call => call.method === 'turn/steer');
  assert.equal(steer.params.expectedTurnId, 'running');
  assert.ok(isBranchControlMessage(steer.params.input[0].text), 'generated checkpoint is not a new user authority source');
  assert.equal(f.calls.filter(call => call.method === 'thread/goal/set').length, 1);
  assert.deepEqual(f.calls.find(call => call.method === 'thread/goal/set').params, { threadId: 'child', origin: 'user', status: 'paused' }, 'safe closure only pauses existing continuation without creating/resetting an objective');
  assert.ok(!f.calls.some(call => call.method === 'thread/goal/clear'));
  const delivery = f.calls.find(call => call.method === 'turn/start' && call.params.threadId === 'parent');
  assert.match(delivery.params.input[0].text, /All 75 linked branch tasks/);
  assert.match(delivery.params.input[0].text, /ccng-session:child/);
  assert.ok(!f.calls.some(call => call.method === 'turn/interrupt'));
});

test('branch pending requests are preserved and handoff begins after an answer', async () => {
  const f = fixture(); f.branch.questions = [{ id: 'request' }];
  f.w.startHandoff('child');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.calls.filter(call => call.method === 'turn/start').length, 0);
  assert.equal(f.branch.questions[0].id, 'request');
  f.branch.questions = []; f.w.changed(); await done(f);
  assert.deepEqual(f.archived, ['child']);
});

test('a parent live async question defers handoff without locking out its human answer', async () => {
  const f = fixture(); f.parent.thread.status = { type: 'active' }; f.parent.turnId = 'parent-live';
  f.w.addItem(f.parent, { id: 'parent-question', type: 'agentMessage', text: '', questions: [{ title: 'Continue existing work?', options: null }] }, 'parent-live', false, { live: true, completed: true });
  f.w.startHandoff('child');
  await until(() => f.branch.handoff?.phase === 'waiting' && !!f.branch.returnSummary);
  assert.equal(f.w.handoffs.incoming('parent'), false, 'waiting cannot reserve the parent against its answer');
  assert.equal(f.calls.some(call => call.method === 'turn/start' && call.params.threadId === 'parent'), false);
  assert.ok(f.w.agents.has('child')); assert.deepEqual(f.archived, []);
  const text = '<send_user_message_question_reply>\n' + JSON.stringify([{ answer: 'Continue', question: 'Continue existing work?', questionItemId: JSON.stringify(['request_user_input_async', 'parent-question', 0]) }]) + '\n</send_user_message_question_reply>';
  f.w.addItem(f.parent, { id: 'parent-answer', type: 'userMessage', content: [{ type: 'text', text }] }, 'parent-live', false, { live: true, completed: true });
  f.parent.thread.status = { type: 'idle' }; f.parent.turnId = null;
  f.w.changed(); await done(f);
  assert.deepEqual(f.archived, ['child']);
});

test('an own-branch question stays answerable while handoff waits for its checkpoint', async () => {
  const f = fixture(); f.branch.thread.status = { type: 'active' }; f.branch.turnId = 'branch-live';
  f.w.addItem(f.branch, { id: 'branch-question', type: 'agentMessage', text: '', questions: [{ title: 'Continue?', options: null }] }, 'branch-live', false, { live: true, completed: true });
  f.w.startHandoff('child'); await until(() => f.branch.handoff?.phase === 'waiting');
  assert.equal(f.calls.some(call => ['turn/start', 'turn/steer'].includes(call.method)), false);
  assert.deepEqual(await f.w.answerMessageQuestion('child', { messageId: 'branch-question', questionIndex: 0, answer: 'Continue' }), { accepted: true, turnId: 'branch-live' });
  await done(f); assert.deepEqual(f.archived, ['child']);
});

test('a question arriving during checkpoint preparation prevents a native checkpoint send', async () => {
  const f = fixture();
  f.w.instructionContext = async () => {
    f.branch.thread.status = { type: 'active' }; f.branch.turnId = 'new-turn';
    f.w.addItem(f.branch, { id: 'late-question', type: 'agentMessage', text: '', questions: [{ title: 'A real choice?', options: null }] }, 'new-turn', false, { live: true, completed: true });
    return {};
  };
  f.w.startHandoff('child'); await done(f);
  assert.equal(f.branch.handoff.phase, 'failed'); assert.equal(f.w.returnJobs.has('child'), false);
  assert.equal(f.calls.some(call => ['turn/start', 'turn/steer', 'turn/interrupt'].includes(call.method)), false);
  assert.equal(f.w.snapshot().agents.find(agent => agent.id === 'child').messages[0].nativeQuestions[0].answerState, 'available');
});

test('parent pending request defers delivery without deleting the branch', async () => {
  const f = fixture(); f.parent.questions = [{ id: 'parent-request' }];
  f.w.startHandoff('child');
  await until(() => f.branch.handoff?.phase === 'waiting' && !!f.branch.returnSummary);
  assert.ok(f.w.agents.has('child')); assert.deepEqual(f.archived, []);
  assert.ok(!f.calls.some(call => call.method === 'turn/start' && call.params.threadId === 'parent'));
  f.parent.questions = []; f.w.changed(); await done(f);
  assert.deepEqual(f.archived, ['child']);
});

test('an observed question ending without an accepted reply keeps the branch and explicit retry rebaselines it', async () => {
  for (const ending of ['terminal', 'removed', 'changed']) {
    const f = fixture(); f.branch.thread.status = { type: 'active' }; f.branch.turnId = 'branch-live';
    const question = { id: 'observed-question', type: 'agentMessage', text: '', questions: [{ title: 'Keep my draft?', options: null }] };
    f.w.addItem(f.branch, question, 'branch-live', false, { live: true, completed: true });
    f.w.startHandoff('child');
    if (ending === 'terminal') f.rpc.emit('notification', { method: 'turn/completed', params: { threadId: 'child', turn: { id: 'branch-live', status: 'completed' } } });
    else {
      f.w.addItem(f.branch, { ...question, questions: ending === 'removed' ? null : [{ title: 'A changed question', options: null }] }, 'branch-live', false, { live: true, completed: true });
      f.w.changed();
    }
    await done(f);
    assert.equal(f.branch.handoff.phase, 'failed'); assert.match(f.branch.handoff.detail, /unsent answer.*kept/);
    assert.ok(f.w.agents.has('child')); assert.equal(f.w.returnJobs.has('child'), false);
    assert.equal(f.links.length, 0); assert.deepEqual(f.archived, []);
    if (ending === 'terminal') {
      // This new user action represents review of the retained view; no draft
      // content or browser storage is sent to the backend.
      f.w.startHandoff('child'); await done(f);
      assert.deepEqual(f.archived, ['child'], 'old read-only history does not permanently prevent an explicit retry');
    }
  }
});

test('an unconfirmed answer during stopping keeps the branch instead of closing a retained draft', async () => {
  const f = fixture({ holdCheckpoint: true }); f.branch.thread.status = { type: 'active' }; f.branch.turnId = 'branch-live';
  f.w.startHandoff('child');
  await until(() => f.calls.some(call => call.method === 'turn/steer'));
  f.w.addItem(f.branch, { id: 'stopping-question', type: 'agentMessage', text: '', questions: [{ title: 'Wait for me?', options: null }] }, 'branch-live', false, { live: true, completed: true });
  const originalCall = f.rpc.call;
  f.rpc.call = async (method, params) => {
    if (method === 'turn/steer' && params.input[0].text.startsWith('<send_user_message_question_reply>')) throw new Error('Synthetic uncertain answer');
    return originalCall(method, params);
  };
  await assert.rejects(f.w.answerMessageQuestion('child', { messageId: 'stopping-question', questionIndex: 0, answer: 'Typed answer' }), error => error.code === 'async_question_delivery_unconfirmed');
  await done(f);
  assert.equal(f.branch.handoff.phase, 'failed'); assert.ok(f.w.agents.has('child'));
  assert.equal(f.w.returnJobs.has('child'), false); assert.deepEqual(f.archived, []);
});

test('an intentional accepted followup remains valid when the observed question turn later ends', async () => {
  const f = fixture({ holdCheckpoint: true }); f.branch.thread.status = { type: 'active' }; f.branch.turnId = 'branch-live';
  f.w.startHandoff('child'); await until(() => f.calls.some(call => call.method === 'turn/steer'));
  f.w.addItem(f.branch, { id: 'followup-question', type: 'agentMessage', text: '', questions: [{ title: 'Which choice?', options: null }] }, 'branch-live', false, { live: true, completed: true });
  f.w.addItem(f.branch, { id: 'human-followup', type: 'userMessage', content: [{ type: 'text', text: 'Keep the existing choice and finish the handoff.' }] }, 'branch-live', false, { live: true, completed: true });
  f.rpc.emit('notification', { method: 'turn/completed', params: { threadId: 'child', turn: { id: 'branch-live', status: 'completed' } } });
  await done(f); assert.deepEqual(f.archived, ['child']);
});

test('local background terminals keep the original branch and never transfer or archive', async () => {
  const f = fixture({ terminals: { child: [{ processId: 'local-process' }] } });
  f.w.startHandoff('child'); await done(f);
  assert.equal(f.branch.handoff.phase, 'failed'); assert.match(f.branch.handoff.detail, /background terminals/);
  assert.deepEqual(f.archived, []); assert.deepEqual(f.links, []);
});

test('active spawned descendants prevent archive; all descendant kinds are requested', async () => {
  const f = fixture({ descendants: [{ id: 'spawned' }] });
  f.native.set('spawned', { id: 'spawned', status: { type: 'active' } });
  f.w.startHandoff('child'); await done(f);
  assert.equal(f.branch.handoff.phase, 'failed'); assert.match(f.branch.handoff.detail, /spawned agent/);
  const list = f.calls.find(call => call.method === 'thread/list');
  assert.equal(list.params.ancestorThreadId, 'child'); assert.deepEqual(list.params.modelProviders, []);
  assert.ok(list.params.sourceKinds.includes('subAgentThreadSpawn')); assert.deepEqual(f.archived, []);
});

test('partial task transfer failure keeps summary and retries idempotently without another model summary', async () => {
  const f = fixture({ failLinks: true }); f.w.startHandoff('child'); await done(f);
  assert.equal(f.branch.handoff.phase, 'failed'); assert.deepEqual(f.archived, []);
  assert.ok(f.branch.returnSummary.text); f.options.failLinks = false;
  f.w.startHandoff('child'); await done(f);
  assert.deepEqual(f.archived, ['child']);
  assert.equal(f.calls.filter(call => call.params.outputSchema).length, 1);
});

test('lost parent send acknowledgement reconciles exact native identity before closing', async () => {
  const f = fixture({ loseSendAck: true }); f.w.startHandoff('child'); await done(f);
  assert.deepEqual(f.archived, ['child']);
  assert.equal(f.calls.filter(call => call.method === 'turn/start' && call.params.threadId === 'parent').length, 1);
});

test('parent RPC acknowledgement without exact native receipt never closes or blindly resends', async () => {
  const f = fixture({ noReceipt: true }); f.w.startHandoff('child'); await done(f);
  assert.equal(f.branch.handoff.phase, 'failed'); assert.deepEqual(f.archived, []);
  f.w.startHandoff('child'); await done(f);
  assert.equal(f.branch.handoff.phase, 'failed'); assert.match(f.branch.handoff.detail, /uncertain/);
  assert.equal(f.calls.filter(call => call.method === 'turn/start' && call.params.threadId === 'parent').length, 1);
});

test('uncertain checkpoint acceptance is not repeated on explicit retry', async () => {
  const f = fixture({ failCheckpoint: true }); f.w.startHandoff('child'); await done(f);
  f.w.startHandoff('child'); await done(f);
  assert.equal(f.calls.filter(call => call.method === 'turn/start').length, 1);
  assert.match(f.branch.handoff.detail, /Checkpoint acceptance is uncertain/); assert.deepEqual(f.archived, []);
});

test('archive uncertainty retains delivered branch and never resends on retry', async () => {
  const f = fixture({ failArchive: true }); f.w.startHandoff('child'); await done(f);
  assert.equal(f.branch.returnSummary.delivered, true); assert.ok(f.w.agents.has('child'));
  assert.throws(() => f.w.startHandoff('child'), /archive confirmation was lost/);
  assert.equal(f.calls.filter(call => call.method === 'turn/start' && call.params.threadId === 'parent').length, 1);
});

test('active handoff locks ordinary mutations but preserves branch and native questions', async () => {
  const f = fixture({ holdCheckpoint: true }); f.branch.thread.status = { type: 'active' }; f.branch.turnId = 'busy';
  f.w.startHandoff('child');
  assert.throws(() => f.w.close('child'), /handoff/);
  await assert.rejects(f.w.send('child', 'new ordinary work'), /handoff/);
  await assert.rejects(f.w.linkTasks('child', []), /handoff/);
  await assert.rejects(f.w.summarize('child'), /handoff/);
  f.rpc.ready = false; f.w.changed(); await done(f);
  assert.ok(f.w.agents.has('child'));
});

test('summary source includes all linked tasks rather than silently dropping tasks after ten', () => {
  assert.match(summaryPrompt('Project', Array.from({ length: 30 }, (_, i) => ({ id: `task-${i}`, text: 'Work', state: 'open' }))), /task-29/);
});

test('nullable native client identity uses the exact durable handoff reference and complete text', async () => {
  const f = fixture({ nullClientId: true });
  // The archive fixture normally asserts clientId; allow the nullable runtime
  // shape while retaining an exact unique visible handoff reference.
  const call = f.rpc.call;
  f.rpc.call = async (method, params) => {
    if (method === 'thread/archive') {
      const text = f.turns.get('parent')[0].items[0].content[0].text;
      assert.match(text, /Handoff reference: ccng-handoff-/); f.archived.push(params.threadId); return {};
    }
    return call(method, params);
  };
  f.w.startHandoff('child'); await done(f);
  assert.deepEqual(f.archived, ['child']);
});

test('legacy manual summary and return cannot bypass a failed new handoff', async () => {
  const f = fixture({ terminals: { child: [{ processId: 'running' }] } });
  f.w.startHandoff('child'); await done(f);
  await assert.rejects(f.w.summarize('child'), /Hand back & close/);
  await assert.rejects(f.w.returnToParent('child', 'Bypass'), /older return flow cannot bypass/);
});

test('closed parent at capacity keeps branch and reports how to free a tab', async () => {
  const f = fixture(); f.w.agents.delete('parent'); let full = true;
  f.w.open = async id => {
    if (full) throw Object.assign(new Error('All tabs open'), { status: 409 });
    f.w.agents.set(id, f.parent); return f.parent;
  };
  f.w.startHandoff('child');
  await until(() => f.branch.handoff?.detail.includes('Close another tab'));
  assert.ok(f.w.agents.has('child')); assert.deepEqual(f.archived, []);
  full = false; f.w.changed(); await done(f);
  assert.deepEqual(f.archived, ['child']);
});

test('parent outbound summaries and handoffs are serialized behind an incoming child delivery', async () => {
  const f = fixture(); f.parent.parentId = 'grandparent';
  const call = f.rpc.call; let checked = false;
  f.rpc.call = async (method, params) => {
    if (method === 'turn/start' && params.threadId === 'parent') {
      await assert.rejects(f.w.summarize('parent'), /incoming delivery/);
      assert.throws(() => f.w.startHandoff('parent'), /child branch is delivering/);
      checked = true;
    }
    return call(method, params);
  };
  f.w.startHandoff('child'); await done(f);
  assert.ok(checked); assert.deepEqual(f.archived, ['child']);
});

test('native safety APIs paginate spawned descendants and terminal records without truncation', async () => {
  const f = fixture(); const call = f.rpc.call;
  f.native.set('late-descendant', { id: 'late-descendant', status: { type: 'active' } });
  f.rpc.call = async (method, params) => {
    if (method === 'thread/list') return params.cursor ? { data: [{ id: 'late-descendant' }], nextCursor: null } : { data: [], nextCursor: 'next-page' };
    return call(method, params);
  };
  f.w.startHandoff('child'); await done(f);
  assert.equal(f.branch.handoff.phase, 'failed'); assert.deepEqual(f.archived, []);
});

test('different canonical project directories retain branch before any task writes', async () => {
  const f = fixture(); f.parent.cwd = '/'; f.w.startHandoff('child'); await done(f);
  assert.match(f.branch.handoff.detail, /different project directories/);
  assert.deepEqual(f.links, []); assert.deepEqual(f.archived, []);
});

test('unloaded spawned descendant with unsupported terminal inspection is retained rather than assumed stopped', async () => {
  const f = fixture({ descendants: [{ id: 'finished-spawn' }] });
  f.native.set('finished-spawn', { id: 'finished-spawn', status: { type: 'notLoaded' } });
  const call = f.rpc.call;
  f.rpc.call = async (method, params) => {
    if (method === 'thread/backgroundTerminals/list' && params.threadId === 'finished-spawn') throw new Error('Native terminal inspection unavailable for unloaded thread');
    return call(method, params);
  };
  f.w.startHandoff('child'); await done(f);
  assert.equal(f.branch.handoff.phase, 'failed'); assert.match(f.branch.handoff.detail, /inspection unavailable/);
  assert.deepEqual(f.archived, []); assert.ok(f.w.agents.has('child'));
});

test('unloaded spawned descendant may be archived only with explicit empty terminal and inactive goal evidence', async () => {
  const f = fixture({ descendants: [{ id: 'finished-spawn' }] });
  f.native.set('finished-spawn', { id: 'finished-spawn', status: { type: 'notLoaded' } });
  f.w.startHandoff('child'); await done(f);
  assert.deepEqual(f.archived, ['child']);
  assert.ok(f.calls.some(call => call.method === 'thread/backgroundTerminals/list' && call.params.threadId === 'finished-spawn'));
  assert.ok(f.calls.some(call => call.method === 'thread/goal/get' && call.params.threadId === 'finished-spawn'));
});

test('unconfirmed native continuation pause retains the child instead of archiving active work', async () => {
  const f = fixture({ goal: true }), call = f.rpc.call;
  f.rpc.call = async (method, params) => method === 'thread/goal/set' ? call('thread/goal/get', params) : call(method, params);
  f.w.startHandoff('child'); await done(f);
  assert.equal(f.branch.handoff.phase, 'failed');
  assert.match(f.branch.handoff.detail, /continuation is still active/);
  assert.deepEqual(f.archived, []); assert.ok(f.w.agents.has('child'));
});

test('native continuation inspection refuses wrong-thread state before safe closure', async () => {
  const f = fixture({ goal: true }), call = f.rpc.call;
  f.rpc.call = async (method, params) => {
    const result = await call(method, params);
    return method === 'thread/goal/get' ? { goal: { ...result.goal, threadId: 'unrelated' } } : result;
  };
  f.w.startHandoff('child'); await done(f);
  assert.equal(f.branch.handoff.phase, 'failed'); assert.match(f.branch.handoff.detail, /different or invalid conversation/);
  assert.deepEqual(f.archived, []);
});
