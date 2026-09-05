/**
 * AWS Secrets Manager Integration
 * Provides centralized secret storage and retrieval for production
 * 
 * Usage:
 * import { loadProductionSecrets, getSecret } from '@/lib/secrets/aws-secrets';
 * 
 * // Load all secrets at startup
 * await loadProductionSecrets();
 * 
 * // Get individual secret
 * const apiKey = await getSecret('hk-nova/api-key');
 */

import { SecretsManagerClient, GetSecretValueCommand, CreateSecretCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  } : undefined,
});

interface SecretConfig {
  name: string;
  envKey: string;
  required: boolean;
}

const SECRET_MAPPINGS: SecretConfig[] = [
  { name: 'hk-nova/db-password', envKey: 'DATABASE_PASSWORD', required: true },
  { name: 'hk-nova/encryption-key', envKey: 'ENCRYPTION_KEY', required: true },
  { name: 'hk-nova/audit-hmac-key', envKey: 'AUDIT_HMAC_KEY', required: true },
  { name: 'hk-nova/jwt-secret', envKey: 'JWT_SECRET', required: true },
  { name: 'hk-nova/backup-encryption-key', envKey: 'BACKUP_ENCRYPTION_KEY', required: true },
  { name: 'hk-nova/operator-password', envKey: 'OPERATOR_PASSWORD', required: true },
  { name: 'hk-nova/telegram-bot-token', envKey: 'TELEGRAM_BOT_TOKEN', required: false },
  { name: 'hk-nova/smtp-password', envKey: 'SMTP_PASS', required: false },
];

export async function getSecret(secretName: string): Promise<string | null> {
  try {
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );
    return response.SecretString || null;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      console.warn(`[AWS Secrets] Secret not found: ${secretName}`);
      return null;
    }
    console.error(`[AWS Secrets] Failed to retrieve secret ${secretName}:`, error);
    throw error;
  }
}

export async function createSecret(secretName: string, secretValue: string, description?: string): Promise<void> {
  try {
    await client.send(
      new CreateSecretCommand({
        Name: secretName,
        SecretString: secretValue,
        Description: description || `HK-NOVA production secret: ${secretName}`,
      })
    );
    console.log(`[AWS Secrets] Created secret: ${secretName}`);
  } catch (error: any) {
    if (error.name === 'ResourceExistsException') {
      console.warn(`[AWS Secrets] Secret already exists: ${secretName}`);
    } else {
      console.error(`[AWS Secrets] Failed to create secret ${secretName}:`, error);
      throw error;
    }
  }
}

export async function loadProductionSecrets(): Promise<void> {
  console.log('[AWS Secrets] Loading production secrets...');
  
  const errors: string[] = [];
  const loaded: string[] = [];
  
  for (const config of SECRET_MAPPINGS) {
    try {
      const secretValue = await getSecret(config.name);
      
      if (secretValue) {
        process.env[config.envKey] = secretValue;
        loaded.push(config.envKey);
      } else if (config.required) {
        errors.push(`Required secret not found: ${config.name} → ${config.envKey}`);
      }
    } catch (error) {
      if (config.required) {
        errors.push(`Failed to load ${config.name}: ${error}`);
      } else {
        console.warn(`[AWS Secrets] Optional secret unavailable: ${config.name}`);
      }
    }
  }
  
  if (errors.length > 0) {
    console.error('[AWS Secrets] Failed to load required secrets:');
    errors.forEach(err => console.error(`  - ${err}`));
    throw new Error('Failed to load required production secrets from AWS');
  }
  
  console.log(`[AWS Secrets] Successfully loaded ${loaded.length} secrets`);
  loaded.forEach(key => console.log(`  ✓ ${key}`));
}

export async function uploadSecretsToAWS(): Promise<void> {
  console.log('[AWS Secrets] Uploading secrets to AWS Secrets Manager...');
  
  const secrets = [
    { name: 'hk-nova/encryption-key', value: process.env.ENCRYPTION_KEY, desc: 'AES-256 encryption key' },
    { name: 'hk-nova/audit-hmac-key', value: process.env.AUDIT_HMAC_KEY, desc: 'HMAC key for audit log integrity' },
    { name: 'hk-nova/jwt-secret', value: process.env.JWT_SECRET, desc: 'JWT signing secret' },
    { name: 'hk-nova/backup-encryption-key', value: process.env.BACKUP_ENCRYPTION_KEY, desc: 'Backup encryption key' },
    { name: 'hk-nova/operator-password', value: process.env.OPERATOR_PASSWORD, desc: 'Operator account password' },
  ];
  
  for (const secret of secrets) {
    if (secret.value) {
      await createSecret(secret.name, secret.value, secret.desc);
    } else {
      console.warn(`[AWS Secrets] Skipping upload - no value for: ${secret.name}`);
    }
  }
  
  console.log('[AWS Secrets] Upload complete!');
}

export const awsSecretsEnabled = (): boolean => {
  return !!(process.env.AWS_REGION || process.env.AWS_ACCESS_KEY_ID);
};
