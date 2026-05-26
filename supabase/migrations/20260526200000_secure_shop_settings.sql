-- =====================================================
-- SMARTPRINT DATABASE MIGRATION - SECURE SHOP_SETTINGS
-- =====================================================

BEGIN;

-- 1. Enable Row Level Security (RLS) on shop_settings table
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if they exist
DROP POLICY IF EXISTS "shop_settings_select" ON public.shop_settings;
DROP POLICY IF EXISTS "shop_settings_update" ON public.shop_settings;

-- 3. Create SELECT policy for authenticated users
CREATE POLICY "shop_settings_select"
ON public.shop_settings
FOR SELECT
TO authenticated
USING (true);

-- 4. Create UPDATE policy for authenticated users
CREATE POLICY "shop_settings_update"
ON public.shop_settings
FOR UPDATE
TO authenticated
USING (true);

COMMIT;
