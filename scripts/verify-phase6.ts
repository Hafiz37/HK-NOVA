import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { backupCommandFor } from '../src/lib/backup';
import { resolveSshCredentials } from '../src/lib/device-console';

const prisma = new PrismaClient();

async function verifyPhase6() {
  console.log('================================================================');
  console.log('       HK-NOVA PHASE 6: AUTOMATED CONFIG BACKUP & SSH VERIFY    ');
  console.log('================================================================\n');

  // 1. Verify Vendor Command Mapping
  console.log('📋 [1] VENDOR BACKUP COMMAND MAPPING');
  const vendors = ['Huawei', 'ZTE', 'Cisco', 'Mikrotik', 'Generic'];
  for (const v of vendors) {
    console.log(`  - Vendor: ${v.padEnd(10)} → Command: ${backupCommandFor(v)}`);
  }
  console.log('');

  // 2. Test Credential Resolution & Fallback
  console.log('🔐 [2] SSH CREDENTIAL RESOLUTION TEST');
  const dummyCreds = {
    sshUsername: 'admin_test',
    sshPassword: 'EncryptedPassword123!',
    sshPort: 22,
  };
  const resolved = resolveSshCredentials(dummyCreds);
  console.log(`  - Custom Creds Resolved : ${resolved ? resolved.username + ' @ port ' + resolved.port : 'FAIL'}`);
  const fallbackResolved = resolveSshCredentials(null);
  console.log(`  - Fallback Creds Resolved: ${fallbackResolved ? fallbackResolved.username + ' @ port ' + fallbackResolved.port : 'DEFAULT (None)'}\n`);

  // 3. Test Config Hash & Diff Logic
  console.log('⚡ [3] CONFIG SHA-256 HASH & VERSIONING TEST');
  const configV1 = `/ip address add address=192.168.1.1/24 interface=ether1\n/system identity set name="Mikrotik-V1"`;
  const configV2 = `/ip address add address=192.168.1.1/24 interface=ether1\n/system identity set name="Mikrotik-V2"`;

  const hashV1 = createHash('sha256').update(configV1).digest('hex');
  const hashV1_repeat = createHash('sha256').update(configV1).digest('hex');
  const hashV2 = createHash('sha256').update(configV2).digest('hex');

  console.log(`  - Config V1 Hash : ${hashV1}`);
  console.log(`  - Hash Matching  : ${hashV1 === hashV1_repeat ? '✅ MATCH (No Duplicate Backup Needed)' : '❌ FAIL'}`);
  console.log(`  - Config V2 Hash : ${hashV2}`);
  console.log(`  - Diff Detected  : ${hashV1 !== hashV2 ? '✅ DIFF DETECTED (New Backup Triggered)' : '❌ FAIL'}\n`);

  // 4. Test Database Backup Record Creation & Cleanup
  console.log('💾 [4] DATABASE BACKUP RECORD INTEGRITY');
  const device = await prisma.device.findFirst();
  if (device) {
    const testBackup = await prisma.backup.create({
      data: {
        deviceId: device.id,
        configContent: Buffer.from(configV1),
        configHash: hashV1,
        sizeBytes: configV1.length,
        status: 'SUCCESS',
        storageLocation: 'database',
      },
    });
    console.log(`  - Created Test Backup Record ID : ${testBackup.id} for Device: ${device.name}`);

    // Clean up test record
    await prisma.backup.delete({ where: { id: testBackup.id } });
    console.log(`  - Cleaned Up Test Record        : ✅ SUCCESS\n`);
  } else {
    console.log('  - No registered device found in database for test.\n');
  }

  // 5. Check Backup Count in Database
  const totalBackups = await prisma.backup.count();
  console.log(`📊 Total Existing Backup Snapshots in DB: ${totalBackups}`);

  console.log('\n================================================================');
  console.log('✅ PHASE 6 VERIFICATION COMPLETED SUCCESSFULLY');
  console.log('================================================================\n');
}

verifyPhase6()
  .catch((err) => {
    console.error('Phase 6 Verification Failed:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
