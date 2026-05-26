-- =====================================================
-- SMARTPRINT DATABASE MIGRATION - GRANT SHOP_SETTINGS PERMISSIONS
-- Grants full API and service_role access to public.shop_settings
-- =====================================================

BEGIN;

-- 1. Grant full privileges on the shop_settings table to API roles
GRANT ALL PRIVILEGES ON TABLE public.shop_settings TO postgres;
GRANT ALL PRIVILEGES ON TABLE public.shop_settings TO anon;
GRANT ALL PRIVILEGES ON TABLE public.shop_settings TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.shop_settings TO service_role;

COMMIT;
