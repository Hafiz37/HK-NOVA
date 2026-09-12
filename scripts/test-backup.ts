import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testBackup() {
  console.log('🧪 Testing Backup Creation...');

  const devices = await prisma.device.findMany({ take: 5 });
  if (devices.length === 0) {
    console.log('No devices found!');
    return;
  }

  let created = 0;
  for (const d of devices) {
    const text = `# Configuration for ${d.name}\nsystem identity set name="${d.name}"\n/ip address add address=${d.ip}/24 interface=ether1`;
    await prisma.backup.create({
      data: {
        deviceId: d.id,
        configContent: Buffer.from(text),
        configHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        sizeBytes: text.length,
        status: 'SUCCESS',
        storageLocation: 'database',
      },
    });
    created++;
  }

  console.log(`✅ Created ${created} test backup records in database.`);
  await prisma.$disconnect();
}

testBackup().catch(console.error);
