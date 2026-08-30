import Benchmark from 'benchmark';
import { PrismaClient } from '@prisma/client';
import { WorkflowEngine } from '../../src/lib/workflow-engine';

const suite = new Benchmark.Suite();
const prisma = new PrismaClient();
const engine = new WorkflowEngine(prisma);

let testWorkflowId: string;

console.log('\n🔬 Workflow Engine Performance Benchmarks\n');
console.log('='.repeat(60));

async function setup() {
  await prisma.$connect();
  
  const workflow = await engine.createWorkflow({
    name: 'Benchmark Workflow',
    status: 'ACTIVE',
    trigger: { type: 'MANUAL', config: {} },
    nodes: [
      {
        id: 'node1',
        type: 'CONDITION',
        name: 'Check Value',
        config: { condition: 'value > 10' },
        position: { x: 0, y: 0 },
        next: ['node2'],
      },
      {
        id: 'node2',
        type: 'NOTIFY',
        name: 'Send Notification',
        config: { message: 'Value exceeded' },
        position: { x: 100, y: 0 },
        next: [],
      },
    ],
    edges: [
      { id: 'edge1', source: 'node1', target: 'node2' },
    ],
    createdBy: 'bench-user',
    updatedBy: 'bench-user',
  });
  
  testWorkflowId = workflow.id;
}

async function cleanup() {
  if (testWorkflowId) {
    await prisma.workflowExecution.deleteMany({ where: { workflowId: testWorkflowId } });
    await prisma.workflowDefinition.deleteMany({ where: { id: testWorkflowId } });
  }
  await prisma.$disconnect();
}

suite
  .add('Simple condition evaluation (direct)', {
    defer: true,
    fn: (deferred: { resolve: () => void }) => {
      (engine as any).evaluateCondition('x > 5', { x: 10 });
      deferred.resolve();
    },
  })
  .add('Workflow execution (2 nodes)', {
    defer: true,
    fn: async (deferred: { resolve: () => void }) => {
      try {
        await engine.executeWorkflow(testWorkflowId, { value: 15 });
      } catch (e) {
        // Ignore execution errors for benchmark
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
    console.log(`⚡ Performance Budget:`);
    console.log(`   - Condition evaluation: > 10,000 ops/sec`);
    console.log(`   - Simple workflow: > 50 executions/sec`);
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
