import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/task-notifications.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { TaskNotificationEngine, MAX_TASK_WATCHES } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const task = (state = 'open', extra = {}) => ({ id: 'task-one', text: 'Finish the selected work', state, blockedBy: [], ...extra });
const worker = (tasks = [task()], extra = {}) => ({ id: 'worker-one', name: 'Selected project', status: 'running', turnId: 'turn-one', questions: [], tracker: { status: 'ready', tasks }, ...extra });
const watch = { workerId: 'worker-one', taskId: 'task-one' };

test('initial observations and newly added subscriptions baseline historical terminal/input states', () => {
  for (const state of ['closed', 'completed', 'failed', 'error', 'blocked']) {
    const engine = new TaskNotificationEngine();
    const snapshot = worker([task(state)], { status: 'error', questions: [{ id: 1 }] });
    assert.deepEqual(engine.update([snapshot], []), []);
    assert.deepEqual(engine.update([snapshot], [watch]), []);
    assert.deepEqual(engine.update([snapshot], [watch]), []);
  }
});

test('an observed close is emitted from the full tracker even when active sidebar tasks disappear', () => {
  const engine = new TaskNotificationEngine();
  engine.update([worker()], [watch]);
  assert.deepEqual(engine.update([worker([task('in_progress')])], [watch]), []);
  const events = engine.update([worker([task('closed')], { tasks: [] })], [watch]);
  assert.equal(events.length, 1);
  assert.deepEqual({ ...events[0], id: undefined }, {
    id: undefined, scope: 'task', kind: 'completed', workerId: 'worker-one', workerName: 'Selected project',
    taskId: 'task-one', taskTitle: 'Finish the selected work'
  });
  assert.deepEqual(engine.update([worker([task('completed')])], [watch]), [], 'equivalent completion states do not repeat');
});

test('queued dependencies are not input needs, and a later real input transition alerts once', () => {
  const engine = new TaskNotificationEngine();
  engine.update([worker()], [watch]);
  assert.deepEqual(engine.update([worker([task('blocked', { blockedBy: ['prerequisite'] })])], [watch]), []);
  assert.deepEqual(engine.update([worker([task('blocked')])], [watch]), [], 'ordinary blocked work is not a request for input');
  const first = engine.update([worker([task('blocked', { isChatQuestion: true })])], [watch]);
  assert.equal(first[0].kind, 'needs-input');
  assert.deepEqual(engine.update([worker([task('needs_input')])], [watch]), []);
  engine.update([worker([task('in_progress')])], [watch]);
  const second = engine.update([worker([task('waiting_on_input')])], [watch]);
  assert.equal(second[0].kind, 'needs-input');
  assert.notEqual(first[0].id, second[0].id);
});

test('question labels respect dependency waiting, actual clearing and terminal outcomes', () => {
  const engine = new TaskNotificationEngine(); engine.update([worker()], [watch]);
  assert.deepEqual(engine.update([worker([task('blocked', { isChatQuestion: true, blockedBy: ['base'] })])], [watch]), []);
  assert.equal(engine.update([worker([task('blocked', { isChatQuestion: true })])], [watch])[0].kind, 'needs-input');
  assert.deepEqual(engine.update([worker([task('blocked')])], [watch]), [], 'clearing the question leaves unfinished blocked work');
  assert.equal(engine.update([worker([task('in_progress', { isChatQuestion: true, blockedBy: ['base'] })])], [watch])[0].kind, 'needs-input', 'active work keeps the same classification as the sidebar');
  assert.equal(engine.update([worker([task('closed', { isChatQuestion: true })])], [watch])[0].kind, 'completed');
  for (const state of ['cancelled', 'withdrawn']) assert.deepEqual(engine.update([worker([task(state, { isChatQuestion: true })])], [watch]), []);
});

test('only authoritative explicit task failure produces a task error', () => {
  const engine = new TaskNotificationEngine();
  engine.update([worker()], [watch]);
  const errors = engine.update([worker([task('failed')])], [watch]);
  assert.equal(errors[0].kind, 'error'); assert.equal(errors[0].scope, 'task');
  assert.deepEqual(engine.update([worker([task('error')])], [watch]), []);
  assert.deepEqual(engine.update([worker([task('in_progress')], { status: 'idle', turnId: null,
    messages: [{ id: 'tool-error', type: 'activity', state: 'failed', text: 'Do not infer task failure from this.' }] })], [watch]), []);
});

test('missing, withdrawn and removed tasks never become completed; reappearance is a baseline', () => {
  const engine = new TaskNotificationEngine();
  engine.update([worker()], [watch]);
  for (const state of ['withdrawn', 'cancelled', 'deferred']) assert.deepEqual(engine.update([worker([task(state)])], [watch]), []);
  assert.deepEqual(engine.update([worker([])], [watch]), []);
  assert.deepEqual(engine.update([worker([task('closed')])], [watch]), []);
  engine.update([worker()], []);
  assert.deepEqual(engine.update([worker([task('closed')])], [watch]), [], 'rewatching does not report an old close');
});

test('tracker, worker, connection and explicit reset gaps rebaseline instead of replaying completion', () => {
  for (const gap of ['tracker', 'offline', 'missing', 'connection', 'reset']) {
    const engine = new TaskNotificationEngine(); engine.update([worker()], [watch]);
    if (gap === 'tracker') engine.update([worker([], { tracker: { status: 'unavailable', tasks: [] } })], [watch]);
    if (gap === 'offline') engine.update([worker([], { status: 'offline' })], [watch]);
    if (gap === 'missing') engine.update([], [watch]);
    if (gap === 'connection') engine.update([worker([task('closed')])], [watch], false);
    if (gap === 'reset') engine.reset();
    assert.deepEqual(engine.update([worker([task('closed')])], [watch]), [], gap);
  }
});

