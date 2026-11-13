import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { parseRuntimeConfig, readRuntimeConfig, runtimeConfigFile, normalizeConcernReviewWorker } from '../server/runtime-config.mjs';
import { loadRuntimeOptions, createApp } from '../server/main.mjs';
import { setPassword } from '../server/auth.mjs';
import { Workspace } from '../server/workspace.mjs';

async function fixture(t) {
  const appDir = await mkdtemp(join(tmpdir(), 'ccng-runtime-config-'));
  t.after(() => rm(appDir, { recursive: true, force: true }));
  await mkdir(join(appDir, 'etc'));
  const file = runtimeConfigFile(appDir);
  return { appDir, file, write: text => writeFile(file, text, { mode: 0o600 }) };
}

test('missing installed config and the normal commented template keep HTTP as default', async t => {
  const f = await fixture(t);
  assert.deepEqual(await readRuntimeConfig(f.file), {});
  assert.equal((await loadRuntimeOptions([], {}, { appDir: f.appDir })).protocol, 'http');
  await f.write('# connection_type: https\n# tls_certificate: etc/certs/server.crt\n# tls_private_key: etc/certs/server.key\nconnection_type: http\n');
  const options = await loadRuntimeOptions([], {}, { appDir: f.appDir });
  assert.equal(options.protocol, 'http'); assert.equal(options['tls-cert'], undefined);
  assert.equal(options.host, undefined, 'absence of a host retains automatic interface selection');
});

test('literal certificate paths resolve against the config directory and preserve spaces and hash characters', async t => {
  const f = await fixture(t);
  await f.write('connection_type: https\r\ntls_certificate: certs/server #1.crt\r\ntls_private_key: /example/private keys/server.key\r\nhost: 192.0.2.15\r\nport: 4545\r\npublic_origin: https://command-center.example\r\n');
  const options = await loadRuntimeOptions([], {}, { appDir: f.appDir });
  assert.equal(options.protocol, 'https');
  assert.equal(options['tls-cert'], join(f.appDir, 'etc', 'certs', 'server #1.crt'));
  assert.equal(options['tls-key'], '/example/private keys/server.key');
  assert.equal(options.host, '192.0.2.15'); assert.equal(options.port, '4545');
  assert.equal(options['public-origin'], 'https://command-center.example');
});

test('existing explicit environment and CLI settings override installed file values', async t => {
  const f = await fixture(t);
  await f.write('connection_type: https\nhost: 192.0.2.15\nport: 4545\npublic_origin: https://command-center.example\ntls_certificate: certs/server.crt\ntls_private_key: certs/server.key\n');
  const env = { CCNG_PROTOCOL: 'http', CCNG_HOST: '127.0.0.1', CCNG_PORT: '4646', CCNG_PUBLIC_ORIGIN: '', CCNG_TLS_CERT: '/example/env.crt', CCNG_TLS_KEY: '/example/env.key' };
  const environment = await loadRuntimeOptions([], env, { appDir: f.appDir });
  assert.equal(environment.protocol, 'http'); assert.equal(environment.host, '127.0.0.1'); assert.equal(environment.port, '4646');
  assert.equal(environment['public-origin'], ''); assert.equal(environment['tls-cert'], '/example/env.crt');
  const cli = await loadRuntimeOptions(['--protocol', 'https', '--host', '192.0.2.25', '--port', '4747', '--tls-cert', '/example/cli.crt', '--tls-key', '/example/cli.key'], env, { appDir: f.appDir });
  assert.equal(cli.protocol, 'https'); assert.equal(cli.host, '192.0.2.25'); assert.equal(cli.port, '4747');
  assert.equal(cli['tls-cert'], '/example/cli.crt'); assert.equal(cli['tls-key'], '/example/cli.key');
});

