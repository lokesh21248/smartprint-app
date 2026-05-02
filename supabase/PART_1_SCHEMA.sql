-- ============================================================
-- PART 1: SCHEMA — Extensions, Tables, Indexes, Triggers
-- ============================================================

-- 1.1 EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1.2 HELPER FUNCTIONS (Clerk integration)
CREATE OR REPLACE FUNCTION clerk_user_id()
RETURNS TEXT AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    NULL
  );
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1.3 SHOPS TABLE
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_owner_id TEXT NOT NULL UNIQUE,

  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  slug TEXT UNIQUE,
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

CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(clerk_owner_id);
CREATE INDEX IF NOT EXISTS idx_shops_slug ON shops(slug);
CREATE INDEX IF NOT EXISTS idx_shops_code ON shops(shop_code);
CREATE INDEX IF NOT EXISTS idx_shops_active ON shops(is_active, is_approved, is_open) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_shops_email ON shops(LOWER(owner_email));
CREATE INDEX IF NOT EXISTS idx_shops_location ON shops(lat, lng) WHERE lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shops_search ON shops USING gin(name gin_trgm_ops);

DROP TRIGGER IF EXISTS shops_updated_at ON shops;
CREATE TRIGGER shops_updated_at
  BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 1.4 AUTO-GENERATE SHOP CODES
CREATE OR REPLACE FUNCTION setup_shop_codes()
RETURNS TRIGGER AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code_result TEXT := '';
  attempts INT := 0;
  i INT;
  base_slug TEXT;
  final_slug TEXT;
  counter INT := 0;
BEGIN
  IF NEW.shop_code IS NULL THEN
    LOOP
      code_result := '';
      FOR i IN 1..6 LOOP
        code_result := code_result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS(SELECT 1 FROM shops WHERE shop_code = code_result);
      attempts := attempts + 1;
      IF attempts > 100 THEN RAISE EXCEPTION 'Could not generate unique shop code'; END IF;
    END LOOP;
    NEW.shop_code := code_result;
  END IF;

  IF NEW.slug IS NULL THEN
    base_slug := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
    base_slug := substring(base_slug FROM 1 FOR 50);
    IF base_slug = '' THEN base_slug := 'shop'; END IF;
    final_slug := base_slug;
    LOOP
      EXIT WHEN NOT EXISTS(SELECT 1 FROM shops WHERE slug = final_slug);
      counter := counter + 1;
      final_slug := base_slug || '-' || counter;
      IF counter > 100 THEN RAISE EXCEPTION 'Could not generate unique slug'; END IF;
    END LOOP;
    NEW.slug := final_slug;
  END IF;

  IF NEW.qr_code_url IS NULL THEN
    NEW.qr_code_url := 'https://printshop.in/s/' || COALESCE(NEW.slug, NEW.id::text);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_setup_shop_codes ON shops;
CREATE TRIGGER auto_setup_shop_codes
  BEFORE INSERT ON shops
  FOR EACH ROW EXECUTE FUNCTION setup_shop_codes();

-- 1.5 SHOP ADMINS TABLE (super admins + staff)
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

CREATE INDEX IF NOT EXISTS idx_admins_clerk ON shop_admins(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_admins_active ON shop_admins(is_active) WHERE is_active = true;

-- 1.6 ADMIN HELPER FUNCTIONS (after shop_admins exists)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM shop_admins
    WHERE clerk_user_id = clerk_user_id()
      AND role = 'super_admin'
      AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION owns_shop(p_shop_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM shops
    WHERE id = p_shop_id
      AND clerk_owner_id = clerk_user_id()
  );
$$ LANGUAGE SQL STABLE;

-- 1.7 ORDERS TABLE (PARTITIONED FOR SCALE)
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

-- 1.8 CREATE PARTITIONS (current month + 5 future months)
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

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF orders FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_date, end_date
    );
  END LOOP;
END $$;

-- 1.9 ORDERS INDEXES
CREATE INDEX IF NOT EXISTS idx_orders_short_token ON orders(short_token);
CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON orders(shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone, status) WHERE status NOT IN ('COMPLETED','CANCELLED');
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status) WHERE status IN ('DRAFT','PLACED','ACCEPTED','PRINTING','READY');
CREATE INDEX IF NOT EXISTS idx_orders_draft_expires ON orders(draft_expires_at) WHERE status = 'DRAFT';
CREATE INDEX IF NOT EXISTS idx_orders_accept_deadline ON orders(accept_deadline) WHERE status = 'PLACED';
CREATE INDEX IF NOT EXISTS idx_orders_pickup_deadline ON orders(pickup_deadline) WHERE status = 'READY';
CREATE INDEX IF NOT EXISTS idx_orders_file_delete ON orders(file_delete_at) WHERE file_delete_at IS NOT NULL;

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 1.10 AUTO-SETUP ORDER DEFAULTS
CREATE OR REPLACE FUNCTION setup_order_defaults()
RETURNS TRIGGER AS $$
DECLARE
  token TEXT;
  attempts INT := 0;
  shop_total_orders INT;
