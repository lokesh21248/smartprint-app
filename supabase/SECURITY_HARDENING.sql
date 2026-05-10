-- ============================================================
-- SmartPrint: PRODUCTION SECURITY HARDENING (Defense-in-Depth)
-- ============================================================
-- Purpose: Enable RLS and implement a "Deny All" policy for 
-- anonymous and authenticated roles. This ensures the database
-- is ONLY accessible via the Service Role (used in API routes).
-- 
-- Why: Prevents data exposure if the public anon key is leaked.
-- ============================================================

-- 1. Enable RLS on all public tables
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- 2. "Deny All" Policies
-- Service Role bypasses these automatically. 
-- 'anon' and 'authenticated' will be blocked.

-- SHOPS
DROP POLICY IF EXISTS "deny_all_shops" ON shops;
CREATE POLICY "deny_all_shops" ON shops FOR ALL TO anon, authenticated USING (false);

-- ORDERS
DROP POLICY IF EXISTS "deny_all_orders" ON orders;
CREATE POLICY "deny_all_orders" ON orders FOR ALL TO anon, authenticated USING (false);

-- NOTIFICATIONS
DROP POLICY IF EXISTS "deny_all_notifications" ON notifications;
CREATE POLICY "deny_all_notifications" ON notifications FOR ALL TO anon, authenticated USING (false);

-- OTP VERIFICATIONS
DROP POLICY IF EXISTS "deny_all_otp" ON otp_verifications;
CREATE POLICY "deny_all_otp" ON otp_verifications FOR ALL TO anon, authenticated USING (false);

-- AUDIT LOG
DROP POLICY IF EXISTS "deny_all_audit" ON audit_log;
CREATE POLICY "deny_all_audit" ON audit_log FOR ALL TO anon, authenticated USING (false);

-- STAFF
DROP POLICY IF EXISTS "deny_all_staff" ON shop_staff;
CREATE POLICY "deny_all_staff" ON shop_staff FOR ALL TO anon, authenticated USING (false);

-- REVIEWS
DROP POLICY IF EXISTS "deny_all_reviews" ON reviews;
CREATE POLICY "deny_all_reviews" ON reviews FOR ALL TO anon, authenticated USING (false);

-- 3. Verification Query
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
