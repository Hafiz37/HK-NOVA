import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  Clearing non-demo devices...');

  const result = await prisma.device.deleteMany({
    where: {
      isDemo: false,
    },
  });

  console.log(`✅ Deleted ${result.count} non-demo devices`);
  console.log('\n💡 Demo devices are preserved');
  console.log('   Run pnpm seed:office or pnpm seed:home to add new devices');
}

main()
  .catch((e) => {
    console.error('❌ Error clearing devices:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
