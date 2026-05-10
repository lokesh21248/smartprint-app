-- =============================================================================
-- SmartPrint: FINAL SUPABASE PRODUCTION HARDENING (Senior Engineer Audit)
-- =============================================================================
-- This script fixes schema mismatches, enforces DENY-ALL RLS, and secures
-- realtime traffic. It aligns the DB with the production Next.js API layer.
-- =============================================================================

-- ─── 1. ALIGN SHOPS SCHEMA ───────────────────────────────────────────────────
-- Fixes mismatches between stale migrations and current production API routes.
DO $$ 
BEGIN
  -- Rename/Add columns to match app/api/shop/create/route.ts
  ALTER TABLE shops RENAME COLUMN owner_id TO clerk_owner_id;
  EXCEPTION WHEN undefined_column THEN NULL;
END $$;

ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_phone TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{}'::jsonb;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS total_orders INT DEFAULT 0;

-- ─── 2. ENFORCE STRICT RLS (DENY-ALL) ─────────────────────────────────────────
-- The browser should NEVER directly access production tables.
-- All access MUST go through Next.js API Routes using Service Role.

ALTER TABLE IF EXISTS public.shops           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reviews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shop_staff      ENABLE ROW LEVEL SECURITY;

-- Remove ALL existing policies (Permissive or otherwise)
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- Explicitly block 'anon' and 'authenticated' roles.
-- Service Role (service_role) bypasses RLS by default.
-- Having RLS ENABLED with NO policies is a default DENY-ALL.

-- ─── 3. SECURE REALTIME ───────────────────────────────────────────────────────
-- Prevent leaking orders or shop data via Supabase Realtime WebSocket.
-- Since RLS is DENY-ALL and Realtime respects RLS, this is now safe.
-- But we should ensure only 'orders' is in the publication if absolutely needed.

DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE orders;

-- ─── 4. PRODUCTION INDEXES (HOT PATHS) ────────────────────────────────────────
-- 4a. Shop lookup by Clerk ID (used in almost every authenticated API call)
CREATE INDEX IF NOT EXISTS idx_shops_clerk_owner_id ON shops (clerk_owner_id);

-- 4b. Order lookup by short_token (Customer tracking page)
CREATE INDEX IF NOT EXISTS idx_orders_short_token ON orders (short_token);

-- 4c. Dashboard view (Shop staff)
CREATE INDEX IF NOT EXISTS idx_orders_shop_status_created ON orders (shop_id, status, created_at DESC);

-- 4d. Duplicate order prevention
CREATE INDEX IF NOT EXISTS idx_orders_dedup_lookup 
ON orders (shop_id, customer_phone, file_name, created_at DESC)
WHERE status NOT IN ('CANCELLED', 'DRAFT');

-- ─── 5. REVOKE ROLE PERMISSIONS ───────────────────────────────────────────────
-- Extra layer of security: Ensure 'anon' and 'authenticated' can't even try to SELECT.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Allow only the basic health checks if needed, but for our architecture, 
-- we prefer total isolation.
