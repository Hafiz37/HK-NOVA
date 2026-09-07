# Credential Management Guide

## Overview

This document outlines the secure management of production credentials for HK-NOVA.

## Credential Types

### Critical Production Secrets

1. **ENCRYPTION_KEY** - 32-byte (64 hex char) key for sensitive data encryption
2. **JWT_SECRET** - 64-byte (128 hex char) key for JWT token signing
3. **BACKUP_ENCRYPTION_KEY** - 32-byte key for backup file encryption
4. **AUDIT_HMAC_KEY** - 32-byte key for audit log integrity
5. **OPERATOR_PASSWORD** - Strong password for operator account access

### Database Credentials

- **DATABASE_URL** - MySQL connection string with credentials

### Optional Service Credentials

- Telegram Bot Token
- SMTP credentials
- SMS gateway credentials
- Webhook tokens

## Generating Secure Credentials

### Encryption Keys

```bash
# Generate 32-byte encryption key (64 hex chars)
openssl rand -hex 32

# Generate 64-byte JWT secret (128 hex chars)
openssl rand -hex 64
```

### Strong Passwords

```bash
# Generate 24-character strong password
openssl rand -base64 24
```

### Requirements

- **Encryption Keys**: Must be 64 hex characters (32 bytes)
- **JWT Secret**: Must be 128 hex characters (64 bytes)
- **Passwords**: Minimum 16 characters with:
  - Uppercase letters
  - Lowercase letters
  - Numbers
  - Special characters
  - NO common patterns (admin, password, 123456)

## Storage & Protection

### File Permissions

```bash
# Set restrictive permissions on production env file
chmod 600 .env.production

# Verify permissions
ls -la .env.production
# Should show: -rw------- (owner read/write only)
```

### Git Protection

The following patterns are protected in `.gitignore`:

```
.env.production
.env.production.local
.env.production.backup*
.env.production.OLD_INSECURE
production-secrets*.txt
production-secrets*.gpg
*.key
*.p12
*.pfx
PRODUCTION_CREDENTIALS.md
```

### Verification

```bash
# Verify file is ignored by git
git check-ignore -v .env.production

# Check no credentials are staged
git status --porcelain | grep -E '\.(env|key|pem)'
```

## Rotation Procedure

### When to Rotate

- **Mandatory**: Every 90 days
- **Immediate**: After suspected compromise
- **Before**: Initial production deployment
- **After**: Team member departure

### Rotation Steps

1. **Backup Current Credentials**
   ```bash
   cp .env.production .env.production.backup.$(date +%Y%m%d_%H%M%S)
   chmod 600 .env.production.backup.*
   ```

2. **Generate New Secrets**
   ```bash
   openssl rand -hex 32  # ENCRYPTION_KEY
   openssl rand -hex 32  # BACKUP_ENCRYPTION_KEY
   openssl rand -hex 64  # JWT_SECRET
   openssl rand -base64 24  # New operator password
   ```

3. **Update .env.production**
   - Replace old keys with new values
   - Keep database credentials (unless rotating those too)
   - Update OPERATOR_PASSWORD

4. **Restart Application**
   ```bash
   pm2 restart hk-nova-app
   pm2 restart all
   ```

5. **Verify Application Health**
   ```bash
   pm2 logs hk-nova-app --lines 50
   # Look for "✅ Environment validation passed"
   ```

6. **Test Authentication**
   - Login with new operator password
   - Verify JWT tokens work
   - Test encrypted data access

7. **Update Password Manager**
   - Store new credentials in secure vault
   - Update team access if needed

8. **Securely Delete Old Backups**
   ```bash
   # After 7 days of verified operation
   shred -u .env.production.backup.*
   ```

## Password Policy

### Current Enforcement

Located in `src/config/env.ts`:

- Minimum 16 characters
- Must contain uppercase letters
- Must contain lowercase letters
- Must contain numbers
- Must contain special characters
- Cannot contain: password, admin, 123456, changeme

### For User Accounts (Phase 1.2)

Will be implemented in:
- `src/app/api/auth/change-password/route.ts`
- `src/app/api/users/route.ts`

## Emergency Procedures

### Suspected Credential Compromise

1. **Immediate Action**
   ```bash
   # Rotate ALL credentials immediately
   ./scripts/emergency-credential-rotation.sh
   ```

2. **Audit Access**
   - Check audit logs: `src/app/api/audit/route.ts`
   - Review login attempts
   - Identify unauthorized access

3. **Notify Team**
   - Alert all administrators
   - Document incident
   - Update incident log

4. **Post-Incident**
   - Review access controls
   - Update security procedures
   - Consider additional monitoring

### Lost Credentials

1. **Check Secure Backups**
   - Password manager
   - Encrypted backup files
   - Team member access

2. **If Unrecoverable**
   - Generate new credentials
   - Update .env.production
   - Restart services
   - All users must re-authenticate

## Backup Storage

### Recommended Locations

1. **Password Manager** (Primary)
   - 1Password
   - LastPass
   - Bitwarden

2. **Encrypted File** (Secondary)
   ```bash
   # Encrypt credentials file
   gpg -c PRODUCTION_CREDENTIALS_SECURE.txt
   # Store .gpg file in secure location
   ```

3. **Offline Storage** (Tertiary)
   - Encrypted USB drive
   - Secure physical safe

### Never Store In

- Git repository
- Unencrypted cloud storage
- Email
- Slack/Discord messages
- Shared drives without encryption
- Code comments

## Validation

### Startup Validation

Application validates credentials at startup via `src/config/env.ts`:

```bash
# Expected output on successful start:
✅ Environment validation passed
```

### Manual Validation

```bash
# Test env file validity
node -e "require('./src/config/env.ts').validateEnv()"
```

## Audit Trail

### Credential Changes

All credential rotations should be logged in:
- `/var/log/hk-nova/security-audit.log`
- Internal audit system
- Change management system

### Template Entry

```
Date: 2026-09-07
Action: Credential Rotation
Reason: Scheduled 90-day rotation
Changed: ENCRYPTION_KEY, JWT_SECRET, OPERATOR_PASSWORD
Changed By: admin_username
Verified By: admin_username
Status: Success
```

## Checklist

### Initial Setup

- [ ] Generate all required secrets
- [ ] Set .env.production permissions to 600
- [ ] Verify .gitignore includes credential patterns
- [ ] Store credentials in password manager
- [ ] Document who has access
- [ ] Test application startup
- [ ] Verify authentication works

### Regular Maintenance

- [ ] Schedule 90-day rotation reminder
- [ ] Review access logs monthly
- [ ] Audit team member access quarterly
- [ ] Test backup restoration annually
- [ ] Update documentation as needed

### Before Team Changes

- [ ] Rotate credentials when member leaves
- [ ] Update password manager access
- [ ] Verify no personal copies remain
- [ ] Document access changes

## Support

For credential issues:

1. Check this guide first
2. Review `RUNBOOK.md` incident response
3. Contact security administrator
4. Escalate if suspected compromise

---

**Last Updated**: 2026-09-07  
**Next Review**: 2026-12-07  
**Owner**: Security Team
