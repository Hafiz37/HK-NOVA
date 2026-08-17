import prisma from './prisma';

/**
 * Cek apakah sebuah perangkat sedang berada dalam jendela pemeliharaan aktif.
 * Mencocokkan jadwal per-perangkat ATAU jadwal global (deviceId = null).
 */
export async function isDeviceInMaintenance(deviceId: string, timestamp: Date = new Date()): Promise<boolean> {
  const window = await prisma.maintenanceWindow.findFirst({
    where: {
      OR: [{ deviceId }, { deviceId: null }],
      isActive: true,
      startAt: { lte: timestamp },
      endAt: { gte: timestamp },
    },
  });

  return window !== null;
}
