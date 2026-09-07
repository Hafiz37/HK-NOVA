import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';

function getDeviceBackupSlot(deviceId: string): number {
  const hash = createHash('md5').update(deviceId).digest('hex');
  const slot = parseInt(hash.substring(0, 8), 16) % (4 * 60);
  return slot;
}

describe('Backup Distribution', () => {
  it('should distribute 500 devices across 240-minute window', () => {
    const deviceIds = Array(500).fill(null).map((_, i) => `device-${i}`);
    const slots = deviceIds.map(id => getDeviceBackupSlot(id));

    const minSlot = Math.min(...slots);
    const maxSlot = Math.max(...slots);

    expect(minSlot).toBeGreaterThanOrEqual(0);
    expect(maxSlot).toBeLessThan(240);
  });

  it('should distribute evenly across time slots', () => {
    const deviceIds = Array(500).fill(null).map((_, i) => `device-${i}`);
    const slots = deviceIds.map(id => getDeviceBackupSlot(id));

    const buckets = Array(24).fill(0);
    slots.forEach(slot => {
      const bucketIndex = Math.floor(slot / 10);
      buckets[bucketIndex]++;
    });

    const avg = 500 / 24;
    buckets.forEach(count => {
      expect(count).toBeGreaterThan(avg * 0.5);
      expect(count).toBeLessThan(avg * 1.5);
    });
  });

  it('should be deterministic for same device ID', () => {
    const deviceId = 'test-device-123';
    
    const slot1 = getDeviceBackupSlot(deviceId);
    const slot2 = getDeviceBackupSlot(deviceId);

    expect(slot1).toBe(slot2);
  });

  it('should produce different slots for different devices', () => {
    const deviceIds = Array(100).fill(null).map((_, i) => `device-${i}`);
    const slots = deviceIds.map(id => getDeviceBackupSlot(id));
    const uniqueSlots = new Set(slots);

    expect(uniqueSlots.size).toBeGreaterThan(50);
  });
});
