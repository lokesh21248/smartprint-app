-- ============================================================
-- SmartPrint: WAL & Log Growth Control
-- Safe to run anytime — READ-ONLY diagnostics first,
-- then optional maintenance commands.
-- Run each section separately in Supabase SQL Editor.
-- ============================================================

-- ─── SECTION 1: DIAGNOSE — How big is WAL/bloat right now? ──────────────────
-- Run this first. Zero risk.

-- 1a. Table sizes (shows bloat candidates)
SELECT
  relname                                        AS table_name,
  pg_size_pretty(pg_total_relation_size(oid))   AS total_size,
  pg_size_pretty(pg_relation_size(oid))         AS table_size,
  pg_size_pretty(pg_total_relation_size(oid)
    - pg_relation_size(oid))                    AS index_size,
  n_dead_tup                                    AS dead_rows,
  n_live_tup                                    AS live_rows,
  CASE WHEN n_live_tup > 0
    THEN ROUND(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 1)
    ELSE 0
  END                                           AS dead_pct
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(oid) DESC
LIMIT 20;

-- 1b. WAL size & replication lag (if using logical replication)
SELECT
  slot_name,
  slot_type,
  active,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_retained
FROM pg_replication_slots;
-- ⚠️  If wal_retained > 500MB on any inactive slot → drop it (Section 3b).

-- 1c. Largest indexes (over-indexed tables waste WAL on every write)
SELECT
  indexname,
  tablename,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_indexes
JOIN pg_class ON pg_class.relname = pg_indexes.indexname
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 15;

-- 1d. Check autovacuum status (if not running, dead rows accumulate = WAL bloat)
SELECT
  relname,
  last_autovacuum,
  last_autoanalyze,
  autovacuum_count,
  n_dead_tup
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;


-- ─── SECTION 2: VACUUM — Remove dead rows (safe, non-locking) ───────────────
-- Run after Section 1 confirms dead rows exist.
-- VACUUM alone never locks reads/writes. VACUUM FULL does — don't use it.

VACUUM (VERBOSE, ANALYZE) otp_verifications;
VACUUM (VERBOSE, ANALYZE) audit_log;
VACUUM (VERBOSE, ANALYZE) orders;
VACUUM (VERBOSE, ANALYZE) shops;
-- Note: VACUUM on partitioned tables cascades to all partitions automatically.


-- ─── SECTION 3: PRUNE EXPIRED DATA — Safe deletes with ROWCOUNTs ────────────

-- 3a. Delete expired + verified OTP records (already used, safe to delete)
-- These accumulate fast (5/hour per active user) and are never needed after use.
WITH deleted AS (
  DELETE FROM otp_verifications
  WHERE
    expires_at < NOW()               -- already expired
    OR verified = true               -- already used
  RETURNING id
)
SELECT COUNT(*) AS otp_rows_deleted FROM deleted;

-- 3b. Delete audit_log entries older than 90 days
-- Supabase free tier has ~500MB storage. audit_log is the #1 WAL writer.
WITH deleted AS (
  DELETE FROM audit_log
  WHERE created_at < NOW() - INTERVAL '90 days'
  RETURNING id
)
SELECT COUNT(*) AS audit_rows_deleted FROM deleted;

-- 3c. Drop inactive replication slots (if any found in Section 1b)
-- ⚠️  Only run if a slot showed large wal_retained AND active = false
-- Replace 'slot_name_here' with the actual slot name from 1b.
-- SELECT pg_drop_replication_slot('slot_name_here');


-- ─── SECTION 4: TRUNCATE RATE LIMITS — Safe to clear completely ─────────────
-- rate_limits rows are only valid within their window_end.
-- All expired rows are useless. Truncate is instant (no WAL per-row).
DELETE FROM rate_limits
WHERE window_end < NOW();
-- Result: clears all expired windows, keeps any active rate limit windows.


-- ─── SECTION 5: VERIFY AUTOVACUUM SETTINGS ──────────────────────────────────
-- Supabase sets autovacuum aggressively. Confirm it's on for high-write tables.
-- READ-ONLY — safe.

SELECT name, setting, unit, short_desc
FROM pg_settings
WHERE name IN (
  'autovacuum',
  'autovacuum_vacuum_scale_factor',
  'autovacuum_analyze_scale_factor',
  'autovacuum_vacuum_cost_delay',
  'wal_level',
  'max_wal_size'
)
ORDER BY name;

-- Expected safe values for SmartPrint:
--   autovacuum                    = on
--   autovacuum_vacuum_scale_factor = 0.01 (Supabase default)
--   wal_level                     = logical (required for Realtime)
--   max_wal_size                  = 1GB (Supabase default)


-- ─── SECTION 6: PARTITION MAINTENANCE ───────────────────────────────────────
-- Ensure future partitions exist (orders are partitioned by month).
-- Missing partition = INSERT ERROR. Run monthly.

DO $$
DECLARE
  base_date  DATE := DATE_TRUNC('month', CURRENT_DATE);
  start_date DATE;
  end_date   DATE;
  tbl_name   TEXT;
  i          INT;
BEGIN
  FOR i IN 0..5 LOOP  -- current month + 5 future months
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

-- Verify all partitions exist:
SELECT
  child.relname                              AS partition_name,
  pg_size_pretty(pg_relation_size(child.oid)) AS size
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
WHERE parent.relname = 'orders'
ORDER BY child.relname;


-- ─── DONE ────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM otp_verifications)  AS otp_remaining,
  (SELECT COUNT(*) FROM audit_log)          AS audit_log_remaining,
  (SELECT COUNT(*) FROM rate_limits)        AS rate_limits_remaining,
  NOW()                                     AS run_at;
