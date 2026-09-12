import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function verifyPhase8() {
  console.log('================================================================');
  console.log('       HK-NOVA PHASE 8: HIGH AVAILABILITY & DR VERIFICATION     ');
  console.log('================================================================\n');

  // 1. Nginx Configuration Check
  console.log('🌐 [1] NGINX REVERSE PROXY & SSL CONFIGURATION');
  const nginxConfPath = '/etc/nginx/sites-available/hk-nova';
  const nginxEnabledPath = '/etc/nginx/sites-enabled/hk-nova';

  if (fs.existsSync(nginxConfPath)) {
    console.log(`  - Nginx Config File       : ✅ EXISTS (${nginxConfPath})`);
    const confContent = fs.readFileSync(nginxConfPath, 'utf-8');
    const hasSSL = confContent.includes('listen 443 ssl');
    const hasSSE = confContent.includes('proxy_buffering off');
    const hasRateLimit = confContent.includes('limit_req_zone');
    const hasSecurityHeaders = confContent.includes('X-Frame-Options');
    console.log(`  - HTTPS/SSL Configured    : ${hasSSL ? '✅' : '❌'}`);
    console.log(`  - SSE Support (buffering) : ${hasSSE ? '✅' : '❌'}`);
    console.log(`  - Rate Limiting           : ${hasRateLimit ? '✅' : '❌'}`);
    console.log(`  - Security Headers        : ${hasSecurityHeaders ? '✅' : '❌'}`);
  } else {
    console.log(`  - Nginx Config File       : ⚠️ NOT DEPLOYED (run setup-nginx-ssl.sh)`);
  }

  if (fs.existsSync(nginxEnabledPath)) {
    console.log(`  - Site Enabled            : ✅`);
  } else {
    console.log(`  - Site Enabled            : ⚠️ NOT LINKED`);
  }

  // 2. Let's Encrypt Certificate Check
  console.log('\n🔐 [2] LET\'S ENCRYPT SSL CERTIFICATE');
  const letsEncryptLive = '/etc/letsencrypt/live';
  if (fs.existsSync(letsEncryptLive)) {
    const domains = fs.readdirSync(letsEncryptLive).filter(d => d !== 'README');
    if (domains.length > 0) {
      domains.forEach(domain => {
        const certPath = path.join(letsEncryptLive, domain, 'fullchain.pem');
        const keyPath = path.join(letsEncryptLive, domain, 'privkey.pem');
        if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
          // Check cert expiry
          try {
            const certInfo = execSync(`openssl x509 -in "${certPath}" -noout -enddate`, { encoding: 'utf-8' });
            const expiryMatch = certInfo.match(/notAfter=(.+)/);
            const expiry = expiryMatch ? expiryMatch[1] : 'Unknown';
            console.log(`  - Domain: ${domain} ✅ (Expires: ${expiry})`);
          } catch {
            console.log(`  - Domain: ${domain} ✅ (Cert found)`);
          }
        }
      });
    } else {
      console.log(`  - Certificates            : ⚠️ NO DOMAINS CONFIGURED`);
    }
  } else {
    console.log(`  - Let's Encrypt Dir       : ⚠️ NOT FOUND`);
  }

  // 3. Certbot Auto-Renewal Timer
  console.log('\n🔄 [3] CERTBOT AUTO-RENEWAL');
  try {
    const timerStatus = execSync('systemctl is-active certbot.timer', { encoding: 'utf-8' }).trim();
    console.log(`  - certbot.timer Status    : ${timerStatus === 'active' ? '✅ ACTIVE' : '❌ INACTIVE'}`);
  } catch {
    console.log(`  - certbot.timer Status    : ⚠️ NOT CONFIGURED`);
  }

  // 4. Offsite Backup Script Check
  console.log('\n☁️ [4] OFFSITE BACKUP AUTOMATION');
  const offsiteScript = path.join(process.cwd(), 'scripts/backup-offsite.sh');
  if (fs.existsSync(offsiteScript)) {
    console.log(`  - Offsite Backup Script   : ✅ EXISTS`);
    const scriptContent = fs.readFileSync(offsiteScript, 'utf-8');
    const hasRclone = scriptContent.includes('rclone');
    const hasRetention = scriptContent.includes('RETENTION_REMOTE');
    console.log(`  - rclone Integration      : ${hasRclone ? '✅' : '❌'}`);
    console.log(`  - Remote Retention Policy : ${hasRetention ? '✅' : '❌'}`);
  } else {
    console.log(`  - Offsite Backup Script   : ❌ MISSING`);
  }

  // Check rclone config
  try {
    const rcloneRemotes = execSync('rclone listremotes', { encoding: 'utf-8' }).trim();
    if (rcloneRemotes) {
      console.log(`  - rclone Remotes          : ✅ CONFIGURED (${rcloneRemotes.replace('\n', ', ')})`);
    } else {
      console.log(`  - rclone Remotes          : ⚠️ NO REMOTES CONFIGURED`);
    }
  } catch {
    console.log(`  - rclone                  : ⚠️ NOT INSTALLED OR CONFIGURED`);
  }

  // 5. MySQL Replication Status
  console.log('\n🗄️ [5] MYSQL REPLICATION (HA)');
  try {
    const slaveStatus = await prisma.$queryRaw<Array<any>>`SHOW SLAVE STATUS`;
    if (slaveStatus && slaveStatus.length > 0) {
      const status = slaveStatus[0];
      const ioRunning = status.Slave_IO_Running === 'Yes';
      const sqlRunning = status.Slave_SQL_Running === 'Yes';
      const lag = status.Seconds_Behind_Master ?? 0;
      console.log(`  - This Instance Role      : SLAVE`);
      console.log(`  - Slave_IO_Running        : ${ioRunning ? '✅ Yes' : '❌ No'}`);
      console.log(`  - Slave_SQL_Running       : ${sqlRunning ? '✅ Yes' : '❌ No'}`);
      console.log(`  - Replication Lag         : ${lag}s ${lag <= 1 ? '✅' : lag <= 10 ? '⚠️' : '❌'}`);
      console.log(`  - Master_Host             : ${status.Master_Host}`);
    } else {
      // Check if this is master
      const masterStatus = await prisma.$queryRaw<Array<any>>`SHOW MASTER STATUS`;
      if (masterStatus && masterStatus.length > 0) {
        console.log(`  - This Instance Role      : MASTER`);
        console.log(`  - Binlog File             : ${masterStatus[0].File}`);
        console.log(`  - Binlog Position         : ${masterStatus[0].Position}`);
      } else {
        console.log(`  - Replication             : ⚠️ NOT CONFIGURED`);
      }
    }
  } catch (e) {
    console.log(`  - Replication Check       : ❌ ERROR (${e instanceof Error ? e.message : 'Unknown'})`);
  }

  // 6. Local Backup Verification
  console.log('\n💾 [6] LOCAL BACKUP INTEGRITY');
  const backupDir = path.join(process.cwd(), 'backups');
  if (fs.existsSync(backupDir)) {
    const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.sql.gz')).sort().reverse();
    if (backups.length > 0) {
      const latest = backups[0];
      const stat = fs.statSync(path.join(backupDir, latest));
      const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
      console.log(`  - Latest Backup           : ${latest} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      console.log(`  - Backup Age              : ${ageHours.toFixed(1)} hours ${ageHours <= 24 ? '✅' : '⚠️'}`);
      console.log(`  - Total Backups           : ${backups.length}`);
    } else {
      console.log(`  - Backups                 : ⚠️ NO BACKUPS FOUND`);
    }
  } else {
    console.log(`  - Backup Directory        : ❌ NOT EXISTS`);
  }

  // 7. System Resource Health
  console.log('\n📊 [7] SYSTEM RESOURCE HEALTH');
  const memInfo = execSync('free -m', { encoding: 'utf-8' });
  const memLines = memInfo.trim().split('\n');
  const mem = memLines[1].split(/\s+/).map(Number);
  const memUsedPercent = ((mem[2] / mem[1]) * 100).toFixed(1);
  console.log(`  - Memory Usage            : ${memUsedPercent}% ${Number(memUsedPercent) < 85 ? '✅' : '⚠️'}`);

  const diskInfo = execSync('df -h /', { encoding: 'utf-8' });
  const diskLines = diskInfo.trim().split('\n');
  const diskUsage = diskLines[1].split(/\s+/)[4].replace('%', '');
  console.log(`  - Disk Usage (/)          : ${diskUsage}% ${Number(diskUsage) < 85 ? '✅' : '⚠️'}`);

  const loadInfo = execSync('uptime', { encoding: 'utf-8' });
  const loadMatch = loadInfo.match(/load average: ([\d.]+), ([\d.]+), ([\d.]+)/);
  if (loadMatch) {
    const load1 = parseFloat(loadMatch[1]);
    console.log(`  - Load Average (1m)       : ${load1} ${load1 < 4 ? '✅' : '⚠️'}`);
  }

  console.log('\n================================================================');
  console.log('✅ PHASE 8 VERIFICATION COMPLETED');
  console.log('================================================================\n');
}

verifyPhase8()
  .catch((err) => {
    console.error('Phase 8 Verification Failed:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });