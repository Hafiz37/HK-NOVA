#!/usr/bin/env tsx
/**
 * Test Secrets Management Integration
 * Tests all three backends: AWS, Vault, and File-based
 */

import { detectSecretsBackend, getSecretsBackendStatus } from '../src/lib/secrets';

async function testSecretsDetection() {
  console.log('🔍 Testing Secrets Backend Detection\n');
  
  const backend = detectSecretsBackend();
  const status = getSecretsBackendStatus();
  
  console.log('Detected Backend:', backend.toUpperCase());
  console.log('');
  
  console.log('AWS Secrets Manager:');
  console.log(`  Enabled: ${status.aws.enabled ? '✅' : '❌'}`);
  console.log(`  Region: ${status.aws.region || 'not set'}`);
  console.log(`  Configured: ${status.aws.configured ? '✅' : '❌'}`);
  console.log('');
  
  console.log('HashiCorp Vault:');
  console.log(`  Enabled: ${status.vault.enabled ? '✅' : '❌'}`);
  console.log(`  Address: ${status.vault.address || 'not set'}`);
  console.log(`  Configured: ${status.vault.configured ? '✅' : '❌'}`);
  console.log('');
  
  console.log('File-based (GPG):');
  console.log(`  Enabled: ${status.file.enabled ? '✅' : '❌'}`);
  console.log(`  Path: ${status.file.path}`);
  console.log('');
  
  if (backend === 'none') {
    console.log('⚠️  No secrets backend configured');
    console.log('   Secrets will be loaded from .env only');
    console.log('');
    console.log('To configure a backend:');
    console.log('');
    console.log('AWS Secrets Manager:');
    console.log('  export AWS_REGION=us-east-1');
    console.log('  export AWS_ACCESS_KEY_ID=your-key-id');
    console.log('  export AWS_SECRET_ACCESS_KEY=your-secret');
    console.log('');
    console.log('HashiCorp Vault:');
    console.log('  export VAULT_ADDR=http://127.0.0.1:8200');
    console.log('  export VAULT_TOKEN=your-vault-token');
    console.log('');
    console.log('File-based:');
    console.log('  Create /etc/hk-nova/secrets.json.gpg');
    console.log('  Or set SECRETS_FILE_PATH environment variable');
  } else {
    console.log(`✅ Secrets backend ready: ${backend.toUpperCase()}`);
  }
}

testSecretsDetection().catch(console.error);
