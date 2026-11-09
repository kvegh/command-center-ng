import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, chmod, chown, stat, lstat, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { configureShellPath } from '../installer/shell-path.mjs';

const execute = promisify(execFile);
const BEGIN = '# BEGIN CCNG MANAGED PATH', END = '# END CCNG MANAGED PATH';
async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'ccng-path-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const bin = join(home, 'local bin'); await mkdir(bin);
  return { home, bin, profile: join(home, '.bashrc') };
}

test('profile update preserves surrounding arbitrary bytes, order and permissions and is idempotent', async t => {
  const f = await fixture(t), original = Buffer.concat([Buffer.from('# Unrelated user setup\r\nexport ORIGINAL=1\n'), Buffer.from([0xff, 0xfe]), Buffer.from('\n# Keep last line')]);
  await writeFile(f.profile, original); await chmod(f.profile, 0o640);
  const originalGroup = (await stat(f.profile)).gid;
  const first = await configureShellPath(f.home, [f.bin, f.bin + '/', f.bin]);
  const written = await readFile(f.profile), inode = (await stat(f.profile)).ino;
  assert.deepEqual(written.subarray(0, original.length), original); assert.equal((await stat(f.profile)).mode & 0o777, 0o640);
  assert.equal((await stat(f.profile)).gid, originalGroup);
  assert.deepEqual(first.directories, [f.bin]); assert.equal(first.changed, true);
  assert.equal(written.toString().split(BEGIN).length - 1, 1); assert.equal(written.toString().split(END).length - 1, 1);
  const second = await configureShellPath(f.home, [f.bin]);
  assert.equal(second.changed, false); assert.deepEqual(await readFile(f.profile), written); assert.equal((await stat(f.profile)).ino, inode, 'no-op does not replace the profile');
});

test('only the existing managed region changes, preserving CRLF and following user configuration', async t => {
  const f = await fixture(t), prefix = '# User header\r\n', suffix = '\r\nexport AFTER=keep\r\n';
  await writeFile(f.profile, prefix + BEGIN + '\r\nexport PATH=old\r\n' + END + suffix);
  await configureShellPath(f.home, [f.bin]);
  const actual = await readFile(f.profile, 'utf8');
  assert.ok(actual.startsWith(prefix + BEGIN + '\r\n')); assert.ok(actual.endsWith(END + suffix));
  assert.ok(actual.includes("  *:'" + f.bin + "':*) ;;\r\n")); assert.equal(actual.replaceAll('\r\n', '').includes('\n'), false);
});

test('literal spaces, apostrophes, dollar signs and shell syntax are quoted without execution', async t => {
  const f = await fixture(t), literal = join(f.home, "quoted ' $HOME $(never-run) ; bin"); await mkdir(literal);
  const result = await configureShellPath(f.home, [literal, f.bin, join(f.home, 'missing')]);
  assert.deepEqual(result.directories, [literal, f.bin]);
  assert.equal((await stat(f.profile)).mode & 0o777, 0o600);
  assert.equal(result.exportCommand, "export PATH='" + literal.replaceAll("'", "'\"'\"'") + "':'" + f.bin + "'${PATH:+:\"$PATH\"}");
  assert.equal(result.sourceCommand, "source '" + f.profile + "'");
  assert.deepEqual((await readdir(f.home)).sort(), ['.bashrc', 'local bin', "quoted ' $HOME $(never-run) ; bin"].sort());
  const specialHome = join(f.home, "home's $HOME"); await mkdir(specialHome);
  const special = await configureShellPath(specialHome, [literal]);
  assert.equal(special.sourceCommand, "source '" + join(specialHome, '.bashrc').replaceAll("'", "'\"'\"'") + "'");
});

test('missing profiles are created privately and the CLI prints current-shell instructions', async t => {
  const f = await fixture(t), helper = fileURLToPath(new URL('../installer/shell-path.mjs', import.meta.url));
  const { stdout, stderr } = await execute(process.execPath, [helper, f.home, f.bin]);
  assert.equal(stderr, ''); assert.equal((await stat(f.profile)).mode & 0o777, 0o600);
  assert.match(stdout, /export PATH=/); assert.ok(stdout.includes("source '" + f.profile + "'"));
  assert.match(stdout, /child installer cannot update its parent shell/);
  assert.equal((await readdir(f.home)).some(name => name.startsWith('.bashrc.ccng-')), false);
});

