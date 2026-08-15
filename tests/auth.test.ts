import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from './setup';
import { createTestAgent, loginAndGetToken, expectSuccessResponse, expectErrorResponse } from './utils';
import { createTestUser } from './setup';

describe('Auth API Integration Tests', () => {
  let adminToken: string;
  let operatorToken: string;
  let testUser: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    // Create test users
    testUser = await createTestUser({
      username: `testoperator${Date.now()}`,
      password: 'testpass123',
      role: 'OPERATOR',
    });

    // Login as existing admin (from seed)
    adminToken = await loginAndGetToken('admin', 'admin123');
    operatorToken = await loginAndGetToken(testUser.username, 'testpass123');
  });

  afterAll(async () => {
    // Cleanup test users
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'testoperator' } },
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const agent = createTestAgent();
      const res = await agent.post('/api/auth/login').send({
        username: 'admin',
        password: 'admin123',
      });

      expectSuccessResponse(res);
      expect(res.body.data).toHaveProperty('username', 'admin');
      expect(res.body.data).toHaveProperty('fullName');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should fail with invalid username', async () => {
      const agent = createTestAgent();
      const res = await agent.post('/api/auth/login').send({
        username: 'nonexistent',
        password: 'admin123',
      });

      expectErrorResponse(res, 401, 'Username atau password salah');
    });

    it('should fail with invalid password', async () => {
      const agent = createTestAgent();
      const res = await agent.post('/api/auth/login').send({
        username: 'admin',
        password: 'wrongpassword',
      });

      expectErrorResponse(res, 401, 'Username atau password salah');
    });

    it('should fail with missing credentials', async () => {
      const agent = createTestAgent();
      const res = await agent.post('/api/auth/login').send({});

      expectErrorResponse(res, 400, 'wajib diisi');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid session', async () => {
      const agent = createTestAgent({ token: adminToken });
      const res = await agent.get('/api/auth/me');

      expectSuccessResponse(res);
      expect(res.body.data).toHaveProperty('username', 'admin');
      expect(res.body.data).toHaveProperty('fullName');
      expect(res.body.authenticated).toBe(true);
    });

    it('should return 401 without session (returns authenticated: false)', async () => {
      const agent = createTestAgent(); // no token
      const res = await agent.get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.authenticated).toBe(false);
    });

    it('should return 401 with invalid session (returns authenticated: false)', async () => {
      const agent = createTestAgent({ token: 'invalid.token.here' });
      const res = await agent.get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.authenticated).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const agent = createTestAgent({ token: adminToken });
      const res = await agent.post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Logout berhasil');
      expect(res.headers['set-cookie']).toBeDefined();
      // Cookie should be cleared (maxAge=0)
      const cookies = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie']].filter(Boolean);
      const cookie = cookies.find((c) =>
        c.startsWith('hk_nova_session=')
      );
      expect(cookie).toContain('Max-Age=0');
    });
  });

  describe('Session persistence', () => {
    it('should maintain session across requests', async () => {
      const agent = createTestAgent({ token: adminToken });

      // First request
      const res1 = await agent.get('/api/auth/me');
      expectSuccessResponse(res1);
      expect(res1.body.data.username).toBe('admin');

      // Second request should still work
      const res2 = await agent.get('/api/auth/me');
      expectSuccessResponse(res2);
      expect(res2.body.data.username).toBe('admin');
    });

    it('should work for operator role', async () => {
      const agent = createTestAgent({ token: operatorToken });
      const res = await agent.get('/api/auth/me');

      expectSuccessResponse(res);
      expect(res.body.data.username).toBe(testUser.username);
    });
  });
});