// Explicit live check: uses the caller's existing provider credentials and one
// short model request. Never include this file in automatic offline test runs.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { promisify } from 'node:util';

const [installation, cwd, executable, modeFlag] = process.argv.slice(2);
assert.ok(installation && cwd && executable, 'Usage: node tests/verify-deployed-claude.mjs INSTALL_DIR PROJECT_DIR CLAUDE_EXECUTABLE');
assert.ok(modeFlag === undefined || modeFlag === '--auto', 'The only optional verification flag is --auto.');
const require = createRequire(join(resolve(installation), 'package.json'));
const sdk = await import(require.resolve('@anthropic-ai/claude-agent-sdk'));
const run = promisify(execFile);
const { stdout } = await run(executable, ['auth', 'status', '--json'], { cwd, timeout: 15_000, maxBuffer: 100_000 });
const auth = JSON.parse(stdout);
assert.equal(auth.loggedIn, true, 'Claude authentication status is not logged in.');
assert.equal(auth.apiProvider, 'vertex', 'This check expects the explicitly configured Vertex provider.');

const abortController = new AbortController();
const timeout = setTimeout(() => abortController.abort(), 60_000);
let result, observedMode;
const query = sdk.query({ prompt: 'Authentication verification only. Reply with exactly OK. Do not use tools.', options: {
  cwd, pathToClaudeCodeExecutable: executable, settingSources: ['user', 'project', 'local'],
  tools: [], maxTurns: 1, persistSession: false, abortController,
  ...(modeFlag === '--auto' ? { permissionMode: 'auto' } : {})
} });
try {
  for await (const message of query) {
    if (message.type === 'result') result = message;
    if (message.type === 'system' && ['init', 'status'].includes(message.subtype) && message.permissionMode) observedMode = message.permissionMode;
  }
  assert.ok(result && !result.is_error && result.subtype === 'success', 'The deployed SDK did not complete its Vertex request successfully.');
  assert.match(result.result || '', /\bOK\b/, 'The verification response did not contain the expected acknowledgement.');
  if (modeFlag === '--auto') assert.equal(observedMode, 'auto', 'The native Claude process did not report Auto mode.');
  console.log(JSON.stringify({ authenticationStatus: 'pass', apiProvider: auth.apiProvider, deployedSdkModelResponse: 'pass', observedPermissionMode: observedMode || null, toolsEnabled: false, sessionPersisted: false }));
} finally {
  clearTimeout(timeout);
  query.close();
}
