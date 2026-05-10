-- Create customer_sessions table
CREATE TABLE IF NOT EXISTS customer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  shop_slug TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for cleanup or fast lookup
CREATE INDEX IF NOT EXISTS idx_customer_sessions_created_at ON customer_sessions(created_at);
