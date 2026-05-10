-- ============================================================
-- SmartPrint: PRODUCTION MAINTENANCE PLAYBOOK
-- ============================================================
-- ⚠️  NEVER run this entire file at once.
-- Each section is INDEPENDENT. Run section by section.
--
-- EXECUTION GROUPS:
--   GROUP A — PREVIEW   : SELECT only. Zero risk. Always run first.
--   GROUP B — SAFE      : Deletes safe data (expired OTPs, drafts). RUN DAILY.
--   GROUP C — RISK      : Deletes business data (old orders). RUN MONTHLY.
--   GROUP D — MAINTENANCE: VACUUM, indexes, partitions. RUN WEEKLY/MONTHLY.
--
-- FREQUENCY GUIDE:
--   Daily   → Sections 2, 4
--   Weekly  → Sections 5, 6
--   Monthly → Sections 1, 3, 7
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- GROUP A — PREVIEW QUERIES (READ-ONLY, zero risk)
-- Run these FIRST before any deletes.
-- ════════════════════════════════════════════════════════════

-- A1. Database disk usage (run anytime)
SELECT
  pg_size_pretty(pg_database_size(current_database())) AS total_db_size,
  NOW() AT TIME ZONE 'Asia/Kolkata'                    AS checked_at_ist;

-- A2. Table sizes and bloat
SELECT
  relname                                        AS table_name,
  pg_size_pretty(pg_total_relation_size(oid))   AS total_size,
  n_dead_tup                                    AS dead_rows,
  n_live_tup                                    AS live_rows,
  CASE WHEN n_live_tup > 0
    THEN ROUND(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 1)
    ELSE 0
  END                                           AS dead_pct,
  last_autovacuum,
  last_autoanalyze
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(oid) DESC
LIMIT 15;

-- A3. Order counts by status
SELECT status, COUNT(*) AS count
FROM orders
GROUP BY status
ORDER BY count DESC;

-- A4. OTP volume (how much space is being wasted)
SELECT
  COUNT(*) FILTER (WHERE expires_at < NOW()) AS expired_otps,
  COUNT(*) FILTER (WHERE verified = true)    AS used_otps,
  COUNT(*) FILTER (WHERE expires_at > NOW() AND verified = false) AS active_otps
FROM otp_verifications;

-- A5. Duplicate order preview (should be 0 after index applied)
SELECT
  shop_id,
  customer_phone,
  file_name,
  created_at::date AS day,
  COUNT(*) AS dup_count
FROM orders
GROUP BY shop_id, customer_phone, file_name, created_at::date
HAVING COUNT(*) > 1
ORDER BY dup_count DESC
LIMIT 20;

-- A6. Stale DRAFT orders preview (safe to delete)
SELECT COUNT(*) AS stale_drafts, MIN(created_at) AS oldest
FROM orders
WHERE status = 'DRAFT'
  AND created_at < NOW() - INTERVAL '30 minutes';

-- A7. Old terminal orders preview (90-day cleanup candidates)
SELECT
  status,
  COUNT(*) AS count,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest
FROM orders
WHERE status IN ('COMPLETED', 'CANCELLED')
  AND created_at < NOW() - INTERVAL '90 days'
GROUP BY status;


-- ════════════════════════════════════════════════════════════
-- GROUP B — SAFE DELETES (RUN DAILY)
-- Low risk. These rows have no business value after expiry.
-- ════════════════════════════════════════════════════════════


-- ─── SECTION 1: DUPLICATE ORDER PREVENTION (Run Once) ───────────────────────
-- Goal: Ensure no customer can submit the same order twice.
-- Step 1a: Preview duplicates (READ-ONLY, zero risk)

SELECT
  shop_id,
  customer_phone,
  file_name,
  created_at::date AS day,
  COUNT(*) AS dup_count
FROM orders
GROUP BY shop_id, customer_phone, file_name, created_at::date
HAVING COUNT(*) > 1
ORDER BY dup_count DESC
LIMIT 20;

-- Step 1b: Remove duplicates — keep the EARLIEST record per (shop_id, customer_phone, file_name, day)
-- ⚠️  Preview with 1a first. This permanently deletes rows.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY shop_id, customer_phone, file_name, created_at::date
      ORDER BY created_at ASC   -- keep earliest
    ) AS rn
  FROM orders
)
DELETE FROM orders
WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
RETURNING id;

-- Step 1c: Add a partial UNIQUE index to prevent future duplicates at DB level.
-- This blocks re-submission of the same file+phone to the same shop on the same day.
-- NOTE: On partitioned tables, UNIQUE constraints must be per-partition.
-- Use this index instead — it's enforced at query time and works across partitions:
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_dedup
  ON orders (shop_id, customer_phone, file_name, (created_at::date))
  WHERE status NOT IN ('CANCELLED', 'DRAFT');

-- ─── SECTION 2: STALE DRAFT CLEANUP (Safe to run daily) ─────────────────────
-- DRAFT orders older than 30 minutes were never submitted. Safe to delete.

