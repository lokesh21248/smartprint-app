-- ============================================================
-- add_order_indexes.sql
-- Production performance indexes for the SmartPrint orders table.
--
-- BACKGROUND:
-- These indexes target the exact query patterns used in the order flow:
--   1. Duplicate detection (shop_id + customer_phone + file_name + created_at)
--   2. Token lookup for the order tracking page (short_token)
--   3. Shop dashboard listing (shop_id + created_at for pagination)
--   4. Customer-facing history (customer_phone)
--
-- USE CONCURRENTLY to avoid locking the table during creation.
-- Safe to run on a live production database.
-- Safe to re-run (IF NOT EXISTS guard on all).
--
-- Run via Supabase SQL Editor or supabase db push.
-- ============================================================

-- 1. Shop orders listing (dashboard pagination, most common query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_shop_id_created_at
  ON orders (shop_id, created_at DESC);

-- 2. Short token lookup — used by GET /api/orders?shortToken=...
--    Also used by the RPC get_order_by_token.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_short_token
  ON orders (short_token)
  WHERE short_token IS NOT NULL;

-- 3. Customer phone — used for customer order history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_phone
  ON orders (customer_phone, created_at DESC);

-- 4. Composite duplicate-detection index
--    Covers: WHERE shop_id=? AND customer_phone=? AND file_name=? AND created_at >= ? AND status NOT IN (...)
--    The partial WHERE clause matches the NOT IN ('CANCELLED','DRAFT') filter exactly.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_dedup
  ON orders (shop_id, customer_phone, file_name, created_at DESC)
  WHERE status NOT IN ('CANCELLED', 'DRAFT');

-- 5. Status filtering (shop dashboard filtered views: PLACED, PRINTING, etc.)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_shop_status
  ON orders (shop_id, status, created_at DESC);

-- ============================================================
-- Verification queries (run after migration to confirm):
-- ============================================================
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename = 'orders'
-- ORDER BY indexname;
--
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT id, short_token FROM orders
-- WHERE shop_id = 'your-shop-uuid'
--   AND customer_phone = '9999999999'
--   AND file_name = 'test.pdf'
--   AND created_at >= NOW() - INTERVAL '5 minutes'
--   AND status NOT IN ('CANCELLED', 'DRAFT')
-- LIMIT 1;
