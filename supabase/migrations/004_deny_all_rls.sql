-- =============================================================================
-- Migration: 004_deny_all_rls.sql
-- Description: Strictly enforce DENY-ALL for public and authenticated roles.
--              The browser should NEVER directly access production data.
--              Everything MUST flow through Next.js API Routes using Service Role.
-- =============================================================================

-- 1. Enable RLS on all production tables
ALTER TABLE IF EXISTS public.shops           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reviews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shop_staff      ENABLE ROW LEVEL SECURITY;

-- 2. Drop all existing permissive policies from previous migrations
-- This ensures no "leaky" legacy policies remain.
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN ('shops', 'orders', 'notifications', 'otp_verifications', 'audit_log', 'reviews', 'shop_staff')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- 3. Explicitly DENY ALL for anon and authenticated roles
-- Note: Service Role (service_role) automatically bypasses RLS, so no policy is needed for it.
-- By having RLS enabled and NO policies, Postgres defaults to DENY ALL.

-- 4. Storage Policies (Optional but recommended to lock down order-files)
-- Ensure 'order-files' bucket is private and has no public read/write.
-- Access is handled via app/api/storage/signed-url/route.ts using Service Role.
