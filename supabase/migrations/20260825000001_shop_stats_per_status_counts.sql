-- ============================================================
-- Add per-status counts to get_shop_stats RPC
-- Fixes the Orders page tab badges showing counts only from the
-- first 30 (paginated) orders instead of the true database totals.
--
-- Strategy: extend the existing single-pass FILTER aggregation
-- with 6 new FILTER clauses (placed, accepted, printing, ready,
-- completed, cancelled) and the total_orders count.
-- No extra table scan — identical cost to the existing function.
-- ============================================================

CREATE OR REPLACE FUNCTION get_shop_stats(
  p_shop_id uuid,
  p_today   timestamptz
)
RETURNS TABLE (
  -- Existing columns (unchanged — preserve all callers)
  pending_orders     bigint,
  orders_today       bigint,
  unique_customers   bigint,
  revenue_today      numeric,
  avg_completion_min numeric,
  completed_today    bigint,
  total_completed    bigint,
  avg_rating         numeric,
  -- New: per-status counts for the Orders page tab badges
  total_orders       bigint,
  placed_count       bigint,
  accepted_count     bigint,
  printing_count     bigint,
  ready_count        bigint,
  completed_count    bigint,
  cancelled_count    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    -- ── existing metrics (UNCHANGED) ─────────────────────────────────────
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

    (
      SELECT COALESCE(AVG(rating), 0)
      FROM reviews
      WHERE shop_id = p_shop_id
    ) AS avg_rating,

    -- ── new: per-status counts (single-pass, zero extra cost) ────────────
    COUNT(*) AS total_orders,

    COUNT(*) FILTER (WHERE UPPER(status) IN ('PLACED', 'NEW'))
      AS placed_count,

    COUNT(*) FILTER (WHERE UPPER(status) = 'ACCEPTED')
      AS accepted_count,

    COUNT(*) FILTER (WHERE UPPER(status) = 'PRINTING')
      AS printing_count,

    COUNT(*) FILTER (WHERE UPPER(status) = 'READY')
      AS ready_count,

    COUNT(*) FILTER (WHERE UPPER(status) IN ('COMPLETED', 'SUCCESS'))
      AS completed_count,

    COUNT(*) FILTER (WHERE UPPER(status) IN ('CANCELLED', 'REJECTED'))
      AS cancelled_count

  FROM orders
  WHERE shop_id = p_shop_id;
$$;

COMMENT ON FUNCTION get_shop_stats IS
  'Phase 4: Added per-status counts (total_orders, placed_count, accepted_count, '
  'printing_count, ready_count, completed_count, cancelled_count) for the Orders '
  'page tab badges. All columns are computed in the same single table scan. '
  'Backward-compatible: existing column names and types are unchanged.';

REVOKE ALL ON FUNCTION get_shop_stats FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_shop_stats TO service_role;
