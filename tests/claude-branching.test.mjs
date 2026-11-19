import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { ClaudeSessions, CLAUDE_APPROVAL, MAX_CLAUDE_BRANCH_LINKS } from '../server/claude.mjs';
import { Workspace } from '../server/workspace.mjs';
import { BeadsTasks } from '../server/beads.mjs';
import limits from '../server/limits.json' with { type: 'json' };

const nativeId = '11111111-2222-4333-8444-555555555555';
const sourceId = 'claude-' + nativeId;
const firstId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const replyId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const followupId = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
const textMessage = (type, id, text, stopReason) => ({
  type, uuid: id, session_id: nativeId,
  message: { role: type, content: [{ type: 'text', text }], ...(stopReason ? { stop_reason: stopReason } : {}) }
});
const history = () => [
  textMessage('user', firstId, 'Inspect the example project.'),
  textMessage('assistant', replyId, 'The example is ready.', 'end_turn'),
  textMessage('user', followupId, 'Explore a separate approach.')
];

class Events {
  values = []; waiting = null; ended = false;
  push(value) { if (this.waiting) { this.waiting({ value, done: false }); this.waiting = null; } else this.values.push(value); }
  next() { if (this.values.length) return Promise.resolve({ value: this.values.shift(), done: false }); if (this.ended) return Promise.resolve({ done: true }); return new Promise(resolve => { this.waiting = resolve; }); }
  close() { this.ended = true; this.waiting?.({ done: true }); this.waiting = null; }
  [Symbol.asyncIterator]() { return this; }
}

const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) {
  for (let n = 0; n < 40 && !check(); n++) await tick();
  assert.ok(check(), 'The expected Claude event was not consumed.');
}

async function fixture({ forkSupported = true, messages = history() } = {}) {
  const calls = [], queries = [], controls = [], rpcCalls = [], taskReads = [], renames = [];
  const info = { sessionId: nativeId, cwd: '/example/project', summary: 'Inspect example project', firstPrompt: 'Inspect example project' };
  const sessions = new Map([[nativeId, { info, messages }]]);
  const sdk = {
    listSessions: async () => [...sessions.values()].map(value => value.info),
    getSessionInfo: async id => sessions.get(id)?.info,
    getSessionMessages: async id => structuredClone(sessions.get(id)?.messages || []),
    renameSession: async (id, title, options) => { renames.push({ id, title, options }); sessions.get(id).info.customTitle = title; },
    query(params) {
      const query = new Events(); query.params = params; queries.push(query);
      query.interrupt = async () => { controls.push('interrupt'); };
      query.close = () => { controls.push('close'); Events.prototype.close.call(query); };
      return query;
    }
  };
  if (forkSupported) sdk.forkSession = async (id, options) => {
    calls.push({ id, options });
    const source = sessions.get(id), sessionId = randomUUID();
    const end = options.upToMessageId ? source.messages.findIndex(message => message.uuid === options.upToMessageId) + 1 : source.messages.length;
    const copied = structuredClone(source.messages.slice(0, end)).map(message => ({ ...message, uuid: randomUUID(), session_id: sessionId }));
    sessions.set(sessionId, { info: { ...source.info, sessionId, customTitle: options.title }, messages: copied });
    return { sessionId };
  };
  const runtime = new ClaudeSessions({ loadSdk: async () => sdk, executable: async () => '/example/bin/claude', activeSessions: async () => [] });
  assert.equal(await runtime.initialize(), true);
  const rpc = new EventEmitter(); rpc.ready = false;
  rpc.call = async (method, params) => { rpcCalls.push({ method, params }); throw new Error('Claude branching must not call Codex.'); };
  const beads = { context: BeadsTasks.prototype.context, linked: async (cwd, id) => { taskReads.push({ cwd, id }); return { status: 'ready', label: 'ccng-session:' + id, tasks: [] }; } };
  const workspace = new Workspace(rpc, { claude: runtime, beads });
  const source = await workspace.open(sourceId);
  return { runtime, sdk, calls, queries, controls, rpcCalls, taskReads, sessions, renames, workspace, source, close: () => runtime.shutdown() };
}

