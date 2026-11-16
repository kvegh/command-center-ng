import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, loadRuntimeOptions } from '../server/main.mjs';
import { normalizeClaudeAutoReviewSessions, parseRuntimeConfig, readRuntimeConfig, runtimeConfigFile } from '../server/runtime-config.mjs';
import { setPassword } from '../server/auth.mjs';
import { Workspace } from '../server/workspace.mjs';

const first = 'claude-11111111-2222-4333-8444-555555555555';
const second = 'claude-66666666-7777-4888-8999-aaaaaaaaaaaa';
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

async function directoryFixture(t, { cleanup = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-claude-permission-config-'));
  await mkdir(join(directory, 'etc'));
  if (cleanup) t.after(() => rm(directory, { recursive: true, force: true }));
  const file = runtimeConfigFile(directory);
  return { directory, file, write: text => writeFile(file, text, { mode: 0o600 }) };
}

async function appFixture(t, { initial = [first], restore = false } = {}) {
  const f = await directoryFixture(t, { cleanup: false }), authFile = join(f.directory, 'auth.json');
  await setPassword(randomBytes(24).toString('base64url'), authFile);
  await f.write('claude_auto_review_sessions: ' + (initial.join(',') || 'disabled') + '\n');
  const events = [], behavior = { wait: null, error: null }, state = { applied: [] };
  const claude = new EventEmitter(); claude.available = false;
  claude.initialize = async () => { events.push({ type: 'initialize' }); claude.available = true; };
  claude.configureAutoReviewSessions = async ids => {
    events.push({ type: 'configure', ids: [...ids] });
    if (behavior.wait) await behavior.wait.promise;
    if (behavior.error) throw behavior.error;
    state.applied = [...ids]; return { configured: ids.length };
  };
  claude.shutdown = async () => { claude.available = false; };
  const rpc = new EventEmitter(); rpc.ready = false; rpc.close = () => {};
  rpc.call = rpc.respond = rpc.connect = () => assert.fail('Selector configuration must not start, resume or answer native work.');
  const workspace = new Workspace(rpc, { beads: null, claude });
  workspace.open = async id => {
    events.push({ type: 'restore', id });
    const agent = { id, provider: 'claude', role: 'worker', name: 'Synthetic Claude', cwd: f.directory,
      thread: { status: { type: 'idle' } }, messages: [], tasks: [], workers: [], questions: [], turnId: null, reportIntervalMinutes: 0 };
    workspace.agents.set(id, agent); return agent;
  };
  const workspaceFile = join(f.directory, 'workspace.json');
  if (restore) await writeFile(workspaceFile, JSON.stringify({ version: 1, workerIds: [first], coordinatorId: null, coordinatorPaused: false }), { mode: 0o600 });
  const app = await createApp({ rpc, workspace, authFile, workspaceFile,
    config: { runtimeConfigFile: f.file, claudeAutoReviewSessions: initial, host: '127.0.0.1', port: 4343, concernReviewWorkerId: 'synthetic-reviewer' } });
  t.after(async () => { await app.close(); await rm(f.directory, { recursive: true, force: true }); });
  if (app.persistence.job) await app.persistence.job;
  return { ...f, app, workspace, events, behavior, state, calls: () => events.filter(event => event.type === 'configure') };
}

test('Claude Auto selectors normalize only bounded full worker identities without changing caller arrays', () => {
  for (const value of [undefined, null, 'disabled', []]) assert.deepEqual(normalizeClaudeAutoReviewSessions(value), []);
  const input = [first, second, first];
  assert.deepEqual(normalizeClaudeAutoReviewSessions(input), [first, second]); assert.deepEqual(input, [first, second, first]);
  assert.deepEqual(normalizeClaudeAutoReviewSessions(first + ', ' + second + ',' + first), [first, second]);
  assert.deepEqual(normalizeClaudeAutoReviewSessions(first.toUpperCase()), [first], 'case variants resolve to the same canonical worker ID');
  const tooMany = Array.from({ length: 17 }, (_, index) => 'claude-' + index.toString(16).padStart(8, '0') + '-2222-4333-8444-555555555555');
  for (const value of ['', ' ', 'auto', 'coordinator', first.slice(7), first + ',', first + ',disabled', [first, null], [first, 1], {}, true, 1, tooMany]) {
    assert.throws(() => normalizeClaudeAutoReviewSessions(value), /claude_auto_review_sessions/);
  }
});

test('installed literal settings produce normalized selectors and retain the exact reload file', async t => {
  const f = await directoryFixture(t);
  const omitted = await loadRuntimeOptions([], {}, { appDir: f.directory });
  assert.deepEqual(omitted.claudeAutoReviewSessions, []); assert.equal(omitted.runtimeConfigFile, f.file);
  await f.write('claude_auto_review_sessions: ' + first + ', ' + second + '\r\n');
  assert.deepEqual(await readRuntimeConfig(f.file), { claudeAutoReviewSessions: [first, second] });
  const loaded = await loadRuntimeOptions([], {}, { appDir: f.directory });
  assert.deepEqual(loaded.claudeAutoReviewSessions, [first, second]); assert.equal(loaded.runtimeConfigFile, f.file);
  assert.deepEqual(parseRuntimeConfig('claude_auto_review_sessions: disabled\n', f.directory), { claudeAutoReviewSessions: [] });
});

test('selector parsing refuses executable-looking text, extra fields and malformed lines without execution', async t => {
  const f = await directoryFixture(t), marker = join(f.directory, 'must-not-be-created');
  for (const text of [
    'claude_auto_review_sessions: $(touch ' + marker + ')\n',
    'claude_auto_review_sessions: ' + first + ' # inline comment\n',
    'claude_auto_review_sessions: [' + first + ']\n',
    'claude_auto_review_sessions: ' + first + '\nclaude_auto_review_sessions: ' + second + '\n',
    'claude_auto_review_sessions: ' + first + '\npermission_mode: bypassPermissions\n',
    'claude_auto_review_sessions: ' + first + '\t' + second + '\n'
  ]) {
    await f.write(text);
    await assert.rejects(readRuntimeConfig(f.file), error => {
      assert.match(error.message, /Runtime configuration line/);
      assert.doesNotMatch(error.message, /must-not-be-created/); return true;
    });
  }
  await assert.rejects(access(marker), { code: 'ENOENT' });
});

test('startup configures Claude selectors after initialization and before read-only workspace restoration', async t => {
  const f = await appFixture(t, { initial: [first], restore: true });
  assert.deepEqual(f.events.slice(0, 3), [{ type: 'initialize' }, { type: 'configure', ids: [first] }, { type: 'restore', id: first }]);
  assert.deepEqual(f.state.applied, [first]); assert.deepEqual(f.app.settings.claudeAutoReviewSessions, [first]);
  assert.equal(f.workspace.agent(first).turnId, null); assert.deepEqual(f.workspace.agent(first).questions, []);
});

test('reload changes only selectors from the same installed file and preserves other running settings', async t => {
  const f = await appFixture(t), before = { ...f.app.settings };
  await writeFile(join(f.directory, 'unrelated.conf'), 'claude_auto_review_sessions: disabled\n', { mode: 0o600 });
  await f.write('claude_auto_review_sessions: ' + second + '\nhost: 192.0.2.99\nport: 4545\nconcern_review_worker: another-reviewer\napproval_policy: another-policy.yml\n');
  await f.app.reloadClaudePermissions();
  assert.deepEqual(f.state.applied, [second]);
  assert.deepEqual(f.app.settings, { ...before, claudeAutoReviewSessions: [second] });
  assert.deepEqual(f.calls(), [{ type: 'configure', ids: [first] }, { type: 'configure', ids: [second] }]);
});

test('removing or disabling the selector key explicitly clears only the configured Auto selection', async t => {
  const f = await appFixture(t);
  await f.write('port: 4545\n'); await f.app.reloadClaudePermissions();
  assert.deepEqual(f.state.applied, []); assert.deepEqual(f.app.settings.claudeAutoReviewSessions, []);
  await f.write('claude_auto_review_sessions: disabled\n'); await f.app.reloadClaudePermissions();
  assert.deepEqual(f.calls().map(call => call.ids), [[first], [], []]);
  assert.equal(f.app.settings.port, 4343);
});

test('malformed reloads and native configuration errors preserve the last effective selector settings', async t => {
  const f = await appFixture(t);
  await f.write('claude_auto_review_sessions: not-a-worker\n');
  await assert.rejects(f.app.reloadClaudePermissions(), /claude_auto_review_sessions/);
  assert.equal(f.calls().length, 1); assert.deepEqual(f.state.applied, [first]);
  await f.write('claude_auto_review_sessions: ' + second + '\n');
  f.behavior.error = new Error('Synthetic native configuration failure.');
  await assert.rejects(f.app.reloadClaudePermissions(), /Synthetic native configuration failure/);
  assert.equal(f.calls().length, 2); assert.deepEqual(f.state.applied, [first]); assert.deepEqual(f.app.settings.claudeAutoReviewSessions, [first]);
});

test('pending reloads and closed apps refuse new reloads instead of duplicating configuration writes', async t => {
  const f = await appFixture(t);
  await f.write('claude_auto_review_sessions: ' + second + '\n');
  const gate = deferred(); f.behavior.wait = gate;
  const pending = f.app.reloadClaudePermissions();
  for (let index = 0; index < 50 && f.calls().length < 2; index++) await tick();
  assert.equal(f.calls().length, 2);
  await assert.rejects(f.app.reloadClaudePermissions(), /reload.*pending/i);
  assert.equal(f.calls().length, 2); assert.deepEqual(f.app.settings.claudeAutoReviewSessions, [first]);
  gate.resolve(); await pending;
  assert.deepEqual(f.app.settings.claudeAutoReviewSessions, [second]);
  await f.app.close();
  await assert.rejects(f.app.reloadClaudePermissions(), /shutting down/);
  assert.equal(f.calls().length, 2);
});
