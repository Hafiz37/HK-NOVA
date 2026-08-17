import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from './setup';
import { createTestAgent, expectSuccessResponse, expectErrorResponse, loginAndGetToken } from './utils';
import { createTestDevice, cleanTestData, uniqueTestIp } from './setup';

interface DeviceResponse {
  id: string;
  name: string;
  ip: string;
  type: string;
  vendor: string | null;
  model: string | null;
  location: string | null;
  status: string;
  description: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  latestLatency: number | null;
  latestPacketLoss: number | null;
  lastCheck: string | null;
  activeAlerts: Array<{
    id: string;
    type: string;
    severity: string;
    message: string;
    createdAt: string;
  }>;
}

describe('Devices API Integration Tests', () => {
  let adminToken: string;
  let operatorToken: string;
  let testDeviceIds: string[] = [];

  beforeAll(async () => {
    adminToken = await loginAndGetToken('admin', 'admin123');
    // Create an operator user for testing
    const operatorUser = await prisma.user.create({
      data: {
        id: `test-op-${Date.now()}`,
        username: `testop${Date.now()}`,
        passwordHash: await (await import('bcryptjs')).hash('testpass123', 10),
        role: 'OPERATOR',
      },
    });
    operatorToken = await loginAndGetToken(operatorUser.username, 'testpass123');
  });

  afterAll(async () => {
    // Clean up test devices
    for (const id of testDeviceIds) {
      try {
        await prisma.device.delete({ where: { id } });
      } catch {
        // ignore
      }
    }
    // Clean up test operators
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'testop' } },
    });
  });

  beforeEach(async () => {
    // Clean test data before each test
    await cleanTestData();
    testDeviceIds = [];
  });

  const adminAgent = () => createTestAgent({ token: adminToken });
  const operatorAgent = () => createTestAgent({ token: operatorToken });

  describe('GET /api/devices', () => {
    it('should return list of devices for authenticated user', async () => {
      const res = await adminAgent().get('/api/devices');
      expectSuccessResponse(res);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('count');
    });

    it('should filter by search query', async () => {
      // Create a device with unique name
      const device = await createTestDevice({ name: 'SearchTestRouter' });
      testDeviceIds.push(device.id);

      const res = await adminAgent().get('/api/devices?search=SearchTest');
      expectSuccessResponse(res);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.some((d: DeviceResponse) => d.name === 'SearchTestRouter')).toBe(true);
    });

    it('should filter by type', async () => {
      const device = await createTestDevice({ type: 'SWITCH' });
      testDeviceIds.push(device.id);

      const res = await adminAgent().get('/api/devices?type=SWITCH');
      expectSuccessResponse(res);
      expect(res.body.data.every((d: DeviceResponse) => d.type === 'SWITCH')).toBe(true);
    });

    it('should filter by status', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      const res = await adminAgent().get('/api/devices?status=UNKNOWN');
      expectSuccessResponse(res);
      expect(res.body.data.every((d: DeviceResponse) => d.status === 'UNKNOWN')).toBe(true);
    });

    it('should hide demo devices when showDemo=false', async () => {
      const res = await adminAgent().get('/api/devices?showDemo=false');
      expectSuccessResponse(res);
      expect(res.body.data.every((d: DeviceResponse) => d.isDemo === false)).toBe(true);
    });

    it('should include demo devices when showDemo=true', async () => {
      const res = await adminAgent().get('/api/devices?showDemo=true');
      expectSuccessResponse(res);
      expect(res.body.data.some((d: DeviceResponse) => d.isDemo === true)).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const agent = createTestAgent(); // no token
      const res = await agent.get('/api/devices');
      expectErrorResponse(res, 401);
    });
  });

  describe('POST /api/devices', () => {
    it('should create a new device with valid data', async () => {
      const res = await adminAgent().post('/api/devices').send({
        name: 'New Test Router',
        ip: uniqueTestIp(),
        type: 'ROUTER',
        vendor: 'Cisco',
        model: 'ISR4321',
        location: 'Data Center 1',
      });

      expectSuccessResponse(res, 201);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe('New Test Router');
      expect(res.body.data.type).toBe('ROUTER');
      expect(res.body.data.vendor).toBe('Cisco');
      expect(res.body.data.status).toBe('UNKNOWN');

      testDeviceIds.push(res.body.data.id);
    });

    it('should create device with credentials', async () => {
      const res = await adminAgent().post('/api/devices').send({
        name: 'Device With Creds',
        ip: uniqueTestIp(),
        type: 'SWITCH',
        credentials: {
          snmpVersion: 'v2c',
          snmpCommunity: 'public',
          snmpPort: 161,
          sshUsername: 'admin',
          sshPassword: 'sshpass123',
          sshPort: 22,
        },
      });

      expectSuccessResponse(res, 201);
      expect(res.body.data).toHaveProperty('id');

      // Verify credentials were created (but not returned)
      const device = await prisma.device.findUnique({
        where: { id: res.body.data.id },
        include: { credentials: true },
      });
      expect(device?.credentials).toBeDefined();
      expect(device?.credentials?.snmpCommunity).toBeDefined();
      expect(device?.credentials?.sshPassword).toBeDefined();

      testDeviceIds.push(res.body.data.id);
    });

    it('should fail with missing name', async () => {
      const res = await adminAgent().post('/api/devices').send({
        ip: uniqueTestIp(),
        type: 'ROUTER',
      });
      expectErrorResponse(res, 400, 'Device name is required');
    });

    it('should fail with missing IP', async () => {
      const res = await adminAgent().post('/api/devices').send({
        name: 'No IP Device',
        type: 'ROUTER',
      });
      expectErrorResponse(res, 400, 'Device IP address is required');
    });

    it('should fail with invalid IP format', async () => {
      const res = await adminAgent().post('/api/devices').send({
        name: 'Bad IP Device',
        ip: 'not-an-ip',
        type: 'ROUTER',
      });
      expectErrorResponse(res, 400, 'Invalid IPv4 address format');
    });

    it('should fail with invalid type', async () => {
      const res = await adminAgent().post('/api/devices').send({
        name: 'Bad Type Device',
        ip: uniqueTestIp(),
        type: 'INVALID_TYPE',
      });
      expectErrorResponse(res, 400, 'Invalid or missing device type');
    });

    it('should fail with duplicate IP', async () => {
      const duplicateIp = uniqueTestIp();
      const device = await createTestDevice({ ip: duplicateIp });
      testDeviceIds.push(device.id);

      const res = await adminAgent().post('/api/devices').send({
        name: 'Duplicate IP Device',
        ip: duplicateIp,
        type: 'ROUTER',
      });
      expectErrorResponse(res, 409, 'already exists');
    });

    it('should fail without authentication', async () => {
      const agent = createTestAgent();
      const res = await agent.post('/api/devices').send({
        name: 'Unauth Device',
        ip: uniqueTestIp(),
        type: 'ROUTER',
      });
      expectErrorResponse(res, 401);
    });

    it('should allow OPERATOR to create device', async () => {
      const res = await operatorAgent().post('/api/devices').send({
        name: 'Operator Device',
        ip: uniqueTestIp(),
        type: 'ROUTER',
      });
      expectSuccessResponse(res, 201);
      testDeviceIds.push(res.body.data.id);
    });
  });

  describe('GET /api/devices/[id]', () => {
    it('should return device details', async () => {
      const device = await createTestDevice({ name: 'Detail Test Device' });
      testDeviceIds.push(device.id);

      const res = await adminAgent().get(`/api/devices/${device.id}`);
      expectSuccessResponse(res);
      expect(res.body.data.id).toBe(device.id);
      expect(res.body.data.name).toBe('Detail Test Device');
      expect(res.body.data).toHaveProperty('metrics');
      expect(res.body.data).toHaveProperty('alerts');
    });

    it('should mask sensitive credential fields', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      // Add credentials
      await prisma.credential.create({
        data: {
          deviceId: device.id,
          snmpCommunity: 'encrypted:community',
          sshPassword: 'encrypted:password',
        },
      });

      const res = await adminAgent().get(`/api/devices/${device.id}`);
      expectSuccessResponse(res);
      expect(res.body.data.credentials?.snmpCommunity).toBe('***MASKED***');
      expect(res.body.data.credentials?.sshPassword).toBe('***MASKED***');
    });

    it('should return 404 for non-existent device', async () => {
      const res = await adminAgent().get('/api/devices/nonexistent-id');
      expectErrorResponse(res, 404, 'Device not found');
    });
  });

  describe('PUT/PATCH /api/devices/[id]', () => {
    it('should update device name and location', async () => {
      const device = await createTestDevice({ name: 'Original Name' });
      testDeviceIds.push(device.id);

      const res = await adminAgent().put(`/api/devices/${device.id}`).send({
        name: 'Updated Name',
        location: 'New Location',
      });

      expectSuccessResponse(res);
      expect(res.body.data.name).toBe('Updated Name');
      expect(res.body.data.location).toBe('New Location');
    });

    it('should update device status', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      const res = await adminAgent().patch(`/api/devices/${device.id}`).send({
        status: 'MAINTENANCE',
      });

      expectSuccessResponse(res);
      expect(res.body.data.status).toBe('MAINTENANCE');
    });

    it('should update credentials', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      const res = await adminAgent().put(`/api/devices/${device.id}`).send({
        credentials: {
          snmpCommunity: 'newcommunity',
          sshUsername: 'newuser',
          sshPassword: 'newpass',
        },
      });

      expectSuccessResponse(res);

      // Verify credentials updated
      const creds = await prisma.credential.findUnique({
        where: { deviceId: device.id },
      });
      expect(creds?.snmpCommunity).toBeDefined();
    });

    it('should fail with duplicate IP on update', async () => {
      const ip1 = uniqueTestIp();
      const device1 = await createTestDevice({ ip: ip1 });
      const device2 = await createTestDevice();
      testDeviceIds.push(device1.id, device2.id);

      const res = await adminAgent().put(`/api/devices/${device2.id}`).send({
        ip: ip1, // device1's IP
      });
      expectErrorResponse(res, 409, 'already used');
    });

    it('should return 404 for non-existent device', async () => {
      const res = await adminAgent().put('/api/devices/nonexistent').send({
        name: 'Updated',
      });
      expectErrorResponse(res, 404, 'Device not found');
    });
  });

  describe('DELETE /api/devices/[id]', () => {
    it('should soft delete device (ADMIN only)', async () => {
      const device = await createTestDevice({ name: 'To Delete' });
      testDeviceIds.push(device.id);

      const res = await adminAgent().delete(`/api/devices/${device.id}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted successfully');

      // Verify soft delete
      const deleted = await prisma.device.findUnique({
        where: { id: device.id },
      });
      expect(deleted?.deletedAt).not.toBeNull();
    });

    it('should fail for OPERATOR (403 Forbidden)', async () => {
      const device = await createTestDevice({ name: 'Operator Delete' });
      testDeviceIds.push(device.id);

      const res = await operatorAgent().delete(`/api/devices/${device.id}`);
      expectErrorResponse(res, 403, 'insufficient permissions');
    });

    it('should return 404 for non-existent device', async () => {
      const res = await adminAgent().delete('/api/devices/nonexistent');
      expectErrorResponse(res, 404, 'Device not found');
    });
  });

  describe('POST /api/devices/[id]/test', () => {
    it('should test ICMP connectivity', async () => {
      const device = await createTestDevice(); // IP unik; endpoint mengembalikan 200 dgn success flag
      testDeviceIds.push(device.id);

      const res = await adminAgent().post(`/api/devices/${device.id}/test`).send({
        type: 'icmp',
      });

      expectSuccessResponse(res);
      expect(res.body.data).toHaveProperty('success');
      expect(res.body.data).toHaveProperty('type', 'icmp');
      expect(res.body.data).toHaveProperty('message');
      expect(res.body.data).toHaveProperty('durationMs');
    });

    it('should test SNMP connectivity (may fail if no agent)', async () => {
      const device = await createTestDevice();
      testDeviceIds.push(device.id);

      await prisma.credential.create({
        data: {
          deviceId: device.id,
          snmpVersion: 'v2c',
          snmpCommunity: 'public',
        },
      });

      const res = await adminAgent().post(`/api/devices/${device.id}/test`).send({
        type: 'snmp',
      });

      expectSuccessResponse(res);
      expect(res.body.data.type).toBe('snmp');
      expect(res.body.data).toHaveProperty('success');
    });

    it('should test SSH connectivity (may fail if no server)', async () => {
      const device = await createTestDevice();
      testDeviceIds.push(device.id);

      await prisma.credential.create({
        data: {
          deviceId: device.id,
          sshUsername: 'test',
          sshPassword: 'test',
        },
      });

      const res = await adminAgent().post(`/api/devices/${device.id}/test`).send({
        type: 'ssh',
      });

      expectSuccessResponse(res);
      expect(res.body.data.type).toBe('ssh');
      expect(res.body.data).toHaveProperty('success');
    });

    it('should fail with invalid test type', async () => {
      const device = await createTestDevice({});
      testDeviceIds.push(device.id);

      const res = await adminAgent().post(`/api/devices/${device.id}/test`).send({
        type: 'invalid',
      });
      expectErrorResponse(res, 400, 'type harus icmp, snmp, atau ssh');
    });
  });
});