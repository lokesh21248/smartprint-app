-- =============================================================================
-- SmartPrint: MULTI-FILE SUPPORT (Senior Engineer Patch)
-- =============================================================================
-- This migration adds a 'files' JSONB column to the orders table to store
-- multiple document references per order, fixing a data loss bug where only 
-- the first uploaded file was being saved.
-- =============================================================================

-- ─── 1. ADD FILES COLUMN ──────────────────────────────────────────────────────
-- Use JSONB for efficient storage and indexing of file metadata arrays.
-- Default to empty array to ensure code compatibility.
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]'::jsonb;

-- ─── 2. DATA MIGRATION (BACKFILL) ─────────────────────────────────────────────
-- Populate the 'files' column with the existing single-file data 
-- to ensure backward compatibility for old order records.
UPDATE public.orders
SET files = jsonb_build_array(
  jsonb_build_object(
    'name', file_name,
    'size', file_size_bytes,
    'pages', page_count,
    'url', file_s3_key
  )
)
WHERE files = '[]'::jsonb 
  AND file_s3_key IS NOT NULL;

-- ─── 3. PERFORMANCE INDEXING ──────────────────────────────────────────────────
-- Indexing JSONB is useful if we ever need to search for orders by filename 
-- across the whole array of files.
CREATE INDEX IF NOT EXISTS idx_orders_files_gin ON public.orders USING GIN (files);

-- ─── 4. SCHEMA DOCS / TYPES ───────────────────────────────────────────────────
-- Expected 'files' structure: 
-- Array<{ name: string, size: number, pages: number, url: string }>
