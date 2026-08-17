#!/usr/bin/env tsx
/**
 * Demo Seed Script
 * Populate database dengan device demo + riwayat metric 24 jam + alert contoh
 * Idempotent: aman dijalankan berulang (upsert)
 */

import { PrismaClient, DeviceType, Prisma, MetricSource, Device } from '@prisma/client';
import { encrypt } from '../src/lib/encryption';

const prisma = new PrismaClient();

function log(level: 'INFO' | 'WARN' | 'SUCCESS', message: string): void {
  const icon = { INFO: '🔵', WARN: '⚠️', SUCCESS: '✅' };
  console.log(`${icon[level]} ${message}`);
}

// ─── Config ───────────────────────────────────────────────────────────────────
const SETTING_KEY = 'demo:generator:enabled';

// ─── Device definitions ──────────────────────────────────────────────────────
const demoDevices = [
  // ICMP UP (reachable public IPs)
  {
    name: 'Google DNS Demo',
    ip: '8.8.8.8',
    type: 'SERVER' as DeviceType,
    vendor: 'Google',
    model: 'Public DNS',
    location: 'Global Anycast',
    description: '🎭 DEMO: Public DNS for testing ICMP UP status',
    isDemo: true,
  },
  {
    name: 'Google DNS 2 Demo',
    ip: '8.8.4.4',
    type: 'SERVER' as DeviceType,
    vendor: 'Google',
    model: 'Public DNS Alt',
    location: 'Global Anycast',
    description: '🎭 DEMO: Public DNS for testing ICMP UP status',
    isDemo: true,
  },
  {
    name: 'Cloudflare DNS Demo',
    ip: '1.1.1.1',
    type: 'SERVER' as DeviceType,
    vendor: 'Cloudflare',
    model: '1.1.1.1 Service',
    location: 'Global Anycast',
    description: '🎭 DEMO: Public DNS for testing ICMP UP status',
    isDemo: true,
  },
  {
    name: 'Cloudflare DNS 2 Demo',
    ip: '1.0.0.1',
    type: 'SERVER' as DeviceType,
    vendor: 'Cloudflare',
    model: '1.0.0.1 Service',
    location: 'Global Anycast',
    description: '🎭 DEMO: Public DNS for testing ICMP UP status',
    isDemo: true,
  },
  {
    name: 'Quad9 DNS Demo',
    ip: '9.9.9.9',
    type: 'SERVER' as DeviceType,
    vendor: 'Quad9',
    model: 'Secure DNS',
    location: 'Global Anycast',
    description: '🎭 DEMO: Public DNS for testing ICMP UP status',
    isDemo: true,
  },
  {
    name: 'Localhost Demo',
    ip: '127.0.0.1',
    type: 'SERVER' as DeviceType,
    vendor: 'Local',
    model: 'Loopback',
    location: 'Local Machine',
    description: '🎭 DEMO: Localhost for testing minimal latency + SNMP agent',
    isDemo: true,
  },

  // ICMP DOWN (fictitious private IPs)
  {
    name: 'Core Router Jakarta (Demo Fiktif)',
    ip: '10.10.1.1',
    type: 'ROUTER' as DeviceType,
    vendor: 'Cisco',
    model: 'ASR1000',
    location: 'DC Jakarta',
    description: '🎭 DEMO: Fictitious device (unreachable, always DOWN)',
    isDemo: true,
  },
  {
    name: 'Switch Bandung (Demo Fiktif)',
    ip: '10.10.2.1',
    type: 'SWITCH' as DeviceType,
    vendor: 'Juniper',
    model: 'EX4300',
    location: 'DC Bandung',
    description: '🎭 DEMO: Fictitious device (unreachable, always DOWN)',
    isDemo: true,
  },
  {
    name: 'OLT Surabaya (Demo Fiktif)',
    ip: '10.10.3.1',
    type: 'OLT' as DeviceType,
    vendor: 'ZTE',
    model: 'C320',
    location: 'POP Surabaya',
    description: '🎭 DEMO: Fictitious device (unreachable, always DOWN)',
    isDemo: true,
  },
  {
    name: 'Core Router Medan (Demo Fiktif)',
    ip: '10.10.4.1',
    type: 'ROUTER' as DeviceType,
    vendor: 'MikroTik',
    model: 'CCR1036',
    location: 'DC Medan',
    description: '🎭 DEMO: Fictitious device (unreachable, always DOWN)',
    isDemo: true,
  },
  {
    name: 'Switch Makassar (Demo Fiktif)',
    ip: '10.10.5.1',
    type: 'SWITCH' as DeviceType,
    vendor: 'Huawei',
    model: 'S5700',
    location: 'DC Makassar',
    description: '🎭 DEMO: Fictitious device (unreachable, always DOWN)',
    isDemo: true,
  },
  {
    name: 'Firewall Batam (Demo Fiktif)',
    ip: '10.10.6.1',
    type: 'FIREWALL' as DeviceType,
    vendor: 'Fortinet',
    model: 'FortiGate 200F',
    location: 'POP Batam',
    description: '🎭 DEMO: Fictitious device (unreachable, always DOWN)',
    isDemo: true,
  },
  {
    name: 'OLT Semarang (Demo Fiktif)',
    ip: '10.10.7.1',
    type: 'OLT' as DeviceType,
    vendor: 'Huawei',
    model: 'MA5608T',
    location: 'POP Semarang',
    description: '🎭 DEMO: Fictitious device (unreachable, always DOWN)',
    isDemo: true,
  },

  // SNMP devices (loopback agents)
  {
    name: 'SNMP Agent Lab 1',
    ip: '127.0.0.2',
    type: 'ROUTER' as DeviceType,
    vendor: 'Virtual',
    model: 'SNMP Simulator',
    location: 'Local Lab',
    description: '🎭 DEMO: SNMP agent simulator (requires snmpd on 127.0.0.2:1161)',
    isDemo: true,
    snmpCommunity: 'public',
    snmpPort: 1161,
  },
  {
    name: 'SNMP Agent Lab 2',
    ip: '127.0.0.3',
    type: 'SWITCH' as DeviceType,
    vendor: 'Virtual',
    model: 'SNMP Simulator',
    location: 'Local Lab',
    description: '🎭 DEMO: SNMP agent simulator (requires snmpd on 127.0.0.3:1162)',
    isDemo: true,
    snmpCommunity: 'public',
    snmpPort: 1162,
  },
  {
    name: 'SNMP Agent Lab 3',
    ip: '127.0.0.4',
    type: 'SERVER' as DeviceType,
    vendor: 'Virtual',
    model: 'SNMP Simulator',
    location: 'Local Lab',
    description: '🎭 DEMO: SNMP agent simulator (requires snmpd on 127.0.0.4:1163)',
    isDemo: true,
    snmpCommunity: 'public',
    snmpPort: 1163,
  },
  {
    name: 'SNMP Agent Lab 4',
    ip: '127.0.0.5',
    type: 'FIREWALL' as DeviceType,
    vendor: 'Virtual',
    model: 'SNMP Simulator',
    location: 'Local Lab',
    description: '🎭 DEMO: SNMP agent simulator (requires snmpd on 127.0.0.5:1164)',
    isDemo: true,
    snmpCommunity: 'public',
    snmpPort: 1164,
  },
  {
    name: 'SNMP Agent Lab 5',
    ip: '127.0.0.6',
    type: 'OLT' as DeviceType,
    vendor: 'Virtual',
    model: 'SNMP Simulator',
    location: 'Local Lab',
    description: '🎭 DEMO: SNMP agent simulator (requires snmpd on 127.0.0.6:1165)',
    isDemo: true,
    snmpCommunity: 'public',
    snmpPort: 1165,
  },
];

