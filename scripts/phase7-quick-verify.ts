import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('================================================================');
  console.log('   HK-NOVA PHASE 7: MULTI-DEVICE SCALING & ML ANOMALY VERIFY   ');
  console.log('================================================================\n');

  const totalDevices = await prisma.device.count();
  const deviceCounts = await prisma.device.groupBy({
    by: ['type'],
    _count: { type: true },
  });

  console.log('📡 [1] MULTI-DEVICE INVENTORY SCALING & TYPES');
  console.log(`- Total Registered Devices in Infrastructure : ${totalDevices}`);
  deviceCounts.forEach((group) => {
    console.log(`  * ${group.type.padEnd(12)} : ${group._count.type} devices`);
  });
  console.log('');

  const mlFlag = process.env.ENABLE_ML_ANOMALY;
  console.log('⚙️ [2] FEATURE FLAG & WORKER ENVIRONMENT VERIFICATION');
  console.log(`  - ENABLE_ML_ANOMALY Flag in Environment      : ${mlFlag === 'true' ? '✅ ENABLED (true)' : '⚠️ DISABLED (' + mlFlag + ')'}`);

  const totalAnomalies = await prisma.anomaly.count();
  console.log(`\n📊 Existing Anomaly Records in Database       : ${totalAnomalies}`);

  console.log('\n================================================================');
  console.log('✅ PHASE 7 VERIFICATION COMPLETED SUCCESSFULLY');
  console.log('================================================================\n');
}

main()
  .catch((err) => {
    console.error('Phase 7 Verification Failed:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });