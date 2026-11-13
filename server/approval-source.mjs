import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';

const fail = message => Object.assign(new Error(message), { status: 400 });
const extensions = new Set(['.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.sh', '.yml', '.yaml', '.json', '.md']);
const digest = value => createHash('sha256').update(value).digest('hex');
const credentialMarkers = /-----BEGIN .*PRIVATE KEY-----|\b(?:ghp_|github_pat_|sk-)[A-Za-z0-9_-]{20,}|\$ANSIBLE_VAULT;|!vault\b/;
const credentialName = /[\w-]*(?:password|passwd|token|secret|api[_-]?key)[\w-]*/i;
const isSourceReference = value => typeof value === 'string' && (
  /^\{\{\s*[A-Za-z_]\w*(?:(?!\}\})[\s\S])*\}\}$/.test(value.trim())
  || /^\$(?:\{[A-Za-z_]\w*\}|[A-Za-z_]\w*)$/.test(value.trim())
);

export function sourceContainsCredentials(content, extension) {
  if (content.includes('\0') || credentialMarkers.test(content)) return true;
  if (extension === '.json') {
    let parsed;
    try { parsed = JSON.parse(content); } catch { /* Malformed files still receive text inspection below. */ }
    if (parsed !== undefined) {
      // Native JSON parsing exposes escaped keys without executing anything.
      // Walk iteratively so nested documents do not consume the call stack.
      const pending = [parsed];
      while (pending.length) {
        const current = pending.pop();
        if (typeof current === 'string' && credentialMarkers.test(current)) return true;
        if (!current || typeof current !== 'object') continue;
        for (const [key, value] of Object.entries(current)) {
          if (credentialName.test(key) && value !== null && value !== '' && typeof value !== 'boolean' && !isSourceReference(value)) return true;
          pending.push(value);
        }
      }
      return false;
    }
  }
  // JSON/YAML/Markdown literals need colon checks; code annotations and ordinary
  // expressions such as token: str or password: process.env.NAME are not values.
  const document = ['.json', '.yml', '.yaml', '.md'].includes(extension);
  const text = content.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n');
  const assignments = /(?:^|[\s{,])["']?([\w-]*(?:password|passwd|token|secret|api[_-]?key)[\w-]*)["']?\s*([:=])\s*("(?:\\.|[^"\\\r\n])*"|'(?:''|[^'\r\n])*'|[^\r\n,}\]]+)/gim;
  for (const [, , separator, raw] of text.matchAll(assignments)) {
    const quoted = raw.startsWith('"') || raw.startsWith("'");
    const value = (quoted ? raw.slice(1, -1) : raw.replace(/\s+#.*$/, '')).trim();
    if (isSourceReference(value)) continue;
    if (separator === ':' && !document && !quoted) continue;
    if (document && /^[|>][+-]?\d?$/.test(value)) return true;
    // Preserve readable helper expressions such as os.environ[...].
    if (separator === '=' && !quoted) continue;
    if (!value || (!quoted && /^(?:null|none|true|false|~)$/i.test(value))) continue;
    if (document || value.length >= 8) return true;
  }
  return false;
}
export function isSensitiveSourcePath(path) {
  return path.split(/[\\/]/).some(part => {
    if (part.startsWith('.') || /secret|credential|password|token|vault/i.test(part)) return true;
    // Protect auth-specific path/name words without rejecting ordinary words
    // such as "authenticated" or "author". Include camelCase/acronym names.
    const words = part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').split(/[^a-z0-9]+/i);
    return words.some(word => /^(?:auth|oauth|authentication|authorization)\d*$/i.test(word));
  });
}
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text, value) => new RegExp(`(?:^|[\\s"'\x60(=@])${escaped(value)}(?=$|[\\s"'\x60),;])`, 'm').test(text);

export function approvalCommand(question) {
  const command = question.params.command;
  return typeof command === 'string' ? command : Array.isArray(command) && command.every(part => typeof part === 'string') ? command.join(' ') : '';
}

export function approvalWorkingDirectory(question, fallbackCwd) {
  const cwd = question.params.cwd ?? fallbackCwd;
  if (typeof cwd !== 'string' || !cwd || cwd.length > 10000 || /[\x00-\x1f]/.test(cwd) || !isAbsolute(cwd)) throw fail('The approval working directory must be an absolute path. Reload the current request instead of guessing its directory.');
  return resolve(cwd);
}

function referencesProjectPythonModule(cwd, command, requested) {
  // Recognize only explicit imports mapped to the two ordinary project layouts.
  // This does not resolve Python packages, consult a venv or follow dependencies.
  return [resolve(cwd), resolve(cwd, 'src')].some(root => {
    const module = relative(root, requested).slice(0, -3).split('/').join('.');
    if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/.test(module)) return false;
    return new RegExp(`\\b(?:from\\s+${escaped(module)}\\s+import\\b|import\\s+${escaped(module)}(?=\\s|[,;]|$))`).test(command);
  });
}

function referencesUnittestSource(cwd, command, requested) {
  if (extname(requested) !== '.py') return false;
  // Recognize literal unittest arguments only; never evaluate a shell command,
  // inspect a container or infer source from an arbitrary mounted directory.
  let text = command.trim();
  const shell = text.match(/^(?:\/(?:usr\/)?bin\/)?bash\s+-lc\s+(.+)$/);
  if (shell) {
    text = shell[1];
    // A joined argv string cannot establish which words belong to bash -c.
    // Refuse unquoted/ambiguous wrappers rather than infer their execution.
    if (!((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"')))) return false;
    text = text.slice(1, -1);
  }
  if (!/^[\w./:=,@+-]+(?:[ \t]+[\w./:=,@+-]+)*$/.test(text)) return false;
  let words = text.split(/[ \t]+/), directory = resolve(cwd);
  if (words[0] === 'podman' && words[1] === 'run') {
    let volume, workdir, entrypoint, index = 2;
    const temporaryMounts = [];
    const switches = new Set(['--rm', '--read-only', '--pull=never', '--network=none']);
    const valued = new Set(['-v', '--volume', '-w', '--workdir', '-e', '--env', '--tmpfs', '--entrypoint']);
    for (; index < words.length && words[index].startsWith('-'); index++) {
      const word = words[index];
      if (switches.has(word)) continue;
      const equals = word.indexOf('='), option = equals < 0 ? word : word.slice(0, equals);
      if (!valued.has(option)) return false;
      const value = equals < 0 ? words[++index] : word.slice(equals + 1);
      if (!value || value.startsWith('-')) return false;
      if (['-v', '--volume'].includes(option)) { if (volume) return false; volume = value; }
      if (['-w', '--workdir'].includes(option)) { if (workdir) return false; workdir = value; }
      if (option === '--entrypoint') { if (entrypoint) return false; entrypoint = value; }
      if (option === '--tmpfs') temporaryMounts.push(value.split(':')[0]);
      if (['-e', '--env'].includes(option) && (!/^[A-Za-z_]\w*=/.test(value) || /^(?:PYTHONPATH|PYTHONHOME|PYTHONSAFEPATH)=/.test(value))) return false;
    }
    if (!volume || !workdir || entrypoint !== 'python3' || !words[index]) return false;
    const parts = volume.split(':');
    if (parts.length !== 3 || parts[2] !== 'ro') return false;
    const [hostRoot, containerRoot] = parts;
    const ordinaryAbsolute = path => isAbsolute(path) && path !== '/' && path === resolve(path);
    if (![hostRoot, containerRoot, workdir].every(ordinaryAbsolute)) return false;
    const local = relative(containerRoot, workdir);
    if (local === '..' || local.startsWith('../') || isAbsolute(local)) return false;
    if (temporaryMounts.some(path => !ordinaryAbsolute(path) || path === workdir || workdir.startsWith(path + '/') || path.startsWith(workdir + '/'))) return false;
    directory = resolve(hostRoot, local);
    words = ['python3', ...words.slice(index + 1)];
  }
  if (!/^(?:\/(?:usr\/)?bin\/)?python(?:3(?:\.\d+)?)?$/.test(words[0])) return false;
  let index = 1;
  if (words[index] === '-B') index++;
  if (words[index++] !== '-m' || words[index++] !== 'unittest') return false;
  const targets = words.slice(index).filter(word => !['-v', '-q'].includes(word));
  if (targets.length !== 1 || targets[0].toLowerCase() === 'discover' || dirname(requested) !== directory) return false;
  const module = basename(requested, '.py');
  return /^[A-Za-z_]\w*$/.test(module) && new RegExp(`^${escaped(module)}(?:\\.[A-Za-z_]\\w*){0,2}$`).test(targets[0]);
}

export function referencesApprovalSource(cwd, command, path) {
  const requested = resolve(cwd, path);
  if (!extensions.has(extname(requested))) return false;
  const relativePath = relative(cwd, requested);
  const module = basename(requested, '.py');
  const pythonImport = extname(requested) === '.py' && /^[A-Za-z_]\w*$/.test(module) && new RegExp(`\\b(?:from\\s+${escaped(module)}\\s+import\\b|import\\s+${escaped(module)}\\b)`).test(command);
  const importDirectory = dirname(requested) === resolve(cwd) || (dirname(requested) !== '/' && mentions(command, dirname(requested)));
  return mentions(command, requested) || mentions(command, path) || mentions(command, relativePath) || mentions(command, './' + relativePath)
    || (pythonImport && importDirectory) || (extname(requested) === '.py' && referencesProjectPythonModule(cwd, command, requested))
    || referencesUnittestSource(cwd, command, requested);
}

export async function inspectApprovalSource(cwd, command, path, startLine = 1) {
  if (typeof path !== 'string' || !path || path.length > 1000 || /[\x00-\x1f]/.test(path) || isSensitiveSourcePath(path)) throw fail('Read only ordinary helper source; hidden, credential and Vault paths require private user review.');
  if (!Number.isInteger(startLine) || startLine < 1) throw fail('Choose a valid starting line.');
  const requested = resolve(cwd, path);
  if (isSensitiveSourcePath(requested)) throw fail('Read only ordinary helper source; hidden, credential and Vault paths require private user review.');
  const file = await realpath(requested);
  if (file !== requested || !extensions.has(extname(file))) throw fail('Read a regular supported source file directly; symlinks and unsupported file types are not allowed.');
  if (!referencesApprovalSource(cwd, command, path)) throw fail('This helper source is not referenced by the exact pending approval.');
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 500000) throw fail('Read only a regular helper source file up to 500000 bytes.');
    const buffer = Buffer.alloc(500001); let length = 0;
    while (length < buffer.length) { const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null); if (!bytesRead) break; length += bytesRead; }
    if (length > 500000) throw fail('This helper source grew beyond the review limit.');
    const bytes = buffer.subarray(0, length); const content = bytes.toString('utf8');
    if (sourceContainsCredentials(content, extname(file))) throw fail('This source appears to contain credential material, Vault content or binary data. Review it privately.');
    const lines = content.split('\n'); const page = []; let size = 0;
    for (const line of lines.slice(startLine - 1, startLine + 159)) {
      if (line.length > 16000) throw fail('This helper has a line too large for bounded inspection. Review it privately.');
      if (size + line.length + 1 > 16000) break;
      page.push(line); size += line.length + 1;
    }
    const next = startLine - 1 + page.length;
    return { path: file, workingDirectory: resolve(cwd), sha256: digest(bytes), commandSha256: digest(command), startLine, totalLines: lines.length, nextStartLine: next < lines.length ? next + 1 : null, text: page.join('\n') };
  } finally { await handle.close(); }
}
