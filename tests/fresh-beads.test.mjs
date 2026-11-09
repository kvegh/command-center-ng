import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../installer/beads.sh', import.meta.url));
const prerequisites = fileURLToPath(new URL('../installer/prerequisites.sh', import.meta.url));
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'ccng-fresh-beads-'));
  const bin = join(dir, 'bin'); const workspace = join(dir, 'task workspace');
  const target = join(dir, 'app target'); const stage = join(dir, 'stage');
  for (const path of [bin, workspace, target, stage]) await mkdir(path);
  const env = { ...process.env, HOME: dir, XDG_CONFIG_HOME: join(dir, 'config'), PATH: bin + ':' + process.env.PATH, CCNG_TEST_LOG: join(dir, 'calls') };
  for (const key of Object.keys(env)) if (/^(BEADS_|BD_)/.test(key)) delete env[key];
  const write = (name, text) => writeFile(join(bin, name), '#!/bin/sh\nset -eu\n' + text + '\n', { mode: 0o755 });
  await write('bd', `printf '%s\\n' "$*" >> "$CCNG_TEST_LOG"
case "$*" in
  '--readonly where --json') [ "\${CCNG_TEST_EXISTING:-0}" = 1 ] ;;
  'init --help') echo '--shared-server --non-interactive --skip-agents --skip-hooks' ;;
  'init --shared-server --non-interactive --skip-agents --skip-hooks') mkdir .beads; printf 'synthetic native metadata' > .beads/metadata.json; [ "\${CCNG_TEST_INIT_FAIL:-0}" = 0 ] ;;
  '--readonly list --json --brief --flat --limit 1') echo '[]' ;;
  *) exit 98 ;;
esac`);
  await write('dolt', `case "$*" in version) echo 'dolt version 2.2.0' ;; 'sql-server --help') exit 0 ;; *) echo UNEXPECTED_SERVER_ACTION >> "$CCNG_TEST_LOG"; exit 99 ;; esac`);
  const run = (body, extraEnv = {}) => execute('sh', ['-c', 'set -eu; CCNG_CHECK_ONLY=0; CCNG_TASK_WORKSPACE=$3; CCNG_INITIAL_WORK_DIR=$3; CCNG_INSTALL_DIR=$4; CCNG_STAGE=$5; . "$1"; . "$2"; ' + body, 'sh', prerequisites, helper, workspace, target, stage], { cwd: workspace, env: { ...env, ...extraEnv } });
  return { dir, bin, workspace, target, stage, env, write, run, calls: async () => (await readFile(join(dir, 'calls'), 'utf8')).trimEnd().split('\n'), close: () => rm(dir, { recursive: true, force: true }) };
}

test('fresh setup delegates to native shared-server init only after confirmation and checks the resulting tracker', async () => {
  const f = await fixture();
  try {
    const result = await f.run('ccng_confirm() { return 0; }; ccng_beads_setup');
    assert.equal(await readFile(join(f.workspace, '.beads/metadata.json'), 'utf8'), 'synthetic native metadata');
    assert.deepEqual(await f.calls(), ['--readonly where --json', 'init --help', 'init --shared-server --non-interactive --skip-agents --skip-hooks', '--readonly list --json --brief --flat --limit 1']);
    assert.match(result.stdout, /native local shared Dolt server verified/);
    assert.equal((await stat(join(f.workspace, '.beads'))).mode & 0o077, 0, 'fresh native setup inherits a private umask');
  } finally { await f.close(); }
});

