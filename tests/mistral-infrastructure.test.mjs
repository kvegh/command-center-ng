import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveHandoverSkill } from '../server/chat-handover.mjs';
import { isHumanRequest, requestKind, manualRequestAnswer } from '../server/native-requests.mjs';
import { workspaceRecord } from '../server/workspace-store.mjs';

test('Mistral native requests remain human requests with provider-specific labels and no Codex answers', () => {
  for (const [method, kind] of [['mistral/permission/requestApproval', 'Mistral tool approval'], ['mistral/userInput/request', 'Mistral question']]) {
    const question = { method, params: {} };
    assert.equal(isHumanRequest(method), true);
    assert.equal(requestKind(question), kind);
    assert.throws(() => manualRequestAnswer(question, { decision: 'accept' }), /no supported answer format/);
  }
});

test('Mistral handovers reuse the installed canonical skill and fail visibly when absent', async t => {
  const home = await mkdtemp(join(tmpdir(), 'ccng-mistral-skill-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await assert.rejects(resolveHandoverSkill('mistral', { home }), /skill is unavailable/);
  const directory = join(home, '.agents', 'skills', 'handoff');
  await mkdir(directory, { recursive: true });
  const file = join(directory, 'SKILL.md');
  await writeFile(file, '# Existing operator-installed handoff skill\n');
  assert.equal(await resolveHandoverSkill('mistral', { home }), file);
  await assert.rejects(resolveHandoverSkill('unknown', { home }), /Choose Codex, Claude or Mistral/);
});

test('existing workspace metadata preserves Mistral views and report settings without requests or native history', () => {
  const id = 'mistral-opaque_session-7';
  const saved = workspaceRecord({ version: 1, workerIds: [id], coordinatorId: null, coordinatorPaused: true,
    workerReportIntervals: { [id]: 5 }, nativeRequests: ['do-not-persist'], messages: ['do-not-persist'] });
  assert.deepEqual(saved, { version: 1, workerIds: [id], coordinatorId: null, coordinatorPaused: true, workerReportIntervals: { [id]: 5 } });
  assert.throws(() => workspaceRecord({ ...saved, claudePermissionModes: { [id]: 'auto' } }), /Claude permission modes/);
});
