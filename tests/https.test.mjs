import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../server/main.mjs';
import { loadPassword, setPassword } from '../server/auth.mjs';
import { Workspace } from '../server/workspace.mjs';

const run = promisify(execFile);
async function fixture(tlsEnabled = true, overrides = {}, selection, { fresh = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-real-tls-'));
  const certPath = join(directory, 'cert.pem'); const keyPath = join(directory, 'key.pem');
  let app;
  try {
    await run('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,DNS:command-center.example,IP:127.0.0.1,IP:2001:db8::15'], { timeout: 10000 });
    const ca = await readFile(certPath);
    const password = randomBytes(24).toString('base64url'); const authFile = join(directory, 'auth.json');
    if (!fresh) await setPassword(password, authFile);
    const rpc = new EventEmitter(); rpc.ready = false; rpc.close = () => {};
    const workspace = new Workspace(rpc, { beads: null });
    app = await createApp({ rpc, workspace, authFile, config: { host: '127.0.0.1', protocol: tlsEnabled ? 'https' : 'http', tlsCert: certPath, tlsKey: keyPath, ...overrides } });
    if (selection) await app.listen(selection, 0);
    else await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
    const port = app.server.address().port; const origin = `${tlsEnabled ? 'https' : 'http'}://127.0.0.1:${port}`;
    const request = (path, data, headers = {}, trust = true, address = '127.0.0.1') => new Promise((resolve, reject) => {
      // Keep TLS identity fixed while independently testing the HTTP Host header.
      const client = (tlsEnabled ? https : http).request({ hostname: address, port, path, method: data === undefined ? 'GET' : 'POST', ...(tlsEnabled ? { servername: 'localhost', ...(trust ? { ca } : {}) } : {}),
        headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin }), ...headers } }, response => {
        let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
      });
      client.setTimeout(5000, () => client.destroy(new Error('Fixture request timed out'))); client.on('error', reject);
      client.end(data === undefined ? undefined : JSON.stringify(data));
    });
    return { app, ca, port, origin, password, authFile, certPath, keyPath, request, close: async () => { await app.close(); await rm(directory, { recursive: true, force: true }); } };
  } catch (error) { await app?.close(); await rm(directory, { recursive: true, force: true }); throw error; }
}

