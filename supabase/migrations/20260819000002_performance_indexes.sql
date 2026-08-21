-- ============================================================
-- Performance Indexes — Phase 4
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
--
-- Addresses the remaining sequential scan risks after the
-- orders-list query was converted to a single relational JOIN.
-- ============================================================

-- ── order_files: index for the embedded JOIN in orders-list ───────────────────
--
-- The orders-list query now uses:
--   SELECT ..., order_files(id, scan_status, infected) FROM orders WHERE shop_id = ?
--
-- PostgREST resolves this as a JOIN on order_files.order_id = orders.id.
-- Without an index on order_files.order_id, Postgres does a sequential scan
-- of the entire order_files table for each page of orders.
--
CREATE INDEX IF NOT EXISTS idx_order_files_order_id
  ON public.order_files(order_id);

COMMENT ON INDEX idx_order_files_order_id IS
  'Supports the relational JOIN in GET /api/shop/orders-list: '
  'order_files(id, scan_status, infected) embedded in orders SELECT. '
  'Without this, Postgres does a seq scan of order_files for every page load.';


-- ── shop_settings: index for shop settings lookup ────────────────────────────
--
-- GET /api/shop/settings queries:
--   SELECT sound_alerts FROM shop_settings WHERE shop_id = ?
--
-- Verifies the index exists (was created in 20260617000002 but may not have
-- been applied consistently on all environments).
--
CREATE INDEX IF NOT EXISTS idx_shop_settings_shop_id
  ON public.shop_settings(shop_id);

COMMENT ON INDEX idx_shop_settings_shop_id IS
  'Supports GET /api/shop/settings: SELECT WHERE shop_id = ? (point lookup). '
  'Ensures the settings query uses an index scan instead of seq scan.';


-- ── Verification ───────────────────────────────────────────────────────────────
-- 1. Confirm order_files index:
--    SELECT indexname, indexdef FROM pg_indexes
--     WHERE tablename = 'order_files' AND indexname = 'idx_order_files_order_id';
--    Expected: 1 row
--
-- 2. EXPLAIN the orders-list join:
--    EXPLAIN (ANALYZE, BUFFERS)
--      SELECT o.id, f.scan_status
--      FROM orders o
--      LEFT JOIN order_files f ON f.order_id = o.id
--      WHERE o.shop_id = '<uuid>'
--      ORDER BY o.created_at DESC
--      LIMIT 30;
--    Expected: "Index Scan using idx_order_files_order_id"
