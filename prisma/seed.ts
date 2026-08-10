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

  const devices = await prisma.device.createMany({
    data: [
      {
        name: 'Core Router Jakarta',
        ip: '10.10.1.1',
        type: 'ROUTER',
        vendor: 'Cisco',
        model: 'ASR1000',
        location: 'DC Jakarta',
        status: 'UNKNOWN',
        description: 'Core router untuk backbone Jakarta',
      },
      {
        name: 'Distribution Switch Bandung',
        ip: '10.10.2.1',
        type: 'SWITCH',
        vendor: 'Juniper',
        model: 'EX4300',
        location: 'DC Bandung',
        status: 'UNKNOWN',
        description: 'Distribution switch DC Bandung',
      },
      {
        name: 'OLT Surabaya 1',
        ip: '10.10.3.1',
        type: 'OLT',
        vendor: 'ZTE',
        model: 'C320',
        location: 'POP Surabaya',
        status: 'UNKNOWN',
        description: 'OLT untuk area Surabaya Timur',
      },
      {
        name: 'OLT Yogyakarta 1',
        ip: '10.10.4.1',
        type: 'OLT',
        vendor: 'Huawei',
        model: 'MA5608T',
        location: 'POP Yogyakarta',
        status: 'UNKNOWN',
        description: 'OLT untuk area Yogyakarta Kota',
      },
      {
        name: 'Firewall Edge Jakarta',
        ip: '10.10.5.1',
        type: 'FIREWALL',
        vendor: 'Fortinet',
        model: 'FortiGate 600E',
        location: 'DC Jakarta',
        status: 'UNKNOWN',
        description: 'Firewall edge untuk DC Jakarta',
      },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Devices created:', devices.count);

  console.log('✅ Seeding completed!');
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
