import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../installer/prerequisites.sh', import.meta.url));
const source = fileURLToPath(new URL('..', import.meta.url));
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'ccng-prerequisite-')); const bin = join(dir, 'bin'); await mkdir(bin);
  return { dir, bin, log: join(dir, 'calls'), env: { ...process.env, PATH: bin + ':' + process.env.PATH, CCNG_TEST_LOG: join(dir, 'calls') }, write: (name, text) => writeFile(join(bin, name), '#!/bin/sh\n' + text + '\n', { mode: 0o755 }), close: () => rm(dir, { recursive: true, force: true }) };
}

test('noninteractive and check-only RPM requests never invoke sudo', async () => {
  const f = await fixture();
  try {
    await f.write('sudo', 'echo UNEXPECTED > "$CCNG_TEST_LOG"'); await f.write('dnf', 'exit 0');
    for (const mode of ['0', '1']) await assert.rejects(execute('sh', ['-c', 'CCNG_CHECK_ONLY=$2; CCNG_RHEL9=1; . "$1"; ccng_rpm_install git', 'sh', helper, mode], { env: f.env }), error => error.code === 1 && error.stderr.includes('not approved'));
    await assert.rejects(stat(f.log), { code: 'ENOENT' });
  } finally { await f.close(); }
});

test('an approved CLI installation uses only the staged target and fixed package', async () => {
  const f = await fixture();
  try {
    await f.write('npm', 'printf "%s\\n" "$@" > "$CCNG_TEST_LOG"');
    const stage = join(f.dir, 'stage with spaces'); const target = join(f.dir, 'target with spaces');
    await execute('sh', ['-c', 'CCNG_CHECK_ONLY=0; CCNG_STAGE=$2; CCNG_INSTALL_DIR=$3; . "$1"; ccng_confirm() { return 0; }; ccng_cli_install @beads/bd@1.3.2', 'sh', helper, stage, target], { env: f.env });
    assert.deepEqual((await readFile(f.log, 'utf8')).trimEnd().split('\n'), ['install', '--prefix', join(stage, 'app/tools'), '--no-fund', '--no-audit', '@beads/bd@1.3.2']);
  } finally { await f.close(); }
});

test('deferred Codex login keeps installation possible and hides authentication output', async () => {
  const f = await fixture();
  try {
    await f.write('bd', 'case "$*" in *version*) echo "bd version 1.3.2" ;; *) echo "--json --readonly --brief --flat" ;; esac');
    await f.write('codex', 'case "$*" in "login status") echo SYNTHETIC-PRIVATE-AUTH >&2; exit 1 ;; *) exit 0 ;; esac');
    const result = await execute('sh', ['-c', 'CCNG_CHECK_ONLY=0; CCNG_SOURCE_DIR=$2; . "$1"; ccng_confirm() { return 1; }; ccng_agent_prerequisites; [ "$CCNG_LOGIN_PENDING" = 1 ]', 'sh', helper, source], { env: f.env });
    assert.ok(result.stderr.includes('agent operation still requires')); assert.ok(!result.stdout.includes('SYNTHETIC-PRIVATE-AUTH')); assert.ok(!result.stderr.includes('SYNTHETIC-PRIVATE-AUTH'));
  } finally { await f.close(); }
});

test('check-only reports an unsupported Node without running an installer', async () => {
  const f = await fixture();
  try {
    await f.write('node', 'case "$1" in -e) exit 1 ;; *) exit 0 ;; esac'); await f.write('npm', 'echo 10.9.2');
    await f.write('bd', 'exit 0'); await f.write('codex', 'exit 0'); await f.write('sudo', 'echo UNEXPECTED > "$CCNG_TEST_LOG"');
    await assert.rejects(execute('sh', ['-c', 'CCNG_CHECK_ONLY=1; CCNG_SOURCE_DIR=$2; . "$1"; ccng_environment_report', 'sh', helper, source], { env: f.env }), error => error.code === 1 && error.stdout.includes('[unsupported] Node.js'));
    await assert.rejects(stat(f.log), { code: 'ENOENT' });
  } finally { await f.close(); }
});
