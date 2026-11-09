import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, link, unlink } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const opaque = /^[a-f0-9]{64}$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
export const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;
export const authenticationUnavailable = () => Object.assign(new Error('Authentication state is unavailable. Check the private configuration.'), { status: 503, code: 'authentication_unavailable' });
const authenticationChanged = () => Object.assign(new Error('Authentication changed while signing in. Sign in again.'), { status: 403, code: 'authentication_required' });

// Only hashes of opaque cookies reach filenames. The cookie remains a bearer
// secret in the browser; the private records cannot be used as login tokens.
export class SessionStore {
  constructor(directory, readAuthState, { now = Date.now } = {}) {
    this.directory = resolve(directory); this.readAuthState = readAuthState; this.now = now; this.initializing = null;
    this.outsideCheckout(this.directory);
  }
  outsideCheckout(path) {
    if (path === appRoot || path.startsWith(appRoot + sep)) throw authenticationUnavailable();
  }
  async guard(operation) {
    try { return await operation(); }
    catch (error) { if (['authentication_unavailable', 'authentication_required'].includes(error.code)) throw error; throw authenticationUnavailable(); }
  }
  async checkDirectory(create = false) {
    const parent = dirname(this.directory);
    if (create) await mkdir(parent, { recursive: true, mode: 0o700 });
    const parentInfo = await lstat(parent);
    if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || parentInfo.mode & 0o022 || (process.getuid && parentInfo.uid !== process.getuid())) throw authenticationUnavailable();
    this.outsideCheckout(await realpath(parent));
    if (create) { try { await mkdir(this.directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; } }
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink() || info.mode & 0o077 || (process.getuid && info.uid !== process.getuid())) throw authenticationUnavailable();
    this.outsideCheckout(await realpath(this.directory));
  }
  async read(file, allowMissing = false) {
    let handle;
    try {
      handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const info = await handle.stat();
      if (!info.isFile() || info.size > 1024 || info.mode & 0o077 || (process.getuid && info.uid !== process.getuid())) throw authenticationUnavailable();
      const bytes = await handle.readFile('utf8');
      if (Buffer.byteLength(bytes) > 1024) throw authenticationUnavailable();
      const value = JSON.parse(bytes);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw authenticationUnavailable();
      return value;
    } catch (error) { if (allowMissing && error.code === 'ENOENT') return null; throw error; }
    finally { await handle?.close(); }
  }
  async syncDirectory() {
    const handle = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await handle.sync(); } finally { await handle.close(); }
  }
  async write(file, value, replace = false) {
    const temporary = join(this.directory, '.pending-' + randomBytes(16).toString('hex'));
    let created = false;
    try {
      const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); created = true;
      try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); } finally { await handle.close(); }
      if (replace) await rename(temporary, file); else await link(temporary, file);
      await this.syncDirectory();
    } finally { if (created) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  validateGeneration(value) {
    if (!value || value.version !== 1 || !opaque.test(value.generation) || Object.keys(value).some(key => !['version', 'generation'].includes(key))) throw authenticationUnavailable();
    return value.generation;
  }
  initialize() {
    return this.initializing ||= this.guard(async () => {
      await this.checkDirectory(true);
      const file = join(this.directory, 'generation.json');
      const existing = await this.read(file, true);
      if (existing) { this.validateGeneration(existing); return; }
      if ((await readdir(this.directory)).some(name => !name.startsWith('.pending-'))) {
        // Another startup may have published its marker since our first read.
        const raced = await this.read(file, true);
        if (raced) { this.validateGeneration(raced); return; }
        throw authenticationUnavailable();
      }
      try { await this.write(file, { version: 1, generation: randomBytes(32).toString('hex') }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      this.validateGeneration(await this.read(file));
    });
  }
  async generation() {
    await this.checkDirectory();
    return this.validateGeneration(await this.read(join(this.directory, 'generation.json')));
  }
  file(token) { return join(this.directory, createHash('sha256').update(token).digest('hex') + '.json'); }
  validateSession(value) {
    if (!value || value.version !== 1 || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= 0 || !opaque.test(value.authFingerprint) || !opaque.test(value.generation) || Object.keys(value).some(key => !['version', 'expiresAt', 'authFingerprint', 'generation'].includes(key))) throw authenticationUnavailable();
    return value;
  }
  create(authFingerprint) {
    return this.guard(async () => {
      await this.initialize();
      if (!opaque.test(authFingerprint) || (await this.readAuthState())?.fingerprint !== authFingerprint) throw authenticationChanged();
      const generation = await this.generation();
      const token = randomBytes(32).toString('base64url'); const file = this.file(token);
      await this.write(file, { version: 1, expiresAt: this.now() + SESSION_LIFETIME_MS, authFingerprint, generation });
      if ((await this.readAuthState())?.fingerprint !== authFingerprint || await this.generation() !== generation) {
        await unlink(file); await this.syncDirectory(); throw authenticationChanged();
      }
      return token;
    });
  }
  valid(token) {
    return this.guard(async () => {
      if (typeof token !== 'string' || !tokenPattern.test(token)) return false;
      await this.initialize();
      const generation = await this.generation();
      const stored = await this.read(this.file(token), true); if (!stored) return false;
      const session = this.validateSession(stored);
      if (session.expiresAt <= this.now() || session.generation !== generation) return false;
      const auth = await this.readAuthState();
      return auth?.fingerprint === session.authFingerprint && await this.generation() === generation;
    });
  }
  revoke(token) {
    return this.guard(async () => {
      if (typeof token !== 'string' || !tokenPattern.test(token)) return;
      await this.initialize(); await this.checkDirectory();
      const file = this.file(token); const stored = await this.read(file, true);
      if (!stored) return;
      this.validateSession(stored);
      await unlink(file); await this.syncDirectory();
    });
  }
  clear() {
    return this.guard(async () => {
      await this.initialize(); await this.generation();
      await this.write(join(this.directory, 'generation.json'), { version: 1, generation: randomBytes(32).toString('hex') }, true);
    });
  }
}
