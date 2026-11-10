import { open, realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { knownHumanRequests, requestKind } from './native-requests.mjs';

const maximumBytes = 8 * 1024 * 1024;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && value.trim().length > 0;
const boundId = value => identifier(value) || value === null;
const parse = text => { try { return JSON.parse(text); } catch { return null; } };
const fail = message => { throw new Error(message); };

function receivedRequest(worker, question) {
  if (!object(question) || !knownHumanRequests.includes(question.method) || !object(question.params)) return null;
  if (!identifier(question.id) && !(typeof question.id === 'number' && Number.isSafeInteger(question.id))) return null;
  const threadId = question.params.threadId;
  const child = question.requestThreadId;
  if (child === undefined ? threadId !== worker.id : !identifier(child) || threadId !== child || !Array.isArray(worker.subagents) || !worker.subagents.some(row => row?.id === child)) return null;
  if (question.method.startsWith('item/')) {
    const valid = question.method === 'item/commandExecution/requestApproval' ? boundId : identifier;
    if (!Object.hasOwn(question.params, 'turnId') || !Object.hasOwn(question.params, 'itemId') || !valid(question.params.turnId) || !valid(question.params.itemId)) return null;
  }
  if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(question.method) && !identifier(question.reviewToken)) return null;
  return { threadId, requestId: question.id, method: question.method, kind: requestKind(question) };
}

// Readback evidence only: never infer requests from flags, execute rollout text,
// or emit request parameters, user text or approval tokens.
export function verifyRecoveryEvidence(jsonl, { since, workers } = {}) {
  const cutoff = typeof since === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(since) ? Date.parse(since) : NaN;
  if (!Number.isFinite(cutoff) || !Array.isArray(workers) || !workers.length || !workers.every(identifier)) fail('Provide an ISO --since and at least one --worker.');
  const calls = new Map(); let latest = null;
  for (const line of jsonl.split('\n')) {
    const record = parse(line), payload = record?.payload;
    if (record?.type !== 'response_item' || !identifier(payload?.call_id)) continue;
    if (payload.type === 'custom_tool_call') {
      calls.delete(payload.call_id);
      const at = Date.parse(record.timestamp);
      const direct = typeof payload.input === 'string' && /^\s*text\s*\(\s*await\s+tools\s*\.\s*ccng_list_workers\s*\(\s*\{\s*\}\s*\)\s*\)\s*;?\s*$/.test(payload.input);
      if (payload.name === 'exec' && direct && Number.isFinite(at) && at >= cutoff) calls.set(payload.call_id, at);
    }
    if (payload.type !== 'custom_tool_call_output' || !calls.has(payload.call_id)) continue;
    const at = Date.parse(record.timestamp);
    if (!Number.isFinite(at) || at < cutoff || at < calls.get(payload.call_id)) continue;
    const blocks = Array.isArray(payload.output) ? payload.output : [];
    const rows = blocks.length === 1 && blocks[0]?.type === 'input_text' && typeof blocks[0].text === 'string' ? parse(blocks[0].text) : null;
    latest = { at: new Date(at).toISOString(), rows: Array.isArray(rows) ? rows : [] };
  }
  if (!latest) fail('No fresh matched Coordinator worker readback was found.');
  const result = latest.rows.filter(row => object(row) && workers.includes(row.id) && Array.isArray(row.questions)).map(worker => ({
    workerId: worker.id, requests: worker.questions.map(question => receivedRequest(worker, question)).filter(Boolean)
  }));
  const requestCount = result.reduce((count, worker) => count + worker.requests.length, 0);
  if (!requestCount) fail('The latest fresh readback contains no genuine received request for the selected workers.');
  return { timestamp: latest.at, workerCount: result.length, requestCount, workers: result };
}

async function readTail(path) {
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile()) fail('Expected a rollout file.');
    const start = Math.max(0, stat.size - maximumBytes), buffer = Buffer.alloc(Math.min(stat.size, maximumBytes));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, start);
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    return start ? text.slice(text.indexOf('\n') < 0 ? text.length : text.indexOf('\n') + 1) : text;
  } finally { await file.close(); }
}

async function main(args) {
  const usage = 'Usage: node server/check-request-recovery.mjs --rollout PATH --since ISO --worker ID [--worker ID]';
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(usage + '\n'); return; }
  const options = { workers: [] }; let rollout;
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!identifier(value) || !['--rollout', '--since', '--worker'].includes(key)) fail(usage);
    if (key === '--worker') options.workers.push(value);
    else if (key === '--rollout' && !rollout) rollout = value;
    else if (key === '--since' && !options.since) options.since = value;
    else fail(usage);
  }
  if (!rollout || !options.since || !options.workers.length) fail(usage);
  let text;
  try { text = await readTail(rollout); } catch { fail('Could not read the bounded rollout evidence.'); }
  process.stdout.write(JSON.stringify(verifyRecoveryEvidence(text, options)) + '\n');
}

const entry = process.argv[1] && await realpath(process.argv[1]).catch(() => null);
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
