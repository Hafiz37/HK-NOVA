import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestDevicesSimple() {
  try {
    console.log('🚀 Creating test devices for load testing...');
    
    const currentCount = await prisma.device.count();
    console.log(`Current device count: ${currentCount}`);
    
    const targetCount = 250;
    const needToCreate = targetCount - currentCount;
    
    if (needToCreate <= 0) {
      console.log(`✅ Already have ${currentCount} devices (target: ${targetCount})`);
      return;
    }
    
    console.log(`Creating ${needToCreate} new devices...`);
    
    const deviceTypes = ['ROUTER', 'SWITCH', 'OLT', 'ONT', 'FIREWALL', 'SERVER'];
    const vendors = ['MikroTik', 'Cisco Systems', 'Huawei Technologies', 'Juniper Networks', 'HP Enterprise', 'Arista Networks'];
    const regions = ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Bali', 'Makassar', 'Semarang', 'Palembang'];
    const statuses = ['UP', 'DOWN', 'UNKNOWN', 'MAINTENANCE'];
    
    let created = 0;
    
    for (let i = 0; i < needToCreate; i++) {
      const deviceNum = currentCount + i + 1;
      const deviceType = deviceTypes[i % deviceTypes.length];
      const vendor = vendors[i % vendors.length];
      const region = regions[i % regions.length];
      const status = statuses[i % statuses.length];
      
      try {
        await prisma.device.create({
          data: {
            name: `${vendor.split(' ')[0]}-${deviceType}-${region}-${String(deviceNum).padStart(4, '0')}`,
            type: deviceType as any,
            vendor: vendor,
            ip: `10.${Math.floor(deviceNum / 256)}.${(deviceNum % 256)}.${Math.floor(Math.random() * 254) + 1}`,
            status: status as any,
            location: region,
            description: `Test device for load testing - ${deviceType} by ${vendor} in ${region}`,
          },
        });
        
        created++;
        
        if (created % 10 === 0) {
          console.log(`  ✓ Created ${created}/${needToCreate} devices...`);
        }
      } catch (error: any) {
        if (error.code === 'P2002') {
          // Duplicate IP, try different one
          console.log(`  ⚠️  Duplicate IP, skipping device ${deviceNum}`);
          continue;
        }
        throw error;
      }
    }
    
    const finalCount = await prisma.device.count();
    console.log(`\n✅ Device creation complete!`);
    console.log(`   Created: ${created} devices`);
    console.log(`   Total: ${finalCount} devices`);
    
  } catch (error) {
    console.error('❌ Error creating devices:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createTestDevicesSimple();
