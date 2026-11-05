import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { approvalWorkingDirectory, inspectApprovalSource, referencesApprovalSource } from '../server/approval-source.mjs';

const subprocessCommand = 'python3 - <<\'PY\'\nimport subprocess\nsubprocess.run(["python3", "src/bump-version.py"], check=True)\nsubprocess.run([\'python3\', \'scripts/sync_todo.py\', \'--check\'], check=True)\nPY';

test('approval working directories use the supplied absolute path and fall back only when absent or null', () => {
  const fallback = join(tmpdir(), 'worker-project'); const supplied = join(tmpdir(), 'approval-project');
  for (const params of [{}, { cwd: undefined }, { cwd: null }]) assert.equal(approvalWorkingDirectory({ params }, fallback), fallback);
  assert.equal(approvalWorkingDirectory({ params: { cwd: supplied } }, fallback), supplied);
  for (const cwd of ['', '.', 'relative/project', 42, {}, []]) {
    assert.throws(() => approvalWorkingDirectory({ params: { cwd } }, fallback), /directory|cwd/i);
  }
});

test('quoted subprocess argv source references match equivalent absolute paths only under the approval directory', () => {
  const cwd = join(tmpdir(), 'approval-project');
  for (const path of ['src/bump-version.py', 'scripts/sync_todo.py']) {
    assert.equal(referencesApprovalSource(cwd, subprocessCommand, path), true);
    assert.equal(referencesApprovalSource(cwd, subprocessCommand, join(cwd, path)), true);
    assert.equal(referencesApprovalSource(cwd, subprocessCommand, join(tmpdir(), 'unrelated-project', path)), false);
  }
  assert.equal(referencesApprovalSource(cwd, subprocessCommand, join(cwd, 'unrelated.py')), false);
  assert.equal(referencesApprovalSource(cwd, 'python3 src/bump-version.py.bak', join(cwd, 'src/bump-version.py')), false);
});

test('relative and absolute subprocess helper inspections produce the same bounded source evidence', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-source-directory-'));
  try {
    await mkdir(join(cwd, 'src')); await mkdir(join(cwd, 'scripts'));
    for (const relativePath of ['src/bump-version.py', 'scripts/sync_todo.py']) {
      const path = join(cwd, relativePath); await writeFile(path, 'print("synthetic helper source")\n');
      const relative = await inspectApprovalSource(cwd, subprocessCommand, relativePath);
      const absolute = await inspectApprovalSource(cwd, subprocessCommand, path);
      assert.deepEqual(absolute, relative); assert.equal(absolute.path, path); assert.equal(absolute.workingDirectory, cwd);
      assert.equal(absolute.text, 'print("synthetic helper source")\n'); assert.match(absolute.sha256, /^[a-f0-9]{64}$/);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('relative helper names cannot bypass hidden or sensitive components in the approval directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ccng-source-path-'));
  try {
    for (const name of ['.private', 'credentials']) {
      const cwd = join(root, name); const absolutePath = join(cwd, 'helper.py');
      await mkdir(cwd); await writeFile(absolutePath, 'print("ordinary synthetic source")\n');
      for (const path of ['helper.py', absolutePath]) {
        await assert.rejects(inspectApprovalSource(cwd, 'python3 helper.py', path), /hidden, credential and Vault paths/);
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
