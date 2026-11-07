import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveListenAddress } from '../server/listen-address.mjs';

const ipv4 = address => ({ address, family: 'IPv4', internal: false });
const route = changes => ({ dst: 'default', gateway: '192.0.2.1', dev: 'eth0', metric: 100, ...changes });
function fixture(routes, interfaces = { eth0: [ipv4('192.0.2.10')] }, lookup = []) {
  const calls = [];
  return { calls, options: { platform: 'linux', interfaces: () => interfaces, runIp: async argv => {
    calls.push(argv); return JSON.stringify(argv.includes('get') ? lookup : routes);
  } } };
}

test('explicit IPv4, IPv6, wildcard and hostname choices bypass automatic discovery', async () => {
  for (const host of ['127.0.0.1', '0.0.0.0', '::1', '::', '192.0.2.40', 'example.invalid']) {
    const unreachable = () => assert.fail('Explicit addresses must not query routes or interfaces.');
    assert.deepEqual(await resolveListenAddress(host, { platform: 'other', interfaces: unreachable, runIp: unreachable }), { host, interfaceName: null, automatic: false });
  }
  for (const host of ['', ' ', 'bad host', 'localhost\n', 42]) await assert.rejects(resolveListenAddress(host), /configured host/);
});

test('an omitted host chooses the lowest-metric default interface and its assigned IPv4', async () => {
  const f = fixture([route({ dev: 'secondary', metric: 200 }), route({ dev: 'eth0' })]);
  assert.deepEqual(await resolveListenAddress(undefined, f.options), { host: '192.0.2.10', interfaceName: 'eth0', automatic: true });
  assert.deepEqual(f.calls, [['-j', '-4', 'route', 'show', 'default']]);
});

test('an explicit native preferred source is used rather than an arbitrary secondary address', async () => {
  const f = fixture([route({ prefsrc: '192.0.2.11' })], { eth0: [ipv4('192.0.2.10'), ipv4('192.0.2.11')] });
  assert.equal((await resolveListenAddress(undefined, f.options)).host, '192.0.2.11');
  assert.equal(f.calls.length, 1);
});

test('multi-address interfaces use the kernel preferred source without sending a packet', async () => {
  const f = fixture([route()], { eth0: [ipv4('192.0.2.10'), ipv4('192.0.2.11')] }, [{ dev: 'eth0', prefsrc: '192.0.2.11' }]);
  assert.equal((await resolveListenAddress(undefined, f.options)).host, '192.0.2.11');
  assert.deepEqual(f.calls[1], ['-j', '-4', 'route', 'get', '192.0.2.1', 'oif', 'eth0']);
  const direct = fixture([route({ gateway: undefined })], { eth0: [ipv4('192.0.2.10'), ipv4('192.0.2.11')] }, [{ dev: 'eth0', prefsrc: '192.0.2.10' }]);
  assert.equal((await resolveListenAddress(undefined, direct.options)).host, '192.0.2.10');
  assert.equal(direct.calls[1][4], '192.0.2.1');
});

test('ambiguous routes, multipath and absent routes never silently expose all interfaces', async () => {
  for (const routes of [[], [route({ dev: 'eth0' }), route({ dev: 'eth1' })], [route({ dev: undefined, nexthops: [{ dev: 'eth0' }, { dev: 'eth1' }] })], [route({ metric: '100' })]]) {
    const f = fixture(routes);
    await assert.rejects(resolveListenAddress(undefined, f.options), /--host ADDRESS/);
  }
  const duplicate = fixture([route(), route()]);
  assert.equal((await resolveListenAddress(undefined, duplicate.options)).host, '192.0.2.10');
});

test('down and non-unicast defaults are excluded, and an omitted metric means zero', async () => {
  const f = fixture([route({ dev: 'down0', metric: 0, flags: ['linkdown'] }), route({ type: 'unreachable', metric: 0 }), route({ metric: undefined }), route({ dev: 'slow0', metric: 5 })]);
  assert.equal((await resolveListenAddress(undefined, f.options)).interfaceName, 'eth0');
});

test('missing interfaces, loopback, wildcard, multicast and wrong-family addresses fail explicitly', async () => {
  for (const interfaces of [{}, { eth0: [ipv4('127.0.0.1')] }, { eth0: [ipv4('0.0.0.0')] }, { eth0: [ipv4('224.0.0.1')] }, { eth0: [{ address: '::1', family: 'IPv6', internal: true }] }, { eth0: [{ ...ipv4('192.0.2.10'), internal: true }] }]) {
    const f = fixture([route()], interfaces);
    await assert.rejects(resolveListenAddress(undefined, f.options), /no usable local IPv4/);
  }
});

test('route and lookup sources must belong to the selected interface', async () => {
  const incorrect = fixture([route({ prefsrc: '198.51.100.2' })]);
  await assert.rejects(resolveListenAddress(undefined, incorrect.options), /source/);
  const conflicting = fixture([route({ prefsrc: '192.0.2.10' }), route({ prefsrc: '192.0.2.11' })], { eth0: [ipv4('192.0.2.10'), ipv4('192.0.2.11')] });
  await assert.rejects(resolveListenAddress(undefined, conflicting.options), /source/);
  for (const lookup of [[], [{ dev: 'eth1', prefsrc: '192.0.2.10' }], [{ dev: 'eth0', prefsrc: '198.51.100.2' }], [{ dev: 'eth0', prefsrc: '192.0.2.10' }, { dev: 'eth0', prefsrc: '192.0.2.11' }]]) {
    const f = fixture([route()], { eth0: [ipv4('192.0.2.10'), ipv4('192.0.2.11')] }, lookup);
    await assert.rejects(resolveListenAddress(undefined, f.options), /could not select/);
  }
});

test('missing ip, command errors, timeouts and malformed output have actionable errors', async () => {
  for (const error of [Object.assign(new Error(), { code: 'ENOENT' }), Object.assign(new Error(), { killed: true }), new Error('Permission denied')]) {
    await assert.rejects(resolveListenAddress(undefined, { platform: 'linux', runIp: async () => { throw error; } }), /--host ADDRESS/);
  }
  for (const output of ['', 'not-json', '{}', '[null]', '[42]']) {
    await assert.rejects(resolveListenAddress(undefined, { platform: 'linux', runIp: async () => output }), /invalid JSON route data/);
  }
  const malformed = fixture([route({ flags: 'linkdown' })]);
  await assert.rejects(resolveListenAddress(undefined, malformed.options), /invalid route flags.*--host ADDRESS/);
  await assert.rejects(resolveListenAddress(undefined, { platform: 'other' }), /requires Linux/);
});
