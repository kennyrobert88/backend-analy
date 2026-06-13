/**
 * AES-256-GCM encryption for secrets stored at rest (OAuth tokens).
 *
 * Wire format: base64(iv):base64(authTag):base64(ciphertext)
 *
 * Key rotation: set TOKEN_ENCRYPTION_KEY to the new key and
 * TOKEN_ENCRYPTION_KEY_PREV to the old one. decryptSecret() tries the current
 * key first then falls back to the previous key — existing rows continue to
 * decrypt while new writes use the current key.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm' as const;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function loadKey(envVar: string): Buffer | null {
  const raw = process.env[envVar];
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `${envVar} must decode to exactly ${KEY_BYTES} bytes (got ${key.length}). ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  return key;
}

function requireKey(): Buffer {
  const key = loadKey('TOKEN_ENCRYPTION_KEY');
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY environment variable is required');
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = requireKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString('base64')).join(':');
}

function decryptWith(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format (expected iv:tag:data)');
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function decryptSecret(ciphertext: string): string {
  const current = requireKey();
  try {
    return decryptWith(ciphertext, current);
  } catch (primaryErr) {
    const prev = loadKey('TOKEN_ENCRYPTION_KEY_PREV');
    if (!prev) throw primaryErr;
    try {
      return decryptWith(ciphertext, prev);
    } catch {
      throw primaryErr;
    }
  }
}

export function generateEncryptionKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}
