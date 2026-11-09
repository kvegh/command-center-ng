import test from 'node:test';
import assert from 'node:assert/strict';
import { BeadsTasks, sessionLabel } from '../server/beads.mjs';

const child = sessionLabel('child'); const parent = sessionLabel('parent');

function fixture(count = 1) {
  const calls = []; const rows = new Map();
  const controls = { reads: 0, writes: 0, failWrite: 0, skipWrite: false, beforeRead: null, readError: null, output: null };
  const add = (id, status = 'open', labels = [child]) => rows.set(id, {
    id, title: 'Task ' + id, status, labels: [...labels], priority: 1,
    assignee: 'fixture-agent', description: 'Keep task content.', notes: 'Keep notes.',
    dependencies: [{ id: 'other-task', type: 'blocks' }], parent: 'fixture-epic',
  });
  for (let index = 0; index < count; index++) add('demo-' + index);
  const run = async (binary, args, options) => {
    calls.push({ binary, args, ...options });
    assert.equal(options.cwd, '/project');
    assert.ok(args.includes('--sandbox'));
    if (args.includes('list')) {
      assert.ok(args.includes('--readonly'));
      assert.ok(['--include-ephemeral', '--include-gates', '--include-infra', '--include-templates'].every(flag => args.includes(flag)));
      controls.reads++;
      controls.beforeRead?.(controls.reads);
      if (controls.readError) throw controls.readError;
      if (controls.output !== null) return { stdout: controls.output };
      const labels = args.flatMap((arg, index) => arg === '--label' ? [args[index + 1]] : []);
      let selected = [...rows.values()].filter(row => labels.every(label => row.labels.includes(label)));
      if (!args.includes('--all')) selected = selected.filter(row => row.status !== 'closed');
      const limit = Number(args[args.indexOf('--limit') + 1] || 50);
      if (limit) selected = selected.slice(0, limit);
      return { stdout: JSON.stringify(selected) };
    }
    assert.ok(args.includes('update'));
    assert.ok(!args.includes('--readonly'));
    assert.ok(args.includes('--add-label'));
    const ids = args.slice(args.indexOf('update') + 1, args.indexOf('--add-label'));
    assert.ok(ids.length > 0 && ids.length <= 50);
    controls.writes++;
    if (controls.failWrite === controls.writes) throw new Error('Fixture write failure.');
    if (!controls.skipWrite) {
      const label = args[args.indexOf('--add-label') + 1];
      for (const id of ids) rows.get(id).labels = [...new Set([...rows.get(id).labels, label])];
    }
    return { stdout: '{}' };
  };
  return { beads: new BeadsTasks({ run }), calls, rows, controls, add };
}

test('handoff preserves closed history, shared links and all task metadata', async () => {
  const f = fixture(0);
  f.add('123', 'closed', [child, 'existing', parent]);
  f.add('synthetic_task.2', 'blocked', [child, 'ccng-chat-question', sessionLabel('other')]);
  f.add('unrelated', 'in_progress', [sessionLabel('other')]);
  const before = structuredClone([...f.rows.values()]);
  const result = await f.beads.handoff('/project', 'child', 'parent');
  assert.deepEqual(result.taskIds, ['123', 'synthetic_task.2']);
  assert.deepEqual(result.tasks.map(task => task.state), ['closed', 'blocked']);
  assert.equal(result.tasks[1].isChatQuestion, true);
  assert.ok(result.tasks.every(task => !('description' in task) && !('notes' in task)));
  for (const original of before) {
    const expected = original.labels.includes(child) ? { ...original, labels: [...new Set([...original.labels, parent])] } : original;
    assert.deepEqual(f.rows.get(original.id), expected);
  }
  assert.equal(f.controls.writes, 1);
  assert.ok(f.calls.every(call => !call.args.some(arg => ['--status', '--assignee', '--remove-label', '--set-labels'].includes(arg))));
  await f.beads.handoff('/project', 'child', 'parent');
  assert.equal(f.controls.writes, 1, 'repeated handoff adds no duplicate labels or writes');
});

