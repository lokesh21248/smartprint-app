-- 1. Update orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS short_token TEXT UNIQUE;

-- 2. Create otp_verifications table
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

-- 3. Add index for short_token in orders
CREATE INDEX IF NOT EXISTS idx_orders_short_token ON orders(short_token);

-- 4. Create RPC for incrementing QR scan if not exists
CREATE OR REPLACE FUNCTION increment_qr_scan(p_shop_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE shops
  SET total_orders = total_orders + 1 -- Using total_orders as a proxy for scans in this schema
  WHERE id = p_shop_id;
END;
$$ LANGUAGE plpgsql;