test('certificate paths alone leave HTTP selected; explicitly selected HTTPS never falls back when incomplete', async t => {
  const f = await fixture(t);
  await f.write('tls_certificate: certs/server.crt\ntls_private_key: certs/server.key\n');
  assert.equal((await loadRuntimeOptions([], {}, { appDir: f.appDir })).protocol, 'http');
  await f.write('connection_type: https\n');
  const options = await loadRuntimeOptions([], {}, { appDir: f.appDir });
  await assert.rejects(createApp({ config: { protocol: options.protocol } }), /HTTPS requires both a certificate and private key/);
});

test('browser-first setup is disabled by default and protected-proxy opt-in retains normal override precedence', async t => {
  const f = await fixture(t);
  assert.equal((await loadRuntimeOptions([], {}, { appDir: f.appDir }))['first-password-setup'], 'disabled');
  await f.write('first_password_setup: htpasswd-proxy\npublic_origin: https://command-center.example\n');
  const options = await loadRuntimeOptions([], {}, { appDir: f.appDir });
  assert.equal(options['first-password-setup'], 'htpasswd-proxy');
  assert.equal(options['public-origin'], 'https://command-center.example');
  const env = { CCNG_FIRST_PASSWORD_SETUP: 'disabled' };
  assert.equal((await loadRuntimeOptions([], env, { appDir: f.appDir }))['first-password-setup'], 'disabled');
  assert.equal((await loadRuntimeOptions(['--first-password-setup', 'htpasswd-proxy'], env, { appDir: f.appDir }))['first-password-setup'], 'htpasswd-proxy');
  await f.write('first_password_setup: disabled\n');
  assert.equal((await loadRuntimeOptions([], {}, { appDir: f.appDir }))['first-password-setup'], 'disabled');
});

test('concern review worker is optional and follows CLI, environment and installed-config precedence', async t => {
  const f = await fixture(t);
  assert.equal((await loadRuntimeOptions([], {}, { appDir: f.appDir }))['concern-review-worker'], undefined);
  await f.write('concern_review_worker: worker-file\n');
  assert.equal((await loadRuntimeOptions([], {}, { appDir: f.appDir }))['concern-review-worker'], 'worker-file');
  const env = { CCNG_CONCERN_REVIEW_WORKER: 'worker-env' };
  assert.equal((await loadRuntimeOptions([], env, { appDir: f.appDir }))['concern-review-worker'], 'worker-env');
  assert.equal((await loadRuntimeOptions(['--concern-review-worker', 'worker-cli'], env, { appDir: f.appDir }))['concern-review-worker'], 'worker-cli');
  assert.equal((await loadRuntimeOptions(['--concern-review-worker', 'disabled'], env, { appDir: f.appDir }))['concern-review-worker'], 'disabled');
  assert.equal((await loadRuntimeOptions([], { CCNG_CONCERN_REVIEW_WORKER: 'disabled' }, { appDir: f.appDir }))['concern-review-worker'], 'disabled');
  await f.write('concern_review_worker: disabled\n');
  assert.equal(normalizeConcernReviewWorker((await loadRuntimeOptions([], {}, { appDir: f.appDir }))['concern-review-worker']), null);
});

test('concern worker identifiers are bounded literal IDs and invalid settings fail without echoing values', async t => {
  const f = await fixture(t);
  for (const value of [undefined, null, 'disabled']) assert.equal(normalizeConcernReviewWorker(value), null);
  for (const value of ['worker', 'worker-01_name', '01a1d42b-0d52-7c33-86e3-1e189eaa7db5', 'A'.repeat(128)]) assert.equal(normalizeConcernReviewWorker(value), value);
  for (const value of ['', ' ', '_worker', 'worker/name', 'worker.name', 'worker name', '$(private-value)', 'constructor', 'Constructor', 'prototype', 'coordinator', '__proto__', 'a'.repeat(129), 'éworker', 1, false, {}]) {
    assert.throws(() => normalizeConcernReviewWorker(value), /worker ID|reserved/);
  }
  for (const value of ['worker/name', 'constructor', 'coordinator', '$(private-value)', 'a'.repeat(129)]) {
    await f.write('concern_review_worker: ' + value + '\n');
    await assert.rejects(loadRuntimeOptions([], {}, { appDir: f.appDir }), error => {
      assert.match(error.message, /Runtime configuration line 1:.*concern_review_worker/);
      assert.doesNotMatch(error.message, /private-value/); return true;
    });
  }
  await f.write('concern_review_worker: worker-one\nconcern_review_worker: worker-two\n');
  await assert.rejects(loadRuntimeOptions([], {}, { appDir: f.appDir }), /duplicate setting/);
});

