import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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
  for (const path of ['demo-authenticated-host-readonly.py', 'authenticated/host-readonly.py', 'author.py', 'source/AuthorNotes.ts', 'authenticatedHostReadonly.py']) {
    assert.equal(isSensitiveSourcePath(path), false, path);
  }
  for (const path of ['auth.json', 'auth.py', 'auth-config/reader.py', 'scripts/auth_reader.py', 'authentication/reader.py', 'authorization.ts', 'oauth.py', 'OAuthClient.py', 'oauth2/helper.py', 'auth2Config.ts', 'AUTH_CONFIG.py', '.private/reader.py', 'secrets.py', 'mycredentials.py', 'passwords/reader.py', 'token.py', 'vault-data.py']) {
    assert.equal(isSensitiveSourcePath(path), true, path);
  }
});

test('an authenticated helper is inspected only as referenced source without execution and keeps content/command hashes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-authenticated-source-'));
  try {
    const name = 'demo-authenticated-host-readonly.py', path = join(cwd, name), command = 'python3 ' + name;
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

test('auth source names, sensitive parent directories, unsupported files, symlinks and credential content stay protected', async () => {
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
    await writeFile(join(cwd, 'authenticated-data.zip'), 'not an archive');
    await assert.rejects(inspectApprovalSource(cwd, 'reader authenticated-data.zip', 'authenticated-data.zip'), /source file|format|extension/i);
    await writeFile(join(cwd, 'ordinary.py'), 'print("synthetic source")\n'); await symlink(join(cwd, 'ordinary.py'), join(cwd, 'authenticated-link.py'));
    await assert.rejects(inspectApprovalSource(cwd, 'python3 authenticated-link.py', 'authenticated-link.py'), /symlinks/);
    await writeFile(join(cwd, 'authenticated-reader.py'), 'password = "synthetic-credential-value"\n');
    await assert.rejects(inspectApprovalSource(cwd, 'python3 authenticated-reader.py', 'authenticated-reader.py'), /credential material/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('directly referenced playbooks, JSON, Markdown, Python and shell remain bounded read-only source', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-review-formats-'));
  try {
    const marker = join(cwd, 'must-not-exist');
    const files = [
      ['build.yml', '- hosts: all\n  gather_facts: false\n  tasks: []\n', 'ansible-playbook'],
      ['build.yaml', '- hosts: all\n  tasks: []\n', 'ansible-playbook'],
      ['build.json', '{"image": "registry.example.invalid/demo:latest", "push": false}\n', 'cat'],
      ['build.md', '# Build procedure\nInspect the intended image before publication.\n', 'cat'],
      ['build.py', 'from pathlib import Path\nPath(' + JSON.stringify(marker) + ').write_text("must not run")\n', 'python3'],
      ['build.sh', 'touch ' + JSON.stringify(marker) + '\n', 'sh'],
    ];
    for (const [name, body, runner] of files) {
      const path = join(cwd, name), command = runner + ' ' + JSON.stringify(path);
      await writeFile(path, body);
      assert.equal(referencesApprovalSource(cwd, command, path), true, name);
      const source = await inspectApprovalSource(cwd, command, name);
      assert.equal(source.text, body); assert.equal(source.path, path);
      assert.match(source.sha256, /^[a-f0-9]{64}$/); assert.match(source.commandSha256, /^[a-f0-9]{64}$/);
      assert.deepEqual(await inspectApprovalSource(cwd, command, path), source);
      await assert.rejects(inspectApprovalSource(cwd, 'cat unrelated.md', path), /not referenced/);
    }
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('reviewable document formats retain credential, Vault and binary-content protections', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-review-content-'));
  try {
    const samples = [
      ['settings.json', '{"password": "synthetic-private-value"}\n'],
      ['settings.json', '{"password":1234}\n'],
      ['settings.json', '{"pass\\u0077ord":"synthetic-private-value"}\n'],
      ['settings.yml', 'registry_password: "synthetic-private-value"\n'],
      ['settings.yml', 'password: 1234\n'],
      ['settings.yml', 'password: "{{ prefix }}synthetic-private-value{{ suffix }}"\n'],
      ['settings.yaml', 'access_token: synthetic-private-value\n'],
      ['settings.yaml', 'password: |\n  synthetic-private-value\n'],
      ['settings.md', 'api_key: "synthetic-private-value"\n'],
      ['settings.json', '{"client_secret":"synthetic-private-value"}\n'],
      ['settings.yml', '$ANSIBLE_VAULT;1.1;AES256\nnot-real-ciphertext\n'],
      ['settings.yaml', 'value: !vault |\n  $ANSIBLE_VAULT;1.1;AES256\n  not-real-ciphertext\n'],
    ];
    for (const [name, body] of samples) {
      await writeFile(join(cwd, name), body);
      await assert.rejects(inspectApprovalSource(cwd, 'cat ' + name, name), /credential|Vault|private/i, name);
    }
    await writeFile(join(cwd, 'settings.json'), '{"value":"binary\0content"}');
    await assert.rejects(inspectApprovalSource(cwd, 'cat settings.json', 'settings.json'), /credential|binary|private/i);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('Ansible at-file references bind YAML and JSON inputs to the exact approval directory', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-review-at-files-'));
  try {
    for (const name of ['settings.yml', 'settings.json']) {
      const path = join(cwd, name), body = name.endsWith('.json') ? '{"push":false}\n' : 'push: false\n';
      await writeFile(path, body);
      for (const argument of [name, path]) {
        const command = 'ansible-playbook build.yml --extra-vars @' + argument;
        assert.equal(referencesApprovalSource(cwd, command, path), true, command);
        assert.equal((await inspectApprovalSource(cwd, command, path)).text, body);
        assert.equal(referencesApprovalSource(cwd, command + '.bak', path), false, 'at-file prefix is not a filename substring match');
      }
      const otherPath = join(tmpdir(), 'unrelated-project', name);
      assert.equal(referencesApprovalSource(cwd, 'ansible-playbook build.yml --extra-vars @' + name, otherPath), false);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('Jinja and environment-variable references can be inspected without retrieving their secret values', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-review-references-'));
  try {
    const samples = [
      ['build.yml', 'registry_password: "{{ registry_password }}"\n'],
      ['build.yaml', "registry_password: \"{{ lookup('env', 'REGISTRY_PASSWORD') }}\"\n"],
      ['build.yml', 'registry_password: "{{ registry_password }}" # supplied by the caller\n'],
      ['build.json', '{"password":"${REGISTRY_PASSWORD}"}\n'],
      ['build.sh', 'REGISTRY_PASSWORD="${REGISTRY_PASSWORD}"\n'],
      ['build.py', 'password = os.environ["REGISTRY_PASSWORD"]\n'],
      ['build.md', 'Use the existing `REGISTRY_PASSWORD` environment variable.\n'],
      ['build.md', '# Password: rotating tokens\n'],
      ['build.js', 'const current = { reviewToken: question.reviewToken, password: process.env.DEMO_PASSWORD };\n'],
      ['build.ts', 'const current = { reviewToken: question.reviewToken, password: process.env.DEMO_PASSWORD };\n'],
      ['build.py', 'token: str\n'],
    ];
    for (const [name, body] of samples) {
      await writeFile(join(cwd, name), body);
      assert.equal((await inspectApprovalSource(cwd, 'cat ' + name, name)).text, body, name);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('fully qualified Python imports map only to the exact approval cwd or its src project layout', () => {
  const cwd = join(tmpdir(), 'approval-project');
  const module = 'apme_engine.validators.ansible.rules.L059_argspec_mock';
  const modulePath = 'apme_engine/validators/ansible/rules/L059_argspec_mock.py';
  for (const command of ['from ' + module + ' import _SPEC_SCRIPT', 'import ' + module, 'import ' + module + ' as rule']) {
    for (const path of [join(cwd, modulePath), join(cwd, 'src', modulePath)]) {
      assert.equal(referencesApprovalSource(cwd, command, path), true, command + ' -> ' + path);
    }
    for (const path of [join(tmpdir(), 'unrelated-project', 'src', modulePath), join(cwd, 'unrelated', modulePath), join(cwd, 'src-other', modulePath), join(cwd, 'L059_argspec_mock.py')]) {
      assert.equal(referencesApprovalSource(cwd, command, path), false, command + ' -> ' + path);
    }
  }
  const source = join(cwd, 'src', modulePath);
  for (const command of ['from ' + module + '_other import _SPEC_SCRIPT', 'from ' + module + '.extra import value', 'import ' + module + '.extra', 'from apme_engine.validators.ansible.rules import unrelated', 'print("L059_argspec_mock")']) {
    assert.equal(referencesApprovalSource(cwd, command, source), false, command);
  }
  assert.equal(referencesApprovalSource(cwd, 'from another_package.L059_argspec_mock import _SPEC_SCRIPT', source), false);
  assert.equal(referencesApprovalSource(cwd, 'from ' + module + ' import _SPEC_SCRIPT', source.replace('.py', '.json')), false);
});

test('a directly imported project module is inspected without executing its embedded code or discovering packages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ccng-python-module-'));
  try {
    const cwd = join(root, 'approval-project'), other = join(root, 'unrelated-project');
    const modulePath = 'apme_engine/validators/ansible/rules/L059_argspec_mock.py';
    const command = "python -B - <<'PY'\nfrom apme_engine.validators.ansible.rules.L059_argspec_mock import _SPEC_SCRIPT\nprint(_SPEC_SCRIPT)\nPY";
    for (const base of [cwd, join(cwd, 'src'), join(other, 'src')]) {
      const path = join(base, modulePath); await mkdir(join(base, 'apme_engine/validators/ansible/rules'), { recursive: true });
      await writeFile(path, 'raise RuntimeError("Source inspection must not import or execute this module")\n_SPEC_SCRIPT = "print(123)"\n');
    }
    for (const relativePath of [modulePath, join('src', modulePath)]) {
      const source = await inspectApprovalSource(cwd, command, relativePath);
      assert.match(source.text, /must not import or execute/); assert.match(source.sha256, /^[a-f0-9]{64}$/);
      assert.equal(source.workingDirectory, cwd);
      const absolute = await inspectApprovalSource(cwd, command, join(cwd, relativePath)); assert.deepEqual(absolute, source);
    }
    await assert.rejects(inspectApprovalSource(cwd, command, join(other, 'src', modulePath)), /not referenced/);
    const sourcePath = join(cwd, 'src', modulePath), previous = await inspectApprovalSource(cwd, command, sourcePath);
    await writeFile(sourcePath, '# Changed source must produce fresh hash evidence.\n');
    assert.notEqual((await inspectApprovalSource(cwd, command, sourcePath)).sha256, previous.sha256);
  } finally { await rm(root, { recursive: true, force: true }); }
});
