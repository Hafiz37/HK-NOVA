import { PrismaClient, DeviceType, UserRole } from '@prisma/client';
import { beforeAll, afterAll, vi } from 'vitest';
import { createHmac } from 'crypto';

export const prisma = new PrismaClient();

// Global test timeout
vi.setConfig({ testTimeout: 30000 });

beforeAll(async () => {
  // Ensure database connection
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Helper to clean test data
export async function cleanTestData() {
  // Delete in order of foreign key dependencies
  await prisma.maintenanceWindow.deleteMany({
    where: { OR: [{ deviceId: { startsWith: 'test-' } }, { deviceId: null }] },
  });
  await prisma.metric.deleteMany({ where: { deviceId: { startsWith: 'test-' } } });
  await prisma.alert.deleteMany({ where: { deviceId: { startsWith: 'test-' } } });
  await prisma.backup.deleteMany({ where: { deviceId: { startsWith: 'test-' } } });
  await prisma.provisioningLog.deleteMany({ where: { deviceId: { startsWith: 'test-' } } });
  await prisma.anomaly.deleteMany({ where: { deviceId: { startsWith: 'test-' } } });
  await prisma.credential.deleteMany({ where: { deviceId: { startsWith: 'test-' } } });
  await prisma.device.deleteMany({ where: { id: { startsWith: 'test-' } } });
  // Safety net: hapus leftover non-demo di rentang IP test (10.200.x.y) dari run yang terputus
  await prisma.device.deleteMany({ where: { isDemo: false, ip: { startsWith: '10.200.' } } });
}

// Helper to generate unique test IP (10.200.x.y) to avoid conflicts with demo devices
let deviceIpGlobalCounter = 0;
export function uniqueTestIp(): string {
  deviceIpGlobalCounter++;
  const octet3 = Math.floor(deviceIpGlobalCounter / 255) % 255;
  const octet4 = deviceIpGlobalCounter % 255;
  return `10.200.${octet3}.${octet4}`;
}

// Helper to create test device with unique IP to avoid conflicts
export async function createTestDevice(overrides: Partial<{
  name: string;
  ip: string;
  type: DeviceType;
  vendor: string;
  location: string;
}> = {}) {
  // Retry logic for unique constraint errors
  for (let attempt = 0; attempt < 5; attempt++) {
    const ip = overrides.ip ?? uniqueTestIp();
    const uniqueId = `${Date.now()}-${deviceIpGlobalCounter}-${attempt}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const device = await prisma.device.create({
        data: {
          id: `test-${uniqueId}`,
          name: overrides.name ?? `Test Device ${uniqueId}`,
          ip,
          type: overrides.type ?? 'ROUTER',
          vendor: overrides.vendor ?? 'TestVendor',
          location: overrides.location ?? 'TestLocation',
          status: 'UNKNOWN',
        },
      });
      return device;
    } catch (error: unknown) {
      const prismaError = error as { code?: string; meta?: { target?: string } };
      if (prismaError.code === 'P2002' && prismaError.meta?.target === 'Device_ip_key') {
        // IP collision, retry with next counter value (unless user explicitly overrode the IP)
        if (overrides.ip) {
          throw error;
        }
        continue;
      }
      throw error;
    }
  }
  throw new Error('Failed to create test device after 5 attempts due to IP conflicts');
}

// Helper to create test user
export async function createTestUser(overrides: Partial<{
  username: string;
  password: string;
  role: UserRole;
}> = {}) {
  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash(overrides.password ?? 'testpass123', 10);

  const user = await prisma.user.create({
    data: {
      id: `test-user-${Date.now()}`,
      username: overrides.username ?? `testuser${Date.now()}`,
      passwordHash,
      role: overrides.role ?? 'OPERATOR',
    },
  });
  return user;
}

// Helper to create session token
export function createTestSessionToken(username: string): string {
  const secret = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || 'dev-insecure-secret';
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const body = Buffer.from(JSON.stringify({ u: username, exp }), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return `${body}.${sig}`;
}