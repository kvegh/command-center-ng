import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, cp, writeFile, readFile, rm, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execute = promisify(execFile);
async function fixture(t, { existing = false, approve = true, failNpm = false, failBeads = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-per-user-codex-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'source'), home = join(directory, 'user home'), bin = join(directory, 'fixture-bin'), custom = join(directory, "custom CLI's prefix");
  for (const path of [home, bin, join(source, 'installer'), join(source, 'server'), join(source, 'src'), join(source, 'docs'), join(source, 'etc')]) await mkdir(path, { recursive: true });
  await cp(new URL('../install.sh', import.meta.url), join(source, 'install.sh'));
  await cp(new URL('../etc/approval-policy-template.yml', import.meta.url), join(source, 'etc', 'approval-policy-template.yml'));
  await cp(new URL('../installer/prerequisites.sh', import.meta.url), join(source, 'installer', 'prerequisites.sh'));
  await cp(new URL('../installer/shell-path.mjs', import.meta.url), join(source, 'installer', 'shell-path.mjs'));
  const prerequisites = await readFile(join(source, 'installer', 'prerequisites.sh'), 'utf8');
  await writeFile(join(source, 'installer', 'prerequisites.sh'), prerequisites + `
ccng_system_prerequisites() { :; }
ccng_detect_platform() { CCNG_RHEL9=0; }
ccng_confirm() { [ "$CCNG_TEST_APPROVE" = 1 ]; }
# Restrict Codex discovery to this fixture, regardless of host installations.
command() {
    if [ "$1" = -v ] && [ "$2" = codex ]; then
        CCNG_TEST_OLD_IFS=$IFS; IFS=:
        for CCNG_TEST_ENTRY in $PATH; do
            case "$CCNG_TEST_ENTRY" in "$CCNG_TEST_ROOT"/*)
                if [ -x "$CCNG_TEST_ENTRY/codex" ]; then IFS=$CCNG_TEST_OLD_IFS; printf '%s\\n' "$CCNG_TEST_ENTRY/codex"; return 0; fi ;;
            esac
        done
        IFS=$CCNG_TEST_OLD_IFS; return 1
    fi
    /bin/sh -c 'command -v "$1"' sh "$2"
}
`);
  await writeFile(join(source, 'installer', 'beads.sh'), 'ccng_beads_setup() { [ "$CCNG_TEST_FAIL_BEADS" = 0 ]; }\n');
  await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'command-center-ng', version: '0.0.1' }));
  for (const name of ['package-lock.json', 'index.html', 'tsconfig.json', 'vite.config.mjs', 'README.md', 'AGENTS.md', 'design_decisions_history.md']) await writeFile(join(source, name), 'Fixture source');
  await writeFile(join(source, 'server', 'main.mjs'), 'import { execFileSync } from "node:child_process"; import { writeSync } from "node:fs"; writeSync(1, execFileSync("codex", ["--version"]));\n');
  await writeFile(join(source, 'server', 'user-service.mjs'), 'import { writeSync } from "node:fs"; writeSync(1, process.env.PATH);\n');
  for (const name of ['beads-check.mjs', 'codex-setup.mjs']) await writeFile(join(source, 'server', name), 'process.exitCode = 0;\n');
  const cli = join(directory, 'codex-fixture');
  await writeFile(cli, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CCNG_TEST_CODEX_CALLS"\ncase "$*" in --version) echo "Synthetic Codex CLI" ;; "app-server daemon --help"|"login status") : ;; *) exit 97 ;; esac\n', { mode: 0o755 });
  const script = (name, body) => writeFile(join(bin, name), '#!/bin/sh\nset -eu\n' + body + '\n', { mode: 0o755 });
  await script('id', 'printf "1000\\n"');
  await script('bd', 'exit 0');
  await script('realpath', 'if [ "$#" = 1 ] && [ "$1" = "$HOME" ]; then printf "%s\\n" "$CCNG_TEST_HOME"; exit 0; fi\nif [ "$#" = 2 ] && [ "$1" = -m ] && [ "$2" = "$HOME/commandcenter-ng" ]; then printf "%s/commandcenter-ng\\n" "$CCNG_TEST_HOME"; exit 0; fi\nexec /usr/bin/realpath "$@"');
  await script('npm', `
case "$1" in
    --version) echo '10.9.2' ;;
    install)
        printf '%s\\n' "$@" >> "$CCNG_TEST_NPM_LOG"
        [ "$CCNG_TEST_FAIL_NPM" = 0 ] || exit 19
        [ "$2" = --global ]; [ "$3" = --prefix ]
        mkdir -p "$4/bin"; cp "$CCNG_TEST_CLI" "$4/bin/codex" ;;
    run) mkdir -p dist; printf 'built fixture\\n' > dist/index.html ;;
    ci|prune) : ;;
    *) exit 98 ;;
esac`);
  await script('git', `
printf '%s\\n' "$*" >> "$CCNG_TEST_GIT_LOG"
case "$*" in
    *'rev-parse --show-toplevel') printf '%s\\n' "$CCNG_TEST_SOURCE" ;;
    *'branch --show-current') echo main ;;
    *) : ;;
esac`);
  if (existing) { await mkdir(join(custom, 'bin'), { recursive: true }); await cp(cli, join(custom, 'bin', 'codex')); }
  const prefix = join(home, 'commandcenter-ng'), npmLog = join(directory, 'npm-calls');
  const env = { ...process.env, PATH: bin + (existing ? ':' + join(custom, 'bin') : '') + ':/usr/bin:/bin',
    CCNG_TEST_ROOT: directory, CCNG_TEST_HOME: home, CCNG_TEST_SOURCE: source, CCNG_TEST_CLI: cli,
    CCNG_TEST_CODEX_CALLS: join(directory, 'codex-calls'), CCNG_TEST_NPM_LOG: npmLog, CCNG_TEST_GIT_LOG: join(directory, 'git-calls'),
    CCNG_TEST_APPROVE: approve ? '1' : '0', CCNG_TEST_FAIL_NPM: failNpm ? '1' : '0', CCNG_TEST_FAIL_BEADS: failBeads ? '1' : '0',
    CODEX_HOME: join(directory, 'native-profile'), CCNG_CONFIG_DIR: join(home, 'private-auth'),
  };
  await mkdir(env.CODEX_HOME); await writeFile(join(env.CODEX_HOME, 'config.toml'), '# Preserve this native fixture profile\n');
  return { directory, source, home, prefix, custom, cli, env, npmLog,
    install: args => execute('sh', [join(source, 'install.sh'), ...(args || [])], { env, cwd: source, timeout: 10000 }),
    npm: () => readFile(npmLog, 'utf8'),
    launcher: (args = [], appDir = prefix) => execute('sh', [join(appDir, 'command-center-ng'), ...args], { env: { ...env, PATH: '/usr/bin:/bin' }, timeout: 5000 }),
  };
}

