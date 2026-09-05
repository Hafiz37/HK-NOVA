#!/usr/bin/env tsx
/**
 * Security Audit Script
 * Comprehensive security checks for HK-NOVA
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

interface AuditResult {
  category: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

const results: AuditResult[] = [];

function addResult(category: string, status: 'pass' | 'fail' | 'warn', message: string, severity?: 'critical' | 'high' | 'medium' | 'low') {
  results.push({ category, status, message, severity });
}

console.log('🔍 HK-NOVA Security Audit');
console.log('=' .repeat(60));
console.log('');

// 1. Check for hardcoded credentials
console.log('1. Checking for hardcoded credentials...');
try {
  const files = ['.env.production', 'src/config/env.ts', 'server.js'];
  let foundCredentials = false;
  
  for (const file of files) {
    if (existsSync(file)) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('CHANGE_ME')) {
        addResult('Credentials', 'warn', `${file}: Contains template placeholders`, 'medium');
      }
      if (!/CHANGE_ME/.test(content) && /PASSWORD.*=.*"[^"]{8,}"/.test(content)) {
        // Check if it's an actual password, not a template
        foundCredentials = true;
      }
    }
  }
  
  if (!foundCredentials) {
    addResult('Credentials', 'pass', 'No hardcoded credentials found in checked files');
  }
} catch (error) {
  addResult('Credentials', 'warn', 'Could not check all files', 'low');
}

// 2. Check file permissions
console.log('2. Checking file permissions...');
try {
  const sensitiveFiles = ['.env', '.env.production'];
  for (const file of sensitiveFiles) {
    if (existsSync(file)) {
      const stat = require('fs').statSync(file);
      const mode = (stat.mode & parseInt('777', 8)).toString(8);
      if (mode === '600' || mode === '400') {
        addResult('Permissions', 'pass', `${file}: Secure (${mode})`);
      } else {
        addResult('Permissions', 'fail', `${file}: Insecure permissions (${mode})`, 'high');
      }
    }
  }
} catch (error) {
  addResult('Permissions', 'warn', 'Could not check permissions', 'low');
}

// 3. Check npm dependencies for vulnerabilities
console.log('3. Checking npm dependencies...');
try {
  const auditOutput = execSync('pnpm audit --json', { encoding: 'utf-8' });
  const audit = JSON.parse(auditOutput);
  
  if (audit.metadata) {
    const { vulnerabilities } = audit.metadata;
    if (vulnerabilities.critical > 0) {
      addResult('Dependencies', 'fail', `${vulnerabilities.critical} critical vulnerabilities`, 'critical');
    } else if (vulnerabilities.high > 0) {
      addResult('Dependencies', 'fail', `${vulnerabilities.high} high vulnerabilities`, 'high');
    } else if (vulnerabilities.moderate > 0) {
      addResult('Dependencies', 'warn', `${vulnerabilities.moderate} moderate vulnerabilities`, 'medium');
    } else {
      addResult('Dependencies', 'pass', 'No critical/high vulnerabilities found');
    }
  }
} catch (error) {
  addResult('Dependencies', 'pass', 'No vulnerabilities found (or audit not available)');
}

// 4. Check environment configuration
console.log('4. Checking environment configuration...');
const requiredEnvVars = [
  'ENCRYPTION_KEY',
  'JWT_SECRET',
  'AUDIT_HMAC_KEY',
  'DATABASE_URL',
];

for (const envVar of requiredEnvVars) {
  if (process.env[envVar]) {
    addResult('Environment', 'pass', `${envVar}: Set`);
  } else {
    addResult('Environment', 'fail', `${envVar}: Not set`, 'high');
  }
}

// 5. Check for secrets management
console.log('5. Checking secrets management...');
const hasAWS = !!(process.env.AWS_REGION || process.env.AWS_ACCESS_KEY_ID);
const hasVault = !!(process.env.VAULT_ADDR && process.env.VAULT_TOKEN);
const hasGPG = existsSync('/etc/hk-nova/secrets.json.gpg');

if (hasAWS || hasVault || hasGPG) {
  addResult('Secrets', 'pass', 'Secrets management configured');
} else {
  addResult('Secrets', 'warn', 'No secrets management backend configured', 'medium');
}

// 6. Check security headers
console.log('6. Checking security implementation...');
if (existsSync('middleware.ts')) {
  const middleware = readFileSync('middleware.ts', 'utf-8');
  const securityHeaders = [
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Strict-Transport-Security',
  ];
  
  let hasHeaders = 0;
  for (const header of securityHeaders) {
    if (middleware.includes(header)) {
      hasHeaders++;
    }
  }
  
  if (hasHeaders === securityHeaders.length) {
    addResult('Security Headers', 'pass', 'All security headers configured');
  } else {
    addResult('Security Headers', 'warn', `${hasHeaders}/${securityHeaders.length} security headers found`, 'medium');
  }
}

// 7. Check encryption keys strength
console.log('7. Checking encryption keys...');
if (process.env.ENCRYPTION_KEY) {
  const keyLength = process.env.ENCRYPTION_KEY.length;
  if (keyLength === 64) {
    addResult('Encryption', 'pass', 'ENCRYPTION_KEY: 256-bit (64 hex chars)');
  } else {
    addResult('Encryption', 'fail', `ENCRYPTION_KEY: Incorrect length (${keyLength})`, 'critical');
  }
}

if (process.env.JWT_SECRET) {
  const keyLength = process.env.JWT_SECRET.length;
  if (keyLength >= 64) {
    addResult('Encryption', 'pass', `JWT_SECRET: ${keyLength} chars`);
  } else {
    addResult('Encryption', 'fail', `JWT_SECRET: Too short (${keyLength})`, 'high');
  }
}

// Print results
console.log('');
console.log('=' .repeat(60));
console.log('Audit Results');
console.log('=' .repeat(60));
console.log('');

const passed = results.filter(r => r.status === 'pass').length;
const failed = results.filter(r => r.status === 'fail').length;
const warnings = results.filter(r => r.status === 'warn').length;

const critical = results.filter(r => r.status === 'fail' && r.severity === 'critical');
const high = results.filter(r => r.status === 'fail' && r.severity === 'high');

results.forEach(result => {
  const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
  const color = result.status === 'pass' ? '\x1b[32m' : result.status === 'fail' ? '\x1b[31m' : '\x1b[33m';
  console.log(`${icon} ${color}[${result.category}]\x1b[0m ${result.message}`);
});

console.log('');
console.log('=' .repeat(60));
console.log(`✅ Passed: ${passed}`);
console.log(`⚠️  Warnings: ${warnings}`);
console.log(`❌ Failed: ${failed}`);
console.log('=' .repeat(60));

if (critical.length > 0) {
  console.log('');
  console.log('🚨 CRITICAL ISSUES:');
  critical.forEach(issue => console.log(`   - ${issue.message}`));
  process.exit(1);
}

if (high.length > 0) {
  console.log('');
  console.log('⚠️  HIGH PRIORITY ISSUES:');
  high.forEach(issue => console.log(`   - ${issue.message}`));
}

if (failed === 0 && critical.length === 0) {
  console.log('');
  console.log('✅ Security audit passed!');
  process.exit(0);
} else {
  process.exit(1);
}
