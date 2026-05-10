-- =============================================================================
-- Migration: Create Upload Tracking Table & Auto-Cleanup Cron Job
-- =============================================================================

-- 1. Create the Private Storage Bucket for orders (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-files', 
  'order-files', 
  false, 
  52428800, -- 50MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET 
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['application/pdf'];

-- 2. Create the tracking table
CREATE TABLE IF NOT EXISTS public.uploaded_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Secure the tracking table so it can only be modified by the service role
ALTER TABLE public.uploaded_documents ENABLE ROW LEVEL SECURITY;

-- Allow inserts via service role or API (if we need client access later, but we use admin client)
-- Since we use the service role key for inserting tracking metadata in the API, 
-- no public RLS policies are needed.

-- 2. Ensure pg_net and pg_cron extensions are available
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 3. Schedule the Cron Job to run every 2 hours
-- This will call the Supabase Edge Function using pg_net
-- NOTE: Replace YOUR_PROJECT_REF with your actual Supabase project reference
--       when running this in production, or ensure the Edge Function URL is correct.
--       Since the SQL execution might happen in the dashboard, we can't easily inject env vars.
--       The user should update the URL and Bearer token below.

SELECT cron.schedule(
  'cleanup-storage-job',
  '0 */2 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://' || current_setting('request.headers')::json->>'x-forwarded-host' || '/functions/v1/cleanup-storage',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || current_setting('request.jwt.claim.role', true) -- Or replace with actual service_role key
      )
    );
  $$
);
