import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyRecoveryEvidence } from '../server/check-request-recovery.mjs';

const since = '2027-01-01T10:00:00Z', timestamp = '2027-01-01T10:01:00Z';
const call = (id = 'call-one', input = 'text(await tools.ccng_list_workers({}));', at = timestamp) => ({ timestamp: at, type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: id, input } });
const output = (rows, id = 'call-one', at = timestamp) => ({ timestamp: at, type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: id, output: [{ type: 'input_text', text: JSON.stringify(rows) }] } });
const question = (threadId = 'worker', id = 7) => ({ id, method: 'item/commandExecution/requestApproval', reviewToken: 'DO-NOT-PRINT-TOKEN', params: { threadId, turnId: null, itemId: null, command: 'DO-NOT-PRINT-COMMAND' }, review: { rationale: 'DO-NOT-PRINT-QUOTE' } });
const worker = extra => ({ id: 'worker', provider: 'codex', questions: [question()], subagents: [], ...extra });
const jsonl = (...records) => records.map(record => JSON.stringify(record)).join('\n') + '\n';
const check = records => verifyRecoveryEvidence(records, { since, workers: ['worker'] });

test('fresh matched Coordinator readback proves exact root/verified child IDs without printing protected contents', () => {
  const rows = [worker({ questions: [question(), { ...question('child', '7'), requestThreadId: 'child' }], subagents: [{ id: 'child', pendingRequests: 1 }] })];
  const result = check(jsonl(call(), output(rows)));
  assert.equal(result.timestamp, '2027-01-01T10:01:00.000Z'); assert.equal(result.requestCount, 2);
  assert.deepEqual(result.workers[0].requests, [
    { threadId: 'worker', requestId: 7, method: 'item/commandExecution/requestApproval', kind: 'Command approval' },
    { threadId: 'child', requestId: '7', method: 'item/commandExecution/requestApproval', kind: 'Command approval' }
  ]);
  assert.doesNotMatch(JSON.stringify(result), /DO-NOT-PRINT|reviewToken|params|command"|rationale/);
  assert.equal(verifyRecoveryEvidence(jsonl(call(), output(rows)), { since, workers: ['absent', 'worker'] }).requestCount, 2, 'at least one explicitly selected worker must have real delivered evidence');
  assert.equal(check(jsonl(call('call-one', ' text ( await tools.ccng_list_workers( { } ) ) ;\n'), output(rows))).requestCount, 2, 'whitespace does not change the direct native read wrapper');
});

test('old, unmatched, non-Coordinator and empty/internal-only outputs do not prove received requests', () => {
  const rows = [worker()];
  for (const records of [
    jsonl(call(), output(rows, 'call-one', '2027-01-01T09:59:59Z')),
    jsonl(call(), output(rows, 'other-call')),
    jsonl(call('call-one', 'text(await tools.ccng_read_worker({agentId:"worker"}));'), output(rows)),
    jsonl(call(), output([worker({ questions: [], status: { type: 'active', activeFlags: ['waitingOnApproval'] } })])),
    jsonl(call(), output([worker({ questions: [{ ...question(), method: 'account/chatgptAuthTokens/refresh' }] })])),
    jsonl(output(rows)),
    jsonl(call('call-one', undefined, '2027-01-01T09:59:59Z'), output(rows)),
    jsonl(call(), output(rows, 'call-one', '2027-01-01T10:00:30Z')),
    jsonl(call(), { ...output(rows), payload: { ...output(rows).payload, output: [...output(rows).payload.output, ...output(rows).payload.output] } }),
    ...[
      '// text(await tools.ccng_list_workers({}));',
      'if (false) text(await tools.ccng_list_workers({}));',
      'text("tools.ccng_list_workers({})");',
      'text(await tools.ccng_list_workers({})); text([]);'
    ].map(input => jsonl(call('call-one', input), output(rows)))
  ]) assert.throws(() => check(records), /No fresh matched|no genuine received/);
  assert.throws(() => verifyRecoveryEvidence(jsonl(call(), output(rows)), { since: 'yesterday', workers: ['worker'] }), /ISO/);
});

test('only the latest readback and exact current request context count, never stale status or malformed bindings', () => {
  assert.throws(() => check(jsonl(call(), output([worker()]), call('later'), output([worker({ questions: [] })], 'later', '2027-01-01T10:02:00Z'))), /no genuine received/);
  for (const malformed of [
    { ...question(), id: {} }, { ...question(), id: '' }, { ...question(), params: {} }, question('foreign'),
    { ...question('child'), requestThreadId: 'child' }, { ...question(), reviewToken: '' },
    { ...question(), params: { threadId: 'worker' } },
    { ...question(), method: 'item/fileChange/requestApproval' },
    { ...question(), method: 'item/permissions/requestApproval', params: { threadId: 'worker', turnId: '', itemId: 'item' } }
  ]) assert.throws(() => check(jsonl(call(), output([worker({ questions: [malformed] })]))), /no genuine received/);
  const file = { ...question(), method: 'item/fileChange/requestApproval', params: { threadId: 'worker', turnId: 'turn', itemId: 'item' } };
  assert.equal(check(jsonl(call(), output([worker({ questions: [file] })]))).workers[0].requests[0].kind, 'File approval');
});

test('CLI requires explicit bounds and worker selection, scans only the tail, and emits sanitized machine-readable proof', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-recovery-proof-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'synthetic-rollout.jsonl'), script = fileURLToPath(new URL('../server/check-request-recovery.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  assert.equal(run('--rollout', path).status, 1);
  await writeFile(path, jsonl(call()) + 'x'.repeat(8 * 1024 * 1024 + 20) + '\n' + jsonl(output([worker()])));
  const args = ['--rollout', path, '--since', since, '--worker', 'worker'];
  const outside = run(...args); assert.equal(outside.status, 1, 'a call outside the bounded tail cannot authenticate an output inside it');
  await appendFile(path, jsonl(call('fresh'), output([worker()], 'fresh')));
  const current = run(...args);
  assert.equal(current.status, 0, current.stderr); assert.ok(current.stdout.trim(), JSON.stringify({ status: current.status, stdout: current.stdout, stderr: current.stderr, signal: current.signal })); assert.equal(JSON.parse(current.stdout).requestCount, 1);
  assert.doesNotMatch(current.stdout + current.stderr, /DO-NOT-PRINT/);
});
