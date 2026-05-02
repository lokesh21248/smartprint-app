-- ============================================================
-- 🚀 Xerox Shop QR Platform — Complete Supabase Database
-- Production-Grade SQL for 10K Concurrent Users + Clerk Auth Integration
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Helper to extract Clerk user ID from JWT
CREATE OR REPLACE FUNCTION clerk_user_id()
RETURNS TEXT AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    NULL
  );
$$ LANGUAGE SQL STABLE;

-- Helper to check if current user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM shop_admins 
    WHERE clerk_user_id = clerk_user_id() 
      AND role = 'super_admin' 
      AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

-- Helper to check if current user owns a specific shop
CREATE OR REPLACE FUNCTION owns_shop(p_shop_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM shops 
    WHERE id = p_shop_id 
      AND owner_id = clerk_user_id()
  );
$$ LANGUAGE SQL STABLE;

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── SHOPS TABLE ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  shop_code VARCHAR(6) UNIQUE,
  owner_name TEXT NOT NULL,
  owner_email TEXT NOT NULL UNIQUE,
  owner_phone TEXT NOT NULL CHECK (owner_phone ~ '^[0-9]{10}$'),
  alternate_phone TEXT CHECK (alternate_phone IS NULL OR alternate_phone ~ '^[0-9]{10}$'),
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  price_bw_per_page INT NOT NULL DEFAULT 200 CHECK (price_bw_per_page > 0),
  price_color_per_page INT NOT NULL DEFAULT 1000 CHECK (price_color_per_page > 0),
  price_double_sided_discount_pct INT DEFAULT 0 CHECK (price_double_sided_discount_pct BETWEEN 0 AND 50),
  shop_photo_url TEXT,
  qr_code_url TEXT,
  business_hours JSONB DEFAULT '{"mon":"9-21","tue":"9-21","wed":"9-21","thu":"9-21","fri":"9-21","sat":"9-21","sun":"closed"}'::jsonb,
  is_approved BOOLEAN DEFAULT false,
  is_open BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  approved_at TIMESTAMPTZ,
  approved_by_clerk_id TEXT,
  suspension_reason TEXT,
  total_orders INT DEFAULT 0,
  qr_scan_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_shops_slug ON shops(slug);
CREATE INDEX IF NOT EXISTS idx_shops_code ON shops(shop_code) WHERE shop_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shops_active ON shops(is_active, is_approved, is_open) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_shops_email ON shops(LOWER(owner_email));
CREATE INDEX IF NOT EXISTS idx_shops_location ON shops(lat, lng) WHERE lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shops_search ON shops USING gin(name gin_trgm_ops);

-- ─── ORDERS TABLE (PARTITIONED) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  short_token VARCHAR(12) NOT NULL,
  order_number TEXT NOT NULL,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL CHECK (length(customer_name) BETWEEN 2 AND 100),
  customer_phone TEXT NOT NULL CHECK (customer_phone ~ '^[0-9]{10}$'),
  customer_phone_verified BOOLEAN DEFAULT false,
  customer_ip TEXT,
  file_s3_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400),
  page_count INT NOT NULL CHECK (page_count > 0 AND page_count <= 1000),
  copies INT NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 50),
  is_color BOOLEAN DEFAULT false,
  is_double_sided BOOLEAN DEFAULT false,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 500),
  total_amount INT NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PLACED','ACCEPTED','PRINTING','READY','COMPLETED','CANCELLED')),
  status_history JSONB DEFAULT '[]'::jsonb,
  cancellation_reason TEXT,
  draft_expires_at TIMESTAMPTZ,
  accept_deadline TIMESTAMPTZ,
  pickup_deadline TIMESTAMPTZ,
  file_delete_at TIMESTAMPTZ,
  placed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  printing_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

DO $$
DECLARE
  partition_date DATE := DATE_TRUNC('month', CURRENT_DATE);
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
  i INT;
BEGIN
  FOR i IN 0..5 LOOP
    start_date := partition_date + (i || ' months')::INTERVAL;
    end_date := start_date + INTERVAL '1 month';
    partition_name := 'orders_' || TO_CHAR(start_date, 'YYYY_MM');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF orders FOR VALUES FROM (%L) TO (%L)', partition_name, start_date, end_date);
  END LOOP;
END $$;

-- ─── OTP & ADMIN TABLES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts <= 5),
  verified BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin','admin','support')),
  permissions JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- ─── AUDIT & RATE LIMITS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer','shop','admin','system')),
  actor_id TEXT,
  actor_ip TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier TEXT NOT NULL,
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('ip','phone','clerk_id')),
  action TEXT NOT NULL,
  count INT DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(identifier, identifier_type, action, window_start)
);

-- ─── RPC FUNCTIONS ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_order(p_order_id UUID, p_otp_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
  v_otp RECORD;
  v_active_count INT;
BEGIN
  SELECT * INTO v_otp FROM otp_verifications WHERE id = p_otp_id;
  IF v_otp IS NULL OR NOT v_otp.verified OR v_otp.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired OTP');
  END IF;
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF v_order IS NULL OR v_order.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid order state');
  END IF;
  UPDATE orders SET status = 'PLACED', customer_phone_verified = true WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_order_status(p_order_id UUID, p_new_status TEXT, p_reason TEXT DEFAULT NULL)
RETURNS JSONB AS $$
BEGIN
  UPDATE orders SET status = p_new_status, cancellation_reason = p_reason WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION find_shop_by_code(p_code TEXT)
RETURNS JSONB AS $$
DECLARE v_shop RECORD;
BEGIN
  SELECT id, name, slug, address_line1, city, is_active, is_open INTO v_shop FROM shops WHERE shop_code = UPPER(p_code) AND is_approved = true;
  IF v_shop IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Shop not found'); END IF;
  RETURN jsonb_build_object('success', true, 'shop_id', v_shop.id, 'slug', v_shop.slug, 'name', v_shop.name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── NOTIFICATIONS TABLE ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL, -- clerk_user_id or 'system'
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id) WHERE is_read = false;

-- ─── RLS POLICIES ────────────────────────────────────────────────────────────
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active shops" ON shops FOR SELECT TO anon, authenticated USING (is_active = true AND is_approved = true);
CREATE POLICY "Owners view own shop" ON shops FOR SELECT TO authenticated USING (owner_id = clerk_user_id() OR is_super_admin());
CREATE POLICY "Owners update own shop" ON shops FOR UPDATE TO authenticated USING (owner_id = clerk_user_id()) WITH CHECK (owner_id = clerk_user_id());

CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT TO authenticated USING (user_id = clerk_user_id() OR user_id = 'system');
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE TO authenticated USING (user_id = clerk_user_id()) WITH CHECK (user_id = clerk_user_id());
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
