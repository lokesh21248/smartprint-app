-- ============================================================
-- 20260522144218_create_order_files.sql
-- Relational database schema for multi-file orders in SmartPrint.
-- ============================================================

-- Create order_files table
CREATE TABLE IF NOT EXISTS order_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  page_count INT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by order_id
CREATE INDEX IF NOT EXISTS idx_order_files_order_id ON order_files (order_id);

-- Disable Row Level Security (RLS) to align with SmartPrint's security model
-- where authorization and validation are enforced within Next.js API routes.
ALTER TABLE order_files DISABLE ROW LEVEL SECURITY;
