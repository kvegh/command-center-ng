import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DECISION_HISTORY_LIMIT = 200;
const lineLimit = 16_384;
const sensitive = /-----BEGIN[^\r\n]*PRIVATE KEY-----|\b(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{20,}|\bAKIA[A-Z0-9]{16}\b|\bauthorization\s*:\s*(?:bearer|basic)\s+\S+|\b(?:password|passwd|api[_ -]?key|access[_ -]?token|client[_ -]?secret)\s*[:=]\s*["'][^"'\r\n]{8,}["']/i;
const decisions = new Set(['approve', 'decline', 'ask']);
const outcomes = new Set(['resolved', 'needs_user', 'unconfirmed']);

// A projection, never a serialization of native approval parameters. These
// records explain past decisions; they cannot authorize or replay an action.
export function decisionRecord(value) {
  if (!value || typeof value !== 'object' || value.version !== 1 || !decisions.has(value.decision) || !outcomes.has(value.outcome)) throw new Error('Invalid decision-history record.');
  const text = (key, max, required = true) => {
    const field = value[key];
    if (!required && (field === undefined || field === null)) return null;
    if (typeof field !== 'string' || !field.trim() || field.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(field)) throw new Error('Invalid decision-history field: ' + key + '.');
    if (sensitive.test(field) || /```|~~~/.test(field)) throw new Error('Decision history was not saved because its text appears to contain credentials or code. Review it privately.');
    return field;
  };
  const at = text('at', 40);
  if (!Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) throw new Error('Invalid decision-history timestamp.');
  const requestId = value.requestId;
  if (!(typeof requestId === 'string' && requestId.length > 0 && requestId.length <= 128) && !Number.isSafeInteger(requestId)) throw new Error('Invalid decision-history request reference.');
  return {
    version: 1, id: text('id', 128), at, agentId: text('agentId', 128),
    workerName: text('workerName', 2000), projectName: text('projectName', 255),
    requestSummary: text('requestSummary', 240), decision: value.decision, outcome: value.outcome,
    rationale: text('rationale', 2000), requestId,
    coordinatorId: text('coordinatorId', 128, false), turnId: text('turnId', 128, false),
    itemId: text('itemId', 128, false), authorizationMessageId: text('authorizationMessageId', 128, false),
  };
}

const fingerprint = info => [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(':');
export class DecisionStore {
  constructor(file) {
    this.file = resolve(file); this.queue = Promise.resolve(); this.loading = null;
    this.known = null; this.error = null;
    this.outsideCheckout(this.file);
  }
  outsideCheckout(path) {
    if (path === appRoot || path.startsWith(appRoot + sep)) throw new Error('Store decision history outside the application checkout.');
  }
  async directory(create = false) {
    const directory = dirname(this.file);
    if (create) await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || info.mode & 0o077 || (process.getuid && info.uid !== process.getuid())) throw new Error('Decision-history directory must be an owner-only directory without a symbolic link.');
    this.outsideCheckout(await realpath(directory));
  }
  checkFile(info) {
    if (!info.isFile() || info.nlink !== 1 || info.mode & 0o077 || (process.getuid && info.uid !== process.getuid())) throw new Error('Decision history must be an owner-only regular file without links.');
  }
  load() {
    return this.loading ||= this.read().catch(error => { this.error = error; throw error; });
  }
  async read() {
    let handle;
    try {
      await this.directory();
      handle = await open(this.file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const before = await handle.stat(); this.checkFile(before);
      const recent = []; let pending = ''; let line = 0;
      const stream = handle.createReadStream({ encoding: 'utf8', autoClose: false, highWaterMark: 16_384 });
      for await (const chunk of stream) {
        pending += chunk;
        let newline;
        while ((newline = pending.indexOf('\n')) >= 0) {
          const raw = pending.slice(0, newline); pending = pending.slice(newline + 1); line++;
          try {
            if (Buffer.byteLength(raw) > lineLimit) throw new Error('oversized record');
            recent.push(decisionRecord(JSON.parse(raw)));
          } catch { throw new Error('Decision history contains an invalid record at line ' + line + '. The file was left unchanged.'); }
          if (recent.length > DECISION_HISTORY_LIMIT) recent.shift();
        }
        if (Buffer.byteLength(pending) > lineLimit) throw new Error('Decision history contains an oversized record. The file was left unchanged.');
      }
      if (pending) throw new Error('Decision history has an incomplete final record. The file was left unchanged.');
      const after = await handle.stat();
      if (fingerprint(before) !== fingerprint(after)) throw new Error('Decision history changed while it was read. Restart after checking the private file.');
      this.known = fingerprint(after);
      return recent;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      if (error.code) throw new Error('Cannot read private decision history (' + error.code + '). The file was left unchanged.');
      throw error;
    } finally { await handle?.close(); }
  }
  append(value) {
    const job = this.queue.then(async () => {
      await this.load();
      if (this.error) throw this.error;
      const row = decisionRecord(value);
      const bytes = Buffer.from(JSON.stringify(row) + '\n');
      if (bytes.length > lineLimit) throw new Error('Decision-history record is too large.');
      let handle;
      try {
        await this.directory(true);
        const create = this.known === null ? constants.O_CREAT : 0;
        handle = await open(this.file, constants.O_WRONLY | constants.O_APPEND | create | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
        const info = await handle.stat(); this.checkFile(info);
        if ((this.known === null && info.size !== 0) || (this.known !== null && this.known !== fingerprint(info))) throw new Error('Decision history changed outside this application. Restart after checking the private file; no records were overwritten.');
        // One bounded O_APPEND write; a partial write is never retried or
        // truncated because its bytes may already be part of the history.
        const written = await handle.write(bytes);
        if (written.bytesWritten !== bytes.length) throw new Error('Decision-history write was incomplete. Inspect the private file before restarting.');
        await handle.sync(); this.known = fingerprint(await handle.stat());
        return row;
      } catch (error) {
        this.error = error.code ? new Error('Cannot append private decision history (' + error.code + '). No automatic retry will occur.') : error;
        throw this.error;
      } finally { await handle?.close(); }
    });
    this.queue = job.catch(() => {});
    return job;
  }
  async flush() { await this.queue; }
}
