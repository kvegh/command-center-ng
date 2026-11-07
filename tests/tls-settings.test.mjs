import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, X509Certificate } from 'node:crypto';
import { createSecureContext } from 'node:tls';
import { loadTlsSettings, certificateInfo } from '../server/tls-settings.mjs';

const run = promisify(execFile);
let directory; let certPath; let keyPath; let cert; let key;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ccng-tls-settings-'));
  certPath = join(directory, 'server-cert.pem'); keyPath = join(directory, 'server-key.pem');
  await run('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
    '-keyout', keyPath, '-out', certPath, '-subj', '/CN=localhost', '-days', '1',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { timeout: 10000 });
  await chmod(keyPath, 0o600);
  [cert, key] = await Promise.all([readFile(certPath), readFile(keyPath)]);
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test('omitting both TLS paths preserves HTTP without reading or creating files', async () => {
  assert.equal(await loadTlsSettings(), undefined);
  assert.equal(await loadTlsSettings(null, null), undefined);
});

test('partial, empty and malformed paths cannot silently fall back to HTTP', async () => {
  for (const paths of [[certPath], [undefined, keyPath], [certPath, null], ['', ''], [' ', keyPath], [certPath, ''], [42, keyPath], [certPath, 'bad\npath']]) {
    await assert.rejects(loadTlsSettings(...paths), /HTTPS requires both --tls-cert and --tls-key/);
  }
});

test('missing or unreadable certificate/key paths have actionable bounded errors', async () => {
  const missing = join(directory, 'missing.pem');
  for (const [paths, label] of [[[missing, keyPath], 'certificate'], [[certPath, missing], 'private-key'], [[directory, keyPath], 'certificate']]) {
    await assert.rejects(loadTlsSettings(...paths), error => {
      assert.match(error.message, new RegExp(`Cannot read the TLS ${label} file`));
      assert.match(error.message, /service account's read access/);
      assert.ok(error.message.length < 250); assert.doesNotMatch(error.message, /BEGIN|PRIVATE KEY/); return true;
    });
  }
});

test('invalid certificate input never exposes supplied contents', async () => {
  const path = join(directory, 'invalid-cert.pem'); const canary = 'do-not-log-certificate-file-contents';
  await writeFile(path, canary, { mode: 0o600 });
  await assert.rejects(loadTlsSettings(path, keyPath), error => {
    assert.match(error.message, /not a readable X.509 PEM certificate/);
    assert.ok(!error.message.includes(canary)); return true;
  });
});

test('invalid private-key input never exposes supplied contents or OpenSSL details', async () => {
  const path = join(directory, 'invalid-key.pem'); const canary = 'do-not-log-private-key-file-contents';
  await writeFile(path, canary, { mode: 0o600 });
  await assert.rejects(loadTlsSettings(certPath, path), error => {
    assert.match(error.message, /matching PEM certificate chain and unencrypted private key/);
    assert.ok(!error.message.includes(canary)); assert.doesNotMatch(error.message, /error:[0-9A-Fa-f]+/); return true;
  });
});

test('a valid key for another identity is rejected as a mismatched pair', async () => {
  const unrelated = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  const path = join(directory, 'unrelated-key.pem'); await writeFile(path, unrelated, { mode: 0o600 });
  await assert.rejects(loadTlsSettings(certPath, path), /cannot be used together/);
});

test('a real matching certificate/key is loaded with TLS 1.2 minimum and public metadata', async () => {
  const options = await loadTlsSettings(certPath, keyPath);
  assert.deepEqual(options.cert, cert); assert.deepEqual(options.key, key); assert.equal(options.minVersion, 'TLSv1.2');
  assert.doesNotThrow(() => createSecureContext(options));
  const info = certificateInfo(cert);
  assert.match(info.subject, /CN=localhost/); assert.match(info.issuer, /CN=localhost/);
  assert.ok(Number.isFinite(Date.parse(info.validFrom))); assert.ok(Number.isFinite(Date.parse(info.validTo)));
  assert.ok(Object.values(info).every(value => value.length <= 512 && !/[\x00-\x1f\x7f]/.test(value)));
  assert.doesNotMatch(JSON.stringify(info), /BEGIN|PRIVATE KEY/);
});

test('real parsed certificate dates reject expired and not-yet-valid startup clocks', async () => {
  const certificate = new X509Certificate(cert);
  await assert.rejects(loadTlsSettings(certPath, keyPath, { now: Date.parse(certificate.validFrom) - 1000 }), /not valid yet/);
  await assert.rejects(loadTlsSettings(certPath, keyPath, { now: Date.parse(certificate.validTo) + 1000 }), /expired/);
  assert.equal((await loadTlsSettings(certPath, keyPath, { now: Date.parse(certificate.validFrom) })).minVersion, 'TLSv1.2');
  assert.equal((await loadTlsSettings(certPath, keyPath, { now: Date.parse(certificate.validTo) })).minVersion, 'TLSv1.2');
});
