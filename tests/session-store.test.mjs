import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir, stat, rm, chmod, symlink, unlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sessions, clearAllLogins, loadAuthState, loadPassword, setPassword } from '../server/auth.mjs';
import { SessionStore, SESSION_LIFETIME_MS } from '../server/session-store.mjs';

const unavailable = error => error.status === 503 && error.code === 'authentication_unavailable';
const changed = error => error.status === 403 && error.code === 'authentication_required';
const request = token => ({ headers: { cookie: `ccng_session=${token}` } });
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-session-store-')); const authFile = join(directory, 'auth.json');
  const password = randomBytes(24).toString('base64url'); await setPassword(password, authFile);
  let now = 1_700_000_000_000;
  const sessions = new Sessions(authFile, { now: () => now }); await sessions.initialize();
  t.after(async () => { await chmod(join(directory, 'sessions'), 0o700).catch(() => {}); await rm(directory, { recursive: true, force: true }); });
  const state = await loadAuthState(authFile);
  return { directory, authFile, password, state, sessions, advance: ms => { now += ms; }, restart: () => new Sessions(authFile, { now: () => now }) };
}

test('opaque cookies persist only as hashed private records and remain valid across server instances', async t => {
  const f = await fixture(t); const token = await f.sessions.create(f.state.fingerprint);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const files = await readdir(join(f.directory, 'sessions'));
  const hashed = createHash('sha256').update(token).digest('hex');
  assert.deepEqual(files.sort(), [hashed + '.json', 'generation.json'].sort());
  for (const name of files) {
    const path = join(f.directory, 'sessions', name); const text = await readFile(path, 'utf8');
    assert.equal(text.includes(token), false); assert.equal(text.includes(f.password), false);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  }
  assert.equal((await stat(join(f.directory, 'sessions'))).mode & 0o777, 0o700);
  const record = JSON.parse(await readFile(join(f.directory, 'sessions', hashed + '.json'), 'utf8'));
  assert.deepEqual(Object.keys(record).sort(), ['authFingerprint', 'expiresAt', 'generation', 'version']);
  assert.equal(await f.restart().valid(request(token)), true);
  assert.equal(await f.sessions.valid(request(hashed)), false, 'the on-disk hash is not a bearer token');
  assert.equal(await f.sessions.valid(request(randomBytes(32).toString('base64url'))), false, 'old RAM-only cookies require one new login');
});

test('sessions use an absolute twelve-hour expiry without sliding during reads or restart', async t => {
  const f = await fixture(t); const token = await f.sessions.create(f.state.fingerprint);
  const file = f.sessions.store.file(token); const before = await readFile(file, 'utf8');
  f.advance(SESSION_LIFETIME_MS - 1);
  assert.equal(await f.restart().valid(request(token)), true);
  assert.equal(await readFile(file, 'utf8'), before);
  f.advance(1);
  assert.equal(await f.sessions.valid(request(token)), false);
  assert.equal(await f.restart().valid(request(token)), false);
});

test('logout revokes the exact session for running peers and subsequent restarts', async t => {
  const f = await fixture(t); const first = await f.sessions.create(f.state.fingerprint); const second = await f.sessions.create(f.state.fingerprint);
  const peer = f.restart(); assert.equal(await peer.valid(request(first)), true);
  await f.sessions.revoke(request(first));
  assert.equal(await peer.valid(request(first)), false); assert.equal(await f.restart().valid(request(first)), false);
  assert.equal(await peer.valid(request(second)), true);
});

test('clear-logins rotates generation for running servers and restarts without reading credentials or stopping work', async t => {
  const f = await fixture(t); const token = await f.sessions.create(f.state.fingerprint); const peer = f.restart();
  const before = await readFile(f.authFile);
  await clearAllLogins(f.authFile);
  assert.equal(await peer.valid(request(token)), false); assert.equal(await f.restart().valid(request(token)), false);
  assert.deepEqual(await readFile(f.authFile), before);
  const fresh = await peer.create(f.state.fingerprint);
  assert.equal(await f.sessions.valid(request(fresh)), true);
});

test('password rotation invalidates old sessions and cached verifiers cannot mint new ones', async t => {
  const f = await fixture(t); const token = await f.sessions.create(f.state.fingerprint);
  const replacement = randomBytes(24).toString('base64url'); await setPassword(replacement, f.authFile);
  assert.equal(f.state.verify(f.password), true, 'the old verifier remains a real stale-password regression fixture');
  assert.equal(await f.sessions.valid(request(token)), false);
  await assert.rejects(f.sessions.create(f.state.fingerprint), changed);
  const current = await loadAuthState(f.authFile); assert.notEqual(current.fingerprint, f.state.fingerprint);
  assert.equal(current.verify(replacement), true); assert.equal((await loadPassword(f.authFile))(replacement), true);
  const fresh = await f.sessions.create(current.fingerprint); assert.equal(await f.restart().valid(request(fresh)), true);
});

