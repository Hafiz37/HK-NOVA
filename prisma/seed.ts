import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const passwordHash = await bcrypt.hash('admin123', 10);
  
  const user = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      email: 'admin@hknova.local',
      fullName: 'Administrator',
    },
  });

  console.log('✅ User created:', user.username);

  const initialDevices = [
    {
      name: 'Google Public DNS (Reachable)',
      ip: '8.8.8.8',
      type: 'ROUTER' as const,
      vendor: 'Google',
      model: 'DNS Core',
      location: 'Global Anycast',
      status: 'UNKNOWN' as const,
      description: 'Public DNS reachable untuk pengujian ICMP ping live',
    },
    {
      name: 'Cloudflare Public DNS (Reachable)',
      ip: '1.1.1.1',
      type: 'SERVER' as const,
      vendor: 'Cloudflare',
      model: '1.1.1.1 Service',
      location: 'Global Anycast',
      status: 'UNKNOWN' as const,
      description: 'Cloudflare DNS reachable untuk demo status UP',
    },
    {
      name: 'Localhost Node (Reachable)',
      ip: '127.0.0.1',
      type: 'SERVER' as const,
      vendor: 'Local',
      model: 'Loopback',
      location: 'Local Datacenter',
      status: 'UNKNOWN' as const,
      description: 'Local loopback interface untuk verifikasi latency minimal',
    },
    {
      name: 'Core Router Jakarta (Fiktif Demo)',
      ip: '10.10.1.1',
      type: 'ROUTER' as const,
      vendor: 'Cisco',
      model: 'ASR1000',
      location: 'DC Jakarta',
      status: 'UNKNOWN' as const,
      description: 'Core router demo (IP private tidak reachable -> status DOWN)',
    },
    {
      name: 'Distribution Switch Bandung (Fiktif Demo)',
      ip: '10.10.2.1',
      type: 'SWITCH' as const,
      vendor: 'Juniper',
      model: 'EX4300',
      location: 'DC Bandung',
      status: 'UNKNOWN' as const,
      description: 'Distribution switch demo (IP private tidak reachable)',
    },
    {
      name: 'OLT Surabaya 1 (Fiktif Demo)',
      ip: '10.10.3.1',
      type: 'OLT' as const,
      vendor: 'ZTE',
      model: 'C320',
      location: 'POP Surabaya',
      status: 'UNKNOWN' as const,
      description: 'OLT demo (IP private tidak reachable)',
    },
  ];

  for (const d of initialDevices) {
    const device = await prisma.device.upsert({
      where: { ip: d.ip },
      update: {
        name: d.name,
        type: d.type,
        vendor: d.vendor,
        model: d.model,
        location: d.location,
        description: d.description,
      },
      create: d,
    });

    // Create default SNMP credential for device
    await prisma.credential.upsert({
      where: { deviceId: device.id },
      update: {},
      create: {
        deviceId: device.id,
        snmpVersion: 'v2c',
        snmpCommunity: 'public',
      },
    });

    // Seed sample SNMP metric history for realistic UI testing
    const count = await prisma.metric.count({
      where: { deviceId: device.id, metricType: 'SNMP' },
    });

    if (count === 0) {
      const now = Date.now();
      const mockMetrics = Array.from({ length: 12 }, (_, i) => {
        const ts = new Date(now - (11 - i) * 5 * 60 * 1000);
        const baseCpu = d.type === 'ROUTER' ? 45 : d.type === 'SWITCH' ? 30 : 60;
        const baseMem = d.type === 'ROUTER' ? 55 : d.type === 'SWITCH' ? 40 : 70;
        return {
          deviceId: device.id,
          metricType: 'SNMP',
          timestamp: ts,
          cpuUtil: Math.min(100, Math.max(5, baseCpu + (Math.random() * 20 - 10))),
          memUtil: Math.min(100, Math.max(5, baseMem + (Math.random() * 10 - 5))),
          interfaceData: [
            { index: 1, name: 'eth0', operStatus: 1, speed: 1000000000, inOctets: 1542000 + i * 50000, outOctets: 3241000 + i * 120000, inErrors: 0, outErrors: 0 },
            { index: 2, name: 'eth1', operStatus: 1, speed: 1000000000, inOctets: 890000 + i * 30000, outOctets: 1200000 + i * 40000, inErrors: 0, outErrors: 0 },
          ],
        };
      });

      await prisma.metric.createMany({
        data: mockMetrics,
      });
    }
  }

  console.log('✅ Devices, Credentials, and SNMP Metrics seeded successfully!');
  console.log('');
  console.log('📝 Login credentials:');
  console.log('   Username: admin');
  console.log('   Password: admin123');
  console.log('');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
