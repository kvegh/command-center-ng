import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../server/main.mjs';
import { setPassword } from '../server/auth.mjs';
import { Workspace } from '../server/workspace.mjs';

// A second isolated loopback address stands in for the selected external IP;
// route/interface selection itself is covered separately without host mutation.
const selected = '127.0.0.2';
const automatic = { host: selected, interfaceName: 'fixture0', automatic: true };

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-listeners-'));
  let app;
  t.after(async () => { await app?.close(); await rm(directory, { recursive: true, force: true }); });
  const authFile = join(directory, 'auth.json'); const password = randomBytes(24).toString('base64url');
  await setPassword(password, authFile);
  const rpc = new EventEmitter(); rpc.ready = false; rpc.closed = 0; rpc.close = () => { rpc.closed++; };
  const workspace = new Workspace(rpc, { beads: null });
  app = await createApp({ rpc, workspace, authFile, config: { host: selected, protocol: 'http' } });
  const request = (host, port, path, data, headers = {}) => new Promise((resolve, reject) => {
    const call = http.request({ host, port, path, agent: false, method: data === undefined ? 'GET' : 'POST', headers: {
      ...(data === undefined ? {} : { 'Content-Type': 'application/json', Origin: `http://${host}:${port}` }), ...headers,
    } }, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    call.setTimeout(5000, () => call.destroy(new Error('Fixture request timed out'))); call.on('error', reject);
    call.end(data === undefined ? undefined : JSON.stringify(data));
  });
  return { app, rpc, password, request };
}

test('automatic listeners share the same port and authenticated workspace while leaving other addresses unbound', async t => {
  const f = await fixture(t); const bound = await f.app.listen(automatic, 0);
  assert.deepEqual(bound.map(listener => listener.host), [selected, '127.0.0.1']);
  assert.equal(bound[0].server, f.app.server); assert.equal(bound[0].port, bound[1].port);
  const port = bound[0].port;
  assert.equal((await f.request(selected, port, '/api/state')).status, 401);
  const login = await f.request('127.0.0.1', port, '/api/login', { password: f.password }, { Host: `localhost:${port}`, Origin: `http://localhost:${port}` });
  assert.equal(login.status, 200); const cookie = login.headers['set-cookie'][0];
  for (const host of [selected, '127.0.0.1']) {
    assert.equal((await f.request(host, port, '/api/state', undefined, { Cookie: cookie })).status, 200);
    assert.equal((await f.request(host, port, '/api/login', { password: f.password }, { Origin: 'https://unrelated.example' })).status, 403);
  }
  await assert.rejects(f.request('127.0.0.3', port, '/healthz'), { code: 'ECONNREFUSED' });
  await f.app.close(); await f.app.close(); assert.equal(f.rpc.closed, 1);
  assert.ok(bound.every(listener => !listener.server.listening));
  await assert.rejects(f.request('127.0.0.1', port, '/healthz'), { code: 'ECONNREFUSED' });
});

test('an explicit selection binds only its one requested address', async t => {
  const f = await fixture(t);
  const bound = await f.app.listen({ ...automatic, automatic: false }, 0);
  assert.equal(bound.length, 1); assert.equal(bound[0].host, selected);
  assert.equal((await f.request(selected, bound[0].port, '/healthz')).status, 200);
  await assert.rejects(f.request('127.0.0.1', bound[0].port, '/healthz'), { code: 'ECONNREFUSED' });
});

test('a loopback bind failure rolls back the primary listener and closes shared resources', async t => {
  const blocker = net.createServer();
  t.after(() => new Promise(resolve => blocker.close(resolve)));
  await new Promise((resolve, reject) => { blocker.once('error', reject); blocker.listen(0, '127.0.0.1', resolve); });
  const port = blocker.address().port;
  const f = await fixture(t);
  await assert.rejects(f.app.listen(automatic, port), { code: 'EADDRINUSE' });
  assert.equal(f.app.server.listening, false); assert.equal(f.rpc.closed, 1);
  assert.equal(blocker.listening, true, 'an unrelated listener must remain intact');
  await assert.rejects(f.request(selected, port, '/healthz'), { code: 'ECONNREFUSED' });
  await f.app.close(); assert.equal(f.rpc.closed, 1);
});