-- 2a. Preview count first:
SELECT COUNT(*) AS stale_drafts, MIN(created_at) AS oldest
FROM orders
WHERE status = 'DRAFT'
  AND created_at < NOW() - INTERVAL '30 minutes';

-- 2b. Delete them:
WITH deleted AS (
  DELETE FROM orders
  WHERE status = 'DRAFT'
    AND created_at < NOW() - INTERVAL '30 minutes'
  RETURNING id
)
SELECT COUNT(*) AS draft_rows_deleted FROM deleted;


-- ─── SECTION 3: OLD ORDER ARCHIVAL / CLEANUP (Run Monthly) ──────────────────
-- Delete COMPLETED/CANCELLED orders older than 90 days.
-- IMPORTANT: Before running 3b, ensure you have exported any data you need.

-- 3a. Preview what would be deleted:
SELECT
  status,
  COUNT(*) AS count,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest
FROM orders
WHERE status IN ('COMPLETED', 'CANCELLED')
  AND created_at < NOW() - INTERVAL '90 days'
GROUP BY status;

-- 3b. Delete old terminal orders:
-- ⚠️  Run 3a preview first. This cannot be undone without point-in-time restore.
WITH deleted AS (
  DELETE FROM orders
  WHERE status IN ('COMPLETED', 'CANCELLED')
    AND created_at < NOW() - INTERVAL '90 days'
  RETURNING id
)
SELECT COUNT(*) AS orders_archived FROM deleted;


-- ─── SECTION 4: OTP CLEANUP (Safe to run anytime) ────────────────────────────
-- OTPs are short-lived. Expired + verified ones are worthless and waste space.

-- 4a. Preview:
SELECT
  COUNT(*) FILTER (WHERE expires_at < NOW()) AS expired_count,
  COUNT(*) FILTER (WHERE verified = true)    AS verified_count
FROM otp_verifications;

-- 4b. Delete:
WITH deleted AS (
  DELETE FROM otp_verifications
  WHERE expires_at < NOW()
     OR verified = true
  RETURNING id
)
SELECT COUNT(*) AS otp_rows_deleted FROM deleted;


-- ─── SECTION 5: VACUUM & ANALYZE (Safe, non-locking) ─────────────────────────
-- Run after bulk deletes. Reclaims disk space and updates query planner stats.
-- VACUUM (without FULL) never locks reads or writes.

VACUUM (VERBOSE, ANALYZE) orders;
VACUUM (VERBOSE, ANALYZE) shops;
VACUUM (VERBOSE, ANALYZE) otp_verifications;

-- ⚠️  VACUUM FULL — use only during a maintenance window (takes a full table lock).
-- It physically rewrites the table and reclaims the most space.
-- Only needed if dead_pct > 30% in Section 6a below.
-- VACUUM FULL orders;   ← UNCOMMENT ONLY IF NEEDED, DURING LOW TRAFFIC


-- ─── SECTION 6: HEALTH CHECK (Read-only, always safe) ───────────────────────

-- 6a. Table bloat overview:
SELECT
  relname                                        AS table_name,
  pg_size_pretty(pg_total_relation_size(oid))   AS total_size,
  n_dead_tup                                    AS dead_rows,
  n_live_tup                                    AS live_rows,
  CASE WHEN n_live_tup > 0
    THEN ROUND(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 1)
    ELSE 0
  END                                           AS dead_pct,
  last_autovacuum,
  last_autoanalyze
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(oid) DESC
LIMIT 15;

-- 6b. Order counts by status (quick health snapshot):
SELECT status, COUNT(*) AS count
FROM orders
GROUP BY status
ORDER BY count DESC;

-- 6c. Partition status (ensure future months exist):
SELECT
  child.relname                                 AS partition_name,
  pg_size_pretty(pg_relation_size(child.oid))  AS size,
  (SELECT COUNT(*) FROM orders
   WHERE tableoid = child.oid)                 AS row_count
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
WHERE parent.relname = 'orders'
ORDER BY child.relname;


-- ─── SECTION 7: ENSURE FUTURE PARTITIONS EXIST (Run Monthly) ─────────────────
-- Missing partition = INSERT fails at end of month. Run this at start of each month.

DO $$
DECLARE
  base_date  DATE := DATE_TRUNC('month', CURRENT_DATE);
  start_date DATE;
  end_date   DATE;
  tbl_name   TEXT;
  i          INT;
BEGIN
  FOR i IN 0..5 LOOP  -- current + 5 future months
    start_date := base_date + (i || ' months')::INTERVAL;
    end_date   := start_date + INTERVAL '1 month';
    tbl_name   := 'orders_' || TO_CHAR(start_date, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF orders FOR VALUES FROM (%L) TO (%L)',
      tbl_name, start_date, end_date
    );
    RAISE NOTICE 'Ensured partition: %', tbl_name;
  END LOOP;
END $$;


-- ─── DONE ─────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM orders)                  AS total_orders,
  (SELECT COUNT(*) FROM shops)                   AS total_shops,
  (SELECT COUNT(*) FROM otp_verifications)       AS total_otps,
  NOW() AT TIME ZONE 'Asia/Kolkata'              AS run_at_ist;
