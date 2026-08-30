import Benchmark from 'benchmark';
import { checkRateLimit, RATE_LIMITS } from '../../src/lib/rate-limit';

const suite = new Benchmark.Suite();

console.log('\n🔬 Rate Limiter Performance Benchmarks\n');
console.log('='.repeat(60));

suite
  .add('Rate limit check (within limit)', () => {
    checkRateLimit('bench-key-1', RATE_LIMITS.mutation);
  })
  .add('Rate limit check (different keys)', () => {
    const key = `bench-key-${Math.floor(Math.random() * 1000)}`;
    checkRateLimit(key, RATE_LIMITS.mutation);
  })
  .add('Rate limit check (high volume endpoint)', () => {
    checkRateLimit('bench-key-2', RATE_LIMITS.read);
  })
  .add('Rate limit check (strict endpoint)', () => {
    checkRateLimit('bench-key-3', RATE_LIMITS.login);
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
    console.log(`⚡ Performance Budget: > 50,000 ops/sec`);
    
    const rateLimitBench = this[0];
    if (rateLimitBench && rateLimitBench.hz && rateLimitBench.hz > 50000) {
      console.log(`✅ PASS: Rate limit check (${rateLimitBench.hz.toFixed(0)} ops/sec)`);
    } else {
      console.log(`⚠️  WARN: Rate limit check slower than target`);
    }
    console.log('');
  })
  .run({ async: false });