test('Claude Branch chat forks the persisted conversation without a cutoff or model turn', async () => {
  const f = await fixture();
  try {
    const before = structuredClone(f.source.messages);
    const childId = await f.workspace.fork(sourceId), child = f.workspace.agent(childId);
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.calls[0], { id: nativeId, options: { dir: f.source.cwd, title: 'Branch · ' + f.source.goal } });
    assert.equal(child.provider, 'claude'); assert.notEqual(child.nativeSessionId, nativeId);
    assert.equal(child.parentId, sourceId); assert.equal(child.cwd, f.source.cwd);
    assert.deepEqual(child.messages.map(message => message.text), before.map(message => message.text));
    assert.ok(child.messages.every(message => !before.some(original => original.nativeMessageId === message.nativeMessageId)));
    assert.deepEqual(f.source.messages, before);
    assert.equal(f.queries.length, 0); assert.deepEqual(f.rpcCalls, []); assert.deepEqual(f.controls, []);
    assert.equal(f.workspace.creating, 0); assert.equal(f.workspace.workerSlots(), 2);
  } finally { await f.close(); }
});

test('Claude Branch here maps the selected completed reply to its exact native message UUID', async () => {
  const f = await fixture();
  try {
    const selected = f.source.messages.find(message => message.nativeMessageId === replyId);
    assert.equal(selected.branchable, true);
    const child = f.workspace.agent(await f.workspace.fork(sourceId, selected.turnId));
    assert.equal(f.calls[0].options.upToMessageId, replyId);
    assert.deepEqual(child.messages.map(message => message.text), ['Inspect the example project.', 'The example is ready.']);
    assert.equal(f.source.messages.at(-1).nativeMessageId, followupId, 'later parent history remains intact');
    assert.equal(f.queries.length, 0); assert.deepEqual(f.rpcCalls, []);
  } finally { await f.close(); }
});

test('the first explicit Claude branch follow-up resumes only the child with its own task context', async () => {
  const f = await fixture();
  try {
    await f.runtime.configureAutoReviewSessions([sourceId]);
    const originalName = f.source.name, originalGoal = f.source.goal;
    const childId = await f.workspace.fork(sourceId), child = f.workspace.agent(childId);
    assert.equal(f.queries.length, 0); assert.deepEqual(f.renames, []);
    await f.workspace.send(childId, 'Explore the alternate implementation.\nKeep the parent unchanged.');
    assert.equal(f.queries.length, 1);
    const query = f.queries[0], sent = (await query.params.prompt.next()).value;
    assert.equal(query.params.options.resume, child.nativeSessionId);
    assert.equal(query.params.options.sessionId, undefined, 'the branch is already a persisted native session');
    assert.equal(query.params.options.cwd, f.source.cwd);
    assert.equal(query.params.options.permissionMode, 'auto', 'the child retains Auto as its own requested preference');
    assert.equal(child.autoReviewConfigured, false); assert.equal(f.source.autoReviewConfigured, true);
    assert.match(query.params.options.systemPrompt.append, new RegExp('ccng-session:' + childId));
    assert.ok(!query.params.options.systemPrompt.append.includes('ccng-session:' + sourceId));
    assert.deepEqual(f.renames, [{ id: child.nativeSessionId, title: 'Explore the alternate implementation.', options: { dir: child.cwd } }]);
    assert.equal(child.name, 'Explore the alternate implementation.'); assert.equal(child.goal, child.name);
    assert.equal(sent.session_id, child.nativeSessionId);
    assert.equal(sent.message.content, 'Explore the alternate implementation.\nKeep the parent unchanged.');
    assert.equal(f.source.name, originalName); assert.equal(f.source.goal, originalGoal);
    assert.ok(!f.runtime.runs.has(sourceId)); assert.deepEqual(f.rpcCalls, []);
  } finally { await f.close(); }
});

