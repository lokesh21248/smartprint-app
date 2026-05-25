-- =====================================================
-- SMARTPRINT DATABASE MIGRATION - GRANT SHOP_STAFF PERMISSIONS
-- Grants full API and service_role access to public.shop_staff
-- =====================================================

BEGIN;

-- 1. Grant full privileges on the shop_staff table to API roles
GRANT ALL PRIVILEGES ON TABLE public.shop_staff TO postgres;
GRANT ALL PRIVILEGES ON TABLE public.shop_staff TO anon;
GRANT ALL PRIVILEGES ON TABLE public.shop_staff TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.shop_staff TO service_role;

-- 2. Ensure sequences (if any are added in the future) are also granted
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

COMMIT;
