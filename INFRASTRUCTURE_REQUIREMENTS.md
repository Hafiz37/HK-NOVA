# 🏗️ HK-NOVA Infrastructure Requirements

**Document Version:** 1.0  
**Last Updated:** 2026-09-05  
**Status:** Production Ready

---

## 📊 Server Specifications

### Minimum Requirements

| Component | Specification | Notes |
|-----------|--------------|-------|
| **CPU** | 4 cores / 8 threads | Intel Xeon / AMD EPYC recommended |
| **RAM** | 8 GB | 16 GB recommended for ML workers |
| **Storage** | 100 GB SSD | IOPS > 3000 for database performance |
| **Network** | 100 Mbps | 1 Gbps recommended for large networks |
| **OS** | Ubuntu 22.04 LTS | Or Debian 12 / RHEL 8+ |

### Recommended Production Specs

| Component | Specification | Justification |
|-----------|--------------|---------------|
| **CPU** | 8 cores / 16 threads | Handles 500+ devices + ML processing |
| **RAM** | 16 GB | Advanced ML worker needs 2GB, buffer for peaks |
| **Storage** | 250 GB NVMe SSD | Fast DB queries, backup storage, logs |
| **Network** | 1 Gbps | Concurrent ICMP/SNMP to hundreds of devices |
| **Backup** | 500 GB separate volume | Config backups, DB backups, logs archive |

---

## 🖥️ Software Stack

### Core Dependencies

```bash
# Operating System
Ubuntu 22.04 LTS (Jammy Jellyfish)

# Runtime
Node.js 20.x LTS
pnpm 10.x

# Database
MySQL 8.0.x

# Cache & Queue
Redis 7.x

# Process Manager
PM2 7.x

# Reverse Proxy (Optional)
Nginx 1.24.x / Caddy 2.x
```

### Installation Script

```bash
#!/bin/bash
# HK-NOVA Infrastructure Setup Script

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
corepack enable
corepack prepare pnpm@latest --activate

# Install MySQL 8.0
sudo apt install -y mysql-server
sudo systemctl enable mysql
sudo systemctl start mysql

# Secure MySQL installation
sudo mysql_secure_installation

# Install Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Install PM2 globally
npm install -g pm2

# Install Nginx (optional)
sudo apt install -y nginx
sudo systemctl enable nginx

# Install essential tools
sudo apt install -y git curl wget htop iotop nethogs

# Install monitoring tools
sudo apt install -y prometheus-node-exporter

echo "✅ Infrastructure setup complete!"
```

---

## 🔒 Security Requirements

### Firewall Configuration

```bash
# UFW Firewall Rules
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH (change port if needed)
sudo ufw allow 22/tcp

# HTTP/HTTPS (if using Nginx)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Application port (internal only if using Nginx)
# sudo ufw allow from 127.0.0.1 to any port 3000

# Enable firewall
sudo ufw enable
```

### File Permissions

```bash
# Set correct permissions
chmod 600 .env.production
chmod 600 /var/backups/hk-nova
chmod 755 /var/www/hk-nova
chown -R app-user:app-user /var/www/hk-nova
```

### SSL/TLS Certificate

```bash
# Let's Encrypt with Certbot
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d noc.yourdomain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

---

## 💾 Database Configuration

### MySQL Production Settings

**File:** `/etc/mysql/mysql.conf.d/mysqld.cnf`

```ini
[mysqld]
# Connection Settings
max_connections = 200
max_connect_errors = 1000000
wait_timeout = 600
interactive_timeout = 600

# Buffer Pool (70% of RAM for dedicated DB server)
innodb_buffer_pool_size = 4G
innodb_buffer_pool_instances = 4

# Log Files
innodb_log_file_size = 512M
innodb_log_buffer_size = 16M

# Performance
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
innodb_file_per_table = 1

# Character Set
character_set_server = utf8mb4
collation_server = utf8mb4_unicode_ci

# Query Cache (disabled in MySQL 8.0, use Redis)
# query_cache_type = 0

