-- =============================================================================
-- SMARTPRINT PRODUCTION-SAFE UPLOAD + CLEANUP ARCHITECTURE
-- =============================================================================
-- FEATURES
-- =============================================================================
-- ✅ Temporary upload staging
-- ✅ Permanent order file preservation
-- ✅ Automatic cleanup of abandoned uploads
-- ✅ Cleanup logs
-- ✅ pg_cron automation
-- ✅ Protection against customer data deletion
-- ✅ Safe storage-only cleanup
-- ✅ Scalable upload session architecture
-- =============================================================================

BEGIN;

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =============================================================================
-- UPLOAD SESSIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID,

  order_id UUID NULL,

  bucket_name TEXT NOT NULL,

  file_name TEXT NOT NULL,

  storage_path TEXT NOT NULL,

  mime_type TEXT,

  file_size BIGINT,

  upload_status TEXT NOT NULL DEFAULT 'pending',

  is_temporary BOOLEAN DEFAULT true,

  upload_progress INTEGER DEFAULT 0,

  expires_at TIMESTAMPTZ,

  completed_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.upload_sessions DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_upload_sessions_user_id
ON public.upload_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_order_id
ON public.upload_sessions(order_id)
WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_upload_sessions_upload_status
ON public.upload_sessions(upload_status);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires_at
ON public.upload_sessions(expires_at)
WHERE is_temporary = true;

CREATE INDEX IF NOT EXISTS idx_upload_sessions_bucket
ON public.upload_sessions(bucket_name);

-- =============================================================================
-- CLEANUP LOGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cleanup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  deleted_file_count INTEGER DEFAULT 0,

  reclaimed_storage_bytes BIGINT DEFAULT 0,

  status TEXT NOT NULL,

  error_message TEXT DEFAULT NULL,

  started_at TIMESTAMPTZ DEFAULT NOW(),

  completed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.cleanup_logs DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cleanup_logs_started_at
ON public.cleanup_logs(started_at DESC);

-- =============================================================================
-- HARD DELETE PROTECTION FOR ORDERS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_order_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'CRITICAL SECURITY VIOLATION: Orders cannot be hard deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_order_hard_delete
ON public.orders;

CREATE TRIGGER trg_prevent_order_hard_delete
BEFORE DELETE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_order_hard_delete();

-- =============================================================================
-- SAFE TEMP UPLOAD CLEANUP FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_temp_uploads()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;

  v_deleted_count INTEGER := 0;

  v_reclaimed_bytes BIGINT := 0;

  v_start_time TIMESTAMPTZ := NOW();

BEGIN

  -- ===========================================================================
  -- PREVENT OVERLAPPING CLEANUP EXECUTION
  -- ===========================================================================

  IF NOT pg_try_advisory_lock(987654321) THEN
    RAISE NOTICE 'Cleanup already running.';
    RETURN;
  END IF;

  -- ===========================================================================
  -- FIND EXPIRED TEMP FILES
  -- ===========================================================================

  FOR v_rec IN
    SELECT
      id,
      storage_path,
      file_size
    FROM public.upload_sessions
    WHERE is_temporary = true
      AND order_id IS NULL
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
      AND upload_status IN (
        'pending',
        'uploading',
        'failed',
        'abandoned'
      )
  LOOP

    BEGIN

      -- =======================================================================
      -- DELETE ONLY TEMP STORAGE OBJECTS
      -- =======================================================================

      DELETE FROM storage.objects
      WHERE bucket_id = 'temp-uploads'
        AND name = v_rec.storage_path;

      -- =======================================================================
      -- MARK SESSION AS ABANDONED
      -- =======================================================================

      UPDATE public.upload_sessions
      SET
        upload_status = 'abandoned',
        updated_at = NOW()
      WHERE id = v_rec.id;

      -- =======================================================================
      -- TRACK CLEANUP STATS
      -- =======================================================================

      v_deleted_count := v_deleted_count + 1;

      v_reclaimed_bytes :=
        v_reclaimed_bytes + COALESCE(v_rec.file_size, 0);

    EXCEPTION WHEN OTHERS THEN

      INSERT INTO public.cleanup_logs (
        deleted_file_count,
        reclaimed_storage_bytes,
        status,
        error_message,
        started_at,
        completed_at
      )
      VALUES (
        v_deleted_count,
        v_reclaimed_bytes,
        'FAILED',
        SQLERRM,
        v_start_time,
        NOW()
      );

    END;

  END LOOP;

  -- ===========================================================================
  -- SUCCESS LOG
  -- ===========================================================================

  INSERT INTO public.cleanup_logs (
    deleted_file_count,
    reclaimed_storage_bytes,
    status,
    started_at,
    completed_at
  )
  VALUES (
    v_deleted_count,
    v_reclaimed_bytes,
    'SUCCESS',
    v_start_time,
    NOW()
  );

  -- ===========================================================================
  -- RELEASE LOCK
  -- ===========================================================================

  PERFORM pg_advisory_unlock(987654321);

EXCEPTION WHEN OTHERS THEN

  PERFORM pg_advisory_unlock(987654321);

  RAISE;

END;
$$;

-- =============================================================================
-- FUNCTION COMMENT
-- =============================================================================

COMMENT ON FUNCTION public.cleanup_temp_uploads IS
'Deletes ONLY expired temporary upload files from temp-uploads bucket. Never deletes customer orders or permanent order assets.';

-- =============================================================================
-- REMOVE OLD CLEANUP JOB
-- =============================================================================

DO $$
BEGIN

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'daily-temp-cleanup-job'
  ) THEN

    PERFORM cron.unschedule('daily-temp-cleanup-job');

  END IF;

END;
$$;

-- =============================================================================
-- CREATE SAFE DAILY CLEANUP CRON
-- =============================================================================

SELECT cron.schedule(
  'daily-temp-cleanup-job',
  '0 1 * * *',
  $cron$
  SELECT public.cleanup_temp_uploads();
  $cron$
);

-- =============================================================================
-- STORAGE SAFETY NOTES
-- =============================================================================
-- SAFE:
--   temp-uploads bucket
--   abandoned uploads
--   failed uploads
--   expired staging files
--
-- NEVER DELETE:
--   order-files bucket
--   invoices bucket
--   customer orders
--   payment records
--   user profiles
-- =============================================================================

COMMIT;
