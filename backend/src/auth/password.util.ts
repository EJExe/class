import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
}

export function verifyPassword(password: string, storedHash?: string | null) {
  if (!storedHash) {
    return false;
  }

  if (storedHash.startsWith('scrypt$')) {
    const [, salt, expectedKey] = storedHash.split('$');
    const actualKey = scryptSync(password, salt, 64);
    const expectedBuffer = Buffer.from(expectedKey, 'hex');
    return actualKey.length === expectedBuffer.length && timingSafeEqual(actualKey, expectedBuffer);
  }

  const legacyHash = createHash('sha256').update(password).digest('hex');
  return legacyHash === storedHash;
}
