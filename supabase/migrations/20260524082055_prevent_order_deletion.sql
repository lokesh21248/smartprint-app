-- ==============================================================================
-- 20260524082055_prevent_order_deletion.sql
-- CRITICAL PRODUCTION BUG FIX: Permanent Order Retention & Storage-Only Expiration.
-- Ensures customer order metadata, history, and status tracking are NEVER deleted.
-- Only deletes storage file assets via secure storage.objects management.
-- ==============================================================================

-- 1. Create the cleanup logs table for observability (supporting both summary & granular logs)
CREATE TABLE IF NOT EXISTS public.cleanup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_count INTEGER NOT NULL DEFAULT 0,  -- Summary count of deleted files (used by cron and functions)
  status TEXT NOT NULL,                     -- 'SUCCESS', 'FAILED', 'PARTIAL_SUCCESS'
  errors TEXT,                              -- Summary concatenated error messages
  created_at TIMESTAMPTZ DEFAULT NOW(),
  storage_path TEXT DEFAULT NULL,           -- Granular: path of the specific deleted asset
  order_id UUID DEFAULT NULL,               -- Granular: link to specific order
  error TEXT DEFAULT NULL                   -- Granular: specific error message for this file
);

-- Secure the logs table so it can only be modified by the service role
ALTER TABLE public.cleanup_logs ENABLE ROW LEVEL SECURITY;

-- Add RLS policy to ensure service role has complete access
CREATE POLICY "Allow service_role full access" ON public.cleanup_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Create public.order_files table if it does not exist (flexible partition-safe schema)
CREATE TABLE IF NOT EXISTS public.order_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL, -- Decoupled from direct FK to bypass Postgres monthly partitioning unique constraint limitations
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  page_count INT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  file_status TEXT NOT NULL DEFAULT 'active'
);

-- Create index for fast lookup by order_id if not exists
CREATE INDEX IF NOT EXISTS idx_order_files_order_id ON public.order_files (order_id);

-- Disable Row Level Security (RLS) to align with SmartPrint's security model
ALTER TABLE public.order_files DISABLE ROW LEVEL SECURITY;

-- 3. Drop the dangerous cascade foreign key constraint entirely
-- This prevents unique constraint/partitioning matching errors and eliminates cascade deletion paths.
ALTER TABLE public.order_files
  DROP CONSTRAINT IF EXISTS order_files_order_id_fkey;

-- 4. Add soft-delete and file tracking columns to schema
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS file_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.order_files
  ADD COLUMN IF NOT EXISTS file_status TEXT NOT NULL DEFAULT 'active';

-- Add index on file_status to optimize cleanup cron queries
CREATE INDEX IF NOT EXISTS idx_orders_file_status ON public.orders (file_status) WHERE file_status = 'active';

-- 5. Safety trigger to prevent ANY hard deletes on the orders table
-- Prevents bulk deletes, automated script errors, and accidental deletions.
-- Permissible only for transactional rollback of failed inserts within 5 minutes.
CREATE OR REPLACE FUNCTION public.prevent_order_hard_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow rollback of failed creation transactions (less than 5 minutes old)
  IF OLD.created_at >= NOW() - INTERVAL '5 minutes' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'CRITICAL SECURITY VIOLATION: Hard-deleting order records older than 5 minutes is strictly prohibited in SmartPrint. Use soft deletion (deleted_at) or only expire storage files.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_prevent_order_hard_deletion
  BEFORE DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_hard_deletion();

-- 6. Revoke DELETE privileges on orders table from anon and authenticated roles
REVOKE DELETE ON TABLE public.orders FROM anon;
REVOKE DELETE ON TABLE public.orders FROM authenticated;

-- 7. Safe database-level storage cleanup function
-- Scans storage.objects, deletes S3 tracked files, logs events, updates order statuses.
-- Never deletes public.orders records.
CREATE OR REPLACE FUNCTION public.expire_stale_order_files()
RETURNS VOID AS $$
DECLARE
  v_rec RECORD;
  v_deleted_count INT := 0;
