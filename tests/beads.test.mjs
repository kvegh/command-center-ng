import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { BeadsTasks, sessionLabel } from '../server/beads.mjs';
import { Workspace } from '../server/workspace.mjs';

function fixture() {
  const calls = []; const rows = new Map(); const faults = new Map();
  const add = (id, title, status, labels = [], cwd = '/project') => rows.set(cwd + ':' + id, { id, title, status, priority: 2, assignee: 'agent-a', parent: 'demo-parent', labels, cwd, owner: 'private@example.invalid', notes: 'Private fixture notes must not enter dashboard task records.' });
  const run = async (binary, args, options) => {
    calls.push({ binary, args, ...options });
    const command = args.find(arg => ['version', 'list', 'update', 'blocked', 'show'].includes(arg));
    if (faults.has(command)) throw faults.get(command);
    if (command === 'version') return { stdout: 'bd version 1.3.2\n' };
    if (args.includes('--help')) return { stdout: '--json --readonly --brief --flat' };
    if (command === 'list') {
      let data = [...rows.values()].filter(row => row.cwd === options.cwd);
      if (args.includes('--label')) data = data.filter(row => row.labels.includes(args[args.indexOf('--label') + 1]));
      if (args.includes('--id')) data = data.filter(row => args[args.indexOf('--id') + 1].split(',').includes(row.id));
      if (args.includes('--status')) data = data.filter(row => args[args.indexOf('--status') + 1].split(',').includes(row.status));
      return { stdout: JSON.stringify(data) };
    }
    if (command === 'blocked') {
      let data = [...rows.values()].filter(row => row.cwd === options.cwd && row.blocked_by?.length);
      if (args.includes('--label')) data = data.filter(row => row.labels.includes(args[args.indexOf('--label') + 1]));
      return { stdout: JSON.stringify(data) };
    }
    if (command === 'show') return { stdout: JSON.stringify([...rows.values()].filter(row => row.cwd === options.cwd && row.id === args[args.indexOf('show') + 1])) };
    if (command === 'update') {
      const mode = args.includes('--add-label') ? '--add-label' : '--remove-label';
      if (mode === '--remove-label' && faults.has('remove')) throw faults.get('remove');
      const ids = args.slice(args.indexOf('update') + 1, args.indexOf(mode)); const label = args[args.indexOf(mode) + 1];
      for (const id of ids) {
        const row = rows.get(options.cwd + ':' + id);
        row.labels = mode === '--add-label' ? [...new Set([...row.labels, label])] : row.labels.filter(value => value !== label);
      }
      return { stdout: '{}' };
    }
    throw new Error('Unexpected fixture command.');
  };
  return { beads: new BeadsTasks({ run }), calls, rows, add, faults };
}

function workspace(beads) {
  const rpc = new EventEmitter(); rpc.ready = true;
  const w = new Workspace(rpc, { beads });
  const attach = (id, cwd = '/project') => w.agents.set(id, { id, cwd, name: 'Agent', thread: { status: { type: 'active' } }, questions: [], tasks: [{ id: 'old', text: 'Old native plan', state: 'inProgress' }], requestedTasks: [{ id: 'stale', text: 'Old chat request', state: 'inProgress' }], workers: [], summary: 'Old commentary', messages: [] });
  attach('alpha'); return { w, attach };
}

test('Beads reads are scoped to the conversation/project and expose only selected fields', async () => {
  const f = fixture(); const label = sessionLabel('alpha');
  f.add('demo-a', 'Implement a feature', 'in_progress', [label]);
  f.add('demo-b', 'Unrelated conversation work', 'in_progress', [sessionLabel('beta')]);
  f.add('demo-a', 'Another project with the same ID', 'blocked', [label], '/other-project');
  await f.beads.checkAvailable('/project');
  const result = await f.beads.linked('/project', 'alpha');
  assert.equal(result.status, 'ready'); assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].text, 'Implement a feature'); assert.equal(result.tasks[0].state, 'in_progress');
  assert.ok(!('notes' in result.tasks[0])); assert.ok(!('owner' in result.tasks[0])); assert.equal(result.tasks[0].parentId, 'demo-parent');
  assert.ok(f.calls.every(call => call.args.includes('--readonly') && call.args.includes('--sandbox')));
  assert.ok(f.calls.every(call => !call.shell));
});

