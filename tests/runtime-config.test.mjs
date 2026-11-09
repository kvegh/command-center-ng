import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseRuntimeConfig, readRuntimeConfig, runtimeConfigFile } from '../server/runtime-config.mjs';
import { loadRuntimeOptions, createApp } from '../server/main.mjs';

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
