-- Migration: Fix shop_settings table permissions and disable RLS.
-- This ensures the server-side service_role key has access, and the client-side anon store can read/write settings (matching other tables like shops and orders).

-- 1. Grant all permissions on shop_settings to default API roles
GRANT ALL ON TABLE shop_settings TO postgres, service_role, anon, authenticated;

-- 2. Disable Row Level Security on shop_settings
ALTER TABLE shop_settings DISABLE ROW LEVEL SECURITY;
