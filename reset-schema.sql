-- Enable PostGIS for geography support
CREATE EXTENSION IF NOT EXISTS postgis;

-- Drop old tables to ensure schema matches the new architecture
DROP MATERIALIZED VIEW IF EXISTS analytics_daily;
DROP TABLE IF EXISTS otp_verifications CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS shop_staff CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS shops CASCADE;

-- ─── 1. shops ────────────────────────────────────────────────────────────────
CREATE TABLE shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL, -- Clerk User ID
  shop_name TEXT NOT NULL,
  slug TEXT UNIQUE, -- URL slug for shop (e.g. shop-name)
  shop_code VARCHAR(6) UNIQUE, -- Short code for customers (e.g. ABC123)
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  location GEOGRAPHY(POINT),
  phone TEXT NOT NULL,
  email TEXT,
  qr_code_url TEXT,
  qr_scan_count INT DEFAULT 0,
  code_use_count INT DEFAULT 0,
  photos TEXT[] DEFAULT '{}',
  services TEXT[] DEFAULT '{}',
  pricing JSONB NOT NULL DEFAULT '{}',
  timings JSONB NOT NULL DEFAULT '{}',
  rating_avg DECIMAL(3,2) DEFAULT 0,
  total_reviews INT DEFAULT 0,
  total_orders INT DEFAULT 0,
  is_approved BOOLEAN DEFAULT false,
  is_open BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_shops_active ON shops(is_active, is_approved, is_open);

-- ─── 2. orders (partitioned by month) ────────────────────────────────────────
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL,
  short_token TEXT NOT NULL,
  customer_id TEXT, -- Clerk User ID (optional)
  customer_name TEXT,
  customer_phone TEXT,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  files JSONB NOT NULL DEFAULT '[]',
  print_config JSONB NOT NULL,
  special_instructions TEXT,
  total_pages INT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'placed'
    CHECK (status IN ('placed','accepted','printing','ready','completed','cancelled','rejected')),
  status_history JSONB DEFAULT '[]',
  estimated_completion TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, created_at),
  UNIQUE (order_number, created_at),
  UNIQUE (short_token, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE orders_2026_04 PARTITION OF orders
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE orders_2026_05 PARTITION OF orders
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE INDEX IF NOT EXISTS idx_orders_shop_status
  ON orders(shop_id, status, created_at DESC);

-- ─── 3. shop_staff ───────────────────────────────────────────────────────────
CREATE TABLE shop_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- Clerk User ID
  role TEXT NOT NULL CHECK (role IN ('owner','manager','staff')),
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_id, user_id)
);

-- ─── 4. notifications ────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, -- Clerk User ID
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_order_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 5. otp_verifications ────────────────────────────────────────────────────
-- Keep for reference, but Clerk handles OTP now
CREATE TABLE otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_verifications(phone);

-- ─── 6. reviews ──────────────────────────────────────────────────────────────
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID,
  order_created_at TIMESTAMPTZ,
  customer_id TEXT, -- Clerk User ID
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (order_id, order_created_at) REFERENCES orders(id, created_at)
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- NOTE: Standard Supabase auth.uid() won't work with Clerk unless using JWT templates.
-- For now, we rely on server-side checks or Service Role.
ALTER TABLE shops DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE shop_staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verifications DISABLE ROW LEVEL SECURITY;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

-- ─── Helper Functions ─────────────────────────────────────────────────────────

-- Function to generate a unique 6-character shop code
CREATE OR REPLACE FUNCTION generate_unique_shop_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
  attempts INT := 0;
  exists_check BOOLEAN;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    
    SELECT EXISTS(SELECT 1 FROM shops WHERE shop_code = result) INTO exists_check;
    
    IF NOT exists_check THEN
      RETURN result;
    END IF;
    
    attempts := attempts + 1;
    IF attempts > 100 THEN
      RAISE EXCEPTION 'Could not generate unique shop code after 100 attempts';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically set shop_code and qr_code_url on insert
CREATE OR REPLACE FUNCTION setup_shop_codes()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.shop_code IS NULL THEN
    NEW.shop_code := generate_unique_shop_code();
  END IF;
  
  IF NEW.qr_code_url IS NULL THEN
    NEW.qr_code_url := 'https://smartprint.app/shop/' || NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_setup_shop_codes ON shops;
CREATE TRIGGER auto_setup_shop_codes
  BEFORE INSERT ON shops
  FOR EACH ROW
  EXECUTE FUNCTION setup_shop_codes();

-- RPC for finding shop by code (used in find-shop page)
CREATE OR REPLACE FUNCTION find_shop_by_code(p_code TEXT)
RETURNS TABLE(
  id UUID,
  shop_name TEXT,
  address TEXT,
  city TEXT,
  is_approved BOOLEAN,
  slug TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.shop_name, s.address, s.city, s.is_approved, s.slug
  FROM shops s
  WHERE s.shop_code = UPPER(p_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Realtime Configuration ───────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
