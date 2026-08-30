import Benchmark from 'benchmark';
import { SafeExpressionEvaluator } from '../../src/lib/safe-evaluator';

const suite = new Benchmark.Suite();
const evaluator = new SafeExpressionEvaluator();

console.log('\n🔬 Safe Evaluator Performance Benchmarks\n');
console.log('='.repeat(60));

suite
  .add('Simple comparison (x > 5)', () => {
    evaluator.evaluate('x > 5', { x: 10 });
  })
  .add('Complex arithmetic (a + b * c / d)', () => {
    evaluator.evaluate('a + b * c / d', { a: 10, b: 20, c: 30, d: 5 });
  })
  .add('Boolean logic (a && b || c)', () => {
    evaluator.evaluate('a && b || c', { a: true, b: false, c: true });
  })
  .add('String concatenation (name + " " + surname)', () => {
    evaluator.evaluate('name + " " + surname', { name: 'John', surname: 'Doe' });
  })
  .add('Condition evaluation (boolean)', () => {
    evaluator.evaluateCondition('value > threshold && status == "active"', {
      value: 100,
      threshold: 50,
      status: 'active',
    });
  })
  .on('cycle', (event: any) => {
    const benchmark = event.target;
    const opsPerSec = benchmark.hz ? benchmark.hz.toFixed(0) : 'N/A';
    const margin = benchmark.stats ? `±${benchmark.stats.rme.toFixed(2)}%` : '';
    console.log(`  ${String(benchmark.name).padEnd(50)} ${String(opsPerSec).padStart(10)} ops/sec ${margin}`);
  })
  .on('complete', function (this: any) {
    console.log('='.repeat(60));
    console.log(`\n✅ Fastest: ${this.filter('fastest').map('name')}`);
    console.log(`⚡ Performance Budget: > 10,000 ops/sec for simple conditions`);
    
    const simpleBench = this.filter((b: any) => b.name && b.name.includes('Simple comparison'))[0];
    if (simpleBench && simpleBench.hz && simpleBench.hz > 10000) {
      console.log(`✅ PASS: Simple condition evaluation (${simpleBench.hz.toFixed(0)} ops/sec)`);
    } else {
      console.log(`❌ FAIL: Simple condition evaluation too slow`);
    }
    console.log('');
  })
  .run({ async: false });
