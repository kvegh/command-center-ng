import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chmod, mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Workspace } from '../server/workspace.mjs';

function fixture(provider) {
  const calls = [], sent = [];
  const rpc = new EventEmitter(); rpc.ready = true;
  rpc.call = async (method, params) => {
    calls.push({ method, params });
    if (method === 'thread/start') return { thread: { id: 'new-worker' } };
    if (method === 'thread/name/set') return {};
    throw new Error('Unexpected native action: ' + method);
  };
  const claude = new EventEmitter();
  claude.create = (cwd, goal) => { calls.push({ method: 'claude.create', params: { cwd, goal } }); return { id: 'claude:new-worker', cwd, goal }; };
  const workspace = new Workspace(rpc, { beads: null, claude });
  // Isolate directory handling from subsequent history loading and model execution.
  workspace.open = async id => { const agent = { id }; workspace.agents.set(id, agent); return agent; };
  workspace.send = async (id, goal) => { sent.push({ id, goal }); };
  workspace.refreshTasks = async () => {};
  return { workspace, calls, sent, create: cwd => workspace.create({ provider, cwd, goal: 'Inspect the selected project' }) };
}

async function directories(t) {
  const root = await mkdtemp(join(tmpdir(), 'ccng-agent-path-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, 'selected project'); await mkdir(project);
  const file = join(root, 'file.txt'); await writeFile(file, 'fixture');
  return { root, project, file };
}

for (const provider of ['codex', 'claude']) {
  test(`${provider} creation trims pasted surrounding whitespace and retains interior spaces`, async t => {
    const { project } = await directories(t);
    for (const cwd of [project + ' ', '  ' + project + '  ', '\t\n' + project + '\r\n', '\u00a0' + project + '\u00a0']) {
      const f = fixture(provider);
      const id = await f.create(cwd);
      const start = f.calls.find(call => call.method === (provider === 'codex' ? 'thread/start' : 'claude.create'));
      assert.equal(start.params.cwd, project);
      assert.deepEqual(f.sent, [{ id, goal: 'Inspect the selected project' }]);
      assert.equal(f.workspace.creating, 0);
      if (provider === 'codex') assert.deepEqual(start.params, { cwd: project }, 'native permissions and model settings are not overridden');
    }
  });

  test(`${provider} creation accepts an existing directory symlink without rewriting its path`, async t => {
    const { root, project } = await directories(t);
    const linked = join(root, 'project link'); await symlink(project, linked);
    const f = fixture(provider); await f.create('  ' + linked + ' ');
    assert.equal(f.calls[0].params.cwd, linked);
  });

  test(`${provider} creation rejects invalid paths clearly before creating or messaging a worker`, async t => {
    const { root, project, file } = await directories(t);
    const cases = [
      [undefined, /absolute/i], [null, /absolute/i], [123, /absolute/i], [{}, /absolute/i],
      ['', /absolute/i], [' \t\n ', /absolute/i], ['relative/project', /absolute/i],
      [file, /file.*not a directory/i], [join(root, 'missing'), /does not exist/i],
      [join(file, 'child'), /contains a file/i], [join(root, 'x'.repeat(5000)), /too long/i],
      [project + '\0suffix', /control/i], [project + '\nother', /control/i],
      [project + '\tother', /control/i], [project + '\x7fother', /control/i],
    ];
    const f = fixture(provider);
    for (const [cwd, message] of cases) {
      await assert.rejects(f.create(cwd), error => {
        assert.equal(error.status, 400); assert.match(error.message, message); return true;
      });
      assert.deepEqual(f.calls, []); assert.deepEqual(f.sent, []);
      assert.equal(f.workspace.creating, 0); assert.equal(f.workspace.agents.size, 0);
    }
    // Validation failures must leave the next valid creation usable.
    await f.create(project); assert.equal(f.sent.length, 1);
  });
}

test('an inaccessible parent produces a useful error without changing filesystem permissions', async t => {
  const { root } = await directories(t);
  const parent = join(root, 'private'); const child = join(parent, 'project');
  await mkdir(child, { recursive: true });
  await chmod(parent, 0);
  try {
    try {
      await stat(child);
      t.skip('This execution account can traverse the mode-000 fixture; no real permission denial is available.'); return;
    } catch (error) { assert.ok(['EACCES', 'EPERM'].includes(error.code)); }
    for (const provider of ['codex', 'claude']) {
      const f = fixture(provider);
      await assert.rejects(f.create(child), error => {
        assert.equal(error.status, 400); assert.match(error.message, /cannot access.*accessible/i); return true;
      });
      assert.deepEqual(f.calls, []); assert.deepEqual(f.sent, []);
      assert.equal((await stat(parent)).mode & 0o777, 0, 'validation does not grant filesystem access');
    }
  } finally { await chmod(parent, 0o700); }
});
