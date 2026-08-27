import crypto from 'crypto';
import { env } from '@/config/env';

const ALGORITHM = 'aes-256-cbc';

const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text: string): string {
  const parts = text.split(':');
  if (parts.length < 2) {
    throw new Error('Invalid encrypted payload format');
  }
  const iv = Buffer.from(parts.shift()!, 'hex');
  const encryptedText = parts.join(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/** Decrypt if value looks encrypted (iv:cipher hex); otherwise return as-is (legacy plaintext). */
export function safeDecrypt(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (!value.includes(':')) return value;
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
