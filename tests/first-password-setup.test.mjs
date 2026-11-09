import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/main.mjs';
import { loadPassword, setPassword } from '../server/auth.mjs';
import { Workspace } from '../server/workspace.mjs';

const publicOrigin = 'https://command-center.example';
const password = () => randomBytes(24).toString('base64url');

class Response extends EventEmitter {
  headers = {}; chunks = [];
  finished = new Promise(resolve => { this.finish = resolve; });
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; for (const [name, value] of Object.entries(headers)) this.setHeader(name, value); }
  write(chunk) { this.chunks.push(String(chunk)); return true; }
  end(chunk) { if (chunk !== undefined) this.write(chunk); this.finish(this); this.emit('finish'); }
  destroy() { this.destroyed = true; this.finish(this); this.emit('finish'); }
  json() { return JSON.parse(this.chunks.join('')); }
}

async function fixture(t, { directory, config = {}, prepare } = {}) {
  const owned = !directory;
  directory ||= await mkdtemp(join(tmpdir(), 'ccng-first-password-'));
  const authFile = join(directory, 'auth.json');
  let app;
  t.after(async () => { await app?.close(); if (owned) await rm(directory, { recursive: true, force: true }); });
  await prepare?.(authFile, directory);
  const rpc = new EventEmitter(); rpc.ready = false; rpc.calls = [];
  rpc.close = () => {};
  rpc.call = async method => { rpc.calls.push(method); throw new Error('Unexpected native call: ' + method); };
  const workspace = new Workspace(rpc, { beads: null });
  app = await createApp({ rpc, workspace, authFile, config: { publicOrigin, firstPasswordSetup: 'htpasswd-proxy', ...config } });
  const request = (path, data, { host = 'command-center.example', origin = publicOrigin, cookie, type = 'application/json', headers = {}, raw } = {}) => {
    const incoming = new EventEmitter();
    Object.assign(incoming, {
      url: path, method: data === undefined && raw === undefined ? 'GET' : 'POST',
      headers: { host, ...(origin == null ? {} : { origin }), 'content-type': type, ...(cookie ? { cookie } : {}), ...headers },
      socket: { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() { if (raw !== undefined) yield Buffer.from(raw); else if (data !== undefined) yield Buffer.from(JSON.stringify(data)); },
    });
    const response = new Response(); response.once('finish', () => incoming.emit('close'));
    app.server.emit('request', incoming, response); return response.finished;
  };
  return { app, authFile, directory, request, rpc };
}

test('browser setup is opt-in and requires an explicit canonical HTTPS public origin', async t => {
  await assert.rejects(fixture(t, { config: { firstPasswordSetup: undefined } }), { code: 'ENOENT' });
  await assert.rejects(fixture(t, { config: { firstPasswordSetup: 'disabled' } }), { code: 'ENOENT' });
  for (const origin of [undefined, 'http://command-center.example']) await assert.rejects(fixture(t, { config: { publicOrigin: origin } }), /requires an explicit HTTPS public origin/);
  await assert.rejects(fixture(t, { config: { firstPasswordSetup: 'automatic' } }), /Choose first_password_setup/);
});

test('fresh setup exposes only setup state while worker APIs remain authenticated', async t => {
  const f = await fixture(t);
  const session = (await f.request('/api/session', undefined, { origin: null })).json();
  assert.equal(session.authenticated, false); assert.equal(session.setupRequired, true); assert.equal(session.setupAllowed, true);
  const local = (await f.request('/api/session', undefined, { host: 'localhost:4242', origin: null })).json();
  assert.equal(local.setupRequired, true); assert.equal(local.setupAllowed, false);
  for (const [path, data] of [['/api/state'], ['/api/events'], ['/api/agents'], ['/api/connect', {}]]) {
    assert.equal((await f.request(path, data)).statusCode, 401, path);
  }
  assert.equal((await f.request('/api/login', { password: password() })).statusCode, 409);
  await assert.rejects(lstat(f.authFile), { code: 'ENOENT' });
  assert.deepEqual(f.rpc.calls, []);
});

test('first-browser setup stores a private hash, creates a secure session and preserves the established password', async t => {
  const f = await fixture(t); const chosen = password();
  const setup = await f.request('/api/setup', { password: chosen, confirmation: chosen });
  assert.equal(setup.statusCode, 200); assert.deepEqual(setup.json(), { authenticated: true });
  const cookie = setup.headers['set-cookie'];
  for (const flag of ['HttpOnly', 'SameSite=Strict', 'Secure']) assert.ok(cookie.includes(flag));
  const saved = await readFile(f.authFile, 'utf8');
  assert.equal(saved.includes(chosen), false); assert.equal((await lstat(f.authFile)).mode & 0o777, 0o600);
  assert.equal((await loadPassword(f.authFile))(chosen), true);
  assert.deepEqual((await f.request('/api/session', undefined, { cookie })).json(), { authenticated: true, version: f.app.workspace.snapshot().version });
  assert.equal((await f.request('/api/state', undefined, { cookie })).statusCode, 200);
  assert.equal((await f.request('/api/state')).statusCode, 401);
  const second = password();
  const rejected = await f.request('/api/setup', { password: second, confirmation: second });
  assert.equal(rejected.statusCode, 409); assert.equal(rejected.headers['set-cookie'], undefined);
  assert.equal(await readFile(f.authFile, 'utf8'), saved);
  assert.equal((await f.request('/api/login', { password: chosen })).statusCode, 200);
  assert.equal((await f.request('/api/login', { password: second })).statusCode, 401);
  assert.deepEqual((await readdir(f.directory)).filter(name => name.startsWith('auth.json.')), []);
});

test('setup requires exact configured Host and HTTPS Origin and ignores forwarded-header claims', async t => {
  const f = await fixture(t); const chosen = password(); const data = { password: chosen, confirmation: chosen };
  for (const options of [
    { origin: null }, { origin: 'http://command-center.example' }, { origin: 'https://unrelated.example' },
    { host: 'localhost:4242' }, { host: 'command-center.example:444' }, { host: 'unrelated.example' },
    { host: 'localhost:4242', origin: 'http://localhost:4242', headers: { 'x-forwarded-host': 'command-center.example', 'x-forwarded-proto': 'https' } },
  ]) {
    const rejected = await f.request('/api/setup', data, options);
    assert.equal(rejected.statusCode, 403, JSON.stringify(options));
    assert.equal(rejected.headers['set-cookie'], undefined);
  }
  assert.equal((await f.request('/api/setup', data, { type: 'text/plain' })).statusCode, 415);
  await assert.rejects(lstat(f.authFile), { code: 'ENOENT' });
});

test('setup validates both fields, bounded JSON and the existing request rate limit before saving', async t => {
  const f = await fixture(t); const chosen = password();
  for (const data of [null, {}, { password: chosen }, { password: 12, confirmation: 12 }, { password: 'short', confirmation: 'short' }, { password: 'x'.repeat(4097), confirmation: 'x'.repeat(4097) }, { password: chosen, confirmation: chosen + 'x' }]) {
    assert.equal((await f.request('/api/setup', data)).statusCode, 400);
  }
  assert.equal((await f.request('/api/setup', undefined, { raw: 'invalid JSON' })).statusCode, 400);
  assert.equal((await f.request('/api/setup', undefined, { raw: ' '.repeat(65_537) })).statusCode, 413);
  assert.equal((await f.request('/api/setup', {})).statusCode, 400);
  const limited = await f.request('/api/setup', { password: chosen, confirmation: chosen });
  assert.equal(limited.statusCode, 429); assert.equal(limited.headers['set-cookie'], undefined);
  await assert.rejects(lstat(f.authFile), { code: 'ENOENT' });
  for (const length of [12, 4096]) {
    const boundary = await fixture(t); const value = 'x'.repeat(length);
    assert.equal((await boundary.request('/api/setup', { password: value, confirmation: value })).statusCode, 200);
    assert.equal((await loadPassword(boundary.authFile))(value), true);
  }
});

test('independent servers racing first setup cannot replace the winning password or authenticate the loser', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-first-password-race-'));
  const first = await fixture(t, { directory }); const second = await fixture(t, { directory });
  t.after(async () => { await first.app.close(); await second.app.close(); await rm(directory, { recursive: true, force: true }); });
  const candidates = [password(), password()];
  const results = await Promise.all([first, second].map((f, index) => f.request('/api/setup', { password: candidates[index], confirmation: candidates[index] })));
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 409]);
  const winner = results.findIndex(result => result.statusCode === 200); const loser = 1 - winner;
  assert.equal(results[loser].headers['set-cookie'], undefined);
  const verify = await loadPassword(first.authFile);
  assert.equal(verify(candidates[winner]), true); assert.equal(verify(candidates[loser]), false);
  const losingServer = [first, second][loser];
  assert.equal((await losingServer.request('/api/login', { password: candidates[loser] })).statusCode, 401);
  assert.equal((await losingServer.request('/api/login', { password: candidates[winner] })).statusCode, 200);
  assert.equal((await losingServer.request('/api/session')).json().setupRequired, undefined);
  assert.deepEqual((await readdir(directory)).filter(name => name.startsWith('auth.json.')), []);
});