test('fresh Codex uses the normal per-user npm prefix and is available to launcher and service without caller PATH', async t => {
  const f = await fixture(t); await f.install();
  assert.deepEqual((await f.npm()).trim().split('\n'), ['install', '--global', '--prefix', join(f.home, '.local'), '--no-fund', '--no-audit', '@openai/codex@0.167.0']);
  const profile = await readFile(join(f.home, '.bashrc'), 'utf8');
  assert.ok(profile.includes(join(f.prefix, 'tools', 'bin')), 'future app-local Dolt must be available in new Bash sessions');
  assert.ok(profile.includes(join(f.prefix, 'tools', 'node_modules', '.bin')));
  assert.equal((await f.launcher()).stdout, 'Synthetic Codex CLI\n');
  assert.ok((await f.launcher(['service', 'status'])).stdout.split(':').includes(join(f.home, '.local', 'bin')));
  assert.ok((await readFile(join(f.home, '.bashrc'), 'utf8')).includes(join(f.home, '.local', 'bin')));
  assert.equal(await readFile(join(f.env.CODEX_HOME, 'config.toml'), 'utf8'), '# Preserve this native fixture profile\n');
  await assert.rejects(stat(join(f.env.CODEX_HOME, 'auth.json')), { code: 'ENOENT' });
  await assert.rejects(stat(join(f.prefix, 'tools', 'bin', 'codex')), { code: 'ENOENT' });
});

test('custom writable Codex prefix may be outside home and survives update re-entry', async t => {
  const f = await fixture(t);
  await f.install(['--codex-prefix', f.custom]);
  assert.ok((await f.npm()).includes('\n' + f.custom + '\n'));
  assert.equal((await f.launcher()).stdout, 'Synthetic Codex CLI\n');
  await f.install(['--update', '--codex-prefix', f.custom]);
  assert.equal((await f.npm()).trim().split('\n').filter(line => line === 'install').length, 1, 'update re-entry reuses the custom Codex');
  assert.equal((await f.launcher()).stdout, 'Synthetic Codex CLI\n');
  await assert.rejects(stat(join(f.home, '.local', 'bin', 'codex')), { code: 'ENOENT' });
});

