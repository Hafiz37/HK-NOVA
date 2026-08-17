/**
 * Demo Generator Worker
 * Synthetic metric generator for demo devices
 * Writes ICMP & SNMP metrics without actual polling
 * Controlled by API /api/settings/demo-mode
 */

import cron from 'node-cron';
import { PrismaClient, Prisma, MetricSource } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Config ───────────────────────────────────────────────────────────────────
const DEMO_ICMP_INTERVAL = '*/1 * * * *'; // every 1 minute
const DEMO_SNMP_INTERVAL = '*/5 * * * *'; // every 5 minutes
const SETTING_KEY = 'demo:generator:enabled';

// ─── State ────────────────────────────────────────────────────────────────────
let isShuttingDown = false;
let isEnabled = true;

// In-memory state for random walk
const deviceState = new Map<string, { 
  latency: number; 
  cpuUtil: number; 
  memUtil: number;
  // Cumulative octet counters for realistic bandwidth calculation
  inOctets1: number;
  outOctets1: number;
  inOctets2: number;
  outOctets2: number;
}>();

// ─── Logging helper ───────────────────────────────────────────────────────────
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [DEMO-GENERATOR] [${level}] ${message}${metaStr}`);
}

// ─── Random walk helper ───────────────────────────────────────────────────────
function randomWalk(current: number, step: number, min: number, max: number): number {
  const change = (Math.random() - 0.5) * 2 * step;
  return Math.max(min, Math.min(max, current + change));
}

// ─── Production guard ─────────────────────────────────────────────────────────
function checkProductionMode(): void {
  const appMode = process.env.APP_MODE?.toLowerCase();
  if (appMode === 'production') {
    log('ERROR', 'Demo generator cannot run in production mode (APP_MODE=production). Exiting.');
    process.exit(1);
  }
}

// ─── Load enabled state from Setting model ────────────────────────────────────
async function loadEnabledState(): Promise<void> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
    });

    if (setting && setting.value) {
      const value = setting.value as { enabled?: boolean };
      isEnabled = value.enabled ?? true;
      log('INFO', `Loaded generator state from DB: ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
    } else {
      // Initialize default setting
      await prisma.setting.upsert({
        where: { key: SETTING_KEY },
        update: {},
        create: {
          key: SETTING_KEY,
          value: { enabled: true },
        },
      });
      log('INFO', 'Initialized default generator state: ENABLED');
    }
  } catch (err) {
    log('WARN', 'Failed to load generator state, defaulting to enabled', err);
  }
}

