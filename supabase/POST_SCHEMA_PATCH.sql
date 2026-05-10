-- ============================================================
-- SmartPrint: Post-Schema-Change Patch
-- Run in Supabase SQL Editor
-- ============================================================

-- ─── 1. MISSING INDEX: order_status for customer-facing order tracking ──────
-- The /order/[shortToken] page does: .eq("short_token", token)
-- idx_orders_short_token exists. Good.
-- But the Realtime filter uses shop_id + order_status — ensure composite index:
CREATE INDEX IF NOT EXISTS idx_orders_shop_order_status
  ON orders (shop_id, status, created_at DESC);

-- ─── 2. MISSING INDEX: customer_phone + shop_id for rate limiting ───────────
-- lib/ratelimit checks by phone — add partial index on recent orders
CREATE INDEX IF NOT EXISTS idx_orders_phone_shop
  ON orders (customer_phone, shop_id)
  WHERE status NOT IN ('CANCELLED', 'COMPLETED');

-- ─── 3. RLS POLICY FIX: rls-policies.sql uses auth.uid() + owner_id ────────
-- The CLERK_SCHEMA.sql uses TEXT clerk_owner_id with RLS DISABLED.
-- The rls-policies.sql (older file) uses owner_id = auth.uid() which is WRONG
-- for Clerk auth. Since RLS is disabled per CLERK_SCHEMA.sql, these old
-- policies should NOT be applied. Confirm RLS is off:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected: rowsecurity = false for all tables (shops, orders, otp_verifications, etc.)

-- ─── 4. PARTITIONED TABLE: Ensure 2026-06, 07, 08, 09 partitions exist ──────
CREATE TABLE IF NOT EXISTS orders_2026_06 PARTITION OF orders
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS orders_2026_07 PARTITION OF orders
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS orders_2026_08 PARTITION OF orders
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS orders_2026_09 PARTITION OF orders
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS orders_2026_10 PARTITION OF orders
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS orders_2026_11 PARTITION OF orders
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS orders_2026_12 PARTITION OF orders
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- ─── 5. CONFIRMED LIVE SCHEMA: PART_1_SCHEMA.sql ───────────────────────────
-- shops table:   clerk_owner_id (TEXT, NOT NULL UNIQUE)
-- orders table:  is_color, is_double_sided, status (all live column names)
-- Code mapping:  DB is_color → Order.color | DB status → Order.order_status
-- Verified via: SELECT column_name FROM information_schema.columns WHERE table_name = 'shops';

-- Verify this is correct:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('shops', 'orders')
  AND column_name IN ('owner_id', 'clerk_owner_id', 'status', 'order_status', 'is_color', 'color', 'is_double_sided', 'double_sided')
ORDER BY table_name, column_name;

-- ─── 6. Verify indexes are on partitioned table (must be per-partition) ──────
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_orders%'
ORDER BY tablename;
-- Should show indexes on orders, orders_2026_04, orders_2026_05, etc.

-- ─── DONE ───────────────────────────────────────────────────────────────────
SELECT 'Schema patch complete' AS result;
