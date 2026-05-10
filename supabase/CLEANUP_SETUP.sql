-- ============================================================
-- SmartPrint: AUTOMATIC CLEANUP SYSTEM
-- ============================================================
-- Run this ONCE in Supabase → SQL Editor to set up the
-- database-side cleanup infrastructure.
--
-- The cleanup_orders() function is a SAFETY FALLBACK only.
-- It handles DB rows but CANNOT delete storage files.
-- The primary cleanup runs via /api/cron/cleanup (API route).
-- ============================================================


-- ─── SECTION 1: CLEANUP FUNCTION (DB-only, no storage) ───────────────────────
-- WARNING: This deletes DB rows only — storage files must be deleted via API.
-- Use this only as a last resort or for orders with no file_s3_key.

CREATE OR REPLACE FUNCTION cleanup_orders()
RETURNS TABLE(deleted_count BIGINT, draft_count BIGINT) AS $$
DECLARE
  v_deleted BIGINT;
  v_drafts  BIGINT;
BEGIN
  -- Delete COMPLETED/CANCELLED orders older than 6 hours
  DELETE FROM orders
  WHERE status IN ('COMPLETED', 'CANCELLED')
    AND created_at < NOW() - INTERVAL '6 hours'
    AND (file_s3_key IS NULL OR file_s3_key = '');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Delete DRAFT orders older than 30 minutes (no file written yet)
  DELETE FROM orders
  WHERE status = 'DRAFT'
    AND created_at < NOW() - INTERVAL '30 minutes'
    AND (file_s3_key IS NULL OR file_s3_key = '');
  GET DIAGNOSTICS v_drafts = ROW_COUNT;

  RETURN QUERY SELECT v_deleted, v_drafts;
END;
$$ LANGUAGE plpgsql;

-- ─── SECTION 2: CLEANUP HELPER VIEW (Inspect eligible orders) ────────────────
-- Run this to see what WOULD be cleaned up before triggering

CREATE OR REPLACE VIEW orders_eligible_for_cleanup AS
  SELECT 
    id,
    shop_id,
    status,
    file_s3_key,
    created_at,
    CASE
      WHEN status IN ('COMPLETED', 'CANCELLED') AND created_at < NOW() - INTERVAL '6 hours'
        THEN 'terminal_6h'
      WHEN status = 'DRAFT' AND created_at < NOW() - INTERVAL '30 minutes'
        THEN 'draft_30min'
    END AS cleanup_reason,
    NOW() - created_at AS age
  FROM orders
  WHERE 
    (
      status IN ('COMPLETED', 'CANCELLED') 
      AND created_at < NOW() - INTERVAL '6 hours'
    )
    OR
    (
      status = 'DRAFT' 
      AND created_at < NOW() - INTERVAL '30 minutes'
    )
  ORDER BY created_at ASC;


-- ─── SECTION 3: STORAGE ORPHAN DETECTOR ──────────────────────────────────────
-- Find orders where file_s3_key exists but status is terminal
-- These MUST be cleaned via API route, not this SQL

SELECT
  COUNT(*) AS orders_with_files_to_delete,
  MIN(created_at) AS oldest_eligible
FROM orders_eligible_for_cleanup
WHERE file_s3_key IS NOT NULL
  AND file_s3_key != '';


-- ─── SECTION 4: SUPABASE CRON (pg_cron) ──────────────────────────────────────
-- Enable the pg_cron extension in Supabase:
-- Dashboard → Database → Extensions → Search "pg_cron" → Enable

-- After enabling, run this to schedule the DB-only cleanup hourly:
-- (Note: Primary cleanup runs via /api/cron/cleanup API route from Vercel Cron)

SELECT cron.schedule(
  'smartprint-cleanup-db',     -- job name (unique)
  '0 * * * *',                 -- every hour at minute 0
  $$SELECT cleanup_orders()$$  -- call the function
);

-- To verify the cron job was created:
SELECT jobid, schedule, command, active
FROM cron.job
WHERE jobname = 'smartprint-cleanup-db';

-- To remove the job if needed:
-- SELECT cron.unschedule('smartprint-cleanup-db');


-- ─── SECTION 5: SAFE VERIFICATION QUERIES ────────────────────────────────────

-- Check current order count by status
SELECT status, COUNT(*) as count
FROM orders
GROUP BY status
ORDER BY count DESC;

-- Check storage usage per shop (file count and oldest)
SELECT
  shop_id,
  COUNT(*) as file_count,
  MIN(created_at) as oldest_file,
  MAX(created_at) as newest_file
FROM orders
WHERE file_s3_key IS NOT NULL AND file_s3_key != ''
GROUP BY shop_id;

-- Confirm NO active orders are in the cleanup view (safety check)
SELECT COUNT(*) AS active_orders_in_cleanup_view
FROM orders_eligible_for_cleanup
WHERE status IN ('PLACED', 'ACCEPTED', 'PRINTING', 'READY');
-- ← This must always return 0. If not, something is wrong.
