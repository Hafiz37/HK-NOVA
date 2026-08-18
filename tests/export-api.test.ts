import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from './setup';
import { createTestAgent, loginAndGetToken } from './utils';

describe('Export API Integration Tests', () => {
  let adminToken: string;
  let operatorToken: string;
  let operatorUsername: string;

  beforeAll(async () => {
    adminToken = await loginAndGetToken('admin', 'admin123');

    const operatorUser = await prisma.user.create({
      data: {
        id: `test-op-export-${Date.now()}`,
        username: `testopexport${Date.now()}`,
        passwordHash: await (await import('bcryptjs')).hash('testpass123', 10),
        role: 'OPERATOR',
      },
    });
    operatorUsername = operatorUser.username;
    operatorToken = await loginAndGetToken(operatorUsername, 'testpass123');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: operatorUsername } });
  });

  it('export audit-logs tanpa sesi → 401', async () => {
    const res = await createTestAgent().get('/api/export/audit-logs?format=csv');
    expect(res.status).toBe(401);
  });

  it('export audit-logs sebagai OPERATOR → 403 (admin only)', async () => {
    const res = await createTestAgent({ token: operatorToken }).get('/api/export/audit-logs?format=csv');
    expect(res.status).toBe(403);
  });

  it('export audit-logs sebagai ADMIN → CSV dengan header', async () => {
    const res = await createTestAgent({ token: adminToken }).get('/api/export/audit-logs?format=csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toContain('Waktu');
    expect(res.text).toContain('Username');
  });

  it('export audit-logs sebagai ADMIN → XLSX (content-type benar)', async () => {
    const res = await createTestAgent({ token: adminToken }).get('/api/export/audit-logs?format=xlsx');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  });

  it('export audit-logs → PDF (content-type benar)', async () => {
    const res = await createTestAgent({ token: adminToken }).get('/api/export/audit-logs?format=pdf');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('export dengan format tak dikenal → default ke CSV', async () => {
    const res = await createTestAgent({ token: adminToken }).get('/api/export/audit-logs?format=bogus');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('export alerts dengan sesi (operator) → CSV', async () => {
    const res = await createTestAgent({ token: operatorToken }).get('/api/export/alerts?format=csv&status=ACTIVE');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Severity');
  });

  it('export devices → CSV tanpa sesi → 401', async () => {
    const res = await createTestAgent().get('/api/export/devices?format=csv');
    expect(res.status).toBe(401);
  });

  it('export metrics tanpa deviceId → 400', async () => {
    const res = await createTestAgent({ token: adminToken }).get('/api/export/metrics?format=csv');
    expect(res.status).toBe(400);
  });

  it('GET /api/alerts mendukung search + pagination server-side', async () => {
    const res = await createTestAgent({ token: adminToken }).get(
      '/api/alerts?search=zzz-nonexistent&status=ACTIVE&page=2&limit=5'
    );
    expect(res.status).toBe(200);
    const body = res.body;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.limit).toBe(5);
  });
});