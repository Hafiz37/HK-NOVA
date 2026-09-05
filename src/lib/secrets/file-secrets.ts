/**
 * File-based Secrets Management (GPG encrypted)
 * Fallback option for environments without AWS/Vault
 * 
 * Usage:
 * import { loadProductionSecrets } from '@/lib/secrets/file-secrets';
 * 
 * // Load secrets from GPG-encrypted file
 * await loadProductionSecrets();
 * 
 * Prerequisites:
 * - GPG installed on system
 * - Encrypted secrets file at /etc/hk-nova/secrets.json.gpg
 * - GPG key available for decryption
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const SECRETS_FILE_PATH = process.env.SECRETS_FILE_PATH || '/etc/hk-nova/secrets.json.gpg';
const SECRETS_FILE_PLAIN = process.env.SECRETS_FILE_PLAIN || '/etc/hk-nova/secrets.json';

interface SecretsData {
  database_password?: string;
  encryption_key?: string;
  audit_hmac_key?: string;
  jwt_secret?: string;
  backup_encryption_key?: string;
  operator_password?: string;
  telegram_bot_token?: string;
  smtp_password?: string;
  [key: string]: string | undefined;
}

export function decryptSecretsFile(encryptedPath: string): string {
  try {
    console.log(`[File Secrets] Decrypting: ${encryptedPath}`);
    
    const decrypted = execSync(`gpg --decrypt --quiet "${encryptedPath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    return decrypted;
  } catch (error: any) {
    console.error('[File Secrets] GPG decryption failed:', error.message);
    throw new Error('Failed to decrypt secrets file. Ensure GPG key is available.');
  }
}

export function loadSecretsFromFile(filePath: string, encrypted: boolean = true): SecretsData {
  if (!existsSync(filePath)) {
    throw new Error(`Secrets file not found: ${filePath}`);
  }
  
  let content: string;
  
  if (encrypted) {
    content = decryptSecretsFile(filePath);
  } else {
    console.warn('[File Secrets] ⚠️  Loading UNENCRYPTED secrets file - NOT RECOMMENDED for production!');
    content = readFileSync(filePath, 'utf-8');
  }
  
  try {
    const secrets = JSON.parse(content);
    return secrets;
  } catch (error) {
    throw new Error('Failed to parse secrets file. Invalid JSON format.');
  }
}

export async function loadProductionSecrets(): Promise<void> {
  console.log('[File Secrets] Loading production secrets...');
  
  let secrets: SecretsData;
  
  // Try encrypted file first
  if (existsSync(SECRETS_FILE_PATH)) {
    secrets = loadSecretsFromFile(SECRETS_FILE_PATH, true);
  } 
  // Fallback to plain file (development only)
  else if (existsSync(SECRETS_FILE_PLAIN)) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Unencrypted secrets file not allowed in production. Use GPG encryption.');
    }
    secrets = loadSecretsFromFile(SECRETS_FILE_PLAIN, false);
  } 
  else {
    throw new Error(
      `Secrets file not found. Expected: ${SECRETS_FILE_PATH} or ${SECRETS_FILE_PLAIN}`
    );
  }
  
  const loaded: string[] = [];
  
  // Map file secrets to environment variables
  const secretMappings: Record<string, string> = {
    'database_password': 'DATABASE_PASSWORD',
    'encryption_key': 'ENCRYPTION_KEY',
    'audit_hmac_key': 'AUDIT_HMAC_KEY',
    'jwt_secret': 'JWT_SECRET',
    'backup_encryption_key': 'BACKUP_ENCRYPTION_KEY',
    'operator_password': 'OPERATOR_PASSWORD',
    'telegram_bot_token': 'TELEGRAM_BOT_TOKEN',
    'smtp_password': 'SMTP_PASS',
  };
  
  for (const [fileKey, envKey] of Object.entries(secretMappings)) {
    if (secrets[fileKey]) {
      process.env[envKey] = secrets[fileKey];
      loaded.push(envKey);
    }
  }
  
  if (loaded.length === 0) {
    throw new Error('No secrets were loaded from file');
  }
  
  console.log(`[File Secrets] Successfully loaded ${loaded.length} secrets`);
  loaded.forEach(key => console.log(`  ✓ ${key}`));
}

export function createSecretsTemplate(): string {
  const template: SecretsData = {
    database_password: 'CHANGE_ME',
    encryption_key: 'CHANGE_ME_64_HEX_CHARS',
    audit_hmac_key: 'CHANGE_ME_64_HEX_CHARS',
    jwt_secret: 'CHANGE_ME_128_HEX_CHARS',
    backup_encryption_key: 'CHANGE_ME_64_HEX_CHARS',
    operator_password: 'CHANGE_ME_16_PLUS_CHARS',
    telegram_bot_token: 'OPTIONAL',
    smtp_password: 'OPTIONAL',
  };
  
  return JSON.stringify(template, null, 2);
}

export const fileSecretsEnabled = (): boolean => {
  return existsSync(SECRETS_FILE_PATH) || existsSync(SECRETS_FILE_PLAIN);
};
