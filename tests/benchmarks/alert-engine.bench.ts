import Benchmark from 'benchmark';
import { PrismaClient } from '@prisma/client';
import { createAlertIfNotDuplicate } from '../../src/lib/alert-engine';

const suite = new Benchmark.Suite();
const prisma = new PrismaClient();

let testDeviceId: string;

console.log('\n🔬 Alert Engine Performance Benchmarks\n');
console.log('='.repeat(60));

async function setup() {
  await prisma.$connect();
  
  const device = await prisma.device.create({
    data: {
      id: `bench-device-${Date.now()}`,
      name: 'Benchmark Device',
      ip: '192.168.99.99',
      type: 'ROUTER',
      vendor: 'BenchVendor',
      location: 'Benchmark',
      status: 'UP',
    },
  });
  
  testDeviceId = device.id;
}

async function cleanup() {
  if (testDeviceId) {
    await prisma.alert.deleteMany({ where: { deviceId: testDeviceId } });
    await prisma.device.deleteMany({ where: { id: testDeviceId } });
  }
  await prisma.$disconnect();
}

suite
  .add('Alert creation (no duplicate)', {
    defer: true,
    fn: async (deferred: any) => {
      const dedupKey = `bench-alert-${Date.now()}-${Math.random()}`;
      try {
        await createAlertIfNotDuplicate(
          prisma,
          {
            deviceId: testDeviceId,
            type: 'HIGH_UTILIZATION',
            severity: 'MEDIUM',
            message: 'CPU > 80%',
            dedupKey,
          },
          'bench-user'
        );
      } catch (e) {
        // Ignore errors
      }
      deferred.resolve();
    },
  })
  .add('Alert deduplication check', {
    defer: true,
    fn: async (deferred: any) => {
      const dedupKey = 'static-dedup-key';
      try {
        await createAlertIfNotDuplicate(
          prisma,
          {
            deviceId: testDeviceId,
            type: 'HIGH_UTILIZATION',
            severity: 'MEDIUM',
            message: 'CPU > 80%',
            dedupKey,
          },
          'bench-user'
        );
      } catch (e) {
        // Expected to hit duplicate
      }
      deferred.resolve();
    },
  })
  .on('cycle', (event: any) => {
    const benchmark = event.target;
    const opsPerSec = benchmark.hz ? benchmark.hz.toFixed(2) : 'N/A';
    const margin = benchmark.stats ? `±${benchmark.stats.rme.toFixed(2)}%` : '';
    console.log(`  ${String(benchmark.name).padEnd(50)} ${String(opsPerSec).padStart(10)} ops/sec ${margin}`);
  })
  .on('complete', function (this: any) {
    console.log('='.repeat(60));
    console.log(`\n✅ Fastest: ${this.filter('fastest').map('name')}`);
    console.log(`⚡ Performance Budget: > 100 alerts/sec`);
    console.log('');
    
    cleanup().then(() => process.exit(0));
  })
  .on('error', (event: any) => {
    console.error('Benchmark error:', event.target.error);
    cleanup().then(() => process.exit(1));
  });

setup().then(() => {
  suite.run({ async: true });
}).catch((error) => {
  console.error('Setup error:', error);
  cleanup().then(() => process.exit(1));
});
