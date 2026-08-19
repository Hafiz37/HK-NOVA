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
      env: { NODE_ENV: 'production' },
    }),
    app('hk-nova-snmp-worker', 'tsx', 'src/workers/snmp-poller.ts', {
      env: { NODE_ENV: 'production' },
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
  ],
};