test('restoring identical authentication bytes still changes the exact file revision', async t => {
  const f = await fixture(t); const token = await f.sessions.create(f.state.fingerprint); const bytes = await readFile(f.authFile);
  await setPassword(randomBytes(24).toString('base64url'), f.authFile); await writeFile(f.authFile, bytes);
  assert.equal((await loadPassword(f.authFile))(f.password), true);
  assert.notEqual((await loadAuthState(f.authFile)).fingerprint, f.state.fingerprint);
  assert.equal(await f.sessions.valid(request(token)), false);
});

test('password or generation changes while a session is being saved prevent a cookie grant', async t => {
  for (const rotatePassword of [false, true]) {
    const f = await fixture(t); let reads = 0;
    const store = new SessionStore(join(f.directory, 'sessions'), async () => {
      if (++reads === 2) {
        if (rotatePassword) await setPassword(randomBytes(24).toString('base64url'), f.authFile);
        else await clearAllLogins(f.authFile);
      }
      return loadAuthState(f.authFile);
    });
    await assert.rejects(store.create(f.state.fingerprint), changed);
    assert.deepEqual(await readdir(join(f.directory, 'sessions')), ['generation.json']);
  }
});

test('a generation change during validation invalidates the already-running server check', async t => {
  const f = await fixture(t); const token = await f.sessions.create(f.state.fingerprint);
  const store = new SessionStore(join(f.directory, 'sessions'), async () => { await clearAllLogins(f.authFile); return loadAuthState(f.authFile); });
  assert.equal(await store.valid(token), false);
});

test('concurrent fresh processes share one generation and persist independent sessions safely', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-session-race-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const authFile = join(directory, 'auth.json'); await setPassword(randomBytes(24).toString('base64url'), authFile);
  const state = await loadAuthState(authFile); const stores = [new Sessions(authFile), new Sessions(authFile)];
  await Promise.all(stores.map(store => store.initialize()));
  const tokens = await Promise.all(stores.map(store => store.create(state.fingerprint)));
  assert.notEqual(tokens[0], tokens[1]);
  for (const token of tokens) for (const store of stores) assert.equal(await store.valid(request(token)), true);
});

test('corrupt, unsafe or missing persistent state fails visibly without a memory fallback', async t => {
  for (const kind of ['corrupt-generation', 'corrupt-session', 'public-session', 'session-symlink', 'generation-symlink', 'missing-generation', 'public-directory']) {
    const f = await fixture(t); const token = await f.sessions.create(f.state.fingerprint);
    const folder = join(f.directory, 'sessions'); const file = f.sessions.store.file(token); const generation = join(folder, 'generation.json');
    if (kind === 'corrupt-generation') await writeFile(generation, 'not JSON');
    if (kind === 'corrupt-session') await writeFile(file, 'null');
    if (kind === 'public-session') await chmod(file, 0o644);
    if (kind === 'public-directory') await chmod(folder, 0o755);
    if (kind === 'missing-generation') await unlink(generation);
    if (kind.endsWith('symlink')) {
      const target = kind === 'session-symlink' ? file : generation;
      const external = join(f.directory, 'linked-state'); await writeFile(external, await readFile(target), { mode: 0o600 });
      await unlink(target); await symlink(external, target);
    }
    await assert.rejects(f.sessions.valid(request(token)), unavailable);
    if (kind !== 'corrupt-session' && kind !== 'public-session' && kind !== 'session-symlink') await assert.rejects(f.restart().initialize(), unavailable);
  }
});

test('session-directory symlinks and failed writes never expose a cookie or alter outside targets', async t => {
  const f = await fixture(t); const folder = join(f.directory, 'sessions');
  await chmod(folder, 0o500);
  await assert.rejects(f.sessions.create(f.state.fingerprint), unavailable);
  await chmod(folder, 0o700);
  const separate = join(f.directory, 'external'); await mkdir(separate, { mode: 0o700 });
  await rm(folder, { recursive: true }); await symlink(separate, folder);
  await assert.rejects(f.restart().initialize(), unavailable);
  assert.deepEqual(await readdir(separate), []);
});
