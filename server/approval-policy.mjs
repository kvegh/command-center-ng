import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parseDocument, isAlias, isMap, isScalar, visit } from 'yaml';

const fileLimit = 65_536;
const instructionLimit = 32_768;
const policyError = 'Approval policy is unavailable or invalid. Automatic approvals are disabled; restore a valid private policy and restart the application.';
const fields = new Set(['version', 'source_reading', 'approval_instructions']);

function normalized(sourceReading, instructions, approvalEnabled = true, error = null) {
  const sha256 = createHash('sha256').update(JSON.stringify({ version: 1, sourceReading, instructions, approvalEnabled })).digest('hex');
  return Object.freeze({ sourceReading, instructions, approvalEnabled, error, sha256 });
}

// Absence of an operator-selected policy retains the product's conservative rules.
export const DEFAULT_APPROVAL_POLICY = normalized('restricted', '');
export const approvalPolicyFile = appDir => join(appDir, 'etc', 'approval-policy.yml');

function parsePolicy(text) {
  const document = parseDocument(text, { schema: 'core', strict: true, uniqueKeys: true, prettyErrors: false });
  if (document.errors.length || document.warnings.length || !isMap(document.contents)) throw new Error(policyError);
  visit(document, (_key, node) => {
    // Policy needs only a small literal mapping. References and explicit tags
    // add no useful behavior here and must not turn configuration into code.
    if (isAlias(node) || node?.anchor || node?.tag) throw new Error(policyError);
  });
  const mapping = document.contents;
  if (mapping.items.length !== fields.size || mapping.items.some(pair => !isScalar(pair.key) || !fields.has(pair.key.value) || !isScalar(pair.value))) throw new Error(policyError);
  const data = document.toJS({ maxAliasCount: 0 });
  if (data.version !== 1 || !['restricted', 'all'].includes(data.source_reading)
    || typeof data.approval_instructions !== 'string' || data.approval_instructions.length > instructionLimit
    || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(data.approval_instructions)) throw new Error(policyError);
  return normalized(data.source_reading, data.approval_instructions);
}

function privateFile(info) {
  return info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid()
    && !(info.mode & 0o077) && info.nlink === 1 && info.size <= fileLimit;
}

export async function readApprovalPolicy(file, { configured = false } = {}) {
  let handle;
  try {
    // Nonblocking and no-follow flags keep FIFOs and links from hanging or
    // redirecting startup. Read no more than the configured byte boundary.
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await handle.stat();
    if (!privateFile(before)) throw new Error(policyError);
    const buffer = Buffer.alloc(fileLimit + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > fileLimit) throw new Error(policyError);
    const finished = await handle.stat(), current = await lstat(file);
    if (![finished, current].every(info => privateFile(info)
      && ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(key => info[key] === before[key]))) throw new Error(policyError);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
    return parsePolicy(text);
  } catch (error) {
    if (!handle && error.code === 'ENOENT' && !configured) return DEFAULT_APPROVAL_POLICY;
    // YAML diagnostics can quote the source. Never return or log that error.
    return normalized('restricted', '', false, policyError);
  } finally { await handle?.close(); }
}
