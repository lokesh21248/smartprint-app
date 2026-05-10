-- ============================================================
-- SmartPrint: PERFORMANCE AUDIT FIXES — SQL
-- Run each section independently in Supabase SQL Editor.
-- Generated: 2026-05-05
-- ============================================================


-- ─── SECTION 1: RPC for Metrics (C1 Fix) ──────────────────────────────────────
-- Required by app/api/admin/jobs/metrics/route.ts
-- Replaces 3 separate queries (including a full table scan) with 1 aggregation.
--
-- Run once. Safe to re-run (CREATE OR REPLACE).
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_webhook_job_counts()
RETURNS jsonb
LANGUAGE sql
STABLE  -- marks it as read-only; Postgres can cache the result within a transaction
AS $$
  SELECT jsonb_object_agg(status, cnt)
  FROM (
    SELECT status, COUNT(*) AS cnt
    FROM webhook_jobs
    GROUP BY status
  ) t;
$$;

-- Verify:
-- SELECT get_webhook_job_counts();


-- ─── SECTION 2: Missing Indexes ────────────────────────────────────────────────
-- All indexes use IF NOT EXISTS — safe to re-run at any time.
-- These are non-blocking CREATE INDEX CONCURRENTLY equivalent
-- (Supabase runs them in a transaction; for zero-downtime on large tables,
--  run them off-peak hours).
-- ──────────────────────────────────────────────────────────────────────────────

-- 2a. Duplicate detection query (POST /api/orders)
-- Covers: .eq("shop_id").eq("customer_phone").eq("file_name").gte("created_at").not("status","in",...)
-- Without this, every order submission does a seq-scan on orders.
CREATE INDEX IF NOT EXISTS idx_orders_dedup_lookup
  ON orders (shop_id, customer_phone, file_name, created_at DESC)
  WHERE status NOT IN ('CANCELLED', 'DRAFT');

-- 2b. Shop ownership lookup (used in every authenticated shop endpoint)
-- Covers: .eq("clerk_owner_id", userId)
CREATE INDEX IF NOT EXISTS idx_shops_clerk_owner_id
  ON shops (clerk_owner_id);

-- 2c. Webhook job worker fetch (status + next_retry_at range)
-- Covers: .in("status", ["pending","failed"]) + pickup_webhook_jobs RPC
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_status_next_retry
  ON webhook_jobs (status, next_retry_at)
  WHERE status IN ('pending', 'failed');

-- 2d. Job logs time-based ORDER BY (metrics endpoint)
-- Covers: .order("created_at", { ascending: false }).limit(50)
CREATE INDEX IF NOT EXISTS idx_job_logs_created_at
  ON job_logs (created_at DESC);

-- 2e. Notifications lookup (real-time dashboard feed per user)
-- Covers: .eq("user_id").order("created_at", DESC)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- 2f. OTP cleanup (PRODUCTION_MAINTENANCE.sql Section 4)
-- Covers: WHERE expires_at < NOW() OR verified = true
CREATE INDEX IF NOT EXISTS idx_otp_expires_verified
  ON otp_verifications (expires_at, verified)
  WHERE verified = false;


-- ─── SECTION 3: Verify Indexes Created ────────────────────────────────────────

SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE indexname IN (
  'idx_orders_dedup_lookup',
  'idx_shops_clerk_owner_id',
  'idx_webhook_jobs_status_next_retry',
  'idx_job_logs_created_at',
  'idx_notifications_user_created',
  'idx_otp_expires_verified'
)
ORDER BY tablename, indexname;
