-- ============================================================
-- SmartPrint Performance Migrations
-- Run these in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- [SQL-1] Atomic shop open/close toggle
-- Replaces the SELECT + UPDATE two-query pattern in
-- /api/shop/toggle-open with a single atomic operation.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION toggle_shop_open(p_shop_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_open boolean;
BEGIN
  UPDATE shops
  SET
    is_open    = NOT is_open,
    updated_at = now()
  WHERE id = p_shop_id
  RETURNING is_open INTO v_is_open;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop not found: %', p_shop_id;
  END IF;

  RETURN v_is_open;
END;
$$;

COMMENT ON FUNCTION toggle_shop_open IS
  'Atomically toggles shops.is_open and returns the new value. '
  'Called by PATCH /api/shop/toggle-open. Race-safe: single UPDATE statement.';

-- Grant execute to service role only (used by admin client)
REVOKE ALL ON FUNCTION toggle_shop_open FROM PUBLIC;
GRANT EXECUTE ON FUNCTION toggle_shop_open TO service_role;


-- ────────────────────────────────────────────────────────────
-- [SQL-2] Shop stats aggregation — pushes all arithmetic
-- into Postgres to eliminate fetching 1,500 rows to Node.js
-- Replaces the 6 parallel queries in GET /api/shop/stats.
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
  SELECT
    -- Pending orders (PLACED or NEW status)
    (
      SELECT COUNT(*)
      FROM orders
      WHERE shop_id = p_shop_id
        AND status IN ('PLACED', 'NEW')
    ) AS pending_orders,

    -- All orders created today
    (
      SELECT COUNT(*)
      FROM orders
      WHERE shop_id  = p_shop_id
        AND created_at >= p_today
    ) AS orders_today,

    -- Unique customers today (by phone number)
    (
      SELECT COUNT(DISTINCT customer_phone)
      FROM orders
      WHERE shop_id  = p_shop_id
        AND created_at >= p_today
    ) AS unique_customers,

    -- Revenue from completed orders today
    (
      SELECT COALESCE(SUM(total_amount), 0)
      FROM orders
      WHERE shop_id      = p_shop_id
        AND status       IN ('COMPLETED', 'SUCCESS')
        AND COALESCE(completed_at, updated_at) >= p_today
    ) AS revenue_today,

    -- Average completion time in minutes for today's completed orders
    (
      SELECT COALESCE(
        AVG(
          EXTRACT(EPOCH FROM (
            COALESCE(completed_at, updated_at) - created_at
          )) / 60.0
        ),
        0
      )
      FROM orders
      WHERE shop_id      = p_shop_id
        AND status       IN ('COMPLETED', 'SUCCESS')
        AND COALESCE(completed_at, updated_at) >= p_today
    ) AS avg_completion_min,

    -- Count of completed orders today
    (
      SELECT COUNT(*)
      FROM orders
      WHERE shop_id      = p_shop_id
        AND status       IN ('COMPLETED', 'SUCCESS')
        AND COALESCE(completed_at, updated_at) >= p_today
    ) AS completed_today,

    -- All-time completed order count
    (
      SELECT COUNT(*)
      FROM orders
      WHERE shop_id = p_shop_id
        AND status  IN ('COMPLETED', 'SUCCESS')
    ) AS total_completed,

    -- Average rating across all reviews
    (
      SELECT COALESCE(AVG(rating), 0)
      FROM reviews
      WHERE shop_id = p_shop_id
    ) AS avg_rating
$$;

COMMENT ON FUNCTION get_shop_stats IS
  'Aggregates all dashboard stats in a single SQL pass. '
  'Replaces 6 parallel Node.js queries + JS array.reduce() in GET /api/shop/stats. '
  'Called with: supabase.rpc("get_shop_stats", { p_shop_id, p_today })';

REVOKE ALL ON FUNCTION get_shop_stats FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_shop_stats TO service_role;


-- ────────────────────────────────────────────────────────────
-- [SQL-3] Recommended indexes — verify each with EXPLAIN ANALYZE
-- Skip any that already exist (use IF NOT EXISTS).
-- ────────────────────────────────────────────────────────────

-- Order deduplication (POST /api/orders dedup check)
CREATE INDEX IF NOT EXISTS idx_orders_dedup
  ON orders (shop_id, customer_phone, file_name, created_at)
  WHERE status NOT IN ('CANCELLED', 'DRAFT');

-- Short token lookup (GET /api/orders?shortToken=)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_short_token
  ON orders (short_token);

-- Orders list with pagination (GET /api/shop/orders-list)
CREATE INDEX IF NOT EXISTS idx_orders_shop_created
  ON orders (shop_id, created_at DESC);

-- Orders list with status filter
CREATE INDEX IF NOT EXISTS idx_orders_shop_status_created
  ON orders (shop_id, status, created_at DESC);

-- Auth lookups
CREATE INDEX IF NOT EXISTS idx_shops_clerk_owner
  ON shops (clerk_owner_id);

CREATE INDEX IF NOT EXISTS idx_shop_staff_user
  ON shop_staff (user_id);

CREATE INDEX IF NOT EXISTS idx_shop_staff_shop_user
  ON shop_staff (shop_id, user_id);

-- Slug lookup (customer QR landing page — high traffic)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_slug
  ON shops (slug);

-- Reviews aggregate
CREATE INDEX IF NOT EXISTS idx_reviews_shop
  ON reviews (shop_id);

-- Verify index usage on the dedup query:
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
--   SELECT id, short_token FROM orders
--   WHERE shop_id = '<uuid>'
--     AND customer_phone = '9999999999'
--     AND file_name = 'test.pdf'
--     AND created_at >= NOW() - INTERVAL '5 minutes'
--     AND status NOT IN ('CANCELLED', 'DRAFT')
--   LIMIT 1;
-- Expected output: "Index Scan using idx_orders_dedup"
