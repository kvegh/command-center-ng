import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.mjs';
import { Coordinator } from '../server/coordinator.mjs';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const expectResumeEntered = async (fixture, sending) => {
  // Handle an early rejection too: a missing resume is a regression failure,
  // rather than an unhandled promise or a test waiting forever on its gate.
  const settled = sending.then(value => ({ value }), error => ({ error }));
  await Promise.race([fixture.resumeEntered.promise, settled]);
  assert.equal(fixture.calls.some(call => call.method === 'thread/resume'), true, 'the unloaded worker must enter native resume');
};

function fixture() {
  const rpc = new EventEmitter(); rpc.ready = true;
  const calls = [];
  const native = { id: 'example-worker', name: 'Example project', cwd: '/example/project', status: { type: 'idle' }, canAcceptDirectInput: true };
  const workspace = new Workspace(rpc, { beads: null });
  const agent = { id: native.id, name: native.name, cwd: native.cwd, role: 'worker', provider: 'codex', thread: structuredClone(native), observingOnly: false, canSend: true, messages: [], tasks: [], workers: [], questions: [], turnId: null, finishedTurn: { id: 'previous-turn', status: 'completed' } };
  workspace.agents.set(agent.id, agent); workspace.watched.add(agent.id);
  // Isolate lifecycle delivery from unrelated filesystem instruction discovery.
  workspace.instructionContext = async () => ({});
  const f = { rpc, calls, native, workspace, agent, loaded: true };
  rpc.call = async (method, params) => {
    calls.push({ method, params });
    if (method === 'thread/read') return { thread: structuredClone(native) };
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    if (method === 'config/read') {
      f.configEntered?.resolve();
      if (f.configGate) await f.configGate.promise;
      return { config: { mcp_servers: { example: {} } } };
    }
    if (method === 'thread/resume') {
      f.resumeEntered?.resolve();
      if (f.resumeGate) await f.resumeGate.promise;
      if (f.resumeError) throw f.resumeError;
      f.loaded = true; native.status = f.resumeStatus || { type: 'idle' };
      if (f.replayedRequest) rpc.emit('request', f.replayedRequest);
      return { thread: structuredClone(f.resumeThread || native), sandbox: f.resumeSandbox || { type: 'readOnly' }, instructionSources: [] };
    }
    if (method === 'turn/start' || method === 'turn/steer') {
      if (!f.loaded) throw new Error('thread not found: example-worker');
      if (f.deliveryError) throw f.deliveryError;
      return method === 'turn/start' ? { turn: { id: 'accepted-turn' } } : { turnId: params.expectedTurnId };
    }
    throw new Error('Unexpected synthetic native operation: ' + method);
  };
  rpc.respond = () => assert.fail('Input restoration must not answer native requests.');
  rpc.refuse = () => assert.fail('Input restoration must not refuse native requests.');
  f.unload = (method = 'thread/status/changed') => {
    f.loaded = false; native.status = { type: 'notLoaded' };
    workspace.notification({ method, params: { threadId: agent.id, ...(method === 'thread/status/changed' ? { status: structuredClone(native.status) } : {}) } });
  };
  f.mutations = () => calls.filter(call => ['thread/resume', 'turn/start', 'turn/steer'].includes(call.method));
  return f;
}

function coordinatorFor(fixture) {
  const coordinator = new Coordinator(fixture.workspace, { debounceMs: 1000000 });
  fixture.workspace.coordinator = coordinator; coordinator.id = fixture.agent.id; coordinator.paused = true;
  fixture.agent.role = 'coordinator';
  return coordinator;
}

test('manual input resumes a previously attached worker after a native unloaded-status event', async () => {
  const f = fixture(); f.unload();
  const text = 'Continue the existing authorized work.';
  assert.deepEqual(await f.workspace.send(f.agent.id, text), { turnId: 'accepted-turn' });
  assert.deepEqual(f.mutations().map(call => call.method), ['thread/resume', 'turn/start']);
  assert.deepEqual(f.mutations()[0].params, { threadId: f.agent.id, excludeTurns: true });
  assert.equal(f.mutations()[1].params.threadId, f.agent.id);
  assert.deepEqual(f.mutations()[1].params.input, [{ type: 'text', text, text_elements: [] }]);
  assert.equal(f.workspace.agent(f.agent.id), f.agent);
  assert.equal(f.agent.observingOnly, false);
});

test('polling observes an unloaded worker without resuming it, and later human input resumes once', async () => {
  const f = fixture(); f.loaded = false; f.native.status = { type: 'notLoaded' };
  await f.workspace.refreshObserved(f.agent.id);
  assert.equal(f.agent.thread.status.type, 'notLoaded');
  assert.deepEqual(f.mutations(), [], 'background observation must not awaken unloaded work');
  await f.workspace.send(f.agent.id, 'A new human follow-up.');
  assert.deepEqual(f.mutations().map(call => call.method), ['thread/resume', 'turn/start']);
});

