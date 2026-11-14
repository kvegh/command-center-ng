import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { approvalWorkingDirectory, inspectApprovalSource, readSourceText, referencesApprovalSource, isSensitiveSourcePath, sourceContainsCredentials, sourceCredentialReason } from '../server/approval-source.mjs';

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

test('credential refusal reasons name fixed rules without changing accepted references or literal thresholds', () => {
  for (const [extension, content] of [
    ['.py', 'password = os.environ["EXAMPLE_PASSWORD"]\ntoken: str\n'],
    ['.py', '# password = "synthetic-value"\npassword = "1234567"\n'],
    ['.js', 'const data = { password: process.env.EXAMPLE_PASSWORD };\n'],
    ['.yaml', 'password: "{{ supplied_password }}"\n'],
    ['.json', '{"nest":[{"pass\\u0077ord":"${EXAMPLE_PASSWORD}","token":false,"secret":null,"api_key":""}]}'],
    ['.json', '{"value":"ordinary text","nest":[true,{},123]}'],
    ['.json', '{"value":"\\u0000"}'],
  ]) {
    assert.equal(sourceCredentialReason(content, extension), null, content);
    assert.equal(sourceContainsCredentials(content, extension), false, content);
  }
  for (const [extension, content, reason] of [
    ['.py', 'value = "synthetic-binary-body"\0', 'binary data'],
    ['.yaml', '$ANSIBLE_VAULT;1.1;AES256\nsynthetic-body\n', 'Vault marker'],
    ['.yaml', 'value: !vault |\n  synthetic-body\n', 'Vault marker'],
    ['.py', 'value = "-----BEGIN SYNTHETIC PRIVATE KEY-----"\n', 'private-key marker'],
    ['.py', 'value = "ghp_synthetic_marker_example_not_real"\n', 'provider-token marker'],
    ['.py', 'value = "github_pat_synthetic_marker_example_not_real"\n', 'provider-token marker'],
    ['.py', 'value = "sk-synthetic_marker_example_not_real"\n', 'provider-token marker'],
    ['.json', '{"nest":[{"pass\\u0077ord":"synthetic-field-value"}]}', 'credential-named JSON field'],
    ['.json', '{"nest":[{"secret":123}]}', 'credential-named JSON field'],
    ['.json', '{"nest":[{"token":[]}]}', 'credential-named JSON field'],
    ['.json', '{"nest":[{"value":"\\u0067hp_synthetic_marker_example_not_real"}]}', 'provider-token marker'],
    ['.json', '{"value":"\\u0024ANSIBLE_VAULT;synthetic-body"}', 'Vault marker'],
    ['.py', 'password = "12345678"\n', 'credential-named literal assignment'],
    ['.yaml', 'api_key: short\n', 'credential-named literal assignment'],
    ['.yaml', 'password: |\n  synthetic-block-value\n', 'credential-named literal assignment'],
    ['.json', '{"secret":"synthetic-value",malformed}', 'credential-named literal assignment'],
  ]) {
    assert.equal(sourceCredentialReason(content, extension), reason, content);
    assert.equal(sourceContainsCredentials(content, extension), true, content);
  }
  assert.equal(sourceCredentialReason('ghp_synthetic_marker_example_not_real\n-----BEGIN SYNTHETIC PRIVATE KEY-----', '.py'), 'provider-token marker', 'the original combined marker regex still selects its first text match');
  assert.equal(sourceCredentialReason('ghp_synthetic_marker_example_not_real\0', '.py'), 'binary data', 'the original binary guard stays first');
});