test('both Claude branch forms retain explicit mode intent and otherwise default new chats to Auto', async t => {
  const cases = [
    { name: 'observer without a saved preference', preference: undefined, configured: false, expected: 'auto' },
    { name: 'configured Auto without a saved preference', preference: undefined, configured: true, expected: 'auto' },
    { name: 'requested Auto after native Manual fallback', preference: 'auto', configured: false, expected: 'auto' },
    { name: 'explicit Manual overrides configured Auto', preference: 'default', configured: true, expected: 'default' }
  ];
  for (const atReply of [false, true]) for (const scenario of cases) await t.test(`${atReply ? 'Branch here' : 'Branch chat'}: ${scenario.name}`, async () => {
    const f = await fixture();
    try {
      if (scenario.configured) await f.runtime.configureAutoReviewSessions([sourceId]);
      if (scenario.preference) f.runtime.permissionPreferences.set(sourceId, scenario.preference);
      f.source.permissionMode = 'default';
      const preferences = [...f.runtime.permissionPreferences];
      const cutoff = atReply ? f.source.messages.find(message => message.nativeMessageId === replyId).turnId : undefined;
      const childId = await f.workspace.fork(sourceId, cutoff), child = f.workspace.agent(childId);
      assert.equal(f.runtime.permissionPreferences.get(childId), scenario.expected);
      assert.deepEqual([...f.runtime.permissionPreferences].filter(([id]) => id !== childId), preferences);
      assert.equal(child.autoReviewConfigured, false, 'the child is not added to the operator selection');
      assert.equal(child.permissionMode, null, 'requested intent is not native acknowledgement');
      assert.equal(f.queries.length, 0); assert.deepEqual(f.controls, []);
      await f.workspace.send(childId, 'Continue only this branch.');
      const options = f.queries[0].params.options;
      assert.equal(options.permissionMode, scenario.expected); assert.equal(options.resume, child.nativeSessionId);
      for (const key of ['allowedTools', 'allowDangerouslySkipPermissions', 'settings']) assert.equal(Object.hasOwn(options, key), false, key);
      assert.equal(f.runtime.runs.has(sourceId), false); assert.deepEqual(f.controls, []);
    } finally { await f.close(); }
  });
});

test('Claude historical tool-use and unfinished replies cannot be selected as completed branch cutoffs', async () => {
  const toolId = 'dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb';
  const f = await fixture({ messages: [
    ...history(), textMessage('assistant', toolId, 'I will inspect a file.', 'tool_use'),
    textMessage('assistant', 'eeeeeeee-ffff-4aaa-8bbb-cccccccccccc', 'An incomplete reply.')
  ] });
  try {
    const unfinished = f.source.messages.filter(message => message.type === 'assistant' && message.nativeMessageId !== replyId);
    assert.ok(unfinished.every(message => !message.branchable));
    for (const cutoff of [23, '', 'foreign-turn', ...unfinished.map(message => message.turnId), f.source.messages[0].turnId]) {
      await assert.rejects(f.workspace.fork(sourceId, cutoff), /completed reply/i);
    }
    assert.equal(f.calls.length, 0); assert.equal(f.workspace.workerCount(), 1); assert.equal(f.workspace.creating, 0);
  } finally { await f.close(); }
});

test('Claude fork validates cutoffs even when its adapter is called directly', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.runtime.fork(f.source, 'not-a-native-reply'), /completed reply/i);
    const selected = f.source.messages.find(message => message.nativeMessageId === replyId);
    selected.nativeMessageId = '../not-a-message';
    await assert.rejects(f.runtime.fork(f.source, selected.turnId));
    assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});

