-- =====================================================
-- SMARTPRINT DATABASE MIGRATION - DISABLE SHOP_SETTINGS RLS
-- Disables Row Level Security (RLS) on shop_settings table
-- to allow public anon clients to read/write settings.
-- =====================================================

BEGIN;

-- 1. Disable Row Level Security (RLS) on shop_settings table
ALTER TABLE public.shop_settings DISABLE ROW LEVEL SECURITY;

-- 2. Drop existing select/update policies to keep schema clean
DROP POLICY IF EXISTS "shop_settings_select" ON public.shop_settings;
DROP POLICY IF EXISTS "shop_settings_update" ON public.shop_settings;

COMMIT;