// ─── Random walk generator (for realistic metrics) ───────────────────────────
function randomWalk(initial: number, step: number, min: number, max: number): number {
  const change = (Math.random() - 0.5) * 2 * step;
  return Math.max(min, Math.min(max, initial + change));
}

// ─── Main seed function ──────────────────────────────────────────────────────
async function main() {
  log('INFO', 'Starting demo seed...');

  // 1. Upsert devices
  log('INFO', `Upserting ${demoDevices.length} demo devices...`);
  const createdDevices: Device[] = [];

  for (const dev of demoDevices) {
    const { snmpCommunity, snmpPort, ...deviceData } = dev;

    const device = await prisma.device.upsert({
      where: { ip: dev.ip },
      update: {
        name: dev.name,
        type: dev.type,
        vendor: dev.vendor,
        model: dev.model,
        location: dev.location,
        description: dev.description,
        isDemo: dev.isDemo,
        status: 'UNKNOWN',
      },
      create: {
        ...deviceData,
        status: 'UNKNOWN',
      },
    });

    // Create or update SNMP credentials if provided
    if (snmpCommunity) {
      await prisma.credential.upsert({
        where: { deviceId: device.id },
        update: {
          snmpVersion: 'v2c',
          snmpCommunity: encrypt(snmpCommunity),
          snmpPort: snmpPort ?? 161,
        },
        create: {
          deviceId: device.id,
          snmpVersion: 'v2c',
          snmpCommunity: encrypt(snmpCommunity),
          snmpPort: snmpPort ?? 161,
        },
      });
    }

    createdDevices.push(device);
    log('SUCCESS', `  ${device.name} (${device.ip})`);
  }

  // 2. Generate 24h metric history (optimized batch insert)
  log('INFO', 'Generating 24h metric history...');
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const dataPoints = 60; // 20-minute intervals for 24h
  const interval = (24 * HOUR) / dataPoints;

  // Derive reachable & SNMP device sets from definitions (not hardcoded)
  const reachableIps = new Set(demoDevices.filter((d) => !d.ip.startsWith('10.10')).map((d) => d.ip));
  const snmpIps = new Set(demoDevices.filter((d) => d.snmpCommunity).map((d) => d.ip));

  const metricsToCreate: Array<{
    deviceId: string;
    timestamp: Date;
    metricType: string;
    source: MetricSource;
    latency?: number | null;
    packetLoss?: number;
    cpuUtil?: number;
    memUtil?: number;
    interfaceData?: Prisma.InputJsonValue;
  }> = [];

  for (const device of createdDevices) {
    const isReachable = reachableIps.has(device.ip);
    const isSnmp = snmpIps.has(device.ip);

    let latency = isReachable ? 20 + Math.random() * 30 : null;
    let cpuUtil = 30 + Math.random() * 20;
    let memUtil = 40 + Math.random() * 20;

    // Cumulative octet counters for realistic bandwidth
    let inOctets1  = Math.floor(Math.random() * 1e9);
    let outOctets1 = Math.floor(Math.random() * 1e9);
    let inOctets2  = Math.floor(Math.random() * 5e8);
    let outOctets2 = Math.floor(Math.random() * 5e8);

    for (let i = 0; i < dataPoints; i++) {
      const timestamp = new Date(now - (dataPoints - i) * interval);

      // Random walk for realistic variation
      if (latency !== null) latency = randomWalk(latency, 5, 5, 100);
      cpuUtil = randomWalk(cpuUtil, 5, 10, 95);
      memUtil = randomWalk(memUtil, 5, 20, 90);

      // Occasional downtime for demo (5% chance for fictitious IPs)
      const isDown = !isReachable || (Math.random() < 0.05);

      // ICMP metrics
      metricsToCreate.push({
        deviceId: device.id,
        timestamp,
        metricType: 'ICMP',
        source: MetricSource.DEMO,
        latency: isDown ? null : latency,
        packetLoss: isDown ? 100 : 0,
      });

      // SNMP metrics (for SNMP devices)
      if (isSnmp && !isDown) {
        // Simulate realistic bandwidth increments per interval
        // interval is in ms, convert to seconds
        const intervalSec = interval / 1000;
        const inBps1  = Math.floor(randomWalk(50_000_000, 20_000_000, 1_000_000, 200_000_000));
        const outBps1 = Math.floor(randomWalk(30_000_000, 15_000_000, 1_000_000, 150_000_000));
        const inBps2  = Math.floor(randomWalk(10_000_000, 5_000_000,   100_000,  50_000_000));
        const outBps2 = Math.floor(randomWalk(5_000_000,  3_000_000,   100_000,  30_000_000));

        inOctets1  += Math.floor(inBps1  * intervalSec / 8);
        outOctets1 += Math.floor(outBps1 * intervalSec / 8);
        inOctets2  += Math.floor(inBps2  * intervalSec / 8);
        outOctets2 += Math.floor(outBps2 * intervalSec / 8);

        // Handle 64-bit counter wrap
        const MAX64 = 18446744073709551616;
        if (inOctets1  >= MAX64) inOctets1  %= MAX64;
        if (outOctets1 >= MAX64) outOctets1 %= MAX64;
        if (inOctets2  >= MAX64) inOctets2  %= MAX64;
        if (outOctets2 >= MAX64) outOctets2 %= MAX64;

        const interfaces = [
          {
            index: 1,
            name: 'eth0',
            operStatus: 1,
            speed: 1000000000,
            inOctets: inOctets1,
            outOctets: outOctets1,
            inErrors: Math.floor(Math.random() * 100),
            outErrors: Math.floor(Math.random() * 50),
          },
          {
            index: 2,
            name: 'eth1',
            operStatus: 1,
            speed: 1000000000,
            inOctets: inOctets2,
            outOctets: outOctets2,
            inErrors: 0,
            outErrors: 0,
          },
        ];

        metricsToCreate.push({
          deviceId: device.id,
          timestamp,
          metricType: 'SNMP',
          source: MetricSource.DEMO,
          cpuUtil,
          memUtil,
          interfaceData: interfaces,
        });
      }
    }
  }

  // Batch insert
  log('INFO', `Inserting ${metricsToCreate.length} metrics in batches...`);
  const batchSize = 100;
  for (let i = 0; i < metricsToCreate.length; i += batchSize) {
    const batch = metricsToCreate.slice(i, i + batchSize);
    await prisma.metric.createMany({ data: batch });
    process.stdout.write(`\r  Progress: ${Math.min(i + batchSize, metricsToCreate.length)}/${metricsToCreate.length}`);
  }
  console.log('');
  log('SUCCESS', `Generated ${metricsToCreate.length} metric records`);

  // 3. Create sample alerts (varied types, severities, statuses)
  log('INFO', 'Creating sample alerts...');

  const findDevice = (ip: string) => createdDevices.find((d) => d.ip === ip);

  const alertDefs: Array<{
    id: string;
    type: 'DEVICE_DOWN' | 'DEVICE_UP' | 'HIGH_UTILIZATION' | 'ANOMALY_DETECTED' | 'BACKUP_FAILED';
    ip: string;
    message: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status: 'ACTIVE' | 'RESOLVED' | 'ACKNOWLEDGED';
    hoursAgo: number;
    resolvedHoursAgo?: number;
    acknowledgedHoursAgo?: number;
  }> = [
    {
      id: 'demo-alert-1',
      type: 'DEVICE_DOWN',
      ip: '10.10.1.1',
      message: 'Core Router Jakarta (10.10.1.1) is unreachable',
      severity: 'HIGH',
      status: 'ACTIVE',
      hoursAgo: 3,
    },
    {
      id: 'demo-alert-2',
      type: 'HIGH_UTILIZATION',
      ip: '127.0.0.2',
      message: 'CPU utilization on SNMP Agent Lab 1 reached 92%',
      severity: 'MEDIUM',
      status: 'RESOLVED',
      hoursAgo: 6,
      resolvedHoursAgo: 5,
    },
    {
      id: 'demo-alert-3',
      type: 'DEVICE_DOWN',
      ip: '10.10.4.1',
      message: 'Core Router Medan (10.10.4.1) is unreachable',
      severity: 'HIGH',
      status: 'ACTIVE',
      hoursAgo: 1,
    },
    {
      id: 'demo-alert-4',
      type: 'HIGH_UTILIZATION',
      ip: '127.0.0.3',
      message: 'Memory utilization on SNMP Agent Lab 2 reached 94%',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      hoursAgo: 2,
    },
    {
      id: 'demo-alert-5',
      type: 'ANOMALY_DETECTED',
      ip: '127.0.0.4',
      message: 'Anomaly detected on SNMP Agent Lab 3: traffic spike outside expected range',
      severity: 'HIGH',
      status: 'ACKNOWLEDGED',
      hoursAgo: 8,
      acknowledgedHoursAgo: 7,
    },
    {
      id: 'demo-alert-6',
      type: 'BACKUP_FAILED',
      ip: '10.10.2.1',
      message: 'Config backup failed for Switch Bandung: SSH connection timeout',
      severity: 'MEDIUM',
      status: 'ACTIVE',
      hoursAgo: 5,
    },
    {
      id: 'demo-alert-7',
      type: 'DEVICE_DOWN',
      ip: '10.10.3.1',
      message: 'OLT Surabaya (10.10.3.1) was unreachable, now recovered',
      severity: 'HIGH',
      status: 'RESOLVED',
      hoursAgo: 12,
      resolvedHoursAgo: 11,
    },
    {
      id: 'demo-alert-8',
      type: 'DEVICE_UP',
      ip: '8.8.4.4',
      message: 'Google DNS 2 (8.8.4.4) recovered and is now reachable',
      severity: 'MEDIUM',
      status: 'RESOLVED',
      hoursAgo: 20,
      resolvedHoursAgo: 20,
    },
  ];

  let alertsCreated = 0;
  for (const a of alertDefs) {
    const device = findDevice(a.ip);
    if (!device) {
      log('WARN', `  Alert ${a.id}: device ${a.ip} not found, skipped`);
      continue;
    }

    await prisma.alert.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id,
        type: a.type,
        deviceId: device.id,
        message: `🎭 DEMO: ${a.message}`,
        severity: a.severity,
        status: a.status,
        createdAt: new Date(now - a.hoursAgo * HOUR),
        resolvedAt: a.resolvedHoursAgo !== undefined ? new Date(now - a.resolvedHoursAgo * HOUR) : null,
        acknowledgedAt: a.acknowledgedHoursAgo !== undefined ? new Date(now - a.acknowledgedHoursAgo * HOUR) : null,
      },
    });
    alertsCreated++;
    log('SUCCESS', `  ${a.type} (${a.status}) → ${a.ip}`);
  }

  log('SUCCESS', `Created ${alertsCreated} alerts`);

  // 4. Enable demo generator by default
  log('INFO', 'Enabling demo generator...');
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value: { enabled: true } },
    create: { key: SETTING_KEY, value: { enabled: true } },
  });
  log('SUCCESS', 'Demo generator enabled');

  log('SUCCESS', '🎉 Demo seed completed!');
  console.log('');
  console.log('📝 Summary:');
  console.log(`   Demo Devices: ${createdDevices.length}`);
  console.log(`   Metrics: ${metricsToCreate.length}`);
  console.log(`   Alerts: ${alertsCreated}`);
  console.log('');
  console.log('💡 Next steps:');
  console.log('   1. Start web: pnpm dev');
  console.log('   2. Start workers: pnpm dev:workers   (runs ICMP + Demo Generator)');
  console.log('      Or individually: pnpm worker:icmp && pnpm demo:generator');
  console.log('   3. (Optional) Setup SNMP agents: pnpm demo:agents');
  console.log('   4. Toggle demo mode in UI: /dashboard/devices (Admin only)');
  console.log('   5. Production: pnpm pm2:start');
  console.log('');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Demo seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
