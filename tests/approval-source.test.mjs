import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { approvalWorkingDirectory, inspectApprovalSource, referencesApprovalSource, isSensitiveSourcePath } from '../server/approval-source.mjs';

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

test('auth-specific name tokens remain sensitive while authenticated and author words are ordinary source names', () => {
  for (const path of ['hactar-v19-authenticated-host-readonly.py', 'authenticated/host-readonly.py', 'author.py', 'source/AuthorNotes.ts', 'authenticatedHostReadonly.py']) {
    assert.equal(isSensitiveSourcePath(path), false, path);
  }
  for (const path of ['auth.json', 'auth.py', 'auth-config/reader.py', 'scripts/auth_reader.py', 'authentication/reader.py', 'authorization.ts', 'oauth.py', 'OAuthClient.py', 'oauth2/helper.py', 'auth2Config.ts', 'AUTH_CONFIG.py', '.private/reader.py', 'secrets.py', 'mycredentials.py', 'passwords/reader.py', 'token.py', 'vault-data.py']) {
    assert.equal(isSensitiveSourcePath(path), true, path);
  }
});

test('an authenticated helper is inspected only as referenced source without execution and keeps content/command hashes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-authenticated-source-'));
  try {
    const name = 'hactar-v19-authenticated-host-readonly.py', path = join(cwd, name), command = 'python3 ' + name;
    const original = 'raise RuntimeError("Inspection must not execute this helper")\n';
    await writeFile(path, original);
    const source = await inspectApprovalSource(cwd, command, name);
    assert.equal(source.text, original); assert.equal(source.path, path); assert.equal(source.workingDirectory, cwd);
    assert.match(source.sha256, /^[a-f0-9]{64}$/); assert.match(source.commandSha256, /^[a-f0-9]{64}$/);
    const absolute = await inspectApprovalSource(cwd, command, path); assert.deepEqual(absolute, source);
    await writeFile(path, original + '# A source change must invalidate earlier hash evidence.\n');
    const changed = await inspectApprovalSource(cwd, command, name);
    assert.notEqual(changed.sha256, source.sha256); assert.equal(changed.commandSha256, source.commandSha256);
    const otherCommand = await inspectApprovalSource(cwd, command + ' --check', name);
    assert.equal(otherCommand.sha256, changed.sha256); assert.notEqual(otherCommand.commandSha256, changed.commandSha256);
    await assert.rejects(inspectApprovalSource(cwd, 'python3 unrelated.py', name), /not referenced/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('auth source names, sensitive parent directories, data, symlinks and credential content stay protected', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-protected-source-'));
  try {
    for (const name of ['auth.py', 'oauth.py', 'OAuthClient.py', 'auth.json']) {
      await writeFile(join(cwd, name), 'print("synthetic source")\n');
      await assert.rejects(inspectApprovalSource(cwd, 'python3 ' + name, name), /hidden, credential and Vault paths/);
    }
    for (const directory of ['authentication', 'authorization', 'auth-config', '.private', 'credentials']) {
      const parent = join(cwd, directory); await mkdir(parent); await writeFile(join(parent, 'authenticated-reader.py'), 'print("synthetic source")\n');
      await assert.rejects(inspectApprovalSource(parent, 'python3 authenticated-reader.py', 'authenticated-reader.py'), /hidden, credential and Vault paths/);
    }
    await writeFile(join(cwd, 'authenticated-data.json'), '{}');
    await assert.rejects(inspectApprovalSource(cwd, 'reader authenticated-data.json', 'authenticated-data.json'), /configuration\/data files/);
    await writeFile(join(cwd, 'ordinary.py'), 'print("synthetic source")\n'); await symlink(join(cwd, 'ordinary.py'), join(cwd, 'authenticated-link.py'));
    await assert.rejects(inspectApprovalSource(cwd, 'python3 authenticated-link.py', 'authenticated-link.py'), /symlinks/);
    await writeFile(join(cwd, 'authenticated-reader.py'), 'password = "synthetic-credential-value"\n');
    await assert.rejects(inspectApprovalSource(cwd, 'python3 authenticated-reader.py', 'authenticated-reader.py'), /credential material/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
