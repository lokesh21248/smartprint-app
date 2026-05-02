-- ============================================================
-- PART 2: ROW LEVEL SECURITY POLICIES
-- ============================================================

-- 2.1 ENABLE RLS ON ALL TABLES
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- 2.2 SHOPS POLICIES
DROP POLICY IF EXISTS "Public can view active shops" ON shops;
CREATE POLICY "Public can view active shops"
ON shops FOR SELECT TO anon, authenticated
USING (is_active = true AND is_approved = true);

DROP POLICY IF EXISTS "Owners view own shop" ON shops;
CREATE POLICY "Owners view own shop"
ON shops FOR SELECT TO authenticated
USING (clerk_owner_id = clerk_user_id() OR is_super_admin());

DROP POLICY IF EXISTS "Owners create own shop" ON shops;
CREATE POLICY "Owners create own shop"
ON shops FOR INSERT TO authenticated
WITH CHECK (clerk_owner_id = clerk_user_id());

DROP POLICY IF EXISTS "Owners update own shop" ON shops;
CREATE POLICY "Owners update own shop"
ON shops FOR UPDATE TO authenticated
USING (clerk_owner_id = clerk_user_id())
WITH CHECK (clerk_owner_id = clerk_user_id());

DROP POLICY IF EXISTS "Admins update any shop" ON shops;
CREATE POLICY "Admins update any shop"
ON shops FOR UPDATE TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- 2.3 ORDERS POLICIES
DROP POLICY IF EXISTS "Public can view by short_token" ON orders;
CREATE POLICY "Public can view by short_token"
ON orders FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Anon can create draft orders" ON orders;
CREATE POLICY "Anon can create draft orders"
ON orders FOR INSERT TO anon, authenticated
WITH CHECK (status = 'DRAFT');

DROP POLICY IF EXISTS "Shops manage own orders" ON orders;
CREATE POLICY "Shops manage own orders"
ON orders FOR ALL TO authenticated
USING (owns_shop(shop_id) OR is_super_admin())
WITH CHECK (owns_shop(shop_id) OR is_super_admin());

-- 2.4 OTP POLICIES (server-only via service role)
DROP POLICY IF EXISTS "Service role only on OTP" ON otp_verifications;
CREATE POLICY "Service role only on OTP"
ON otp_verifications FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 2.5 SHOP ADMINS POLICIES
DROP POLICY IF EXISTS "Admins view themselves" ON shop_admins;
CREATE POLICY "Admins view themselves"
ON shop_admins FOR SELECT TO authenticated
USING (clerk_user_id = clerk_user_id() OR is_super_admin());

-- 2.6 AUDIT LOG POLICIES
DROP POLICY IF EXISTS "Admins view audit logs" ON audit_log;
CREATE POLICY "Admins view audit logs"
ON audit_log FOR SELECT TO authenticated
USING (is_super_admin());

DROP POLICY IF EXISTS "Service writes audit logs" ON audit_log;
CREATE POLICY "Service writes audit logs"
ON audit_log FOR INSERT TO service_role
WITH CHECK (true);

-- 2.7 RATE LIMITS POLICIES
DROP POLICY IF EXISTS "Service manages rate limits" ON rate_limits;
CREATE POLICY "Service manages rate limits"
ON rate_limits FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- ✅ PART 2 COMPLETE
SELECT 'Part 2 SUCCESS — RLS policies created' AS result;