test('stored states drive all current rows and totals; closed tasks disappear without guessing from chat', async () => {
  const f = fixture(); const { w } = workspace(f.beads); const label = sessionLabel('alpha');
  f.add('demo-open', 'Queued work', 'open', [label]); f.add('demo-running', 'Current work', 'in_progress', [label]);
  f.add('demo-blocked', 'Blocked work', 'blocked', [label]); f.add('demo-later', 'Deferred work', 'deferred', [label]);
  f.add('demo-done', 'Closed work', 'closed', [label]);
  await w.refreshTasks('alpha');
  let agent = w.snapshot().agents[0]; assert.equal(agent.taskCount, 4); assert.equal(agent.tasks.length, 4);
  assert.deepEqual(agent.tasks.map(task => task.id), ['demo-blocked', 'demo-running', 'demo-open', 'demo-later']);
  assert.equal(agent.tasks.find(task => task.id === 'demo-blocked').displayState, 'blocked');
  assert.equal(agent.taskCounts.needsInput, 0); assert.equal(agent.taskCounts.other, 1);
  f.rows.get('/project:demo-running').status = 'closed'; await w.refreshTasks('alpha');
  agent = w.snapshot().agents[0]; assert.equal(agent.taskCount, 3); assert.ok(!agent.tasks.some(task => task.id === 'demo-running'));
  f.rows.get('/project:demo-blocked').status = 'closed'; f.rows.get('/project:demo-open').status = 'closed'; f.rows.get('/project:demo-later').status = 'closed';
  await w.refreshTasks('alpha'); assert.deepEqual(w.snapshot().agents[0].tasks, []);
});

test('explicit links survive new workspace instances and change labels only', async () => {
  const f = fixture(); const { w } = workspace(f.beads);
  f.add('demo-a', 'First task', 'in_progress', ['existing-label']); f.add('demo-b', 'Second task', 'blocked');
  await w.linkTasks('alpha', ['demo-a', 'demo-b']);
  const writes = f.calls.filter(call => call.args.includes('update'));
  assert.equal(writes.length, 1); assert.ok(!writes[0].args.includes('--readonly')); assert.ok(writes[0].args.includes('--sandbox'));
  assert.ok(!writes[0].args.some(arg => ['--status', '--assignee', '--claim', '--set-labels'].includes(arg)));
  const fresh = workspace(f.beads); await fresh.w.refreshTasks('alpha'); assert.equal(fresh.w.snapshot().agents[0].taskCount, 2);
  await fresh.w.linkTasks('alpha', ['demo-b']);
  assert.deepEqual(f.rows.get('/project:demo-a').labels, ['existing-label']); assert.equal(f.rows.get('/project:demo-a').status, 'in_progress');
  assert.equal(f.rows.get('/project:demo-a').assignee, 'agent-a');
});

test('invalid or missing IDs cannot mutate links or inject commands', async () => {
  const f = fixture();
  await assert.rejects(f.beads.setLinks('/project', 'alpha', ['--status=closed']), /valid Beads task IDs/);
  await assert.rejects(f.beads.setLinks('/project', 'alpha', ['demo-a; touch unsafe']), /valid Beads task IDs/);
  await assert.rejects(f.beads.setLinks('/project', 'alpha', ['demo-missing']), /do not exist/);
  assert.equal(f.calls.filter(call => call.args.includes('update')).length, 0);
  assert.throws(() => sessionLabel('alpha,other'), /Invalid conversation/);
});

test('partially failed link edits report failure and refresh the actual remaining links', async () => {
  const f = fixture(); const { w } = workspace(f.beads);
  f.add('demo-a', 'Previously linked', 'in_progress', [sessionLabel('alpha')]); f.add('demo-b', 'New link', 'open');
  f.faults.set('remove', Object.assign(new Error('Write unavailable'), { stderr: 'Fixture removal failed.' }));
  await assert.rejects(w.linkTasks('alpha', ['demo-b']), /could not be fully updated/);
  assert.equal(w.agent('alpha').tracker.status, 'ready');
  assert.deepEqual(w.agent('alpha').tracker.tasks.map(task => task.id).sort(), ['demo-a', 'demo-b']);
});