test('real HTTPS keeps certificate verification, mandatory login, secure cookies and origin/host guards', async () => {
  const f = await fixture();
  try {
    assert.equal(f.app.settings.https, true);
    assert.match(f.app.settings.certificate.subject, /localhost/);
    assert.equal((await f.request('/healthz')).status, 200);
    await assert.rejects(f.request('/healthz', undefined, {}, false), /self.signed|certificate/i);
    assert.equal((await f.request('/api/state')).status, 401);
    assert.equal((await f.request('/api/login', { password: 'not-the-password' })).status, 401);
    assert.equal((await f.request('/api/login', { password: f.password }, { Origin: 'https://unrelated.example' })).status, 403);
    assert.equal((await f.request('/api/login', { password: f.password }, { Origin: f.origin.replace('https:', 'http:') })).status, 403);
    assert.equal((await f.request('/healthz', undefined, { Host: 'unrelated.example' })).status, 403);
    const login = await f.request('/api/login', { password: f.password }); assert.equal(login.status, 200);
    const cookie = login.headers['set-cookie'][0];
    assert.match(cookie, /; Secure/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
    assert.equal((await f.request('/api/state', undefined, { Cookie: cookie })).status, 200);
    const logout = await f.request('/api/logout', {}, { Cookie: cookie });
    assert.equal(logout.status, 200); assert.match(logout.headers['set-cookie'][0], /; Secure/);
    assert.equal((await f.request('/api/state', undefined, { Cookie: cookie })).status, 401);
  } finally { await f.close(); }
});

test('real trusted HTTPS first-password setup creates a session and cannot replace established authentication', async () => {
  const publicOrigin = 'https://command-center.example';
  const f = await fixture(true, { publicOrigin, firstPasswordSetup: 'htpasswd-proxy' }, undefined, { fresh: true });
  try {
    const headers = { Host: 'command-center.example', Origin: publicOrigin };
    const chosen = randomBytes(24).toString('base64url');
    const proposed = { password: chosen, confirmation: chosen };
    await assert.rejects(readFile(f.authFile), { code: 'ENOENT' });
    await assert.rejects(f.request('/api/session', undefined, headers, false), /self.signed|certificate/i);
    const session = await f.request('/api/session', undefined, headers);
    assert.equal(session.status, 200);
    assert.equal(JSON.parse(session.body).setupRequired, true);
    assert.equal(JSON.parse(session.body).setupAllowed, true);
    assert.equal(session.headers['set-cookie'], undefined);
    assert.equal((await f.request('/api/state', undefined, headers)).status, 401);
    const localSetup = await f.request('/api/setup', proposed, { Host: `localhost:${f.port}`, Origin: `https://localhost:${f.port}` });
    assert.equal(localSetup.status, 403);
    assert.equal(localSetup.headers['set-cookie'], undefined);
    await assert.rejects(readFile(f.authFile), { code: 'ENOENT' });

    const setup = await f.request('/api/setup', proposed, headers);
    assert.equal(setup.status, 200);
    assert.deepEqual(JSON.parse(setup.body), { authenticated: true });
    assert.equal(JSON.stringify(setup).includes(chosen), false, 'the chosen password is never returned');
    const cookie = setup.headers['set-cookie'][0];
    for (const flag of ['; Secure', 'HttpOnly', 'SameSite=Strict']) assert.ok(cookie.includes(flag));
    const saved = await readFile(f.authFile, 'utf8');
    assert.equal(saved.includes(chosen), false);
    assert.equal((await loadPassword(f.authFile))(chosen), true);
    const state = await f.request('/api/state', undefined, { ...headers, Cookie: cookie });
    assert.equal(state.status, 200);
    assert.equal(state.body.includes(cookie.split(';')[0].split('=')[1]), false, 'authenticated state does not expose its session token');
    assert.equal(state.body.includes(JSON.parse(saved).hash), false, 'authenticated state does not expose the stored password hash');
    assert.equal((await f.request('/api/state', undefined, headers)).status, 401);

    const replacement = randomBytes(24).toString('base64url');
    const repeated = await f.request('/api/setup', { password: replacement, confirmation: replacement }, headers);
    assert.equal(repeated.status, 409);
    assert.equal(repeated.headers['set-cookie'], undefined);
    assert.equal(await readFile(f.authFile, 'utf8'), saved);
    assert.equal((await f.request('/api/login', { password: replacement }, headers)).status, 401);
    assert.equal((await f.request('/api/login', { password: chosen }, headers)).status, 200);
  } finally { await f.close(); }
});

test('real authenticated HTTPS event stream delivers snapshots and a separate named transport heartbeat', async () => {
  const f = await fixture();
  try {
    const login = await f.request('/api/login', { password: f.password });
    const cookie = login.headers['set-cookie'][0];
    await new Promise((resolve, reject) => {
      let initial = false; let bytes = '';
      const request = https.get({ hostname: '127.0.0.1', port: f.port, path: '/api/events', ca: f.ca, headers: { Cookie: cookie } }, response => {
        assert.equal(response.statusCode, 200); assert.match(response.headers['content-type'], /text\/event-stream/);
        response.setEncoding('utf8');
        response.on('data', chunk => {
          bytes += chunk;
          if (!initial && bytes.includes('data: ')) {
            initial = true; f.app.workspace.error = 'synthetic streamed update'; f.app.workspace.changed();
          }
          if (bytes.includes('synthetic streamed update') && /event: heartbeat\ndata: \{"at":"[^\n]+"\}\n\n/.test(bytes)) { response.destroy(); request.destroy(); resolve(); }
        });
        response.on('error', reject);
      });
      request.setTimeout(20000, () => request.destroy(new Error('No HTTPS stream heartbeat'))); request.on('error', reject);
    });
  } finally { await f.close(); }
});

test('explicit HTTP remains usable for local/proxy debugging without forcing secure cookies', async () => {
  const f = await fixture(false);
  try {
    assert.equal(f.app.settings.https, false);
    const login = await f.request('/api/login', { password: f.password }); assert.equal(login.status, 200);
    assert.doesNotMatch(login.headers['set-cookie'][0], /; Secure/);
  } finally { await f.close(); }
});

test('HTTPS tunnel login and authenticated writes coexist with an exact configured public origin', async () => {
  const publicOrigin = 'https://command-center.example';
  const f = await fixture(true, { publicOrigin });
  try {
    const host = `localhost:${f.port}`; const origin = `https://${host}`;
    const headers = { Host: host, Origin: origin };
    assert.equal((await f.request('/api/state', undefined, { Host: host })).status, 401);
    assert.equal((await f.request('/api/login', { password: 'incorrect-password' }, headers)).status, 401);
    assert.equal((await f.request('/api/login', { password: f.password }, { ...headers, Origin: `https://localhost:${f.port + 1}` })).status, 403);
    assert.equal((await f.request('/api/login', { password: f.password }, { ...headers, Origin: `http://${host}` })).status, 403);
    assert.equal((await f.request('/api/login', { password: f.password }, { ...headers, Origin: 'https://unrelated.example' })).status, 403);
    const login = await f.request('/api/login', { password: f.password }, headers);
    assert.equal(login.status, 200);
    const cookie = login.headers['set-cookie'][0];
    assert.match(cookie, /; Secure/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
    assert.equal((await f.request('/api/state', undefined, { Host: host, Cookie: cookie })).status, 200);
    assert.equal((await f.request('/api/logout', {}, { ...headers, Cookie: cookie })).status, 200);
    assert.equal((await f.request('/api/state', undefined, { Host: host, Cookie: cookie })).status, 401);
    assert.equal((await f.request('/api/login', { password: f.password }, { Host: 'command-center.example', Origin: publicOrigin })).status, 200);
  } finally { await f.close(); }
});

test('dual HTTPS listeners share authentication and retain listener-specific tunnel origin checks', async () => {
  const publicOrigin = 'https://command-center.example';
  const f = await fixture(true, { host: '127.0.0.2', publicOrigin }, { host: '127.0.0.2', automatic: true, interfaceName: 'fixture' });
  try {
    const localHeaders = { Host: `localhost:${f.port}`, Origin: `https://localhost:${f.port}` };
    const login = await f.request('/api/login', { password: f.password }, localHeaders);
    assert.equal(login.status, 200);
    const cookie = login.headers['set-cookie'][0]; assert.match(cookie, /; Secure/);
    const publicHeaders = { Host: 'command-center.example', Origin: publicOrigin, Cookie: cookie };
    assert.equal((await f.request('/api/state', undefined, publicHeaders, true, '127.0.0.2')).status, 200);
    assert.equal((await f.request('/api/login', { password: f.password }, localHeaders, true, '127.0.0.2')).status, 403);
    assert.equal((await f.request('/api/logout', {}, publicHeaders, true, '127.0.0.2')).status, 200);
    assert.equal((await f.request('/api/state', undefined, { ...localHeaders, Cookie: cookie })).status, 401);
  } finally { await f.close(); }
});

test('HTTPS rejects unsuitable names, wildcard origins and insecure public origins before runtime startup', async () => {
  const f = await fixture();
  try {
    const base = { protocol: 'https', tlsCert: f.certPath, tlsKey: f.keyPath };
    await assert.rejects(createApp({ config: { ...base, host: '127.0.0.1', publicOrigin: 'https://unrelated.example' } }), /does not cover/);
    await assert.rejects(createApp({ config: { ...base, host: '0.0.0.0' } }), /public-origin/);
    await assert.rejects(createApp({ config: { ...base, host: '127.0.0.1', publicOrigin: 'http://localhost' } }), /https:\/\//);
  } finally { await f.close(); }
});

test('browser-facing HTTPS rejects a CN-only certificate without matching SANs', async () => {
  const f = await fixture();
  try {
    const directory = await mkdtemp(join(tmpdir(), 'ccng-cn-only-'));
    try {
      const certPath = join(directory, 'cn-only.pem');
      await run('openssl', ['req', '-x509', '-new', '-key', f.keyPath, '-out', certPath, '-days', '2', '-subj', '/CN=localhost'], { timeout: 10000 });
      await assert.rejects(createApp({ config: { host: 'localhost', protocol: 'https', tlsCert: certPath, tlsKey: f.keyPath } }), /subject alternative names/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  } finally { await f.close(); }
});

test('IPv6 Host brackets are normalized without admitting unrelated hosts', async () => {
  // The fixture socket stays on loopback; this isolates configured Host validation.
  const f = await fixture(true, { host: '2001:db8::15' });
  try {
    assert.equal((await f.request('/healthz', undefined, { Host: '[2001:db8::15]' })).status, 200);
    assert.equal((await f.request('/healthz', undefined, { Host: '[2001:db8::16]' })).status, 403);
  } finally { await f.close(); }
});
