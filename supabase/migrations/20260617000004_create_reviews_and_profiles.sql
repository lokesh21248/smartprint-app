-- Migration: Create reviews table and shop_profiles view
-- Created: 2026-06-17

-- 1. Create reviews table if not exists
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  customer_id TEXT,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Disable Row Level Security on reviews
ALTER TABLE reviews DISABLE ROW LEVEL SECURITY;

-- Grant permissions to default roles
GRANT ALL ON TABLE reviews TO postgres, service_role, anon, authenticated;

-- 2. Create shop_profiles view over shops for compatibility/verification
CREATE OR REPLACE VIEW shop_profiles AS SELECT * FROM shops;

-- Grant permissions to shop_profiles view
GRANT ALL ON shop_profiles TO postgres, service_role, anon, authenticated;