test('Beads failures clear stale rows and never fall back to transcript guesses', async () => {
  const f = fixture(); const { w } = workspace(f.beads);
  f.add('demo-a', 'Real task', 'in_progress', [sessionLabel('alpha')]); await w.refreshTasks('alpha');
  f.faults.set('list', Object.assign(new Error('Unavailable'), { stderr: 'Fixture database is unavailable.' }));
  await w.refreshTasks('alpha');
  const agent = w.snapshot().agents[0]; assert.equal(agent.tracker.status, 'unavailable'); assert.equal(agent.tasks.length, 0);
  assert.match(agent.tracker.error, /database is unavailable/);
});

test('missing executable and malformed output are reported as dependency/data errors', async () => {
  const missing = new BeadsTasks({ run: async () => { throw Object.assign(new Error('Missing'), { code: 'ENOENT' }); } });
  await assert.rejects(missing.checkAvailable('/project'), error => error.code === 'BEADS_MISSING');
  const malformed = new BeadsTasks({ run: async () => ({ stdout: 'not JSON' }) });
  await assert.rejects(malformed.linked('/project', 'alpha'), /invalid JSON/);
});

test('poll refreshes are deduplicated, unchanged records do not rebroadcast, and branches use separate labels', async () => {
  const f = fixture(); const { w, attach } = workspace(f.beads); attach('beta');
  f.add('demo-a', 'Parent work', 'in_progress', [sessionLabel('alpha')]);
  let changes = 0; w.on('change', () => changes++);
  await Promise.all([w.refreshTasks('alpha'), w.refreshTasks('alpha')]);
  assert.equal(f.calls.filter(call => call.args.includes('--label') && call.args.includes('list')).length, 1);
  assert.equal(f.calls.filter(call => call.args.includes('--label') && call.args.includes('blocked')).length, 1);
  const previous = changes; await w.refreshTasks('alpha'); assert.equal(changes, previous);
  await w.refreshTasks('beta'); assert.equal(w.snapshot().agents.find(agent => agent.id === 'beta').tasks.length, 0);
  assert.match(f.beads.context('beta')['command-center-tasks'].value, /ccng-session:beta/);
  assert.ok(!f.beads.context('beta')['command-center-tasks'].value.includes('ccng-session:alpha'));
});


test('unfinished dependencies become queued separately from manual input and all eight tasks are returned', async () => {
  const f = fixture(); const { w } = workspace(f.beads); const label = sessionLabel('alpha');
  for (let i = 0; i < 8; i++) f.add('demo-' + i, 'Work ' + i, i < 3 ? 'in_progress' : 'blocked', [label, ...(i >= 3 && i < 6 ? ['ccng-chat-question'] : [])]);
  f.rows.get('/project:demo-7').blocked_by = ['prerequisite'];
  await w.refreshTasks('alpha'); const agent = w.snapshot().agents[0];
  assert.equal(agent.tasks.length, 8); assert.equal(agent.taskCounts.inProgress, 3); assert.equal(agent.taskCounts.needsInput, 3); assert.equal(agent.taskCounts.queued, 1); assert.equal(agent.taskCounts.other, 1);
  assert.deepEqual(agent.tasks.map(task => task.id), ['demo-3', 'demo-4', 'demo-5', 'demo-6', 'demo-0', 'demo-1', 'demo-2', 'demo-7']);
  assert.equal(agent.tasks.find(task => task.id === 'demo-7').displayState, 'queued');
  assert.equal(f.rows.get('/project:demo-7').status, 'blocked', 'display classification must not mutate the tracker');
  f.rows.get('/project:demo-7').blocked_by = []; await w.refreshTasks('alpha');
  assert.equal(w.snapshot().agents[0].taskCounts.needsInput, 3, 'finishing a dependency does not invent an input request');
  assert.equal(w.snapshot().agents[0].tasks.find(task => task.id === 'demo-7').displayState, 'blocked');
});