test('malformed, duplicate or incomplete managed markers fail without modifying user bytes', async t => {
  const f = await fixture(t);
  for (const text of [BEGIN, END, END + '\n' + BEGIN, BEGIN + '\n' + END + '\n' + BEGIN + '\n' + END, '# ' + BEGIN + '\n' + END, BEGIN + ' extra\n' + END]) {
    const original = Buffer.from(text); await writeFile(f.profile, original);
    await assert.rejects(configureShellPath(f.home, [f.bin]), /markers/);
    assert.deepEqual(await readFile(f.profile), original);
  }
});

test('symbolic-link and non-regular profiles are refused without following or replacing them', async t => {
  const f = await fixture(t), target = join(f.home, 'user-profile'); await writeFile(target, 'User content'); await symlink(target, f.profile);
  await assert.rejects(configureShellPath(f.home, [f.bin]), error => {
    assert.match(error.message, /non-regular|symbolic-link/); assert.ok(error.exportCommand.includes(f.bin)); assert.equal(error.sourceCommand, undefined); return true;
  });
  assert.equal((await lstat(f.profile)).isSymbolicLink(), true); assert.equal(await readFile(target, 'utf8'), 'User content');
  await rm(f.profile); await mkdir(f.profile);
  await assert.rejects(configureShellPath(f.home, [f.bin]), /non-regular/); assert.equal((await lstat(f.profile)).isDirectory(), true);
});

test('unsafe paths and absent binary directories fail before touching the profile', async t => {
  const f = await fixture(t); await writeFile(f.profile, 'Keep this profile\n');
  for (const path of [join(f.home, 'bad\npath'), join(f.home, 'bad\tpath'), join(f.home, 'bad\0path'), join(f.home, 'bad:path'), 'relative']) {
    await assert.rejects(configureShellPath(f.home, [path]), /absolute paths|colon separator/);
    assert.equal(await readFile(f.profile, 'utf8'), 'Keep this profile\n');
  }
  await assert.rejects(configureShellPath(f.home, []), /at least one/);
  await assert.rejects(configureShellPath(f.home, [join(f.home, 'missing')]), /No existing/);
});

test('CLI profile rejection prints a manual export and no unsafe source instruction', async t => {
  const f = await fixture(t), target = join(f.home, 'profile-target'); await writeFile(target, 'Preserve this target\n'); await symlink(target, f.profile);
  const helper = fileURLToPath(new URL('../installer/shell-path.mjs', import.meta.url));
  await assert.rejects(execute(process.execPath, [helper, f.home, f.bin]), error => {
    assert.equal(error.code, 1); assert.match(error.stderr, /CCNG PATH setup warning/); assert.match(error.stdout, /export PATH=/); assert.ok(!error.stdout.includes('source ')); return true;
  });
  assert.equal((await lstat(f.profile)).isSymbolicLink(), true); assert.equal(await readFile(target, 'utf8'), 'Preserve this target\n');
});

test('actual Bash sources the managed block repeatedly without duplicates or an empty PATH component', async t => {
  const f = await fixture(t), literal = join(f.home, "quoted ' $PATH bin"); await mkdir(literal);
  await configureShellPath(f.home, [f.bin, literal]);
  for (const initial of ['/usr/bin:/bin', '', null]) {
    const script = (initial === null ? 'unset PATH; ' : 'PATH="$2"; ') + 'source "$1"; source "$1"; printf "%s" "$PATH"';
    const { stdout } = await execute('/bin/bash', ['--noprofile', '--norc', '-c', script, 'ccng-path-fixture', f.profile, initial || ''], { env: { ...process.env, BASH_ENV: '', ENV: '' } });
    const expected = [f.bin, literal, ...(initial ? [initial] : [])].join(':');
    assert.equal(stdout, expected); assert.equal(stdout.startsWith(':'), false); assert.equal(stdout.endsWith(':'), false); assert.equal(stdout.includes('::'), false);
  }
});

test('atomic replacement preserves a profile’s different supplementary group and group-read mode', async t => {
  const group = process.getgroups?.().find(gid => gid !== process.getgid?.());
  if (group === undefined) { t.skip('No different supplementary group is available without privilege. Primary-group preservation is checked separately.'); return; }
  const f = await fixture(t); await writeFile(f.profile, '# User configuration\n'); await chown(f.profile, -1, group); await chmod(f.profile, 0o640);
  const original = await stat(f.profile);
  await configureShellPath(f.home, [f.bin]);
  const result = await stat(f.profile);
  assert.notEqual(result.ino, original.ino); assert.equal(result.uid, original.uid); assert.equal(result.gid, group); assert.equal(result.mode & 0o777, 0o640);
  assert.ok((await readFile(f.profile, 'utf8')).startsWith('# User configuration\n'));
});
