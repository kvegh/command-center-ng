import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir, rm, chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp, loadRuntimeOptions, runtimeHelp } from '../server/main.mjs';
import { setPassword, clearAllLogins } from '../server/auth.mjs';
import { Workspace } from '../server/workspace.mjs';

class Response extends EventEmitter {
  headers = {}; chunks = []; writableLength = 0;
  finished = new Promise(resolve => { this.finish = resolve; });
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); }
  write(chunk) { this.chunks.push(String(chunk)); return true; }
  end(chunk) { if (chunk !== undefined) this.write(chunk); this.writableEnded = true; this.finish(this); this.emit('finish'); }
  destroy() { this.destroyed = true; this.finish(this); this.emit('finish'); }
  json() { return JSON.parse(this.chunks.join('')); }
}
async function waitFor(predicate) {
  const deadline = Date.now() + 1500;
  while (!predicate()) { if (Date.now() >= deadline) throw new Error('Expected authentication event was not observed.'); await delay(5); }
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-auth-http-')); const authFile = join(directory, 'auth.json');
  const password = randomBytes(24).toString('base64url'); await setPassword(password, authFile);
  const apps = [];
  t.after(async () => { await chmod(join(directory, 'sessions'), 0o700).catch(() => {}); for (const app of apps) await app.close(); await rm(directory, { recursive: true, force: true }); });
  const start = async () => {
    const rpc = new EventEmitter(); rpc.ready = false; rpc.calls = []; rpc.close = () => {};
    rpc.call = async method => { rpc.calls.push(method); throw new Error('Unexpected native operation.'); };
    const workspace = new Workspace(rpc, { beads: null });
    const app = await createApp({ rpc, workspace, authFile }); apps.push(app);
    const open = (path, data, cookie, headers = {}) => {
      const incoming = new EventEmitter();
      Object.assign(incoming, {
        url: path, method: data === undefined ? 'GET' : 'POST',
        headers: { host: 'localhost:4242', origin: 'http://localhost:4242', 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
        socket: { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' },
        async *[Symbol.asyncIterator]() { if (data !== undefined) yield Buffer.from(JSON.stringify(data)); },
      });
      const response = new Response(); response.once('finish', () => incoming.emit('close'));
      app.server.emit('request', incoming, response); return response;
    };
    const request = (...args) => open(...args).finished;
    return { app, rpc, workspace, request, open };
  };
  return { directory, authFile, password, start };
}

test('application logins survive a full app restart and logout remains revoked after another restart', async t => {
  const f = await fixture(t); const first = await f.start();
  const login = await first.request('/api/login', { password: f.password });
  assert.equal(login.statusCode, 200); const cookie = login.headers['set-cookie'];
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Max-Age=43200/);
  await first.app.close();
  const second = await f.start(); assert.equal((await second.request('/api/session', undefined, cookie)).json().authenticated, true);
  assert.equal((await second.request('/api/state', undefined, cookie)).statusCode, 200);
  const logout = await second.request('/api/logout', {}, cookie);
  assert.equal(logout.statusCode, 200); assert.match(logout.headers['set-cookie'], /Max-Age=0/);
  await second.app.close();
  const third = await f.start(); assert.equal((await third.request('/api/session', undefined, cookie)).json().authenticated, false);
  const rejected = await third.request('/api/state', undefined, cookie);
  assert.equal(rejected.statusCode, 403); assert.equal(rejected.json().code, 'authentication_required');
  assert.deepEqual(third.rpc.calls, []);
});

test('app authentication uses JSON403 codes without a proxy Basic Auth challenge; origin errors stay distinct', async t => {
  const f = await fixture(t); const server = await f.start();
  for (const [path, body] of [['/api/state'], ['/api/events'], ['/api/agents'], ['/api/logout', {}]]) {
    const rejected = await server.request(path, body, undefined, { authorization: 'Basic synthetic-proxy-header' });
    assert.equal(rejected.statusCode, 403); assert.equal(rejected.json().code, 'authentication_required');
    assert.equal(rejected.headers['www-authenticate'], undefined);
  }
  const wrong = await server.request('/api/login', { password: 'incorrect-password' });
  assert.equal(wrong.statusCode, 403); assert.equal(wrong.json().code, 'invalid_password'); assert.equal(wrong.headers['www-authenticate'], undefined);
  const origin = await server.request('/api/login', { password: f.password }, undefined, { origin: 'https://other.example' });
  assert.equal(origin.statusCode, 403); assert.equal(origin.json().code, undefined); assert.match(origin.json().error, /origin/);
});

test('clear-login and password rotation affect an already-running HTTP server without using a cached verifier', async t => {
  const f = await fixture(t); const server = await f.start();
  const cookie = (await server.request('/api/login', { password: f.password })).headers['set-cookie'];
  await clearAllLogins(f.authFile);
  assert.equal((await server.request('/api/session', undefined, cookie)).json().authenticated, false);
  assert.equal((await server.request('/api/state', undefined, cookie)).json().code, 'authentication_required');
  const fresh = (await server.request('/api/login', { password: f.password })).headers['set-cookie'];
  const replacement = randomBytes(24).toString('base64url'); await setPassword(replacement, f.authFile);
  assert.equal((await server.request('/api/state', undefined, fresh)).json().code, 'authentication_required');
  const stale = await server.request('/api/login', { password: f.password });
  assert.equal(stale.statusCode, 403); assert.equal(stale.json().code, 'invalid_password'); assert.equal(stale.headers['set-cookie'], undefined);
  assert.equal((await server.request('/api/login', { password: replacement })).statusCode, 200);
  assert.deepEqual(server.rpc.calls, []);
});

test('corrupt auth/session state and failed session persistence return visible503 without issuing a cookie', async t => {
  const f = await fixture(t); const server = await f.start();
  const cookie = (await server.request('/api/login', { password: f.password })).headers['set-cookie'];
  const generation = join(f.directory, 'sessions', 'generation.json'); const bytes = await readFile(generation);
  await writeFile(generation, 'corrupt generation');
  const denied = await server.request('/api/state', undefined, cookie);
  assert.equal(denied.statusCode, 503); assert.equal(denied.json().code, 'authentication_unavailable');
  assert.equal(denied.headers['www-authenticate'], undefined);
  await writeFile(generation, bytes); await chmod(join(f.directory, 'sessions'), 0o500);
  const failedLogin = await server.request('/api/login', { password: f.password });
  assert.equal(failedLogin.statusCode, 503); assert.equal(failedLogin.json().code, 'authentication_unavailable');
  assert.equal(failedLogin.headers['set-cookie'], undefined);
  await chmod(join(f.directory, 'sessions'), 0o700); await rm(f.authFile);
  const missing = await server.request('/api/state', undefined, cookie);
  assert.equal(missing.statusCode, 503); assert.equal(missing.json().code, 'authentication_unavailable');
  await writeFile(f.authFile, 'corrupt authentication', { mode: 0o600 });
  const unavailable = await server.request('/api/session', undefined, cookie);
  assert.equal(unavailable.statusCode, 503); assert.equal(unavailable.json().code, 'authentication_unavailable');
  assert.equal(unavailable.json().error.includes('corrupt authentication'), false, 'private file data is not returned in errors');
});

test('existing SSE clients are revalidated on publication and at their existing15-second heartbeat', async t => {
  for (const viaHeartbeat of [false, true]) {
    const f = await fixture(t); const server = await f.start();
    const cookie = (await server.request('/api/login', { password: f.password })).headers['set-cookie'];
    const original = globalThis.setInterval; let heartbeat;
    globalThis.setInterval = (callback, milliseconds, ...args) => milliseconds === 15_000 ? (heartbeat = callback, { unref() {} }) : original(callback, milliseconds, ...args);
    try {
      const stream = server.open('/api/events', undefined, cookie);
      await waitFor(() => stream.headersSent && !!heartbeat);
      const before = stream.chunks.length;
      await clearAllLogins(f.authFile);
      if (viaHeartbeat) await heartbeat(); else server.workspace.changed();
      await stream.finished;
      assert.ok(stream.writableEnded || stream.destroyed);
      assert.equal(stream.chunks.length, before, 'revoked clients receive no later workspace snapshot');
      assert.deepEqual(server.rpc.calls, []);
    } finally { globalThis.setInterval = original; }
  }
});

test('the real clear-logins CLI invalidates running sessions before any config, native or listener startup', async t => {
  const f = await fixture(t); const server = await f.start();
  const cookie = (await server.request('/api/login', { password: f.password })).headers['set-cookie'];
  const auth = await readFile(f.authFile); const generationFile = join(f.directory, 'sessions', 'generation.json');
  const before = await readFile(generationFile, 'utf8');
  await mkdir(join(f.directory, 'etc')); await writeFile(join(f.directory, 'etc', 'config.conf'), 'invalid runtime settings');
  assert.equal((await loadRuntimeOptions(['--clear-logins'], {}, { appDir: f.directory }))['clear-logins'], true);
  assert.match(runtimeHelp(), /--clear-logins/);
  const run = promisify(execFile); const main = fileURLToPath(new URL('../server/main.mjs', import.meta.url));
  await run(process.execPath, [main, '--clear-logins', '--port', '0'], { env: { ...process.env, CCNG_CONFIG_DIR: f.directory, CODEX_HOME: join(f.directory, 'native-unused'), PATH: '' }, timeout: 10000 });
  assert.notEqual(await readFile(generationFile, 'utf8'), before);
  assert.deepEqual(await readFile(f.authFile), auth); assert.equal((await server.request('/api/session', undefined, cookie)).json().authenticated, false);
  assert.equal((await readdir(f.directory)).includes('native-unused'), false); assert.deepEqual(server.rpc.calls, []);
  await writeFile(generationFile, 'corrupt generation');
  await assert.rejects(run(process.execPath, [main, '--clear-logins'], { env: { ...process.env, CCNG_CONFIG_DIR: f.directory, PATH: '' }, timeout: 10000 }), error => error.code === 1);
  assert.equal(await readFile(generationFile, 'utf8'), 'corrupt generation');
});
