import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-installer-prefix-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const script = join(directory, 'install.sh');
  await cp(new URL('../install.sh', import.meta.url), script);
  await mkdir(join(directory, 'installer')); await mkdir(join(directory, 'bin'));
  // Exercise the real shell parser and destination selection, stopping before
  // prerequisites can install packages, access config or create an installation.
  await writeFile(join(directory, 'installer', 'prerequisites.sh'), `
printf 'PREREQUISITES_LOADED\\n'
ccng_environment_report() { printf 'CHECK_DIRECTORY=%s\\nCHECK_PATH=%s\\n' "$CCNG_INSTALL_DIR" "$PATH"; }
ccng_system_prerequisites() { printf 'INSTALL_DIRECTORY=%s\\n' "$CCNG_INSTALL_DIR"; exit 42; }
`);
  await writeFile(join(directory, 'installer', 'beads.sh'), ':\n');
  await writeFile(join(directory, 'bin', 'id'), '#!/bin/sh\nprintf "1000\\n"\n', { mode: 0o755 });
  const env = { ...process.env, PATH: join(directory, 'bin') + ':' + process.env.PATH };
  return args => exec('sh', [script, ...args], { cwd: directory, env, timeout: 5000 });
}

test('no-argument installation selects ~/commandcenter-ng without a directory prompt', async t => {
  const run = await fixture(t);
  await assert.rejects(run([]), error => {
    assert.equal(error.code, 42);
    assert.ok(error.stdout.includes(`INSTALL_DIRECTORY=${process.env.HOME}/commandcenter-ng\n`));
    assert.doesNotMatch(error.stdout + error.stderr, /Installation target directory|No target directory/);
    return true;
  });
});

test('explicit --prefix and legacy positional destinations preserve exact paths', async t => {
  const run = await fixture(t);
  const prefix = join(process.env.HOME, 'custom application [one]');
  for (const args of [['--prefix', prefix], [prefix]]) {
    await assert.rejects(run(args), error => error.code === 42 && error.stdout.includes(`INSTALL_DIRECTORY=${prefix}\n`));
  }
});

test('--check uses default or selected installation tools without entering installation', async t => {
  const run = await fixture(t);
  const defaults = join(process.env.HOME, 'commandcenter-ng');
  const custom = join(process.env.HOME, 'custom application');
  for (const [args, prefix] of [[['--check'], defaults], [['--check', '--prefix', custom], custom]]) {
    const result = await run(args);
    assert.ok(result.stdout.includes(`CHECK_DIRECTORY=${prefix}\n`));
    assert.ok(result.stdout.includes(`CHECK_PATH=${prefix}/tools/bin:${prefix}/tools/node_modules/.bin:`));
    assert.doesNotMatch(result.stdout, /INSTALL_DIRECTORY/);
  }
});

test('missing, empty and conflicting installation paths fail before prerequisites load', async t => {
  const run = await fixture(t);
  for (const args of [
    ['--prefix'], ['--prefix', ''], ['--prefix', '--check'], [''],
    ['--prefix', 'one', '--prefix', 'two'], ['--prefix', 'one', 'two'],
    ['one', '--prefix', 'two'], ['one', 'two'],
  ]) await assert.rejects(run(args), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Missing --prefix directory|must not be empty|Provide one installation directory/);
    assert.doesNotMatch(error.stdout, /PREREQUISITES_LOADED/);
    return true;
  });
});

test('--help documents the default and --prefix without inspecting prerequisites', async t => {
  const run = await fixture(t);
  const { stdout } = await run(['--help']);
  assert.match(stdout, /Usage: .*\[--prefix DIRECTORY\]/);
  assert.match(stdout, /Default installation directory: ~\/commandcenter-ng/);
  assert.match(stdout, /same --prefix for an existing custom installation/);
  assert.doesNotMatch(stdout, /PREREQUISITES_LOADED|installation prompts/);
});