test('source inspection reports only a fixed refusal category without matching fields, values or source excerpts', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-reader-reasons-'));
  try {
    for (const [extension, content, reason, sensitive] of [
      ['.py', 'ordinary = "synthetic-binary-value"\0', 'binary data', ['ordinary', 'synthetic-binary-value', '\0']],
      ['.yaml', 'ordinary: !vault |\n  synthetic-vault-body\n', 'Vault marker', ['ordinary', '!vault', 'synthetic-vault-body']],
      ['.py', 'ordinary = "-----BEGIN SYNTHETIC PRIVATE KEY-----"\n', 'private-key marker', ['ordinary', '-----BEGIN SYNTHETIC PRIVATE KEY-----']],
      ['.py', 'ordinary = "ghp_synthetic_marker_example_not_real"\n', 'provider-token marker', ['ordinary', 'ghp_synthetic_marker_example_not_real']],
      ['.json', '{"nest":[{"private_pass\\u0077ord_field":"synthetic-json-value"}]}', 'credential-named JSON field', ['nest', 'private_password_field', 'private_pass\\u0077ord_field', 'synthetic-json-value']],
      ['.py', 'private_password_field = "synthetic-literal-value"\n', 'credential-named literal assignment', ['private_password_field', 'synthetic-literal-value']],
    ]) {
      const name = 'example' + extension;
      await writeFile(join(cwd, name), content);
      await assert.rejects(inspectApprovalSource(cwd, 'cat ' + name, name), error => {
        assert.equal(error.status, 400);
        assert.equal(error.message, 'This source appears to contain credential material, Vault content or binary data. Review it privately. Reason: ' + reason + '.');
        for (const text of sensitive) assert.equal(error.message.includes(text), false, 'the refusal must not disclose matched content');
        assert.equal(error.message.includes(content), false);
        return true;
      });
    }
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

test('literal unittest targets bind only their test module in the explicit read-only Podman workdir', () => {
  const cwd = join(tmpdir(), 'worker-project'), sourceRoot = join(tmpdir(), 'mounted-tests');
  const path = join(sourceRoot, 'tests', 'test_example.py');
  const prefix = `podman run --pull=never --rm --read-only --network=none --tmpfs /tmp:rw,mode=1777,size=128m -v ${sourceRoot}:/code:ro -w /code/tests -e TEST_CACHE=/tmp/cache --entrypoint python3 localhost/demo-tests:1.0.0 -B -m unittest `;
  for (const target of ['test_example', 'test_example.ExampleTests', 'test_example.ExampleTests.test_result']) {
    const command = prefix + target + ' -v';
    for (const wrapped of [command, "/bin/bash -lc '" + command + "'", '/bin/bash -lc "' + command + '"']) {
      assert.equal(referencesApprovalSource(cwd, wrapped, path), true, wrapped);
      for (const unrelated of [join(sourceRoot, 'tests', 'test_other.py'), join(sourceRoot, 'test_example.py'), join(cwd, 'tests', 'test_example.py'), join(tmpdir(), 'other-tests', 'tests', 'test_example.py')]) {
        assert.equal(referencesApprovalSource(cwd, wrapped, unrelated), false, unrelated);
      }
    }
  }
  const command = prefix + 'test_example.ExampleTests.test_result -v';
  for (const name of ['discover', 'Discover']) {
    assert.equal(referencesApprovalSource(cwd, prefix + name, join(sourceRoot, 'tests', name + '.py')), false, 'unittest discovery does not refer to a module');
  }
  for (const rejected of [
    '/bin/bash -lc ' + command,
    command.replace(':/code:ro', ':/code:rw'),
    command.replace(':/code:ro', ':/code'),
    command.replace('-w /code/tests', '-w /other/tests'),
    command.replace('-w /code/tests', '-w /code/../code/tests'),
    command.replace(sourceRoot + ':/code:ro', sourceRoot + '/../mounted-tests:/code:ro'),
    command.replace('-w /code/tests', `-v ${sourceRoot}:/elsewhere:ro -w /code/tests`),
    command.replace('-w /code/tests', '-w /code/tests -w /code'),
    command.replace('--entrypoint python3', '--entrypoint sh'),
    command.replace('--entrypoint python3', ''),
    command.replace('--rm', '--privileged'),
    command.replace('--tmpfs /tmp:rw,mode=1777,size=128m', '--tmpfs /code:rw'),
    command.replace('--tmpfs /tmp:rw,mode=1777,size=128m', '--tmpfs /code/tests:rw'),
    command.replace('TEST_CACHE=/tmp/cache', 'PYTHONPATH=/other/tests'),
    command.replace('TEST_CACHE=/tmp/cache', 'PYTHONSAFEPATH=1'),
    command.replace('TEST_CACHE=/tmp/cache', 'TEST_CACHE'),
    command.replace('test_example.ExampleTests', 'test_example_other.ExampleTests'),
    command.replace('test_example.ExampleTests.test_result', '../test_example'),
    command.replace('test_example.ExampleTests.test_result', 'discover'),
    command + '; echo another-command',
    command + '\necho another-command',
    command.replace('TEST_CACHE=/tmp/cache', 'TEST_CACHE=$(echo /tmp/cache)'),
  ]) assert.equal(referencesApprovalSource(cwd, rejected, path), false, rejected);
});

test('direct unittest targets use only the approval directory without discovery or import execution', () => {
  const cwd = join(tmpdir(), 'unittest-project'), path = join(cwd, 'test_example.py');
  for (const name of ['discover', 'Discover']) {
    assert.equal(referencesApprovalSource(cwd, 'python3 -m unittest ' + name, join(cwd, name + '.py')), false, 'reserved discovery mode is not a module target');
  }
  for (const command of ['python3 -B -m unittest test_example.ExampleTests.test_result -v', 'python -m unittest -q test_example', '/usr/bin/python3.12 -m unittest test_example.ExampleTests']) {
    assert.equal(referencesApprovalSource(cwd, command, path), true, command);
    assert.equal(referencesApprovalSource(join(tmpdir(), 'other-project'), command, path), false);
  }
  assert.equal(referencesApprovalSource(cwd, 'python3 -m unittest test_example test_other', path), true, 'multiple literal modules bind only explicitly named sources');
  assert.equal(referencesApprovalSource(cwd, 'python3 -m unittest test_example test_other', join(cwd, 'test_other.py')), true);
  assert.equal(referencesApprovalSource(cwd, 'python3 -m unittest test_example test_other', join(cwd, 'test_unrelated.py')), false);
  for (const command of ['python3 -m unittest discover', 'python3 -m unittest test_other', 'python3 -m unittest test_example_other', 'python3 -m unittest tests.test_example']) {
    assert.equal(referencesApprovalSource(cwd, command, path), false, command);
  }
});

test('mapped unittest source inspection remains bounded, protected and read-only with fresh hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ccng-unittest-source-'));
  try {
    const cwd = join(root, 'worker-project'), sourceRoot = join(root, 'mounted-tests'), directory = join(sourceRoot, 'tests');
    await mkdir(cwd); await mkdir(directory, { recursive: true });
    const path = join(directory, 'test_example.py'), marker = join(root, 'must-not-exist');
    const body = `from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text("must not run")\n`;
    await writeFile(path, body);
    const command = `podman run --pull=never --rm --read-only --network=none -v ${sourceRoot}:/code:ro -w /code/tests --entrypoint python3 localhost/demo-tests:1.0.0 -B -m unittest test_example.ExampleTests.test_result -v`;
    const source = await inspectApprovalSource(cwd, command, path);
    assert.equal(source.text, body); assert.equal(source.workingDirectory, cwd);
    assert.match(source.sha256, /^[a-f0-9]{64}$/); assert.match(source.commandSha256, /^[a-f0-9]{64}$/);
    assert.notEqual((await inspectApprovalSource(cwd, command.replace(/ -v$/, ' -q'), path)).commandSha256, source.commandSha256);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
    await writeFile(path, '# Source changed without executing any test.\n');
    assert.notEqual((await inspectApprovalSource(cwd, command, path)).sha256, source.sha256);
    await writeFile(path, 'password = "synthetic-credential-value"\n');
    await assert.rejects(inspectApprovalSource(cwd, command, path), /credential material/);
    await writeFile(path, 'x'.repeat(500001));
    await assert.rejects(inspectApprovalSource(cwd, command, path), /500000 bytes/);
    await rm(path); await writeFile(join(directory, 'actual.py'), '# Ordinary source.\n'); await symlink(join(directory, 'actual.py'), path);
    await assert.rejects(inspectApprovalSource(cwd, command, path), /symlinks/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

const directContainerPython = sourceRoot => `podman run --rm --pull=never --userns=keep-id --network=none --read-only --volume ${sourceRoot}:/code:ro --workdir /code/tests --tmpfs /tmp:rw,mode=1777,size=128m -e TEST_CACHE=/tmp/cache --entrypoint /usr/bin/python3 localhost/demo-tests:1.0.0 -B /code/tests/test_example.py ExampleTests.test_result -v`;

test('literal direct Python scripts bind through one read-only Podman volume with keep-id and an absolute interpreter', () => {
  const cwd = join(tmpdir(), 'worker-project'), sourceRoot = join(tmpdir(), 'mounted-tests');
  const path = join(sourceRoot, 'tests', 'test_example.py'), command = directContainerPython(sourceRoot);
  for (const entrypoint of ['/usr/bin/python3', '/usr/bin/python3.12', '/bin/python3', 'python3']) {
    const literal = command.replace('/usr/bin/python3', entrypoint);
    for (const wrapped of [literal, "/bin/bash -lc '" + literal + "'", '/bin/bash -lc "' + literal + '"']) {
      assert.equal(referencesApprovalSource(cwd, wrapped, path), true, wrapped);
      for (const unrelated of [join(sourceRoot, 'tests', 'test_other.py'), join(sourceRoot, 'test_example.py'), join(cwd, 'tests', 'test_example.py'), join(tmpdir(), 'other-tests', 'tests', 'test_example.py')]) {
        assert.equal(referencesApprovalSource(cwd, wrapped, unrelated), false, unrelated);
      }
    }
  }
  assert.equal(referencesApprovalSource(cwd, command.replace(' -B ', ' '), path), true, '-B is optional');
  assert.equal(referencesApprovalSource(cwd, command.replace(' --userns=keep-id', ''), path), true, 'the existing default user namespace remains supported');
  assert.equal(referencesApprovalSource(cwd, command.replace('/code/tests/test_example.py ExampleTests.test_result', '-m unittest test_example.ExampleTests.test_result'), path), true, 'keep-id and absolute entrypoints also preserve the existing unittest form');
});

test('direct container Python mapping rejects ambiguous, shadowed, writable and unrelated source references', () => {
  const cwd = join(tmpdir(), 'worker-project'), sourceRoot = join(tmpdir(), 'mounted-tests');
  const path = join(sourceRoot, 'tests', 'test_example.py'), command = directContainerPython(sourceRoot);
  for (const [script, requested] of [
    ['/code/tests/test_other.py', path],
    ['/other/tests/test_example.py', path],
    ['/code-other/tests/test_example.py', path],
    ['/code/tests-other/test_example.py', join(sourceRoot, 'tests-other', 'test_example.py')],
    ['/code/test_example.py', join(sourceRoot, 'test_example.py')],
    ['/code/tests/../tests/test_example.py', path],
    ['/code/tests/./test_example.py', path],
    ['/code/tests//test_example.py', path],
    ['/code/tests/test_example.py.bak', path],
    ['test_example.py', path],
    ['./test_example.py', path],
  ]) {
    const changed = command.replace(' /code/tests/test_example.py ', ' ' + script + ' ');
    assert.equal(referencesApprovalSource(cwd, changed, requested), false, script + ' -> ' + requested);
  }
  for (const rejected of [
    '/bin/bash -lc ' + command,
    command.replace('--userns=keep-id', '--userns=host'),
    command.replace('--userns=keep-id', '--userns=auto'),
    command.replace('--userns=keep-id', '--userns=keep-id:size=100'),
    command.replace('--userns=keep-id', '--userns=keep-id --userns=keep-id'),
    command.replace('--userns=keep-id', '--userns=keep-id --userns=host'),
    command.replace(':/code:ro', ':/code:rw'),
    command.replace(':/code:ro', ':/code'),
    command.replace('--workdir /code/tests', `--volume ${sourceRoot}:/other:ro --workdir /code/tests`),
    command.replace('--workdir /code/tests', '--workdir /code/tests --workdir /code'),
    command.replace('--workdir /code/tests', '--workdir /code/../code/tests'),
    command.replace(sourceRoot + ':/code:ro', sourceRoot + '/../mounted-tests:/code:ro'),
    command.replace('--tmpfs /tmp:rw,mode=1777,size=128m', '--tmpfs /code:rw'),
    command.replace('--tmpfs /tmp:rw,mode=1777,size=128m', '--tmpfs /code/tests:rw'),
    command.replace('--tmpfs /tmp:rw,mode=1777,size=128m', '--tmpfs /code/tests/test_example.py:rw'),
    command.replace('--entrypoint /usr/bin/python3', '--entrypoint /usr/bin/sh'),
    command.replace('--entrypoint /usr/bin/python3', '--entrypoint /opt/custom/python3'),
    command.replace('--entrypoint /usr/bin/python3', '--entrypoint /usr/bin/python3 --entrypoint python3'),
    command.replace('TEST_CACHE=/tmp/cache', 'PYTHONPATH=/other/tests'),
    command.replace('TEST_CACHE=/tmp/cache', 'PYTHONHOME=/other/python'),
    command.replace('TEST_CACHE=/tmp/cache', 'PYTHONSAFEPATH=1'),
    command.replace('TEST_CACHE=/tmp/cache', 'TEST_CACHE'),
    command.replace('TEST_CACHE=/tmp/cache', 'TEST_CACHE=$(echo /tmp/cache)'),
    command.replace(' -B /code/tests/test_example.py ', ' -c /code/tests/test_example.py '),
    command + '; echo another-command',
    command + '\necho another-command',
  ]) assert.equal(referencesApprovalSource(cwd, rejected, path), false, rejected);
});

test('direct container script inspection reads only synthetic source and retains hashes and protected read limits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ccng-direct-container-source-'));
  try {
    const cwd = join(root, 'worker-project'), sourceRoot = join(root, 'mounted-tests'), directory = join(sourceRoot, 'tests');
    await mkdir(cwd); await mkdir(directory, { recursive: true });
    const path = join(directory, 'test_example.py'), marker = join(root, 'must-not-exist');
    const body = `from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text("must not run")\n`;
    await writeFile(path, body);
    const command = "/bin/bash -lc '" + directContainerPython(sourceRoot) + "'";
    const source = await inspectApprovalSource(cwd, command, path);
    assert.equal(source.text, body); assert.equal(source.path, path); assert.equal(source.workingDirectory, cwd);
    assert.match(source.sha256, /^[a-f0-9]{64}$/); assert.match(source.commandSha256, /^[a-f0-9]{64}$/);
    const anotherCommand = await inspectApprovalSource(cwd, command.replace(' -v', ' -q'), path);
    assert.equal(anotherCommand.sha256, source.sha256); assert.notEqual(anotherCommand.commandSha256, source.commandSha256);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
    await writeFile(path, '# Changed synthetic source, still never executed.\n');
    assert.notEqual((await inspectApprovalSource(cwd, command, path)).sha256, source.sha256);
    await writeFile(join(directory, 'test_other.py'), '# Unrelated source.\n');
    await assert.rejects(inspectApprovalSource(cwd, command, join(directory, 'test_other.py')), /not referenced/);
    await writeFile(path, 'password = "synthetic-credential-value"\n');
    await assert.rejects(inspectApprovalSource(cwd, command, path), /credential material/);
    await writeFile(path, 'x'.repeat(500001));
    await assert.rejects(inspectApprovalSource(cwd, command, path), /500000 bytes/);
    await rm(path); await writeFile(join(directory, 'actual.py'), '# Ordinary synthetic source.\n'); await symlink(join(directory, 'actual.py'), path);
    await assert.rejects(inspectApprovalSource(cwd, command, path), /symlinks/);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

const multiContainerUnittest = sourceRoot => `podman run --rm --pull=never --userns=keep-id --user 1001:1001 --network=none --read-only --volume ${sourceRoot}:/code:ro,Z --workdir /code/tests --tmpfs /tmp:rw,mode=1777,size=128m -e TEST_CACHE=/tmp/cache --entrypoint /usr/bin/python3 localhost/demo-tests:1.0.0 -B -m unittest test_example.ExampleTests.test_first test_example.ExampleTests.test_second -v`;

test('numeric container users and read-only SELinux mount forms bind each explicitly named unittest module', () => {
  const cwd = join(tmpdir(), 'worker-project'), sourceRoot = join(tmpdir(), 'mounted-tests');
  const path = join(sourceRoot, 'tests', 'test_example.py'), command = multiContainerUnittest(sourceRoot);
  for (const options of ['ro', 'ro,Z', 'ro,z']) for (const user of ['--user 1001:1001', '--user=1001:1001', '--user 0:0']) {
    const literal = command.replace('ro,Z', options).replace('--user 1001:1001', user);
    for (const wrapped of [literal, "/bin/bash -lc '" + literal + "'", '/bin/bash -lc "' + literal + '"']) {
      assert.equal(referencesApprovalSource(cwd, wrapped, path), true, wrapped);
      assert.equal(referencesApprovalSource(cwd, wrapped, join(sourceRoot, 'tests', 'test_unrelated.py')), false);
    }
  }
  const differentModules = command.replace('test_example.ExampleTests.test_second', 'test_other.OtherTests.test_result');
  assert.equal(referencesApprovalSource(cwd, differentModules, path), true);
  assert.equal(referencesApprovalSource(cwd, differentModules, join(sourceRoot, 'tests', 'test_other.py')), true);
  for (const unrelated of [join(sourceRoot, 'test_other.py'), join(cwd, 'test_other.py'), join(tmpdir(), 'other-tests', 'tests', 'test_other.py')]) {
    assert.equal(referencesApprovalSource(cwd, differentModules, unrelated), false, unrelated);
  }
  const directScript = command.replace('-m unittest test_example.ExampleTests.test_first test_example.ExampleTests.test_second', '/code/tests/test_example.py ExampleTests.test_first ExampleTests.test_second');
  assert.equal(referencesApprovalSource(cwd, directScript, path), true, 'the existing direct-script form remains supported');
});

test('numeric-user, SELinux and multi-selector recognition retains literal identity and ambiguity guards', () => {
  const cwd = join(tmpdir(), 'worker-project'), sourceRoot = join(tmpdir(), 'mounted-tests');
  const path = join(sourceRoot, 'tests', 'test_example.py'), command = multiContainerUnittest(sourceRoot);
  for (const user of ['root:root', '1001', '1001:', ':1001', '1001:group', '-1:1001', '1001:1001:1001', '1001:1001 --user 1002:1002', '1001:1001 --user=1001:1001']) {
    assert.equal(referencesApprovalSource(cwd, command.replace('--user 1001:1001', '--user ' + user), path), false, user);
  }
  for (const options of ['rw', 'rw,Z', 'ro,rw', 'ro,Z,rw', 'ro,ro', 'ro,Z,Z', 'ro,z,Z', 'ro,Z,z', 'ro,', 'ro,U', 'ro,Z,nosuid']) {
    assert.equal(referencesApprovalSource(cwd, command.replace('ro,Z', options), path), false, options);
  }
  for (const target of ['discover', 'Discover', '--failfast', '-k', '../test_other', 'test_other..OtherTests', '.test_other', 'test_other.OtherTests.test_result.extra']) {
    assert.equal(referencesApprovalSource(cwd, command.replace('test_example.ExampleTests.test_second', target), path), false, target);
  }
  for (const rejected of [
    command.replace('--user 1001:1001', '--unknown-user 1001:1001'),
    command.replace('--workdir /code/tests', `--volume ${sourceRoot}:/elsewhere:ro --workdir /code/tests`),
    command.replace('--workdir /code/tests', '--workdir /code/../code/tests'),
    command.replace('--tmpfs /tmp:rw,mode=1777,size=128m', '--tmpfs /code:rw'),
    command.replace('TEST_CACHE=/tmp/cache', 'PYTHONPATH=/other/tests'),
    command.replace('test_example.ExampleTests.test_first', 'test_example_other.ExampleTests.test_first').replace('test_example.ExampleTests.test_second', 'test_other.OtherTests.test_second'),
    command + '; echo another-command',
    command.replace('--user 1001:1001', '--user $(id -u):$(id -g)'),
  ]) assert.equal(referencesApprovalSource(cwd, rejected, path), false, rejected);
});

test('multi-selector container source inspection stays read-only, hashed, bounded and credential-protected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ccng-multi-container-source-'));
  try {
    const cwd = join(root, 'worker-project'), sourceRoot = join(root, 'mounted-tests'), directory = join(sourceRoot, 'tests');
    await mkdir(cwd); await mkdir(directory, { recursive: true });
    const path = join(directory, 'test_example.py'), marker = join(root, 'must-not-exist');
    const body = `from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text("must not run")\n`;
    await writeFile(path, body);
    const command = "/bin/bash -lc '" + multiContainerUnittest(sourceRoot) + "'";
    const source = await inspectApprovalSource(cwd, command, path);
    assert.equal(source.text, body); assert.equal(source.path, path); assert.equal(source.workingDirectory, cwd);
    assert.match(source.sha256, /^[a-f0-9]{64}$/); assert.match(source.commandSha256, /^[a-f0-9]{64}$/);
    const changedCommand = await inspectApprovalSource(cwd, command.replace('test_second', 'test_third'), path);
    assert.equal(changedCommand.sha256, source.sha256); assert.notEqual(changedCommand.commandSha256, source.commandSha256);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
    await writeFile(path, '# Changed synthetic source.\n');
    assert.notEqual((await inspectApprovalSource(cwd, command, path)).sha256, source.sha256);
    await writeFile(path, 'password = "synthetic-credential-value"\n');
    await assert.rejects(inspectApprovalSource(cwd, command, path), /credential material/);
    await writeFile(path, 'x'.repeat(500001));
    await assert.rejects(inspectApprovalSource(cwd, command, path), /500000 bytes/);
    await rm(path); await writeFile(join(directory, 'actual.py'), '# Ordinary synthetic source.\n'); await symlink(join(directory, 'actual.py'), path);
    await assert.rejects(inspectApprovalSource(cwd, command, path), /symlinks/);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('explicit current-request project scope permits unreferenced source only inside its non-root directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ccng-request-project-'));
  try {
    const cwd = join(root, 'project'), outside = join(root, 'project-other');
    await mkdir(join(cwd, 'src'), { recursive: true }); await mkdir(outside);
    const path = join(cwd, 'src', 'engine.py'), other = join(outside, 'engine.py'), marker = join(root, 'must-not-exist');
    const body = `from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text("must not run")\n`;
    await writeFile(path, body); await writeFile(other, '# Outside the current project.\n');
    const command = 'example-tool --check', options = { includeProjectDirectory: true };
    assert.equal(referencesApprovalSource(cwd, command, path), false, 'standalone source binding remains strict by default');
    await assert.rejects(inspectApprovalSource(cwd, command, path), /not referenced/);
    for (const requested of [path, 'src/engine.py']) {
      assert.equal(referencesApprovalSource(cwd, command, requested, options), true);
      const source = await inspectApprovalSource(cwd, command, requested, 1, options);
      assert.equal(source.path, path); assert.equal(source.text, body); assert.equal(source.workingDirectory, cwd);
      assert.match(source.sha256, /^[a-f0-9]{64}$/); assert.match(source.commandSha256, /^[a-f0-9]{64}$/);
    }
    assert.equal(referencesApprovalSource(cwd, command, other, options), false, 'a directory-prefix neighbor is outside the project');
    await assert.rejects(inspectApprovalSource(cwd, command, other, 1, options), /not referenced/);
    assert.equal((await inspectApprovalSource(cwd, 'cat ' + other, other, 1, options)).path, other, 'the existing exact outside reference remains supported');
    for (const cwd of ['/', '/tmp/..']) assert.equal(referencesApprovalSource(cwd, command, path, options), false, 'a root or root alias never grants project-wide host access');
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('current-request project scope retains source type, symlink, path, content and size refusals', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-request-project-guards-'));
  try {
    const options = { includeProjectDirectory: true }, command = 'example-tool --check';
    for (const [name, body, error] of [
      ['auth.py', '# Sensitive source name.\n', /hidden, credential and Vault paths/],
      ['.private.py', '# Hidden source name.\n', /hidden, credential and Vault paths/],
      ['example.py', 'password = "synthetic-private-value"\n', /credential-named literal assignment/],
      ['example.yml', '$ANSIBLE_VAULT;1.1;AES256\nsynthetic-body\n', /Vault marker/],
      ['example.py', 'x'.repeat(500001), /500000 bytes/],
      ['example.ini', 'ordinary=true\n', /unsupported file types/],
    ]) {
      await writeFile(join(cwd, name), body);
      await assert.rejects(inspectApprovalSource(cwd, command, name, 1, options), error);
    }
    await writeFile(join(cwd, 'actual.py'), '# Ordinary synthetic source.\n');
    await symlink(join(cwd, 'actual.py'), join(cwd, 'linked.py'));
    await assert.rejects(inspectApprovalSource(cwd, command, 'linked.py', 1, options), /symlinks/);
    await assert.rejects(inspectApprovalSource(cwd, command, './actual.py', 1, options), /hidden, credential and Vault paths/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('the explicit Vault read option skips only Vault markers and keeps default sanitizers strict', () => {
  const options = { allowVaultMarkers: true };
  for (const [extension, content] of [
    ['.js', 'assert(output.includes("$ANSIBLE_VAULT;"));\n// !vault fixture marker\n'],
    ['.py', '# $ANSIBLE_VAULT; is expected in this fixture\nassert "!vault" in output\n'],
    ['.yml', '$ANSIBLE_VAULT;1.1;AES256\n61626364656630313233343536373839\n'],
    ['.yaml', 'value: !vault |\n  61626364656630313233343536373839\n'],
    ['.json', '{"value":"\\u0024ANSIBLE_VAULT;1.1;AES256","nested":["\\u0021vault"]}'],
  ]) {
    assert.equal(sourceCredentialReason(content, extension), 'Vault marker');
    assert.equal(sourceContainsCredentials(content, extension), true);
    assert.equal(sourceCredentialReason(content, extension, options), null);
    assert.equal(sourceContainsCredentials(content, extension, options), false);
    assert.equal(sourceCredentialReason(content, extension), 'Vault marker', 'an opt-in read cannot change later strict sanitizer calls');
  }
  for (const [extension, content, reason] of [
    ['.py', '$ANSIBLE_VAULT;\n-----BEGIN SYNTHETIC PRIVATE KEY-----\n', 'private-key marker'],
    ['.py', '!vault $ANSIBLE_VAULT; !vault ghp_synthetic_marker_example_not_real', 'provider-token marker'],
    ['.py', 'ghp_synthetic_marker_example_not_real !vault', 'provider-token marker'],
    ['.py', '$ANSIBLE_VAULT;\0', 'binary data'],
    ['.json', '{"value":"\\u0024ANSIBLE_VAULT; \\u0067hp_synthetic_marker_example_not_real"}', 'provider-token marker'],
    ['.json', '{"value":"$ANSIBLE_VAULT;","nested":[{"pass\\u0077ord":"synthetic-private-value"}]}', 'credential-named JSON field'],
    ['.json', '{"password":"$ANSIBLE_VAULT;1.1;AES256"}', 'credential-named JSON field'],
    ['.py', '# $ANSIBLE_VAULT;\npassword = "synthetic-private-value"\n', 'credential-named literal assignment'],
    ['.yaml', 'password: !vault |\n  61626364656630313233343536373839\n', 'credential-named literal assignment'],
  ]) {
    assert.equal(sourceCredentialReason(content, extension, options), reason);
    assert.equal(sourceContainsCredentials(content, extension, options), true);
  }
});

test('Vault-marker source reads expose bounded original text without decryption or relaxing file binding and limits', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-marker-reading-'));
  try {
    const options = { allowVaultMarkers: true }, name = 'example.py', path = join(cwd, name), command = 'python3 ' + name;
    const body = 'assert "!vault" in output\n# $ANSIBLE_VAULT;1.1;AES256\n';
    await writeFile(path, body);
    await assert.rejects(inspectApprovalSource(cwd, command, name), /Reason: Vault marker/);
    const source = await inspectApprovalSource(cwd, command, name, 1, options);
    assert.equal(source.text, body); assert.equal(source.path, path); assert.match(source.sha256, /^[a-f0-9]{64}$/); assert.match(source.commandSha256, /^[a-f0-9]{64}$/);
    await assert.rejects(inspectApprovalSource(cwd, 'unrelated-command', name, 1, options), /not referenced/);
    await writeFile(path, '$ANSIBLE_VAULT;1.1;AES256\n61626364656630313233343536373839\n');
    assert.notEqual((await inspectApprovalSource(cwd, command, name, 1, options)).sha256, source.sha256);
    await writeFile(path, '$ANSIBLE_VAULT;\nghp_synthetic_marker_example_not_real\n');
    await assert.rejects(inspectApprovalSource(cwd, command, name, 1, options), /provider-token marker/);
    await writeFile(path, 'x'.repeat(500001));
    await assert.rejects(inspectApprovalSource(cwd, command, name, 1, options), /500000 bytes/);
    await writeFile(join(cwd, 'vault-example.py'), body);
    await assert.rejects(inspectApprovalSource(cwd, 'cat vault-example.py', 'vault-example.py', 1, options), /hidden, credential and Vault paths/);
    await rm(path); await writeFile(join(cwd, 'actual.py'), body); await symlink(join(cwd, 'actual.py'), path);
    await assert.rejects(inspectApprovalSource(cwd, command, name, 1, options), /symlinks/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('a deployment read-all policy permits local text across content, path, extension and reference exclusions without executing it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ccng-policy-source-'));
  try {
    const cwd = join(root, 'worker'), external = join(root, '.private', 'credentials');
    await mkdir(cwd); await mkdir(external, { recursive: true });
    const marker = join(root, 'must-not-exist');
    const body = `password = "synthetic-fixture-value"\n# !vault $ANSIBLE_VAULT;1.1;AES256\n-----BEGIN SYNTHETIC PRIVATE KEY-----\nfrom pathlib import Path\nPath(${JSON.stringify(marker)}).write_text("must not run")\n`;
    const path = join(external, 'auth-token.conf'); await writeFile(path, body);
    const options = { sourceReading: 'all' }, command = 'example-tool --check';
    await assert.rejects(inspectApprovalSource(cwd, command, path), /hidden, credential and Vault paths/);
    const source = await inspectApprovalSource(cwd, command, path, 1, options);
    assert.equal(source.text, body); assert.equal(source.path, path); assert.equal(source.workingDirectory, cwd);
    assert.equal(source.sha256, createHash('sha256').update(body).digest('hex'));
    assert.equal(source.commandSha256, createHash('sha256').update(command).digest('hex'));
    assert.equal((await readSourceText(path, 1, options)).text, body);
    assert.equal(sourceContainsCredentials(body, '.py'), true, 'read-all does not mutate strict sanitizers');
    const changedCommand = await inspectApprovalSource(cwd, command + ' --verbose', path, 1, options);
    assert.equal(changedCommand.sha256, source.sha256); assert.notEqual(changedCommand.commandSha256, source.commandSha256);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('source reading remains conservative unless the normalized policy explicitly selects all', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-policy-default-'));
  try {
    const ordinary = join(cwd, 'example.py');
    for (const options of [{}, { sourceReading: 'restricted' }, { sourceReading: 'ALL' }]) {
      await writeFile(ordinary, 'password = "synthetic-fixture-value"\n');
      await assert.rejects(inspectApprovalSource(cwd, 'python3 example.py', ordinary, 1, options), /credential material/);
      await writeFile(ordinary, '# !vault $ANSIBLE_VAULT;1.1;AES256\n');
      await assert.rejects(readSourceText(ordinary, 1, options), /Vault marker/);
      await writeFile(ordinary, '# Ordinary source.\n');
      await assert.rejects(inspectApprovalSource(cwd, 'unrelated-tool', ordinary, 1, options), /not referenced/);
      const unsupported = join(cwd, 'example.conf'); await writeFile(unsupported, '# Ordinary text.\n');
      await assert.rejects(inspectApprovalSource(cwd, 'cat example.conf', unsupported, 1, options), /unsupported file types/);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('read-all still refuses invalid UTF-8, NUL data, oversized files, long lines and invalid line positions', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-policy-text-limits-'));
  try {
    const path = join(cwd, 'source'), options = { sourceReading: 'all' };
    for (const [body, expected] of [
      [Buffer.from([0xff, 0xfe, 0x41]), /UTF-8/],
      ['ordinary\0text', /binary data/],
      ['x'.repeat(500001), /500000 bytes/],
      ['x'.repeat(16001), /line too large/],
    ]) {
      await writeFile(path, body);
      await assert.rejects(inspectApprovalSource(cwd, 'unrelated-tool', path, 1, options), expected);
    }
    await writeFile(path, 'ordinary text');
    for (const line of [0, -1, 1.5, '1', NaN]) await assert.rejects(readSourceText(path, line, options), /starting line/);
    for (const path of ['relative-file', '/tmp/../etc/example', '/tmp/invalid\nfile', 'https://example.invalid/file']) {
      await assert.rejects(readSourceText(path, 1, options), /absolute local file path/);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('source paging advances at the exact character limit without losing lines', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-source-page-boundary-'));
  try {
    const path = join(cwd, 'example.py');
    for (const sourceReading of ['restricted', 'all']) {
      for (const length of [15999, 16000]) {
        const lines = ['first', 'x'.repeat(length), 'last'];
        await writeFile(path, lines.join('\n'));
        const pages = []; let startLine = 1;
        while (startLine !== null) {
          const page = await readSourceText(path, startLine, { sourceReading });
          assert.ok(page.text.length <= 16000);
          assert.ok(page.nextStartLine === null || page.nextStartLine > startLine, 'paging must advance');
          pages.push(page.text); startLine = page.nextStartLine;
        }
        assert.equal(pages.join('\n'), lines.join('\n'));
      }
      await writeFile(path, 'x'.repeat(16001));
      await assert.rejects(readSourceText(path, 1, { sourceReading }), /line too large/);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('read-all retains bounded paging and hashes of the original local bytes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-policy-source-pages-'));
  try {
    const path = join(cwd, 'source'), options = { sourceReading: 'all' };
    const lines = Array.from({ length: 200 }, (_, index) => `line ${index + 1}`), body = lines.join('\n');
    await writeFile(path, body);
    const first = await readSourceText(path, 1, options), last = await readSourceText(path, first.nextStartLine, options);
    assert.equal(first.text, lines.slice(0, 160).join('\n')); assert.equal(first.nextStartLine, 161);
    assert.equal(last.text, lines.slice(160).join('\n')); assert.equal(last.nextStartLine, null);
    assert.equal(first.totalLines, 200); assert.equal(first.sha256, last.sha256);
    await writeFile(path, body + '\nchanged');
    assert.notEqual((await readSourceText(path, 1, options)).sha256, first.sha256);
    const unicode = '\ufeffOriginal UTF-8 text: \u00e9\n'; await writeFile(path, unicode);
    assert.equal((await readSourceText(path, 1, options)).text, unicode, 'text inspection preserves original BOM and Unicode');
    await writeFile(path, Array.from({ length: 100 }, () => 'x'.repeat(999)).join('\n'));
    const bounded = await readSourceText(path, 1, options);
    assert.ok(bounded.text.length <= 16000); assert.equal(bounded.nextStartLine, 17);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('read-all rejects file and ancestor symlinks, directories and nonblocking FIFOs', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-policy-file-types-'));
  try {
    const options = { sourceReading: 'all' }, actual = join(cwd, 'actual');
    await writeFile(actual, 'ordinary text');
    await symlink(actual, join(cwd, 'linked'));
    await assert.rejects(readSourceText(join(cwd, 'linked'), 1, options), /symlinks/);
    await mkdir(join(cwd, 'directory')); await writeFile(join(cwd, 'directory', 'source'), 'ordinary text');
    await symlink(join(cwd, 'directory'), join(cwd, 'linked-directory'));
    await assert.rejects(readSourceText(join(cwd, 'linked-directory', 'source'), 1, options), /symlinks/);
    await assert.rejects(readSourceText(join(cwd, 'directory'), 1, options), /regular helper source/);
    if (process.platform !== 'win32') {
      const fifo = join(cwd, 'fifo'); await promisify(execFile)('mkfifo', [fifo]);
      await assert.rejects(readSourceText(fifo, 1, options), /regular helper source/);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
