import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, mkdir, symlink, link, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DEFAULT_APPROVAL_POLICY, approvalPolicyFile, readApprovalPolicy } from '../server/approval-policy.mjs';

const policyText = (sourceReading = 'all', instructions = 'Review only authorized project work.') =>
  `version: 1\nsource_reading: ${sourceReading}\napproval_instructions: ${JSON.stringify(instructions)}\n`;

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-approval-policy-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'approval-policy.yml');
  return { directory, file, write: text => writeFile(file, text, { mode: 0o600 }) };
}

function assertManual(policy) {
  assert.equal(policy.sourceReading, 'restricted');
  assert.equal(policy.approvalEnabled, false);
  assert.equal(policy.instructions, '');
  assert.match(policy.error, /Automatic approvals are disabled/);
  assert.match(policy.sha256, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(policy.error, /CANARY|private-value/);
}

test('only an absent optional default retains conservative product approval rules', async t => {
  const f = await fixture(t);
  assert.equal(approvalPolicyFile(f.directory), join(f.directory, 'etc', 'approval-policy.yml'));
  assert.strictEqual(await readApprovalPolicy(f.file), DEFAULT_APPROVAL_POLICY);
  assert.equal(DEFAULT_APPROVAL_POLICY.sourceReading, 'restricted');
  assert.equal(DEFAULT_APPROVAL_POLICY.approvalEnabled, true);
  assert.equal(DEFAULT_APPROVAL_POLICY.error, null);
  assert.equal(Object.isFrozen(DEFAULT_APPROVAL_POLICY), true);
  assertManual(await readApprovalPolicy(f.file, { configured: true }));
});

test('YAML comments and multiline instructions produce the same normalized policy and hash', async t => {
  const f = await fixture(t);
  await f.write('# Local operator policy\nversion: 1\nsource_reading: all # explicit selection\napproval_instructions: |\n  First instruction.\n  Second instruction.\n');
  const result = await readApprovalPolicy(f.file, { configured: true });
  assert.equal(result.sourceReading, 'all');
  assert.equal(result.instructions, 'First instruction.\nSecond instruction.\n');
  assert.equal(result.approvalEnabled, true);
  assert.equal(result.error, null);
  await f.write(policyText('all', result.instructions));
  assert.equal((await readApprovalPolicy(f.file)).sha256, result.sha256, 'formatting is not a permission change');
  await f.write(policyText('restricted', result.instructions));
  assert.notEqual((await readApprovalPolicy(f.file)).sha256, result.sha256, 'source mode is part of the policy hash');
  await f.write(policyText('all', 'Different instruction.'));
  assert.notEqual((await readApprovalPolicy(f.file)).sha256, result.sha256, 'review instructions are part of the policy hash');
});

test('unknown, duplicate, missing and nonliteral YAML fields disable automatic approval', async t => {
  const f = await fixture(t);
  const invalid = [
    '', '[]', 'null', 'CANARY: private-value',
    policyText() + 'unknown: CANARY\n',
    policyText() + 'source_reading: restricted\n',
    'version: 1\nsource_reading: all\n',
    policyText().replace('version: 1', 'version: 2'),
    policyText().replace('version: 1', 'version: "1"'),
    policyText().replace('source_reading: all', 'source_reading: true'),
    policyText().replace('source_reading: all', 'source_reading: unrestricted'),
    policyText().replace(/approval_instructions:.*/, 'approval_instructions: [CANARY]'),
    policyText().replace(/approval_instructions:.*/, 'approval_instructions: null'),
    policyText().replace(/approval_instructions:.*/, 'approval_instructions: !unknown CANARY'),
    policyText().replace(/approval_instructions:.*/, 'approval_instructions: !!str CANARY'),
    policyText().replace(/approval_instructions:.*/, 'approval_instructions: &rule CANARY'),
    'version: 1\nsource_reading: &mode all\napproval_instructions: *mode\n',
    policyText() + '---\n' + policyText(),
    'version: 1\nsource_reading: all\napproval_instructions: "unterminated CANARY\n',
    policyText('all', 'CANARY\0'),
    policyText('all', 'x'.repeat(32_769)),
  ];
  for (const text of invalid) {
    await f.write(text);
    assertManual(await readApprovalPolicy(f.file, { configured: true }));
  }
});

test('existing invalid optional policy fails closed instead of reverting to product defaults', async t => {
  const f = await fixture(t);
  await f.write('source_reading: all\n');
  assertManual(await readApprovalPolicy(f.file));
});

test('nonprivate files, directories, hard links and symlinks cannot select read-all', async t => {
  const f = await fixture(t);
  await f.write(policyText());
  await chmod(f.file, 0o644);
  assertManual(await readApprovalPolicy(f.file));
  await chmod(f.file, 0o600);
  const linked = join(f.directory, 'linked.yml');
  await link(f.file, linked);
  assertManual(await readApprovalPolicy(f.file));
  await rm(linked);
  await symlink(f.file, linked);
  assertManual(await readApprovalPolicy(linked));
  await rm(linked);
  await symlink(join(f.directory, 'missing.yml'), linked);
  assertManual(await readApprovalPolicy(linked));
  const directory = join(f.directory, 'nested');
  await mkdir(directory, { mode: 0o700 });
  assertManual(await readApprovalPolicy(directory));
});

test('oversized and non-UTF8 policy data return only the fixed error', async t => {
  const f = await fixture(t);
  await f.write('CANARY'.repeat(11_000));
  assertManual(await readApprovalPolicy(f.file));
  await f.write(Buffer.from([0xff, 0xfe, 0x43, 0x41, 0x4e, 0x41, 0x52, 0x59]));
  assertManual(await readApprovalPolicy(f.file));
});

test('FIFO policy is rejected promptly without waiting for a writer', { timeout: 3000 }, async t => {
  const f = await fixture(t);
  await promisify(execFile)('mkfifo', [f.file]);
  assertManual(await readApprovalPolicy(f.file));
});
