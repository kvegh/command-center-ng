import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeOptions, runtimeHelp, listeningMessage } from '../server/main.mjs';

const run = promisify(execFile);
const main = fileURLToPath(new URL('../server/main.mjs', import.meta.url));

test('omitted host remains unset for automatic route selection rather than a loopback override', () => {
  const options = runtimeOptions([], {});
  assert.equal(options.host, undefined);
  assert.equal(options.port, '4242');
  assert.equal(options.protocol, 'http');
  assert.equal(runtimeOptions([], { CCNG_HOST: '' }).host, undefined);
});

test('explicit CLI and saved environment addresses retain precedence and other options', () => {
  const env = { CCNG_HOST: '127.0.0.1', CCNG_PORT: '4545', CCNG_PUBLIC_ORIGIN: 'https://command-center.example' };
  assert.equal(runtimeOptions([], env).host, '127.0.0.1');
  const options = runtimeOptions(['--host', '192.0.2.15', '--port', '4243', '--cwd', '/example/project'], env);
  assert.equal(options.host, '192.0.2.15'); assert.equal(options.port, '4243');
  assert.equal(options.cwd, '/example/project'); assert.equal(options['public-origin'], env.CCNG_PUBLIC_ORIGIN);
  assert.equal(runtimeOptions(['--host', ''], env).host, '', 'an explicitly invalid empty argument is not automatic mode');
});

test('HTTP is the user-facing default and HTTPS/TLS settings are explicit overrides', () => {
  assert.equal(runtimeOptions([], {}).protocol, 'http');
  assert.equal(runtimeOptions([], { CCNG_PROTOCOL: 'http' }).protocol, 'http');
  const options = runtimeOptions(['--protocol', 'https', '--tls-cert', '/example/cert.pem', '--tls-key', '/example/key.pem'], { CCNG_PROTOCOL: 'http', CCNG_TLS_CERT: '/example/old.pem' });
  assert.equal(options.protocol, 'https'); assert.equal(options['tls-cert'], '/example/cert.pem'); assert.equal(options['tls-key'], '/example/key.pem');
});

test('concern worker options validate the effective CLI or environment value without inventing a destination', () => {
  assert.equal(runtimeOptions([], {})['concern-review-worker'], undefined);
  assert.equal(runtimeOptions([], { CCNG_CONCERN_REVIEW_WORKER: 'worker-env' })['concern-review-worker'], 'worker-env');
  assert.equal(runtimeOptions(['--concern-review-worker', 'worker-cli'], { CCNG_CONCERN_REVIEW_WORKER: 'invalid/value' })['concern-review-worker'], 'worker-cli');
  assert.equal(runtimeOptions(['--concern-review-worker', 'disabled'], { CCNG_CONCERN_REVIEW_WORKER: 'worker-env' })['concern-review-worker'], 'disabled');
  for (const value of ['', 'invalid/value', 'constructor', 'prototype', 'coordinator', 'a'.repeat(129)]) {
    assert.throws(() => runtimeOptions(['--concern-review-worker', value], {}), /concern_review_worker/);
    assert.throws(() => runtimeOptions([], { CCNG_CONCERN_REVIEW_WORKER: value }), /concern_review_worker/);
  }
});

test('startup stdout identifies the resolved interface, actual address and selection mode', () => {
  const automatic = listeningMessage({ host: '192.0.2.15', interfaceName: 'example0', automatic: true }, 4242);
  assert.match(automatic, /http:\/\/192\.0\.2\.15:4242/);
  assert.match(automatic, /interface: example0; automatic default IPv4 route/);
  const companion = listeningMessage({ host: '192.0.2.15', interfaceName: 'example0', automatic: true }, 4242, '127.0.0.1');
  assert.match(companion, /http:\/\/127\.0\.0\.1:4242/);
  assert.match(companion, /interface: loopback; automatic loopback companion/);
  assert.match(listeningMessage({ host: '0.0.0.0', interfaceName: null, automatic: false }, 4545), /all IPv4 interfaces; explicit --host\/CCNG_HOST/);
  assert.match(listeningMessage({ host: 'localhost', interfaceName: null, automatic: false }, 4242, '::1'), /http:\/\/\[::1\]:4242/);
});

test('usage documents automatic defaults, optional overrides, environment and systemd logging', () => {
  const help = runtimeHelp();
  for (const pattern of [/\[--host ADDRESS\]/, /default-route IPv4 interface/, /127\.0\.0\.1 on the same port/, /one listening address/, /127\.0\.0\.1: local only/, /0\.0\.0\.0: all IPv4 interfaces/, /CCNG_HOST/, /--concern-review-worker ID\|disabled/, /concern_review_worker/, /CCNG_CONCERN_REVIEW_WORKER/, /does not answer native approvals/, /CLI options take precedence/, /systemd records stdout/, /does not configure firewall/, /service help/]) assert.match(help, pattern);
});

test('real long and short help run without routing, authentication or workspace initialization', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-help-'));
  try {
    for (const option of ['--help', '-h']) {
      const result = await run(process.execPath, [main, option], { cwd: directory, env: { ...process.env, PATH: '', CCNG_CONFIG_DIR: directory, CCNG_HOST: '', CODEX_HOME: directory }, timeout: 10000 });
      assert.match(result.stdout, /Usage: command-center-ng/);
      assert.match(result.stdout, /default-route IPv4 interface/);
      assert.doesNotMatch(result.stdout, /listening on/);
    }
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('invalid ports fail before route selection or password/runtime startup', async () => {
  await assert.rejects(run(process.execPath, [main, '--port', '0'], { env: { ...process.env, PATH: '', CCNG_HOST: '' }, timeout: 10000 }), error => {
    assert.equal(error.code, 1); assert.match(error.stderr, /Choose a port from 1 to 65535/);
    assert.doesNotMatch(error.stderr, /password first|ip command|default route/i); return true;
  });
});

test('invalid concern destinations fail before routing, authentication or native startup', async () => {
  await assert.rejects(run(process.execPath, [main, '--concern-review-worker', 'invalid/value'], { env: { ...process.env, PATH: '', CCNG_HOST: '' }, timeout: 10000 }), error => {
    assert.equal(error.code, 1); assert.match(error.stderr, /concern_review_worker.*worker ID/);
    assert.doesNotMatch(error.stderr, /password first|ip command|default route|listening on/i); return true;
  });
});

test('explicit HTTPS without certificates fails clearly instead of starting HTTP or loading a profile', async () => {
  await assert.rejects(run(process.execPath, [main, '--host', '127.0.0.1', '--protocol', 'https'], { env: { ...process.env, CCNG_PROTOCOL: '', CCNG_TLS_CERT: '', CCNG_TLS_KEY: '' }, timeout: 10000 }), error => {
    assert.equal(error.code, 1); assert.match(error.stderr, /HTTPS requires both/); assert.match(error.stderr, /--tls-cert/);
    assert.doesNotMatch(error.stderr, /password first|listening on/i); return true;
  });
});
