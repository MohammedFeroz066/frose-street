import crypto from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

function scryptAsync(password: string, salt: string, keylen: number, options: crypto.ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
}

/**
 * Hashes a plaintext password with a unique 16-byte cryptographically random salt using scrypt.
 * Output format: scrypt:N:r:p:saltHex:hashHex
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });

  return `scrypt:${SCRYPT_COST}:${SCRYPT_BLOCK_SIZE}:${SCRYPT_PARALLELIZATION}:${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored scrypt hash using timing-safe comparison.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.startsWith('scrypt:')) {
    return false;
  }

  const parts = storedHash.split(':');
  if (parts.length !== 6) {
    return false;
  }

  const [, nStr, rStr, pStr, salt, expectedHashHex] = parts;
  const N = parseInt(nStr, 10);
  const r = parseInt(rStr, 10);
  const p = parseInt(pStr, 10);

  const derivedKey = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N,
    r,
    p,
  });

  const expectedBuffer = Buffer.from(expectedHashHex, 'hex');
  if (derivedKey.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedKey, expectedBuffer);
}

/**
 * Hashes a 4-digit quick PIN with a separate salt.
 */
export async function hashPin(pin: string): Promise<string> {
  return hashPassword(`pin_${pin}`);
}

/**
 * Verifies a 4-digit quick PIN against stored hash.
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  return verifyPassword(`pin_${pin}`, storedHash);
}

/**
 * Hashes a 4-digit in-session Owner Authorization PIN synchronously using crypto.scryptSync
 * with a unique 16-byte per-vendor random salt.
 */
export function hashOwnerPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(`owner_pin:${pin}`, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });
  return `scrypt:${SCRYPT_COST}:${SCRYPT_BLOCK_SIZE}:${SCRYPT_PARALLELIZATION}:${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a 4-digit in-session Owner Authorization PIN using crypto.scryptSync and crypto.timingSafeEqual.
 */
export function verifyOwnerPin(pin: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt:')) {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 6) {
    return false;
  }
  const [, nStr, rStr, pStr, salt, expectedHashHex] = parts;
  const N = parseInt(nStr, 10);
  const r = parseInt(rStr, 10);
  const p = parseInt(pStr, 10);

  const derivedKey = crypto.scryptSync(`owner_pin:${pin}`, salt, SCRYPT_KEYLEN, {
    N,
    r,
    p,
  });
  const expectedBuffer = Buffer.from(expectedHashHex, 'hex');
  if (derivedKey.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(derivedKey, expectedBuffer);
}

/**
 * Generates a random cryptographic token (hex).
 */
export function generateSecureToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
