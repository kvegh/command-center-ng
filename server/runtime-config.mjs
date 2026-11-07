import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const limit = 16_384;
const options = {
  connection_type: 'protocol',
  tls_certificate: 'tls-cert',
  tls_private_key: 'tls-key',
  host: 'host',
  port: 'port',
  public_origin: 'public-origin',
};

export const runtimeConfigFile = appDir => join(appDir, 'etc', 'config.conf');

export function parseRuntimeConfig(text, directory) {
  if (Buffer.byteLength(text, 'utf8') > limit) throw new Error('Runtime configuration exceeds 16 KiB.');
  const values = {}; const seen = new Set();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const content = line.trim();
    if (!content || content.startsWith('#')) continue;
    const field = /^([a-z_]+)\s*:\s*(.*)$/.exec(content);
    const invalid = reason => new Error(`Runtime configuration line ${index + 1}: ${reason}`);
    if (!field || !Object.hasOwn(options, field[1])) throw invalid('use a supported key: value setting.');
    const [, key, value] = field;
    if (seen.has(key)) throw invalid('duplicate setting.');
    if (!value || /[\x00-\x1f\x7f]/.test(value)) throw invalid('a nonempty value without control characters is required.');
    if (key === 'connection_type' && !['http', 'https'].includes(value)) throw invalid('connection_type must be http or https.');
    if (key === 'port' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)) throw invalid('port must be from 1 to 65535.');
    seen.add(key);
    // This is a literal settings format, not YAML or shell input. Only a line
    // beginning with # is a comment; spaces and # within paths are preserved.
    if (key === 'tls_certificate' || key === 'tls_private_key') {
      if (value.startsWith('~')) throw invalid('use an absolute certificate path or one relative to this config file; ~ is not expanded.');
      values[options[key]] = resolve(directory, value);
    } else values[options[key]] = value;
  }
  return values;
}

export async function readRuntimeConfig(file) {
  let handle;
  try {
    // Nonblocking open lets the regular-file check reject FIFOs without hanging.
    handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit) throw new Error('Runtime configuration must be a regular file no larger than 16 KiB.');
    return parseRuntimeConfig(await handle.readFile('utf8'), dirname(file));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    if (error.code) throw new Error(`Cannot read runtime configuration: ${error.code}. Check the file and its read permissions.`);
    throw error;
  } finally { await handle?.close(); }
}
