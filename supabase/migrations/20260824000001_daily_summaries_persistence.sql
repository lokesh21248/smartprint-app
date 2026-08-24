-- ============================================================
-- Daily Summaries Persistence & Historical Backfill
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- ============================================================

-- ── Step 1: Ensure unique constraint ───────────────────────────────────────
-- This is necessary to allow UPSERT (ON CONFLICT DO UPDATE).
ALTER TABLE daily_summaries ADD CONSTRAINT IF NOT EXISTS daily_summaries_shop_id_date_key UNIQUE (shop_id, date);

-- ── Step 2: Create the RPC function ───────────────────────────────────────
-- This function computes the daily summary for a specific shop and date directly from
-- the authoritative orders table, and safely upserts it into daily_summaries.
CREATE OR REPLACE FUNCTION refresh_daily_summary(
  p_shop_id uuid,
  p_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO daily_summaries (
    shop_id,
    date,
    total_orders,
    completed_orders,
    cancelled_orders,
    total_pages_printed,
    total_revenue_paise,
    avg_accept_mins,
    avg_print_mins,
    updated_at
  )
  SELECT
    p_shop_id,
    p_date,
    COUNT(*),
    COUNT(*) FILTER (WHERE UPPER(status) IN ('COMPLETED', 'SUCCESS')),
    COUNT(*) FILTER (WHERE UPPER(status) IN ('CANCELLED', 'REJECTED')),
    COALESCE(SUM(page_count * copies), 0),
    COALESCE(SUM(total_amount), 0) * 100,
    
    -- avg_accept_mins: average time from created_at to accepted_at
    COALESCE(
      AVG(EXTRACT(EPOCH FROM (accepted_at - created_at)) / 60.0) 
      FILTER (WHERE accepted_at IS NOT NULL), 
      0
    ),
    
    -- avg_print_mins: average time from created_at to completed_at
    COALESCE(
      AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 60.0)
      FILTER (WHERE completed_at IS NOT NULL),
      0
    ),
    now()
  FROM orders
  WHERE shop_id = p_shop_id AND created_at::date = p_date

  ON CONFLICT (shop_id, date) DO UPDATE SET
    total_orders = EXCLUDED.total_orders,
    completed_orders = EXCLUDED.completed_orders,
    cancelled_orders = EXCLUDED.cancelled_orders,
    total_pages_printed = EXCLUDED.total_pages_printed,
    total_revenue_paise = EXCLUDED.total_revenue_paise,
    avg_accept_mins = EXCLUDED.avg_accept_mins,
    avg_print_mins = EXCLUDED.avg_print_mins,
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION refresh_daily_summary IS
  'Computes and upserts the daily summary for a specific shop and date based on actual orders.';

REVOKE ALL ON FUNCTION refresh_daily_summary FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_daily_summary TO service_role;


-- ── Step 3: Historical Backfill ───────────────────────────────────────────
-- Iterates over all existing distinct (shop_id, created_at::date) combinations
-- in the orders table and calls refresh_daily_summary to backfill the data.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT DISTINCT shop_id, created_at::date as order_date FROM orders) LOOP
    PERFORM refresh_daily_summary(r.shop_id, r.order_date);
  END LOOP;
END;
$$;
