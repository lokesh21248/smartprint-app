-- Create customer_sessions table
CREATE TABLE IF NOT EXISTS customer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  shop_slug TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for cleanup or fast lookup
CREATE INDEX IF NOT EXISTS idx_customer_sessions_created_at ON customer_sessions(created_at);

-- Enable RLS
ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to create a session
CREATE POLICY "Allow public session creation"
ON customer_sessions
FOR INSERT
TO public
WITH CHECK (true);

-- (Optional) If we want the admin/service role to read them, we don't need a policy because service_role bypasses RLS.
-- But if we ever need authenticated users to read their own sessions, we can add it later.
