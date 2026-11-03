import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const defaultAuthFile = () => join(process.env.CCNG_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'command-center-ng'), 'auth.json');
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function setPassword(password, file = defaultAuthFile()) {
  if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
  if (resolve(file).startsWith(sourceRoot + sep)) throw new Error('Store authentication outside the application checkout.');
  const salt = randomBytes(24).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.' + randomBytes(8).toString('hex');
  await writeFile(temporary, JSON.stringify({ version: 1, salt, hash }) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(temporary, file);
}

export async function loadPassword(file = defaultAuthFile()) {
  const info = await stat(file);
  if (info.mode & 0o077) throw new Error('Authentication file must be private (chmod 600).');
  if (process.getuid && info.uid !== process.getuid()) throw new Error('Authentication file must belong to the current user.');
  const data = JSON.parse(await readFile(file, 'utf8'));
  if (data.version !== 1 || !/^[a-f0-9]{48}$/.test(data.salt) || !/^[a-f0-9]{128}$/.test(data.hash)) throw new Error('Invalid authentication file. Run npm run password.');
  return password => {
    const candidate = scryptSync(password, data.salt, 64);
    return timingSafeEqual(candidate, Buffer.from(data.hash, 'hex'));
  };
}

export class Sessions {
  constructor() { this.sessions = new Map(); this.attempts = new Map(); }
  create() {
    const token = randomBytes(32).toString('base64url');
    this.sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
    return token;
  }
  token(request) { return (request.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('ccng_session='))?.slice(13); }
  valid(request) {
    const token = this.token(request);
    const expires = this.sessions.get(token);
    if (!expires || expires < Date.now()) { this.sessions.delete(token); return false; }
    return true;
  }
  revoke(request) { this.sessions.delete(this.token(request)); }
  allowAttempt(address) {
    const now = Date.now();
    const record = this.attempts.get(address);
    if (!record || record.until < now) { this.attempts.set(address, { count: 1, until: now + 300_000 }); return true; }
    return ++record.count <= 10;
  }
  cookie(token, secure = false) { return `ccng_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? 43200 : 0}${secure ? '; Secure' : ''}`; }
}
