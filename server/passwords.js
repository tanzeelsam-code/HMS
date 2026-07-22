// Password hashing helpers built exclusively on Node's standard crypto module.
// The encoded format stores the scrypt parameters with the salt and derived key
// so hashes remain self-describing without ever storing the original password.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;
const scrypt = promisify(crypto.scrypt);

const encode = (value) => value.toString('base64url');

function decode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  return encode(decoded) === value ? decoded : null;
}

function parsePasswordHash(encoded) {
  if (typeof encoded !== 'string') return null;
  const [algorithm, n, r, p, saltValue, hashValue, ...extra] = encoded.split('$');
  if (
    extra.length > 0 || algorithm !== 'scrypt' || Number(n) !== SCRYPT_N
    || Number(r) !== SCRYPT_R || Number(p) !== SCRYPT_P
  ) return null;

  const salt = decode(saltValue);
  const hash = decode(hashValue);
  if (!salt || salt.length < 16 || !hash || hash.length !== KEY_LENGTH) return null;
  return { salt, hash };
}

export function isPasswordHash(value) {
  return parsePasswordHash(value) !== null;
}

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEMORY,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${encode(salt)}$${encode(hash)}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string') return false;
  const parsed = parsePasswordHash(encoded);
  if (!parsed) return false;
  const candidate = await scrypt(password, parsed.salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEMORY,
  });
  return crypto.timingSafeEqual(parsed.hash, candidate);
}
