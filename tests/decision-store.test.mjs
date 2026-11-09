import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, stat, symlink, chmod, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DecisionStore, DECISION_HISTORY_LIMIT } from '../server/decision-store.mjs';

const record = (index = 1) => ({
  version: 1, id: 'decision-' + index, at: '2026-01-01T00:00:00.000Z',
  agentId: 'worker-one', workerName: 'Example worker', projectName: 'Example project',
  requestSummary: 'Run the existing verification.', requestId: index, turnId: 'turn-one', itemId: 'item-one',
  coordinatorId: 'coordinator-one', decision: 'approve', outcome: 'resolved',
  rationale: 'The user authorized this bounded verification.', authorizationMessageId: 'user-one',
});
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-decisions-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'private', 'decisions.jsonl');
  return { directory, file, store: new DecisionStore(file) };
}

test('serialized decisions append privately and survive a new store without keeping arbitrary approval data', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.store.load(), []);
  await Promise.all(Array.from({ length: 12 }, (_, index) => f.store.append({
    ...record(index), reviewToken: 'not-for-storage', authorizationQuote: 'not-for-storage',
    params: { command: 'not-for-storage', form: { password: 'not-for-storage' } },
    storageState: 'pending', command: 'not-for-storage', helper: 'not-for-storage',
  })));
  await f.store.flush();
  assert.equal((await stat(join(f.directory, 'private'))).mode & 0o777, 0o700);
  assert.equal((await stat(f.file)).mode & 0o777, 0o600);
  const bytes = await readFile(f.file, 'utf8');
  assert.doesNotMatch(bytes, /not-for-storage|reviewToken|authorizationQuote|storageState|command|helper|params/);
  assert.deepEqual(await new DecisionStore(f.file).load(), Array.from({ length: 12 }, (_, index) => record(index)));
});

test('startup memory stays bounded while older disk records are retained unchanged', async t => {
  const f = await fixture(t); await mkdir(join(f.directory, 'private'), { mode: 0o700 });
  const rows = Array.from({ length: DECISION_HISTORY_LIMIT + 8 }, (_, index) => record(index));
  const bytes = rows.map(row => JSON.stringify(row) + '\n').join('');
  await writeFile(f.file, bytes, { mode: 0o600 });
  assert.deepEqual(await f.store.load(), rows.slice(-DECISION_HISTORY_LIMIT));
  assert.equal(await readFile(f.file, 'utf8'), bytes);
  await f.store.append(record(1000));
  assert.equal((await readFile(f.file, 'utf8')).startsWith(bytes), true);
  const loaded = await new DecisionStore(f.file).load();
  assert.equal(loaded.length, DECISION_HISTORY_LIMIT); assert.deepEqual(loaded.at(-1), record(1000));
});

test('credential-looking or fenced-code notes fail without writing and do not poison a later safe decision', async t => {
  const f = await fixture(t);
  for (const rationale of ['-----BEGIN PRIVATE KEY-----', 'Authorization: Bearer synthetic-value', '```python\nprivate()\n```', 'github_pat_' + 'a'.repeat(32)]) {
    await assert.rejects(f.store.append({ ...record(), rationale }), /credentials or code/);
    await assert.rejects(stat(f.file), { code: 'ENOENT' });
  }
  await f.store.append(record());
  assert.deepEqual(await new DecisionStore(f.file).load(), [record()]);
});

test('corrupt, truncated and oversized history is visible and frozen without rewriting its bytes', async t => {
  for (const bytes of ['not JSON\n', JSON.stringify(record()), JSON.stringify(record()) + '\n' + 'x'.repeat(20_000), JSON.stringify({ ...record(), version: 2 }) + '\n']) {
    const f = await fixture(t); await mkdir(join(f.directory, 'private'), { mode: 0o700 });
    await writeFile(f.file, bytes, { mode: 0o600 });
    await assert.rejects(f.store.load(), /invalid record|incomplete final record|oversized record/);
    await assert.rejects(f.store.append(record(2)));
    assert.equal(await readFile(f.file, 'utf8'), bytes);
  }
});

test('linked or publicly readable files and unsafe parent directories are refused without changing targets', async t => {
  for (const kind of ['file-symlink', 'broken-symlink', 'directory-symlink', 'public-file', 'public-directory', 'directory-file']) {
    const f = await fixture(t); const parent = join(f.directory, 'private');
    const target = join(f.directory, 'target');
    if (kind === 'directory-symlink') { await mkdir(target, { mode: 0o700 }); await symlink(target, parent); }
    else {
      await mkdir(parent, { mode: 0o700 });
      if (kind === 'file-symlink') { await writeFile(target, JSON.stringify(record()) + '\n', { mode: 0o600 }); await symlink(target, f.file); }
      if (kind === 'broken-symlink') await symlink(target, f.file);
      if (kind === 'directory-file') await mkdir(f.file);
      if (kind === 'public-file') await writeFile(f.file, JSON.stringify(record()) + '\n', { mode: 0o644 });
      if (kind === 'public-directory') await chmod(parent, 0o755);
    }
    await assert.rejects(f.store.load()); await assert.rejects(f.store.append(record(2)));
    if (kind === 'file-symlink') assert.equal(await readFile(target, 'utf8'), JSON.stringify(record()) + '\n');
  }
});

test('external replacement, corruption or deletion stops appends without overwriting or recreating history', async t => {
  for (const change of ['rewrite', 'delete']) {
    const f = await fixture(t); await f.store.append(record());
    if (change === 'rewrite') await writeFile(f.file, 'changed privately\n');
    else await unlink(f.file);
    await assert.rejects(f.store.append(record(2)), /changed outside|Cannot append/);
    await assert.rejects(f.store.append(record(3)));
    if (change === 'rewrite') assert.equal(await readFile(f.file, 'utf8'), 'changed privately\n');
    else await assert.rejects(stat(f.file), { code: 'ENOENT' });
  }
});
