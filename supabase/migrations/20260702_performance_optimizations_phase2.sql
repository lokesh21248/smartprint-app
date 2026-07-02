-- ============================================================
-- SmartPrint Performance Migrations — Phase 2
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- [SQL-4] Optimized get_shop_stats — single table scan
--
-- Before: 7 correlated subqueries, each doing a separate index scan
--         on the orders table (7× I/O, 7× planner overhead)
-- After:  1 table scan with conditional aggregation using FILTER
--         Postgres evaluates all 7 metrics in a single sequential
--         pass over the index range for (shop_id).
--
-- Expected improvement: ~50ms → ~8ms for dashboard stat loads.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_shop_stats(
  p_shop_id uuid,
  p_today   timestamptz
)
RETURNS TABLE (
  pending_orders     bigint,
  orders_today       bigint,
  unique_customers   bigint,
  revenue_today      numeric,
  avg_completion_min numeric,
  completed_today    bigint,
  total_completed    bigint,
  avg_rating         numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- Single scan over orders with conditional aggregation.
  -- FILTER (WHERE ...) is evaluated row-by-row in one pass — no subquery overhead.
  SELECT
    COUNT(*)                   FILTER (WHERE status IN ('PLACED', 'NEW'))
      AS pending_orders,

    COUNT(*)                   FILTER (WHERE created_at >= p_today)
      AS orders_today,

    COUNT(DISTINCT customer_phone) FILTER (WHERE created_at >= p_today)
      AS unique_customers,

    COALESCE(
      SUM(total_amount)        FILTER (WHERE status IN ('COMPLETED', 'SUCCESS')
                                 AND COALESCE(completed_at, updated_at) >= p_today),
      0
    )                          AS revenue_today,

    COALESCE(
      AVG(
        EXTRACT(EPOCH FROM (COALESCE(completed_at, updated_at) - created_at)) / 60.0
      )                        FILTER (WHERE status IN ('COMPLETED', 'SUCCESS')
                                 AND COALESCE(completed_at, updated_at) >= p_today),
      0
    )                          AS avg_completion_min,

    COUNT(*)                   FILTER (WHERE status IN ('COMPLETED', 'SUCCESS')
                                 AND COALESCE(completed_at, updated_at) >= p_today)
      AS completed_today,

    COUNT(*)                   FILTER (WHERE status IN ('COMPLETED', 'SUCCESS'))
      AS total_completed,

    -- avg_rating is from the reviews table — kept as a separate lateral query
    -- since mixing two tables in one scan is less efficient than a targeted lookup.
    (
      SELECT COALESCE(AVG(rating), 0)
      FROM reviews
      WHERE shop_id = p_shop_id
    )                          AS avg_rating

  FROM orders
  WHERE shop_id = p_shop_id;
$$;

COMMENT ON FUNCTION get_shop_stats IS
  'Phase 2: Single-scan conditional aggregation replaces 7 correlated subqueries. '
  'Called by GET /api/shop/stats. Expected: ~50ms → ~8ms on indexed shop_id.';

REVOKE ALL ON FUNCTION get_shop_stats FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_shop_stats TO service_role;


-- ────────────────────────────────────────────────────────────
-- [SQL-5] Missing indexes — phase 2
--
-- These were identified in the Phase 2 audit but not in Phase 1.
-- Verify each with EXPLAIN (ANALYZE, BUFFERS) before relying on them.
-- ────────────────────────────────────────────────────────────

-- upload_sessions cleanup query (cron/cleanup)
-- Cron selects WHERE upload_status = 'uploading' AND created_at < threshold
-- Without this index: full table scan on upload_sessions
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status_created
  ON upload_sessions (upload_status, created_at)
  WHERE upload_status = 'uploading';

COMMENT ON INDEX idx_upload_sessions_status_created IS
  'Supports cron cleanup query: WHERE upload_status = uploading AND created_at < threshold. '
  'Partial index on only the uploading subset — small, fast.';

-- order_files second query in orders-list
-- GET /api/shop/orders-list fetches all order_files WHERE order_id IN (ids...)
-- Without this index: bitmap heap scan on order_files (full scan for large datasets)
CREATE INDEX IF NOT EXISTS idx_order_files_order_id
  ON order_files (order_id);

COMMENT ON INDEX idx_order_files_order_id IS
  'Supports orders-list batch fetch: WHERE order_id IN (...). '
  'Critical when orders list returns 70 rows — the IN clause resolves 70 order IDs.';

-- shop_code lookup (POST /api/shop/find)
-- shop_code is a 6-char string looked up on every QR code scan at the find-shop page
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_shop_code
  ON shops (shop_code);

COMMENT ON INDEX idx_shops_shop_code IS
  'Unique index for shop code lookup at /api/shop/find. '
  'Ensures O(1) lookup and prevents duplicate shop codes.';


-- ────────────────────────────────────────────────────────────
-- Verification queries — run these after applying the migration
-- to confirm index usage. Look for "Index Scan" in the output.
-- ────────────────────────────────────────────────────────────

-- Verify idx_upload_sessions_status_created:
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
--   SELECT storage_path FROM upload_sessions
--   WHERE upload_status = 'uploading'
--     AND created_at < NOW() - INTERVAL '24 hours'
--   LIMIT 100;
-- Expected: "Index Scan using idx_upload_sessions_status_created"

-- Verify idx_order_files_order_id:
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
--   SELECT id, order_id, scan_status, infected
--   FROM order_files
--   WHERE order_id IN ('uuid1', 'uuid2', 'uuid3');
-- Expected: "Bitmap Heap Scan using idx_order_files_order_id" or "Index Scan"

-- Verify get_shop_stats single-scan (look for ONE Seq/Index Scan on orders):
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
--   SELECT * FROM get_shop_stats('<your-shop-uuid>', NOW()::date::timestamptz);
-- Expected: Single "Index Scan using idx_orders_shop_created" on orders table
