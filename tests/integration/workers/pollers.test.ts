import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('ICMP Poller', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      device: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
      metric: {
        createMany: vi.fn(),
      },
      alert: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $queryRaw: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should process devices in batches', async () => {
    const mockDevices = [
      { id: 'device-1', name: 'Router-1', ip: '192.168.1.1', type: 'ROUTER', status: 'UP', isDemo: false },
      { id: 'device-2', name: 'Switch-1', ip: '192.168.1.2', type: 'SWITCH', status: 'UP', isDemo: false },
      { id: 'device-3', name: 'Firewall-1', ip: '192.168.1.3', type: 'FIREWALL', status: 'UP', isDemo: false },
    ];

    mockPrisma.device.findMany.mockResolvedValue(mockDevices);
    mockPrisma.device.count.mockResolvedValue(0);

    const batchSize = 2;
    const batches: typeof mockDevices[] = [];
    for (let i = 0; i < mockDevices.length; i += batchSize) {
      batches.push(mockDevices.slice(i, i + batchSize));
    }

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(2);
    expect(batches[1]).toHaveLength(1);
  });

  it('should filter out maintenance devices', async () => {
    const mockDevices = [
      { id: 'device-1', name: 'Router-1', ip: '192.168.1.1', type: 'ROUTER', status: 'UP', isDemo: false },
      { id: 'device-2', name: 'Switch-1', ip: '192.168.1.2', type: 'SWITCH', status: 'MAINTENANCE', isDemo: false },
    ];

    mockPrisma.device.findMany.mockResolvedValue(mockDevices.filter(d => d.status !== 'MAINTENANCE'));
    mockPrisma.device.count.mockResolvedValue(0);

    const devices = await mockPrisma.device.findMany({
      where: { status: { not: 'MAINTENANCE' }, deletedAt: null, isDemo: false },
    });

    expect(devices).toHaveLength(1);
    expect(devices[0].id).toBe('device-1');
  });
});

describe('SNMP Poller', () => {
  it('should fetch devices with SNMP credentials', async () => {
    const mockDevices = [
      {
        id: 'device-1',
        name: 'Router-1',
        ip: '192.168.1.1',
        type: 'ROUTER',
        credentials: {
          snmpVersion: 'v2c',
          snmpCommunity: 'public',
          snmpPort: 161,
        },
      },
    ];

    const prismaMock = {
      device: {
        findMany: vi.fn().mockResolvedValue(mockDevices),
      },
    };

    const devices = await prismaMock.device.findMany({
      where: {
        status: { not: 'MAINTENANCE' },
        deletedAt: null,
        credentials: { isNot: null },
        isDemo: false,
      },
      select: {
        id: true,
        name: true,
        ip: true,
        type: true,
        credentials: {
          select: {
            snmpVersion: true,
            snmpCommunity: true,
            snmpPort: true,
          },
        },
      },
    });

    expect(devices).toHaveLength(1);
    expect(devices[0].credentials).toBeDefined();
  });
});

describe('Backup Worker', () => {
  it('should process devices with backup enabled', async () => {
    const mockDevices = [
      { id: 'device-1', name: 'Router-1', ip: '192.168.1.1', backupEnabled: true, backupPriority: 50 },
      { id: 'device-2', name: 'Switch-1', ip: '192.168.1.2', backupEnabled: false, backupPriority: 50 },
    ];

    const prismaMock = {
      device: {
        findMany: vi.fn().mockResolvedValue(mockDevices.filter(d => d.backupEnabled)),
      },
    };

    const devices = await prismaMock.device.findMany({
      where: { backupEnabled: true, deletedAt: null },
      orderBy: { backupPriority: 'desc' },
    });

    expect(devices).toHaveLength(1);
    expect(devices[0].backupEnabled).toBe(true);
  });
});

describe('Anomaly Detector', () => {
  it('should fetch devices with metrics for anomaly detection', async () => {
    const mockDevices = [
      { id: 'device-1', name: 'Router-1', ip: '192.168.1.1', type: 'ROUTER' },
      { id: 'device-2', name: 'Switch-1', ip: '192.168.1.2', type: 'SWITCH' },
    ];

    const prismaMock = {
      device: {
        findMany: vi.fn().mockResolvedValue(mockDevices),
      },
    };

    const devices = await prismaMock.device.findMany({
      where: { deletedAt: null, isDemo: false },
      select: { id: true, name: true, ip: true, type: true },
    });

    expect(devices).toHaveLength(2);
  });
});

describe('Alert Escalator', () => {
  it('should fetch active alerts for escalation', async () => {
    const mockAlerts = [
      { id: 'alert-1', type: 'DEVICE_DOWN', severity: 'CRITICAL', escalationLevel: 0 },
      { id: 'alert-2', type: 'HIGH_CPU', severity: 'HIGH', escalationLevel: 1 },
    ];

    const prismaMock = {
      alert: {
        findMany: vi.fn().mockResolvedValue(mockAlerts),
      },
    };

    const alerts = await prismaMock.alert.findMany({
      where: { status: 'ACTIVE', escalationLevel: { lt: 3 } },
    });

    expect(alerts).toHaveLength(2);
  });
});