test('new pending request IDs emit worker events without claiming task ownership', () => {
  const engine = new TaskNotificationEngine();
  engine.update([worker([task()], { questions: [{ id: 1 }] })], [watch]);
  const pending = worker([task()], { status: 'attention', questions: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  const events = engine.update([pending], [watch]);
  assert.equal(events.length, 2);
  for (const event of events) { assert.equal(event.kind, 'request'); assert.equal(event.scope, 'worker'); assert.equal(event.taskId, undefined); }
  assert.deepEqual(engine.update([pending], [watch]), []);
  engine.update([worker([task()], { questions: [] })], [watch]);
  assert.deepEqual(engine.update([pending], [watch]), [], 'the same resolved/replayed IDs stay deduplicated');
  assert.deepEqual(engine.update([worker([task()], { status: 'attention' })], [watch]), [], 'attention without delivered details is not a request');
});

test('worker errors are explicit, deduplicated and distinguished from watched task failure', () => {
  const engine = new TaskNotificationEngine(); engine.update([worker()], [watch]);
  const failed = worker([task('in_progress')], { status: 'error' });
  const events = engine.update([failed], [watch]);
  assert.equal(events.length, 1); assert.equal(events[0].kind, 'error'); assert.equal(events[0].scope, 'worker');
  assert.equal(events[0].taskId, undefined);
  assert.deepEqual(engine.update([failed], [watch]), []);
  assert.equal(engine.update([worker([task()], { status: 'error', turnId: 'turn-two' })], [watch]).length, 1);
  engine.update([worker()], [watch]);
  assert.equal(engine.update([worker([task()], { status: 'error', turnId: null })], [watch]).length, 1);
});

test('new native requests can alert for an already watched worker while Beads is unavailable', () => {
  const engine = new TaskNotificationEngine(); engine.update([worker()], [watch]);
  const unavailable = { status: 'unavailable', tasks: [] };
  const events = engine.update([worker([], { tracker: unavailable, status: 'attention', questions: [{ id: 'new-request' }] })], [watch]);
  assert.equal(events.length, 1); assert.equal(events[0].scope, 'worker'); assert.equal(events[0].kind, 'request');
  assert.deepEqual(engine.update([worker([task('closed')], { questions: [{ id: 'new-request' }] })], [watch]), []);
});

test('a provider worker reconnect rebaselines requests and errors while the backend remains connected', () => {
  const engine = new TaskNotificationEngine();
  engine.update([worker()], [watch]);
  engine.update([worker([], { status: 'offline' })], [watch], true);
  const recovered = worker([task('closed')], { status: 'error', questions: [{ id: 'recovered-request' }] });
  assert.deepEqual(engine.update([recovered], [watch], true), []);
  assert.deepEqual(engine.update([recovered], [watch], true), []);
  const events = engine.update([worker([task('closed')], { questions: [{ id: 'later-request' }] })], [watch], true);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'request');
});

test('subscriptions and native state remain isolated by worker, including identical task IDs', () => {
  const engine = new TaskNotificationEngine();
  const other = worker([task()], { id: 'worker-two', name: 'Other project' });
  engine.update([worker(), other], [watch]);
  assert.deepEqual(engine.update([worker(), { ...other, status: 'error', questions: [{ id: 99 }] }], [watch]), []);
  const watches = [watch, { workerId: 'worker-two', taskId: 'task-one' }];
  engine.update([worker(), other], watches);
  const events = engine.update([worker(), worker([task('closed')], { ...other, tracker: { status: 'ready', tasks: [task('closed')] } })], watches);
  assert.equal(events.length, 1); assert.equal(events[0].workerId, 'worker-two');
});

test('notification payloads exclude native commands, question text and error bodies', () => {
  const secret = 'PRIVATE_NATIVE_BODY'; const engine = new TaskNotificationEngine();
  engine.update([worker()], [watch]);
  const events = engine.update([worker([task()], { status: 'error', error: secret,
    questions: [{ id: 1, method: secret, params: { command: secret, questions: [{ question: secret }] } }] })], [watch]);
  assert.equal(events.length, 2);
  assert.equal(JSON.stringify(events).includes(secret), false);
});

test('large snapshots remain bounded and unchanged request sets do not repeat', () => {
  const engine = new TaskNotificationEngine();
  assert.equal(MAX_TASK_WATCHES, 4096, 'all 32 by 128 persisted subscriptions are supported');
  const tasks = Array.from({ length: 128 }, (_, index) => task('open', { id: 'task-' + index }));
  const questions = Array.from({ length: 200 }, (_, id) => ({ id }));
  const snapshots = Array.from({ length: 32 }, (_, index) => worker(tasks, { id: 'worker-' + index, questions }));
  const watches = snapshots.flatMap(row => tasks.map(task => ({ workerId: row.id, taskId: task.id })));
  assert.deepEqual(engine.update(snapshots, watches), []);
  assert.deepEqual(engine.update(snapshots, watches), []);
  const events = engine.update(snapshots.map(row => ({ ...row, tracker: {
    status: 'ready', tasks: tasks.map(task => ({ ...task, state: 'closed' }))
  } })), watches);
  assert.equal(events.length, MAX_TASK_WATCHES);
  assert.deepEqual(engine.update([], []), []);
});
