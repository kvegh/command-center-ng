import limits from './limits.json' with { type: 'json' };
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, rename, stat, unlink, realpath } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPORT_INTERVALS } from './worker-instructions.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id) && !['constructor', 'prototype'].includes(id);
export const emptyWorkspace = () => ({ version: 1, workerIds: [], coordinatorId: null, coordinatorPaused: false });
export function workspaceRecord(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.workerIds) || data.workerIds.length > limits.maxWorkers || data.workerIds.some(id => !validId(id)) || new Set(data.workerIds).size !== data.workerIds.length || (data.coordinatorId !== null && !validId(data.coordinatorId)) || typeof data.coordinatorPaused !== 'boolean' || data.workerIds.includes(data.coordinatorId)) throw new Error('Invalid saved workspace. Move the private workspace file aside to start a fresh workspace.');
  const intervals = data.workerReportIntervals;
  if (intervals !== undefined && (!intervals || typeof intervals !== 'object' || Array.isArray(intervals) || Object.entries(intervals).some(([id, minutes]) => !data.workerIds.includes(id) || !REPORT_INTERVALS.includes(minutes)))) throw new Error('Invalid saved workspace report settings.');
  const enabled = Object.fromEntries(Object.entries(intervals || {}).filter(([, minutes]) => minutes));
  return { version: 1, workerIds: [...data.workerIds], coordinatorId: data.coordinatorId, coordinatorPaused: data.coordinatorPaused, ...(Object.keys(enabled).length ? { workerReportIntervals: enabled } : {}) };
}
export class WorkspaceStore {
  constructor(file) {
    this.file = resolve(file); this.queue = Promise.resolve();
    if (this.file.startsWith(appRoot + sep) || this.file === appRoot) throw new Error('Store workspace state outside the application checkout.');
  }
  async load() {
    let handle;
    try {
      const directory = await realpath(dirname(this.file));
      if (directory === appRoot || directory.startsWith(appRoot + sep)) throw new Error('Store workspace state outside the application checkout.');
      handle = await open(this.file, constants.O_RDONLY | constants.O_NOFOLLOW);
      const info = await handle.stat();
      if (!info.isFile() || info.size > 8192 || info.mode & 0o077 || (process.getuid && info.uid !== process.getuid())) throw new Error('Workspace file must be a small private file owned by the current user (mode 600).');
      let data;
      try { data = JSON.parse(await handle.readFile('utf8')); } catch { throw new Error('Saved workspace contains invalid JSON.'); }
      return workspaceRecord(data);
    } catch (error) { if (error.code === 'ENOENT') return emptyWorkspace(); throw error; }
    finally { await handle?.close(); }
  }
  save(value) {
    const data = JSON.stringify(workspaceRecord(value)) + '\n';
    const job = this.queue.then(async () => {
      await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
      const directory = await stat(dirname(this.file));
      if (directory.mode & 0o022 || (process.getuid && directory.uid !== process.getuid())) throw new Error('Workspace directory must be owned by the current user and not writable by other users.');
      let temporary;
      try {
        // Validate the existing file before replacement, including its ownership.
        await this.load();
        temporary = this.file + '.' + randomBytes(8).toString('hex');
        const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
        try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
        await rename(temporary, this.file); temporary = null;
      } finally { if (temporary) await unlink(temporary).catch(() => {}); }
    });
    this.queue = job.catch(() => {}); return job;
  }
}

