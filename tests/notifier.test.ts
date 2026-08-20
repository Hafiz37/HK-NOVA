import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from './setup';
import { NOTIFICATION_SETTING_KEY, saveNotificationConfig, type NotificationConfig } from '@/lib/notify-config';
import { dispatchNotifications } from '@/lib/notifier';
import { NOTIFICATION_CHANNELS } from '@/lib/notify-config';

const PREFIX = `test-feed-${Date.now()}`;

const disabledConfig: NotificationConfig = {
  telegram: { enabled: false, botToken: '', chatIds: [] },
  email: { enabled: false, host: '', port: 465, secure: true, username: '', password: '', from: '', recipients: [] },
  webhook: { enabled: false, urls: [] },
  sms: { enabled: false, provider: 'generic', apiUrl: '', apiKey: '', accountSid: '', senderId: '', toNumbers: [] },
  siem: { enabled: false, urls: [], token: '', format: 'generic' },
};

describe('Notifier — dispatch behavior', () => {
  beforeAll(async () => {
    await prisma.setting.deleteMany({ where: { key: NOTIFICATION_SETTING_KEY } });
    await saveNotificationConfig(prisma, disabledConfig);
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: NOTIFICATION_SETTING_KEY } });
    await prisma.alertCooldown.deleteMany({ where: { deviceId: { startsWith: PREFIX } } });
  });

  it('tidak mengirim ke channel yang dinonaktifkan / tidak terkonfigurasi', async () => {
    const result = await dispatchNotifications(prisma, {
      type: 'DEVICE_DOWN',
      severity: 'HIGH',
      deviceId: `${PREFIX}-1`,
      deviceName: 'Router Test',
      deviceIp: '10.0.0.1',
      message: 'tidak terjangkau',
      cooldownKey: 'default',
      cooldownMs: 300_000,
    });

    expect(result.sent).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual(['telegram', 'email', 'webhook', 'sms', 'siem']);
  });

  it('tidak membuat record cooldown ketika semua channel nonaktif', async () => {
    const count = await prisma.alertCooldown.count({
      where: { deviceId: `${PREFIX}-1` },
    });
    expect(count).toBe(0);
  });

  it('mencatat hasil delivery ke AlertDelivery saat payload.alertId ada', async () => {
    const alert = await prisma.alert.create({
      data: {
        type: 'DEVICE_DOWN',
        deviceId: null,
        message: 'delivery persistence test',
        severity: 'HIGH',
        status: 'ACTIVE',
      },
    });

    const result = await dispatchNotifications(prisma, {
      type: 'DEVICE_DOWN',
      severity: 'HIGH',
      deviceId: `${PREFIX}-2`,
      deviceName: 'Router Test',
      deviceIp: '10.0.0.2',
      message: 'tidak terjangkau',
      cooldownKey: 'default',
      cooldownMs: 300_000,
      alertId: alert.id,
    });

    // Semua channel nonaktif → semua tercatat SKIPPED
    expect(result.skipped).toEqual(['telegram', 'email', 'webhook', 'sms', 'siem']);

    const deliveries = await prisma.alertDelivery.findMany({ where: { alertId: alert.id } });
    expect(deliveries).toHaveLength(NOTIFICATION_CHANNELS.length);
    expect(deliveries.every((d) => d.status === 'SKIPPED')).toBe(true);

    await prisma.alert.delete({ where: { id: alert.id } });
  });
});