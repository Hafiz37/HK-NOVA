import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedAlertRules() {
  console.log('🌱 Seeding production Alert Rules...');

  const rules = [
    {
      name: 'High Latency Warning',
      metric: 'latency',
      operator: 'GT' as const,
      threshold: 300,
      severity: 'HIGH' as const,
      consecutiveSamples: 2,
      deviceScope: 'ALL' as const,
      enabled: true,
      cooldownMs: 300000,
    },
    {
      name: 'Critical Packet Loss',
      metric: 'packetLoss',
      operator: 'GT' as const,
      threshold: 20,
      severity: 'CRITICAL' as const,
      consecutiveSamples: 2,
      deviceScope: 'ALL' as const,
      enabled: true,
      cooldownMs: 300000,
    },
    {
      name: 'High Jitter Warning',
      metric: 'jitter',
      operator: 'GT' as const,
      threshold: 50,
      severity: 'MEDIUM' as const,
      consecutiveSamples: 3,
      deviceScope: 'ALL' as const,
      enabled: true,
      cooldownMs: 600000,
    },
  ];

  for (const r of rules) {
    const existing = await prisma.alertRule.findFirst({ where: { name: r.name } });
    if (!existing) {
      await prisma.alertRule.create({ data: r });
      console.log(`  ✓ Created rule: ${r.name}`);
    } else {
      console.log(`  - Rule already exists: ${r.name}`);
    }
  }

  const count = await prisma.alertRule.count();
  console.log(`✅ Total Alert Rules: ${count}`);
  await prisma.$disconnect();
}

seedAlertRules().catch(console.error);
