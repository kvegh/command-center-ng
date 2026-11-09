import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, cp, writeFile, readFile, stat, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);

async function fixture(t, { featureFailure = false, nativePrerequisites = false, approveCodex = false, failCodexInstall = false, failBeads = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ccng-installer-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'source'); const home = join(directory, 'user-home'); const bin = join(directory, 'bin');
  for (const path of [source, home, bin, join(source, 'installer'), join(source, 'src'), join(source, 'server'), join(source, 'docs')]) await mkdir(path);
  await cp(new URL('../install.sh', import.meta.url), join(source, 'install.sh'));
  await writeFile(join(source, 'installer', 'prerequisites.sh'), 'ccng_system_prerequisites() { :; }\nccng_agent_prerequisites() { :; }\n');
  if (nativePrerequisites) {
    await cp(new URL('../installer/prerequisites.sh', import.meta.url), join(source, 'installer', 'prerequisites.sh'));
    const content = await readFile(join(source, 'installer', 'prerequisites.sh'), 'utf8');
    await writeFile(join(source, 'installer', 'prerequisites.sh'), content + '\nccng_system_prerequisites() { :; }\nccng_detect_platform() { CCNG_RHEL9=0; }\nccng_confirm() { [ "$CCNG_FIXTURE_APPROVE_CODEX" = 1 ]; }\n');
  }
  await writeFile(join(source, 'installer', 'beads.sh'), 'ccng_beads_setup() { :; }\n');
  await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'command-center-ng', version: '0.0.1' }));
  for (const name of ['package-lock.json', 'index.html', 'tsconfig.json', 'vite.config.mjs', 'README.md', 'AGENTS.md', 'design_decisions_history.md']) await writeFile(join(source, name), 'synthetic fixture');
  await writeFile(join(source, 'server', 'main.mjs'), '// A fixture: never started.\n');
  await writeFile(join(source, 'server', 'beads-check.mjs'), `process.exitCode = ${failBeads ? '1' : '0'};\n`);
  await writeFile(join(source, 'server', 'codex-setup.mjs'), `import { appendFileSync, writeSync } from 'node:fs';
appendFileSync(process.env.CCNG_FIXTURE_FEATURE_LOG, JSON.stringify({ file: process.argv[1], args: process.argv.slice(2), path: process.env.PATH.split(':').slice(0, 2) }) + '\\n');
if (process.env.CCNG_FIXTURE_FEATURE_FAIL === '1') { writeSync(2, 'Warning: synthetic native feature setup failed.\\n'); process.exitCode = 19; }
`);
  await writeFile(join(bin, 'bd'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await writeFile(join(bin, 'id'), '#!/bin/sh\nprintf "1000\\n"\n', { mode: 0o755 });
  // Map only home canonicalization into this private fixture. Do not replace
  // HOME or write to the user's real default installation/configuration.
  await writeFile(join(bin, 'realpath'), `#!/bin/sh
if [ "$#" -eq 1 ] && [ "$1" = "$HOME" ]; then printf '%s\\n' "$CCNG_FIXTURE_HOME"; exit 0; fi
if [ "$#" -eq 2 ] && [ "$1" = -m ] && [ "$2" = "$HOME/commandcenter-ng" ]; then printf '%s/commandcenter-ng\\n' "$CCNG_FIXTURE_HOME"; exit 0; fi
exec /usr/bin/realpath "$@"
`, { mode: 0o755 });
  await writeFile(join(bin, 'npm'), `#!/bin/sh
if [ "$1" = install ]; then
    printf '%s\\n' "$@" >> "$CCNG_FIXTURE_NPM_LOG"
    if [ "$CCNG_FIXTURE_CODEX_INSTALL_FAIL" = 1 ]; then echo 'synthetic Codex installation failure' >&2; exit 68; fi
fi
if [ "$1" = run ] && [ "$2" = build ]; then
    if [ "$CCNG_FIXTURE_BUILD_FAIL" = 1 ]; then echo 'synthetic build failure' >&2; exit 73; fi
    mkdir -p dist
    printf 'synthetic built frontend\\n' > dist/index.html
fi
`, { mode: 0o755 });
  const featureLog = join(directory, 'feature-calls'); const npmLog = join(directory, 'npm-calls');
  const env = {
    ...process.env, PATH: bin + ':/usr/bin:/bin', CCNG_FIXTURE_HOME: home, CCNG_CONFIG_DIR: join(home, 'private-auth'),
    CCNG_FIXTURE_FEATURE_LOG: featureLog, CCNG_FIXTURE_FEATURE_FAIL: featureFailure ? '1' : '0',
    CCNG_FIXTURE_NPM_LOG: npmLog, CCNG_FIXTURE_CODEX_INSTALL_FAIL: failCodexInstall ? '1' : '0',
    CCNG_FIXTURE_APPROVE_CODEX: approveCodex ? '1' : '0',
  };
  const install = (args = [], fail = false) => exec('sh', [join(source, 'install.sh'), ...args], { cwd: source, env: { ...env, CCNG_FIXTURE_BUILD_FAIL: fail ? '1' : '0' }, timeout: 10000 });
  return { source, home, prefix: join(home, 'commandcenter-ng'), install, featureLog, npmLog };
}

test('first default installation creates private HTTP settings and empty cert directory after building', async t => {
  const f = await fixture(t);
  const result = await f.install();
  const toolPath = '  export PATH=\'' + f.prefix + '/tools/bin\':\'' + f.prefix + '/tools/node_modules/.bin\':"$PATH"';
  assert.match(result.stdout, /installer cannot change your current terminal PATH/);
  assert.ok(result.stdout.includes(toolPath + '\nIf the native daemon is not already running'), result.stdout);
  assert.match(result.stdout, /daemon runs in the background; you do not need to keep its terminal open/);
  const config = await readFile(join(f.prefix, 'etc', 'config.conf'), 'utf8');
  assert.match(config, /^connection_type: http$/m);
  assert.match(config, /^# connection_type: https$/m);
  assert.ok(config.indexOf('# connection_type: https') < config.indexOf('\nconnection_type: http'));
  assert.ok(config.includes('# tls_certificate: ' + join(f.prefix, 'etc', 'certs', 'server.crt')));
  assert.ok(config.includes('# tls_private_key: ' + join(f.prefix, 'etc', 'certs', 'server.key')));
  assert.match(config, /Other certificate\/key paths are supported when readable/);
  assert.match(config, /^# first_password_setup: htpasswd-proxy$/m);
  assert.doesNotMatch(config, /^first_password_setup:/m, 'fresh generic installation must not enable unprotected browser enrollment');
  assert.match(config, /enforced htpasswd on every proxy route/);
  await assert.rejects(stat(join(f.home, 'private-auth', 'auth.json')), { code: 'ENOENT' });
  assert.match(result.stdout, /No default password is created/);
  assert.equal((await stat(join(f.prefix, 'etc'))).mode & 0o777, 0o700);
  assert.equal((await stat(join(f.prefix, 'etc', 'certs'))).mode & 0o777, 0o700);
  assert.equal((await stat(join(f.prefix, 'etc', 'config.conf'))).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(join(f.prefix, 'etc', 'certs')), []);
  assert.equal(await readFile(join(f.prefix, 'dist', 'index.html'), 'utf8'), 'synthetic built frontend\n');
  assert.ok(result.stdout.includes('Connection settings: ' + join(f.prefix, 'etc', 'config.conf')));
  const calls = (await readFile(f.featureLog, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(calls, [{ file: join(f.prefix, 'server', 'codex-setup.mjs'), args: ['--enable'], path: [join(f.prefix, 'tools', 'bin'), join(f.prefix, 'tools', 'node_modules', '.bin')] }]);
});

test('custom prefix with spaces produces literal commented certificate paths', async t => {
  const f = await fixture(t); const prefix = join(f.home, 'custom application');
  await f.install(['--prefix', prefix]);
  const config = await readFile(join(prefix, 'etc', 'config.conf'), 'utf8');
  assert.ok(config.includes('# tls_certificate: ' + join(prefix, 'etc', 'certs', 'server.crt') + '\n'));
  assert.ok(config.includes('# tls_private_key: ' + join(prefix, 'etc', 'certs', 'server.key') + '\n'));
  assert.doesNotMatch(config, /tls_certificate: ["']/);
  await assert.rejects(stat(f.prefix), { code: 'ENOENT' });
});

test('repeat installation preserves edited config, certificates, other etc files and local tools', async t => {
  const f = await fixture(t); await f.install();
  const config = 'connection_type: https\ntls_certificate: /operator/cert.pem\ntls_private_key: /operator/key.pem\n# operator note\n';
  await writeFile(join(f.prefix, 'etc', 'config.conf'), config);
  const certificate = Buffer.from('synthetic certificate bytes\n'); const key = Buffer.from('synthetic key bytes\n');
  await writeFile(join(f.prefix, 'etc', 'certs', 'server.crt'), certificate);
  await writeFile(join(f.prefix, 'etc', 'certs', 'server.key'), key, { mode: 0o600 });
  await mkdir(join(f.prefix, 'etc', 'other'));
  await writeFile(join(f.prefix, 'etc', 'other', 'operator.conf'), 'operator data\n');
  await mkdir(join(f.prefix, 'tools', 'bin'), { recursive: true });
  await writeFile(join(f.prefix, 'tools', 'bin', 'fixture-tool'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await f.install();
  assert.equal(await readFile(join(f.prefix, 'etc', 'config.conf'), 'utf8'), config);
  assert.deepEqual(await readFile(join(f.prefix, 'etc', 'certs', 'server.crt')), certificate);
  assert.deepEqual(await readFile(join(f.prefix, 'etc', 'certs', 'server.key')), key);
  assert.equal(await readFile(join(f.prefix, 'etc', 'other', 'operator.conf'), 'utf8'), 'operator data\n');
  assert.equal(await readFile(join(f.prefix, 'tools', 'bin', 'fixture-tool'), 'utf8'), '#!/bin/sh\nexit 0\n');
});

test('build failure leaves existing application config and keys intact and no initial config is created', async t => {
  const f = await fixture(t);
  await assert.rejects(f.install([], true), error => error.code === 73);
  await assert.rejects(stat(f.prefix), { code: 'ENOENT' });
  await f.install();
  const config = 'connection_type: http\n# existing private setting\n'; const key = 'existing synthetic key\n';
  await writeFile(join(f.prefix, 'etc', 'config.conf'), config);
  await writeFile(join(f.prefix, 'etc', 'certs', 'server.key'), key, { mode: 0o600 });
  await writeFile(join(f.source, 'package.json'), JSON.stringify({ name: 'command-center-ng', version: '0.0.2' }));
  await assert.rejects(f.install([], true), error => error.code === 73);
  assert.equal(await readFile(join(f.prefix, 'etc', 'config.conf'), 'utf8'), config);
  assert.equal(await readFile(join(f.prefix, 'etc', 'certs', 'server.key'), 'utf8'), key);
  assert.equal(JSON.parse(await readFile(join(f.prefix, 'package.json'), 'utf8')).version, '0.0.1');
  assert.deepEqual((await readdir(f.home)).filter(name => name.startsWith('.command-center-ng-install.')), []);
});

test('unsafe configuration symlinks are refused without following or overwriting their targets', async t => {
  for (const part of ['etc', 'config.conf', 'certs']) await t.test(part, async t => {
    const f = await fixture(t); await f.install();
    const external = join(f.home, 'external');
    if (part === 'config.conf') await writeFile(external, 'external content\n'); else await mkdir(external);
    const path = part === 'etc' ? join(f.prefix, 'etc') : join(f.prefix, 'etc', part);
    await rm(path, { recursive: true, force: true }); await symlink(external, path);
    await assert.rejects(f.install(), error => /unsafe installation/.test(error.stderr));
    if (part === 'config.conf') assert.equal(await readFile(external, 'utf8'), 'external content\n');
    else assert.deepEqual(await readdir(external), []);
    assert.equal(JSON.parse(await readFile(join(f.prefix, 'package.json'), 'utf8')).version, '0.0.1');
  });
});

test('failed native feature setup warns and leaves a completed HTTP installation', async t => {
  const f = await fixture(t, { featureFailure: true });
  const result = await f.install();
  assert.match(result.stderr, /Warning: synthetic native feature setup failed/);
  assert.match(result.stderr, /question setting could not be configured.*installation will continue/);
  assert.match(await readFile(join(f.prefix, 'etc', 'config.conf'), 'utf8'), /^connection_type: http$/m);
  assert.equal(JSON.parse(await readFile(join(f.prefix, 'package.json'), 'utf8')).name, 'command-center-ng');
});

test('missing Codex with a declined or failed install warns without aborting application installation', async t => {
  for (const failCodexInstall of [false, true]) await t.test(failCodexInstall ? 'failed package attempt' : 'declined package attempt', async t => {
    const f = await fixture(t, { nativePrerequisites: true, approveCodex: failCodexInstall, failCodexInstall });
    const result = await f.install();
    assert.match(result.stderr, /Warning: Codex installation was declined or failed/);
    assert.match(result.stdout, /Installed Command Center NG/);
    assert.match(await readFile(join(f.prefix, 'etc', 'config.conf'), 'utf8'), /^connection_type: http$/m);
    assert.equal((await readFile(f.featureLog, 'utf8')).trim().split('\n').length, 1);
    if (failCodexInstall) {
      const args = (await readFile(f.npmLog, 'utf8')).trim().split('\n');
      assert.equal(args[0], 'install'); assert.equal(args.at(-1), '@openai/codex@0.167.0');
    } else await assert.rejects(stat(f.npmLog), { code: 'ENOENT' });
  });
});

test('incompatible Beads still stops installation before native feature setup', async t => {
  const f = await fixture(t, { nativePrerequisites: true, failBeads: true });
  await assert.rejects(f.install(), error => error.stderr.includes('Existing Beads is incompatible'));
  await assert.rejects(stat(f.prefix), { code: 'ENOENT' });
  await assert.rejects(stat(f.featureLog), { code: 'ENOENT' });
});

test('check-only reports missing Codex as a warning without installing or setting features', async t => {
  const f = await fixture(t, { nativePrerequisites: true });
  const result = await f.install(['--check']);
  assert.match(result.stdout, /\[warning\] Codex is missing/);
  await assert.rejects(stat(f.prefix), { code: 'ENOENT' });
  await assert.rejects(stat(f.featureLog), { code: 'ENOENT' });
  await assert.rejects(stat(f.npmLog), { code: 'ENOENT' });
});
