import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from './setup';
import {
  NOTIFICATION_SETTING_KEY,
  MASK_VALUE,
  DEFAULT_NOTIFICATION_CONFIG,
  getNotificationConfig,
  saveNotificationConfig,
  toPublicNotificationConfig,
  type NotificationConfig,
} from '@/lib/notify-config';

const sampleConfig: NotificationConfig = {
  telegram: { enabled: true, botToken: 'tok-123', chatIds: ['-1001', '-1002'] },
  email: {
    enabled: true,
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    username: 'noreply',
    password: 'smtp-pass',
    from: 'noc@example.com',
    recipients: ['ops@example.com', 'admin@example.com'],
  },
  webhook: { enabled: true, urls: ['https://hooks.slack.com/A', 'https://discord.com/api/webhooks/B'] },
  sms: {
    enabled: false,
    provider: 'generic',
    apiUrl: 'https://sms.example.com/send',
    apiKey: 'sms-key',
    accountSid: '',
    senderId: 'HK-NOVA',
    toNumbers: ['+6281234567890'],
  },
  siem: { enabled: true, urls: ['https://splunk.example.com:8088/services/collector/event'], token: 'siem-token', format: 'generic' },
};

describe('Notification Config — masking helpers', () => {
  it('membuat konfigurasi default penuh', () => {
    expect(Object.keys(DEFAULT_NOTIFICATION_CONFIG)).toEqual(['telegram', 'email', 'webhook', 'sms', 'siem']);
  });

  it('menyamarkan nilai rahasia pada representasi publik', () => {
    const pub = toPublicNotificationConfig(sampleConfig );
    expect(pub.telegram.botToken).toBe(MASK_VALUE);
    expect(pub.email.password).toBe(MASK_VALUE);
    expect(pub.sms.apiKey).toBe(MASK_VALUE);
    expect(pub.telegram.chatIds).toEqual(['-1001', '-1002']);
    expect(pub.telegram.configured).toBe(true);
    expect(pub.webhook.configured).toBe(true);
  });

  it('menandai channel sebagai belum configured bila data tidak lengkap', () => {
    const pub = toPublicNotificationConfig({
      ...sampleConfig,
      email: { ...sampleConfig.email, host: '' },
    } );
    expect(pub.email.configured).toBe(false);
  });

  it('field non-rahasia tidak ikut disamarkan', () => {
    const pub = toPublicNotificationConfig(sampleConfig );
    expect(pub.email.host).toBe('smtp.example.com');
    expect(pub.sms.senderId).toBe('HK-NOVA');
  });
});

describe('Notification Config — DB round-trip (encrypted secrets)', () => {
  beforeAll(async () => {
    await prisma.setting.deleteMany({ where: { key: NOTIFICATION_SETTING_KEY } });
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: NOTIFICATION_SETTING_KEY } });
  });

  it('menghasilkan nilai default saat belum pernah disimpan', async () => {
    // Jauhkan dari env fallback agar hasil deterministik (bukan tergantung .env)
    const saved = {
      telegramChatIds: process.env.TELEGRAM_CHAT_ID,
      smtpRecipients: process.env.SMTP_RECIPIENTS,
    };
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.SMTP_RECIPIENTS;
    try {
      const cfg = await getNotificationConfig(prisma);
      expect(cfg.telegram.chatIds).toEqual([]);
      expect(cfg.email.host).toBe('');
    } finally {
      if (saved.telegramChatIds !== undefined) process.env.TELEGRAM_CHAT_ID = saved.telegramChatIds;
      if (saved.smtpRecipients !== undefined) process.env.SMTP_RECIPIENTS = saved.smtpRecipients;
    }
  });

  it('menyimpan konfigurasi dengan rahasia ter-enkripsi', async () => {
    await saveNotificationConfig(prisma, sampleConfig );

    const stored = await prisma.setting.findUnique({ where: { key: NOTIFICATION_SETTING_KEY } });
    const value = stored?.value as {
      telegram: { botToken: string };
      email: { password: string };
      sms: { apiKey: string };
    };
    // Secret disimpan ter-enkripsi (bukan plaintext)
    expect(value.telegram.botToken).not.toBe('tok-123');
    expect(value.email.password).not.toBe('smtp-pass');
    expect(value.sms.apiKey).not.toBe('sms-key');
    expect(value.telegram.botToken).toContain(':');

    const cfg = await getNotificationConfig(prisma);
    expect(cfg.telegram.botToken).toBe('tok-123');
    expect(cfg.telegram.chatIds).toEqual(['-1001', '-1002']);
    expect(cfg.email.password).toBe('smtp-pass');
    expect(cfg.sms.apiKey).toBe('sms-key');
    expect(cfg.webhook.urls.length).toBe(2);
  });

  it('mempertahankan rahasia lama saat dikirim ulang sebagai MASKED', async () => {
    const masked = {
      ...sampleConfig,
      telegram: { ...sampleConfig.telegram, botToken: MASK_VALUE },
      email: { ...sampleConfig.email, password: MASK_VALUE },
      sms: { ...sampleConfig.sms, apiKey: MASK_VALUE },
    };
    await saveNotificationConfig(prisma, masked );

    const cfg = await getNotificationConfig(prisma);
    expect(cfg.telegram.botToken).toBe('tok-123');
    expect(cfg.email.password).toBe('smtp-pass');
    expect(cfg.sms.apiKey).toBe('sms-key');
  });

  it('menghapus rahasia saat dikirim kosong', async () => {
    const cleared = {
      ...sampleConfig,
      email: { ...sampleConfig.email, password: '' },
      sms: { ...sampleConfig.sms, apiKey: '' },
    };
    await saveNotificationConfig(prisma, cleared );

    const cfg = await getNotificationConfig(prisma);
    expect(cfg.email.password).toBe('');
    expect(cfg.sms.apiKey).toBe('');
  });
});