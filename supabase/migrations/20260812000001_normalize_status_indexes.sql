-- ============================================================
-- SmartPrint Performance Migrations — Phase 3
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- [SQL-6] Update get_shop_stats to recognize lowercase statuses
--
-- Context: After the 422-fix PR, new orders are inserted with
-- lowercase status values ('new', 'accepted', 'printing',
-- 'ready', 'completed', 'cancelled') instead of the previous
-- PascalCase/UPPERCASE values ('PLACED', 'ACCEPTED', etc.).
--
-- The Phase 2 function only checked uppercase values, so
-- pending_orders and completed_today would return 0 for any
-- orders created after the status normalization fix.
--
-- This migration replaces the function with a version that
-- checks both cases, maintaining full backward compatibility
-- with any pre-existing orders still stored in uppercase.
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
  -- FILTER (WHERE ...) evaluates all metrics in one pass over
  -- the shop_id index range — no subquery overhead.
  --
  -- Both uppercase ('PLACED','NEW') and lowercase ('new') statuses
  -- are recognised for full backward+forward compatibility.
  SELECT
    COUNT(*)
      FILTER (WHERE UPPER(status) IN ('PLACED', 'NEW', 'ACCEPTED_PENDING'))
      AS pending_orders,

    COUNT(*)
      FILTER (WHERE created_at >= p_today)
      AS orders_today,

    COUNT(DISTINCT customer_phone)
      FILTER (WHERE created_at >= p_today)
      AS unique_customers,

    COALESCE(
      SUM(total_amount)
        FILTER (WHERE UPPER(status) IN ('COMPLETED', 'SUCCESS')
          AND COALESCE(completed_at, updated_at) >= p_today),
      0
    ) AS revenue_today,

    COALESCE(
      AVG(
        EXTRACT(EPOCH FROM (COALESCE(completed_at, updated_at) - created_at)) / 60.0
      )
        FILTER (WHERE UPPER(status) IN ('COMPLETED', 'SUCCESS')
          AND COALESCE(completed_at, updated_at) >= p_today),
      0
    ) AS avg_completion_min,

    COUNT(*)
      FILTER (WHERE UPPER(status) IN ('COMPLETED', 'SUCCESS')
        AND COALESCE(completed_at, updated_at) >= p_today)
      AS completed_today,

    COUNT(*)
      FILTER (WHERE UPPER(status) IN ('COMPLETED', 'SUCCESS'))
      AS total_completed,

    -- avg_rating kept as a targeted subquery since mixing two tables
    -- in one scan is less efficient than a separate index lookup.
    (
      SELECT COALESCE(AVG(rating), 0)
      FROM reviews
      WHERE shop_id = p_shop_id
    ) AS avg_rating

  FROM orders
  WHERE shop_id = p_shop_id;
$$;

COMMENT ON FUNCTION get_shop_stats IS
  'Phase 3: Extended to recognise both uppercase and lowercase status values. '
  'Backward-compatible with pre-normalization orders stored in uppercase. '
  'Called by GET /api/shop/stats via supabase.rpc("get_shop_stats", {...}).';

REVOKE ALL ON FUNCTION get_shop_stats FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_shop_stats TO service_role;


-- ────────────────────────────────────────────────────────────
-- [SQL-7] Expression index for case-insensitive status queries
--
-- The orders-list API now queries:
--   .in("status", ["PLACED", "placed", "new", "NEW"])
-- for new/pending orders. A standard btree index on status only
-- helps when the exact stored value is queried. An expression
-- index on UPPER(status) lets Postgres use an index scan for
-- any IN list that compares against uppercased values.
--
-- Usage in orders-list: convert the IN list to uppercase values
-- and let the expression index handle the lookup.
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_status_upper
  ON orders (shop_id, UPPER(status), created_at DESC);

COMMENT ON INDEX idx_orders_status_upper IS
  'Expression index on UPPER(status) allows case-insensitive status filtering '
  'for mixed-case status values after the normalization fix. '
  'Supports: GET /api/shop/orders-list with status=PLACED or status=new.';


-- ────────────────────────────────────────────────────────────
-- Verification queries
-- ────────────────────────────────────────────────────────────

-- 1. Verify get_shop_stats returns correct counts for both old and new orders:
-- SELECT * FROM get_shop_stats('<your-shop-uuid>', NOW()::date::timestamptz);
-- Expected: pending_orders counts both 'new' and 'PLACED' status rows.

-- 2. Verify expression index is used:
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
--   SELECT id, status FROM orders
--   WHERE shop_id = '<uuid>'
--     AND UPPER(status) IN ('PLACED', 'NEW')
--   ORDER BY created_at DESC
--   LIMIT 10;
-- Expected: "Index Scan using idx_orders_status_upper"