test('existing and externally initialized authentication disables enrollment and keeps normal login shape', async t => {
  for (const existingAtStartup of [true, false]) {
    const chosen = password();
    const f = await fixture(t, { prepare: existingAtStartup ? auth => setPassword(chosen, auth) : undefined });
    if (!existingAtStartup) await setPassword(chosen, f.authFile);
    const saved = await readFile(f.authFile, 'utf8');
    const session = (await f.request('/api/session')).json();
    assert.deepEqual(Object.keys(session).sort(), ['authenticated', 'version']);
    assert.equal((await f.request('/api/setup', { password: password(), confirmation: password() })).statusCode, 409);
    assert.equal(await readFile(f.authFile, 'utf8'), saved);
    assert.equal((await f.request('/api/login', { password: chosen })).statusCode, 200);
  }
});

test('unsafe existing auth is never treated as a fresh setup or replaced', async t => {
  for (const kind of ['corrupt', 'public', 'directory', 'symlink', 'broken-symlink']) {
    await assert.rejects(fixture(t, { prepare: async (auth, directory) => {
      if (kind === 'directory') return mkdir(auth);
      if (kind === 'broken-symlink') return symlink(join(directory, 'missing-target'), auth);
      if (kind === 'symlink') {
        const target = join(directory, 'existing-auth.json'); await setPassword(password(), target); return symlink(target, auth);
      }
      await writeFile(auth, kind === 'corrupt' ? 'not JSON' : '{}', { mode: 0o600 });
      if (kind === 'public') await chmod(auth, 0o644);
    } }), /JSON|private|symbolic link/);
  }
  const directory = await mkdtemp(join(tmpdir(), 'ccng-first-password-path-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const alias = join(directory, 'checkout'); await symlink(fileURLToPath(new URL('..', import.meta.url)), alias);
  await assert.rejects(setPassword(password(), join(alias, 'auth.json'), { createOnly: true }), /outside the application checkout/);
});
