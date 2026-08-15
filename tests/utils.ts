import request from 'supertest';
import { createTestSessionToken } from './setup';
import { expect } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

export interface TestRequestOptions {
  token?: string;
  username?: string;
}

/**
 * Create a supertest agent with optional authentication
 */
export function createTestAgent(options: TestRequestOptions = {}) {
  const agent = request(BASE_URL);

  const token = options.token ?? (options.username ? createTestSessionToken(options.username) : undefined);

  return {
    get: (path: string) => {
      const req = agent.get(path);
      if (token) req.set('Cookie', [`hk_nova_session=${token}`]);
      return req;
    },
    post: (path: string) => {
      const req = agent.post(path);
      if (token) req.set('Cookie', [`hk_nova_session=${token}`]);
      return req;
    },
    put: (path: string) => {
      const req = agent.put(path);
      if (token) req.set('Cookie', [`hk_nova_session=${token}`]);
      return req;
    },
    patch: (path: string) => {
      const req = agent.patch(path);
      if (token) req.set('Cookie', [`hk_nova_session=${token}`]);
      return req;
    },
    delete: (path: string) => {
      const req = agent.delete(path);
      if (token) req.set('Cookie', [`hk_nova_session=${token}`]);
      return req;
    },
  };
}

/**
 * Login and return session token
 */
export async function loginAndGetToken(username: string, password: string): Promise<string> {
  const res = await request(BASE_URL)
    .post('/api/auth/login')
    .send({ username, password })
    .expect(200);

  const cookie = res.headers['set-cookie'];
  if (!cookie) throw new Error('No session cookie returned');

  const cookies = Array.isArray(cookie) ? cookie : [cookie];
  const sessionCookie = cookies.find((c: string) => c.startsWith('hk_nova_session='));
  if (!sessionCookie) throw new Error('No hk_nova_session cookie found');

  return sessionCookie.split(';')[0].split('=')[1];
}

/**
 * Assert response has expected structure
 */
export function expectSuccessResponse(res: request.Response, expectedStatus = 200) {
  expect(res.status).toBe(expectedStatus);
  expect(res.body).toHaveProperty('data');
  return res.body.data;
}

export function expectErrorResponse(res: request.Response, expectedStatus: number, expectedError?: string) {
  expect(res.status).toBe(expectedStatus);
  expect(res.body).toHaveProperty('error');
  if (expectedError) {
    expect(res.body.error).toContain(expectedError);
  }
}