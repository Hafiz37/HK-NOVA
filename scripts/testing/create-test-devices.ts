#!/usr/bin/env node

/**
 * Test Device Generator for Load Testing
 * Creates dummy devices in database for testing with 50-500 devices
 * 
 * Usage:
 *   node scripts/create-test-devices.js --count=500
 *   node scripts/create-test-devices.js --count=50 --clean
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

interface CreateTestDevicesOptions {
  count: number;
  clean: boolean;
  startIp?: string;
  prefix?: string;
}

function parseArgs(): CreateTestDevicesOptions {
  const args = process.argv.slice(2);
  const options: CreateTestDevicesOptions = {
    count: 100,
    clean: false,
    startIp: '10.0.0.1',
    prefix: 'TEST',
  };

  for (const arg of args) {
    if (arg.startsWith('--count=')) {
      options.count = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--clean') {
      options.clean = true;
    } else if (arg.startsWith('--start-ip=')) {
      options.startIp = arg.split('=')[1];
    } else if (arg.startsWith('--prefix=')) {
      options.prefix = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node scripts/create-test-devices.js [options]

Options:
  --count=N         Number of test devices to create (default: 100)
  --clean           Delete existing test devices before creating new ones
  --start-ip=IP     Starting IP address (default: 10.0.0.1)
  --prefix=PREFIX   Device name prefix (default: TEST)
  --help, -h        Show this help message

Examples:
  node scripts/create-test-devices.js --count=500
  node scripts/create-test-devices.js --count=50 --clean
  node scripts/create-test-devices.js --count=200 --prefix=LOAD-TEST
`);
      process.exit(0);
    }
  }

  return options;
}

function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
}

function numberToIp(num: number): string {
  return [
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff,
  ].join('.');
}

function getNextIp(currentIp: string): string {
  return numberToIp(ipToNumber(currentIp) + 1);
}

function getDeviceType(index: number): 'ROUTER' | 'SWITCH' | 'OLT' {
  const mod = index % 10;
  if (mod < 6) return 'ROUTER';
  if (mod < 9) return 'SWITCH';
  return 'OLT';
}

async function cleanTestDevices(prefix: string): Promise<number> {
  console.log(`🗑️  Cleaning existing test devices with prefix "${prefix}"...`);
  
  const devices = await prisma.device.findMany({
    where: {
      name: {
        startsWith: prefix,
      },
    },
    select: { id: true },
  });

  if (devices.length === 0) {
    console.log('   No existing test devices found.');
    return 0;
  }

  const deviceIds = devices.map(d => d.id);

  await prisma.metric.deleteMany({
    where: { deviceId: { in: deviceIds } },
  });

  await prisma.alert.deleteMany({
    where: { deviceId: { in: deviceIds } },
  });

  await prisma.backupHistory.deleteMany({
    where: { deviceId: { in: deviceIds } },
  });

  await prisma.credential.deleteMany({
    where: { deviceId: { in: deviceIds } },
  });

  const deleted = await prisma.device.deleteMany({
    where: {
      name: {
        startsWith: prefix,
      },
    },
  });

  console.log(`   ✅ Deleted ${deleted.count} test devices and their data`);
  return deleted.count;
}

async function createTestDevices(options: CreateTestDevicesOptions): Promise<void> {
  console.log(`\n🚀 Test Device Generator`);
  console.log(`   Count: ${options.count}`);
  console.log(`   Start IP: ${options.startIp}`);
  console.log(`   Prefix: ${options.prefix}`);
  console.log(`   Clean: ${options.clean ? 'Yes' : 'No'}\n`);

  if (options.clean) {
    await cleanTestDevices(options.prefix);
    console.log('');
  }

  console.log(`📦 Creating ${options.count} test devices...`);

  let currentIp = options.startIp!;
  const batchSize = 50;
  let created = 0;

  for (let i = 0; i < options.count; i += batchSize) {
    const batch = Math.min(batchSize, options.count - i);
    const devices = [];

    for (let j = 0; j < batch; j++) {
      const index = i + j;
      const deviceType = getDeviceType(index);
      
      devices.push({
        id: randomUUID(),
        name: `${options.prefix}-${deviceType}-${(index + 1).toString().padStart(4, '0')}`,
        ip: currentIp,
        type: deviceType,
        status: 'UNKNOWN',
        location: `Test Location ${Math.floor(index / 10) + 1}`,
        description: `Test device for load testing - created by script`,
        isDemo: false,
      });

      currentIp = getNextIp(currentIp);
    }

    await prisma.device.createMany({
      data: devices,
      skipDuplicates: true,
    });

    created += batch;
    const progress = Math.round((created / options.count) * 100);
    process.stdout.write(`   Progress: ${created}/${options.count} (${progress}%) \r`);
  }

  console.log(`\n   ✅ Created ${created} test devices`);

  const summary = await prisma.device.groupBy({
    by: ['type'],
    where: {
      name: {
        startsWith: options.prefix,
      },
    },
    _count: true,
  });

  console.log('\n📊 Summary:');
  summary.forEach(s => {
    console.log(`   ${s.type}: ${s._count} devices`);
  });

  console.log(`\n✨ Test devices created successfully!`);
  console.log(`\n📝 Next Steps:`);
  console.log(`   1. Start workers: pnpm pm2:start`);
  console.log(`   2. Monitor logs: pm2 logs`);
  console.log(`   3. Check metrics: curl http://localhost:3000/api/metrics`);
  console.log(`   4. Run load tests: ./tests/load/run-tests.sh baseline\n`);
}

async function main() {
  try {
    const options = parseArgs();

    if (options.count <= 0 || options.count > 10000) {
      console.error('❌ Error: Count must be between 1 and 10000');
      process.exit(1);
    }

    await createTestDevices(options);
    
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test devices:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