test('handoff covers more than 1000 tasks and batches writes without truncation', async () => {
  const f = fixture(1051);
  const result = await f.beads.handoff('/project', 'child', 'parent');
  assert.equal(result.taskIds.length, 1051);
  assert.equal(result.tasks.length, 1051);
  assert.equal(f.controls.writes, 22);
  assert.ok([...f.rows.values()].every(row => row.labels.includes(parent) && row.labels.includes(child)));
  assert.ok(f.calls.filter(call => call.args.includes('list')).every(call => call.args[call.args.indexOf('--limit') + 1] === '0'));
});

test('partial write failure retains all associations and retry resumes only missing links', async () => {
  const f = fixture(75); f.controls.failWrite = 2;
  await assert.rejects(f.beads.handoff('/project', 'child', 'parent'), /branch and existing task links must be kept/);
  assert.equal([...f.rows.values()].filter(row => row.labels.includes(parent)).length, 50);
  assert.ok([...f.rows.values()].every(row => row.labels.includes(child)));
  f.controls.failWrite = 0;
  const result = await f.beads.handoff('/project', 'child', 'parent');
  assert.equal(result.taskIds.length, 75);
  const retry = f.calls.filter(call => call.args.includes('update')).at(-1);
  assert.equal(retry.args.slice(retry.args.indexOf('update') + 1, retry.args.indexOf('--add-label')).length, 25);
});

test('successful CLI exit without verified parent links fails the handoff', async () => {
  const f = fixture(); f.controls.skipWrite = true;
  await assert.rejects(f.beads.handoff('/project', 'child', 'parent'), /did not confirm every parent task link/);
  assert.deepEqual(f.rows.get('demo-0').labels, [child]);
});

test('late child tasks abort completion until an explicit retry includes them', async () => {
  const f = fixture();
  f.controls.beforeRead = count => { if (count === 3) f.add('late-task', 'in_progress'); };
  await assert.rejects(f.beads.handoff('/project', 'child', 'parent'), error => error.code === 'BEADS_HANDOFF_CHANGED' && error.status === 409);
  assert.ok(f.rows.get('demo-0').labels.includes(parent));
  assert.deepEqual(f.rows.get('late-task').labels, [child]);
  const result = await f.beads.handoff('/project', 'child', 'parent');
  assert.deepEqual(result.taskIds, ['demo-0', 'late-task']);
});

test('late work in an initially empty branch cannot silently complete', async () => {
  const f = fixture(0);
  f.controls.beforeRead = count => { if (count === 2) f.add('late-task'); };
  await assert.rejects(f.beads.handoff('/project', 'child', 'parent'), /task list changed/);
  assert.equal(f.controls.writes, 0);
});

test('unavailable tracker, missing CLI and output overflow never report an empty handoff', async () => {
  for (const error of [new Error('no beads database found'), Object.assign(new Error('missing'), { code: 'ENOENT' }), Object.assign(new Error('stdout maxBuffer length exceeded'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' })]) {
    const f = fixture(0); f.controls.readError = error;
    await assert.rejects(f.beads.handoff('/project', 'child', 'parent'), failure => failure.status === 503);
    assert.equal(f.controls.writes, 0);
  }
});

test('malformed tracker records and unsafe task IDs fail before mutation', async () => {
  for (const output of ['not json', '{}', '[{}]', JSON.stringify([{ id: '--unsafe', title: 'Invalid', status: 'open' }]), JSON.stringify([{ id: 123, title: 'Invalid', status: 'open' }])]) {
    const f = fixture(); f.controls.output = output;
    await assert.rejects(f.beads.handoff('/project', 'child', 'parent'));
    assert.equal(f.controls.writes, 0);
  }
});

test('conversation validation precedes reads and an empty available tracker succeeds', async () => {
  const f = fixture(0);
  await assert.rejects(f.beads.handoff('/project', 'child', 'child'), /different conversation/);
  await assert.rejects(f.beads.handoff('/project', 'child,other', 'parent'), /Invalid conversation/);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await f.beads.handoff('/project', 'child', 'parent'), { taskIds: [], tasks: [] });
});
