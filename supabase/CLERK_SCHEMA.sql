-- ============================================================
-- SmartPrint: Corrected Schema for Clerk Authentication
-- ============================================================
-- CRITICAL: This schema uses TEXT for owner_id/user_id to hold
-- Clerk's string-based user IDs, NOT Supabase Auth UUIDs.
-- RLS is DISABLED — security enforced via Next.js API routes.
-- ============================================================

-- ─── EXTENSIONS ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── TABLE: shops ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shops (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  slug                  TEXT UNIQUE NOT NULL,        -- used in QR URL: /s/{slug}
  owner_id              TEXT NOT NULL,               -- Clerk User ID (string)
  owner_email           TEXT NOT NULL,
  phone                 TEXT NOT NULL,
  address               TEXT NOT NULL,
  lat                   DECIMAL(10, 8),
  lng                   DECIMAL(11, 8),
  price_bw_per_page     DECIMAL(6, 2) NOT NULL DEFAULT 1.00,
  price_color_per_page  DECIMAL(6, 2) NOT NULL DEFAULT 5.00,
  opening_time          TIME,
  closing_time          TIME,
  working_days          TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri','Sat'],
  services              TEXT[],                      -- e.g. ['binding', 'lamination']
  is_approved           BOOLEAN DEFAULT false,
  is_open               BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_shops_slug ON shops(slug);
CREATE INDEX IF NOT EXISTS idx_shops_approval ON shops(is_approved);

ALTER TABLE shops DISABLE ROW LEVEL SECURITY;

-- ─── TABLE: orders (partitioned by month) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_token              TEXT UNIQUE NOT NULL,     -- used in /order/{shortToken}
  shop_id                  UUID REFERENCES shops(id) NOT NULL,
  customer_name            TEXT NOT NULL,
  customer_phone           TEXT NOT NULL,
  customer_phone_verified  BOOLEAN DEFAULT false,
  file_s3_key              TEXT NOT NULL,
  file_name                TEXT,
  page_count               INTEGER NOT NULL,
  copies                   INTEGER NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 50),
  color                    BOOLEAN NOT NULL DEFAULT false,
  double_sided             BOOLEAN NOT NULL DEFAULT false,
  notes                    TEXT,
  total_amount             DECIMAL(8, 2) NOT NULL,
  order_status             TEXT NOT NULL DEFAULT 'DRAFT'
                           CHECK (order_status IN ('DRAFT','PLACED','ACCEPTED','PRINTING','READY','COMPLETED','CANCELLED')),
  status_history           JSONB DEFAULT '[]'::jsonb,   -- [{status, at, actor}]
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Partitions for 2026
CREATE TABLE IF NOT EXISTS orders_2026_04 PARTITION OF orders
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS orders_2026_05 PARTITION OF orders
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS orders_2026_06 PARTITION OF orders
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS orders_2026_07 PARTITION OF orders
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_shop_status
  ON orders(shop_id, order_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone
  ON orders(customer_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_short_token
  ON orders(short_token);

-- Enable real-time
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

-- ─── TABLE: shop_staff ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_staff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID REFERENCES shops(id) NOT NULL,
  user_id     TEXT NOT NULL,                        -- Clerk User ID
  email       TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  invited_at  TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(shop_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_shop ON shop_staff(shop_id);
CREATE INDEX IF NOT EXISTS idx_staff_user ON shop_staff(user_id);
ALTER TABLE shop_staff DISABLE ROW LEVEL SECURITY;

-- ─── TABLE: notifications ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,                        -- Clerk User ID
  shop_id     UUID REFERENCES shops(id),
  type        TEXT NOT NULL,                        -- 'new_order' | 'status_change' | 'system'
  title       TEXT NOT NULL,
  body        TEXT,
  is_read     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- ─── TABLE: reviews ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES orders(id) NOT NULL,
  shop_id     UUID REFERENCES shops(id) NOT NULL,
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_shop ON reviews(shop_id, created_at DESC);
ALTER TABLE reviews DISABLE ROW LEVEL SECURITY;

-- ─── TABLE: otp_verifications ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,                        -- bcrypt hash of 6-digit code
  expires_at  TIMESTAMPTZ NOT NULL,                 -- now() + 5 minutes
  attempts    INTEGER DEFAULT 0,
  verified    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone_valid ON otp_verifications(phone, verified, expires_at);
ALTER TABLE otp_verifications DISABLE ROW LEVEL SECURITY;

-- ─── TABLE: audit_log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type   TEXT NOT NULL,                       -- 'customer' | 'shop' | 'admin' | 'system'
  actor_id     TEXT,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  payload      JSONB,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_type, actor_id, created_at DESC);
ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;

-- ─── MATERIALIZED VIEW: analytics_daily ──────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics_daily AS
SELECT
  shop_id,
  DATE(created_at)                                              AS day,
  COUNT(*)  FILTER (WHERE order_status = 'COMPLETED')          AS orders_completed,
  SUM(total_amount) FILTER (WHERE order_status = 'COMPLETED')  AS revenue,
  AVG(
    EXTRACT(EPOCH FROM (updated_at - created_at)) / 60
  ) FILTER (WHERE order_status = 'COMPLETED')                  AS avg_completion_minutes
FROM orders
GROUP BY shop_id, DATE(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_daily ON analytics_daily (shop_id, day);

-- ─── CLEANUP: Drop old Supabase Auth-based schema ──────────────────────────────
-- Uncomment when ready to migrate (DESTRUCTIVE)
-- DROP TABLE IF EXISTS otp_verifications CASCADE;
-- DROP TABLE IF EXISTS notifications CASCADE;
-- DROP TABLE IF EXISTS shop_staff CASCADE;
-- DROP TABLE IF EXISTS orders CASCADE;
-- DROP TABLE IF EXISTS shops CASCADE;