export class WorkspacePersistence {
  constructor(workspace, store) {
    this.workspace = workspace; this.store = store; this.saved = emptyWorkspace(); this.loaded = false; this.ready = false;
    this.job = null; this.queue = Promise.resolve(); this.lastScheduled = ''; this.failedIds = []; this.closed = false; this.fileError = false;
    this.restoreAfterConnect = false;
    this.onChange = () => this.schedule(); this.onConnect = () => {
      if (this.job) { this.restoreAfterConnect = true; return; }
      if (this.failedIds.length || (this.saved.coordinatorId && !this.workspace.agents.has(this.saved.coordinatorId))) this.ready = false;
      void this.restore();
    };
    workspace.on('change', this.onChange); workspace.rpc.on('connected', this.onConnect);
    workspace.restoration = { status: 'pending', error: null, warnings: [] };
  }
  async initialize() {
    try { this.saved = await this.store.load(); }
    catch (error) { this.fileError = true; this.workspace.restoration = { status: 'error', error: 'Workspace restoration is unavailable: ' + error.message, warnings: [] }; }
    this.loaded = true;
    if (!this.fileError && this.workspace.available()) void this.restore();
  }
  async restore() {
    if (this.job) return this.job;
    if (!this.loaded || this.fileError || this.ready || this.closed || !this.workspace.available()) return;
    this.job = (async () => {
      const workspace = this.workspace; workspace.restoring = true; workspace.restoration = { status: 'restoring', error: null, warnings: [] }; workspace.changed();
      const warnings = []; this.failedIds = [];
      if (workspace.coordinator) {
        if (!workspace.coordinator.id && this.saved.coordinatorId) workspace.coordinator.id = this.saved.coordinatorId;
        if (workspace.coordinator.id === this.saved.coordinatorId) workspace.coordinator.paused = this.saved.coordinatorPaused;
      }
      for (const id of this.saved.workerIds) {
        if (this.closed || !workspace.available()) break;
        if (!workspace.readyFor(id)) { this.failedIds.push(id); warnings.push({ id, message: 'Connect to the native runtime to restore this conversation.' }); continue; }
        try { await workspace.open(id, { observeOnly: true }); const minutes = this.saved.workerReportIntervals?.[id] || 0; if (workspace.coordinator && workspace.agent(id).reportIntervalMinutes !== minutes) workspace.coordinator.setReportInterval(id, minutes); }
        catch (error) { this.failedIds.push(id); warnings.push({ id, message: error.message }); }
      }
      if (this.saved.coordinatorId && workspace.coordinator && !this.closed && workspace.rpc.ready) {
        try { await workspace.open(this.saved.coordinatorId, { observeOnly: true }); const agent = workspace.agent(this.saved.coordinatorId); agent.name = 'Coordinator'; agent.goal = 'Coordinate open workers, summarize progress, and review authorized actions.'; }
        catch (error) { workspace.coordinator.error = 'Saved coordinator could not be restored: ' + error.message; warnings.push({ id: this.saved.coordinatorId, message: error.message }); }
      }
      if (!workspace.available() || this.closed) { workspace.restoration = { status: 'pending', error: 'Connect to a local agent runtime to restore the saved workspace.', warnings }; return; }
      this.ready = true;
      workspace.restoration = { status: 'ready', error: null, warnings }; workspace.changed();
    })().catch(error => { this.workspace.restoration = { status: 'error', error: error.message, warnings: [] }; }).finally(() => {
      this.workspace.restoring = false; this.job = null; this.workspace.changed();
      if (this.ready && !this.closed && this.workspace.restoration.status === 'ready') {
        this.workspace.coordinator?.reconcileReportSchedules({ startup: true });
        this.workspace.coordinator?.refreshStartupDashboard();
      }
      const retry = this.restoreAfterConnect; this.restoreAfterConnect = false;
      if (retry && !this.closed && this.workspace.rpc.ready) { this.ready = false; queueMicrotask(() => { void this.restore(); }); }
    });
    return this.job;
  }
  record() {
    const workers = [...this.workspace.agents.values()].filter(agent => agent.role !== 'coordinator').map(agent => agent.id);
    const workerIds = [...new Set([...workers, ...this.failedIds])].slice(0, limits.maxWorkers);
    const intervals = Object.fromEntries(workerIds.map(id => [id, this.workspace.agents.get(id)?.reportIntervalMinutes ?? this.saved.workerReportIntervals?.[id] ?? 0]).filter(([, minutes]) => minutes));
    return { version: 1, workerIds, coordinatorId: this.workspace.coordinator?.id || null, coordinatorPaused: this.workspace.coordinator?.paused || false, ...(Object.keys(intervals).length ? { workerReportIntervals: intervals } : {}) };
  }
  async retry() {
    if (!this.fileError && (this.failedIds.length || (this.workspace.coordinator?.id && !this.workspace.agents.has(this.workspace.coordinator.id)))) { this.saved = this.record(); this.ready = false; }
    return this.restore();
  }
  schedule() {
    if (!this.ready || this.closed || this.fileError || this.workspace.restoring) return;
    const value = this.record(); const text = JSON.stringify(value); if (text === this.lastScheduled) return; this.lastScheduled = text;
    const job = this.queue.then(() => this.store.save(value)).then(() => {
      if (this.workspace.restoration.error) { this.workspace.restoration.error = null; this.workspace.changed(); }
    }).catch(error => { this.workspace.restoration.error = 'Workspace could not be saved: ' + error.message; this.workspace.changed(); });
    this.queue = job;
  }
  async close() { this.closed = true; this.workspace.off('change', this.onChange); this.workspace.rpc.off('connected', this.onConnect); await this.queue; }
}