test('hierarchy-only blocked children surface before running work while real prerequisites stay queued', async () => {
  const f = fixture(); const { w } = workspace(f.beads); const label = sessionLabel('alpha');
  for (let index = 0; index < 8; index++) f.add('running-' + index, 'Current work ' + index, 'in_progress', [label]);
  f.add('parent', 'Parent work', 'in_progress', [label]);
  f.add('child', 'Waiting for a native tool checkpoint?', 'blocked', [label]);
  f.add('dependent-child', 'Waiting for a prerequisite', 'blocked', [label]);
  f.add('question-child', 'A recorded user decision', 'blocked', [label, 'ccng-chat-question']);
  f.add('queued-question', 'A later recorded user decision', 'blocked', [label, 'ccng-chat-question']);
  f.add('open', 'Future work', 'open', [label]); f.add('deferred', 'Optional work', 'deferred', [label]);
  for (const id of ['child', 'dependent-child', 'question-child', 'queued-question']) {
    f.rows.get('/project:' + id).parent = 'parent';
    f.rows.get('/project:' + id).blocked_by = ['parent'];
  }
  f.rows.get('/project:dependent-child').blocked_by.push('prerequisite');
  f.rows.get('/project:queued-question').blocked_by.push('prerequisite');
  const before = structuredClone([...f.rows]);
  await w.refreshTasks('alpha');
  const agent = w.snapshot().agents[0]; const task = id => agent.tasks.find(row => row.id === id);
  assert.deepEqual(agent.tasks.map(row => row.id), [
    'question-child', 'child', 'parent', ...Array.from({ length: 8 }, (_, index) => 'running-' + index),
    'dependent-child', 'queued-question', 'open', 'deferred',
  ]);
  assert.equal(task('child').state, 'blocked'); assert.equal(task('child').displayState, 'blocked');
  assert.equal(task('child').parentId, 'parent'); assert.deepEqual(task('child').blockedBy, []);
  assert.equal(task('child').isChatQuestion, undefined, 'question-like prose does not invent an input request');
  assert.deepEqual(task('dependent-child').blockedBy, ['prerequisite']);
  assert.equal(task('dependent-child').displayState, 'queued');
  assert.equal(task('question-child').displayState, 'needs_input');
  assert.equal(task('queued-question').displayState, 'queued', 'real prerequisites keep an explicit question queued');
  assert.equal(agent.taskCount, 15);
  assert.deepEqual(agent.taskCounts, { inProgress: 9, needsInput: 1, queued: 2, open: 1, deferred: 1, other: 1 });
  assert.deepEqual([...f.rows], before, 'classification and ordering preserve native records, labels and hierarchy');
  assert.deepEqual(agent.questions, [], 'Beads classification does not manufacture native approvals');
  assert.ok(f.calls.every(call => call.args.includes('--readonly')), 'projection only reads task records');
});

test('task detail reads only a linked task and does not change labels or state', async () => {
  const f = fixture(); const label = sessionLabel('alpha');
  f.add('demo-linked', 'Input needed', 'blocked', [label]); f.add('demo-other', 'Unrelated task', 'open');
  f.rows.get('/project:demo-linked').description = 'Choose the existing test target.';
  const detail = await f.beads.detail('/project', 'alpha', 'demo-linked');
  assert.equal(detail.description, 'Choose the existing test target.'); assert.equal(detail.id, 'demo-linked');
  assert.ok(!('owner' in detail)); assert.equal(detail.state, 'blocked');
  await assert.rejects(f.beads.detail('/project', 'alpha', 'demo-other'), /linked/);
  await assert.rejects(f.beads.detail('/project', 'alpha', '../unsafe'), /valid/);
  assert.ok(f.calls.every(call => call.args.includes('--readonly')));
});

