-- ============================================================
-- SmartPrint: COMPLETE DATABASE SETUP
-- Run this entire script in the Supabase SQL Editor
-- ============================================================

-- ─── 1. shops table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
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
  -- Shop code / QR fields
  shop_code VARCHAR(6) UNIQUE,
  qr_code_url TEXT,
  qr_scan_count INT DEFAULT 0,
  code_use_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_shops_active ON shops(is_active, is_approved, is_open);
CREATE INDEX IF NOT EXISTS idx_shops_code ON shops(shop_code);

-- ─── 2. orders table (non-partitioned for simplicity) ─────────
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES auth.users(id),
  -- Guest ordering fields
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

CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON orders(shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_active_status ON orders(status) WHERE status IN ('placed','accepted','printing');
CREATE INDEX IF NOT EXISTS idx_orders_short_token ON orders(short_token);

-- ─── 3. otp_verifications table ───────────────────────────────
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

-- ─── 4. shop_staff table ──────────────────────────────────────
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

-- ─── 5. notifications table ───────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

-- ─── 6. reviews table ─────────────────────────────────────────
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

-- ─── 7. updated_at trigger ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shops_updated_at ON shops;
CREATE TRIGGER shops_updated_at
  BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 8. Shop code auto-generation ────────────────────────────
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

-- Fix any existing shops missing codes
UPDATE shops SET shop_code = generate_unique_shop_code() WHERE shop_code IS NULL;
UPDATE shops SET qr_code_url = 'https://smartprint.app/shop/' || id WHERE qr_code_url IS NULL;

-- ─── 9. Helper RPC functions ──────────────────────────────────
CREATE OR REPLACE FUNCTION increment_qr_scan(p_shop_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE shops SET qr_scan_count = qr_scan_count + 1 WHERE id = p_shop_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  SET code_use_count = code_use_count + 1 
  WHERE shop_code = UPPER(p_code) AND is_active = true;
  
  RETURN QUERY
  SELECT s.id, s.shop_name, s.address, s.city, s.is_active
  FROM shops s
  WHERE s.shop_code = UPPER(p_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 10. Row Level Security ───────────────────────────────────
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;

-- Drop old policies to avoid conflicts
DROP POLICY IF EXISTS "Owners view own shops" ON shops;
DROP POLICY IF EXISTS "Owners update own shops" ON shops;
DROP POLICY IF EXISTS "Owners insert shops" ON shops;
DROP POLICY IF EXISTS "Public can view active shops by ID" ON shops;
DROP POLICY IF EXISTS "Shop staff view orders" ON orders;
DROP POLICY IF EXISTS "Shop staff update orders" ON orders;
DROP POLICY IF EXISTS "Anyone can insert orders" ON orders;
DROP POLICY IF EXISTS "Anyone can view order by short token" ON orders;
DROP POLICY IF EXISTS "Users view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
DROP POLICY IF EXISTS "Owners manage staff" ON shop_staff;
DROP POLICY IF EXISTS "Shop staff view reviews" ON reviews;
DROP POLICY IF EXISTS "Service role can manage OTP" ON otp_verifications;

-- shops: public can view active shops; owners/staff can manage
CREATE POLICY "Public can view active shops by ID" ON shops
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Owners update own shops" ON shops
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Owners insert shops" ON shops
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- orders: shop owners/staff see their orders; guests can insert + view by token
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

-- Allow anyone (guest) to place a new order
CREATE POLICY "Anyone can insert orders" ON orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Allow tracking by short token (public, no auth needed)
CREATE POLICY "Anyone can view order by short token" ON orders
  FOR SELECT TO anon, authenticated
  USING (short_token IS NOT NULL);

-- notifications
CREATE POLICY "Users view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- shop_staff
CREATE POLICY "Owners manage staff" ON shop_staff
  FOR ALL USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

-- reviews
CREATE POLICY "Shop staff view reviews" ON reviews
  FOR SELECT USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM shop_staff WHERE user_id = auth.uid()
    )
  );

-- otp_verifications: service role only (no direct client access)
CREATE POLICY "Service role can manage OTP" ON otp_verifications
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── 11. Realtime subscriptions ───────────────────────────────
-- Enable realtime for orders so admin dashboard gets live updates
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- ─── Done! ────────────────────────────────────────────────────
SELECT 'SmartPrint schema applied successfully!' AS status;
