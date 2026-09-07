import prisma from '@/lib/prisma';
import { ServiceType, CustomerStatus } from '@prisma/client';

async function seedCustomers() {
  console.log('🌱 Seeding test customers...');

  // Cari device MikroTik yang sudah ada
  const devices = await prisma.device.findMany({
    where: {
      OR: [
        { type: 'ROUTER' },
        { vendor: { contains: 'MikroTik' } },
      ],
    },
    take: 2,
  });

  if (devices.length === 0) {
    console.log('⚠️  No devices found. Please create a device first.');
    console.log('   You can add a MikroTik router via the UI or run device seed script.');
    return;
  }

  const device = devices[0];
  console.log(`✅ Using device: ${device.name} (${device.ip})`);

  // Test customers data
  const testCustomers = [
    {
      username: 'customer001',
      fullName: 'John Doe',
      phoneNumber: '08123456789',
      email: 'john.doe@example.com',
      address: 'Jl. Sudirman No. 123, Jakarta',
      serviceType: ServiceType.PPPOE,
      pppoePassword: 'SecurePass123!',
      pppoeProfile: '10Mbps',
      uploadSpeed: 10000,
      downloadSpeed: 10000,
      packageName: 'Paket 10Mbps',
      status: CustomerStatus.ACTIVE,
      isOnline: true,
      activationDate: new Date('2024-01-01'),
      billingCycle: 'MONTHLY',
      monthlyFee: 150000,
      deviceId: device.id,
      createdBy: 'seed-script',
      notes: 'Test customer - PPPoE',
    },
    {
      username: 'customer002',
      fullName: 'Jane Smith',
      phoneNumber: '08234567890',
      email: 'jane.smith@example.com',
      address: 'Jl. Thamrin No. 456, Jakarta',
      serviceType: ServiceType.PPPOE,
      pppoePassword: 'StrongPass456!',
      pppoeProfile: '20Mbps',
      uploadSpeed: 20000,
      downloadSpeed: 20000,
      packageName: 'Paket 20Mbps',
      status: CustomerStatus.ACTIVE,
      isOnline: false,
      activationDate: new Date('2024-02-01'),
      billingCycle: 'MONTHLY',
      monthlyFee: 250000,
      deviceId: device.id,
      createdBy: 'seed-script',
      notes: 'Test customer - PPPoE',
    },
    {
      username: 'customer003',
      fullName: 'Bob Wilson',
      phoneNumber: '08345678901',
      email: 'bob.wilson@example.com',
      address: 'Jl. Gatot Subroto No. 789, Jakarta',
      serviceType: ServiceType.DHCP,
      ipAddress: '192.168.1.100',
      macAddress: 'AA:BB:CC:DD:EE:01',
      dhcpServer: 'dhcp1',
      uploadSpeed: 50000,
      downloadSpeed: 50000,
      packageName: 'Paket Corporate 50Mbps',
      status: CustomerStatus.ACTIVE,
      isOnline: true,
      activationDate: new Date('2024-03-01'),
      billingCycle: 'MONTHLY',
      monthlyFee: 500000,
      deviceId: device.id,
      createdBy: 'seed-script',
      notes: 'Test customer - DHCP Corporate',
    },
    {
      username: 'customer004',
      fullName: 'Alice Brown',
      phoneNumber: '08456789012',
      serviceType: ServiceType.PPPOE,
      pppoePassword: 'TestPass789!',
      pppoeProfile: '10Mbps',
      uploadSpeed: 10000,
      downloadSpeed: 10000,
      packageName: 'Paket 10Mbps',
      status: CustomerStatus.SUSPENDED,
      isOnline: false,
      activationDate: new Date('2024-04-01'),
      expiryDate: new Date('2024-12-31'),
      billingCycle: 'MONTHLY',
      monthlyFee: 150000,
      deviceId: device.id,
      createdBy: 'seed-script',
      notes: 'Test customer - SUSPENDED (payment overdue)',
    },
    {
      username: 'customer005',
      fullName: 'Charlie Davis',
      phoneNumber: '08567890123',
      serviceType: ServiceType.PPPOE,
      pppoePassword: 'Demo12345!',
      pppoeProfile: '100Mbps',
      uploadSpeed: 100000,
      downloadSpeed: 100000,
      packageName: 'Paket Premium 100Mbps',
      status: CustomerStatus.PENDING,
      isOnline: false,
      activationDate: new Date(),
      billingCycle: 'MONTHLY',
      monthlyFee: 1000000,
      deviceId: device.id,
      createdBy: 'seed-script',
      notes: 'Test customer - PENDING (belum provisioned)',
    },
  ];

  // Create customers
  for (const customerData of testCustomers) {
    try {
      const existing = await prisma.customer.findUnique({
        where: { username: customerData.username },
      });

      if (existing) {
        console.log(`⏭️  Customer ${customerData.username} already exists, skipping...`);
        continue;
      }

      const customer = await prisma.customer.create({
        data: customerData,
      });

      console.log(`✅ Created customer: ${customer.username} (${customer.fullName})`);

      // Create initial provisioning log for ACTIVE customers
      if (customer.status === CustomerStatus.ACTIVE) {
        await prisma.customerProvisioningLog.create({
          data: {
            customerId: customer.id,
            action: 'CREATE',
            success: true,
            commandSent: `[SEED] Simulated provisioning for ${customer.username}`,
            response: 'Success',
            executedBy: 'seed-script',
          },
        });
      }

      // Create status history
      await prisma.customerStatusHistory.create({
        data: {
          customerId: customer.id,
          fromStatus: CustomerStatus.PENDING,
          toStatus: customer.status,
          reason: 'Initial seed',
          changedBy: 'seed-script',
        },
      });

    } catch (error) {
      console.error(`❌ Failed to create customer ${customerData.username}:`, error);
    }
  }

  console.log('');
  console.log('✅ Customer seeding completed!');
  console.log('');
  console.log('📊 Summary:');
  const total = await prisma.customer.count();
  const active = await prisma.customer.count({ where: { status: CustomerStatus.ACTIVE } });
  const suspended = await prisma.customer.count({ where: { status: CustomerStatus.SUSPENDED } });
  const pending = await prisma.customer.count({ where: { status: CustomerStatus.PENDING } });
  
  console.log(`   Total customers: ${total}`);
  console.log(`   Active: ${active}`);
  console.log(`   Suspended: ${suspended}`);
  console.log(`   Pending: ${pending}`);
  console.log('');
}

// Run seed
seedCustomers()
  .catch((error) => {
    console.error('Error seeding customers:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
