-- HK-NOVA Database Performance Indexes
-- Phase 2.3: Add indexes for 500+ device scale
-- Run with: pnpm prisma migrate dev --name add_performance_indexes

-- NOTE: These indexes are already defined in schema.prisma
-- This migration will be auto-generated from schema changes

-- ============================================================================
-- ANALYSIS: Current Index Coverage
-- ============================================================================

-- Device table:
-- ✓ @@index([status])
-- ✓ @@index([type])
-- ✓ @@index([deletedAt])
-- ✓ @@index([isDemo])
-- NEED: Composite index for common filter queries

-- Metric table:
-- ✓ @@index([deviceId, timestamp])
-- ✓ @@index([metricType, timestamp])
-- ✓ @@index([deviceId, metricType, timestamp])
-- ✓ @@index([source])
-- ✓ @@index([timestamp])
-- STATUS: Good coverage for time-series queries

-- Alert table:
-- ✓ @@index([status, severity])
-- ✓ @@index([status, createdAt])
-- ✓ @@index([createdAt])
-- ✓ @@index([dedupKey])
-- ✓ @@index([correlationKey])
-- ✓ @@index([parentId])
-- ✓ @@index([deviceId, status])
-- STATUS: Well indexed

-- Backup table:
-- Need to check...

-- ============================================================================
-- RECOMMENDATIONS
-- ============================================================================

-- 1. Add composite index for Device filtering (status + isDemo)
-- 2. Add index on Backup (deviceId, status, createdAt)
-- 3. Add index on BackupHistory for reporting queries
-- 4. Verify AlertActivity index performance

-- These will be added to schema.prisma and migrated
