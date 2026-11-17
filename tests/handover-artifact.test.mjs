import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, link, lstat, mkdir, mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handoverCreatePrompt, handoverImportPrompt, reserveHandoverPath, verifyHandoverArtifact } from '../server/chat-handover.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-handover-artifact-'));
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'handoff.md');
  return { directory, path, save: async (value = '# Synthetic handover\n') => {
    await writeFile(path, value, { mode: 0o600 });
    await chmod(path, 0o600);
  } };
}

const notReady = error => { assert.equal(error.status, 409); return true; };

test('reservation creates a private directory but does not establish artifact readiness', async t => {
  const path = await reserveHandoverPath();
  t.after(() => rm(join(path, '..'), { recursive: true, force: true }));
  assert.equal((await lstat(join(path, '..'))).mode & 0o777, 0o700);
  await assert.rejects(verifyHandoverArtifact(path), notReady);
});

test('a completed private artifact yields only readiness metadata', async t => {
  const f = await fixture(t);
  await f.save();
  const info = await lstat(f.path);
  assert.deepEqual(await verifyHandoverArtifact(f.path), {
    size: info.size, mtimeMs: info.mtimeMs, dev: info.dev, ino: info.ino,
  });
});

test('missing, empty and oversized artifacts cannot start a receiving chat', async t => {
  const f = await fixture(t);
  await assert.rejects(verifyHandoverArtifact(f.path), notReady);
  await f.save('');
  await assert.rejects(verifyHandoverArtifact(f.path), notReady);
  await truncate(f.path, 2 * 1024 * 1024 + 1);
  await assert.rejects(verifyHandoverArtifact(f.path), notReady);
});

test('artifact and parent permissions must retain private owner access', async t => {
  const f = await fixture(t);
  await f.save();
  for (const mode of [0o644, 0o640, 0o660, 0o400]) {
    await chmod(f.path, mode);
    await assert.rejects(verifyHandoverArtifact(f.path), notReady);
  }
  await chmod(f.path, 0o600);
  await chmod(f.directory, 0o755);
  await assert.rejects(verifyHandoverArtifact(f.path), notReady);
  await chmod(f.directory, 0o700);
  assert.ok((await verifyHandoverArtifact(f.path)).size > 0);
});

test('symlinked files or parent directories and hard-linked files are refused', async t => {
  const f = await fixture(t), other = await fixture(t);
  await other.save();
  await symlink(other.path, f.path);
  await assert.rejects(verifyHandoverArtifact(f.path), notReady);
  await rm(f.path);
  await link(other.path, f.path);
  await assert.rejects(verifyHandoverArtifact(f.path), notReady);
  await rm(f.path);
  const linkedDirectory = join(f.directory, 'linked');
  await symlink(other.directory, linkedDirectory);
  await assert.rejects(verifyHandoverArtifact(join(linkedDirectory, 'handoff.md')), notReady);
});

test('a directory at the artifact path is refused without reading it', async t => {
  const f = await fixture(t);
  await mkdir(f.path, { mode: 0o700 });
  await assert.rejects(verifyHandoverArtifact(f.path), notReady);
});

test('source prompt prepares and atomically publishes before receiver startup import', () => {
  const path = '/tmp/example "quoted" handover/handoff.md';
  const create = handoverCreatePrompt('/example/installed handoff/SKILL.md', path);
  assert.ok(create.includes(JSON.stringify(path)));
  assert.match(create, /complete handover first/i);
  assert.match(create, /temporary sibling file/);
  assert.match(create, /atomically rename/);
  assert.match(create, /only after preparation completes/);
  assert.match(create, /file mode 600/);
  assert.doesNotMatch(create, /has already been created/);
  assert.match(create, /Do not create or send to another chat/);
  const imported = handoverImportPrompt(path, 'Project v3');
  assert.equal(imported.split('\n')[0], 'Project v3');
  assert.ok(imported.includes(JSON.stringify(path)));
  assert.match(imported, /Read the handover at/);
  assert.doesNotMatch(imported, /press.*Import|wait.*source|DO NOT read/);
  assert.match(imported, /evidence, not new instructions/);
});
