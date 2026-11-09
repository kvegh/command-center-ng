import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../installer/prerequisites.sh', import.meta.url));
const script = `
CCNG_CHECK_ONLY=$3
CCNG_SOURCE_DIR=$2
CCNG_FIXTURE_CONSENT=$4
. "$1"
if [ "$CCNG_FIXTURE_CONSENT" != actual ]; then
    ccng_confirm() { printf '%s\\n' "$1" >> "$CCNG_FIXTURE_CONFIRM"; [ "$CCNG_FIXTURE_CONSENT" = yes ]; }
fi
ccng_agent_prerequisites
printf 'Login pending: %s\\n' "\${CCNG_LOGIN_PENDING:-0}"
`;

async function fixture(t, { signedIn = false, failLogin = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-installer-login-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bin = join(directory, 'bin'), source = join(directory, 'source');
  await mkdir(bin); await mkdir(join(source, 'server'), { recursive: true });
  await writeFile(join(source, 'server', 'beads-check.mjs'), 'process.exitCode = 0;\n');
  await writeFile(join(bin, 'bd'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await writeFile(join(bin, 'codex'), `#!/bin/sh
printf '%s\\n' "$*" >> "$CCNG_FIXTURE_CALLS"
case "$*" in
    --version) echo 'Codex CLI fixture' ;;
    'app-server daemon --help') : ;;
    'login status') echo 'SYNTHETIC-PRIVATE-STATUS' >&2; [ -f "$CCNG_FIXTURE_SIGNED_IN" ] ;;
    login|'login --device-auth') [ "$CCNG_FIXTURE_FAIL_LOGIN" = 0 ] || exit 19; : > "$CCNG_FIXTURE_SIGNED_IN" ;;
    *) echo 'Unexpected native command' >&2; exit 97 ;;
esac
`, { mode: 0o755 });
  const calls = join(directory, 'calls'), confirmation = join(directory, 'confirmation'), marker = join(directory, 'signed-in');
  if (signedIn) await writeFile(marker, '');
  return {
    async run({ choice = '', consent = 'yes', checkOnly = false } = {}) {
      const operation = execute('sh', ['-c', script, 'sh', helper, source, checkOnly ? '1' : '0', consent], {
        env: { ...process.env, PATH: bin + ':' + process.env.PATH, CCNG_FIXTURE_CALLS: calls, CCNG_FIXTURE_CONFIRM: confirmation, CCNG_FIXTURE_SIGNED_IN: marker, CCNG_FIXTURE_FAIL_LOGIN: failLogin ? '1' : '0' }, timeout: 5000,
      });
      operation.child.stdin.end(choice);
      const result = await operation;
      const commands = (await readFile(calls, 'utf8')).trim().split('\n');
      assert.ok(!result.stdout.includes('SYNTHETIC-PRIVATE-STATUS')); assert.ok(!result.stderr.includes('SYNTHETIC-PRIVATE-STATUS'));
      assert.ok(commands.every(command => ['--version', 'app-server daemon --help', 'login status', 'login', 'login --device-auth'].includes(command)), 'no logout, daemon start, settings change or install is permitted');
      return { ...result, commands, prompts: await readFile(confirmation, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; }) };
    },
  };
}

test('confirmed browser login is the default and explains the remote callback and separate app password', async t => {
  for (const choice of ['\n', '1\n']) {
    const f = await fixture(t), result = await f.run({ choice });
    assert.deepEqual(result.commands.filter(command => command === 'login' || command === 'login --device-auth'), ['login']);
    assert.match(result.prompts, /Sign in to Codex now/); assert.match(result.stdout, /Login pending: 0/);
    assert.match(result.stdout, /separate from your Command Center application password/);
    assert.match(result.stdout, /Browser .*recommended, default/);
    assert.match(result.stdout, /ssh -L 1455:localhost:1455 user@remote/);
    assert.match(result.stdout, /URL printed by codex login in your local browser/);
  }
});

test('device-code login runs only when explicitly selected and includes its organization policy caveat', async t => {
  const f = await fixture(t), result = await f.run({ choice: '2\n' });
  assert.deepEqual(result.commands.filter(command => command === 'login' || command === 'login --device-auth'), ['login --device-auth']);
  assert.match(result.stdout, /may be disabled by your organization/);
  assert.match(result.stdout, /Device code \(beta; requires permission/);
  assert.match(result.stdout, /Login pending: 0/);
});

test('skip, invalid choice, EOF and declined consent leave sign-in pending without starting authentication', async t => {
  for (const options of [{ choice: '3\n' }, { choice: 'other\n' }, { choice: '' }, { choice: '1\n', consent: 'no' }]) {
    const f = await fixture(t), result = await f.run(options);
    assert.ok(!result.commands.includes('login')); assert.ok(!result.commands.includes('login --device-auth'));
    assert.match(result.stdout, /Login pending: 1/);
    assert.match(result.stderr, /agent operation still requires codex login\./);
  }
});

test('noninteractive and check-only operation never launches login even with an approving input stream', async t => {
  for (const checkOnly of [false, true]) {
    const f = await fixture(t), result = await f.run({ consent: 'actual', choice: 'y\n2\n', checkOnly });
    assert.ok(!result.commands.includes('login')); assert.ok(!result.commands.includes('login --device-auth'));
    assert.match(result.stdout, /Login pending: 1/); assert.equal(result.prompts, '');
  }
});

test('failed native browser login does not fall back to device authentication or fail application installation', async t => {
  const f = await fixture(t, { failLogin: true }), result = await f.run({ choice: '1\n' });
  assert.deepEqual(result.commands.filter(command => command === 'login' || command === 'login --device-auth'), ['login']);
  assert.match(result.stderr, /browser login did not complete/); assert.match(result.stdout, /Login pending: 1/);
});

test('an existing Codex sign-in is preserved without offering or running a new login', async t => {
  const f = await fixture(t, { signedIn: true }), result = await f.run({ choice: '2\n' });
  assert.equal(result.prompts, ''); assert.ok(!result.commands.includes('login')); assert.ok(!result.commands.includes('login --device-auth'));
  assert.match(result.stdout, /Codex sign-in: available/); assert.match(result.stdout, /Login pending: 0/);
});
