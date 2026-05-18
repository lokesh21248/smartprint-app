-- =============================================================================
-- Migration: 20260517_production_indexes_hardening.sql
-- Description: Additional production indexes identified from query pattern audit.
--              Covers the most frequent query paths in dashboard, orders, RBAC.
--
-- ⚠️  All indexes use IF NOT EXISTS + CONCURRENTLY to avoid:
--     - Build failures from duplicate index names
--     - Table locks during deployment
--
-- Run this migration in the Supabase SQL Editor or via CLI:
--   supabase db push
-- =============================================================================

-- ─── ORDERS TABLE ────────────────────────────────────────────────────────────

-- 1. Compound index: shop_id + status
-- Used by: /api/shop/stats (today's orders filtered by status)
--          /api/shop/orders-list (optional status filter)
--          Admin dashboard (status aggregation per shop)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_shop_id_status
ON public.orders (shop_id, status);

-- 2. Compound index: shop_id + created_at DESC
-- Used by: /api/shop/orders-list (paginated, sorted by newest first)
--          Dashboard orders page (chronological listing)
-- Covers the most frequent dashboard query pattern.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_shop_id_created_at
ON public.orders (shop_id, created_at DESC);

-- 3. Index: short_token (unique customer tracking lookups)
-- Used by: GET /api/orders?shortToken=ABC12345
--          RPC get_order_by_token
-- Without this, every customer status check is a sequential scan.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_short_token
ON public.orders (short_token)
WHERE short_token IS NOT NULL;

-- 4. Compound index: duplicate detection
-- Used by: POST /api/orders (duplicate check within 5-min window)
--          .eq("shop_id").eq("customer_phone").eq("file_name").gte("created_at")
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_dedup
ON public.orders (shop_id, customer_phone, file_name, created_at DESC);

-- 5. Index: status (global)
-- Used by: Admin dashboard (total orders by status across all shops)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status
ON public.orders (status);

-- ─── SHOPS TABLE ─────────────────────────────────────────────────────────────

-- 6. Index: clerk_owner_id
-- Used by: EVERY authenticated request (role-guard.ts, middleware, layout guards)
--          /api/shop/route.ts, /api/storage/signed-url, /api/shop/stats, etc.
-- This is the MOST CRITICAL missing index — hit on every dashboard page load.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_shops_clerk_owner_id
ON public.shops (clerk_owner_id)
WHERE clerk_owner_id IS NOT NULL;

-- 7. Index: slug (public shop page lookups)
-- Used by: /s/[slug] layout, /api/shop/public?slug=..., /api/shop/find
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_shops_slug
ON public.shops (slug)
WHERE slug IS NOT NULL;

-- ─── CUSTOMER SESSIONS TABLE ─────────────────────────────────────────────────

-- 8. Index: shop_slug
-- Used by: Session lookups and cleanup queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_sessions_shop_slug
ON public.customer_sessions (shop_slug);

-- ─── SHOP STAFF TABLE ────────────────────────────────────────────────────────

-- 9. Index: user_id
-- Used by: role-guard.ts — every authenticated dashboard request checks
--          shop_staff.user_id to determine manager/staff role.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_staff_user_id
ON public.shop_staff (user_id);

-- ─── WEBHOOK JOBS TABLE ──────────────────────────────────────────────────────

-- 10. Index: status + created_at for admin job monitoring
-- Complements the existing partial index (which only covers pending/failed).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_jobs_status_created
ON public.webhook_jobs (status, created_at DESC);

-- =============================================================================
-- NOTES
-- =============================================================================
-- 
-- Existing indexes (from 20260510_03_indexes_and_performance.sql):
--   idx_orders_shop_id          → orders(shop_id)
--   idx_orders_file_s3_key      → orders(file_s3_key)
--   idx_orders_created_at       → orders(created_at DESC)
--   idx_uploaded_documents_created_at → uploaded_documents(created_at ASC)
--
-- Existing indexes (from 20240430143000_production_schema_init.sql):
--   idx_webhook_jobs_high_speed → webhook_jobs(status, next_retry_at, created_at)
--                                  WHERE status IN ('pending', 'failed')
--
-- The new indexes above complement (not duplicate) the existing ones by
-- covering compound query patterns that single-column indexes cannot optimise.
-- =============================================================================
