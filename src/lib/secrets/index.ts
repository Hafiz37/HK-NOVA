/**
 * Unified Secrets Manager
 * Automatically detects and uses available secrets backend
 * Priority: AWS Secrets Manager > HashiCorp Vault > GPG File
 * 
 * Usage:
 * import { loadProductionSecrets } from '@/lib/secrets';
 * 
 * // Automatically detect and load from available backend
 * await loadProductionSecrets();
 */

import { awsSecretsEnabled, loadProductionSecrets as loadFromAWS } from './aws-secrets';
import { vaultEnabled, loadProductionSecrets as loadFromVault } from './vault-secrets';
import { fileSecretsEnabled, loadProductionSecrets as loadFromFile } from './file-secrets';

export type SecretsBackend = 'aws' | 'vault' | 'file' | 'none';

export function detectSecretsBackend(): SecretsBackend {
  if (awsSecretsEnabled()) {
    return 'aws';
  }
  if (vaultEnabled()) {
    return 'vault';
  }
  if (fileSecretsEnabled()) {
    return 'file';
  }
  return 'none';
}

export async function loadProductionSecrets(): Promise<void> {
  const backend = detectSecretsBackend();
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔐 HK-NOVA Secrets Manager');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Detected backend: ${backend.toUpperCase()}`);
  console.log('');
  
  try {
    switch (backend) {
      case 'aws':
        console.log('Using AWS Secrets Manager...');
        await loadFromAWS();
        break;
        
      case 'vault':
        console.log('Using HashiCorp Vault...');
        await loadFromVault();
        break;
        
      case 'file':
        console.log('Using GPG encrypted file...');
        await loadFromFile();
        break;
        
      case 'none':
        console.warn('⚠️  No secrets backend detected!');
        console.warn('   Secrets will be loaded from .env file only.');
        console.warn('   For production, configure AWS/Vault/GPG.');
        console.log('');
        console.log('To enable secrets management:');
        console.log('  - AWS: Set AWS_REGION and AWS_ACCESS_KEY_ID');
        console.log('  - Vault: Set VAULT_ADDR and VAULT_TOKEN');
        console.log('  - File: Create /etc/hk-nova/secrets.json.gpg');
        break;
    }
    
    console.log('');
    console.log('✅ Secrets loaded successfully');
    console.log('═══════════════════════════════════════════════════════');
  } catch (error: any) {
    console.error('');
    console.error('❌ Failed to load secrets:', error.message);
    console.error('═══════════════════════════════════════════════════════');
    throw error;
  }
}

export function getSecretsBackendStatus() {
  const backend = detectSecretsBackend();
  
  return {
    backend,
    aws: {
      enabled: awsSecretsEnabled(),
      region: process.env.AWS_REGION,
      configured: !!(process.env.AWS_ACCESS_KEY_ID),
    },
    vault: {
      enabled: vaultEnabled(),
      address: process.env.VAULT_ADDR,
      configured: !!(process.env.VAULT_TOKEN),
    },
    file: {
      enabled: fileSecretsEnabled(),
      path: process.env.SECRETS_FILE_PATH || '/etc/hk-nova/secrets.json.gpg',
    },
  };
}

// Re-export specific implementations for advanced usage
export { awsSecretsEnabled, uploadSecretsToAWS, createSecret as createAWSSecret } from './aws-secrets';
export { vaultEnabled, uploadSecretsToVault, vaultClient } from './vault-secrets';
export { fileSecretsEnabled, createSecretsTemplate, decryptSecretsFile, loadSecretsFromFile } from './file-secrets';
