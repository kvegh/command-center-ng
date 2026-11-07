import { readFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import { createSecureContext } from 'node:tls';

const absent = value => value === undefined || value === null;
const validPath = value => typeof value === 'string' && value.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(value);
const publicText = value => value.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 512);

function parseCertificate(cert) {
  try { return new X509Certificate(cert); }
  catch { throw new Error('The TLS certificate file is not a readable X.509 PEM certificate. Supply a certificate chain with the server certificate first.'); }
}

export function certificateInfo(cert) {
  const certificate = parseCertificate(cert);
  return {
    subject: publicText(certificate.subject),
    issuer: publicText(certificate.issuer),
    validFrom: publicText(certificate.validFrom),
    validTo: publicText(certificate.validTo)
  };
}

async function readTlsFile(path, label) {
  try { return await readFile(path); }
  catch (error) {
    const code = ['ENOENT', 'EACCES', 'EPERM', 'EISDIR'].includes(error.code) ? ` (${error.code})` : '';
    throw new Error(`Cannot read the TLS ${label} file${code}. Check its path and the CCNG service account's read access.`);
  }
}

export async function loadTlsSettings(certPath, keyPath, { now = Date.now() } = {}) {
  if (absent(certPath) && absent(keyPath)) return undefined;
  if (!validPath(certPath) || !validPath(keyPath)) throw new Error('HTTPS requires both --tls-cert and --tls-key, or both CCNG_TLS_CERT and CCNG_TLS_KEY, with nonempty file paths.');

  const [cert, key] = await Promise.all([readTlsFile(certPath, 'certificate'), readTlsFile(keyPath, 'private-key')]);
  const certificate = parseCertificate(cert);
  const validFrom = Date.parse(certificate.validFrom);
  const validTo = Date.parse(certificate.validTo);
  if (!Number.isFinite(validFrom) || !Number.isFinite(validTo) || validFrom >= validTo) throw new Error('The TLS certificate has invalid validity dates. Supply a currently valid server certificate.');
  if (now < validFrom) throw new Error(`The TLS certificate is not valid yet (starts ${certificate.validFrom}). Check the system clock or supply a currently valid certificate.`);
  if (now > validTo) throw new Error(`The TLS certificate expired (${certificate.validTo}). Renew or replace it before starting HTTPS.`);

  const options = { cert, key, minVersion: 'TLSv1.2' };
  // Native TLS validates the PEM data and matching key without opening a listener.
  // Do not forward OpenSSL errors: supplied key contents must never reach logs.
  try { createSecureContext(options); }
  catch { throw new Error('The TLS certificate and private key cannot be used together. Supply a matching PEM certificate chain and unencrypted private key.'); }
  return options;
}
