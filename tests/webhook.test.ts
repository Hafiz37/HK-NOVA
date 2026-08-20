import { describe, it, expect } from 'vitest';
import { buildWebhookBody, signWebhookBody, type WebhookPayload } from '@/lib/channels/webhook';

const payload: WebhookPayload = {
  type: 'DEVICE_DOWN',
  severity: 'HIGH',
  deviceName: 'Router Jakarta',
  deviceIp: '10.0.0.1',
  message: 'perangkat tidak terjangkau',
  timestamp: '2026-08-20T00:00:00.000Z',
  alertId: 'alert-1',
};

describe('Webhook Channel — format & signature', () => {
  it('slack: body { text }', () => {
    const body = JSON.parse(buildWebhookBody(payload, 'slack'));
    expect(body).toHaveProperty('text');
    expect(body.text).toContain('[HIGH] DEVICE_DOWN');
  });

  it('discord: body { content }', () => {
    const body = JSON.parse(buildWebhookBody(payload, 'discord'));
    expect(body).toHaveProperty('content');
  });

  it('teams: body MessageCard', () => {
    const body = JSON.parse(buildWebhookBody(payload, 'teams'));
    expect(body['@type']).toBe('MessageCard');
    expect(body.sections).toBeDefined();
  });

  it('generic: mencantumkan payload lengkap', () => {
    const body = JSON.parse(buildWebhookBody(payload, 'generic'));
    expect(body.type).toBe('DEVICE_DOWN');
    expect(body.severity).toBe('HIGH');
    expect(body.deviceName).toBe('Router Jakarta');
    expect(body.alertId).toBe('alert-1');
  });

  it('signWebhookBody menghasilkan HMAC-SHA256 deterministik', () => {
    const body = buildWebhookBody(payload, 'slack');
    const s1 = signWebhookBody(body, 'secret-abc');
    const s2 = signWebhookBody(body, 'secret-abc');
    const other = signWebhookBody(body, 'secret-xyz');
    expect(s1).toBe(s2);
    expect(s1).toMatch(/^[0-9a-f]{64}$/);
    expect(s1).not.toBe(other);
  });
});