# Slow Query Log
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow-query.log
long_query_time = 2
```

### Database Setup Script

```sql
-- Create production database
CREATE DATABASE hk_nova_prod 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

-- Create dedicated user
CREATE USER 'hk_nova'@'localhost' 
  IDENTIFIED BY 'STRONG_PASSWORD_HERE';

-- Grant privileges
GRANT ALL PRIVILEGES ON hk_nova_prod.* 
  TO 'hk_nova'@'localhost';

-- Apply changes
FLUSH PRIVILEGES;

-- Verify
SHOW GRANTS FOR 'hk_nova'@'localhost';
```

### Database Backup Strategy

```bash
# Daily automated backup (cron)
0 2 * * * /var/www/hk-nova/scripts/backup-db.sh >> /var/log/hk-nova-backup.log 2>&1

# Backup script includes:
# - Full database dump
# - Compressed (gzip)
# - Timestamped filename
# - Retention: 30 days
# - Offsite copy (optional)
```

---

## 🚀 Redis Configuration

### Redis Production Settings

**File:** `/etc/redis/redis.conf`

```conf
# Network
bind 127.0.0.1 ::1
protected-mode yes
port 6379

# Memory
maxmemory 512mb
maxmemory-policy allkeys-lru

# Persistence (RDB)
save 900 1
save 300 10
save 60 10000

# AOF (optional, for durability)
appendonly no

# Performance
tcp-backlog 511
timeout 300
tcp-keepalive 300
```

### Redis Memory Planning

| Use Case | Memory | TTL |
|----------|--------|-----|
| Rate Limiting | 50 MB | 1 minute |
| Alert Cooldowns | 10 MB | Variable |
| Session Cache | 100 MB | 7 days |
| Baseline Cache | 200 MB | 24 hours |
| Worker Queue | 50 MB | 10 minutes |
| **Total** | **~410 MB** | - |

---

## 📁 Directory Structure

```bash
/var/www/hk-nova/              # Application root
├── .env.production            # Production environment (chmod 600)
├── .next/                     # Built application
├── node_modules/              # Dependencies
├── prisma/                    # Database schema & migrations
├── src/                       # Source code
├── scripts/                   # Deployment scripts
└── ecosystem.config.js        # PM2 configuration

/var/backups/hk-nova/          # Backup storage
├── db/                        # Database backups
├── configs/                   # Device config backups
└── logs/                      # Archived logs

/var/log/hk-nova/              # Application logs
├── web.out.log               # Web server stdout
├── web.err.log               # Web server stderr
├── icmp-worker.out.log       # ICMP worker logs
└── ...                       # Other worker logs

/etc/nginx/sites-available/    # Nginx configuration
└── hk-nova                   # Virtual host config

/etc/systemd/system/          # Systemd services (optional)
└── hk-nova.service           # Alternative to PM2
```

---

## 🔧 System Tuning

### Linux Kernel Parameters

**File:** `/etc/sysctl.conf`

```conf
# Network Performance
net.core.somaxconn = 1024
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_tw_reuse = 1

# File Descriptors
fs.file-max = 65536

# For ICMP ping (required for net-ping)
net.ipv4.ping_group_range = 0 2147483647
```

Apply changes:
```bash
sudo sysctl -p
```

### User Limits

**File:** `/etc/security/limits.conf`

```conf
*       soft    nofile  65536
*       hard    nofile  65536
*       soft    nproc   32768
*       hard    nproc   32768
```

---

## 📊 Monitoring & Observability

### Prometheus Setup

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'hk-nova'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/metrics'
    
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
      
  - job_name: 'mysql-exporter'
    static_configs:
      - targets: ['localhost:9104']
```

### Grafana Dashboards

**Recommended dashboards:**
1. **System Overview** - CPU, RAM, Disk, Network
2. **HK-NOVA Application** - Requests, latency, errors
3. **Database Performance** - Queries, connections, slow queries
4. **Worker Health** - Poll cycles, success rate, duration
5. **Alert Analytics** - Alert volume, MTTR, escalations
6. **Device Monitoring** - UP/DOWN status, latency trends

