-- ============================================================
-- SmartPrint: Shop Owner Admin Panel — Supabase Schema
-- ============================================================

-- Enable PostGIS for location data
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─── 1. shops ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES auth.users(id),
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

-- Current partition (extend monthly)
CREATE TABLE IF NOT EXISTS orders_2026_04 PARTITION OF orders
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE IF NOT EXISTS orders_2026_05 PARTITION OF orders
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE IF NOT EXISTS orders_2026_06 PARTITION OF orders
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE INDEX IF NOT EXISTS idx_orders_shop_status
  ON orders(shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer
  ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_active_status
  ON orders(status) WHERE status IN ('placed','accepted','printing');

-- ─── 3. shop_staff ───────────────────────────────────────────────────────────
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

-- ─── 4. notifications ────────────────────────────────────────────────────────
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

-- ─── 5. reviews ──────────────────────────────────────────────────────────────
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

-- ─── 6. analytics_daily (materialized view) ──────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics_daily AS
SELECT
  shop_id,
  DATE(created_at) AS date,
  COUNT(*) AS total_orders,
  SUM(total_amount) AS revenue,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/60) AS avg_completion_mins,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
FROM orders
GROUP BY shop_id, DATE(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_daily
  ON analytics_daily(shop_id, date);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- shops: owner + staff can view; only owner can update
CREATE POLICY "Owners view own shops" ON shops
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id IN (SELECT shop_id FROM shop_staff WHERE user_id = auth.uid())
  );

CREATE POLICY "Owners update own shops" ON shops
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Owners insert shops" ON shops
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- orders: shop staff can view/update orders for their shop
CREATE POLICY "Shop staff view orders" ON orders
  FOR SELECT USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM shop_staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Shop staff update orders" ON orders
  FOR UPDATE USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM shop_staff WHERE user_id = auth.uid()
    )
  );

-- notifications: users see only their own
CREATE POLICY "Users view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- shop_staff: shop owners manage their staff
CREATE POLICY "Owners manage staff" ON shop_staff
  FOR ALL USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

-- reviews: shop owners/staff can read reviews for their shop
CREATE POLICY "Shop staff view reviews" ON reviews
  FOR SELECT USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM shop_staff WHERE user_id = auth.uid()
    )
  );

-- ─── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shops_updated_at
  BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Analytics refresh job (schedule via pg_cron) ─────────────────────────────
-- SELECT cron.schedule('refresh-analytics', '0 * * * *',
--   $$ REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_daily $$);
