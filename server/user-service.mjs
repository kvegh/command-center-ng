import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';

export const USER_SERVICE = 'command-center-ng.service';
const marker = '# Managed by Command Center NG user-service';
const clean = value => {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Service paths, options and environment values must not contain control characters.');
  return value;
};
const quote = (value, exec = false) => '"' + clean(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('$', () => exec ? '$$' : '$') + '"';
const installation = appDir => '# Installation: ' + clean(appDir);

function runtimeOptions(args) {
  const allowed = ['host', 'port', 'cwd', 'socket', 'public-origin'];
  const { values, positionals } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, options: Object.fromEntries(allowed.map(name => [name, { type: 'string' }])), strict: true, allowPositionals: false });
  if (positionals.length) throw new Error('Use named Command Center runtime options after service install.');
  for (const value of Object.values(values)) clean(value);
  if (values.port && (!/^\d+$/.test(values.port) || Number(values.port) < 1 || Number(values.port) > 65535)) throw new Error('Choose a port from 1 to 65535.');
  for (const name of ['cwd', 'socket']) if (values[name] && !isAbsolute(values[name])) throw new Error('--' + name + ' must be an absolute path.');
  if (values['public-origin']) {
    const origin = new URL(values['public-origin']);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('Use an HTTP(S) public origin without credentials.');
  }
  return values;
}

export function serviceUnit(appDir, args, env = process.env) {
  const values = runtimeOptions(args);
  const runtime = Object.entries(values).flatMap(([name, value]) => ['--' + name, value]);
  const variables = ['PATH', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'CCNG_CONFIG_DIR', 'XDG_CONFIG_HOME', 'CCNG_HOST', 'CCNG_PORT', 'CCNG_PUBLIC_ORIGIN'];
  return [marker, installation(appDir), '[Unit]', 'Description=Command Center NG', '', '[Service]', 'Type=simple',
    'WorkingDirectory=' + clean(values.cwd || appDir).replaceAll('%', '%%'),
    'ExecStart=' + [quote(join(appDir, 'command-center-ng')), ...runtime.map(value => quote(value, true))].join(' '),
    ...variables.filter(name => env[name] !== undefined).map(name => 'Environment=' + quote(name + '=' + env[name])),
    'Restart=on-failure', 'RestartSec=3', 'KillSignal=SIGINT', 'TimeoutStopSec=30', 'UMask=0077', '', '[Install]', 'WantedBy=default.target', ''].join('\n');
}

async function ownedUnit(path, appDir) {
  let info;
  try { info = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid()) throw new Error('Refusing an unrelated, linked or differently owned user service.');
  const content = await readFile(path, 'utf8');
  if (!content.startsWith(marker + '\n' + installation(appDir) + '\n')) throw new Error('Refusing to replace a user service belonging to another application or installation.');
  return true;
}

export async function userService(args, { appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..'), env = process.env, run = (command, argv) => spawnSync(command, argv, { stdio: 'inherit', env }) } = {}) {
  if (process.platform !== 'linux' || process.getuid() === 0) throw new Error('Use a normal unprivileged Linux account, without sudo.');
  const [action = 'help', ...options] = args;
  if (['help', '--help', '-h'].includes(action)) {
    console.log('Usage: command-center-ng service install [-- RUNTIME_OPTIONS]\n       command-center-ng service start|stop|restart|status|logs|enable|disable|uninstall\nInstall writes a user unit and reloads systemd; it does not start or enable it.');
    return 0;
  }
  if (!['install', 'start', 'stop', 'restart', 'status', 'logs', 'enable', 'disable', 'uninstall'].includes(action)) throw new Error('Unknown user service action. Run command-center-ng service help.');
  if (action !== 'install' && options.length) throw new Error('Only service install accepts runtime options.');
  appDir = await realpath(appDir);
  const config = env.XDG_CONFIG_HOME || join(env.HOME || '', '.config');
  if (!env.HOME || !isAbsolute(config)) throw new Error('HOME and an absolute user configuration directory are required.');
  const path = join(config, 'systemd/user', USER_SERVICE);
  const invoke = (command, argv) => {
    const result = run(command, argv);
    if (result.error) throw new Error('Could not run ' + command + ': ' + result.error.message);
    return result.status ?? 1;
  };
  if (action === 'install') {
    const present = await ownedUnit(path, appDir);
    if (present && !(options[0] === '--' ? options.slice(1) : options).length) {
      console.log('Existing user service options and profile preserved.');
      return invoke('systemctl', ['--user', 'daemon-reload']);
    }
    const unit = serviceUnit(appDir, options, env);
    if (!(await stat(runtimeOptions(options).cwd || appDir)).isDirectory()) throw new Error('The service working directory must exist.');
    if (!(await stat(join(appDir, 'command-center-ng'))).isFile()) throw new Error('Install Command Center first, then use its generated launcher.');
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = path + '.' + randomUUID() + '.tmp';
    try { await writeFile(temporary, unit, { mode: 0o600, flag: 'wx' }); await rename(temporary, path); }
    finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    console.log('Installed user service. Stop any foreground copy before starting it.');
    return invoke('systemctl', ['--user', 'daemon-reload']);
  }
  if (!(await ownedUnit(path, appDir))) throw new Error('Install this user service first: command-center-ng service install -- [your existing runtime options].');
  if (action === 'uninstall') {
    const status = invoke('systemctl', ['--user', 'disable', '--now', USER_SERVICE]);
    if (status) return status;
    await unlink(path); return invoke('systemctl', ['--user', 'daemon-reload']);
  }
  if (action === 'logs') return invoke('journalctl', ['--user', '-u', USER_SERVICE, '-n', '100', '--no-pager']);
  return invoke('systemctl', ['--user', action, USER_SERVICE]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await userService(process.argv.slice(2)); }
  catch (error) { console.error('User service: ' + error.message); process.exitCode = 1; }
}
