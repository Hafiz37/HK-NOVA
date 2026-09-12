#!/usr/bin/env bash
# ==============================================================================
# setup-nginx-ssl.sh — Automated Nginx + Let's Encrypt SSL Setup for HK-NOVA
# ==============================================================================
# Usage: sudo bash scripts/setup-nginx-ssl.sh <domain> <email>
# Example: sudo bash scripts/setup-nginx-ssl.sh noc.example.com admin@example.com

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [[ -z "${DOMAIN}" || -z "${EMAIL}" ]]; then
  echo "Usage: $0 <domain> <email>"
  echo "Example: $0 noc.example.com admin@example.com"
  exit 1
fi

echo "================================================================"
echo "  HK-NOVA Nginx + Let's Encrypt SSL Setup"
echo "  Domain: ${DOMAIN}"
echo "  Email: ${EMAIL}"
echo "================================================================"

# 1. Install Nginx & Certbot
echo "[1/6] Installing Nginx & Certbot..."
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx

# 2. Create HK-NOVA Nginx config
echo "[2/6] Deploying Nginx configuration..."
NGINX_CONF_SOURCE="/home/gopal-ichiro/Documents/magang/hk-nova/scripts/nginx-hk-nova.conf"
NGINX_CONF_DEST="/etc/nginx/sites-available/hk-nova"

sed "s/server_name _;/server_name ${DOMAIN};/g" "${NGINX_CONF_SOURCE}" \
  | sed "s|/etc/letsencrypt/live/_/|/etc/letsencrypt/live/${DOMAIN}/|g" \
  > "${NGINX_CONF_DEST}"

ln -sf "${NGINX_CONF_DEST}" /etc/nginx/sites-enabled/hk-nova
rm -f /etc/nginx/sites-enabled/default

# 3. Test Nginx config
echo "[3/6] Testing Nginx configuration..."
nginx -t

# 4. Start Nginx temporarily for HTTP challenge
echo "[4/6] Starting Nginx for ACME challenge..."
systemctl enable nginx
systemctl restart nginx

# 5. Obtain SSL Certificate via Let's Encrypt
echo "[5/6] Obtaining SSL certificate from Let's Encrypt..."
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --email "${EMAIL}" --redirect

# 6. Setup auto-renewal
echo "[6/6] Configuring auto-renewal..."
systemctl enable certbot.timer
systemctl start certbot.timer

# Final Nginx reload
systemctl reload nginx

echo ""
echo "================================================================"
echo "  ✅ HK-NOVA Nginx + SSL Setup Complete!"
echo "  URL: https://${DOMAIN}"
echo "  Certificate auto-renewal: Enabled (certbot.timer)"
echo "================================================================"