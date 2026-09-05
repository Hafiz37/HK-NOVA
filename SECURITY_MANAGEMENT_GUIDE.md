# 🔐 Security Management Guide - HK-NOVA

## Overview
This document provides comprehensive guidance for managing security credentials, encryption keys, and secrets in HK-NOVA production environment.

---

## 📋 Table of Contents
1. [Initial Setup](#initial-setup)
2. [Key Generation](#key-generation)
3. [Key Rotation](#key-rotation)
4. [Secrets Management](#secrets-management)
5. [Security Best Practices](#security-best-practices)
6. [Troubleshooting](#troubleshooting)

---

## 🚀 Initial Setup

### Step 1: Generate Production Keys

```bash
# Generate all production keys at once
bash scripts/generate-production-keys.sh

# This will generate:
# - ENCRYPTION_KEY (32 bytes / 64 hex chars)
# - AUDIT_HMAC_KEY (32 bytes / 64 hex chars)
# - JWT_SECRET (64 bytes / 128 hex chars)
# - BACKUP_ENCRYPTION_KEY (32 bytes / 64 hex chars)
# - DATABASE_PASSWORD (32 chars, secure random)
# - OPERATOR_PASSWORD (24+ chars, strong password)
```

### Step 2: Store Keys Securely

**Option A: Password Manager (Recommended)**
1. Copy all generated keys to 1Password/LastPass/Bitwarden
2. Create secure note titled "HK-NOVA Production Secrets"
3. Tag with: production, hk-nova, secrets
4. Share with authorized team members only

**Option B: Encrypted File**
```bash
# Save keys to encrypted GPG file
gpg -c production-secrets.txt

# Store encrypted file in secure location
mv production-secrets.txt.gpg ~/secure-vault/

# Delete plaintext
shred -u production-secrets.txt
```

**Option C: Cloud Secrets Manager**
```bash
# AWS Secrets Manager
aws secretsmanager create-secret \
  --name hk-nova/encryption-key \
  --secret-string "YOUR_KEY_HERE"

# HashiCorp Vault
vault kv put secret/hk-nova/production \
  encryption_key="YOUR_KEY_HERE"
```

### Step 3: Configure .env.production

```bash
# Copy template
cp .env.production.template .env.production

# Edit with secure editor
nano .env.production

# Paste generated keys
# Set proper permissions
chmod 600 .env.production

# Verify ownership
chown $USER:$USER .env.production
```

### Step 4: Verify Configuration

```bash
# Validate all security settings
pnpm tsx scripts/verify-production-config.ts

# Expected output:
# ✅ ENCRYPTION_KEY: Valid 32-byte hex key with good entropy
# ✅ OPERATOR_PASSWORD: Strong password (entropy: 87.3 bits, score: 4/4)
# ✅ Production configuration is valid and secure!
```

### Step 5: Test Encryption

```bash
# Test encryption/decryption
pnpm tsx scripts/test-encryption.ts

# Expected output:
# ✅ Simple password: PASS
# ✅ SNMP community: PASS
# ✅ All encryption tests passed!
```

---

## 🔑 Key Generation

### Manual Key Generation

```bash
# Encryption Key (32 bytes / 64 hex)
openssl rand -hex 32

# JWT Secret (64 bytes / 128 hex)
openssl rand -hex 64

# Database Password (32 chars, alphanumeric)
openssl rand -base64 32 | tr -d "=+/" | cut -c1-32

# Operator Password (24+ chars, strong)
openssl rand -base64 24 | tr -d "=" | tr "/" "_"
```

### Key Requirements

| Key Type | Length | Format | Entropy | Validation |
|----------|--------|--------|---------|------------|
| ENCRYPTION_KEY | 64 chars | Hex | 256 bits | Required |
| JWT_SECRET | 128 chars | Hex | 512 bits | Required |
| AUDIT_HMAC_KEY | 64 chars | Hex | 256 bits | Required |
| BACKUP_ENCRYPTION_KEY | 64 chars | Hex | 256 bits | Required |
| OPERATOR_PASSWORD | 16+ chars | Mixed | 60+ bits | Required |

---

## 🔄 Key Rotation

### When to Rotate Keys

- **Scheduled**: Every 90 days (recommended)
- **Immediate**: 
  - Security breach or suspected compromise
  - Employee with key access leaves company
  - Key accidentally exposed (logs, git, etc.)
  - Compliance requirement

### Rotation Process

#### 1. Pre-Rotation Checklist

```bash
# Backup database
mysqldump -u root -p hk_nova_prod > backup-pre-rotation-$(date +%Y%m%d).sql

# Backup current .env.production
cp .env.production .env.production.backup-$(date +%Y%m%d)

# Check system health
pnpm tsx scripts/health-check.ts
```

#### 2. Dry Run (Test Mode)

```bash
# Test rotation without making changes
pnpm tsx scripts/rotate-encryption-keys.ts --dry-run

# Expected output:
# 🔄 HK-NOVA Encryption Key Rotation
# ⚠️  DRY RUN MODE - No changes will be made
# 📊 Fetching devices with encrypted credentials...
#    Found 47 devices to process
# ✅ Re-encryption complete!
```

#### 3. Execute Rotation

```bash
# Perform actual key rotation
pnpm tsx scripts/rotate-encryption-keys.ts

# This will:
# 1. Generate new encryption key
# 2. Decrypt all device credentials with old key
# 3. Re-encrypt with new key
# 4. Save statistics
# 5. Display new key for manual update
```

#### 4. Update Environment

```bash
# Update .env.production with new key
nano .env.production

# Update ENCRYPTION_KEY with the value displayed by rotation script

# Verify new configuration
pnpm tsx scripts/verify-production-config.ts
```

#### 5. Restart Services

```bash
# Restart all workers with new key
pm2 restart all

# Verify workers are running
pm2 status

# Check logs for errors
pm2 logs --lines 100
```

#### 6. Verify Rotation Success

```bash
# Test decryption with new key
pnpm tsx scripts/test-encryption.ts

# Test SSH connection to a device
# This will use re-encrypted credentials
pnpm tsx scripts/test-device-connection.ts
```

#### 7. Post-Rotation

```bash
# Keep old key backed up for 30 days (rollback safety)
# Store in password manager with label: "OLD - Rotated 2026-09-05"

# Update key rotation record
echo "$(date): Encryption key rotated successfully" >> logs/key-rotation.log

# Notify team
# Send email/Slack: "Encryption keys rotated. Old key valid for 30 days for rollback."
```

### Rollback Procedure

If something goes wrong after rotation:

```bash
# Stop all services
pm2 stop all

# Restore old .env.production
cp .env.production.backup-YYYYMMDD .env.production

# Restore database backup
mysql -u root -p hk_nova_prod < backup-pre-rotation-YYYYMMDD.sql

# Restart services
pm2 restart all

# Verify
pnpm tsx scripts/verify-production-config.ts
```

---

## 🔒 Secrets Management

### Using AWS Secrets Manager

#### Setup

```bash
# Install AWS CLI
sudo apt-get install awscli

# Configure AWS credentials
aws configure
```

#### Integration

Create `src/lib/secrets/aws-secrets.ts`:

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

export async function getSecret(secretName: string): Promise<string> {
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return response.SecretString || '';
}

export async function loadProductionSecrets() {
  const secrets = {
    DB_PASSWORD: await getSecret('hk-nova/db-password'),
    ENCRYPTION_KEY: await getSecret('hk-nova/encryption-key'),
    JWT_SECRET: await getSecret('hk-nova/jwt-secret'),
    OPERATOR_PASSWORD: await getSecret('hk-nova/operator-password'),
  };
  
  Object.entries(secrets).forEach(([key, value]) => {
    process.env[key] = value;
  });
}
```

Update `server.js`:

```javascript
const { loadProductionSecrets } = require('./src/lib/secrets/aws-secrets');

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    await loadProductionSecrets();
  }
  // ... rest of server code
}
```

### Using HashiCorp Vault

#### Setup

```bash
# Install Vault
wget https://releases.hashicorp.com/vault/1.15.0/vault_1.15.0_linux_amd64.zip
unzip vault_1.15.0_linux_amd64.zip
sudo mv vault /usr/local/bin/

# Start Vault server
vault server -dev

# Set environment
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='your-token'
```

#### Store Secrets

```bash
# Store all secrets at once
vault kv put secret/hk-nova/production \
  encryption_key="YOUR_KEY" \
  jwt_secret="YOUR_SECRET" \
  operator_password="YOUR_PASSWORD"

# Read secrets
vault kv get secret/hk-nova/production
```

---

## 🛡️ Security Best Practices

### 1. Access Control

- Limit secrets access to 2-3 senior team members
- Use principle of least privilege
- Rotate keys when team members leave
- Enable MFA on secrets manager accounts

### 2. Key Storage

✅ **DO:**
- Use password managers (1Password, Bitwarden)
- Use cloud secrets managers (AWS, Vault)
- Encrypt files with GPG
- Set file permissions to 600
- Store backups in separate secure location

❌ **DON'T:**
- Commit to git (even private repos)
- Store in plain text files
- Share via email or Slack
- Store in browser or OS clipboard
- Keep in screenshots or documentation

### 3. Password Requirements

Production passwords must have:
- Minimum 16 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character
- Minimum 60 bits of entropy
- No common weak patterns

### 4. Monitoring

```bash
# Enable audit logging
# Add to .env.production
AUDIT_HMAC_KEY="your-hmac-key"

# Monitor failed authentication attempts
tail -f logs/auth-failures.log

# Alert on suspicious access patterns
# Configure in src/lib/security/alert-rules.ts
```

### 5. Compliance

- Document key rotation schedule
- Maintain access logs
- Perform quarterly security audits
- Keep incident response plan updated
- Train team on security procedures

---

## 🔧 Troubleshooting

### Issue: "ENCRYPTION_KEY must be changed from template value"

**Solution:**
```bash
# Generate new key
openssl rand -hex 32

# Update .env.production
nano .env.production

# Verify
pnpm tsx scripts/verify-production-config.ts
```

### Issue: "Failed to decrypt device credentials"

**Possible causes:**
1. ENCRYPTION_KEY changed without re-encrypting data
2. Database contains data encrypted with different key
3. Encryption key corruption

**Solution:**
```bash
# Restore old key temporarily
cp .env.production.backup .env.production

# Test if decryption works
pnpm tsx scripts/test-encryption.ts

# If works, perform proper key rotation:
pnpm tsx scripts/rotate-encryption-keys.ts
```

### Issue: "Password entropy too low"

**Solution:**
```bash
# Generate stronger password
openssl rand -base64 32

# Add special characters manually
# Example: Xk9$mP2#qL8@vN4&wR7!yT1%zS5^aB3
```

### Issue: "AWS Secrets Manager access denied"

**Solution:**
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify IAM permissions
aws iam get-user

# Required permissions:
# - secretsmanager:GetSecretValue
# - secretsmanager:CreateSecret
# - secretsmanager:UpdateSecret
```

---

## 📞 Emergency Contacts

### Security Incident Response

1. **Immediate**: Stop all production services
2. **Assess**: Determine scope of compromise
3. **Rotate**: Generate and deploy new keys
4. **Audit**: Review access logs for breach
5. **Report**: Document incident for compliance

### Key Compromise Procedure

```bash
# 1. Generate new keys immediately
bash scripts/generate-production-keys.sh

# 2. Rotate encryption keys
pnpm tsx scripts/rotate-encryption-keys.ts

# 3. Force password reset for all users
pnpm tsx scripts/force-password-reset.ts

# 4. Review audit logs
pnpm tsx scripts/audit-log-review.ts --since "2 hours ago"

# 5. Notify stakeholders
# Send incident report to security@company.com
```

---

## 📚 Additional Resources

- [OWASP Key Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)
- [NIST Special Publication 800-57](https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)

---

**Last Updated:** 2026-09-05  
**Maintained By:** DevOps/Security Team  
**Review Schedule:** Quarterly
