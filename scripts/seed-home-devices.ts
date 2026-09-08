import { PrismaClient } from '@prisma/client';
import { encryptCredential } from '../src/lib/encryption';

const prisma = new PrismaClient();

async function main() {
  console.log('🏠 Seeding home devices...');

  const homeDevices = [
    {
      name: 'Home Router',
      ip: '192.168.1.1',
      type: 'ROUTER' as const,
      vendor: 'TP-Link',
      model: 'Archer AX6000',
      location: 'Home - Living Room',
      description: 'Main home router/gateway',
      enableIcmp: true,
      enableSnmp: false,
      isDemo: false,
    },
    {
      name: 'Home Lab Switch',
      ip: '192.168.1.10',
      type: 'SWITCH' as const,
      vendor: 'Mikrotik',
      model: 'CRS309',
      location: 'Home - Lab Room',
      description: 'Lab network switch',
      enableIcmp: true,
      enableSnmp: true,
      isDemo: false,
      snmpVersion: '2c' as const,
      snmpCommunity: 'public',
      snmpPort: 161,
      sshPort: 22,
      sshUsername: 'admin',
      sshPassword: '', // Fill with actual password
    },
    {
      name: 'Home Test Device',
      ip: '192.168.1.100',
      type: 'OTHER' as const,
      vendor: 'Raspberry Pi',
      model: 'Pi 4 Model B',
      location: 'Home - Lab',
      description: 'Raspberry Pi for testing',
      enableIcmp: true,
      enableSnmp: false,
      isDemo: false,
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const device of homeDevices) {
    const existing = await prisma.device.findUnique({
      where: { ip: device.ip },
    });

    if (existing) {
      console.log(`⏭️  Skipping ${device.name} (${device.ip}) - already exists`);
      skipped++;
      continue;
    }

    const data: any = {
      name: device.name,
      ip: device.ip,
      type: device.type,
      vendor: device.vendor,
      model: device.model,
      location: device.location,
      description: device.description,
      enableIcmp: device.enableIcmp,
      enableSnmp: device.enableSnmp,
      isDemo: device.isDemo,
    };

    if (device.snmpVersion) {
      data.snmpVersion = device.snmpVersion;
    }
    if (device.snmpCommunity) {
      data.snmpCommunity = await encryptCredential(device.snmpCommunity);
    }
    if (device.snmpPort) {
      data.snmpPort = device.snmpPort;
    }
    if (device.sshPort) {
      data.sshPort = device.sshPort;
    }
    if (device.sshUsername) {
      data.sshUsername = await encryptCredential(device.sshUsername);
    }
    if (device.sshPassword) {
      data.sshPassword = await encryptCredential(device.sshPassword);
    }

    await prisma.device.create({ data });
    console.log(`✅ Created: ${device.name} (${device.ip})`);
    created++;
  }

  console.log('\n📊 Summary:');
  console.log(`   Created: ${created} devices`);
  console.log(`   Skipped: ${skipped} devices (already exist)`);
  console.log('\n💡 Next steps:');
  console.log('   1. Update device IPs to match your home network');
  console.log('   2. Add SSH credentials via UI if needed');
  console.log('   3. Test connectivity: pnpm worker:icmp');
  console.log('   4. Access dashboard: http://localhost:3000/dashboard/devices');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding home devices:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
