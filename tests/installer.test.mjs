import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, cp, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);

test('installer updates distinguish nested installation output from actual source changes', async t => {
  const dir = await mkdtemp(join(homedir(), '.ccng-installer-test-'));
  const upstream = join(dir, 'upstream'); const checkout = join(dir, 'checkout'); const remote = join(dir, 'origin.git');
  const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
  const git = (cwd, ...args) => exec('git', ['-C', cwd, ...args], { env: gitEnv });
  let targetName = 'targetdir';
  try {
    await mkdir(upstream);
    await cp(fileURLToPath(new URL('../install.sh', import.meta.url)), join(upstream, 'install.sh'));
    await cp(fileURLToPath(new URL('../installer', import.meta.url)), join(upstream, 'installer'), { recursive: true });
    for (const name of ['src', 'server', 'docs']) { await mkdir(join(upstream, name)); await writeFile(join(upstream, name, 'fixture'), 'synthetic fixture'); }
    for (const name of ['beads.mjs', 'beads-check.mjs']) await cp(fileURLToPath(new URL('../server/' + name, import.meta.url)), join(upstream, 'server', name));
    await writeFile(join(upstream, 'package.json'), JSON.stringify({ name: 'command-center-ng', version: '0.0.1' }));
    for (const name of ['package-lock.json', 'index.html', 'tsconfig.json', 'vite.config.mjs', 'README.md', 'AGENTS.md', 'design_decisions_history.md']) await writeFile(join(upstream, name), 'synthetic fixture');
    await git(upstream, 'init', '--initial-branch=main');
    await git(upstream, '-c', 'commit.gpgsign=false', 'add', '.'); await git(upstream, '-c', 'commit.gpgsign=false', 'commit', '-m', 'Create installer fixture');
    await exec('git', ['clone', '--bare', upstream, remote]);
    await git(upstream, 'remote', 'add', 'origin', remote);
    await exec('git', ['clone', remote, checkout]);
    await writeFile(join(upstream, 'README.md'), 'Fetched update fixture');
    await git(upstream, 'add', 'README.md'); await git(upstream, '-c', 'commit.gpgsign=false', 'commit', '-m', 'Provide upstream update'); await git(upstream, 'push', 'origin', 'main');
    const bin = join(dir, 'bin'); await mkdir(bin);
    // Stop at the build boundary: these tests exercise real Git and the shell
    // installer without installing dependencies or replacing the fixture target.
    await writeFile(join(bin, 'npm'), '#!/bin/sh\nif [ "$1" = --version ]; then echo 10.9.2; exit 0; fi\necho CCNG_FIXTURE_BUILD_REACHED\nexit 42\n', { mode: 0o755 });
    await writeFile(join(bin, 'bd'), '#!/bin/sh\ncase \"$*\" in *version*) echo \"bd version 1.3.2\" ;; *) echo \"--json --readonly --brief --flat\" ;; esac\n', { mode: 0o755 });
    await writeFile(join(bin, 'codex'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const env = { ...process.env, PATH: bin + ':' + process.env.PATH };
    await mkdir(join(checkout, targetName));
    await writeFile(join(checkout, targetName, 'package.json'), JSON.stringify({ name: 'command-center-ng', version: '0.0.1' }));
    await writeFile(join(checkout, targetName, 'README.md'), 'Existing installed version');
    const update = () => exec('sh', [join(checkout, 'install.sh'), '--update', '--prefix', './' + targetName], { cwd: checkout, env });
    const reachesBuild = () => assert.rejects(update(), error => error.code === 42 && error.stdout.includes('CCNG_FIXTURE_BUILD_REACHED'));
    const rejectsSourceChanges = () => assert.rejects(update(), error => error.code === 1 && error.stderr.includes('local changes'));

    await t.test('untracked targetdir permits fetching, fast-forwarding, and the build', async () => {
      assert.match((await git(checkout, 'status', '--short')).stdout, /\?\? targetdir\//);
      await reachesBuild();
      assert.equal((await git(checkout, 'rev-parse', 'HEAD')).stdout, (await git(upstream, 'rev-parse', 'HEAD')).stdout);
      assert.equal(await readFile(join(checkout, targetName, 'README.md'), 'utf8'), 'Existing installed version');
    });
    await t.test('unrelated untracked files remain protected', async () => {
      await writeFile(join(checkout, 'local-note'), 'Local work'); await rejectsSourceChanges(); await rm(join(checkout, 'local-note'));
    });
    await t.test('an installation-name prefix does not hide a sibling directory', async () => {
      const sibling = join(checkout, 'targetdir-extra'); await mkdir(sibling); await writeFile(join(sibling, 'local-note'), 'Local work');
      await rejectsSourceChanges(); await rm(sibling, { recursive: true });
    });
    await t.test('unstaged and staged tracked source edits remain protected', async () => {
      const readme = join(checkout, 'README.md'); const original = await readFile(readme);
      await writeFile(readme, 'Local source change'); await rejectsSourceChanges();
      await git(checkout, 'add', 'README.md'); await rejectsSourceChanges();
      await writeFile(readme, original); await git(checkout, 'add', 'README.md');
    });
    await t.test('spaces and Git pattern characters in the target are literal', async () => {
      const previous = targetName; targetName = 'install target[1]';
      await rename(join(checkout, previous), join(checkout, targetName)); await reachesBuild();
      const sibling = join(checkout, 'install target1'); await mkdir(sibling); await writeFile(join(sibling, 'local-note'), 'Local work');
      await rejectsSourceChanges(); await rm(sibling, { recursive: true });
    });
    await t.test('tracked files inside the target cannot be excluded', async () => {
      await git(checkout, 'add', '--', targetName + '/README.md');
      await assert.rejects(update(), error => error.code === 1 && error.stderr.includes('tracked source files'));
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
