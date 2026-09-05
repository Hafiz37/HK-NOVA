#!/usr/bin/env tsx
/**
 * HK-NOVA Production Configuration Verification
 * Validates that all production secrets are properly configured
 * Run: pnpm tsx scripts/verify-production-config.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { validatePasswordStrength, calculatePasswordEntropy } from '../src/lib/security/password-policy';

interface ValidationResult {
  field: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

const results: ValidationResult[] = [];

function addResult(field: string, status: 'pass' | 'fail' | 'warn', message: string, severity?: 'critical' | 'high' | 'medium' | 'low') {
  results.push({ field, status, message, severity });
}

function loadEnvFile(filePath: string): Record<string, string> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const env: Record<string, string> = {};
    
    content.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        if (key && value) {
          env[key] = value;
        }
      }
    });
    
    return env;
  } catch (error) {
    console.error(`❌ Failed to load ${filePath}`);
    process.exit(1);
  }
}

function validateHexKey(value: string, expectedLength: number, fieldName: string): void {
  if (!value || value.includes('CHANGE_ME')) {
    addResult(fieldName, 'fail', 'Still contains template/placeholder value', 'critical');
    return;
  }
  
  if (value.length !== expectedLength) {
    addResult(fieldName, 'fail', `Invalid length: ${value.length} (expected: ${expectedLength})`, 'critical');
    return;
  }
  
  if (!/^[0-9a-fA-F]+$/.test(value)) {
    addResult(fieldName, 'fail', 'Not a valid hex string', 'critical');
    return;
  }
  
  // Check for weak patterns
  if (value === '0'.repeat(expectedLength) || value === '1'.repeat(expectedLength)) {
    addResult(fieldName, 'fail', 'Key is all zeros or ones (insecure)', 'critical');
    return;
  }
  
  // Check entropy (should have varied hex characters)
  const uniqueChars = new Set(value.toLowerCase()).size;
  if (uniqueChars < 8) {
    addResult(fieldName, 'warn', `Low entropy: only ${uniqueChars} unique characters`, 'medium');
    return;
  }
  
  addResult(fieldName, 'pass', `Valid ${expectedLength/2}-byte hex key with good entropy`);
}

function validatePassword(value: string, fieldName: string): void {
  if (!value || value.includes('CHANGE_ME')) {
    addResult(fieldName, 'fail', 'Still contains template/placeholder value', 'critical');
    return;
  }
  
  const validation = validatePasswordStrength(value);
  
  if (!validation.valid) {
    addResult(fieldName, 'fail', validation.feedback.join('; '), 'critical');
    return;
  }
  
  if (validation.entropy < 60) {
    addResult(fieldName, 'warn', `Entropy: ${validation.entropy.toFixed(1)} bits (recommended: 60+)`, 'medium');
  } else {
    addResult(fieldName, 'pass', `Strong password (entropy: ${validation.entropy.toFixed(1)} bits, score: ${validation.score}/4)`);
  }
}

function validateUsername(value: string, fieldName: string): void {
  if (!value || value === 'CHANGE_ME') {
    addResult(fieldName, 'fail', 'Still contains template/placeholder value', 'critical');
    return;
  }
  
  const defaultUsernames = ['admin', 'operator', 'root', 'administrator'];
  if (defaultUsernames.includes(value.toLowerCase())) {
    addResult(fieldName, 'fail', 'Using common/default username (security risk)', 'high');
    return;
  }
  
  if (value.length < 4) {
    addResult(fieldName, 'fail', 'Username too short (min: 4 chars)', 'high');
    return;
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    addResult(fieldName, 'fail', 'Username contains invalid characters', 'high');
    return;
  }
  
  addResult(fieldName, 'pass', 'Valid username');
}

function validateDatabaseUrl(value: string, fieldName: string): void {
  if (!value || value.includes('PASSWORD') || value.includes('USERNAME')) {
    addResult(fieldName, 'fail', 'Still contains template placeholders', 'critical');
    return;
  }
  
  // Check for weak database passwords in URL
  const match = value.match(/mysql:\/\/([^:]+):([^@]+)@/);
  if (match) {
    const [, username, password] = match;
    
    if (password.length < 16) {
      addResult(fieldName, 'warn', 'Database password should be 16+ characters', 'high');
    } else {
      addResult(fieldName, 'pass', 'Database credentials configured');
    }
  } else {
    addResult(fieldName, 'fail', 'Invalid DATABASE_URL format', 'critical');
  }
}

function validateFeatureFlags(env: Record<string, string>): void {
  if (env.DEMO_MODE_ENABLED === 'true') {
    addResult('DEMO_MODE_ENABLED', 'fail', 'Demo mode is enabled in production', 'high');
  } else {
    addResult('DEMO_MODE_ENABLED', 'pass', 'Demo mode disabled');
  }
  
  if (env.NODE_ENV !== 'production') {
    addResult('NODE_ENV', 'fail', `NODE_ENV is "${env.NODE_ENV}" (should be "production")`, 'critical');
  } else {
    addResult('NODE_ENV', 'pass', 'NODE_ENV set to production');
  }
  
  if (env.APP_MODE !== 'production') {
    addResult('APP_MODE', 'warn', `APP_MODE is "${env.APP_MODE}" (should be "production")`, 'medium');
  } else {
    addResult('APP_MODE', 'pass', 'APP_MODE set to production');
  }
}

async function main() {
  console.log('🔍 HK-NOVA Production Configuration Verification');
  console.log('================================================\n');
  
  const envPath = join(process.cwd(), '.env.production');
  console.log(`📂 Loading: ${envPath}\n`);
  
  const env = loadEnvFile(envPath);
  
  console.log('🔐 Validating Security Keys...\n');
  
  // Validate encryption keys
  validateHexKey(env.ENCRYPTION_KEY, 64, 'ENCRYPTION_KEY');
  validateHexKey(env.AUDIT_HMAC_KEY, 64, 'AUDIT_HMAC_KEY');
  validateHexKey(env.JWT_SECRET, 128, 'JWT_SECRET');
  validateHexKey(env.BACKUP_ENCRYPTION_KEY, 64, 'BACKUP_ENCRYPTION_KEY');
  
  console.log('\n👤 Validating Credentials...\n');
  
  // Validate credentials
  validateUsername(env.OPERATOR_USERNAME, 'OPERATOR_USERNAME');
  validatePassword(env.OPERATOR_PASSWORD, 'OPERATOR_PASSWORD');
  validateDatabaseUrl(env.DATABASE_URL, 'DATABASE_URL');
  
  console.log('\n⚙️  Validating Configuration...\n');
  
  // Validate feature flags
  validateFeatureFlags(env);
  
  // Print results
  console.log('\n📊 Validation Results');
  console.log('====================\n');
  
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warn').length;
  
  const criticalIssues = results.filter(r => r.status === 'fail' && r.severity === 'critical');
  const highIssues = results.filter(r => r.status === 'fail' && r.severity === 'high');
  
  results.forEach(result => {
    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
    const color = result.status === 'pass' ? '\x1b[32m' : result.status === 'fail' ? '\x1b[31m' : '\x1b[33m';
    console.log(`${icon} ${color}${result.field}\x1b[0m: ${result.message}`);
  });
  
  console.log('\n' + '='.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('='.repeat(50) + '\n');
  
  if (criticalIssues.length > 0) {
    console.log('🚨 CRITICAL ISSUES FOUND');
    console.log('========================');
    console.log('The following issues MUST be fixed before production deployment:\n');
    criticalIssues.forEach(issue => {
      console.log(`❌ ${issue.field}: ${issue.message}`);
    });
    console.log('\n💡 Generate new keys with: bash scripts/generate-production-keys.sh\n');
    process.exit(1);
  }
  
  if (highIssues.length > 0) {
    console.log('⚠️  HIGH PRIORITY ISSUES');
    console.log('=======================');
    console.log('The following issues should be addressed:\n');
    highIssues.forEach(issue => {
      console.log(`⚠️  ${issue.field}: ${issue.message}`);
    });
    console.log('');
  }
  
  if (warnings > 0) {
    console.log('⚠️  Please review warnings above before deployment.\n');
  }
  
  if (failed === 0 && criticalIssues.length === 0) {
    console.log('✅ Production configuration is valid and secure!');
    console.log('   You may proceed with deployment.\n');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
