-- HK-NOVA MySQL Production Configuration
-- For 500+ Devices - High Performance Tuning
-- MySQL 8.0+

-- ============================================================================
-- CONNECTION SETTINGS
-- ============================================================================
-- Support for 500 devices with multiple workers
SET GLOBAL max_connections = 200;

-- Allow more connection errors before blocking
SET GLOBAL max_connect_errors = 10000;

-- Connection timeouts (seconds)
SET GLOBAL connect_timeout = 10;
SET GLOBAL wait_timeout = 600;
SET GLOBAL interactive_timeout = 600;

-- ============================================================================
-- INNODB BUFFER POOL
-- ============================================================================
-- Set to 50-70% of available RAM
-- For 16GB RAM server, use 8-10GB
-- For 32GB RAM server, use 16-20GB
-- Adjust based on your server:
SET GLOBAL innodb_buffer_pool_size = 4294967296;  -- 4GB (adjust this!)

-- Split buffer pool into instances for better concurrency
SET GLOBAL innodb_buffer_pool_instances = 4;

-- ============================================================================
-- QUERY CACHE & TEMPORARY TABLES
-- ============================================================================
-- Temporary table sizes for complex queries
SET GLOBAL tmp_table_size = 268435456;  -- 256MB
SET GLOBAL max_heap_table_size = 268435456;  -- 256MB

-- ============================================================================
-- LOGGING FOR OPTIMIZATION
-- ============================================================================
-- Enable slow query log to identify bottlenecks
SET GLOBAL slow_query_log = 1;
SET GLOBAL long_query_time = 2;  -- Log queries > 2 seconds

-- ============================================================================
-- BINARY LOG RETENTION
-- ============================================================================
-- Keep binary logs for 7 days (for backup/recovery)
SET GLOBAL binlog_expire_logs_seconds = 604800;

-- ============================================================================
-- THREAD HANDLING
-- ============================================================================
-- Thread cache to reduce overhead
SET GLOBAL thread_cache_size = 100;

-- ============================================================================
-- QUERY OPTIMIZATION
-- ============================================================================
-- Join buffer for complex queries
SET GLOBAL join_buffer_size = 2097152;  -- 2MB

-- Sort buffer for ORDER BY operations
SET GLOBAL sort_buffer_size = 2097152;  -- 2MB

-- Read buffer for table scans
SET GLOBAL read_buffer_size = 1048576;  -- 1MB
SET GLOBAL read_rnd_buffer_size = 2097152;  -- 2MB

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify settings:
-- SHOW VARIABLES LIKE 'max_connections';
-- SHOW VARIABLES LIKE 'innodb_buffer_pool_size';
-- SHOW VARIABLES LIKE 'innodb_buffer_pool_instances';
-- SHOW STATUS LIKE 'Threads_%';
-- SHOW PROCESSLIST;
