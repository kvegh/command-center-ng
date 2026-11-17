import limits from './limits.json' with { type: 'json' };
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, rename, stat, unlink, realpath } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPORT_INTERVALS } from './worker-instructions.mjs';
import { isClaudeId, MAX_CLAUDE_BRANCH_LINKS } from './claude.mjs';
import { validateHandoverPath } from './chat-handover.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_WORKSPACE_BYTES = 65_536;
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id) && !['constructor', 'prototype'].includes(id);
export const emptyWorkspace = () => ({ version: 1, workerIds: [], coordinatorId: null, coordinatorPaused: false });
function claudeBranchParents(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Invalid saved workspace Claude branch links.');
  const entries = Object.entries(value);
  if (entries.length > MAX_CLAUDE_BRANCH_LINKS || entries.some(([child, parent]) => !isClaudeId(child) || !isClaudeId(parent))) throw new Error('Invalid saved workspace Claude branch links.');
  // UUID spelling cannot disguise a self-link or a cycle through the same session.
  const parents = new Map(entries.map(([child, parent]) => [child.toLowerCase(), parent.toLowerCase()]));
  if (parents.size !== entries.length) throw new Error('Invalid saved workspace Claude branch links.');
  for (const child of parents.keys()) {
    const path = new Set(); let current = child;
    while (parents.has(current)) {
      if (path.has(current)) throw new Error('Invalid saved workspace Claude branch links: cyclic parent relationship.');
      path.add(current); current = parents.get(current);
    }
  }
  return Object.fromEntries(entries);
}
function workerHandoverImports(value, workerIds) {
  if (value === undefined) return {};
  const plainObject = item => item && typeof item === 'object' && !Array.isArray(item) && [Object.prototype, null].includes(Object.getPrototypeOf(item));
  if (!plainObject(value)) throw new Error('Invalid saved workspace handover assignments.');
  const assignments = [];
  for (const [id, assignment] of Object.entries(value)) {
    if (!workerIds.includes(id) || !plainObject(assignment) || Object.keys(assignment).length !== 2
      || !Object.hasOwn(assignment, 'path') || !Object.hasOwn(assignment, 'sourceId')
      || !validId(assignment.sourceId) || assignment.sourceId.toLowerCase() === id.toLowerCase()) throw new Error('Invalid saved workspace handover assignments.');
    let path;
    try { path = validateHandoverPath(assignment.path); }
    catch { throw new Error('Invalid saved workspace handover assignments.'); }
    assignments.push([id, { path, sourceId: assignment.sourceId }]);
  }
  return Object.fromEntries(assignments);
}
function claudePermissionModes(value, workerIds) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Invalid saved workspace Claude permission modes.');
  const entries = Object.entries(value);
  if (entries.some(([id, mode]) => !isClaudeId(id) || !workerIds.includes(id) || !['auto', 'default'].includes(mode))
    || new Set(entries.map(([id]) => id.toLowerCase())).size !== entries.length) throw new Error('Invalid saved workspace Claude permission modes.');
  return Object.fromEntries(entries);
}
export function workspaceRecord(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.workerIds) || data.workerIds.length > limits.maxWorkers || data.workerIds.some(id => !validId(id)) || new Set(data.workerIds).size !== data.workerIds.length || (data.coordinatorId !== null && !validId(data.coordinatorId)) || typeof data.coordinatorPaused !== 'boolean' || data.workerIds.includes(data.coordinatorId)) throw new Error('Invalid saved workspace. Move the private workspace file aside to start a fresh workspace.');
  const intervals = data.workerReportIntervals;
  if (intervals !== undefined && (!intervals || typeof intervals !== 'object' || Array.isArray(intervals) || Object.entries(intervals).some(([id, minutes]) => !data.workerIds.includes(id) || !REPORT_INTERVALS.includes(minutes)))) throw new Error('Invalid saved workspace report settings.');
  const enabled = Object.fromEntries(Object.entries(intervals || {}).filter(([, minutes]) => minutes));
  const parents = claudeBranchParents(data.claudeBranchParents);
  const handovers = workerHandoverImports(data.workerHandoverImports, data.workerIds);
  const modes = claudePermissionModes(data.claudePermissionModes, data.workerIds);
  return { version: 1, workerIds: [...data.workerIds], coordinatorId: data.coordinatorId, coordinatorPaused: data.coordinatorPaused, ...(Object.keys(enabled).length ? { workerReportIntervals: enabled } : {}), ...(Object.keys(parents).length ? { claudeBranchParents: parents } : {}), ...(Object.keys(handovers).length ? { workerHandoverImports: handovers } : {}), ...(Object.keys(modes).length ? { claudePermissionModes: modes } : {}) };
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
      if (!info.isFile() || info.size > MAX_WORKSPACE_BYTES || info.mode & 0o077 || (process.getuid && info.uid !== process.getuid())) throw new Error('Workspace file must be a small private file owned by the current user (mode 600).');
      let data;
      try { data = JSON.parse(await handle.readFile('utf8')); } catch { throw new Error('Saved workspace contains invalid JSON.'); }
      return workspaceRecord(data);
    } catch (error) { if (error.code === 'ENOENT') return emptyWorkspace(); throw error; }
    finally { await handle?.close(); }
  }
  save(value) {
    const data = JSON.stringify(workspaceRecord(value)) + '\n';
    if (Buffer.byteLength(data, 'utf8') > MAX_WORKSPACE_BYTES) throw new Error('Saved workspace exceeds the 64-KiB private metadata limit.');
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
        // Commit the directory entry as well as the file before acknowledging a save.
        const parent = await open(dirname(this.file), constants.O_RDONLY | constants.O_DIRECTORY);
        try { await parent.sync(); } finally { await parent.close(); }
      } finally { if (temporary) await unlink(temporary).catch(() => {}); }
    });
    this.queue = job.catch(() => {}); return job;
  }
}

