import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from './setup';
import { createTestAgent, expectSuccessResponse, expectErrorResponse, loginAndGetToken } from './utils';
import { createTestDevice, cleanTestData } from './setup';

interface AlertResponse {
  id: string;
  type: string;
  deviceId: string | null;
  message: string;
  severity: string;
  status: string;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  device: {
    id: string;
    name: string;
    ip: string;
    type: string;
    location: string | null;
  } | null;
}

describe('Alerts API Integration Tests', () => {
  let adminToken: string;
  let operatorToken: string;
  let testDeviceIds: string[] = [];

  beforeAll(async () => {
    adminToken = await loginAndGetToken('admin', 'admin123');

    const operatorUser = await prisma.user.create({
      data: {
        id: `test-op-alert-${Date.now()}`,
        username: `testopalert${Date.now()}`,
        passwordHash: await (await import('bcryptjs')).hash('testpass123', 10),
        role: 'OPERATOR',
      },
    });
    operatorToken = await loginAndGetToken(operatorUser.username, 'testpass123');
  });

  afterAll(async () => {
    for (const id of testDeviceIds) {
      try {
        await prisma.device.delete({ where: { id } });
      } catch {
        // ignore
      }
    }
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'testopalert' } },
    });
  });

  beforeEach(async () => {
    await cleanTestData();
    testDeviceIds = [];
  });

  const adminAgent = () => createTestAgent({ token: adminToken });
  const operatorAgent = () => createTestAgent({ token: operatorToken });

  describe('GET /api/alerts', () => {
    it('should return list of alerts', async () => {
      const res = await adminAgent().get('/api/alerts');
      expectSuccessResponse(res);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('pagination');
    });

    it('should filter by status', async () => {
      // Create a device and an alert
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      await prisma.alert.create({
        data: {
          type: 'DEVICE_DOWN',
          deviceId: device.id,
          message: 'Test alert',
          severity: 'HIGH',
          status: 'ACTIVE',
        },
      });

      const res = await adminAgent().get('/api/alerts?status=ACTIVE');
      expectSuccessResponse(res);
      expect(res.body.data.every((a: AlertResponse) => a.status === 'ACTIVE')).toBe(true);
    });

    it('should filter by severity', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      await prisma.alert.create({
        data: {
          type: 'DEVICE_DOWN',
          deviceId: device.id,
          message: 'High severity alert',
          severity: 'HIGH',
          status: 'ACTIVE',
        },
      });

      const res = await adminAgent().get('/api/alerts?severity=HIGH');
      expectSuccessResponse(res);
      expect(res.body.data.every((a: AlertResponse) => a.severity === 'HIGH')).toBe(true);
    });

    it('should support pagination', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      // Create multiple alerts
      for (let i = 0; i < 5; i++) {
        await prisma.alert.create({
          data: {
            type: 'DEVICE_DOWN',
            deviceId: device.id,
            message: `Alert ${i}`,
            severity: 'MEDIUM',
            status: 'ACTIVE',
          },
        });
      }

      const res = await adminAgent().get('/api/alerts?page=1&limit=2');
      expectSuccessResponse(res);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(2);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(5);
    });

    it('should include device info in alerts', async () => {
      const device = await createTestDevice({ name: 'Alert Device' });
      testDeviceIds.push(device.id);

      await prisma.alert.create({
        data: {
          type: 'DEVICE_DOWN',
          deviceId: device.id,
          message: 'Device is down',
          severity: 'HIGH',
          status: 'ACTIVE',
        },
      });

      const res = await adminAgent().get('/api/alerts');
      expectSuccessResponse(res);
      const alert = res.body.data.find((a: AlertResponse) => a.deviceId === device.id);
      expect(alert).toBeDefined();
      expect(alert.device).toHaveProperty('name', 'Alert Device');
      expect(alert.device).toHaveProperty('ip');
    });
  });

  describe('POST /api/alerts/[id]/acknowledge', () => {
    it('should acknowledge an active alert', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      const alert = await prisma.alert.create({
        data: {
          type: 'DEVICE_DOWN',
          deviceId: device.id,
          message: 'Test alert to acknowledge',
          severity: 'HIGH',
          status: 'ACTIVE',
        },
      });

      const res = await operatorAgent().post(`/api/alerts/${alert.id}/acknowledge`);
      expectSuccessResponse(res);
      expect(res.body.data.id).toBe(alert.id);
      expect(res.body.data.status).toBe('ACKNOWLEDGED');
      expect(res.body.data).toHaveProperty('acknowledgedAt');
    });

    it('should fail to acknowledge already acknowledged alert', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      const alert = await prisma.alert.create({
        data: {
          type: 'DEVICE_DOWN',
          deviceId: device.id,
          message: 'Already acknowledged',
          severity: 'HIGH',
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date(),
        },
      });

      const res = await operatorAgent().post(`/api/alerts/${alert.id}/acknowledge`);
      expectErrorResponse(res, 409, 'already acknowledged');
    });

    it('should return 404 for non-existent alert', async () => {
      const res = await operatorAgent().post('/api/alerts/nonexistent/acknowledge');
      expectErrorResponse(res, 404, 'Alert not found');
    });
  });

  describe('POST /api/alerts/[id]/resolve', () => {
    it('should resolve an active alert', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      const alert = await prisma.alert.create({
        data: {
          type: 'DEVICE_DOWN',
          deviceId: device.id,
          message: 'Test alert to resolve',
          severity: 'HIGH',
          status: 'ACTIVE',
        },
      });

      const res = await operatorAgent().post(`/api/alerts/${alert.id}/resolve`);
      expectSuccessResponse(res);
      expect(res.body.data.id).toBe(alert.id);
      expect(res.body.data.status).toBe('RESOLVED');
      expect(res.body.data).toHaveProperty('resolvedAt');
      expect(res.body.message).toContain('resolved successfully');
    });

    it('should resolve an acknowledged alert', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      const alert = await prisma.alert.create({
        data: {
          type: 'DEVICE_DOWN',
          deviceId: device.id,
          message: 'Acknowledged then resolved',
          severity: 'HIGH',
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date(),
        },
      });

      const res = await operatorAgent().post(`/api/alerts/${alert.id}/resolve`);
      expectSuccessResponse(res);
      expect(res.body.data.status).toBe('RESOLVED');
    });

    it('should fail to resolve already resolved alert', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      const alert = await prisma.alert.create({
        data: {
          type: 'DEVICE_DOWN',
          deviceId: device.id,
          message: 'Already resolved',
          severity: 'HIGH',
          status: 'RESOLVED',
          resolvedAt: new Date(),
        },
      });

      const res = await operatorAgent().post(`/api/alerts/${alert.id}/resolve`);
      expectErrorResponse(res, 409, 'already resolved');
    });

    it('should return 404 for non-existent alert', async () => {
      const res = await operatorAgent().post('/api/alerts/nonexistent/resolve');
      expectErrorResponse(res, 404, 'Alert not found');
    });
  });

  describe('Alert lifecycle: ACTIVE -> ACKNOWLEDGED -> RESOLVED', () => {
    it('should transition through full lifecycle', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      // Create alert
      const alert = await prisma.alert.create({
        data: {
          type: 'DEVICE_DOWN',
          deviceId: device.id,
          message: 'Full lifecycle test',
          severity: 'CRITICAL',
          status: 'ACTIVE',
        },
      });

      // 1. Acknowledge
      const ackRes = await operatorAgent().post(`/api/alerts/${alert.id}/acknowledge`);
      expectSuccessResponse(ackRes);
      expect(ackRes.body.data.status).toBe('ACKNOWLEDGED');
      expect(ackRes.body.data.acknowledgedAt).toBeDefined();

      // 2. Resolve
      const resolveRes = await operatorAgent().post(`/api/alerts/${alert.id}/resolve`);
      expectSuccessResponse(resolveRes);
      expect(resolveRes.body.data.status).toBe('RESOLVED');
      expect(resolveRes.body.data.resolvedAt).toBeDefined();
      expect(resolveRes.body.data.acknowledgedAt).toBeDefined(); // Should keep acknowledgedAt

      // 3. Verify in database
      const dbAlert = await prisma.alert.findUnique({ where: { id: alert.id } });
      expect(dbAlert?.status).toBe('RESOLVED');
      expect(dbAlert?.acknowledgedAt).not.toBeNull();
      expect(dbAlert?.resolvedAt).not.toBeNull();
    });
  });

  describe('Authorization', () => {
    it('should allow OPERATOR to acknowledge alerts', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      const alert = await prisma.alert.create({
        data: {
          type: 'DEVICE_DOWN',
          deviceId: device.id,
          message: 'Operator ack test',
          severity: 'HIGH',
          status: 'ACTIVE',
        },
      });

      const res = await operatorAgent().post(`/api/alerts/${alert.id}/acknowledge`);
      expectSuccessResponse(res);
    });

    it('should allow OPERATOR to resolve alerts', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      const alert = await prisma.alert.create({
        data: {
          type: 'DEVICE_DOWN',
          deviceId: device.id,
          message: 'Operator resolve test',
          severity: 'HIGH',
          status: 'ACTIVE',
        },
      });

      const res = await operatorAgent().post(`/api/alerts/${alert.id}/resolve`);
      expectSuccessResponse(res);
    });

    it('should deny access without authentication', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      const alert = await prisma.alert.create({
        data: {
          type: 'DEVICE_DOWN',
          deviceId: device.id,
          message: 'No auth test',
          severity: 'HIGH',
          status: 'ACTIVE',
        },
      });

      const agent = createTestAgent(); // no token
      const res = await agent.post(`/api/alerts/${alert.id}/acknowledge`);
      expectErrorResponse(res, 401);
    });
  });
});