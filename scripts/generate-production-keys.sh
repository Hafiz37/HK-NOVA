#!/bin/bash
# HK-NOVA Production Key Generator
# This script generates cryptographically secure keys for production deployment
# Usage: bash scripts/generate-production-keys.sh

set -e

echo "🔐 HK-NOVA Production Key Generator"
echo "===================================="
echo ""
echo "⚠️  WARNING: This will generate NEW production keys."
echo "    Store these keys securely in a password manager!"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if openssl is available
if ! command -v openssl &> /dev/null; then
    echo -e "${RED}Error: openssl is not installed${NC}"
    echo "Install with: sudo apt-get install openssl"
    exit 1
fi

# Generate keys
echo -e "${GREEN}Generating encryption keys...${NC}"
ENCRYPTION_KEY=$(openssl rand -hex 32)
AUDIT_HMAC_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 64)
BACKUP_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Generate database password
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

# Generate operator password
OPERATOR_PASSWORD=$(openssl rand -base64 24 | tr -d "=" | tr "/" "_")$(openssl rand -hex 2 | tr '[:lower:]' '[:upper:]')

echo -e "${GREEN}✅ Keys generated successfully!${NC}"
echo ""
echo "======================================"
echo "PRODUCTION SECRETS - STORE SECURELY"
echo "======================================"
echo ""
echo "DATABASE_PASSWORD:"
echo "  $DB_PASSWORD"
echo ""
echo "ENCRYPTION_KEY (32 bytes hex):"
echo "  $ENCRYPTION_KEY"
echo ""
echo "AUDIT_HMAC_KEY (32 bytes hex):"
echo "  $AUDIT_HMAC_KEY"
echo ""
echo "JWT_SECRET (64 bytes hex):"
echo "  $JWT_SECRET"
echo ""
echo "BACKUP_ENCRYPTION_KEY (32 bytes hex):"
echo "  $BACKUP_ENCRYPTION_KEY"
echo ""
echo "OPERATOR_PASSWORD (24+ chars):"
echo "  $OPERATOR_PASSWORD"
echo ""
echo "======================================"
echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo "1. Copy these values to your password manager (1Password, LastPass, etc.)"
echo "2. Update .env.production with these values"
echo "3. Set secure file permissions: chmod 600 .env.production"
echo "4. Verify configuration: pnpm tsx scripts/verify-production-config.ts"
echo "5. NEVER commit .env.production to git"
echo ""

# Ask if user wants to save to encrypted file
read -p "Save to encrypted file? (requires GPG) [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    OUTPUT_FILE="production-secrets-$(date +%Y%m%d-%H%M%S).txt"
    
    cat > "$OUTPUT_FILE" << EOF
HK-NOVA Production Secrets
Generated: $(date)
==========================

DATABASE_PASSWORD=$DB_PASSWORD
ENCRYPTION_KEY=$ENCRYPTION_KEY
AUDIT_HMAC_KEY=$AUDIT_HMAC_KEY
JWT_SECRET=$JWT_SECRET
BACKUP_ENCRYPTION_KEY=$BACKUP_ENCRYPTION_KEY
OPERATOR_PASSWORD=$OPERATOR_PASSWORD

IMPORTANT:
- Store this file in a secure location
- Encrypt with: gpg -c $OUTPUT_FILE
- Delete plaintext after encryption
- Never commit to version control
EOF

    echo -e "${GREEN}✅ Secrets saved to: $OUTPUT_FILE${NC}"
    echo ""
    echo "Encrypt this file with:"
    echo "  gpg -c $OUTPUT_FILE"
    echo ""
    echo "Then delete the plaintext:"
    echo "  shred -u $OUTPUT_FILE"
fi

echo ""
echo -e "${GREEN}✅ Key generation complete!${NC}"
