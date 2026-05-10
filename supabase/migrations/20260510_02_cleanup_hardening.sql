-- =============================================================================
-- Migration: Hardening Storage Cleanup (Logging & Secret Auth)
-- =============================================================================

-- 1. Create the cleanup logs table for observability
CREATE TABLE IF NOT EXISTS public.cleanup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_count integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  errors text,
  created_at timestamptz DEFAULT now()
);

-- Secure the logs table so it can only be modified by the service role
ALTER TABLE public.cleanup_logs ENABLE ROW LEVEL SECURITY;

-- 2. Update the Cron Job to use a dedicated CLEANUP_SECRET
-- We replace the previous cron schedule to use our new custom secret instead of the DB JWT.

SELECT cron.unschedule('cleanup-storage-job');

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
