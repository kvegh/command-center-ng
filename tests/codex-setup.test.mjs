import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureCodexQuestions } from '../server/codex-setup.mjs';

const feature = 'default_mode_request_user_input';
const row = (enabled, stage = 'under development') => `${feature}  ${stage}  ${enabled}\n`;

test('startup checks are read-only and distinguish enabled, disabled and unsupported features', async () => {
  for (const [stdout, enabled, warnings] of [[row(true), true, 1], [row(true, 'stable'), true, 0], [row(false), false, 1], ['other_feature stable true\n', false, 1]]) {
    const calls = [];
    const result = await ensureCodexQuestions({ run: async (command, args) => { calls.push([command, args]); return { stdout }; } });
    assert.equal(result.available, true); assert.equal(result.enabled, enabled);
    assert.equal(result.changed, false); assert.equal(result.warnings.length, warnings);
    for (const warning of result.warnings) assert.match(warning, /^Required Codex structured questions:/);
    assert.deepEqual(calls, [['codex', ['features', 'list']]]);
  }
});

test('enabled development-stage features retain one compatibility warning', async () => {
  let reads = 0;
  const result = await ensureCodexQuestions({ enable: true, run: async (command, args) => {
    if (args[1] === 'enable') return { stdout: '' };
    return { stdout: row(reads++ > 0) };
  } });
  assert.equal(result.enabled, true); assert.equal(result.changed, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Required Codex structured questions:.*under development.*upgrades/);
});

test('enable uses only native commands and reports a change only after native confirmation', async () => {
  const calls = []; const selectedEnvironment = { PATH: '/example/bin', CODEX_HOME: '/example/profile' };
  const responses = [row(false), '', row(true, 'stable')];
  const result = await ensureCodexQuestions({ enable: true, env: selectedEnvironment, run: async (command, args, options) => {
    calls.push([command, args]); assert.equal(options.env, selectedEnvironment);
    assert.equal(options.timeout, 10_000); assert.equal(options.maxBuffer, 262_144);
    return { stdout: responses.shift() };
  } });
  assert.deepEqual(result, { available: true, enabled: true, changed: true, warnings: [] });
  assert.deepEqual(calls, [
    ['codex', ['features', 'list']],
    ['codex', ['features', 'enable', feature]],
    ['codex', ['features', 'list']],
  ]);
  const alreadyEnabled = await ensureCodexQuestions({ enable: true, run: async (command, args) => {
    assert.deepEqual(args, ['features', 'list']); return { stdout: row(true) };
  } });
  assert.equal(alreadyEnabled.changed, false);
});

test('ambiguous, malformed, removed and deprecated rows warn without an enable attempt', async () => {
  for (const stdout of [row(false) + row(true), row(false, 'removed'), row(true, 'deprecated'), `${feature} stable maybe\n`, `${feature}_other stable true\n`]) {
    let calls = 0;
    const result = await ensureCodexQuestions({ enable: true, run: async (command, args) => {
      calls++; assert.deepEqual(args, ['features', 'list']); return { stdout };
    } });
    assert.equal(calls, 1); assert.equal(result.changed, false);
    assert.equal(result.enabled, false); assert.equal(result.warnings.length, 1);
  }
});

test('missing, denied, timeout and native command errors remain warnings without leaking output', async () => {
  for (const error of [
    Object.assign(new Error('private diagnostic canary'), { code: 'ENOENT' }),
    Object.assign(new Error('private diagnostic canary'), { code: 'EACCES' }),
    Object.assign(new Error('private diagnostic canary'), { killed: true }),
    Object.assign(new Error('private diagnostic canary'), { code: 1, stdout: 'private diagnostic canary', stderr: 'private diagnostic canary' }),
  ]) {
    const result = await ensureCodexQuestions({ enable: true, run: async () => { throw error; } });
    assert.equal(result.available, false); assert.equal(result.enabled, false); assert.equal(result.changed, false);
    assert.equal(result.warnings.length, 1); assert.doesNotMatch(JSON.stringify(result), /private diagnostic canary/);
  }
});

test('failed updates and mismatched verification remain unconfirmed warnings, never retries', async () => {
  for (const mode of ['enable-fails', 'verify-fails', 'verify-disabled', 'verify-unsupported']) {
    const calls = [];
    const result = await ensureCodexQuestions({ enable: true, run: async (command, args) => {
      calls.push(args);
      if (calls.length === 1) return { stdout: row(false) };
      if ((mode === 'enable-fails' && args[1] === 'enable') || (mode === 'verify-fails' && calls.length === 3)) throw Object.assign(new Error('private failure'), { code: 1 });
      return { stdout: mode === 'verify-unsupported' ? 'other_feature stable true\n' : row(false) };
    } });
    assert.equal(result.changed, false); assert.equal(result.enabled, false);
    assert.ok(result.warnings.length > 0); assert.equal(calls.length, mode === 'enable-fails' ? 2 : 3);
    assert.doesNotMatch(JSON.stringify(result), /private failure/);
  }
});
