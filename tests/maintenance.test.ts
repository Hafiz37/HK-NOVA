import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from './setup';
import { createTestAgent, loginAndGetToken } from './utils';
import { createTestDevice, cleanTestData } from './setup';

describe('Maintenance Windows API Integration Tests', () => {
  let adminToken: string;
  let testDeviceIds: string[] = [];

  beforeAll(async () => {
    adminToken = await loginAndGetToken('admin', 'admin123');
  });

  afterAll(async () => {
    for (const id of testDeviceIds) {
      try {
        await prisma.device.delete({ where: { id } });
      } catch {
        // ignore
      }
    }
  });

  beforeEach(async () => {
    await cleanTestData();
    testDeviceIds = [];
  });

  const adminAgent = () => createTestAgent({ token: adminToken });

  describe('GET /api/maintenance-windows', () => {
    it('should return list of maintenance windows', async () => {
      const res = await adminAgent().get('/api/maintenance-windows');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should include device info when filtering by deviceId', async () => {
      const device = await createTestDevice();
      testDeviceIds.push(device.id);

      const window = await prisma.maintenanceWindow.create({
        data: {
          deviceId: device.id,
          name: 'Test Window',
          startAt: new Date(),
          endAt: new Date(Date.now() + 3600_000),
          reason: 'Test reason',
          isActive: true,
        },
      });

      const res = await adminAgent().get(`/api/maintenance-windows?deviceId=${device.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(window.id);
      expect(res.body.data[0].device).toHaveProperty('name', device.name);
    });
  });

  describe('POST /api/maintenance-windows', () => {
    it('should create a maintenance window', async () => {
      const device = await createTestDevice();
      testDeviceIds.push(device.id);

      const res = await adminAgent()
        .post('/api/maintenance-windows')
        .send({
          deviceId: device.id,
          name: 'Upgrade Firmware',
          startAt: new Date().toISOString(),
          endAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
          reason: 'Routine upgrade',
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data).toHaveProperty('id');
      expect(data.name).toBe('Upgrade Firmware');
      expect(data.device).toHaveProperty('name', device.name);
      expect(data.isActive).toBe(true);
    });

    it('should reject when required fields missing', async () => {
      const res = await adminAgent().post('/api/maintenance-windows').send({ name: 'No dates' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PATCH /api/maintenance-windows/[id]', () => {
    it('should toggle isActive', async () => {
      const device = await createTestDevice();
      testDeviceIds.push(device.id);

      const window = await prisma.maintenanceWindow.create({
        data: {
          deviceId: device.id,
          name: 'Toggle Test',
          startAt: new Date(),
          endAt: new Date(Date.now() + 3600_000),
          isActive: true,
        },
      });

      const res = await adminAgent()
        .patch(`/api/maintenance-windows/${window.id}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);
    });
  });

  describe('DELETE /api/maintenance-windows/[id]', () => {
    it('should delete a maintenance window', async () => {
      const device = await createTestDevice();
      testDeviceIds.push(device.id);

      const window = await prisma.maintenanceWindow.create({
        data: {
          deviceId: device.id,
          name: 'Delete Test',
          startAt: new Date(),
          endAt: new Date(Date.now() + 3600_000),
        },
      });

      const res = await adminAgent().delete(`/api/maintenance-windows/${window.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);

      const deleted = await prisma.maintenanceWindow.findUnique({ where: { id: window.id } });
      expect(deleted).toBeNull();
    });

    it('should return 500 for non-existent window', async () => {
      const res = await adminAgent().delete('/api/maintenance-windows/nonexistent');
      expect(res.status).toBe(500);
    });
  });

  describe('isDeviceInMaintenance logic', () => {
    it('should suppress when window is active and within time range', async () => {
      const device = await createTestDevice();
      testDeviceIds.push(device.id);

      await prisma.maintenanceWindow.create({
        data: {
          deviceId: device.id,
          name: 'Active Now',
          startAt: new Date(Date.now() - 1000),
          endAt: new Date(Date.now() + 3600_000),
          isActive: true,
        },
      });

      const { isDeviceInMaintenance } = await import('../src/lib/maintenance');
      const inMaintenance = await isDeviceInMaintenance(device.id, new Date());
      expect(inMaintenance).toBe(true);
    });

    it('should NOT suppress when outside time range', async () => {
      const device = await createTestDevice();
      testDeviceIds.push(device.id);

      await prisma.maintenanceWindow.create({
        data: {
          deviceId: device.id,
          name: 'Past Window',
          startAt: new Date(Date.now() - 7200_000),
          endAt: new Date(Date.now() - 3600_000),
          isActive: true,
        },
      });

      const { isDeviceInMaintenance } = await import('../src/lib/maintenance');
      const inMaintenance = await isDeviceInMaintenance(device.id, new Date());
      expect(inMaintenance).toBe(false);
    });

    it('should NOT suppress when window is disabled', async () => {
      const device = await createTestDevice();
      testDeviceIds.push(device.id);

      await prisma.maintenanceWindow.create({
        data: {
          deviceId: device.id,
          name: 'Disabled',
          startAt: new Date(Date.now() - 1000),
          endAt: new Date(Date.now() + 3600_000),
          isActive: false,
        },
      });

      const { isDeviceInMaintenance } = await import('../src/lib/maintenance');
      const inMaintenance = await isDeviceInMaintenance(device.id, new Date());
      expect(inMaintenance).toBe(false);
    });

    it('should suppress ALL devices during a GLOBAL window (deviceId null)', async () => {
      const { isDeviceInMaintenance } = await import('../src/lib/maintenance');

      await prisma.maintenanceWindow.create({
        data: {
          deviceId: null,
          name: 'Global Maintenance',
          startAt: new Date(Date.now() - 5000),
          endAt: new Date(Date.now() + 3600_000),
          isActive: true,
        },
      });

      const deviceA = await createTestDevice();
      const deviceB = await createTestDevice();
      testDeviceIds.push(deviceA.id, deviceB.id);

      expect(await isDeviceInMaintenance(deviceA.id, new Date())).toBe(true);
      expect(await isDeviceInMaintenance(deviceB.id, new Date())).toBe(true);
    });

    it('global window outside time range does NOT suppress', async () => {
      const { isDeviceInMaintenance } = await import('../src/lib/maintenance');

      await prisma.maintenanceWindow.create({
        data: {
          deviceId: null,
          name: 'Old Global',
          startAt: new Date(Date.now() - 7200_000),
          endAt: new Date(Date.now() - 3600_000),
          isActive: true,
        },
      });

      const device = await createTestDevice();
      testDeviceIds.push(device.id);

      expect(await isDeviceInMaintenance(device.id, new Date())).toBe(false);
    });
  });
});
