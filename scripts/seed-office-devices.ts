import { PrismaClient } from '@prisma/client';
import { encryptCredential } from '../src/lib/encryption';

const prisma = new PrismaClient();

async function main() {
  console.log('🏢 Seeding office devices...');

  const officeDevices = [
    {
      name: 'Office Router - Gateway',
      ip: '192.168.10.1',
      type: 'ROUTER' as const,
      vendor: 'Mikrotik',
      model: 'RB4011',
      location: 'Office - Main Room',
      description: 'Main gateway router for office network',
      enableIcmp: true,
      enableSnmp: false,
      isDemo: false,
      sshPort: 22,
      sshUsername: 'admin',
      sshPassword: '', // Fill with actual password when deploying
    },
    {
      name: 'Office Switch - Floor 1',
      ip: '192.168.10.2',
      type: 'SWITCH' as const,
      vendor: 'Mikrotik',
      model: 'CRS328',
      location: 'Office - Floor 1',
      description: 'Main switch for floor 1',
      enableIcmp: true,
      enableSnmp: true,
      isDemo: false,
      snmpVersion: '2c' as const,
      snmpCommunity: 'public',
      snmpPort: 161,
    },
    {
      name: 'Office OLT - Main',
      ip: '192.168.10.10',
      type: 'OLT' as const,
      vendor: 'Huawei',
      model: 'MA5608T',
      location: 'Office - Server Room',
      description: 'Main OLT for fiber customers',
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
      name: 'Office Access Point',
      ip: '192.168.10.20',
      type: 'OTHER' as const,
      vendor: 'Ubiquiti',
      model: 'UniFi AC Pro',
      location: 'Office - Ceiling',
      description: 'WiFi Access Point',
      enableIcmp: true,
      enableSnmp: false,
      isDemo: false,
    },
    {
      name: 'Office Firewall',
      ip: '192.168.10.254',
      type: 'ROUTER' as const,
      vendor: 'Mikrotik',
      model: 'CCR1036',
      location: 'Office - Server Room',
      description: 'Edge firewall and traffic shaper',
      enableIcmp: true,
      enableSnmp: true,
      isDemo: false,
      snmpVersion: '2c' as const,
      snmpCommunity: 'public',
      snmpPort: 161,
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const device of officeDevices) {
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
  console.log('   1. Update SSH passwords in .env.office or via UI');
  console.log('   2. Verify IP addresses match your office network');
  console.log('   3. Test connectivity: pnpm worker:icmp');
  console.log('   4. Access dashboard: http://localhost:3000/dashboard/devices');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding office devices:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
