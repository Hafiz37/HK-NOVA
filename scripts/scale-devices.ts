import { PrismaClient, DeviceType, DeviceStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function scaleDevices(targetCount: number) {
  const currentCount = await prisma.device.count();
  console.log(`🚀 Current devices: ${currentCount}, Target: ${targetCount}`);

  const needToCreate = targetCount - currentCount;
  if (needToCreate <= 0) {
    console.log(`✅ Already at or above target (${currentCount}/${targetCount})`);
    return;
  }

  const deviceTypes = [DeviceType.ROUTER, DeviceType.SWITCH, DeviceType.OLT];
  const vendors = ['MikroTik', 'Cisco', 'Huawei', 'Juniper', 'ZTE', 'HP', 'Arista'];
  const locations = ['Jakarta-DC1', 'Surabaya-DC', 'Bandung-POP', 'Medan-POP', 'Makassar-POP', 'Semarang-POP', 'Palembang-POP', 'Bali-POP'];

  let created = 0;
  let idx = 0;
  while (created < needToCreate && idx < 500) {
    idx++;
    const num = currentCount + idx;
    const type = deviceTypes[idx % deviceTypes.length];
    const vendor = vendors[idx % vendors.length];
    const location = locations[idx % locations.length];

    const subnet = Math.floor(num / 250);
    const host = (num % 250) + 1;
    const ip = `10.${100 + subnet}.1.${host}`;

    try {
      await prisma.device.create({
        data: {
          name: `${type}-${vendor}-${location.split('-')[0]}-${String(num).padStart(3, '0')}`,
          ip,
          type,
          vendor,
          location,
          status: DeviceStatus.UNKNOWN,
          description: `Phase 4 Scale Device #${num} (${type} - ${vendor})`,
        },
      });
      created++;
    } catch (e: any) {
      if (e.code === 'P2002') {
        continue;
      }
      throw e;
    }
  }

  const newCount = await prisma.device.count();
  console.log(`✅ Created ${created} new devices. Total now: ${newCount}`);
  await prisma.$disconnect();
}

const target = parseInt(process.argv[2] || '100', 10);
scaleDevices(target).catch((e) => {
  console.error(e);
  process.exit(1);
});