test('Claude forking leaves an active parent and its exact pending approval untouched', async () => {
  const f = await fixture();
  try {
    await f.runtime.send(f.source, 'Continue the parent task.');
    const job = f.runtime.runs.get(sourceId), turnId = f.source.turnId;
    const questionResult = f.runtime.pending(f.source, 'native-permission', CLAUDE_APPROVAL, { toolName: 'Read', input: { file_path: '/example/project/README.md' } }, new AbortController().signal);
    const question = f.source.questions[0], pending = f.runtime.requests.get(JSON.stringify([sourceId, question.id]));
    f.source.tasks = [{ id: 'parent-task', state: 'in_progress' }];
    f.source.tracker.tasks = [{ id: 'parent-task', status: 'in_progress' }];
    const messages = structuredClone(f.source.messages);
    const childId = await f.workspace.fork(sourceId), child = f.workspace.agent(childId);
    assert.equal(f.runtime.runs.get(sourceId), job); assert.equal(f.source.turnId, turnId);
    assert.equal(f.source.questions[0], question); assert.equal(question.responding, undefined);
    assert.equal(f.runtime.requests.get(JSON.stringify([sourceId, question.id])), pending);
    assert.deepEqual(f.source.messages, messages); assert.deepEqual(f.source.tracker.tasks, [{ id: 'parent-task', status: 'in_progress' }]);
    assert.deepEqual(child.questions, []); assert.deepEqual(child.tasks, []); assert.deepEqual(child.tracker.tasks, []);
    assert.ok(!f.runtime.runs.has(childId)); assert.equal(f.queries.length, 1); assert.deepEqual(f.controls, []);
    assert.deepEqual(f.taskReads.at(-1), { cwd: f.source.cwd, id: childId });
    assert.equal(f.runtime.requests.size, 1, 'the child receives no parent callback');
    void questionResult;
  } finally { await f.close(); }
});

test('Claude live final replies become branchable only after native turn completion', async () => {
  const f = await fixture({ messages: [] });
  try {
    await f.runtime.send(f.source, 'Answer without tools.');
    const query = f.queries[0];
    query.push(textMessage('assistant', replyId, 'Completed answer.', 'end_turn'));
    await until(() => f.source.messages.some(message => message.nativeMessageId === replyId));
    const reply = () => f.source.messages.find(message => message.nativeMessageId === replyId);
    assert.ok(!reply().branchable, 'receiving text is not proof the turn ended');
    query.push({ type: 'result', subtype: 'success', session_id: nativeId, is_error: false });
    await until(() => f.source.turnId === null);
    assert.equal(reply().branchable, true);
  } finally { await f.close(); }
});

test('Claude missing native fork support hides the capability and fails without mutation', async () => {
  const f = await fixture({ forkSupported: false });
  try {
    assert.equal(f.source.canBranch, false);
    await assert.rejects(f.workspace.fork(sourceId), /fork|branch|SDK/i);
    assert.equal(f.workspace.workerCount(), 1); assert.equal(f.workspace.creating, 0);
    assert.equal(f.queries.length, 0); assert.deepEqual(f.rpcCalls, []); assert.deepEqual(f.controls, []);
  } finally { await f.close(); }
});

