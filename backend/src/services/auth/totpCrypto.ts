import crypto from 'crypto';
import { config } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const DEV_FALLBACK_SEED = 'unmute-dev-only-totp-encryption-key-not-for-production';

/**
 * Resolves the 32-byte AES-256 key from `TOTP_ENCRYPTION_KEY`.
 * Accepts a 64-character hex string, a 32-byte base64 key, or any high-entropy passphrase (hashed with SHA-256).
 * In production `TOTP_ENCRYPTION_KEY` is required; in development/test a deterministic local key is used when unset.
 */
function resolveEncryptionKey(): Buffer {
  const raw = (process.env.TOTP_ENCRYPTION_KEY ?? config.totp.encryptionKey ?? '').trim();
  if (!raw) {
    if (config.isProduction) {
      throw new AppError('Two-factor authentication is not configured on this server.', 503);
    }
    return crypto.createHash('sha256').update(DEV_FALLBACK_SEED).digest();
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  const asBase64 = Buffer.from(raw, 'base64');
  if (asBase64.length === 32 && asBase64.toString('base64').replace(/=+$/, '') === raw.replace(/=+$/, '')) {
    return asBase64;
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

/**
 * Encrypts a Base32 TOTP secret using AES-256-GCM bound to `userId` as additional authenticated data (AAD),
 * so an encrypted secret cannot be transplanted between user rows.
 */
export function encryptTotpSecret(plainSecret: string, userId: string): string {
  const key = resolveEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(userId, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypts an AES-256-GCM encrypted TOTP secret and verifies both the GCM authentication tag and `userId` AAD.
 */
export function decryptTotpSecret(payload: string, userId: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Malformed encrypted TOTP secret');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = resolveEncryptionKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(Buffer.from(userId, 'utf8'));
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