test('existing trackers and redirected or partial configurations never initialize or change a server', async () => {
  const f = await fixture();
  try {
    const existing = await f.run('ccng_confirm() { exit 90; }; ccng_beads_setup', { CCNG_TEST_EXISTING: '1' });
    assert.match(existing.stdout, /Existing Beads tracker found/);
    await mkdir(join(f.dir, '.beads')); await writeFile(join(f.dir, '.beads/redirect'), '/synthetic/parent/tracker');
    const partial = await f.run('ccng_confirm() { exit 90; }; ccng_beads_setup; [ "$CCNG_BEADS_SETUP_PENDING" = 1 ]');
    assert.match(partial.stderr, /Existing Beads configuration or routing/);
    assert.ok((await f.calls()).every(call => call === '--readonly where --json'));
    assert.equal(await readFile(join(f.dir, '.beads/redirect'), 'utf8'), '/synthetic/parent/tracker');
  } finally { await f.close(); }
});

test('native home telemetry alone preserves its files and permits the selected fresh workspace', async () => {
  const f = await fixture();
  try {
    const telemetry = join(f.dir, '.beads');
    await mkdir(join(telemetry, 'eventsData'), { recursive: true });
    await writeFile(join(telemetry, 'machine-id'), 'synthetic telemetry identity');
    await writeFile(join(telemetry, 'eventsData', 'pending.evtq'), 'synthetic event');
    await f.run('ccng_confirm() { return 0; }; ccng_beads_setup');
    assert.equal(await readFile(join(f.workspace, '.beads/metadata.json'), 'utf8'), 'synthetic native metadata');
    assert.equal(await readFile(join(telemetry, 'machine-id'), 'utf8'), 'synthetic telemetry identity');
    assert.equal(await readFile(join(telemetry, 'eventsData', 'pending.evtq'), 'utf8'), 'synthetic event');
    assert.equal((await f.calls()).filter(call => call.startsWith('init --shared-server')).length, 1);
  } finally { await f.close(); }
});

test('ambient connection selection, declined setup and check-only do not initialize a tracker', async () => {
  const f = await fixture();
  try {
    const configured = await f.run('ccng_confirm() { exit 90; }; ccng_beads_setup', { BEADS_DOLT_SERVER_HOST: 'existing.example.invalid' });
    assert.match(configured.stderr, /Existing Beads configuration/);
    const declined = await f.run('ccng_beads_setup; [ "$CCNG_BEADS_SETUP_PENDING" = 1 ]');
    assert.match(declined.stdout, /not approved/);
    await f.run('CCNG_CHECK_ONLY=1; ccng_confirm() { exit 90; }; ccng_beads_setup');
    assert.ok((await f.calls()).every(call => call === '--readonly where --json'));
    await assert.rejects(stat(join(f.workspace, '.beads')), { code: 'ENOENT' });
  } finally { await f.close(); }
});

test('a failed native initialization is reported without a readiness check or destructive retry', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.run('ccng_confirm() { return 0; }; ccng_beads_setup', { CCNG_TEST_INIT_FAIL: '1' }), error => error.code === 1 && /setup did not finish/.test(error.stderr));
    assert.equal(await readFile(join(f.workspace, '.beads/metadata.json'), 'utf8'), 'synthetic native metadata');
    assert.equal((await f.calls()).filter(call => call.startsWith('init --shared-server')).length, 1);
    assert.equal((await f.calls()).some(call => call.startsWith('--readonly list')), false);
  } finally { await f.close(); }
});

test('blank workspace selection explains how to finish later in the same custom installation without creating a tracker', async () => {
  const f = await fixture();
  try {
    const result = await f.run('CCNG_TASK_WORKSPACE=""; CCNG_SOURCE_DIR=$CCNG_INITIAL_WORK_DIR; ccng_beads_setup; [ "$CCNG_BEADS_SETUP_PENDING" = 1 ]');
    assert.match(result.stdout, /application is installed/);
    assert.match(result.stdout, /same ordinary account \(no sudo\)/);
    assert.ok(result.stdout.includes('mkdir -p "$HOME/ccng-wd"'), result.stdout);
    assert.ok(result.stdout.includes("sh '" + f.workspace + "/install.sh' --workspace \"$HOME/ccng-wd\" --prefix '" + f.target + "'"));
    assert.ok(result.stdout.includes("export PATH='" + f.target + "/tools/bin':'" + f.target + '/tools/node_modules/.bin\':"$PATH"'));
    assert.ok((await f.calls()).every(call => call === '--readonly where --json'));
    await assert.rejects(stat(join(f.workspace, '.beads')), { code: 'ENOENT' });
    await assert.rejects(stat(join(f.dir, 'ccng-wd')), { code: 'ENOENT' });
  } finally { await f.close(); }
});

