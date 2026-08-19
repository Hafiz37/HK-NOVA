import request from 'supertest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

let cached: boolean | null = null;

/**
 * Probe ketersediaan server tempat integration test menembak.
 * 401/200 = server hidup (auth optional). ECONNREFUSED/CRASH = server mati.
 * Hanya dipanggil sekali dan hasilnya di-cache per proses test.
 */
export function isServerUp(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const agent = request(BASE_URL);
    agent
      .get('/api/auth/me')
      .timeout({ response: 2000, deadline: 4000 })
      .then((res) => {
        cached = res.status !== 0 && res.status < 500;
        resolve(cached);
      })
      .catch((err) => {
        cached = false;
        void err;
        resolve(false);
      });
  });
}