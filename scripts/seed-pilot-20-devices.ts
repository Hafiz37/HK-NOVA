import { PrismaClient, DeviceType, DeviceStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPilotDevices() {
  console.log('🚀 Seeding 20 Pilot Devices for Phase 3...');

  // Clear existing metrics and devices
  await prisma.metric.deleteMany({});
  await prisma.device.deleteMany({});

  const pilotDevices = [
    // 10 Routers
    { name: 'Router-Mikrotik-Core-Jkt', ip: '127.0.0.1', type: DeviceType.ROUTER, vendor: 'MikroTik', location: 'Jakarta-DC1', status: DeviceStatus.UP },
    { name: 'Router-Mikrotik-Edge-Sby', ip: '8.8.8.8', type: DeviceType.ROUTER, vendor: 'MikroTik', location: 'Surabaya-DC', status: DeviceStatus.UP },
    { name: 'Router-Cisco-ASR-Bdg', ip: '1.1.1.1', type: DeviceType.ROUTER, vendor: 'Cisco', location: 'Bandung-POP', status: DeviceStatus.UP },
    { name: 'Router-Juniper-MX-Mdn', ip: '9.9.9.9', type: DeviceType.ROUTER, vendor: 'Juniper', location: 'Medan-POP', status: DeviceStatus.UP },
    { name: 'Router-Huawei-NE-Mks', ip: '8.8.4.4', type: DeviceType.ROUTER, vendor: 'Huawei', location: 'Makassar-POP', status: DeviceStatus.UP },
    { name: 'Router-Mikrotik-Dist-Smg', ip: '10.10.1.1', type: DeviceType.ROUTER, vendor: 'MikroTik', location: 'Semarang-POP', status: DeviceStatus.UNKNOWN },
    { name: 'Router-Cisco-ISR-Plb', ip: '10.10.1.2', type: DeviceType.ROUTER, vendor: 'Cisco', location: 'Palembang-POP', status: DeviceStatus.UNKNOWN },
    { name: 'Router-Mikrotik-Dist-Bpn', ip: '10.10.1.3', type: DeviceType.ROUTER, vendor: 'MikroTik', location: 'Balikpapan-POP', status: DeviceStatus.UNKNOWN },
    { name: 'Router-Juniper-SRX-Bli', ip: '10.10.1.4', type: DeviceType.ROUTER, vendor: 'Juniper', location: 'Bali-POP', status: DeviceStatus.UNKNOWN },
    { name: 'Router-Huawei-AR-Mnl', ip: '10.10.1.5', type: DeviceType.ROUTER, vendor: 'Huawei', location: 'Manado-POP', status: DeviceStatus.UNKNOWN },

    // 6 Switches
    { name: 'Switch-Cisco-Cat-Jkt-1', ip: '10.20.1.1', type: DeviceType.SWITCH, vendor: 'Cisco', location: 'Jakarta-DC1', status: DeviceStatus.UNKNOWN },
    { name: 'Switch-HP-ProCurve-Bdg-1', ip: '10.20.1.2', type: DeviceType.SWITCH, vendor: 'HP', location: 'Bandung-POP', status: DeviceStatus.UNKNOWN },
    { name: 'Switch-Arista-7050-Sby-1', ip: '10.20.1.3', type: DeviceType.SWITCH, vendor: 'Arista', location: 'Surabaya-DC', status: DeviceStatus.UNKNOWN },
    { name: 'Switch-Cisco-Cat-Mdn-1', ip: '10.20.1.4', type: DeviceType.SWITCH, vendor: 'Cisco', location: 'Medan-POP', status: DeviceStatus.UNKNOWN },
    { name: 'Switch-Huawei-S5700-Mks-1', ip: '10.20.1.5', type: DeviceType.SWITCH, vendor: 'Huawei', location: 'Makassar-POP', status: DeviceStatus.UNKNOWN },
    { name: 'Switch-Arista-7010-Smg-1', ip: '10.20.1.6', type: DeviceType.SWITCH, vendor: 'Arista', location: 'Semarang-POP', status: DeviceStatus.UNKNOWN },

    // 4 OLTs
    { name: 'OLT-Huawei-MA5800-Jkt', ip: '10.30.1.1', type: DeviceType.OLT, vendor: 'Huawei', location: 'Jakarta-DC1', status: DeviceStatus.UNKNOWN },
    { name: 'OLT-ZTE-C300-Sby', ip: '10.30.1.2', type: DeviceType.OLT, vendor: 'ZTE', location: 'Surabaya-DC', status: DeviceStatus.UNKNOWN },
    { name: 'OLT-Huawei-MA5608T-Bdg', ip: '10.30.1.3', type: DeviceType.OLT, vendor: 'Huawei', location: 'Bandung-POP', status: DeviceStatus.UNKNOWN },
    { name: 'OLT-ZTE-C320-Mdn', ip: '10.30.1.4', type: DeviceType.OLT, vendor: 'ZTE', location: 'Medan-POP', status: DeviceStatus.UNKNOWN },
  ];

  for (const d of pilotDevices) {
    await prisma.device.create({
      data: {
        name: d.name,
        ip: d.ip,
        type: d.type,
        vendor: d.vendor,
        location: d.location,
        status: d.status,
        description: `Pilot device for Phase 3 (${d.type} - ${d.vendor} in ${d.location})`,
      },
    });
  }

  const count = await prisma.device.count();
  console.log(`✅ Successfully seeded ${count} Pilot Devices!`);
  await prisma.$disconnect();
}

seedPilotDevices().catch((e) => {
  console.error(e);
  process.exit(1);
});
