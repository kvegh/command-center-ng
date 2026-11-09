import { constants, writeSync } from 'node:fs';
import { link, lstat, open, rename, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BEGIN = '# BEGIN CCNG MANAGED PATH';
const END = '# END CCNG MANAGED PATH';
const owner = process.getuid?.();
const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
const exportPath = directories => 'export PATH=' + directories.map(quote).join(':') + '${PATH:+:"$PATH"}';
function validatePath(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new Error('Use absolute paths without control characters.');
  if (value.includes(':')) throw new Error('A PATH directory cannot contain the colon separator.');
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}
function ownedFile(info) {
  if (!info.isFile() || owner === undefined || info.uid !== BigInt(owner)) throw new Error('Refusing a non-regular or unowned .bashrc.');
}
const unchanged = (first, second) => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'mode', 'uid', 'gid'].every(key => first[key] === second[key]);

function updateBlock(original, directories) {
  const markers = [];
  for (let start = 0; start < original.length;) {
    const next = original.indexOf(10, start), end = next < 0 ? original.length : next;
    const contentEnd = end > start && original[end - 1] === 13 ? end - 1 : end;
    const line = original.subarray(start, contentEnd).toString('utf8');
    if (line.includes('CCNG MANAGED PATH')) {
      if (line !== BEGIN && line !== END) throw new Error('Malformed CCNG PATH markers; .bashrc was not changed.');
      markers.push({ kind: line, start, end: contentEnd, newline: end !== contentEnd ? '\r\n' : '\n' });
    }
    start = next < 0 ? original.length : next + 1;
  }
  if (markers.length && (markers.length !== 2 || markers[0].kind !== BEGIN || markers[1].kind !== END)) throw new Error('Missing, duplicate or out-of-order CCNG PATH markers; .bashrc was not changed.');
  const newline = markers[0]?.newline || '\n';
  const exportCommand = exportPath(directories);
  // Repeated sourcing must not grow PATH or add an empty current-directory entry.
  const entries = [...directories].reverse().flatMap(path => [
    'case ":${PATH-}:" in',
    '  *:' + quote(path) + ':*) ;;',
    '  *) PATH=' + quote(path) + '${PATH:+:"$PATH"} ;;',
    'esac',
  ]);
  const block = Buffer.from([BEGIN, ...entries, 'export PATH', END].join(newline));
  if (markers.length) return { exportCommand, bytes: Buffer.concat([original.subarray(0, markers[0].start), block, original.subarray(markers[1].end)]) };
  const separator = original.length && original.at(-1) !== 10 ? Buffer.from('\n') : Buffer.alloc(0);
  return { exportCommand, bytes: Buffer.concat([original, separator, block, Buffer.from('\n')]) };
}

// A separate Node helper permits literal shell quoting and atomic replacement
// while preserving profile bytes. It never evaluates the user's shell profile.
export async function configureShellPath(home, paths) {
  home = validatePath(home);
  const directory = await stat(home, { bigint: true });
  if (!directory.isDirectory() || owner === undefined || directory.uid !== BigInt(owner)) throw new Error('Use the current user’s owned home directory.');
  if (!Array.isArray(paths) || !paths.length) throw new Error('Supply at least one existing binary directory.');
  const directories = [];
  for (const candidate of paths) {
    const path = validatePath(candidate);
    if (directories.includes(path)) continue;
    try { if ((await stat(path)).isDirectory()) directories.push(path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!directories.length) throw new Error('No existing binary directory was supplied.');
  const profile = join(home, '.bashrc');
  try {
    let original = Buffer.alloc(0), previous;
    try {
      ownedFile(await lstat(profile, { bigint: true }));
      const file = await open(profile, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        previous = await file.stat({ bigint: true }); ownedFile(previous);
        original = await file.readFile();
        if (!unchanged(previous, await file.stat({ bigint: true }))) throw new Error('.bashrc changed while it was read; retry after saving it.');
      } finally { await file.close(); }
    } catch (error) {
      if (error.code === 'ELOOP') throw new Error('Refusing a symbolic-link .bashrc.');
      if (error.code !== 'ENOENT') throw error;
    }
    const { bytes, exportCommand } = updateBlock(original, directories);
    if (!previous || !bytes.equals(original)) {
      const temporary = join(home, '.bashrc.ccng-' + randomUUID());
      let created = false;
      try {
        const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        created = true;
        try {
          await file.writeFile(bytes);
          if (previous && (await file.stat({ bigint: true })).gid !== previous.gid) await file.chown(-1, Number(previous.gid));
          await file.chmod(previous ? Number(previous.mode & 0o7777n) : 0o600); await file.sync();
        }
        finally { await file.close(); }
        if (previous) {
          const current = await lstat(profile, { bigint: true }); ownedFile(current);
          if (!unchanged(previous, current)) throw new Error('.bashrc changed before replacement; no update was applied.');
          await rename(temporary, profile);
        } else await link(temporary, profile); // EEXIST preserves a concurrently created profile.
      } finally {
        if (created) try { await unlink(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
    return { profile, directories, changed: !previous || !bytes.equals(original), exportCommand, sourceCommand: 'source ' + quote(profile) };
  } catch (error) { error.exportCommand = exportPath(directories); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [home, ...paths] = process.argv.slice(2);
    const result = await configureShellPath(home, paths);
    writeSync(1, `CCNG PATH ${result.changed ? 'updated' : 'already configured'} in ${quote(result.profile)}.\n`);
    writeSync(1, result.exportCommand + '\n' + result.sourceCommand + '\n');
    writeSync(1, 'A child installer cannot update its parent shell. Run the source command in your current shell.\n');
  } catch (error) {
    writeSync(2, 'CCNG PATH setup warning: ' + error.message + '\n');
    if (error.exportCommand) writeSync(1, error.exportCommand + '\n');
    process.exitCode = 1;
  }
}
