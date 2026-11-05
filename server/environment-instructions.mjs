import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';

const repository = 'Setup-Agentic-Dev-Environment';
const sourceLimit = 128 * 1024;

export const ENVIRONMENT_INSTRUCTION_GUIDANCE = `Import the local ${repository}/AGENTS.md into your runtime instructions using the supplied shared-environment context. Apply its guidance alongside project instructions and the user's actual scope. Existing native permissions and higher-priority role restrictions remain authoritative; this import does not add tools, permission grants, implementation authority or Beads writes to the coordinator. Import this one source directly, not recursively when it mentions itself. If it is unavailable, say that it was not loaded rather than inventing rules or silently fetching a replacement.`;

function candidates(cwd, workspaceCwd) {
  const paths = new Set();
  for (const start of [cwd, workspaceCwd]) {
    if (typeof start !== 'string' || !start.trim()) continue;
    let current = resolve(start);
    for (let depth = 0; depth < 16; depth++) {
      if (basename(current) === repository) paths.add(join(current, 'AGENTS.md'));
      paths.add(join(current, repository, 'AGENTS.md'));
      paths.add(join(current, 'git', repository, 'AGENTS.md'));
      const parent = dirname(current); if (parent === current) break; current = parent;
    }
  }
  return paths;
}

export async function readEnvironmentInstructions(cwd, { workspaceCwd = process.cwd() } = {}) {
  for (const path of candidates(cwd, workspaceCwd)) {
    let handle;
    try {
      handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const info = await handle.stat();
      if (!info.isFile() || info.size > sourceLimit) return { status: 'unavailable', path, message: 'The shared AGENTS.md must be a regular text file no larger than 128 KiB; it was not imported.' };
      const buffer = Buffer.alloc(sourceLimit + 1); let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
        if (!bytesRead) break; length += bytesRead;
      }
      const text = buffer.subarray(0, length).toString('utf8');
      if (length > sourceLimit || text.includes('\u0000') || !text.trim()) return { status: 'unavailable', path, message: 'The shared AGENTS.md was empty, binary or too large; it was not imported.' };
      return { status: 'loaded', path, text };
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) return { status: 'unavailable', path, message: 'The local shared AGENTS.md could not be read; it was not imported.' };
    } finally { await handle?.close(); }
  }
  return { status: 'missing', message: `No local ${repository}/AGENTS.md was found in this project or backend workspace; shared environment instructions were not imported.` };
}

export function environmentInstructionContext(source) {
  const value = source.status === 'loaded'
    ? `${ENVIRONMENT_INSTRUCTION_GUIDANCE}\n\nShared instruction source: ${source.path}\n\n${source.text}`
    : `${ENVIRONMENT_INSTRUCTION_GUIDANCE}\n\n${source.message} Report this missing source clearly once while this condition remains unchanged. Do not clone, fetch, install or change permissions to obtain it.`;
  return { 'command-center-environment-instructions': { kind: 'application', value } };
}