test('a successful Claude result does not turn pre-tool text into a completed-reply cutoff', async () => {
  const f = await fixture({ messages: [] });
  try {
    await f.runtime.send(f.source, 'Inspect the project.');
    const query = f.queries[0];
    query.push(textMessage('assistant', replyId, 'Reading the project.', 'tool_use'));
    await until(() => f.source.messages.some(message => message.nativeMessageId === replyId));
    query.push({ type: 'result', subtype: 'success', session_id: nativeId, is_error: false });
    await until(() => f.source.turnId === null);
    const reply = f.source.messages.find(message => message.nativeMessageId === replyId);
    assert.notEqual(reply.branchable, true);
    await assert.rejects(f.workspace.fork(sourceId, reply.turnId), /completed reply/);
    assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});

test('Claude native fork errors preserve the source and release the reserved worker slot', async () => {
  const f = await fixture();
  try {
    f.sdk.forkSession = async () => { throw new Error('Native transcript is not ready.'); };
    await assert.rejects(f.workspace.fork(sourceId), /Native transcript is not ready/);
    assert.equal(f.workspace.agent(sourceId), f.source); assert.equal(f.workspace.workerCount(), 1);
    assert.equal(f.workspace.creating, 0); assert.equal(f.runtime.records.size, 1);
    assert.equal(f.runtime.permissionPreferences.size, 0, 'a failed fork creates no child preference');
    assert.equal(f.queries.length, 0); assert.deepEqual(f.rpcCalls, []);
  } finally { await f.close(); }
});

test('Claude refuses malformed or reused fork identities without opening another existing session', async () => {
  for (const result of [undefined, {}, { sessionId: '../invalid' }, { sessionId: nativeId }]) {
    const f = await fixture();
    try {
      f.sdk.forkSession = async () => result;
      await assert.rejects(f.workspace.fork(sourceId));
      assert.equal(f.workspace.workerCount(), 1); assert.equal(f.runtime.records.size, 1);
      assert.equal(f.workspace.creating, 0); assert.equal(f.queries.length, 0); assert.deepEqual(f.rpcCalls, []);
      assert.equal(f.runtime.permissionPreferences.size, 0, 'an invalid child identity creates no preference');
    } finally { await f.close(); }
  }
});

test('Claude branching obeys the shared worker limit before copying a native transcript', async () => {
  const f = await fixture();
  try {
    for (let n = 1; n < limits.maxWorkers; n++) f.workspace.agents.set('other-' + n, { id: 'other-' + n, role: 'worker' });
    await assert.rejects(f.workspace.fork(sourceId), /Close.*tab|worker.*open/i);
    assert.equal(f.calls.length, 0); assert.equal(f.workspace.creating, 0);
    assert.equal(f.workspace.workerCount(), limits.maxWorkers);
  } finally { await f.close(); }
});

test('an in-flight Claude fork reserves its worker slot against a concurrent fork', async () => {
  const f = await fixture();
  let release;
  try {
    for (let n = 1; n < limits.maxWorkers - 1; n++) f.workspace.agents.set('other-' + n, { id: 'other-' + n, role: 'worker' });
    const copy = f.sdk.forkSession;
    f.sdk.forkSession = async (...args) => { await new Promise(resolve => { release = resolve; }); return copy(...args); };
    const first = f.workspace.fork(sourceId);
    await until(() => !!release);
    assert.equal(f.workspace.workerSlots(), limits.maxWorkers);
    await assert.rejects(f.workspace.fork(sourceId), /Close.*tab|worker.*open/i);
    release(); const childId = await first; release = null;
    assert.equal(f.workspace.agent(childId).parentId, sourceId);
    assert.equal(f.calls.length, 1); assert.equal(f.workspace.creating, 0);
    assert.equal(f.workspace.workerCount(), limits.maxWorkers);
  } finally { release?.(); await f.close(); }
});

test('a known native fork keeps its parent link when opening the new view fails', async () => {
  const f = await fixture();
  try {
    const info = f.sdk.getSessionInfo;
    f.sdk.getSessionInfo = async id => id === nativeId ? info(id) : undefined;
    await assert.rejects(f.workspace.fork(sourceId), /created branch claude-.*Reopen that session/);
    const [[childId, parentId]] = [...f.workspace.claudeBranchParents];
    assert.equal(parentId, sourceId); assert.notEqual(childId, sourceId);
    assert.equal(f.sessions.has(childId.slice(7)), true);
    assert.equal(f.workspace.agents.has(childId), false);
    assert.equal(f.calls.length, 1); assert.equal(f.workspace.creating, 0);
    assert.equal(f.queries.length, 0);
  } finally { await f.close(); }
});

test('Claude branch links are never silently pruned to make room for another fork', async () => {
  const f = await fixture();
  try {
    for (let n = 0; n < MAX_CLAUDE_BRANCH_LINKS; n++) f.workspace.claudeBranchParents.set('claude-' + randomUUID(), sourceId);
    const before = [...f.workspace.claudeBranchParents];
    await assert.rejects(f.workspace.fork(sourceId), /branch-link limit/);
    assert.deepEqual([...f.workspace.claudeBranchParents], before);
    assert.equal(f.calls.length, 0); assert.equal(f.workspace.creating, 0);
  } finally { await f.close(); }
});
