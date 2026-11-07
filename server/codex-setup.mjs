import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const feature = 'default_mode_request_user_input';
const featureRow = /^default_mode_request_user_input\s+(stable|experimental|under development)\s+(true|false)$/;

function commandWarning(error, updating) {
  if (error?.code === 'ENOENT') return 'Codex is unavailable on the selected PATH; structured questions could not be checked.';
  if (error?.killed || error?.code === 'ETIMEDOUT') return updating
    ? 'Codex feature setup timed out; the saved setting is unconfirmed.'
    : 'Codex feature checking timed out; structured-question support is unconfirmed.';
  return updating
    ? 'Codex could not enable structured questions. Check the selected profile access and native CLI compatibility.'
    : 'Codex feature checking failed. Check the selected profile access and native CLI compatibility.';
}

// Native Codex owns persistence. A bounded CLI check is needed because there is
// no native Node/Ansible feature-settings API; never edit config.toml directly.
// Justification: ../docs/ansible-deployment.md#native-codex-questions
export async function ensureCodexQuestions({ enable = false, env = process.env, run = execute } = {}) {
  const result = { available: false, enabled: false, changed: false, warnings: [] };
  let stage;
  const warn = message => {
    const warning = 'Required Codex structured questions: ' + message;
    if (!result.warnings.includes(warning)) result.warnings.push(warning);
  };
  const warnDevelopmentStage = () => {
    if (result.enabled && stage === 'under development') warn('the native feature is marked under development. Recheck compatibility after Codex upgrades.');
  };
  const invoke = args => run('codex', args, { env, timeout: 10_000, maxBuffer: 262_144 });
  const inspect = async () => {
    const response = await invoke(['features', 'list']);
    result.available = true;
    const rows = String(response.stdout || '').split(/\r?\n/).map(line => line.trim())
      .filter(line => /^default_mode_request_user_input\s+/.test(line));
    const match = rows.length === 1 ? featureRow.exec(rows[0]) : null;
    if (!match) {
      warn('this Codex version does not expose a supported, unambiguous setting.');
      return false;
    }
    stage = match[1]; result.enabled = match[2] === 'true';
    return true;
  };

  let updating = false;
  try {
    if (!(await inspect())) return result;
    if (result.enabled) { warnDevelopmentStage(); return result; }
    if (!enable) {
      warn('the setting is disabled for the selected profile; setup can enable it.');
      return result;
    }
    updating = true;
    await invoke(['features', 'enable', feature]);
    updating = false;
    if (await inspect() && result.enabled) { result.changed = true; warnDevelopmentStage(); }
    else warn('Codex setup finished, but enablement could not be confirmed.');
  } catch (error) {
    warn(commandWarning(error, updating));
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const unknown = args.some(value => !['--enable', '--json'].includes(value));
  const result = unknown
    ? { available: false, enabled: false, changed: false, warnings: ['Unknown Codex setup option. Use --enable to configure or no option to check; --json returns a safe status object.'] }
    : await ensureCodexQuestions({ enable: args.includes('--enable') });
  if (args.includes('--json')) console.log(JSON.stringify(result));
  else {
    for (const warning of result.warnings) console.warn('Warning: ' + warning);
    if (result.enabled) console.log(result.changed ? 'Codex structured questions enabled for the selected profile.' : 'Codex structured questions are enabled for the selected profile.');
  }
  // Missing or unsupported Codex is an advisory, never an installation/startup failure.
  process.exitCode = 0;
}
