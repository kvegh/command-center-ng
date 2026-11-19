import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';

const failure = message => Object.assign(new Error(message), { status: 503 });
const validId = value => typeof value === 'string' && value.length <= 512 || Number.isSafeInteger(value);

/** ACP v1 stdio transport. It never reconnects, retries requests or runs a shell. */
export class AcpRpc extends EventEmitter {
  constructor({ executable, args = [], cwd, spawnProcess = spawn, timeoutMs = 30_000, maxMessageBytes = 16 * 1024 * 1024, maxPending = 128 } = {}) {
    super(); Object.assign(this, { executable, args, cwd, spawnProcess, timeoutMs, maxMessageBytes, maxPending });
    this.pending = new Map(); this.requests = new Map(); this.sequence = 0; this.closed = false; this.decoder = new TextDecoder('utf-8', { fatal: true }); this.buffer = ''; this.bufferBytes = 0;
  }
  async start() {
    if (this.child || this.closed) throw failure('This Mistral transport cannot be started again.');
    let child;
    try { child = this.spawnProcess(this.executable, this.args, { cwd: this.cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true }); }
    catch { this.disconnected('The local Mistral process could not start.'); throw failure('The local Mistral process could not start.'); }
    this.child = child;
    child.stdout.on('data', chunk => this.receive(chunk));
    // Native diagnostics can contain prompts or credentials. Never forward raw stderr.
    child.stderr.on('data', () => { if (!this.diagnosticSeen) { this.diagnosticSeen = true; this.emit('diagnostic', 'Mistral wrote native diagnostic output; details remain in its native environment.'); } });
    child.stdin.on('error', () => this.disconnected('The local Mistral input stream failed.'));
    child.stdout.on('error', () => this.disconnected('The local Mistral output stream failed.'));
    child.stdout.once('end', () => this.disconnected('The local Mistral output stream ended.'));
    child.once('close', (code, signal) => this.disconnected(`The local Mistral process ended${Number.isInteger(code) ? ` (exit ${code})` : signal ? ' (signal)' : ''}.`));
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', () => { this.disconnected('The local Mistral process failed.'); reject(failure('The local Mistral process failed.')); });
    });
    if (this.closed) throw failure(this.closeReason);
    return this;
  }
  receive(chunk) {
    if (this.closed) return;
    try { this.buffer += this.decoder.decode(chunk, { stream: true }); } catch { return this.protocolFailure(); }
    this.bufferBytes += chunk.length;
    let at;
    while ((at = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, at); this.buffer = this.buffer.slice(at + 1); this.bufferBytes = Buffer.byteLength(this.buffer);
      if (Buffer.byteLength(line) > this.maxMessageBytes) return this.protocolFailure();
      let message;
      try { message = JSON.parse(line); } catch { return this.protocolFailure(); }
      if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') return this.protocolFailure();
      if (typeof message.method === 'string') {
        if (!message.method || message.method.length > 256 || message.params !== undefined && (!message.params || typeof message.params !== 'object' || Array.isArray(message.params))) return this.protocolFailure();
        if (Object.hasOwn(message, 'id')) {
          if (!validId(message.id) || this.requests.has(message.id) || this.requests.size >= this.maxPending) return this.protocolFailure();
          this.requests.set(message.id, message); this.emit('request', message);
        } else this.emit('notification', message);
      } else {
        if (!validId(message.id) || Object.hasOwn(message, 'result') === Object.hasOwn(message, 'error') || Object.hasOwn(message, 'error') && (!message.error || typeof message.error !== 'object' || !Number.isInteger(message.error.code) || typeof message.error.message !== 'string')) return this.protocolFailure();
        const pending = this.pending.get(message.id);
        if (!pending) continue; // Late responses never rebind to a newer request.
        this.pending.delete(message.id); clearTimeout(pending.timer);
        if (message.error) {
          const error = failure(`Mistral rejected ${pending.method}${Number.isInteger(message.error.code) ? ` (ACP ${message.error.code})` : ''}. Check its native configuration and authentication.`);
          error.rpcCode = message.error.code; pending.reject(error);
        } else pending.resolve(message.result);
      }
    }
    if (this.bufferBytes > this.maxMessageBytes) this.protocolFailure();
  }
  protocolFailure() { this.disconnected('Mistral returned an invalid or oversized ACP message.'); this.child?.stdin.destroy(); this.child?.kill('SIGTERM'); }
  write(message) {
    if (this.closed || !this.child?.stdin.writable) return Promise.reject(failure(this.closeReason || 'The local Mistral connection is unavailable.'));
    const line = JSON.stringify(message) + '\n';
    if (Buffer.byteLength(line) > this.maxMessageBytes) return Promise.reject(failure('The Mistral request exceeds the supported message size.'));
    if (this.child.stdin.writableLength + Buffer.byteLength(line) > this.maxMessageBytes * 2) return Promise.reject(failure('The Mistral input stream is full. Wait for its current request.'));
    return new Promise((resolve, reject) => this.child.stdin.write(line, error => error ? reject(failure('Writing the Mistral request failed; execution is unconfirmed.')) : resolve()));
  }
  call(method, params = {}, { timeoutMs = this.timeoutMs } = {}) {
    if (this.closed) return Promise.reject(failure(this.closeReason));
    if (this.pending.size >= this.maxPending) return Promise.reject(failure('Too many Mistral requests are pending.'));
    const id = ++this.sequence;
    let written;
    const promise = new Promise((resolve, reject) => {
      const timer = timeoutMs > 0 ? setTimeout(() => {
        if (!this.pending.delete(id)) return;
        const error = failure(`Mistral did not confirm ${method} before the timeout; its outcome is unknown. Do not retry automatically.`); error.unconfirmed = true; reject(error);
      }, timeoutMs) : null;
      this.pending.set(id, { method, resolve, reject, timer });
      written = this.write({ jsonrpc: '2.0', id, method, params });
      written.catch(error => { const entry = this.pending.get(id); if (entry) { this.pending.delete(id); clearTimeout(timer); reject(error); } });
    });
    promise.written = written; return promise;
  }
  notify(method, params = {}) { return this.write({ jsonrpc: '2.0', method, params }); }
  async respond(id, result) {
    const request = this.requests.get(id); if (!request) throw failure('This Mistral request is no longer current.');
    await this.write({ jsonrpc: '2.0', id, result });
    if (this.requests.get(id) === request) this.requests.delete(id);
  }
  async refuse(id, code = -32601, message = 'This client capability is unavailable.') {
    const request = this.requests.get(id); if (!request) throw failure('This Mistral request is no longer current.');
    await this.write({ jsonrpc: '2.0', id, error: { code, message } });
    if (this.requests.get(id) === request) this.requests.delete(id);
  }
  disconnected(reason) {
    if (this.closed) return;
    this.closed = true; this.closeReason = reason; this.buffer = ''; this.bufferBytes = 0;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(failure(reason + ' Outstanding execution is unconfirmed; it was not retried.')); }
    this.pending.clear(); this.requests.clear(); this.emit('disconnected', failure(reason));
  }
  async close() {
    const child = this.child; this.disconnected('The local Mistral transport was closed.');
    if (!child || child.exitCode !== null && child.exitCode !== undefined) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill('SIGTERM'); resolve(); }, 1000);
      child.once('close', () => { clearTimeout(timer); resolve(); }); child.stdin.end();
    });
  }
}
