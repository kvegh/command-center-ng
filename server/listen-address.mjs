import { execFile } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { isIP } from 'node:net';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const guidance = message => new Error(message + ' Use --host ADDRESS or CCNG_HOST to select a listening address explicitly.');
const usableIPv4 = address => typeof address === 'string' && isIP(address) === 4
  && Number(address.split('.')[0]) > 0 && Number(address.split('.')[0]) < 224 && !address.startsWith('127.');
const defaultRunIp = async argv => (await execute('ip', argv, { encoding: 'utf8', timeout: 3000, maxBuffer: 1024 * 1024 })).stdout;

async function ipRows(runIp, argv) {
  let output;
  try { output = await runIp(argv); }
  catch (error) {
    const reason = error.code === 'ENOENT' ? 'The ip command is unavailable.'
      : error.killed || error.code === 'ETIMEDOUT' ? 'The ip route command timed out.' : 'The ip route command failed.';
    throw guidance(reason);
  }
  try {
    const rows = JSON.parse(output);
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error();
    return rows;
  } catch { throw guidance('The ip route command returned invalid JSON route data.'); }
}

export async function resolveListenAddress(host, {
  platform = process.platform,
  interfaces = networkInterfaces,
  runIp = defaultRunIp
} = {}) {
  if (host !== undefined && host !== null) {
    if (typeof host !== 'string' || !host.trim() || /[\s\x00-\x1f\x7f]/.test(host)) throw guidance('The configured host must be a nonempty address or hostname.');
    return { host, interfaceName: null, automatic: false };
  }
  if (platform !== 'linux') throw guidance('Automatic default-interface selection requires Linux.');

  const rows = await ipRows(runIp, ['-j', '-4', 'route', 'show', 'default']);
  if (rows.some(row => row.flags != null && (!Array.isArray(row.flags) || row.flags.some(flag => typeof flag !== 'string')))) throw guidance('The ip route command returned invalid route flags.');
  const routes = rows.filter(row => row.dst === 'default' && (!row.type || row.type === 'unicast')
    && !row.flags?.some(flag => ['dead', 'linkdown'].includes(flag)));
  if (!routes.length) throw guidance('No usable default IPv4 route was found.');
  if (routes.some(route => route.metric !== undefined && (!Number.isSafeInteger(route.metric) || route.metric < 0))) throw guidance('The default route has an invalid metric.');
  const metric = Math.min(...routes.map(route => route.metric ?? 0));
  const best = routes.filter(route => (route.metric ?? 0) === metric);
  if (best.some(route => route.nexthops || typeof route.dev !== 'string' || !route.dev)) throw guidance('The preferred default route does not identify one interface.');
  const devices = new Set(best.map(route => route.dev));
  if (devices.size !== 1) throw guidance('Multiple equally preferred default IPv4 interfaces were found.');
  const interfaceName = best[0].dev;
  const addresses = interfaces();
  const assigned = Object.hasOwn(addresses, interfaceName) && Array.isArray(addresses[interfaceName])
    ? [...new Set(addresses[interfaceName].filter(entry => entry && entry.family === 'IPv4' && !entry.internal && usableIPv4(entry.address)).map(entry => entry.address))] : [];
  if (!assigned.length) throw guidance('The default interface has no usable local IPv4 address.');

  const sources = [...new Set(best.map(route => route.prefsrc).filter(source => source !== undefined))];
  if (sources.length > 1 || (sources.length === 1 && !assigned.includes(sources[0]))) throw guidance('The default route source does not identify one address on its interface.');
  let address = sources[0] || (assigned.length === 1 ? assigned[0] : null);
  if (!address) {
    // Ask the kernel which source it would use; route get sends no packets.
    // Prefer the selected gateway, with a documentation-only destination for
    // direct default routes that have no gateway (for example a tunnel).
    const target = usableIPv4(best[0].gateway) ? best[0].gateway : '192.0.2.1';
    const resolved = await ipRows(runIp, ['-j', '-4', 'route', 'get', target, 'oif', interfaceName]);
    const candidates = [...new Set(resolved.filter(route => route.dev === interfaceName && assigned.includes(route.prefsrc)).map(route => route.prefsrc))];
    if (candidates.length !== 1) throw guidance('The kernel could not select one source address on the default interface.');
    address = candidates[0];
  }
  return { host: address, interfaceName, automatic: true };
}
