import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalRequestFingerprint, previousRequestReferral } from '../server/decision-store.mjs';

const context = { id: 'worker', cwd: '/project' };
const question = (extra = {}) => ({ id: 7, method: 'item/commandExecution/requestApproval', params: {
  threadId: 'worker', turnId: 'turn', itemId: 'item', startedAtMs: 1_800_000_000_000,
  command: 'verify-example-project', availableDecisions: ['accept', 'decline'], ...extra,
} });
const record = (request = question(), extra = {}) => ({
  id: 'decision-one', at: '2026-01-01T00:00:00.000Z', storageState: 'saved', agentId: context.id,
  requestId: request.id, requestFingerprint: approvalRequestFingerprint(context, request),
  decision: 'ask', outcome: 'needs_user', rationale: 'Choose the existing target before proceeding.', ...extra,
});

test('fingerprints canonicalize native object keys while binding exact methods, parameters and effective directories', () => {
  const first = question({ details: { z: 1, a: { two: 2, one: 1 } } });
  const reordered = { ...first, params: Object.fromEntries(Object.entries({ ...first.params, details: { a: { one: 1, two: 2 }, z: 1 } }).reverse()) };
  const fingerprint = approvalRequestFingerprint(context, first);
  assert.match(fingerprint, /^sha256-v1:[a-f0-9]{64}$/);
  assert.equal(approvalRequestFingerprint(context, reordered), fingerprint);
  for (const changed of [
    { ...first, method: 'item/fileChange/requestApproval' },
    { ...first, params: { ...first.params, command: 'a-different-command' } },
    { ...first, params: { ...first.params, cwd: '/other-project' } },
    { ...first, params: { ...first.params, turnId: 'other-turn' } },
    { ...first, params: { ...first.params, itemId: 'other-item' } },
    { ...first, params: { ...first.params, availableDecisions: ['decline', 'accept'] } },
  ]) assert.notEqual(approvalRequestFingerprint(context, changed), fingerprint);
  assert.notEqual(approvalRequestFingerprint({ ...context, cwd: '/another-fallback' }, first), fingerprint);
  assert.equal(approvalRequestFingerprint({ ...context, cwd: '/other' }, question({ cwd: '/project' })), approvalRequestFingerprint(context, question({ cwd: '/project' })));
});

test('legacy callback numbers without strong native identity and malformed requests stay history-only', () => {
  const weak = { turnId: null, itemId: null, startedAtMs: undefined };
  assert.equal(approvalRequestFingerprint(context, question(weak)), null);
  for (const extra of [{ startedAtMs: 1_800_000_000_000 }, { approvalId: 'native-unique-approval' }, { turnId: 'turn', itemId: 'item' }]) {
    assert.match(approvalRequestFingerprint(context, question({ ...weak, ...extra })), /^sha256-v1:/);
  }
  for (const request of [
    question({ threadId: 'another-worker' }), { ...question(), method: 'mcpServer/elicitation/request' },
    question({ cwd: 'relative-project' }), question({ cwd: '/project\nwrong' }),
    question({ ...weak, approvalId: '', startedAtMs: 0 }), question({ command: 'x'.repeat(260_000) }),
  ]) assert.equal(approvalRequestFingerprint(context, request), null);
  assert.equal(approvalRequestFingerprint(context, { ...question(), params: null }), null);
});

test('only the latest exact saved ask becomes a dated referral; approval outcomes never become authority', () => {
  const request = question(), saved = record(request);
  assert.deepEqual(previousRequestReferral([saved], context, request), {
    decision: 'ask', rationale: saved.rationale, historicalAt: saved.at, decisionId: saved.id,
  });
  for (const newer of [
    { decision: 'approve', outcome: 'resolved' }, { decision: 'decline', outcome: 'resolved' },
    { decision: 'decline', outcome: 'unconfirmed' }, { decision: 'ask', outcome: 'unconfirmed' },
  ]) assert.equal(previousRequestReferral([saved, record(request, newer)], context, request), null);
  for (const storageState of ['pending', 'failed']) for (const decision of ['approve', 'decline', 'ask']) {
    assert.equal(previousRequestReferral([saved, record(request, { storageState, decision })], context, request), null, 'a newer unsaved outcome must not revive an older saved referral');
  }
  for (const mismatch of [
    { requestId: '7' }, { agentId: 'another-worker' }, { requestFingerprint: undefined },
    { requestFingerprint: 'sha256-v1:' + '0'.repeat(64) }, { storageState: 'pending' }, { storageState: 'failed' },
  ]) assert.equal(previousRequestReferral([record(request, mismatch)], context, request), null);
  assert.equal(previousRequestReferral([saved], context, question({ command: 'changed-command' })), null);
  assert.equal(previousRequestReferral([saved], context, question({ turnId: null, itemId: null, startedAtMs: undefined })), null);
  assert.equal(previousRequestReferral([saved], { id: 'another-worker', cwd: context.cwd }, request), null);
  assert.equal(previousRequestReferral([saved], context, { ...request, id: '7' }), null);
});
