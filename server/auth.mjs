import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, rename, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionStore } from './session-store.mjs';

export const defaultAuthFile = () => join(process.env.CCNG_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'command-center-ng'), 'auth.json');
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function setPassword(password, file = defaultAuthFile(), { createOnly = false } = {}) {
  if (typeof password !== 'string') throw new Error('Enter a password as text.');
  if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
  if (password.length > 4096) throw new Error('Use a password with at most 4096 characters.');
  if (resolve(file).startsWith(sourceRoot + sep)) throw new Error('Store authentication outside the application checkout.');
  const salt = randomBytes(24).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const directory = await realpath(dirname(file));
  if (directory === sourceRoot || directory.startsWith(sourceRoot + sep)) throw new Error('Store authentication outside the application checkout.');
  if (createOnly) {
    const info = await stat(directory);
    if (info.mode & 0o022 || (process.getuid && info.uid !== process.getuid())) throw new Error('Authentication directory must belong to the current user and not be writable by other users.');
  }
  const temporary = file + '.' + randomBytes(8).toString('hex');
  let created = false;
  try {
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    created = true;
    try { await handle.writeFile(JSON.stringify({ version: 1, salt, hash }) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    // Publish a complete first-password file without replacing another setup's winner.
    if (createOnly) await link(temporary, file);
    else await rename(temporary, file);
  } finally { if (created) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export async function loadAuthState(file = defaultAuthFile(), { allowMissing = false } = {}) {
  let existing;
  try { existing = await lstat(file); }
  catch (error) { if (allowMissing && error.code === 'ENOENT') return null; throw error; }
  if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('Authentication file must be a private regular file, not a symbolic link.');
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let data, bytes, revision;
  try {
    const info = await handle.stat({ bigint: true });
    if (!info.isFile() || info.mode & 0o077n || info.size > 4096n) throw new Error('Authentication file must be a small private regular file (chmod 600).');
    if (process.getuid && info.uid !== BigInt(process.getuid())) throw new Error('Authentication file must belong to the current user.');
    const identify = value => [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(':');
    bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (bytes.length > 4096 || identify(info) !== identify(after)) throw new Error('Authentication changed while it was read. Try again.');
    revision = identify(after);
    try { data = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Invalid authentication JSON file. Run npm run password.'); }
  } finally { await handle.close(); }
  if (!data || data.version !== 1 || !/^[a-f0-9]{48}$/.test(data.salt) || !/^[a-f0-9]{128}$/.test(data.hash)) throw new Error('Invalid authentication file. Run npm run password.');
  const verify = password => {
    const candidate = scryptSync(password, data.salt, 64);
    return timingSafeEqual(candidate, Buffer.from(data.hash, 'hex'));
  };
  return { verify, fingerprint: createHash('sha256').update(bytes).update('\0' + revision).digest('hex') };
}

export async function loadPassword(file = defaultAuthFile(), options) {
  return (await loadAuthState(file, options))?.verify || null;
}

export class Sessions {
  constructor(authFile = defaultAuthFile(), options) {
    this.store = new SessionStore(join(dirname(authFile), 'sessions'), () => loadAuthState(authFile), options);
    this.attempts = new Map();
  }
  initialize() { return this.store.initialize(); }
  create(authFingerprint) { return this.store.create(authFingerprint); }
  token(request) { return (request.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('ccng_session='))?.slice(13); }
  valid(request) { return this.store.valid(this.token(request)); }
  revoke(request) { return this.store.revoke(this.token(request)); }
  allowAttempt(address) {
    const now = Date.now();
    const record = this.attempts.get(address);
    if (!record || record.until < now) { this.attempts.set(address, { count: 1, until: now + 300_000 }); return true; }
    return ++record.count <= 10;
  }
  cookie(token, secure = false) { return `ccng_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? 43200 : 0}${secure ? '; Secure' : ''}`; }
}

export async function clearAllLogins(authFile = defaultAuthFile()) {
  await new Sessions(authFile).store.clear();
}
