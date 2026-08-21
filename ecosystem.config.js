/**
 * Baris out_file/error_file/merge_logs/time menulis log setiap proses ke
 * ./logs/<nama>.out.log & .err.log (dengan timestamp) agar rapi dibaca dan
 * mudah dirotasi via pm2-logrotate.
 */
function app(name, script, args, opts = {}) {
  return {
    name,
    script,
    args,
    cwd: './',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    time: true,
    merge_logs: true,
    out_file: `./logs/${name}.out.log`,
    error_file: `./logs/${name}.err.log`,
    ...opts,
  };
}

module.exports = {
  apps: [
    app('hk-nova-web', 'pnpm', 'start', {
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    }),
    app('hk-nova-icmp-worker', 'tsx', 'src/workers/icmp-poller.ts', {
      env: {
        NODE_ENV: 'production',
        REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
        ICMP_BATCH_SIZE: process.env.ICMP_BATCH_SIZE ?? '20',
        ICMP_CONCURRENCY_LIMIT: process.env.ICMP_CONCURRENCY_LIMIT ?? '10',
      },
    }),
    app('hk-nova-snmp-worker', 'tsx', 'src/workers/snmp-poller.ts', {
      env: {
        NODE_ENV: 'production',
        REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
        SNMP_BATCH_SIZE: process.env.SNMP_BATCH_SIZE ?? '20',
        SNMP_CONCURRENCY_LIMIT: process.env.SNMP_CONCURRENCY_LIMIT ?? '10',
      },
    }),
    app('hk-nova-demo-generator', 'tsx', 'src/workers/demo-generator.ts', {
      env: { NODE_ENV: 'development', APP_MODE: 'development' },
    }),
    app('hk-nova-retention-worker', 'tsx', 'src/workers/retention-worker.ts', {
      env: { NODE_ENV: 'production' },
    }),
    app('hk-nova-backup-worker', 'tsx', 'src/workers/backup-worker.ts', {
      env: { NODE_ENV: 'production' },
    }),
    app('hk-nova-backup-retention-worker', 'tsx', 'src/workers/backup-retention-worker.ts', {
      env: { NODE_ENV: 'production' },
    }),
    app('hk-nova-backup-archive-worker', 'tsx', 'src/workers/backup-archive-worker.ts', {
      env: { NODE_ENV: 'production' },
    }),
    app('hk-nova-anomaly-worker', 'tsx', 'src/workers/anomaly-detector.ts', {
      env: { NODE_ENV: 'production' },
    }),
    app('hk-nova-escalator-worker', 'tsx', 'src/workers/alert-escalator.ts', {
      env: { NODE_ENV: 'production', ESCALATOR_INTERVAL: '* * * * *' },
    }),
    app('hk-nova-digest-worker', 'tsx', 'src/workers/digest-worker.ts', {
      env: { NODE_ENV: 'production', DIGEST_INTERVAL: '* * * * *' },
    }),
    app('hk-nova-retry-worker', 'tsx', 'src/workers/delivery-retry.ts', {
      env: { NODE_ENV: 'production', RETRY_INTERVAL: '*/2 * * * *' },
    }),
  ],
};