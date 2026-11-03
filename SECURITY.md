# Security Guide

## Security Features

### Authentication & Authorization

Application routes use an active database user, via the `vibenet_session` cookie
or HTTP Basic credentials. Login and static assets are public. Passwords are
salted bcrypt hashes; new passwords require 8+ characters and at most 72 UTF-8
bytes. `AUTH_USERNAME` / `AUTH_PASSWORD` only seed an empty users table (defaults:
`admin` / `admin`). Installers may choose a stronger initial password. Change the
stored password in **Profile**, not by editing environment variables.

Session payloads contain `expiry:user_id:nonce`, signed with HMAC-SHA256 using
`SECRET_KEY`. They expire after 14 days. Remember-me cookies have a 14-day Max-Age;
otherwise they are browser-session cookies with the same server expiry. Cookies
are HttpOnly and SameSite=Lax, and Secure when the request is HTTPS. Configure a
trusted reverse proxy so the application sees the correct HTTPS scheme. Tokens
are signed, not encrypted; they contain no password or role.

Every protected request reloads the user; deactivation/deletion blocks existing
sessions, and role changes take effect immediately on the next request. Old
single-user tokens are rejected. Logout clears the browser cookie. Password
changes do not revoke already-issued tokens; individual token revocation and
server-side session inventories remain future work. Use deactivation to block
all requests from a compromised account while investigating.

- Admin has full access and manages users.
- Operator performs daily CRUD and backup operations, but cannot manage users or
  delete destinations (including via cascading location deletion).
- Viewer reads dashboards, backup contents/downloads, diagnostics and resource
  lists, without mutations, backup execution or connection tests. Do not grant
  viewer access to anyone who should not read stored device configurations.

Passwords/hashes are excluded from user API responses. Viewer destination API
responses omit connection configuration. Admin actions and password changes are
logged to `hk-nova.audit` using actor/target IDs, without passwords. Self-deletion,
self-deactivation/self-demotion and removal of the last active admin are blocked.

Use HTTPS for both cookies and HTTP Basic. Assign the least privileged role needed,
prefer 12+ character passwords, rotate admin passwords according to your policy
(e.g. quarterly), deactivate departed users promptly, and review roles regularly.
Set a random 32+ character `SECRET_KEY` and keep secrets outside version control
in a protected environment or secret vault. Preserve this key across upgrades.

The existing `/api/v1` operational router rate limiter remains enabled. Per-user
failed-login lockout, MFA/TOTP, SSO/LDAP, individual session revocation and a separate
audit database table are not implemented by this release. Monitor authentication
and application access logs using your deployment's logging infrastructure.

### Credential Encryption
Device passwords and secrets are encrypted at rest using Fernet symmetric encryption, derived from your `SECRET_KEY`.

### Security Headers
The following headers are added to all responses:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy`

### CORS
CORS is restricted to origins listed in `CORS_ORIGINS`. See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for details.

---

## Security Checklist

- [ ] Changed the stored initial admin password via Profile
- [ ] Set a strong, random `SECRET_KEY` (32+ characters)
- [ ] Restricted `CORS_ORIGINS` to known IPs/domains only
- [ ] Enabled HTTPS via reverse proxy or direct SSL
- [ ] Configured firewall rules to restrict port 5005 access
- [ ] Regular backups of the database file
- [ ] Enabled automatic security updates on the server

---

## HTTPS/SSL (recommended for production)

### Option A: Reverse Proxy (recommended)

Use Nginx or similar as a reverse proxy with SSL termination:

```nginx
server {
    listen 443 ssl http2;
    server_name backup.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://localhost:5005;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Option B: Direct SSL with Uvicorn

```bash
# Generate self-signed certificate (testing only)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Run with SSL
uvicorn app.main:app --host 0.0.0.0 --port 5005 --ssl-keyfile key.pem --ssl-certfile cert.pem
```

---

## Network Hardening

### Bind to localhost
If using a reverse proxy, restrict the listen address:
```env
HOST=127.0.0.1
```

### Firewall rules
```bash
# Allow only specific subnets
sudo ufw allow from 198.51.100.0/24 to any port 5005

# Block external access if using reverse proxy
sudo ufw deny 5005/tcp
```

### Fail2ban
Block brute-force login attempts:

```bash
sudo apt install fail2ban
```

Create `/etc/fail2ban/filter.d/hk-nova.conf`:
```ini
[Definition]
failregex = ^.*INFO:.*<HOST>.*"POST /login HTTP.*" 401
```

Create or add to `/etc/fail2ban/jail.local`:
```ini
[hk-nova]
enabled = true
port = 5005
filter = hk-nova
logpath = /var/log/syslog
maxretry = 5
bantime = 3600
```

> **Note:** Adjust `logpath` to match your setup. For systemd installs, use `/var/log/syslog` or pipe journal output. For Docker, use `docker compose logs` output.

---

## Incident Response

If you suspect unauthorized access:

1. **Stop the application** — `sudo systemctl stop hk-nova` or `docker compose down`
2. **Check logs** — `sudo journalctl -u hk-nova` or `docker compose logs`
3. **Contain compromised accounts** — deactivate affected users, review roles and change stored passwords through Profile; editing `AUTH_PASSWORD` does not reset accounts
4. **Regenerate SECRET_KEY** — this will invalidate all stored encrypted credentials (you will need to re-enter device passwords)
5. **Review database** — check for unauthorized changes
6. **Verify backups** — ensure backup files have not been tampered with

---

## Reporting Security Issues

If you discover a security vulnerability, please report it privately through GitHub:

- **GitHub Security Advisories:** [Report a vulnerability](https://github.com/kulunkilabs/hk-nova/security/advisories/new)

Please do not open public issues for security vulnerabilities.
