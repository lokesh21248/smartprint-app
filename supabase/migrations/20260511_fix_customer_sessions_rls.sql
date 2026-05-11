-- =============================================================================
-- Migration: 20260511_fix_customer_sessions_rls.sql
-- Description: Fix "permission denied" error for customer_sessions table.
--              Ensures the public role has necessary permissions to work with 
--              the table even when RLS is enabled.
-- =============================================================================

-- 1. Ensure the table exists (idempotent)
CREATE TABLE IF NOT EXISTS public.customer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  shop_slug TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Explicitly grant permissions to the public role
-- RLS works on top of standard SQL permissions. If 'public' doesn't have 
-- INSERT/SELECT permissions at the table level, they get "permission denied".
GRANT ALL ON TABLE public.customer_sessions TO postgres;
GRANT ALL ON TABLE public.customer_sessions TO service_role;
GRANT INSERT, SELECT ON TABLE public.customer_sessions TO anon;
GRANT INSERT, SELECT ON TABLE public.customer_sessions TO authenticated;

-- 3. Enable RLS (idempotent)
ALTER TABLE public.customer_sessions ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow public session creation" ON public.customer_sessions;
DROP POLICY IF EXISTS "Allow public session select" ON public.customer_sessions;

-- 5. Create robust policies for anonymous users
-- Allow anyone (anon + auth) to create a session record
CREATE POLICY "Allow public session creation"
ON public.customer_sessions
FOR INSERT
TO public
WITH CHECK (true);

-- Allow anyone to select sessions (needed for .select() after .insert())
CREATE POLICY "Allow public session select"
ON public.customer_sessions
FOR SELECT
TO public
USING (true);

-- 6. Add performance index if missing
CREATE INDEX IF NOT EXISTS idx_customer_sessions_slug ON public.customer_sessions(shop_slug);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_created_at ON public.customer_sessions(created_at);
