import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDeviceCount() {
  try {
    const count = await prisma.device.count();
    console.log(`Current devices in database: ${count}`);
    
    if (count < 200) {
      console.log(`⚠️  Need ${200 - count} more devices for large-scale testing`);
    } else {
      console.log(`✅ Sufficient devices for testing (${count} devices)`);
    }
    
    return count;
  } catch (error) {
    console.error('Error checking device count:', error);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

checkDeviceCount();
