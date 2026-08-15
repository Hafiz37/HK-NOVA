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
  await prisma.metric.deleteMany({ where: { deviceId: { startsWith: 'test-' } } });
  await prisma.alert.deleteMany({ where: { deviceId: { startsWith: 'test-' } } });
  await prisma.backup.deleteMany({ where: { deviceId: { startsWith: 'test-' } } });
  await prisma.provisioningLog.deleteMany({ where: { deviceId: { startsWith: 'test-' } } });
  await prisma.anomaly.deleteMany({ where: { deviceId: { startsWith: 'test-' } } });
  await prisma.credential.deleteMany({ where: { deviceId: { startsWith: 'test-' } } });
  await prisma.device.deleteMany({ where: { id: { startsWith: 'test-' } } });
}

// Helper to create test device with unique IP to avoid conflicts
let deviceIpGlobalCounter = 0;
export async function createTestDevice(overrides: Partial<{
  name: string;
  ip: string;
  type: DeviceType;
  vendor: string;
  location: string;
}> = {}) {
  // Retry logic for unique constraint errors
  for (let attempt = 0; attempt < 5; attempt++) {
    deviceIpGlobalCounter++;
    const uniqueId = `${Date.now()}-${deviceIpGlobalCounter}-${Math.random().toString(36).slice(2, 8)}`;
    // Use 10.200.x.x range to avoid conflicts with demo devices (10.10.x.x)
    const octet3 = Math.floor(deviceIpGlobalCounter / 255) % 255;
    const octet4 = deviceIpGlobalCounter % 255;
    try {
      const device = await prisma.device.create({
        data: {
          id: `test-${uniqueId}`,
          name: overrides.name ?? `Test Device ${uniqueId}`,
          ip: overrides.ip ?? `10.200.${octet3}.${octet4}`,
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
        // IP collision, retry with next counter value
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