test('a native closed event makes the next human input resume the same conversation', async () => {
  const f = fixture(); f.agent.turnId = 'old-active-turn'; f.agent.thread.status = { type: 'active', activeFlags: [] };
  f.unload('thread/closed');
  await f.workspace.send(f.agent.id, 'New explicit human instruction.');
  assert.deepEqual(f.mutations().map(call => call.method), ['thread/resume', 'turn/start']);
  assert.equal(f.calls.some(call => call.method === 'turn/steer'), false, 'the unloaded former turn cannot be steered');
});

test('failed resume submits no user input and preserves explicit stop intent', async () => {
  const f = fixture(); f.unload();
  const stopIntent = {}; Object.defineProperty(f.agent, 'requestStopIntent', { configurable: true, value: stopIntent });
  f.resumeError = new Error('Synthetic native resume failed.');
  await assert.rejects(f.workspace.send(f.agent.id, 'Keep this unsent follow-up available.'), /Synthetic native resume failed/);
  assert.deepEqual(f.mutations().map(call => call.method), ['thread/resume']);
  assert.equal(f.agent.requestStopIntent, stopIntent);
  assert.equal(f.agent.messages.length, 0, 'no optimistic input receipt or native history is fabricated');
});

test('an unconfirmed turn submission is never automatically resumed or resent', async () => {
  const f = fixture(); f.unload(); f.deliveryError = new Error('Synthetic input acknowledgement timed out.');
  await assert.rejects(f.workspace.send(f.agent.id, 'Submit only once.'), /acknowledgement timed out/);
  assert.deepEqual(f.mutations().map(call => call.method), ['thread/resume', 'turn/start']);
});

test('a loaded active worker keeps native steering without a resume or new turn', async () => {
  const f = fixture(); f.agent.turnId = 'active-turn'; f.agent.thread.status = { type: 'active', activeFlags: [] };
  assert.deepEqual(await f.workspace.send(f.agent.id, 'Adjust the current work.'), { turnId: 'active-turn' });
  assert.deepEqual(f.mutations().map(call => call.method), ['turn/steer']);
  assert.equal(f.mutations()[0].params.expectedTurnId, 'active-turn');
});

test('pending approvals, native waits, ownership and handoff still block input before resume', async () => {
  const cases = [
    f => { f.agent.questions.push({ id: 'pending-approval' }); },
    f => { f.agent.thread.status = { type: 'active', activeFlags: ['waitingOnUserInput'] }; },
    f => { f.agent.canSend = false; },
    f => { f.workspace.returnJobs.set(f.agent.id, {}); },
  ];
  for (const setup of cases) {
    const f = fixture(); f.unload(); setup(f);
    await assert.rejects(f.workspace.send(f.agent.id, 'Do not bypass this gate.'), /pending|direct input|handoff/i);
    assert.deepEqual(f.mutations(), []);
  }
});

test('a replayed original approval blocks the waiting human message instead of answering it', async () => {
  const f = fixture(); f.unload();
  f.resumeStatus = { type: 'active', activeFlags: ['waitingOnApproval'] };
  f.replayedRequest = { id: 41, method: 'item/commandExecution/requestApproval', params: { threadId: f.agent.id, turnId: 'original-turn', itemId: 'original-command', command: 'synthetic-read-only-command' } };
  await assert.rejects(f.workspace.send(f.agent.id, 'Wait for the original decision.'), /pending request/);
  assert.deepEqual(f.mutations().map(call => call.method), ['thread/resume']);
  assert.equal(f.agent.questions.length, 1);
  assert.equal(f.agent.questions[0].id, f.replayedRequest.id);
  assert.equal(f.agent.questions[0].params, f.replayedRequest.params);
});

test('closing the tab during resume prevents subsequent user-input submission', async () => {
  const f = fixture(); f.unload(); f.resumeEntered = deferred(); f.resumeGate = deferred();
  const sending = f.workspace.send(f.agent.id, 'Do not deliver after tab closure.');
  await expectResumeEntered(f, sending); f.workspace.close(f.agent.id); f.resumeGate.resolve();
  await assert.rejects(sending, /closed|changed|no longer|unavailable/i);
  assert.deepEqual(f.mutations().map(call => call.method), ['thread/resume']);
  assert.equal(f.workspace.agents.has(f.agent.id), false);
});

