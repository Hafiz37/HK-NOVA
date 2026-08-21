/**
 * TimescaleDB Migration Utilities
 * This file provides utilities for converting the Metric table to a hypertable
 * and creating continuous aggregates for faster time-series queries.
 *
 * NOTE: This requires PostgreSQL with TimescaleDB extension.
 * Run these migrations manually after enabling TimescaleDB.
 */

export const TIMESCALEDB_MIGRATION_SQL = `
-- ============================================================================
-- 1. Enable TimescaleDB extension (run once per database)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ============================================================================
-- 2. Convert Metric table to hypertable
-- ============================================================================
-- Note: This requires the table to have a time column (timestamp) and be empty
-- or use the migration path with chunk migration

-- If Metric table exists with data, use:
-- SELECT create_hypertable('Metric', 'timestamp', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

-- If table is empty or can be recreated:
-- DROP TABLE IF EXISTS "Metric";
-- CREATE TABLE "Metric" (
--   id TEXT NOT NULL,
--   "deviceId" TEXT NOT NULL,
--   timestamp TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
--   "metricType" TEXT NOT NULL,
--   source TEXT NOT NULL DEFAULT 'REAL',
--   latency DOUBLE PRECISION,
--   "packetLoss" DOUBLE PRECISION,
--   jitter DOUBLE PRECISION,
--   "rttMin" DOUBLE PRECISION,
--   "rttMax" DOUBLE PRECISION,
--   "isIPv6" BOOLEAN NOT NULL DEFAULT false,
--   "cpuUtil" DOUBLE PRECISION,
--   "memUtil" DOUBLE PRECISION,
--   "interfaceData" JSONB,
--   "customOidData" JSONB,
--   PRIMARY KEY (id, timestamp)
-- );
-- SELECT create_hypertable('"Metric"', 'timestamp', chunk_time_interval => INTERVAL '1 day');

-- ============================================================================
-- 3. Create indexes for common query patterns
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_metric_device_timestamp ON "Metric" ("deviceId", timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metric_type_timestamp ON "Metric" ("metricType", timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metric_source ON "Metric" (source);

-- ============================================================================
-- 4. Continuous Aggregates for pre-computed rollups
-- ============================================================================

-- 1-minute rollup
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

-- Add refresh policy (auto-refresh every 5 minutes)
SELECT add_continuous_aggregate_policy('"Metric_1m"',
  start_offset => INTERVAL '1 hour',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '5 minutes');

-- 5-minute rollup
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

SELECT add_continuous_aggregate_policy('"Metric_5m"',
  start_offset => INTERVAL '6 hours',
  end_offset => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '15 minutes');

-- 1-hour rollup
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

SELECT add_continuous_aggregate_policy('"Metric_1h"',
  start_offset => INTERVAL '7 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

-- 1-day rollup
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

SELECT add_continuous_aggregate_policy('"Metric_1d"',
  start_offset => INTERVAL '1 year',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day');

-- ============================================================================
-- 5. Compression policies for older chunks
-- ============================================================================
-- Compress chunks older than 7 days
ALTER TABLE "Metric" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'deviceId,metricType,source'
);

SELECT add_compression_policy('"Metric"', INTERVAL '7 days');

-- ============================================================================
-- 6. Data retention policy (auto-delete old raw data)
-- ============================================================================
-- Keep raw data for 30 days, aggregates forever
SELECT add_retention_policy('"Metric"', INTERVAL '30 days');

-- ============================================================================
-- 7. Helper functions for queries
-- ============================================================================

-- Get latest value per device per metric type (using last() optimization)
-- SELECT * FROM "Metric_1m" WHERE bucket = (SELECT max(bucket) FROM "Metric_1m");

-- Time-weighted average for irregular intervals
-- CREATE OR REPLACE FUNCTION time_weighted_avg(values DOUBLE PRECISION[], timestamps TIMESTAMPTZ[])
-- RETURNS DOUBLE PRECISION AS $$
--   SELECT SUM(v * dt) / SUM(dt)
--   FROM (
--     SELECT values[i] as v,
--            EXTRACT(EPOCH FROM (timestamps[i+1] - timestamps[i])) as dt
--     FROM generate_subscripts(values, 1) i
--     WHERE i < array_length(values, 1)
--   ) sub
-- $$ LANGUAGE SQL IMMUTABLE;
`;

export function generateTimescaleMigration(): string {
  return TIMESCALEDB_MIGRATION_SQL;
}

/**
 * Query helpers for using continuous aggregates
 */
export const CONTINUOUS_AGGREGATE_QUERIES = {
  // Use appropriate aggregate based on time range
  getAggregateView: (hours: number): string => {
    if (hours <= 2) return '"Metric_1m"';
    if (hours <= 24) return '"Metric_5m"';
    if (hours <= 168) return '"Metric_1h"';
    return '"Metric_1d"';
  },

  // Get latest bucket from continuous aggregate
  getLatestBucketQuery: (view: string, deviceId: string, metricType: string) => `
    SELECT * FROM ${view}
    WHERE "deviceId" = $1 AND "metricType" = $2
    ORDER BY bucket DESC
    LIMIT 1
  `,

  // Get time-series from continuous aggregate
  getTimeSeriesQuery: (view: string, deviceId: string, metricType: string, hours: number) => `
    SELECT bucket as timestamp,
           avg_latency as latency,
           avg_packet_loss as "packetLoss",
           avg_cpu as "cpuUtil",
           avg_mem as "memUtil"
    FROM ${view}
    WHERE "deviceId" = $1
      AND "metricType" = $2
      AND bucket >= NOW() - INTERVAL '${hours} hours'
    ORDER BY bucket ASC
  `,
};

export function getOptimizedQuery(hours: number, deviceId: string, metricType: string) {
  const view = CONTINUOUS_AGGREGATE_QUERIES.getAggregateView(hours);
  return CONTINUOUS_AGGREGATE_QUERIES.getTimeSeriesQuery(view, deviceId, metricType, hours);
}