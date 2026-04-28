-- ============================================================
-- SmartPrint: Row Level Security (RLS) Policies
-- Run this in the Supabase SQL Editor AFTER schema creation
-- ============================================================

-- ─── SHOPS TABLE ─────────────────────────────────────────────────────────────
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;

-- Drop all existing shop policies to start clean
DROP POLICY IF EXISTS "Owners view own shop" ON shops;
DROP POLICY IF EXISTS "Owners update own shop" ON shops;
DROP POLICY IF EXISTS "Anyone can signup shop" ON shops;
DROP POLICY IF EXISTS "Anyone can create own shop" ON shops;
DROP POLICY IF EXISTS "Admins update any shop" ON shops;
DROP POLICY IF EXISTS "Public can view active shops" ON shops;
DROP POLICY IF EXISTS "Public view active shops" ON shops;

-- Authenticated users can see their own shop
CREATE POLICY "Owners view own shop"
ON shops FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

-- Anonymous users can only see active shops (for public /shop/[id] page)
CREATE POLICY "Public view active shops"
ON shops FOR SELECT
TO anon
USING (is_active = true);

-- Authenticated shop owners can update only their own shop
CREATE POLICY "Owners update own shop"
ON shops FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- Authenticated users can only insert a shop for themselves
CREATE POLICY "Anyone can create own shop"
ON shops FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

-- ─── ORDERS TABLE ─────────────────────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop owner views orders" ON orders;
DROP POLICY IF EXISTS "Customers view own orders" ON orders;
DROP POLICY IF EXISTS "Shop owner updates orders" ON orders;
DROP POLICY IF EXISTS "Customers create orders" ON orders;

-- Shop owners can only see orders for their shop
CREATE POLICY "Shop owner views orders"
ON orders FOR SELECT
TO authenticated
USING (
  shop_id IN (
    SELECT id FROM shops WHERE owner_id = auth.uid()
  )
);

-- Customers can view their own orders
CREATE POLICY "Customers view own orders"
ON orders FOR SELECT
TO authenticated
USING (customer_id = auth.uid());

-- Shop owners can update order status
CREATE POLICY "Shop owner updates orders"
ON orders FOR UPDATE
TO authenticated
USING (
  shop_id IN (
    SELECT id FROM shops WHERE owner_id = auth.uid()
  )
);

-- Customers can create orders
CREATE POLICY "Customers create orders"
ON orders FOR INSERT
TO authenticated
WITH CHECK (customer_id = auth.uid());

-- ─── SHOP_STAFF TABLE ────────────────────────────────────────────────────────
ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff views own shop staff" ON shop_staff;
DROP POLICY IF EXISTS "Owner manages staff" ON shop_staff;

CREATE POLICY "Staff views own shop staff"
ON shop_staff FOR SELECT
TO authenticated
USING (
  shop_id IN (
    SELECT id FROM shops WHERE owner_id = auth.uid()
  )
  OR user_id = auth.uid()
);

CREATE POLICY "Owner manages staff"
ON shop_staff FOR ALL
TO authenticated
USING (
  shop_id IN (
    SELECT id FROM shops WHERE owner_id = auth.uid()
  )
);

-- ─── REVIEWS TABLE ───────────────────────────────────────────────────────────
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read reviews" ON reviews;
DROP POLICY IF EXISTS "Customers write reviews" ON reviews;

CREATE POLICY "Public read reviews"
ON reviews FOR SELECT USING (true);

CREATE POLICY "Customers write reviews"
ON reviews FOR INSERT
TO authenticated
WITH CHECK (customer_id = auth.uid());

-- ─── VERIFY ──────────────────────────────────────────────────────────────────
-- Run this to confirm RLS is enabled on all tables:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
