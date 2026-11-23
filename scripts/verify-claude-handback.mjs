// Disposable native provider acceptance; run only after explicit deployment authorization.
// Uses installed application modules and inherited native authentication; never prints credentials or transcripts.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chmod, mkdtemp, readFile, realpath, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
  if (!['--install-dir', '--expected-version', '--timeout-ms'].includes(args[index]) || !args[index + 1]) throw new Error('Unsupported acceptance arguments.');
  options.set(args[index], args[index + 1]);
}
if (!options.has('--install-dir')) throw new Error('Provide --install-dir for the already verified installation.');
const expectedVersion = options.get('--expected-version');
if (!expectedVersion || !/^\d+\.\d+\.\d+$/.test(expectedVersion)) throw new Error('Provide --expected-version for the frozen installed release.');
const timeoutMs = Number(options.get('--timeout-ms') || 240_000);
if (!Number.isInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 300_000) throw new Error('Use a bounded acceptance timeout between 30000 and 300000 milliseconds.');

const started = Date.now();
const deadline = started + timeoutMs;
const ownIds = new Set();
const facts = { expectedVersion, nativeProvider: 'Claude Agent SDK', realBeadsValidation: false, taskLinkValidation: 'controlled empty adapter', toolsEnabled: false, strictMcpConfig: true, hooksDisabledForTest: true, unexpectedToolAttempts: 0, maxTurnsPerInput: 1, maxBudgetUsdPerQuery: 1, queryCount: 0, taskLinkChecks: 0, nativeEvents: {} };
let stage = 'installed-module-verification', runtime, workspace, cwd, parent, branch, receiptVerified = false;
function metadata(status, extra = {}) {
  const timestamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna', dateStyle: 'short', timeStyle: 'medium' }).format(new Date());
  process.stdout.write(JSON.stringify({ status, stage, timestampVienna: timestamp, timezone: 'Europe/Vienna', elapsedMs: Date.now() - started, ...facts, ...extra }) + '\n');
}
function pendingRequests() {
  return runtime ? [...runtime.records.values()].filter(agent => ownIds.has(agent.nativeSessionId)).flatMap(agent => agent.questions.map(question => ({ sessionId: agent.id, requestId: question.id, method: question.method }))) : [];
}
function category(error) {
  const text = String(error?.message || error);
  for (const [pattern, label] of [[/authenticat|credential|oauth|unauthorized/i, 'native_authentication'], [/quota|resource.exhausted|rate.limit/i, 'native_quota_or_rate_limit'], [/billing|budget|credits/i, 'native_billing_or_test_budget'], [/model.not.found|unsupported.model/i, 'native_model_availability'], [/timeout|deadline/i, 'acceptance_deadline'], [/pending.native|human.response/i, 'native_input_required']]) if (pattern.test(text)) return label;
  return error?.name === 'AssertionError' ? 'acceptance_assertion' : 'native_or_application_error';
}
function checkPending() {
  if (facts.unexpectedToolAttempts || Object.values(facts.nativeEvents).some(events => events.toolUse > 0)) throw new Error('Unexpected tool attempt in no-tools acceptance.');
  if (pendingRequests().length) throw new Error('Unexpected pending native human response.');
}
async function waitFor(check, label, limit = 90_000) {
  const until = Math.min(deadline, Date.now() + limit);
  while (Date.now() < until) {
    checkPending();
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Acceptance deadline: ' + label);
}
async function safeCleanup() {
  const retained = [];
  if (runtime) {
    for (const agent of runtime.records.values()) {
      if (!ownIds.has(agent.nativeSessionId) || !runtime.runs.has(agent.id)) continue;
      if (workspace?.returnJobs.has(agent.id)) { retained.push(agent.id); continue; }
      try {
        if ((await runtime.inspectHandoff(agent)).safe) await runtime.closeForHandoff(agent, { timeoutMs: 10_000 });
        else retained.push(agent.id);
      } catch { if (runtime.runs.has(agent.id)) retained.push(agent.id); }
    }
  }
  // No deletion/archival of native transcripts. Remove only this script's empty disposable project directory.
  if (cwd && !retained.length && !pendingRequests().length) {
    try { await rmdir(cwd); facts.temporaryDirectoryRemoved = true; }
    catch { facts.temporaryDirectoryRemoved = false; }
  }
  return retained;
}

try {
  const installed = await realpath(resolve(options.get('--install-dir')));
  const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.version, expectedVersion, 'Installed version differs from the verified release.');
  facts.installedVersion = manifest.version;
  const sdkManifest = JSON.parse(await readFile(join(installed, 'node_modules/@anthropic-ai/claude-agent-sdk/package.json'), 'utf8'));
  assert.equal(sdkManifest.version, '0.3.212', 'Use the installed approved official SDK version.');
  facts.sdkVersion = sdkManifest.version;
  const [{ ClaudeSessions }, { Workspace }, official] = await Promise.all([
    import(pathToFileURL(join(installed, 'server/claude.mjs'))),
    import(pathToFileURL(join(installed, 'server/workspace.mjs'))),
    import(pathToFileURL(join(installed, 'node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs')))
  ]);
  cwd = await mkdtemp(join(tmpdir(), 'ccng-claude-handback-')); await chmod(cwd, 0o700);
  const constrainedSdk = {
    ...official,
    query(params) {
      const nativeId = params.options.sessionId || params.options.resume;
      assert.ok(ownIds.has(nativeId), 'A provider run must belong to this disposable acceptance test.');
      assert.equal(params.options.cwd, cwd);
      facts.queryCount++;
      // Restrict only this isolated test. Existing native credentials/settings are inherited unchanged.
      const events = { user: 0, boundUser: 0, replayedUser: 0, result: 0, boundResult: 0, idle: 0, boundIdle: 0, running: 0, backgroundSnapshots: 0, requiresAction: 0, assistant: 0, toolUse: 0 };
      facts.nativeEvents[nativeId] = events;
      const query = official.query({ ...params, options: { ...params.options,
        // tools:[] excludes built-ins; strict empty MCP also excludes user,
        // project and plugin servers. The flag settings affect this test only.
        tools: [], strictMcpConfig: true, mcpServers: {}, settings: { disableAllHooks: true },
        canUseTool: async () => {
          facts.unexpectedToolAttempts++;
          return { behavior: 'deny', message: 'This disposable acceptance test authorizes no tools.' };
        },
        maxTurns: 1, maxBudgetUsd: 1,
        env: { ...process.env, ...params.options.env, CLAUDE_CODE_MAX_OUTPUT_TOKENS: '512' }, stderr: () => {} } });
      // Observe metadata without changing native payloads or printing transcript/tool contents.
      const observed = async function* () {
        for await (const message of query) {
          const bound = message.session_id === nativeId;
          if (message.type === 'user') { events.user++; if (bound) events.boundUser++; if (message.isReplay === true) events.replayedUser++; }
          if (message.type === 'assistant') { events.assistant++; events.toolUse += Array.isArray(message.message?.content) ? message.message.content.filter(block => block.type === 'tool_use').length : 0; }
          if (message.type === 'result') { events.result++; if (bound) events.boundResult++; events.lastResultFailed = message.is_error === true; }
          if (message.type === 'system' && message.subtype === 'background_tasks_changed') events.backgroundSnapshots++;
          if (message.type === 'system' && message.subtype === 'session_state_changed') {
            if (message.state === 'idle') { events.idle++; if (bound) events.boundIdle++; }
            if (message.state === 'running') events.running++;
            if (message.state === 'requires_action') events.requiresAction++;
          }
          yield message;
        }
      };
      return new Proxy(query, { get(target, property) {
        if (property === Symbol.asyncIterator) return observed;
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    },
    async forkSession(nativeId, params) {
      assert.ok(ownIds.has(nativeId)); assert.equal(params.dir, cwd);
      const result = await official.forkSession(nativeId, params);
      assert.match(result.sessionId, /^[a-f0-9-]{36}$/i); assert.notEqual(result.sessionId, nativeId);
      ownIds.add(result.sessionId); return result;
    }
  };
  runtime = new ClaudeSessions({ loadSdk: async () => constrainedSdk });
  assert.equal(await runtime.initialize(), true, 'The existing local native Claude runtime must be available.');
  const rpc = new EventEmitter(); rpc.ready = false;
  rpc.call = async () => { throw new Error('This Claude acceptance must not call Codex.'); };
  const beads = {
    async linked(testCwd, agentId) { assert.equal(testCwd, cwd); assert.ok(ownIds.has(agentId.slice(7))); return { status: 'available', tasks: [] }; },
    async handoff(testCwd, childId, parentId) {
      assert.equal(testCwd, cwd); assert.equal(childId, branch.id); assert.equal(parentId, parent.id);
      facts.taskLinkChecks++; return { taskIds: [], tasks: [] };
    }
  };
  workspace = new Workspace(rpc, { claude: runtime, beads, summaryTimeout: 90_000, handoffOptions: { timeout: 90_000, poll: 250 } });
  workspace.instructionContext = async () => ({ test: { kind: 'application', value: 'Disposable protocol acceptance only. No project work, tools, files, subagents, background jobs or external actions are authorized. Reply briefly; obey the requested summary JSON format. Parent may acknowledge received handoff in one word.' } });

  stage = 'parent-native-turn';
  const nativeParent = runtime.create(cwd, 'Disposable Claude handback acceptance'); ownIds.add(nativeParent.nativeSessionId);
  parent = await workspace.open(nativeParent.id); facts.parentId = parent.id; metadata('running');
  const first = await workspace.send(parent.id, 'This is a disposable acceptance conversation. No tools or project work. Reply READY.');
  await waitFor(async () => {
    const state = await runtime.inspectHandoff(parent);
    if (parent.runError) throw new Error(parent.runError);
    return state.safe && state.lastCompleted?.messageIds.includes(first.messageId);
  }, 'initial native parent turn');
  facts.initialParentCompletion = true;

  stage = 'native-fork';
  const childId = await workspace.fork(parent.id); branch = workspace.agent(childId); facts.branchId = branch.id;
  assert.ok(ownIds.has(branch.nativeSessionId)); assert.equal(branch.parentId, parent.id); assert.equal(branch.cwd, cwd);
  facts.nativeForkVerified = true; metadata('running');

  stage = 'native-handback';
  workspace.startHandoff(branch.id);
  const record = workspace.handoffs.records.get(branch.id);
  const handbackJob = workspace.returnJobs.get(branch.id);
  assert.ok(handbackJob, 'The installed workspace must start its native handback workflow.');
  let handbackDone = false; void handbackJob.finally(() => { handbackDone = true; });
  await waitFor(() => handbackDone, 'native checkpoint, summary, parent receipt and child close', 120_000);
  assert.equal(workspace.agents.has(branch.id), false, 'The installed handback must close the completed disposable child view.');
  assert.equal(branch.handoff, undefined, 'The branch must not retain a failed handback.');
  assert.ok(record?.delivered && record.claudeCheckpoint?.messageId && record.claudeSummary?.messageId && record.claudeDeliveryId);
  receiptVerified = await runtime.handoffReceipt(parent, { messageId: record.claudeDeliveryId, text: record.messageText });
  assert.equal(receiptVerified, true); assert.equal(runtime.runs.has(branch.id), false);
  assert.ok(workspace.handoffs.completions.some(item => item.branchId === branch.id && item.parentId === parent.id));
  assert.ok(facts.taskLinkChecks >= 2, 'The controlled empty task links must be rechecked before closure.');
  facts.checkpointCompleted = true; facts.jsonSummaryAccepted = true; facts.nativeParentReceiptVerified = true; facts.childProcessClosedByInstalledHandback = true;
  metadata('running');

  stage = 'native-child-history-reopen';
  const reader = new ClaudeSessions({ loadSdk: async () => constrainedSdk });
  assert.equal(await reader.initialize(), true);
  const reopened = await reader.open(branch.id);
  assert.equal(reopened.nativeSessionId, branch.nativeSessionId); assert.ok(reopened.messages.length > 0);
  assert.ok(reopened.messages.some(message => message.nativeMessageId === record.claudeCheckpoint.messageId));
  assert.ok(reopened.messages.some(message => message.nativeMessageId === record.claudeSummary.messageId));
  assert.equal(reader.runs.size, 0, 'Reopening retained native history must not start a model.');
  facts.childHistoryReopenedFromNativeTranscript = true; facts.nativeHistoryRetained = true;

  stage = 'parent-delivery-completion-and-cleanup';
  await waitFor(async () => {
    const state = await runtime.inspectHandoff(parent);
    if (parent.runError) throw new Error(parent.runError);
    return state.safe && state.completions.some(item => item.messageIds.includes(record.claudeDeliveryId));
  }, 'parent native delivery completion');
  await runtime.closeForHandoff(parent, { timeoutMs: 10_000 });
  assert.equal(runtime.runs.size, 0);
  facts.modelTurnCompletions = parent.handoffCompletedSequence + branch.handoffCompletedSequence;
  facts.ownedProcessesRemaining = 0;
  const retained = await safeCleanup(); assert.equal(retained.length, 0);
  assert.equal(facts.unexpectedToolAttempts, 0, 'No tool permission callback may be attempted.');
  assert.ok(Object.values(facts.nativeEvents).every(events => events.toolUse === 0), 'Native output must contain zero tool-use attempts.');
  stage = 'complete'; metadata('passed');
} catch (error) {
  const requests = pendingRequests();
  const retained = await safeCleanup();
  facts.nativeParentReceiptVerified = receiptVerified;
  facts.ownedProcessesRemaining = runtime?.runs.size || 0;
  metadata(requests.length || retained.length ? 'blocked' : 'failed', {
    errorCategory: category(error), assertion: error?.name === 'AssertionError' ? String(error.message).split('\n')[0].slice(0, 180) : undefined,
    pendingRequests: requests, retainedOwnedSessions: retained,
    nextAction: requests.length ? 'A human must inspect the exact pending native request; this test did not answer or cancel it.'
      : retained.length ? 'Inspect these exact disposable sessions and the existing test process; do not duplicate or cancel uncertain native work.'
      : 'Inspect this acceptance stage before considering another authorized attempt.'
  });
  process.exitCode = 1;
  // Live SDK handles intentionally remain owned here when blocked. No shutdown(), interrupt(), abort(), deleteSession() or force-close.
}