test('an accidental yes response is rejected as a path and gives safe retry instructions without creating it', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.run('CCNG_TASK_WORKSPACE=y; CCNG_INSTALL_DIR="${CCNG_INSTALL_DIR}/owner\'s folder"; ccng_beads_setup'), error => {
      assert.equal(error.code, 1); assert.match(error.stderr, /existing directory path, not yes\/no/);
      assert.match(error.stdout, /setup state was preserved/);
      assert.ok(error.stdout.includes('--workspace "$HOME/ccng-wd" --prefix '), error.stdout);
      assert.ok(error.stdout.includes("owner'\\''s folder'"), 'printed shell arguments escape apostrophes');
      return true;
    });
    await assert.rejects(stat(join(f.workspace, 'y')), { code: 'ENOENT' });
    await assert.rejects(stat(join(f.workspace, '.beads')), { code: 'ENOENT' });
  } finally { await f.close(); }
});

test('missing Dolt download is pinned and verified before copying; a bad checksum leaves no installed binary', async () => {
  const f = await fixture();
  try {
    await rm(join(f.bin, 'dolt'));
    // Keep this fixture independent of any installed global Dolt.
    await f.write('uname', 'echo x86_64');
    await f.write('curl', 'printf "%s\\n" "$*" >> "$CCNG_TEST_LOG"; cp "$CCNG_TEST_ARCHIVE" dolt.tar.gz');
    await f.write('sha256sum', 'read -r checksum filename; [ "$checksum" = 1f7ad8c2622995789420a3fb0f2d16b4aa7430000a825dd91d5938f36480cbf6 ]; [ "$filename" = dolt.tar.gz ]; [ "\${CCNG_TEST_BAD_SHA:-0}" = 0 ]');
    const archiveDir = join(f.dir, 'archive'); await mkdir(join(archiveDir, 'dolt-linux-amd64/bin'), { recursive: true });
    await writeFile(join(archiveDir, 'dolt-linux-amd64/bin/dolt'), '#!/bin/sh\ncase "$*" in version) echo "dolt version 2.2.0" ;; "sql-server --help") exit 0 ;; *) exit 99 ;; esac\n', { mode: 0o755 });
    const archive = join(f.dir, 'archive.tar.gz'); await execute('tar', ['-czf', archive, 'dolt-linux-amd64/bin/dolt'], { cwd: archiveDir });
    const body = 'command() { if [ "$1" = -v ] && [ "$2" = dolt ]; then return 1; fi; /bin/sh -c \'command -v "$1"\' sh "$2"; }; ccng_confirm() { return 0; }; ccng_dolt_install';
    await assert.rejects(f.run(body, { CCNG_TEST_ARCHIVE: archive, CCNG_TEST_BAD_SHA: '1' }), error => error.code === 1 && /installation failed/.test(error.stderr));
    await assert.rejects(stat(join(f.target, 'tools/bin/dolt')), { code: 'ENOENT' });
    await f.run(body, { CCNG_TEST_ARCHIVE: archive });
    assert.equal((await stat(join(f.target, 'tools/bin/dolt'))).mode & 0o777, 0o755);
    const calls = await f.calls();
    assert.ok(calls.every(call => call.includes('https://github.com/dolthub/dolt/releases/download/v2.2.0/dolt-linux-amd64.tar.gz')));
    assert.ok(calls.every(call => call.includes('--proto =https --tlsv1.2')));
  } finally { await f.close(); }
});