test('disconnecting during resume prevents submission on a different connection', async () => {
  const f = fixture(); f.unload(); f.resumeEntered = deferred(); f.resumeGate = deferred();
  const sending = f.workspace.send(f.agent.id, 'Keep this input unsent across disconnection.');
  await expectResumeEntered(f, sending);
  f.rpc.ready = false; f.rpc.emit('disconnected', 'Synthetic disconnect.');
  f.rpc.ready = true; f.rpc.emit('connected'); f.resumeGate.resolve();
  await assert.rejects(sending, /connect|changed/i);
  assert.deepEqual(f.mutations().map(call => call.method), ['thread/resume']);
});

test('resume metadata for another conversation cannot authorize input', async () => {
  const f = fixture(); f.unload(); f.resumeThread = { ...f.native, id: 'different-worker', status: { type: 'idle' } };
  const originalThread = f.agent.thread;
  await assert.rejects(f.workspace.send(f.agent.id, 'Keep the exact original conversation.'), /identity|changed|conversation/i);
  assert.deepEqual(f.mutations().map(call => call.method), ['thread/resume']);
  assert.equal(f.agent.thread, originalThread, 'foreign metadata must not replace the original conversation');
});

test('native input denial returned by resume blocks the message before turn submission', async () => {
  const f = fixture(); f.unload();
  f.resumeThread = { ...f.native, status: { type: 'idle' }, canAcceptDirectInput: false };
  await assert.rejects(f.workspace.send(f.agent.id, 'Respect the freshly returned native ownership.'), /direct input/i);
  assert.deepEqual(f.mutations().map(call => call.method), ['thread/resume']);
  assert.equal(f.agent.canSend, false);
});

test('an unloaded coordinator resumes only through its restricted native activation', async () => {
  const f = fixture();
  const coordinator = coordinatorFor(f); f.unload();
  try {
    await f.workspace.send(f.agent.id, 'Summarize the existing evidence.');
    assert.deepEqual(f.mutations().map(call => call.method), ['thread/resume', 'turn/start']);
    const resumed = f.mutations()[0].params;
    assert.equal(resumed.threadId, f.agent.id); assert.equal(resumed.excludeTurns, true);
    assert.equal(resumed.sandbox, 'read-only'); assert.equal(resumed.config['features.shell_tool'], false);
    assert.equal(resumed.config['mcp_servers.example.enabled'], false);
    assert.equal(resumed.model, undefined); assert.equal(coordinator.paused, true);
  } finally { coordinator.stop(); }
});

test('coordinator input denial returned by restricted resume prevents turn submission', async () => {
  const f = fixture(); const coordinator = coordinatorFor(f); f.unload();
  f.resumeThread = { ...f.native, status: { type: 'idle' }, canAcceptDirectInput: false };
  try {
    await assert.rejects(f.workspace.send(f.agent.id, 'Respect native coordinator ownership.'), /direct input/i);
    assert.deepEqual(f.mutations().map(call => call.method), ['thread/resume']);
    assert.equal(f.agent.canSend, false); assert.equal(coordinator.paused, true);
  } finally { coordinator.stop(); }
});

test('coordinator connection or ownership changes during option reads prevent native resume', async () => {
  for (const change of ['reconnect', 'closed']) {
    const f = fixture(); const coordinator = coordinatorFor(f); f.unload();
    f.configEntered = deferred(); f.configGate = deferred();
    const sending = f.workspace.send(f.agent.id, 'Do not load through a stale coordinator context.');
    const outcome = sending.then(value => ({ value }), error => ({ error }));
    try {
      await Promise.race([f.configEntered.promise, outcome]);
      assert.equal(f.calls.some(call => call.method === 'config/read'), true);
      if (change === 'reconnect') {
        f.rpc.ready = false; f.rpc.emit('disconnected', 'Synthetic coordinator disconnect.');
        f.rpc.ready = true; f.rpc.emit('connected');
      } else {
        // Simulate the owning workspace being removed during shutdown/loading;
        // the normal coordinator-tab close action remains forbidden.
        f.workspace.agents.delete(f.agent.id);
      }
      f.configGate.resolve();
      await assert.rejects(sending, /coordinator connection changed/i);
      assert.deepEqual(f.mutations(), [], 'stale options cannot authorize even a native resume');
    } finally { f.configGate.resolve(); await outcome; coordinator.stop(); }
  }
});

test('missing coordinator sandbox confirmation prevents input and state adoption', async () => {
  const f = fixture(); const coordinator = coordinatorFor(f); f.unload();
  const originalThread = f.agent.thread; f.resumeSandbox = { type: 'workspaceWrite' };
  try {
    await assert.rejects(f.workspace.send(f.agent.id, 'Preserve the coordinator read-only role.'), /read-only sandbox/i);
    assert.deepEqual(f.mutations().map(call => call.method), ['thread/resume']);
    assert.equal(f.agent.thread, originalThread);
    assert.equal(coordinator.paused, true);
  } finally { coordinator.stop(); }
});
