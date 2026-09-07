# HK-NOVA Production Credentials - CONFIDENTIAL

**Generated:** 2026-09-07 08:59:40 WIB  
**Status:** ACTIVE - Store in Password Manager

---

## 🔐 DATABASE CREDENTIALS

```
Username: hk_nova
Password: QHoh7NkQdgX8RuHDJ5QIbSyA
Database: hk_nova_prod
Host: localhost:3306
```

**Update MySQL:**
```sql
mysql -u root -p
ALTER USER 'hk_nova'@'localhost' IDENTIFIED BY 'QHoh7NkQdgX8RuHDJ5QIbSyA';
FLUSH PRIVILEGES;
```

---

## 👤 APPLICATION ADMIN

```
Username: admin_hknova_prod
Password: KnSUt686RUNLbGG42OJegggg
```

---

## 🔑 ENCRYPTION KEYS

```bash
ENCRYPTION_KEY="2dff5f998c1c8c955fa58c3e95ea55d1cdea3aca7ea759a2bb407f9c30f087d5"
AUDIT_HMAC_KEY="bf84521b662eec378c9c0176438fe1c78c86cecfd8e2951086d0181d44a30596"
JWT_SECRET="1f052668740db4dbd36afa523838097070e34702cd2882f3e6fbbd3ea87c61b36ce2e52d99f9c8a6132956cc6a35f7ae6a28757bf1b9ef85cde23777527239c3"
BACKUP_ENCRYPTION_KEY="285329ae0b91247abea458cc5e7410be1f228f37e1307b78dff420f550d739d1"
```

---

## 📝 DEPLOYMENT CHECKLIST

- [ ] Store all credentials in password manager
- [ ] Update MySQL password (see SQL above)
- [ ] Apply new .env.production: `mv .env.production.new .env.production`
- [ ] Verify file permissions: `chmod 600 .env.production`
- [ ] Test database connection
- [ ] Restart application: `pnpm pm2:restart`
- [ ] Test admin login with new password
- [ ] Delete this file: `shred -u PRODUCTION_CREDENTIALS_*.txt`

---

**⚠️ SECURITY WARNING:**
This file contains production secrets. Delete immediately after storing in password manager.

