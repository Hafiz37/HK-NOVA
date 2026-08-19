import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, createTestDevice } from './setup';
import { createTestAgent, loginAndGetToken, expectErrorResponse } from './utils';

describe('Backup & Provisioning API Integration Tests', () => {
  let adminToken: string;
  let operatorToken: string;
  let operatorUsername: string;
  let viewerToken: string;
  let viewerUsername: string;
  let testDevice: { id: string };

  const cleanupDeviceIds: string[] = [];

  beforeAll(async () => {
    adminToken = await loginAndGetToken('admin', 'admin123');

    const operatorUser = await prisma.user.create({
      data: {
        id: `test-op-dm-${Date.now()}`,
        username: `testopdm${Date.now()}`,
        passwordHash: await (await import('bcryptjs')).hash('testpass123', 10),
        role: 'OPERATOR',
      },
    });
    operatorUsername = operatorUser.username;
    operatorToken = await loginAndGetToken(operatorUsername, 'testpass123');

    const viewerUser = await prisma.user.create({
      data: {
        id: `test-vw-dm-${Date.now()}`,
        username: `testvwdm${Date.now()}`,
        passwordHash: await (await import('bcryptjs')).hash('testpass123', 10),
        role: 'VIEWER',
      },
    });
    viewerUsername = viewerUser.username;
    viewerToken = await loginAndGetToken(viewerUsername, 'testpass123');

    // Device tanpa kredensial SSH — koneksi nyata tidak dijalankan di test.
    const device = await createTestDevice({
      name: `DM Test ${Date.now()}`,
      type: 'OLT',
      vendor: 'Generic',
    });
    testDevice = { id: device.id };
    cleanupDeviceIds.push(device.id);
  });

  afterAll(async () => {
    await prisma.device.deleteMany({ where: { id: { in: cleanupDeviceIds } } });
    await prisma.user.deleteMany({ where: { username: { in: [operatorUsername, viewerUsername] } } });
  });

  // ── Backups ────────────────────────────────────────────────────────────
  it('GET /api/backups tanpa sesi → 401', async () => {
    const res = await createTestAgent().get('/api/backups');
    expect(res.status).toBe(401);
  });

  it('GET /api/backups dengan sesi → 200 dan pagination', async () => {
    const res = await createTestAgent({ token: adminToken }).get('/api/backups?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it('GET /api/backups/[random-id] → 404', async () => {
    const res = await createTestAgent({ token: adminToken }).get('/api/backups/nonexistent-id');
    expectErrorResponse(res, 404);
  });

  it('POST /api/devices/[id]/backup sebagai VIEWER → 403', async () => {
    const res = await createTestAgent({ token: viewerToken }).post(`/api/devices/${testDevice.id}/backup`);
    expectErrorResponse(res, 403);
  });

  it('POST /api/devices/[id]/backup device tanpa SSH → 400 (creds belum dikonfigurasi)', async () => {
    const res = await createTestAgent({ token: operatorToken }).post(`/api/devices/${testDevice.id}/backup`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('SSH');
  });

  it('POST /api/devices/[unknown-id]/backup → 404', async () => {
    const res = await createTestAgent({ token: adminToken }).post('/api/devices/unknown-device/backup');
    expectErrorResponse(res, 404);
  });

  // ── OLT templates ──────────────────────────────────────────────────────
  it('GET /api/provisioning/olt-templates tanpa sesi → 401', async () => {
    const res = await createTestAgent().get('/api/provisioning/olt-templates');
    expect(res.status).toBe(401);
  });

  it('GET /api/provisioning/olt-templates dengan sesi → 3 vendor', async () => {
    const res = await createTestAgent({ token: adminToken }).get('/api/provisioning/olt-templates');
    expect(res.status).toBe(200);
    const names = res.body.data.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(['huawei', 'zte', 'generic']));
    const zte = res.body.data.find((t: { name: string }) => t.name === 'zte');
    expect(zte.actions).toHaveLength(5);
  });

  // ── Provisioning execute ───────────────────────────────────────────────
  it('POST execute tanpa deviceId → 400', async () => {
    const res = await createTestAgent({ token: adminToken })
      .post('/api/provisioning/execute')
      .send({ action: 'create_service' });
    expectErrorResponse(res, 400);
  });

  it('POST execute dengan action tak dikenal → 400', async () => {
    const res = await createTestAgent({ token: adminToken })
      .post('/api/provisioning/execute')
      .send({ deviceId: testDevice.id, action: 'bogus' });
    expectErrorResponse(res, 400);
  });

  it('POST execute sebagai VIEWER → 403', async () => {
    const res = await createTestAgent({ token: viewerToken })
      .post('/api/provisioning/execute')
      .send({ deviceId: testDevice.id, action: 'suspend_service' });
    expectErrorResponse(res, 403);
  });

  it('POST execute field wajib kurang → 400 + details', async () => {
    const res = await createTestAgent({ token: adminToken })
      .post('/api/provisioning/execute')
      .send({ deviceId: testDevice.id, action: 'create_service', ponPort: '0/1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Field wajib');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('POST execute device tanpa SSH creds → 400', async () => {
    const res = await createTestAgent({ token: adminToken })
      .post('/api/provisioning/execute')
      .send({
        deviceId: testDevice.id,
        action: 'create_service',
        ponPort: '0/1',
        ontSlot: '1',
        ontSerial: 'SN123',
        vlan: 100,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('SSH');
  });

  it('GET /api/provisioning/logs dengan sesi → 200', async () => {
    const res = await createTestAgent({ token: adminToken }).get('/api/provisioning/logs?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });
});