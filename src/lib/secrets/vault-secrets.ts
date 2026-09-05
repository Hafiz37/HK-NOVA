/**
 * HashiCorp Vault Integration
 * Provides enterprise-grade secret storage and retrieval
 * 
 * Usage:
 * import { loadProductionSecrets, getSecret } from '@/lib/secrets/vault-secrets';
 * 
 * // Load all secrets at startup
 * await loadProductionSecrets();
 * 
 * // Get individual secret
 * const apiKey = await getSecret('api-key');
 */

import axios, { AxiosInstance } from 'axios';

const VAULT_ADDR = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
const VAULT_TOKEN = process.env.VAULT_TOKEN;
const VAULT_NAMESPACE = process.env.VAULT_NAMESPACE || '';
const VAULT_SECRET_PATH = process.env.VAULT_SECRET_PATH || 'secret/data/hk-nova/production';

interface VaultSecret {
  data: {
    data: Record<string, string>;
    metadata: {
      created_time: string;
      version: number;
    };
  };
}

class VaultClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: VAULT_ADDR,
      headers: {
        'X-Vault-Token': VAULT_TOKEN || '',
        'X-Vault-Namespace': VAULT_NAMESPACE,
      },
      timeout: 10000,
    });
  }

  async getSecret(path: string): Promise<Record<string, string> | null> {
    try {
      const response = await this.client.get<VaultSecret>(`/v1/${path}`);
      return response.data.data.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.warn(`[Vault] Secret not found: ${path}`);
        return null;
      }
      console.error(`[Vault] Failed to retrieve secret ${path}:`, error.message);
      throw error;
    }
  }

  async writeSecret(path: string, data: Record<string, string>): Promise<void> {
    try {
      await this.client.post(`/v1/${path}`, { data });
      console.log(`[Vault] Written secret to: ${path}`);
    } catch (error: any) {
      console.error(`[Vault] Failed to write secret ${path}:`, error.message);
      throw error;
    }
  }

  async listSecrets(path: string): Promise<string[]> {
    try {
      const response = await this.client.request({
        method: 'LIST',
        url: `/v1/${path}`,
      });
      return response.data.data.keys || [];
    } catch (error: any) {
      console.error(`[Vault] Failed to list secrets at ${path}:`, error.message);
      return [];
    }
  }

  async deleteSecret(path: string): Promise<void> {
    try {
      await this.client.delete(`/v1/${path}`);
      console.log(`[Vault] Deleted secret: ${path}`);
    } catch (error: any) {
      console.error(`[Vault] Failed to delete secret ${path}:`, error.message);
      throw error;
    }
  }
}

const vaultClient = new VaultClient();

export async function getSecret(key: string): Promise<string | null> {
  const secrets = await vaultClient.getSecret(VAULT_SECRET_PATH);
  return secrets?.[key] || null;
}

export async function loadProductionSecrets(): Promise<void> {
  console.log('[Vault] Loading production secrets...');
  
  if (!VAULT_TOKEN) {
    throw new Error('VAULT_TOKEN environment variable is required');
  }
  
  try {
    const secrets = await vaultClient.getSecret(VAULT_SECRET_PATH);
    
    if (!secrets) {
      throw new Error(`No secrets found at path: ${VAULT_SECRET_PATH}`);
    }
    
    const loaded: string[] = [];
    
    // Map Vault secrets to environment variables
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
    
    for (const [vaultKey, envKey] of Object.entries(secretMappings)) {
      if (secrets[vaultKey]) {
        process.env[envKey] = secrets[vaultKey];
        loaded.push(envKey);
      }
    }
    
    if (loaded.length === 0) {
      throw new Error('No secrets were loaded from Vault');
    }
    
    console.log(`[Vault] Successfully loaded ${loaded.length} secrets`);
    loaded.forEach(key => console.log(`  ✓ ${key}`));
    
  } catch (error: any) {
    console.error('[Vault] Failed to load secrets:', error.message);
    throw error;
  }
}

export async function uploadSecretsToVault(): Promise<void> {
  console.log('[Vault] Uploading secrets to Vault...');
  
  if (!VAULT_TOKEN) {
    throw new Error('VAULT_TOKEN environment variable is required');
  }
  
  const secrets: Record<string, string> = {
    encryption_key: process.env.ENCRYPTION_KEY || '',
    audit_hmac_key: process.env.AUDIT_HMAC_KEY || '',
    jwt_secret: process.env.JWT_SECRET || '',
    backup_encryption_key: process.env.BACKUP_ENCRYPTION_KEY || '',
    operator_password: process.env.OPERATOR_PASSWORD || '',
  };
  
  // Remove empty values
  Object.keys(secrets).forEach(key => {
    if (!secrets[key]) delete secrets[key];
  });
  
  if (Object.keys(secrets).length === 0) {
    throw new Error('No secrets available to upload');
  }
  
  await vaultClient.writeSecret(VAULT_SECRET_PATH, secrets);
  
  console.log(`[Vault] Successfully uploaded ${Object.keys(secrets).length} secrets`);
}

export const vaultEnabled = (): boolean => {
  return !!(VAULT_TOKEN && VAULT_ADDR);
};

export { vaultClient };