export class WorkspacePersistence {
  constructor(workspace, store) {
    this.workspace = workspace; this.store = store; this.saved = emptyWorkspace(); this.loaded = false; this.ready = false;
    this.job = null; this.queue = Promise.resolve(); this.lastScheduled = ''; this.failedIds = []; this.closed = false; this.fileError = false;
    this.saveError = null; this.failedSnapshot = '';
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
    try {
      this.saved = await this.store.load();
      // Load links before any saved worker opens. Closed ancestors stay available
      // without reading or resuming their native conversations.
      this.workspace.claudeBranchParents = new Map(Object.entries(this.saved.claudeBranchParents || {}));
      this.workspace.handoverImports = new Map(Object.entries(this.saved.workerHandoverImports || {}));
      // Restore only selected intent; opening saved views still starts no query.
      if (this.workspace.claude) this.workspace.claude.permissionPreferences = new Map(Object.entries(this.saved.claudePermissionModes || {}));
    }
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
    const parents = Object.fromEntries(this.workspace.claudeBranchParents || []);
    const handovers = Object.fromEntries([...(this.workspace.handoverImports || [])]
      .filter(([id]) => workerIds.includes(id))
      .map(([id, assignment]) => [id, { path: assignment.path, sourceId: assignment.sourceId }]));
    const modes = Object.fromEntries([...(this.workspace.claude?.permissionPreferences || [])].filter(([id]) => workerIds.includes(id)));
    return { version: 1, workerIds, coordinatorId: this.workspace.coordinator?.id || null, coordinatorPaused: this.workspace.coordinator?.paused || false, ...(Object.keys(intervals).length ? { workerReportIntervals: intervals } : {}), ...(Object.keys(parents).length ? { claudeBranchParents: parents } : {}), ...(Object.keys(handovers).length ? { workerHandoverImports: handovers } : {}), ...(Object.keys(modes).length ? { claudePermissionModes: modes } : {}) };
  }
  async retry() {
    if (!this.fileError && (this.failedIds.length || (this.workspace.coordinator?.id && !this.workspace.agents.has(this.workspace.coordinator.id)))) { this.saved = this.record(); this.ready = false; }
    return this.restore();
  }
  schedule({ retryFailed = false } = {}) {
    if (!this.ready || this.closed || this.fileError || this.workspace.restoring) return;
    const value = this.record(); const text = JSON.stringify(value);
    if (text === this.lastScheduled && !(retryFailed && this.failedSnapshot === text)) return;
    this.lastScheduled = text; this.failedSnapshot = '';
    const job = this.queue.then(() => this.store.save(value)).then(() => {
      this.saved = value;
      const previousError = this.saveError; this.saveError = null;
      if (previousError && this.workspace.restoration.error === previousError) { this.workspace.restoration.error = null; this.workspace.changed(); }
    }).catch(error => {
      this.failedSnapshot = text; this.saveError = 'Workspace could not be saved: ' + error.message;
      this.workspace.restoration.error = this.saveError; this.workspace.changed();
    });
    this.queue = job;
  }
  async flush() {
    // Native lifecycle success stays separate from persistence failure; never retry native work.
    this.schedule({ retryFailed: true }); await this.queue;
    return this.saveError || (this.fileError ? this.workspace.restoration.error : null);
  }
  async close() { const pending = this.flush(); this.closed = true; this.workspace.off('change', this.onChange); this.workspace.rpc.off('connected', this.onConnect); await pending; }
}