test('compatible existing custom Codex is reused despite another requested install prefix', async t => {
  const f = await fixture(t, { existing: true }), requested = join(f.directory, 'different-prefix');
  const before = await readFile(join(f.custom, 'bin', 'codex'));
  await f.install(['--codex-prefix', requested]);
  await assert.rejects(f.npm(), { code: 'ENOENT' }); await assert.rejects(stat(requested), { code: 'ENOENT' });
  assert.deepEqual(await readFile(join(f.custom, 'bin', 'codex')), before);
  assert.equal((await f.launcher()).stdout, 'Synthetic Codex CLI\n');
  assert.ok((await readFile(join(f.prefix, 'command-center-ng'), 'utf8')).includes(f.custom.replaceAll("'", "'\\''")));
});

test('legacy application-local Codex remains in place and its launcher never retains a staging path', async t => {
  const f = await fixture(t), legacy = join(f.prefix, 'tools', 'node_modules', '.bin');
  await mkdir(legacy, { recursive: true }); await cp(f.cli, join(legacy, 'codex'));
  await writeFile(join(f.prefix, 'package.json'), JSON.stringify({ name: 'command-center-ng', version: '0.0.1' }));
  await f.install();
  await assert.rejects(f.npm(), { code: 'ENOENT' });
  assert.equal((await f.launcher()).stdout, 'Synthetic Codex CLI\n');
  const launcher = await readFile(join(f.prefix, 'command-center-ng'), 'utf8');
  assert.ok(launcher.includes(legacy)); assert.ok(!launcher.includes('.command-center-ng-install.'));
  await assert.rejects(stat(join(f.home, '.local', 'bin', 'codex')), { code: 'ENOENT' });
});

test('invalid or overlapping Codex prefixes are rejected before npm, profile or application writes', async t => {
  const f = await fixture(t);
  for (const prefix of [f.prefix, join(f.prefix, 'codex'), join(f.directory, 'bad:prefix'), join(f.directory, 'bad\nprefix'), join(f.directory, 'bad\tprefix')]) {
    await assert.rejects(f.install(['--codex-prefix', prefix]), error => error.code === 1 && /Codex prefix/.test(error.stderr));
  }
  for (const tree of ['bin', 'lib']) {
    const prefix = join(f.home, 'cli-prefix'), appDir = join(prefix, tree, 'application');
    await assert.rejects(f.install(['--prefix', appDir, '--codex-prefix', prefix]), error => error.code === 1 && /application directory/.test(error.stderr));
  }
  for (const args of [['--codex-prefix'], ['--codex-prefix', ''], ['--codex-prefix', '--check'], ['--codex-prefix', 'one', '--codex-prefix', 'two']]) await assert.rejects(f.install(args), error => error.code === 1 && /Codex prefix|codex-prefix/.test(error.stderr));
  await assert.rejects(f.npm(), { code: 'ENOENT' }); await assert.rejects(stat(f.prefix), { code: 'ENOENT' }); await assert.rejects(stat(join(f.home, '.bashrc')), { code: 'ENOENT' });
});

test('a parent prefix is valid when the application stays outside npm bin/lib trees; check-only writes nothing', async t => {
  const f = await fixture(t), prefix = join(f.home, 'shared-prefix'), appDir = join(prefix, 'command-center');
  await f.install(['--check', '--prefix', appDir, '--codex-prefix', prefix]);
  await assert.rejects(stat(prefix), { code: 'ENOENT' }); await assert.rejects(f.npm(), { code: 'ENOENT' });
  await f.install(['--prefix', appDir, '--codex-prefix', prefix]);
  assert.equal((await f.launcher([], appDir)).stdout, 'Synthetic Codex CLI\n');
});

test('PATH setup happens before later Beads failure and unsafe profiles retain a manual fallback', async t => {
  const f = await fixture(t, { failBeads: true }), outside = join(f.directory, 'unrelated-profile');
  await writeFile(outside, '# Existing unrelated profile\n'); await symlink(outside, join(f.home, '.bashrc'));
  await assert.rejects(f.install(), error => {
    assert.equal(error.code, 1); assert.match(error.stderr, /PATH setup warning|shell PATH setup/);
    assert.match(error.stdout, /export PATH=/); assert.doesNotMatch(error.stdout, /source /);
    return true;
  });
  assert.equal(await readFile(outside, 'utf8'), '# Existing unrelated profile\n');
  assert.equal(JSON.parse(await readFile(join(f.prefix, 'package.json'), 'utf8')).name, 'command-center-ng');
});

test('declined or failed Codex installation leaves application installation available without creating a CLI', async t => {
  for (const options of [{ approve: false }, { failNpm: true }]) {
    const f = await fixture(t, options), result = await f.install();
    assert.match(result.stderr, /Codex installation was declined or failed/);
    await assert.rejects(stat(join(f.home, '.local', 'bin', 'codex')), { code: 'ENOENT' });
    assert.equal(JSON.parse(await readFile(join(f.prefix, 'package.json'), 'utf8')).name, 'command-center-ng');
  }
});
