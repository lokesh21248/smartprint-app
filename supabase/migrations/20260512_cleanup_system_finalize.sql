-- =============================================================================
-- Migration: 20260512_cleanup_system_finalize.sql
-- Purpose:   Finalize the Vercel-Cron-based cleanup system.
--            Safe to run multiple times (all statements are idempotent).
-- Run in:    Supabase SQL Editor → Primary Database → Role: postgres
-- =============================================================================

-- ── 1. Ensure uploaded_documents table exists with correct schema ─────────────
CREATE TABLE IF NOT EXISTS public.uploaded_documents (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path  text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.uploaded_documents ENABLE ROW LEVEL SECURITY;

-- Only the service role key (used by our API routes) can read/write this table.
-- No public RLS policies needed — admin client bypasses RLS entirely.

-- ── 2. Ensure cleanup_logs table exists with correct schema ──────────────────
CREATE TABLE IF NOT EXISTS public.cleanup_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_count integer     NOT NULL DEFAULT 0,
  status        text        NOT NULL,   -- SUCCESS | PARTIAL_SUCCESS | FAILED
  errors        text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.cleanup_logs ENABLE ROW LEVEL SECURITY;

-- ── 3. Critical performance indexes ─────────────────────────────────────────
-- These allow the cleanup route to do O(log n) scans on large tables.

-- Cleanup sweep: find stale orders by created_at
CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public.orders (created_at ASC);

-- Storage reference lookup during orphan sweep
CREATE INDEX IF NOT EXISTS idx_orders_file_s3_key
  ON public.orders (file_s3_key);

-- Cleanup sweep: find stale upload tracking rows
CREATE INDEX IF NOT EXISTS idx_uploaded_documents_created_at
  ON public.uploaded_documents (created_at ASC);

-- Cleanup log reads: most recent first
CREATE INDEX IF NOT EXISTS idx_cleanup_logs_created_at
  ON public.cleanup_logs (created_at DESC);

-- ── 4. Ensure pg_cron and old Edge Function cron are fully removed ───────────
-- (Safe even if the job no longer exists — cron.unschedule returns false gracefully)
SELECT cron.unschedule('cleanup-storage-job') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-storage-job'
);

-- ── 5. Verify final state ────────────────────────────────────────────────────
-- Run this SELECT to confirm cron jobs are clean after migration:
--   SELECT jobname, schedule, active FROM cron.job;
-- Expected: 0 rows (all cleanup is now handled by Vercel Cron only)

-- ── 6. Optional: view the last 10 cleanup runs ───────────────────────────────
-- SELECT id, deleted_count, status, errors, created_at
-- FROM public.cleanup_logs
-- ORDER BY created_at DESC
-- LIMIT 10;