BEGIN
  IF NEW.short_token IS NULL THEN
    LOOP
      token := encode(gen_random_bytes(9), 'base64');
      token := replace(replace(replace(token, '/', ''), '+', ''), '=', '');
      token := substring(token FROM 1 FOR 12);
      EXIT WHEN length(token) = 12 AND NOT EXISTS(
        SELECT 1 FROM orders WHERE short_token = token
      );
      attempts := attempts + 1;
      IF attempts > 50 THEN RAISE EXCEPTION 'Could not generate unique short_token'; END IF;
    END LOOP;
    NEW.short_token := token;
  END IF;

  IF NEW.order_number IS NULL THEN
    SELECT COALESCE(total_orders, 0) + 1 INTO shop_total_orders FROM shops WHERE id = NEW.shop_id;
    NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD(shop_total_orders::TEXT, 4, '0');
  END IF;

  IF NEW.status = 'DRAFT' AND NEW.draft_expires_at IS NULL THEN
    NEW.draft_expires_at := NOW() + INTERVAL '30 minutes';
  END IF;

  IF NEW.status_history IS NULL OR jsonb_array_length(NEW.status_history) = 0 THEN
    NEW.status_history := jsonb_build_array(
      jsonb_build_object('status', NEW.status, 'at', NOW())
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_setup_order ON orders;
CREATE TRIGGER auto_setup_order
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION setup_order_defaults();

-- 1.11 STATE MACHINE ENFORCEMENT
CREATE OR REPLACE FUNCTION enforce_order_state_transition()
RETURNS TRIGGER AS $$
DECLARE
  valid_transitions JSONB := '{
    "DRAFT": ["PLACED", "CANCELLED"],
    "PLACED": ["ACCEPTED", "CANCELLED"],
    "ACCEPTED": ["PRINTING", "CANCELLED"],
    "PRINTING": ["READY", "CANCELLED"],
    "READY": ["COMPLETED", "CANCELLED"],
    "COMPLETED": [],
    "CANCELLED": []
  }'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  IF NOT (valid_transitions -> OLD.status ? NEW.status) THEN
    RAISE EXCEPTION 'Invalid state transition: % -> %. Valid from %: %',
      OLD.status, NEW.status, OLD.status, valid_transitions -> OLD.status;
  END IF;

  CASE NEW.status
    WHEN 'PLACED' THEN
      NEW.placed_at := NOW();
      NEW.accept_deadline := NOW() + INTERVAL '2 hours';
      NEW.draft_expires_at := NULL;
    WHEN 'ACCEPTED' THEN
      NEW.accepted_at := NOW();
      NEW.accept_deadline := NULL;
    WHEN 'PRINTING' THEN
      NEW.printing_at := NOW();
    WHEN 'READY' THEN
      NEW.ready_at := NOW();
      NEW.pickup_deadline := NOW() + INTERVAL '48 hours';
    WHEN 'COMPLETED' THEN
      NEW.completed_at := NOW();
      NEW.pickup_deadline := NULL;
      NEW.file_delete_at := NOW() + INTERVAL '24 hours';
    WHEN 'CANCELLED' THEN
      NEW.cancelled_at := NOW();
      NEW.file_delete_at := NOW() + INTERVAL '24 hours';
    ELSE NULL;
  END CASE;

  NEW.status_history := COALESCE(OLD.status_history, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object('status', NEW.status, 'at', NOW(), 'from', OLD.status)
  );

  IF NEW.status = 'COMPLETED' THEN
    UPDATE shops SET total_orders = total_orders + 1 WHERE id = NEW.shop_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_state_transitions ON orders;
CREATE TRIGGER enforce_state_transitions
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION enforce_order_state_transition();

-- 1.12 OTP VERIFICATIONS TABLE
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

CREATE INDEX IF NOT EXISTS idx_otp_phone_active ON otp_verifications(phone, verified, expires_at) WHERE verified = false;
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications(expires_at) WHERE verified = false;
CREATE INDEX IF NOT EXISTS idx_otp_ip ON otp_verifications(ip_address, created_at DESC);

-- 1.13 AUDIT LOG TABLE
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

CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_type, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_recent ON audit_log(created_at DESC);

-- 1.14 RATE LIMITS TABLE
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

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits(identifier, identifier_type, action, window_end);
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup ON rate_limits(window_end);

-- ✅ PART 1 COMPLETE
SELECT 'Part 1 SUCCESS — schema created' AS result;