// ─── Save enabled state to Setting model ──────────────────────────────────────
// Used by API to persist state changes
async function saveEnabledState(enabled: boolean): Promise<void> {
  try {
    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: { enabled } },
      create: {
        key: SETTING_KEY,
        value: { enabled },
      },
    });
    isEnabled = enabled;
    log('INFO', `Saved generator state: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  } catch (err) {
    log('ERROR', 'Failed to save generator state', err);
  }
}

// Export for potential external use (e.g., API integration tests)
export { saveEnabledState };

// ─── Generate ICMP metrics ────────────────────────────────────────────────────
async function generateIcmpMetrics(): Promise<void> {
  if (!isEnabled) {
    log('INFO', 'Demo generator is disabled, skipping ICMP generation');
    return;
  }

  try {
    const demoDevices = await prisma.device.findMany({
      where: { isDemo: true, deletedAt: null, status: { not: 'MAINTENANCE' } },
      select: { id: true, name: true, ip: true },
    });

    if (demoDevices.length === 0) {
      log('INFO', 'No demo devices found');
      return;
    }

    const metricsToCreate: Array<{
      deviceId: string;
      timestamp: Date;
      metricType: string;
      source: MetricSource;
      latency: number | null;
      packetLoss: number;
    }> = [];

    for (const device of demoDevices) {
      // Fictitious demo devices use 10.10.x.x (always DOWN); everything else is reachable
      const isReachable = !device.ip.startsWith('10.10');

      // Initialize or retrieve state
      if (!deviceState.has(device.id)) {
        deviceState.set(device.id, {
          latency: 20 + Math.random() * 30,
          cpuUtil: 30 + Math.random() * 20,
          memUtil: 40 + Math.random() * 20,
          inOctets1:  Math.floor(Math.random() * 1e9),
          outOctets1: Math.floor(Math.random() * 1e9),
          inOctets2:  Math.floor(Math.random() * 5e8),
          outOctets2: Math.floor(Math.random() * 5e8),
        });
      }

      const state = deviceState.get(device.id)!;

      // Random walk
      if (isReachable) {
        state.latency = randomWalk(state.latency, 5, 5, 100);
      }

      // Occasional downtime (5% chance for unreachable IPs)
      const isDown = !isReachable || Math.random() < 0.02;

      metricsToCreate.push({
        deviceId: device.id,
        timestamp: new Date(),
        metricType: 'ICMP',
        source: MetricSource.GENERATOR,
        latency: isDown ? null : state.latency,
        packetLoss: isDown ? 100 : 0,
      });

      // Update device status
      await prisma.device.update({
        where: { id: device.id },
        data: { status: isDown ? 'DOWN' : 'UP' },
      });
    }

    await prisma.metric.createMany({ data: metricsToCreate });
    log('INFO', `Generated ${metricsToCreate.length} ICMP metrics for demo devices`);
  } catch (err) {
    log('ERROR', 'Failed to generate ICMP metrics', err instanceof Error ? err.message : err);
  }
}

// ─── Generate SNMP metrics ────────────────────────────────────────────────────
async function generateSnmpMetrics(): Promise<void> {
  if (!isEnabled) {
    log('INFO', 'Demo generator is disabled, skipping SNMP generation');
    return;
  }

  try {
    const snmpDevices = await prisma.device.findMany({
      where: {
        isDemo: true,
        deletedAt: null,
        status: { not: 'MAINTENANCE' },
        ip: { startsWith: '127.0.0.' },
        credentials: { isNot: null },
      },
      select: { id: true, name: true, ip: true },
    });

    if (snmpDevices.length === 0) {
      log('INFO', 'No demo SNMP devices found');
      return;
    }

    const metricsToCreate: Array<{
      deviceId: string;
      timestamp: Date;
      metricType: string;
      source: MetricSource;
      cpuUtil: number;
      memUtil: number;
      interfaceData: Prisma.InputJsonValue;
    }> = [];

    for (const device of snmpDevices) {
      // Initialize or retrieve state
      if (!deviceState.has(device.id)) {
        deviceState.set(device.id, {
          latency: 20 + Math.random() * 30,
          cpuUtil: 30 + Math.random() * 20,
          memUtil: 40 + Math.random() * 20,
          // Start with realistic initial counter values
          inOctets1:  Math.floor(Math.random() * 1e9),
          outOctets1: Math.floor(Math.random() * 1e9),
          inOctets2:  Math.floor(Math.random() * 5e8),
          outOctets2: Math.floor(Math.random() * 5e8),
        });
      }

      const state = deviceState.get(device.id)!;

      // Random walk for CPU/MEM
      state.cpuUtil = randomWalk(state.cpuUtil, 5, 10, 95);
      state.memUtil = randomWalk(state.memUtil, 5, 20, 90);

      // Simulate realistic bandwidth: add random increments to counters
      // ~10-100 Mbps average traffic
      const inBps1  = Math.floor(randomWalk(50_000_000, 20_000_000, 1_000_000, 200_000_000));
      const outBps1 = Math.floor(randomWalk(30_000_000, 15_000_000, 1_000_000, 150_000_000));
      const inBps2  = Math.floor(randomWalk(10_000_000, 5_000_000,   100_000,  50_000_000));
      const outBps2 = Math.floor(randomWalk(5_000_000,  3_000_000,   100_000,  30_000_000));

      // 5-minute interval = 300 seconds
      const intervalSec = 300;
      state.inOctets1  += Math.floor(inBps1  * intervalSec / 8);
      state.outOctets1 += Math.floor(outBps1 * intervalSec / 8);
      state.inOctets2  += Math.floor(inBps2  * intervalSec / 8);
      state.outOctets2 += Math.floor(outBps2 * intervalSec / 8);

      // Handle 64-bit counter wrap (2^64)
      const MAX64 = 18446744073709551616;
      if (state.inOctets1  >= MAX64) state.inOctets1  %= MAX64;
      if (state.outOctets1 >= MAX64) state.outOctets1 %= MAX64;
      if (state.inOctets2  >= MAX64) state.inOctets2  %= MAX64;
      if (state.outOctets2 >= MAX64) state.outOctets2 %= MAX64;

      // Generate interface data with cumulative counters
      const interfaces = [
        {
          index: 1,
          name: 'eth0',
          operStatus: 1,
          speed: 1000000000,
          inOctets: state.inOctets1,
          outOctets: state.outOctets1,
          inErrors: Math.floor(Math.random() * 100),
          outErrors: Math.floor(Math.random() * 50),
        },
        {
          index: 2,
          name: 'eth1',
          operStatus: 1,
          speed: 1000000000,
          inOctets: state.inOctets2,
          outOctets: state.outOctets2,
          inErrors: 0,
          outErrors: 0,
        },
      ];

      metricsToCreate.push({
        deviceId: device.id,
        timestamp: new Date(),
        metricType: 'SNMP',
        source: MetricSource.GENERATOR,
        cpuUtil: state.cpuUtil,
        memUtil: state.memUtil,
        interfaceData: interfaces,
      });
    }

    await prisma.metric.createMany({ data: metricsToCreate });
    log('INFO', `Generated ${metricsToCreate.length} SNMP metrics for demo devices`);
  } catch (err) {
    log('ERROR', 'Failed to generate SNMP metrics', err instanceof Error ? err.message : err);
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('INFO', `Received ${signal}, shutting down gracefully...`);

  try {
    await prisma.$disconnect();
    log('INFO', 'Prisma disconnected');
  } catch (err) {
    log('ERROR', 'Error during shutdown', err);
  }

  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

// ─── Startup ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Production guard - must run before anything else
  checkProductionMode();

  log('INFO', 'Demo Generator starting...');
  log('INFO', `ICMP interval: ${DEMO_ICMP_INTERVAL}, SNMP interval: ${DEMO_SNMP_INTERVAL}`);

  // Load initial state from DB
  await loadEnabledState();

  // Poll for state changes every 10 seconds (faster than 1 min cron)
  const statePollInterval = setInterval(() => {
    if (!isShuttingDown) {
      void loadEnabledState();
    }
  }, 10_000);

  // Run ICMP generation immediately and on schedule
  void generateIcmpMetrics();
  cron.schedule(DEMO_ICMP_INTERVAL, () => {
    if (!isShuttingDown) {
      void generateIcmpMetrics();
    }
  });

  // Run SNMP generation immediately and on schedule
  void generateSnmpMetrics();
  cron.schedule(DEMO_SNMP_INTERVAL, () => {
    if (!isShuttingDown) {
      void generateSnmpMetrics();
    }
  });

  // Cleanup on shutdown
  const originalShutdown = gracefulShutdown;
  async function wrappedShutdown(signal: string): Promise<void> {
    clearInterval(statePollInterval);
    await originalShutdown(signal);
  }
  process.on('SIGTERM', () => void wrappedShutdown('SIGTERM'));
  process.on('SIGINT', () => void wrappedShutdown('SIGINT'));

  log('INFO', 'Demo Generator is running. Press Ctrl+C to stop.');
  log('INFO', `Generator is currently: ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
}

void main();