/**
 * SmartPrint – Full Database Setup Script
 * 
 * This script applies the complete schema to Supabase using the
 * Management API via the service role key.
 * 
 * Run: node scripts/setup-db.mjs
 */

import { readFileSync } from 'fs';

// ── Read env ──────────────────────────────────────────────────────────────────
const envContent = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing env variables');
  process.exit(1);
}

// Extract project ref from URL: https://<ref>.supabase.co
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];
console.log(`🔧 Project Ref: ${PROJECT_REF}`);

// ── The full SQL to execute ───────────────────────────────────────────────────
const SQL = `
-- ============================================================
-- SmartPrint – Complete Schema (idempotent)
-- ============================================================

-- ─── 0. Extensions ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── 1. orders table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL DEFAULT 'ORD-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD(FLOOR(RANDOM()*99999)::TEXT, 5, '0'),
  customer_id UUID REFERENCES auth.users(id),
  customer_name TEXT,
  customer_phone TEXT,
  short_token TEXT UNIQUE,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  files JSONB NOT NULL DEFAULT '[]',
  print_config JSONB NOT NULL DEFAULT '{}',
  special_instructions TEXT,
  total_pages INT NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'placed'
    CHECK (status IN ('placed','accepted','printing','ready','completed','cancelled','rejected')),
  status_history JSONB DEFAULT '[]',
  estimated_completion TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. Add guest columns if not present (safe to re-run) ───
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS short_token TEXT;

-- ─── 3. Create unique index for short_token ─────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_short_token ON orders(short_token)
  WHERE short_token IS NOT NULL;

-- ─── 4. Orders indexes ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_shop_status
  ON orders(shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer
  ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_active_status
  ON orders(status) WHERE status IN ('placed','accepted','printing');
CREATE INDEX IF NOT EXISTS idx_orders_created
  ON orders(created_at DESC);

-- ─── 5. shop_staff table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','staff')),
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_shop ON shop_staff(shop_id);
CREATE INDEX IF NOT EXISTS idx_staff_user ON shop_staff(user_id);

-- ─── 6. notifications table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_order_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);

-- ─── 7. reviews table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  customer_id UUID REFERENCES auth.users(id),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_shop ON reviews(shop_id, created_at DESC);

-- ─── 8. otp_verifications table ─────────────────────────────
CREATE TABLE IF NOT EXISTS otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_verifications(phone);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications(expires_at);

-- ─── 9. updated_at trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS shops_updated_at ON shops;
CREATE TRIGGER shops_updated_at
  BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 10. RLS Policies ───────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;

-- Drop old conflicting policies first
DROP POLICY IF EXISTS "Shop staff view orders" ON orders;
DROP POLICY IF EXISTS "Shop staff update orders" ON orders;
DROP POLICY IF EXISTS "Anyone can insert guest orders" ON orders;
DROP POLICY IF EXISTS "Public can view order by short_token" ON orders;

-- orders: shop staff view/update their shop's orders
CREATE POLICY "Shop staff view orders" ON orders
  FOR SELECT USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM shop_staff WHERE user_id = auth.uid()
    )
    OR short_token IS NOT NULL  -- Guest order tracking (anon access via short_token)
  );

CREATE POLICY "Shop staff update orders" ON orders
  FOR UPDATE USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM shop_staff WHERE user_id = auth.uid()
    )
  );

-- Allow anonymous/authenticated users to insert orders via the API
DROP POLICY IF EXISTS "Anyone insert orders" ON orders;
CREATE POLICY "Anyone insert orders" ON orders
  FOR INSERT WITH CHECK (true);

-- notifications
DROP POLICY IF EXISTS "Users view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- shop_staff
DROP POLICY IF EXISTS "Owners manage staff" ON shop_staff;
CREATE POLICY "Owners manage staff" ON shop_staff
  FOR ALL USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

-- reviews
DROP POLICY IF EXISTS "Shop staff view reviews" ON reviews;
CREATE POLICY "Shop staff view reviews" ON reviews
  FOR SELECT USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM shop_staff WHERE user_id = auth.uid()
    )
  );

-- otp_verifications: only service role (API routes) can access these
DROP POLICY IF EXISTS "Service role only otp" ON otp_verifications;
CREATE POLICY "Service role only otp" ON otp_verifications
  FOR ALL TO service_role USING (true);

-- ─── 11. Supabase Realtime ──────────────────────────────────
-- Enable realtime on orders so admin dashboard gets live updates
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ─── 12. RPCs ───────────────────────────────────────────────

-- increment_qr_scan (allows anon to increment scan count)
CREATE OR REPLACE FUNCTION increment_qr_scan(p_shop_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE shops SET qr_scan_count = COALESCE(qr_scan_count, 0) + 1 WHERE id = p_shop_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_qr_scan(UUID) TO anon, authenticated;

-- find_shop_by_code (allows customers to find a shop by code)
CREATE OR REPLACE FUNCTION find_shop_by_code(p_code TEXT)
RETURNS TABLE(
  id UUID,
  shop_name TEXT,
  address TEXT,
  city TEXT,
  is_active BOOLEAN
) AS $$
BEGIN
  UPDATE shops 
  SET code_use_count = COALESCE(code_use_count, 0) + 1 
  WHERE shop_code = UPPER(p_code) AND is_active = true;
  
  RETURN QUERY
  SELECT s.id, s.shop_name, s.address, s.city, s.is_active
  FROM shops s
  WHERE s.shop_code = UPPER(p_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION find_shop_by_code(TEXT) TO anon, authenticated;

-- get_dashboard_stats RPC for aggregated stats
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_shop_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'pendingOrders', COUNT(*) FILTER (WHERE status IN ('placed', 'accepted', 'printing')),
    'ordersToday', COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE),
    'revenueToday', COALESCE(SUM(total_amount) FILTER (WHERE DATE(created_at) = CURRENT_DATE AND status = 'completed'), 0),
    'completedToday', COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE AND status = 'completed'),
    'activeCustomers', COUNT(DISTINCT COALESCE(customer_id::TEXT, customer_phone)) FILTER (WHERE DATE(created_at) = CURRENT_DATE),
    'avgCompletionMins', COALESCE(AVG(
      EXTRACT(EPOCH FROM (updated_at - created_at)) / 60
    ) FILTER (WHERE status = 'completed' AND DATE(created_at) = CURRENT_DATE), 0)
  ) INTO result
  FROM orders
  WHERE shop_id = p_shop_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_dashboard_stats(UUID) TO authenticated;

-- ─── 13. Storage bucket ─────────────────────────────────────
-- (Run this manually in Supabase Dashboard > Storage if needed)
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('order-files', 'order-files', false)
-- ON CONFLICT (id) DO NOTHING;

SELECT 'Schema setup complete ✅' AS result;
`;

// ── Execute via Supabase Management API ───────────────────────────────────────
async function runSQL(sql) {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  
  return { status: res.status, body: await res.json() };
}

// Alternative: Use the pg REST endpoint
async function runSQLViaRest(sql) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/exec_sql`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  return { status: res.status, body: await res.text() };
}

console.log('🚀 Applying SmartPrint database schema...\n');
const result = await runSQL(SQL);

if (result.status === 200 || result.status === 201) {
  console.log('✅ Schema applied successfully!');
  console.log(JSON.stringify(result.body, null, 2));
} else {
  console.log(`⚠️  Management API response: ${result.status}`);
  console.log(JSON.stringify(result.body, null, 2));
  console.log('\n📝 The Management API might require a different auth token.');
  console.log('   Please run the SQL manually in Supabase SQL Editor.');
  console.log('   File: supabase/FULL_SETUP.sql\n');
  
  // Write the SQL to a file for manual execution
  const { writeFileSync } = await import('fs');
  writeFileSync('supabase/FULL_SETUP.sql', SQL);
  console.log('✅ SQL written to: supabase/FULL_SETUP.sql');
}