BEGIN
  -- A. Process files tracked under order_files table
  FOR v_rec IN 
    SELECT 
      o.id AS order_id, 
      ofile.id AS order_file_id,
      ofile.storage_path
    FROM public.orders o
    JOIN public.order_files ofile ON o.id = ofile.order_id
    WHERE o.status IN ('COMPLETED', 'CANCELLED', 'DRAFT')
      AND ofile.file_status = 'active'
      AND o.created_at < NOW() - INTERVAL '25 hours'
  LOOP
    BEGIN
      -- Delete from Supabase storage tracking (triggers physical deletion via storage bucket trigger)
      DELETE FROM storage.objects 
      WHERE bucket_id = 'order-files' 
        AND name = v_rec.storage_path;

      -- Mark child file metadata as expired in public DB
      UPDATE public.order_files 
      SET file_status = 'expired' 
      WHERE id = v_rec.order_file_id;

      -- Log successful expiration
      INSERT INTO public.cleanup_logs (storage_path, order_id, status)
      VALUES (v_rec.storage_path, v_rec.order_id, 'SUCCESS');

      v_deleted_count := v_deleted_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Log failure without interrupting the remaining batch
      INSERT INTO public.cleanup_logs (storage_path, order_id, status, error)
      VALUES (v_rec.storage_path, v_rec.order_id, 'FAILED', SQLERRM);
    END;
  END LOOP;

  -- B. Process files tracked under legacy order.file_s3_key column
  FOR v_rec IN 
    SELECT 
      o.id AS order_id, 
      o.file_s3_key
    FROM public.orders o
    WHERE o.status IN ('COMPLETED', 'CANCELLED', 'DRAFT')
      AND o.file_s3_key IS NOT NULL 
      AND o.file_s3_key <> ''
      AND o.file_status = 'active'
      AND o.created_at < NOW() - INTERVAL '25 hours'
  LOOP
    BEGIN
      -- Delete from Supabase storage tracking
      DELETE FROM storage.objects 
      WHERE bucket_id = 'order-files' 
        AND name = v_rec.file_s3_key;

      -- Log successful expiration
      INSERT INTO public.cleanup_logs (storage_path, order_id, status)
      VALUES (v_rec.file_s3_key, v_rec.order_id, 'SUCCESS');

      v_deleted_count := v_deleted_count + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.cleanup_logs (storage_path, order_id, status, error)
      VALUES (v_rec.file_s3_key, v_rec.order_id, 'FAILED', SQLERRM);
    END;
  END LOOP;

  -- C. Set parent order status to expired when all child files are expired
  UPDATE public.orders o
  SET file_status = 'expired'
  WHERE o.file_status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.order_files ofile 
      WHERE ofile.order_id = o.id AND ofile.file_status = 'active'
    )
    AND o.status IN ('COMPLETED', 'CANCELLED', 'DRAFT')
    AND o.created_at < NOW() - INTERVAL '25 hours';

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment for database administration
COMMENT ON FUNCTION public.expire_stale_order_files() IS 'Safe routine to expire storage files for stale orders while keeping database records 100% intact.';

-- 8. Update the pg_cron Job to use a dedicated CLEANUP_SECRET
-- Ensure the pg_cron extension is active in pg_catalog/default schema
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Safely unschedule cleanup-storage-job if it already exists to prevent duplicate schedules or errors
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_cron.cron_job WHERE jobname = 'cleanup-storage-job') THEN
    PERFORM cron.unschedule('cleanup-storage-job');
  END IF;
END;
$$;

-- Schedule the cleanup edge function execution every 2 hours
SELECT cron.schedule(
  'cleanup-storage-job',
  '0 */2 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://ngreyymhgnzcakfnfcuh.supabase.co/functions/v1/cleanup-storage',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer smartprint_cleanup_2026_secure'
      )
    );
  $$
);