### Log Aggregation (Optional)

**ELK Stack / Loki:**
- Centralized logging
- Log search & analysis
- Alert on error patterns
- Retention: 30 days hot, 90 days archive

---

## 🌐 Network Requirements

### Outbound Connectivity

| Protocol | Port | Destination | Purpose |
|----------|------|-------------|---------|
| ICMP | - | Monitored devices | Device reachability |
| SNMP | 161/UDP | Network devices | Metrics collection |
| SSH | 22/TCP | OLT/ONT devices | Config backup |
| HTTPS | 443/TCP | api.telegram.org | Notifications |
| SMTP | 465/587 | SMTP server | Email alerts |
| HTTP | 80/443 | Webhook URLs | Slack/Discord |

### Inbound Connectivity

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 80 | HTTP | Users | Web UI (redirect to 443) |
| 443 | HTTPS | Users | Web UI (SSL) |
| 22 | SSH | Admins | Server management |

### Bandwidth Estimation

**For 500 devices:**
- ICMP polling (1 min): ~5 KB/device/min = 2.5 MB/min = ~150 MB/hour
- SNMP polling (5 min): ~20 KB/device/poll = 10 MB/poll = ~120 MB/hour
- **Total:** ~270 MB/hour = ~6.5 GB/day = ~195 GB/month

**Add 20% buffer:** ~240 GB/month for 500 devices

---

## 💰 Cost Estimation

### Cloud Hosting (Example: AWS)

| Component | Specification | Monthly Cost (USD) |
|-----------|--------------|-------------------|
| EC2 Instance | t3.xlarge (4 vCPU, 16GB RAM) | $120 |
| EBS Storage | 250 GB gp3 SSD | $20 |
| Backup Storage | 500 GB S3 | $12 |
| Data Transfer | 250 GB/month | $22 |
| RDS MySQL | db.t3.medium (2 vCPU, 4GB) | $60 |
| **Total** | | **~$234/month** |

### On-Premise Hosting

| Component | Specification | One-time Cost (USD) |
|-----------|--------------|---------------------|
| Server Hardware | Dell PowerEdge R340 | $2,500 |
| UPS | 1500VA | $300 |
| Network Switch | 24-port Gigabit | $200 |
| **Total** | | **~$3,000** |

**Break-even:** ~13 months

---

## ✅ Pre-Deployment Checklist

### Infrastructure
- [ ] Server provisioned (specs met)
- [ ] OS installed & updated
- [ ] Firewall configured
- [ ] SSL certificate installed
- [ ] DNS configured

### Software
- [ ] Node.js 20 installed
- [ ] MySQL 8.0 running
- [ ] Redis running
- [ ] PM2 installed
- [ ] Nginx configured (if used)

### Database
- [ ] Production database created
- [ ] Dedicated user created
- [ ] Migrations applied
- [ ] Backup script tested
- [ ] Cron job scheduled

### Security
- [ ] .env.production configured
- [ ] File permissions set
- [ ] Keys stored securely
- [ ] Admin password changed
- [ ] Firewall rules active

### Monitoring
- [ ] Prometheus installed
- [ ] Grafana dashboards created
- [ ] Alerts configured
- [ ] Log rotation setup

### Documentation
- [ ] Credentials documented
- [ ] Runbook reviewed
- [ ] Team trained
- [ ] Emergency contacts updated

---

## 📞 Support & Contacts

**Documentation:**
- Architecture: `docs/ARCHITECTURE.md`
- Deployment: `docs/DEPLOYMENT.md`
- Runbook: `RUNBOOK.md`

**Emergency Procedures:**
- Rollback: See `docs/DEPLOYMENT.md` section 7
- Incident Response: See `RUNBOOK.md` troubleshooting

---

**Document Maintained By:** DevOps Team  
**Next Review:** 2026-12-05  
**Change History:** Initial version (2026-09-05)
