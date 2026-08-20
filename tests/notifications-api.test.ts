import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from './setup';
import { NOTIFICATION_SETTING_KEY, MASK_VALUE, getNotificationConfig } from '@/lib/notify-config';
import { createTestAgent, loginAndGetToken, expectSuccessResponse, expectErrorResponse } from './utils';

describe('Notifications Settings API Integration Tests', () => {
  let adminToken: string;
  let operatorToken: string;
  let operatorUsername: string;

  beforeAll(async () => {
    // Pastikan state awal bersih (berbagi DB dengan file test lain)
    await prisma.setting.deleteMany({ where: { key: NOTIFICATION_SETTING_KEY } });

    adminToken = await loginAndGetToken('admin', 'admin123');

    const operatorUser = await prisma.user.create({
      data: {
        id: `test-op-notif-${Date.now()}`,
        username: `testopnotif${Date.now()}`,
        passwordHash: await (await import('bcryptjs')).hash('testpass123', 10),
        role: 'OPERATOR',
      },
    });
    operatorUsername = operatorUser.username;
    operatorToken = await loginAndGetToken(operatorUsername, 'testpass123');
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: NOTIFICATION_SETTING_KEY } });
    await prisma.user.deleteMany({ where: { username: operatorUsername } });
  });

  it('GET tanpa sesi → 401', async () => {
    const res = await createTestAgent().get('/api/settings/notifications');
    expectErrorResponse(res, 401);
  });

  it('GET sebagai OPERATOR → 403', async () => {
    const res = await createTestAgent({ token: operatorToken }).get('/api/settings/notifications');
    expectErrorResponse(res, 403);
  });

  it('GET sebagai ADMIN mengembalikan 4 kanal dengan nilai ter-nyamarkan', async () => {
    const res = await createTestAgent({ token: adminToken }).get('/api/settings/notifications');
    const data = expectSuccessResponse(res);
    expect(Object.keys(data)).toEqual(['telegram', 'email', 'webhook', 'sms', 'siem']);
    // Bila channel dikonfigurasi lewat env (.env), nilai rahasia ikut ter-nyamarkan.
    // Jika tidak ada env fallback, nilai kosong dikembalikan sebagai '' (belum terkonfigurasi).
    const telegramViaEnv = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
    if (telegramViaEnv) {
      expect(data.telegram.botToken).toBe(MASK_VALUE);
      expect(data.telegram.configured).toBe(true);
    } else {
      expect(data.telegram).toHaveProperty('botToken', '');
      expect(data.telegram.configured).toBe(false);
    }
    expect(data.email).toHaveProperty('password', '');
  });

  it('POST sebagai OPERATOR → 403', async () => {
    const res = await createTestAgent({ token: operatorToken })
      .post('/api/settings/notifications')
      .send({ telegram: { enabled: true, botToken: 'abc', chatIds: ['1'] } });
    expectErrorResponse(res, 403);
  });

  it('POST dengan body tidak valid → 400', async () => {
    const res = await createTestAgent({ token: adminToken })
      .post('/api/settings/notifications')
      .send({ telegram: { enabled: true, botToken: 'abc', chatIds: 'bukan-array' } });
    expectErrorResponse(res, 400);
  });

  it('POST dengan email recipient invalid → 400', async () => {
    const res = await createTestAgent({ token: adminToken }).post('/api/settings/notifications').send({
      email: { enabled: true, host: 'x', port: 465, secure: true, from: 'a@b.com', recipients: ['not-an-email'] },
    });
    expectErrorResponse(res, 400);
  });

  it('POST sebagai ADMIN menyimpan konfigurasi (secret ter-enkripsi)', async () => {
    const payload = {
      telegram: { enabled: true, botToken: 'shh-token', chatIds: ['-100111'] },
      email: {
        enabled: true,
        host: 'smtp.test.local',
        port: 465,
        secure: true,
        username: 'ops',
        password: 'smtp-secret',
        from: 'noc@test.local',
        recipients: ['ops@test.local'],
      },
      webhook: { enabled: true, urls: ['https://hooks.slack.com/services/X/Y'] },
      sms: {
        enabled: false,
        provider: 'generic',
        apiUrl: '',
        apiKey: '',
        accountSid: '',
        senderId: '',
        toNumbers: [],
      },
    };

    const res = await createTestAgent({ token: adminToken }).post('/api/settings/notifications').send(payload);
    const data = expectSuccessResponse(res);
    expect(data.telegram.botToken).toBe(MASK_VALUE);
    expect(data.email.password).toBe(MASK_VALUE);
    expect(data.email.configured).toBe(true);

    // Verifikasi round-trip melalui helper DB (nilai ter-dekripsi)
    const cfg = await getNotificationConfig(prisma);
    expect(cfg.telegram.botToken).toBe('shh-token');
    expect(cfg.email.password).toBe('smtp-secret');
    expect(cfg.telegram.chatIds).toEqual(['-100111']);
  });

  it('POST ulang dengan MASKED mempertahankan rahasia lama', async () => {
    const payload = {
      telegram: { enabled: true, botToken: MASK_VALUE, chatIds: ['-100111'] },
      email: {
        enabled: true,
        host: 'smtp.test.local',
        port: 465,
        secure: true,
        username: 'ops',
        password: MASK_VALUE,
        from: 'noc@test.local',
        recipients: ['ops@test.local'],
      },
      webhook: { enabled: true, urls: ['https://hooks.slack.com/services/X/Y'] },
      sms: {
        enabled: false,
        provider: 'generic',
        apiUrl: '',
        apiKey: MASK_VALUE,
        accountSid: '',
        senderId: '',
        toNumbers: [],
      },
    };

    const res = await createTestAgent({ token: adminToken }).post('/api/settings/notifications').send(payload);
    expectSuccessResponse(res);

    const cfg = await getNotificationConfig(prisma);
    expect(cfg.telegram.botToken).toBe('shh-token');
    expect(cfg.email.password).toBe('smtp-secret');
  });

  it('POST menonaktifkan & menambah daftar webhook baru', async () => {
    const payload = {
      telegram: { enabled: false, botToken: MASK_VALUE, chatIds: ['-100111'] },
      webhook: { enabled: true, urls: ['https://discord.com/api/webhooks/AAA/BBB'] },
    };
    const res = await createTestAgent({ token: adminToken }).post('/api/settings/notifications').send(payload);
    const data = expectSuccessResponse(res);
    expect(data.telegram.enabled).toBe(false);
    expect(data.webhook.urls).toEqual(['https://discord.com/api/webhooks/AAA/BBB']);
  });

  it('POST menyimpan minSeverity tiap kanal', async () => {
    const payload = {
      telegram: { enabled: true, botToken: 'tok-123', chatIds: ['-100111'], minSeverity: 'HIGH' },
      email: { enabled: true, host: 'smtp.test.local', port: 465, secure: true, username: '', password: '', from: 'n@t.local', recipients: ['a@b.local'], minSeverity: 'CRITICAL' },
      webhook: { enabled: true, urls: ['https://hooks.slack.com/X'], minSeverity: 'MEDIUM' },
      sms: { enabled: false, provider: 'generic', apiUrl: '', apiKey: '', accountSid: '', senderId: '', toNumbers: [], minSeverity: 'LOW' },
      siem: { enabled: true, urls: ['https://splunk.test:8088'], token: 'tok', format: 'generic', minSeverity: 'HIGH' },
    };
    const res = await createTestAgent({ token: adminToken }).post('/api/settings/notifications').send(payload);
    const data = expectSuccessResponse(res);
    expect(data.telegram.minSeverity).toBe('HIGH');
    expect(data.email.minSeverity).toBe('CRITICAL');
    expect(data.webhook.minSeverity).toBe('MEDIUM');
    expect(data.siem.minSeverity).toBe('HIGH');
  });

  it('POST dengan minSeverity invalid → 400', async () => {
    const res = await createTestAgent({ token: adminToken }).post('/api/settings/notifications').send({
      telegram: { enabled: true, botToken: 't', chatIds: ['1'], minSeverity: 'EXTREME' },
    });
    expectErrorResponse(res, 400);
  });

  it('POST /api/settings/notifications/test tanpa sesi → 401', async () => {
    const res = await createTestAgent().post('/api/settings/notifications/test').send({ channel: 'webhook' });
    expectErrorResponse(res, 401);
  });

  it('POST /api/settings/notifications/test dengan channel tidak valid → 400', async () => {
    const res = await createTestAgent({ token: adminToken }).post('/api/settings/notifications/test').send({ channel: 'pagerduty' });
    expectErrorResponse(res, 400);
  });

  it('GET /api/settings/alert-policies → 200 dengan default', async () => {
    const res = await createTestAgent({ token: adminToken }).get('/api/settings/alert-policies');
    const data = expectSuccessResponse(res);
    expect(data.ackSlaMinutes).toBeGreaterThan(0);
    expect(Array.isArray(data.escalationStages)).toBe(true);
  });

  it('POST /api/settings/alert-policies menyimpan stage eskalasi', async () => {
    const payload = {
      ackSlaMinutes: 20,
      resolveSlaMinutes: 90,
      renotifyIntervalMinutes: 15,
      escalationStages: [
        { afterMinutes: 20, severity: 'HIGH' },
        { afterMinutes: 60, severity: 'CRITICAL' },
      ],
    };
    const res = await createTestAgent({ token: adminToken }).post('/api/settings/alert-policies').send(payload);
    const data = expectSuccessResponse(res);
    expect(data.ackSlaMinutes).toBe(20);
    expect(data.resolveSlaMinutes).toBe(90);
    expect(data.escalationStages).toHaveLength(2);
    expect(data.escalationStages[1].severity).toBe('CRITICAL');
  });
});