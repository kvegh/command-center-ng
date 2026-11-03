import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import WebSocket from 'ws';
import { VERSION } from './version.mjs';

const exec = promisify(execFile);
export class CodexRpc extends EventEmitter {
  constructor({ socketPath, binary = 'codex', timeout = 20_000 } = {}) {
    super(); this.socketPath = socketPath; this.binary = binary; this.timeout = timeout;
    this.pending = new Map(); this.sequence = 0; this.ready = false;
  }
  async connect() {
    if (this.ready) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.open().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async open() {
    let path = this.socketPath;
    if (!path) {
      const { stdout } = await exec(this.binary, ['app-server', 'daemon', 'version'], { timeout: 10_000, maxBuffer: 100_000 });
      const info = JSON.parse(stdout);
      if (info.status !== 'running' || !info.socketPath) throw new Error('Start the Codex daemon first: codex app-server daemon start');
      path = info.socketPath; this.version = info.appServerVersion;
    }
    const socket = new WebSocket(`ws+unix://${path}:/`, { handshakeTimeout: this.timeout, maxPayload: 16 * 1024 * 1024 });
    this.socket = socket;
    socket.on('message', data => { try { this.receive(JSON.parse(data.toString())); } catch (error) { this.emit('protocolError', error.message); } });
    socket.on('close', () => this.disconnected('Codex connection closed. Reconnect to continue.'));
    socket.on('error', error => this.emit('connectionError', error.message));
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    try {
      await this.call('initialize', { clientInfo: { name: 'command-center-ng', title: 'Command Center NG', version: VERSION }, capabilities: { experimentalApi: true } });
      this.send({ method: 'initialized', params: {} });
      this.ready = true; this.emit('connected');
    } catch (error) { socket.close(); throw error; }
  }
  receive(message) {
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id); if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer);
      if (message.error) pending.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
      else pending.resolve(message.result);
    } else if (message.method && message.id !== undefined) this.emit('request', message);
    else if (message.method) this.emit('notification', message);
  }
  send(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('Codex is disconnected.');
    this.socket.send(JSON.stringify(message));
  }
  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex request timed out: ${method}`)); }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  respond(id, result) { this.send({ id, result }); }
  refuse(id, message) { this.send({ id, error: { code: -32601, message } }); }
  disconnected(message) {
    this.ready = false;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
    this.pending.clear(); this.emit('disconnected', message);
  }
  close() { this.socket?.close(); this.disconnected('Connection stopped.'); }
}