test('app settings normalize concern routing and explicit values alone update a supplied Coordinator', async t => {
  const f = await fixture(t), authFile = join(f.appDir, 'auth.json');
  await setPassword(randomBytes(24).toString('base64url'), authFile);
  const updates = [];
  for (const config of [{}, { concernReviewWorkerId: 'worker-review' }, { concernReviewWorkerId: 'disabled' }, { concernReviewWorkerId: null }]) {
    const rpc = new EventEmitter(); rpc.ready = false; rpc.close = () => {};
    rpc.call = async () => assert.fail('Configuration must not run native work.');
    rpc.respond = () => assert.fail('Configuration must not answer native requests.');
    const workspace = new Workspace(rpc, { beads: null });
    workspace.coordinator = { setConcernReviewWorker: id => updates.push(id), snapshot: () => null, shutdown: async () => {} };
    const before = updates.length;
    const app = await createApp({ rpc, workspace, authFile, workspaceFile: join(f.appDir, 'workspace.json'), config });
    try {
      assert.equal(app.settings.concernReviewWorkerId, config.concernReviewWorkerId === 'worker-review' ? 'worker-review' : null);
      assert.equal(updates.length, before + (Object.hasOwn(config, 'concernReviewWorkerId') ? 1 : 0));
    } finally { await app.close(); }
  }
  assert.deepEqual(updates, ['worker-review', null, null], 'omission preserves an existing Coordinator setting while explicit disable clears it');
  await assert.rejects(createApp({ authFile: join(f.appDir, 'missing-auth.json'), config: { concernReviewWorkerId: 'worker/name' } }), /concern_review_worker/);
});

test('malformed unknown duplicate and invalid settings fail safely rather than being evaluated or ignored', async t => {
  const f = await fixture(t);
  for (const text of [
    'connection_type=https', 'unknown_setting: private-value',
    'connection_type: http\nconnection_type: https', 'connection_type: unsupported-private-value',
    'port: 0', 'port: 65536', 'port: 2e3', 'host:', 'first_password_setup: automatic',
    'tls_private_key: ~/private.key', 'host: value\u0000private-value',
  ]) {
    await f.write(text);
    await assert.rejects(loadRuntimeOptions(['--protocol', 'http'], {}, { appDir: f.appDir }), error => {
      assert.match(error.message, /Runtime configuration line \d+:/);
      assert.doesNotMatch(error.message, /private-value|unsupported-private-value/); return true;
    });
  }
  const literal = parseRuntimeConfig('tls_certificate: $(no-execution)/server.crt', f.appDir);
  assert.equal(literal['tls-cert'], join(f.appDir, '$(no-execution)', 'server.crt'));
});

test('help bypasses invalid configuration while normal startup rejects oversized or non-file configuration', async t => {
  const f = await fixture(t);
  await f.write('unknown: invalid');
  assert.equal((await loadRuntimeOptions(['--help'], {}, { appDir: f.appDir })).help, true);
  await f.write('x'.repeat(16385));
  await assert.rejects(readRuntimeConfig(f.file), /no larger than 16 KiB/);
  await rm(f.file); await mkdir(f.file);
  await assert.rejects(readRuntimeConfig(f.file), /regular file/);
});

test('a FIFO configuration is rejected promptly instead of blocking startup', { timeout: 3000 }, async t => {
  const f = await fixture(t);
  await promisify(execFile)('mkfifo', [f.file]);
  await assert.rejects(readRuntimeConfig(f.file), /regular file/);
});
