import test from 'node:test';
import assert from 'node:assert/strict';
import { requestOriginAllowed } from '../server/main.mjs';

const settings = { host: '192.0.2.15', https: true, publicOrigin: 'https://command-center.example' };
const local = (origin = 'https://localhost:4242', host = 'localhost:4242') => ({
  headers: { origin, host }, socket: { encrypted: true, localAddress: '127.0.0.1', remoteAddress: '127.0.0.1' },
});

test('configured public origin stays exact and does not depend on forwarded headers', () => {
  assert.equal(requestOriginAllowed(local(settings.publicOrigin, 'command-center.example'), settings), true);
  for (const origin of ['https://command-center.example.evil.invalid', 'http://command-center.example', 'https://command-center.example:4242', 'null']) {
    assert.equal(requestOriginAllowed(local(origin), settings), false);
  }
});

test('native TLS on a local listener accepts exact local Origin and Host including forwarded port', () => {
  for (const host of ['localhost:4242', '127.0.0.1:4343', '[::1]:4444', 'localhost']) {
    const request = local('https://' + host, host);
    assert.equal(requestOriginAllowed(request, settings, '127.0.0.1'), true);
  }
  const ipv6 = local(); ipv6.socket.localAddress = '::1'; ipv6.socket.remoteAddress = '::1';
  assert.equal(requestOriginAllowed(ipv6, settings, '::1'), true);
  const mapped = local(); mapped.socket.localAddress = '::ffff:127.0.0.1'; mapped.socket.remoteAddress = '::ffff:127.0.0.1';
  assert.equal(requestOriginAllowed(mapped, settings, '127.0.0.1'), true);
});

test('local exception rejects HTTP, missing transport identity, network listeners and remote peers', () => {
  for (const host of ['192.0.2.15', '0.0.0.0', '::']) assert.equal(requestOriginAllowed(local(), settings, host), false);
  assert.equal(requestOriginAllowed(local('http://localhost:4242'), settings, '127.0.0.1'), false);
  assert.equal(requestOriginAllowed(local(), { ...settings, https: false }, '127.0.0.1'), false);
  for (const [field, value] of [['encrypted', false], ['localAddress', '192.0.2.15'], ['remoteAddress', '198.51.100.7'], ['localAddress', undefined], ['remoteAddress', undefined]]) {
    const request = local(); request.socket[field] = value;
    assert.equal(requestOriginAllowed(request, settings, '127.0.0.1'), false);
  }
});

test('loopback transport does not permit mismatched origins, credentials, paths or header overrides', () => {
  for (const origin of [undefined, 'null', 'https://localhost:4343', 'https://127.0.0.1:4242', 'https://unrelated.example:4242', 'https://localhost:4242/path', 'https://user@localhost:4242', 'https://localhost:4242#fragment']) {
    const request = local(); request.headers.origin = origin;
    assert.equal(requestOriginAllowed(request, settings, '127.0.0.1'), false, String(origin));
  }
  const forged = local('https://unrelated.example');
  forged.headers['x-forwarded-host'] = 'localhost:4242'; forged.headers['x-forwarded-proto'] = 'https';
  assert.equal(requestOriginAllowed(forged, settings, '127.0.0.1'), false);
});

test('ordinary local HTTP without public origin retains same-origin login and rejects cross-origin writes', () => {
  assert.equal(requestOriginAllowed(local('http://localhost:4242'), { host: '127.0.0.1', https: false }), true);
  assert.equal(requestOriginAllowed(local('http://unrelated.example'), { host: '127.0.0.1', https: false }), false);
});
