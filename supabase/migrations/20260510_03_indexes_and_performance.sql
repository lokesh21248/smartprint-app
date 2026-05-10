-- =============================================================================
-- Migration: 20260510_03_indexes_and_performance.sql
-- Description: Creates critical database indexes for scaling the platform.
--              Prevents sequential scans on foreign keys and timestamps.
-- =============================================================================

-- 1. Index orders by shop_id
-- CRITICAL for Dashboard NewOrdersFeed and History queries.
-- Without this, fetching a single shop's orders scans the entire orders table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_shop_id 
ON public.orders (shop_id);

-- 2. Index orders by file_s3_key
-- CRITICAL for the cleanup-storage Edge Function.
-- The Edge function uses `.in("file_s3_key", candidatePaths)` which requires an index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_file_s3_key 
ON public.orders (file_s3_key);

-- 3. Index orders by created_at
-- Optimizes chronological sorting for the dashboard UI.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created_at 
ON public.orders (created_at DESC);

-- 4. Index uploaded_documents by created_at
-- CRITICAL for the cleanup-storage Edge Function retention sweep.
-- `.lt("created_at", retentionThreshold)` requires an index for fast timestamp lookups.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_uploaded_documents_created_at 
ON public.uploaded_documents (created_at ASC);

-- Note: Postgres handles small tables via sequential scans automatically, 
-- but these indexes guarantee O(1) B-Tree lookups as the database scales past millions of rows.
