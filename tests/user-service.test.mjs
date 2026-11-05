import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { userService, serviceUnit, USER_SERVICE } from '../server/user-service.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ccng-user-service-'));
  const appDir = join(root, 'app with % and $ signs'); await mkdir(appDir);
  await writeFile(join(appDir, 'command-center-ng'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const calls = []; let status = 0;
  const env = { HOME: root, PATH: '/usr/bin:/bin', CODEX_HOME: join(root, 'native-profile'), CLAUDE_CONFIG_DIR: join(root, 'claude-profile'), ANTHROPIC_API_KEY: 'synthetic-test-only' };
  const options = { appDir, env, run: (command, args) => { calls.push({ command, args }); return { status }; } };
  return { root, appDir, env, calls, options, path: join(root, '.config/systemd/user', USER_SERVICE), status: value => { status = value; }, close: () => rm(root, { recursive: true, force: true }) };
}

test('user service installation preserves runtime options and private profile without starting anything', async () => {
  const f = await fixture();
  try {
    assert.equal(await userService(['install', '--', '--cwd', f.root, '--host', '127.0.0.1', '--port', '4545', '--public-origin', 'https://command-center.example'], f.options), 0);
    const unit = await readFile(f.path, 'utf8');
    assert.match(unit, /Type=simple/); assert.match(unit, /WantedBy=default.target/);
    assert.match(unit, /KillSignal=SIGINT/); assert.match(unit, /Restart=on-failure/);
    assert.match(unit, /app with %% and \$ signs\/command-center-ng/);
    assert.match(unit, /"--cwd"/); assert.match(unit, /"--port" "4545"/);
    assert.ok(unit.includes('WorkingDirectory=' + f.root + '\n'));
    assert.ok(unit.includes('CODEX_HOME=' + f.env.CODEX_HOME));
    assert.ok(unit.includes('CLAUDE_CONFIG_DIR=' + f.env.CLAUDE_CONFIG_DIR));
    assert.ok(!unit.includes('ANTHROPIC_API_KEY')); assert.ok(!unit.includes('synthetic-test-only'));
    assert.equal((await stat(f.path)).mode & 0o777, 0o600);
    assert.deepEqual(f.calls, [{ command: 'systemctl', args: ['--user', 'daemon-reload'] }]);
    f.env.CODEX_HOME = join(f.root, 'different-profile');
    await userService(['install'], f.options);
    assert.equal(await readFile(f.path, 'utf8'), unit, 'repeated install without runtime options preserves the saved configuration');
  } finally { await f.close(); }
});

test('owned service lifecycle forwards only fixed user-level commands and exit status', async () => {
  const f = await fixture();
  try {
    await userService(['install'], f.options); f.calls.length = 0;
    for (const action of ['start', 'stop', 'restart', 'enable', 'disable']) assert.equal(await userService([action], f.options), 0);
    assert.ok(f.calls.every(call => call.command === 'systemctl' && call.args[0] === '--user' && call.args.at(-1) === USER_SERVICE));
    f.status(3); assert.equal(await userService(['status'], f.options), 3);
    f.status(0); await userService(['logs'], f.options);
    assert.deepEqual(f.calls.at(-1), { command: 'journalctl', args: ['--user', '-u', USER_SERVICE, '-n', '100', '--no-pager'] });
    await assert.rejects(userService(['start', '--host', '127.0.0.1'], f.options), /Only service install/);
    await userService(['uninstall'], f.options);
    assert.deepEqual(f.calls.slice(-2), [{ command: 'systemctl', args: ['--user', 'disable', '--now', USER_SERVICE] }, { command: 'systemctl', args: ['--user', 'daemon-reload'] }]);
    await assert.rejects(readFile(f.path), { code: 'ENOENT' });
  } finally { await f.close(); }
});

test('user service preserves explicit Beads routing without copying credentials or choosing a tracker', async () => {
  const f = await fixture();
  try {
    f.env.BEADS_DIR = join(f.root, 'existing tracker % $ directory', '.beads');
    f.env.BEADS_DOLT_SHARED_SERVER = '1';
    f.env.BEADS_DOLT_PASSWORD = 'synthetic-secret-not-for-unit';
    f.env.DOLT_PASSWORD = 'another-synthetic-secret';
    await userService(['install', '--', '--cwd', f.root], f.options);
    const unit = await readFile(f.path, 'utf8');
    assert.ok(unit.includes('Environment="BEADS_DIR=' + f.env.BEADS_DIR.replaceAll('%', '%%') + '"'));
    assert.ok(unit.includes('Environment="BEADS_DOLT_SHARED_SERVER=1"'));
    assert.doesNotMatch(unit, /BEADS_DOLT_PASSWORD|DOLT_PASSWORD|synthetic-secret|another-synthetic/);
    assert.deepEqual(f.calls, [{ command: 'systemctl', args: ['--user', 'daemon-reload'] }]);
    f.env.BEADS_DIR = join(f.root, 'different tracker', '.beads');
    await userService(['install'], f.options);
    assert.equal(await readFile(f.path, 'utf8'), unit, 'no-option install must not silently change the saved tracker');
    await userService(['install', '--', '--cwd', f.root], f.options);
    assert.ok((await readFile(f.path, 'utf8')).includes('BEADS_DIR=' + f.env.BEADS_DIR));
    const { BEADS_DIR, BEADS_DOLT_SHARED_SERVER, ...withoutRoute } = f.env;
    assert.doesNotMatch(serviceUnit(f.appDir, [], withoutRoute), /BEADS_DIR|BEADS_DOLT_SHARED_SERVER/);
  } finally { await f.close(); }
});

test('service management refuses unrelated or linked units and unsafe/unsupported options', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, '.config/systemd/user'), { recursive: true });
    await writeFile(f.path, '[Service]\nExecStart=/bin/true\n');
    for (const action of ['install', 'start', 'uninstall']) await assert.rejects(userService([action], f.options), /another application/);
    assert.equal(f.calls.length, 0);
    await rm(f.path); await symlink(join(f.appDir, 'command-center-ng'), f.path);
    await assert.rejects(userService(['install'], f.options), /linked/);
    await assert.rejects(userService(['run-arbitrary-command'], f.options), /Unknown/);
    for (const args of [['--port', '0'], ['--cwd', 'relative'], ['--public-origin', 'https://name:password@command-center.example'], ['--host', 'value\n[Unit]'], ['--dev']]) {
      assert.throws(() => serviceUnit(f.appDir, args, f.env));
    }
    const unit = serviceUnit(f.appDir, ['--host', '$(touch unintended)'], f.env);
    assert.ok(unit.includes('$$(touch unintended)')); assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});
