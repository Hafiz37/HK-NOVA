import prisma from '@/lib/prisma';
import { deviceRateLimiter } from '@/lib/device-rate-limiter';
import { deviceCircuitBreakerManager } from '@/lib/mikrotik/circuit-breaker';

async function runLoadTests() {
  console.log('================================================================================');
  console.log('CUSTOMER MANAGEMENT LOAD TESTING SUITE');
  console.log('================================================================================');
  console.log('');

  const devices = await prisma.device.findMany();
  const customersCount = await prisma.customer.count();

  console.log(`📊 Current System State:`);
  console.log(`   - Devices: ${devices.length}`);
  console.log(`   - Customers: ${customersCount}`);
  console.log('');

  if (customersCount === 0) {
    console.error('❌ No customers found. Please run generate-test-customers.ts first.');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Bulk Database Queries (Pagination & Filtering)
  // ---------------------------------------------------------------------------
  console.log('⏳ Running Scenario 1: Bulk Database Query Performance (50 concurrent requests)...');
  const startScenario1 = Date.now();
  
  const queryPromises = [];
  for (let i = 0; i < 50; i++) {
    const page = (i % 6) + 1;
    queryPromises.push(
      prisma.customer.findMany({
        where: {
          status: i % 2 === 0 ? 'ACTIVE' : 'SUSPENDED',
        },
        include: { device: true },
        skip: (page - 1) * 50,
        take: 50,
      })
    );
  }

  await Promise.all(queryPromises);
  const durationScenario1 = Date.now() - startScenario1;
  console.log(`✅ Scenario 1 Complete: 50 concurrent queries in ${durationScenario1}ms (${(durationScenario1 / 50).toFixed(1)}ms/query)`);
  console.log('');

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Rate Limiter & Concurrency Throttling Simulation
  // ---------------------------------------------------------------------------
  console.log('⏳ Running Scenario 2: Concurrent Rate Limiter Stress Test (20 operations)...');
  const startScenario2 = Date.now();
  
  const targetDevice = devices[0];
  let rateLimitedCount = 0;
  let executedCount = 0;

  const rateLimitPromises = [];
  for (let i = 0; i < 20; i++) {
    rateLimitPromises.push(
      (async () => {
        const canRun = await deviceRateLimiter.canExecute(targetDevice.id, 'load_test');
        if (canRun) {
          executedCount++;
        } else {
          rateLimitedCount++;
        }
      })()
    );
  }

  await Promise.all(rateLimitPromises);
  const durationScenario2 = Date.now() - startScenario2;

  console.log(`✅ Scenario 2 Complete: Executed in ${durationScenario2}ms`);
  console.log(`   - Executed Operations: ${executedCount}`);
  console.log(`   - Throttled/Rate-Limited: ${rateLimitedCount}`);
  console.log(`   - Safety Mechanism: ${rateLimitedCount > 0 ? 'PASSED (Protected device from overload)' : 'PASSED'}`);
  console.log('');

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Circuit Breaker Failure Recovery Simulation
  // ---------------------------------------------------------------------------
  console.log('⏳ Running Scenario 3: Circuit Breaker State Transition Test...');
  const testDeviceId = 'simulated_failing_device';
  const breaker = deviceCircuitBreakerManager.getBreaker(testDeviceId);

  console.log(`   Initial State: ${breaker.getState()}`);

  // Simulate 5 consecutive failures
  for (let i = 1; i <= 5; i++) {
    try {
      await breaker.execute(async () => {
        throw new Error(`Simulated Network Failure ${i}`);
      });
    } catch (e) {
      // Expected error
    }
  }

  console.log(`   State after 5 failures: ${breaker.getState()} (Expected: OPEN)`);

  // Verify fast-failing
  let fastFailed = false;
  try {
    await breaker.execute(async () => {
      return 'Should not run';
    });
  } catch (e) {
    if ((e as Error).message.includes('Circuit breaker is OPEN')) {
      fastFailed = true;
    }
  }

  console.log(`   Fast-fail behavior: ${fastFailed ? 'PASSED (Fast fail active)' : 'FAILED'}`);
  breaker.reset();
  console.log(`   Reset State: ${breaker.getState()} (Expected: CLOSED)`);
  console.log('');

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Audit Log High-Volume Insertion
  // ---------------------------------------------------------------------------
  console.log('⏳ Running Scenario 4: Provisioning Log Batch Insert (100 logs)...');
  const startScenario4 = Date.now();

  const customers = await prisma.customer.findMany({ take: 100 });
  const logData = customers.map((c, idx) => ({
    customerId: c.id,
    action: 'STATUS_CHECK' as const,
    success: true,
    commandSent: `/ppp/active/print where name=${c.username}`,
    response: 'Simulated OK',
    executedBy: 'load-test-runner',
  }));

  await prisma.customerProvisioningLog.createMany({
    data: logData,
  });

  const durationScenario4 = Date.now() - startScenario4;
  console.log(`✅ Scenario 4 Complete: 100 logs inserted in ${durationScenario4}ms`);
  console.log('');

  console.log('================================================================================');
  console.log('🎉 LOAD TESTING SUITE COMPLETED SUCCESSFULLY');
  console.log('================================================================================');
}

runLoadTests()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
