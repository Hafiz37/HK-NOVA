/**
 * TimescaleDB Migration Runner
 * Execute this script after enabling TimescaleDB extension on PostgreSQL
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MIGRATION_STEPS = [
  // Step 1: Enable extension (must be superuser)
  {
    name: 'Enable TimescaleDB Extension',
    sql: `CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`,
    requiresSuperuser: true,
  },

  // Step 2: Convert Metric to hypertable
  {
    name: 'Convert Metric to Hypertable',
    sql: `
      SELECT create_hypertable(
        'Metric',
        'timestamp',
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists => TRUE,
        migrate_data => TRUE
      );
    `,
    requiresSuperuser: false,
  },

  // Step 3: Create continuous aggregates
  {
    name: 'Create 1-minute Continuous Aggregate',
    sql: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS "Metric_1m"
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 minute', timestamp) AS bucket,
        "deviceId",
        "metricType",
        source,
        COUNT(*) as sample_count,
        AVG(latency) as avg_latency,
        MAX(latency) as max_latency,
        MIN(latency) as min_latency,
        AVG("packetLoss") as avg_packet_loss,
        AVG("cpuUtil") as avg_cpu,
        AVG("memUtil") as avg_mem,
        MAX("cpuUtil") as max_cpu,
        MAX("memUtil") as max_mem
      FROM "Metric"
      GROUP BY bucket, "deviceId", "metricType", source
      WITH NO DATA;
    `,
    requiresSuperuser: false,
  },

  {
    name: 'Create 5-minute Continuous Aggregate',
    sql: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS "Metric_5m"
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('5 minutes', timestamp) AS bucket,
        "deviceId",
        "metricType",
        source,
        COUNT(*) as sample_count,
        AVG(latency) as avg_latency,
        MAX(latency) as max_latency,
        MIN(latency) as min_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency) as p95_latency,
        AVG("packetLoss") as avg_packet_loss,
        MAX("packetLoss") as max_packet_loss,
        AVG("cpuUtil") as avg_cpu,
        MAX("cpuUtil") as max_cpu,
        AVG("memUtil") as avg_mem,
        MAX("memUtil") as max_mem
      FROM "Metric"
      GROUP BY bucket, "deviceId", "metricType", source
      WITH NO DATA;
    `,
    requiresSuperuser: false,
  },

  {
    name: 'Create 1-hour Continuous Aggregate',
    sql: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS "Metric_1h"
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 hour', timestamp) AS bucket,
        "deviceId",
        "metricType",
        source,
        COUNT(*) as sample_count,
        AVG(latency) as avg_latency,
        MAX(latency) as max_latency,
        MIN(latency) as min_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency) as p95_latency,
        STDDEV(latency) as stddev_latency,
        AVG("packetLoss") as avg_packet_loss,
        MAX("packetLoss") as max_packet_loss,
        AVG("cpuUtil") as avg_cpu,
        MAX("cpuUtil") as max_cpu,
        STDDEV("cpuUtil") as stddev_cpu,
        AVG("memUtil") as avg_mem,
        MAX("memUtil") as max_mem,
        STDDEV("memUtil") as stddev_mem
      FROM "Metric"
      GROUP BY bucket, "deviceId", "metricType", source
      WITH NO DATA;
    `,
    requiresSuperuser: false,
  },

  {
    name: 'Create 1-day Continuous Aggregate',
    sql: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS "Metric_1d"
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 day', timestamp) AS bucket,
        "deviceId",
        "metricType",
        source,
        COUNT(*) as sample_count,
        AVG(latency) as avg_latency,
        MAX(latency) as max_latency,
        MIN(latency) as min_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency) as p95_latency,
        AVG("packetLoss") as avg_packet_loss,
        AVG("cpuUtil") as avg_cpu,
        MAX("cpuUtil") as max_cpu,
        AVG("memUtil") as avg_mem,
        MAX("memUtil") as max_mem
      FROM "Metric"
      GROUP BY bucket, "deviceId", "metricType", source
      WITH NO DATA;
    `,
    requiresSuperuser: false,
  },

  // Step 4: Add refresh policies
  {
    name: 'Add Refresh Policy for 1m Aggregate',
    sql: `
      SELECT add_continuous_aggregate_policy('"Metric_1m"',
        start_offset => INTERVAL '1 hour',
        end_offset => INTERVAL '1 minute',
        schedule_interval => INTERVAL '5 minutes');
    `,
    requiresSuperuser: false,
  },

  {
    name: 'Add Refresh Policy for 5m Aggregate',
    sql: `
      SELECT add_continuous_aggregate_policy('"Metric_5m"',
        start_offset => INTERVAL '6 hours',
        end_offset => INTERVAL '5 minutes',
        schedule_interval => INTERVAL '15 minutes');
    `,
    requiresSuperuser: false,
  },

  {
    name: 'Add Refresh Policy for 1h Aggregate',
    sql: `
      SELECT add_continuous_aggregate_policy('"Metric_1h"',
        start_offset => INTERVAL '7 days',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour');
    `,
    requiresSuperuser: false,
  },

  {
    name: 'Add Refresh Policy for 1d Aggregate',
    sql: `
      SELECT add_continuous_aggregate_policy('"Metric_1d"',
        start_offset => INTERVAL '1 year',
        end_offset => INTERVAL '1 day',
        schedule_interval => INTERVAL '1 day');
    `,
    requiresSuperuser: false,
  },

  // Step 5: Compression
  {
    name: 'Enable Compression on Metric',
    sql: `
      ALTER TABLE "Metric" SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'deviceId,metricType,source'
      );
    `,
    requiresSuperuser: false,
  },

  {
    name: 'Add Compression Policy (7 days)',
    sql: `
      SELECT add_compression_policy('"Metric"', INTERVAL '7 days');
    `,
    requiresSuperuser: false,
  },

  // Step 6: Retention
  {
    name: 'Add Retention Policy (30 days raw)',
    sql: `
      SELECT add_retention_policy('"Metric"', INTERVAL '30 days');
    `,
    requiresSuperuser: false,
  },
];

export async function runTimescaleMigration(): Promise<void> {
  console.log('🚀 Starting TimescaleDB Migration...\n');

  for (const step of MIGRATION_STEPS) {
    console.log(`📋 ${step.name}...`);
    try {
      await prisma.$executeRawUnsafe(step.sql);
      console.log(`   ✅ Success`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ Failed: ${message}`);
      if (step.requiresSuperuser) {
        console.log('   ⚠️  This step requires superuser privileges. Run manually:');
        console.log(`      ${step.sql.trim()}`);
      }
    }
    console.log('');
  }

  console.log('✅ TimescaleDB Migration Complete!');
  console.log('\nNext steps:');
  console.log('1. Verify hypertables: SELECT * FROM timescaledb_information.hypertables;');
  console.log('2. Check continuous aggregates: SELECT * FROM timescaledb_information.continuous_aggregates;');
  console.log('3. Check compression: SELECT * FROM timescaledb_information.chunks WHERE is_compressed;');
  console.log('4. Update Prisma schema to use continuous aggregate views for queries');
}

// Run if called directly
if (require.main === module) {
  runTimescaleMigration()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}