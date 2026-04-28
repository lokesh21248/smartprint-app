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
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  location GEOGRAPHY(POINT),
  phone TEXT NOT NULL,
  email TEXT,
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  short_token TEXT UNIQUE NOT NULL,
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
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
  order_id UUID REFERENCES orders(id),
  customer_id TEXT, -- Clerk User ID
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
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

-- ─── Realtime Configuration ───────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