test('explicit input states and question metadata drive promotion without changing owner records', async () => {
  const f = fixture(); const { w } = workspace(f.beads); const label = sessionLabel('alpha');
  f.add('work', 'A tool wait remains blocked', 'blocked', [label]);
  f.add('choice', 'Choose the environment', 'blocked', [label, 'ccng-chat-question']);
  f.add('explicit', 'Confirm the window', 'waiting_on_input', [label]);
  f.add('queued-choice', 'Choose after prerequisites', 'blocked', [label, 'ccng-chat-question']);
  f.rows.get('/project:queued-choice').blocked_by = ['base'];
  await w.refreshTasks('alpha');
  let snapshot = w.snapshot().agents[0];
  assert.deepEqual(snapshot.tasks.slice(0, 2).map(task => task.id), ['choice', 'explicit']);
  assert.equal(snapshot.taskCounts.needsInput, 2); assert.equal(snapshot.taskCounts.queued, 1); assert.equal(snapshot.taskCounts.other, 1);
  assert.equal(snapshot.tasks.find(task => task.id === 'choice').state, 'blocked');
  assert.equal(snapshot.tasks.find(task => task.id === 'choice').displayState, 'needs_input');
  assert.equal(snapshot.tasks.find(task => task.id === 'queued-choice').displayState, 'queued');
  f.rows.get('/project:choice').labels = [label];
  await w.refreshTasks('alpha'); snapshot = w.snapshot().agents[0];
  assert.equal(snapshot.taskCounts.needsInput, 1);
  assert.equal(snapshot.tasks.find(task => task.id === 'choice').displayState, 'blocked');
  assert.equal(f.rows.get('/project:choice').status, 'blocked');
  assert.ok(f.calls.every(call => call.args.includes('--readonly')), 'classification never writes task records');
});

test('recorded chat questions are visible during an active turn and stay open until the worker resolves their Beads records', async () => {
  const f = fixture(); const label = sessionLabel('alpha');
  f.add('decision-one', 'Choose the backup interval', 'blocked', [label, 'ccng-chat-question']);
  f.add('work-one', 'An ordinary task containing a question?', 'blocked', [label]);
  f.add('other-decision', 'A different worker decision', 'blocked', [sessionLabel('beta'), 'ccng-chat-question']);
  f.add('closed-decision', 'An answered decision', 'closed', [label, 'ccng-chat-question']);
  const { w } = workspace(f.beads); w.agent('alpha').turnId = 'active-work';
  await w.refreshTasks('alpha');
  let snapshot = w.snapshot().agents.find(agent => agent.id === 'alpha');
  assert.equal(snapshot.status, 'running', 'a chat question does not invent a native attention flag');
  assert.deepEqual(snapshot.chatQuestions, [{ id: 'decision-one', workerId: 'alpha', text: 'Choose the backup interval', state: 'blocked', displayState: 'needs_input' }]);
  assert.deepEqual(snapshot.questions, []);
  await assert.rejects(f.beads.detail('/project', 'alpha', 'other-decision'), /linked to this worker/);
  w.notification({ method: 'item/completed', params: { threadId: 'alpha', turnId: 'active-work', item: { id: 'user-answer', type: 'userMessage', content: [{ type: 'text', text: 'Use the nightly interval.' }] } } });
  w.notification({ method: 'turn/completed', params: { threadId: 'alpha', turn: { id: 'active-work', status: 'completed' } } });
  await w.refreshTasks('alpha');
  assert.equal(w.snapshot().agents[0].chatQuestions.length, 1, 'a reply or turn completion does not infer resolution');
  assert.ok(f.calls.every(call => call.args.includes('--readonly')), 'the backend never changes question records');
  const restored = workspace(f.beads); await restored.w.refreshTasks('alpha');
  assert.equal(restored.w.snapshot().agents[0].chatQuestions[0].id, 'decision-one', 'restoration derives the question from existing Beads state');
  f.rows.get('/project:decision-one').status = 'closed'; await w.refreshTasks('alpha');
  assert.deepEqual(w.snapshot().agents[0].chatQuestions, []);
});

test('the complete chat-question subset is exposed without a preview cutoff or unrelated labels', async () => {
  const f = fixture(); const label = sessionLabel('alpha');
  for (let index = 0; index < 35; index++) f.add('decision-' + index, 'Question ' + index, 'blocked', [label, 'ccng-chat-question', 'unrelated-private-label']);
  const { w } = workspace(f.beads); await w.refreshTasks('alpha');
  const snapshot = w.snapshot().agents[0];
  assert.equal(snapshot.chatQuestions.length, 35); assert.equal(snapshot.taskCount, 35);
  assert.ok(snapshot.chatQuestions.every(question => question.workerId === 'alpha' && !('method' in question) && !('labels' in question)));
  assert.match(f.beads.context('alpha')['command-center-tasks'].value, /structured question tool is unavailable/);
  assert.match(f.beads.context('alpha')['command-center-tasks'].value, /ccng-chat-question/);
});
