import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const fail = (message, status = 502, code) => Object.assign(new Error(message), { status, code });
const states = { in_progress: 0, blocked: 1, open: 2, deferred: 3, closed: 4 };
export function sessionLabel(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw fail('Invalid conversation ID.', 400);
  return 'ccng-session:' + id;
}
function issueIds(ids) {
  if (!Array.isArray(ids) || ids.length > 50 || ids.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(id))) throw fail('Choose up to 50 valid Beads task IDs.', 400);
  return [...new Set(ids)];
}
function issue(row) {
  if (!row || typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.status !== 'string') throw fail('Beads returned an invalid task record.');
  return { id: row.id, text: row.title.replace(/\s+/g, ' ').trim().slice(0, 200), state: row.status, assignee: row.assignee || null, priority: Number.isInteger(row.priority) ? row.priority : 2, parentId: row.parent || null, updatedAt: row.updated_at || null };
}
export function activeTasks(rows) {
  return rows.filter(task => task.state !== 'closed').sort((a, b) => (states[a.state] ?? 3) - (states[b.state] ?? 3) || a.priority - b.priority || a.id.localeCompare(b.id));
}

export class BeadsTasks {
  constructor({ binary = 'bd', run = execute } = {}) { this.binary = binary; this.run = run; this.queue = Promise.resolve(); }
  async command(cwd, args, { readonly = true } = {}) {
    try {
      const job = this.queue.then(() => this.run(this.binary, ['--sandbox', ...(readonly ? ['--readonly'] : []), ...args], { cwd, timeout: 10_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, BD_LAST_TOUCHED_FALLBACK: '0', NO_COLOR: '1' } }));
      this.queue = job.then(() => undefined, () => undefined);
      const { stdout } = await job;
      return stdout;
    } catch (error) {
      if (error.code === 'ENOENT') throw fail('Beads (bd) is required. Install it on this machine and ensure it is on PATH.', 503, 'BEADS_MISSING');
      const detail = String(error.stderr || error.message || '').trim().slice(0, 600);
      throw fail('The project’s Beads command failed. ' + detail, 503, 'BEADS_UNAVAILABLE');
    }
  }
  async checkAvailable(cwd) {
    const version = (await this.command(cwd, ['version'])).trim();
    if (!/\bbd\s+version\s+\d+\./i.test(version)) throw fail('The bd executable did not identify itself as Beads.', 503, 'BEADS_VERSION');
    const help = await this.command(cwd, ['list', '--help']);
    if (['--json', '--readonly', '--brief', '--flat'].some(flag => !help.includes(flag))) throw fail('Update Beads: this integration requires JSON, read-only, brief, and flat list support.', 503, 'BEADS_VERSION');
    return version;
  }
  async list(cwd, filters = []) {
    const text = await this.command(cwd, ['list', '--json', '--brief', '--flat', '--all', '--limit', '1000', ...filters]);
    let rows;
    try { rows = JSON.parse(text); } catch { throw fail('Beads returned invalid JSON.'); }
    if (!Array.isArray(rows)) throw fail('Beads returned an invalid task list.');
    return rows.map(issue);
  }
  async linked(cwd, threadId) {
    const label = sessionLabel(threadId);
    const tasks = await this.list(cwd, ['--label', label]);
    return { status: 'ready', label, tasks, checkedAt: new Date().toISOString(), error: null };
  }
  async catalog(cwd, threadId) {
    const [linked, candidates] = await Promise.all([this.linked(cwd, threadId), this.list(cwd, ['--status', 'open,in_progress,blocked,deferred'])]);
    const rows = new Map([...candidates, ...linked.tasks].map(task => [task.id, task]));
    return { linkedIds: linked.tasks.map(task => task.id), tasks: [...rows.values()].sort((a, b) => (states[a.state] ?? 3) - (states[b.state] ?? 3) || a.priority - b.priority), label: linked.label };
  }
  async setLinks(cwd, threadId, values) {
    const ids = issueIds(values); const label = sessionLabel(threadId);
    if (ids.length) {
      const existing = await this.list(cwd, ['--id', ids.join(',')]);
      const found = new Set(existing.map(task => task.id));
      if (ids.some(id => !found.has(id))) throw fail('One or more selected tasks do not exist in this Beads tracker.', 400);
    }
    const before = await this.linked(cwd, threadId);
    const current = new Set(before.tasks.map(task => task.id)); const desired = new Set(ids);
    const additions = ids.filter(id => !current.has(id)); const removals = [...current].filter(id => !desired.has(id));
    // Link edits are explicit user actions. Status, ownership, and content stay
    // under the working agents' normal Beads workflow.
    try {
      if (additions.length) await this.command(cwd, ['update', ...additions, '--add-label', label, '--json'], { readonly: false });
      if (removals.length) await this.command(cwd, ['update', ...removals, '--remove-label', label, '--json'], { readonly: false });
    } catch (error) { throw fail('Task links could not be fully updated. Refresh to inspect the current links. ' + error.message); }
    return this.linked(cwd, threadId);
  }
  context(threadId) {
    const label = sessionLabel(threadId);
    return { 'command-center-tasks': { kind: 'application', value: `Command Center task tracking for the current conversation (${threadId}). Use the existing project Beads tracker through the bd CLI for substantive work. Do not initialize a tracker or install tools automatically. First inspect linked work with bd list --label ${label} --json and reuse matching records. Create or claim concise task records and explicitly update their states as work starts, is blocked, or finishes. Associate only tasks you work on in THIS conversation with the label ${label}, using bd create --labels ${label} or bd update TASK_ID --add-label ${label}. Keep other labels, ownership, dependencies, and unrelated tasks intact. The dashboard reads this label directly; chat prose and native plans do not change Beads task state. A branch has its own conversation ID and label; labels from inherited parent instructions do not apply to new branch work. When handing findings back, include relevant task IDs and unfinished work; do not mark tasks closed just because a chat is idle or archived. Do not create tasks for simple acknowledgements. Existing project instructions and approval/permission rules still apply.` } };
  }
}
