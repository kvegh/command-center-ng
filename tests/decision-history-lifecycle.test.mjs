import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { setPassword } from '../server/auth.mjs';
import { createApp } from '../server/main.mjs';
import { Workspace } from '../server/workspace.mjs';
import { DecisionStore } from '../server/decision-store.mjs';

const decision = index => ({ agentId: 'old-worker', workerName: 'Former worker', projectName: 'Example project', requestSummary: 'Verify the selected result.', requestId: index, decision: 'ask', outcome: 'needs_user', rationale: 'The user must choose the intended target.' });
async function fixture(t, customWorkspace = false) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-decision-lifecycle-'));
  const authFile = join(directory, 'auth.json');
  const workspaceFile = customWorkspace ? join(directory, 'separate-workspace', 'workspace.json') : undefined;
  if (workspaceFile) await mkdir(dirname(workspaceFile), { mode: 0o700 });
  await setPassword(randomBytes(24).toString('base64url'), authFile);
  const apps = [];
  const start = async () => {
    const rpc = new EventEmitter(); rpc.ready = false; rpc.calls = [];
    rpc.call = async method => { rpc.calls.push(method); throw new Error('Unexpected native call.'); }; rpc.close = () => {};
    const workspace = new Workspace(rpc, { beads: null, coordinator: true });
    const app = await createApp({ rpc, workspace, authFile, workspaceFile }); apps.push(app);
    return { app, rpc };
  };
  t.after(async () => { for (const app of apps) await app.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, file: join(dirname(workspaceFile || authFile), 'decisions.jsonl'), start };
}

test('application startup reloads decisions before dashboard initialization and close drains private writes', async t => {
  for (const customWorkspace of [false, true]) {
    const f = await fixture(t, customWorkspace);
    const first = await f.start();
    assert.equal(first.app.workspace.coordinator.decisionStore.file, f.file);
    first.app.workspace.coordinator.record(decision(1)); first.app.workspace.coordinator.record(decision(2));
    await first.app.close();
    assert.equal((await new DecisionStore(f.file).load()).length, 2);
    const second = await f.start();
    const rows = second.app.workspace.coordinator.snapshot().audit;
    assert.equal(rows.length, 2); assert.ok(rows.every(row => row.storageState === 'saved'));
    assert.equal(rows[0].workerName, 'Former worker', 'the recorded project/worker survives absent open tabs');
    assert.equal(second.rpc.calls.length, 0, 'loading the actual app does not replay a native action');
    assert.equal(second.app.workspace.coordinator.deliveries.size, 0);
    const bytes = await readFile(f.file, 'utf8');
    await second.app.close(); assert.equal(await readFile(f.file, 'utf8'), bytes);
  }
});

test('a final storage failure is surfaced in shutdown diagnostics without blocking cleanup', async t => {
  const f = await fixture(t); const { app } = await f.start();
  const warnings = []; const warn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    app.workspace.coordinator.decisionStore.append = async () => { throw new Error('Synthetic write failure'); };
    app.workspace.coordinator.record(decision(3));
    await app.close();
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Decision history warning at shutdown.*Synthetic write failure/);
    assert.equal(app.workspace.coordinator.snapshot().audit[0].outcome, 'needs_user');
    assert.equal(app.workspace.coordinator.snapshot().audit[0].storageState, 'failed');
  } finally { console.warn = warn; }
});
