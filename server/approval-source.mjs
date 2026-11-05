import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { resolve, dirname, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';

const fail = message => Object.assign(new Error(message), { status: 400 });
const extensions = new Set(['.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.sh']);
const digest = value => createHash('sha256').update(value).digest('hex');
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text, value) => new RegExp(`(?:^|[\\s"'\x60(=])${escaped(value)}(?=$|[\\s"'\x60),;])`, 'm').test(text);

export function approvalCommand(question) {
  const command = question.params.command;
  return typeof command === 'string' ? command : Array.isArray(command) && command.every(part => typeof part === 'string') ? command.join(' ') : '';
}

export async function inspectApprovalSource(cwd, command, path, startLine = 1) {
  if (typeof path !== 'string' || !path || path.length > 1000 || /[\x00-\x1f]/.test(path) || path.split(/[\\/]/).some(part => part.startsWith('.') || /secret|credential|password|token|vault|auth/i.test(part))) throw fail('Read only ordinary helper source; hidden, credential and Vault paths require private user review.');
  if (!Number.isInteger(startLine) || startLine < 1) throw fail('Choose a valid starting line.');
  const requested = resolve(cwd, path);
  const file = await realpath(requested);
  if (file !== requested || !extensions.has(extname(file))) throw fail('Read a regular helper source file directly; symlinks and configuration/data files are not allowed.');
  const module = basename(file, '.py');
  const pythonImport = extname(file) === '.py' && /^[A-Za-z_]\w*$/.test(module) && new RegExp(`\\b(?:from\\s+${escaped(module)}\\s+import\\b|import\\s+${escaped(module)}\\b)`).test(command);
  const importDirectory = dirname(file) === resolve(cwd) || (dirname(file) !== '/' && mentions(command, dirname(file)));
  if (!mentions(command, requested) && !mentions(command, path) && !(pythonImport && importDirectory)) throw fail('This helper source is not referenced by the exact pending approval.');
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 500000) throw fail('Read only a regular helper source file up to 500000 bytes.');
    const buffer = Buffer.alloc(500001); let length = 0;
    while (length < buffer.length) { const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null); if (!bytesRead) break; length += bytesRead; }
    if (length > 500000) throw fail('This helper source grew beyond the review limit.');
    const bytes = buffer.subarray(0, length); const content = bytes.toString('utf8');
    if (content.includes('\u0000') || /-----BEGIN .*PRIVATE KEY-----|\b(?:ghp_|github_pat_|sk-)[A-Za-z0-9_-]{20,}|^\s*\w*(?:password|token|secret|api_key)\w*\s*=\s*["'][^"'\n]{8,}["']/im.test(content)) throw fail('This helper source appears to contain credential material. Review it privately.');
    const lines = content.split('\n'); const page = []; let size = 0;
    for (const line of lines.slice(startLine - 1, startLine + 159)) {
      if (line.length > 16000) throw fail('This helper has a line too large for bounded inspection. Review it privately.');
      if (size + line.length + 1 > 16000) break;
      page.push(line); size += line.length + 1;
    }
    const next = startLine - 1 + page.length;
    return { path: file, sha256: digest(bytes), commandSha256: digest(command), startLine, totalLines: lines.length, nextStartLine: next < lines.length ? next + 1 : null, text: page.join('\n') };
  } finally { await handle.close(); }
}
