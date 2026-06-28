-- Migration: Add composite performance indexes for Scan2Paper
-- Created: 2026-06-28
-- Purpose: Cover the most common query patterns to eliminate sequential scans.
--
-- Existing single-column indexes (from 20260617000002):
--   idx_orders_status ON orders(status)
--   idx_notifications_user_id ON notifications(user_id)
--   idx_shop_staff_user_id ON shop_staff(user_id)
--   idx_shop_settings_shop_id ON shop_settings(shop_id)
--
-- New composite indexes below target the specific WHERE + ORDER BY patterns
-- used by /api/shop/orders-list and /api/shop/stats.

-- 1. Orders: shop_id + status filter (used by stats pending count query)
CREATE INDEX IF NOT EXISTS idx_orders_shop_status
  ON orders(shop_id, status);

-- 2. Orders: shop_id + created_at DESC (primary sort for orders-list)
CREATE INDEX IF NOT EXISTS idx_orders_shop_created_at
  ON orders(shop_id, created_at DESC);

-- 3. Orders: covering index for orders-list status-filtered queries
--    Covers: WHERE shop_id = ? AND status = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_orders_shop_status_created
  ON orders(shop_id, status, created_at DESC);

-- 4. Orders: covering index for completed-orders stats query
--    Covers: WHERE shop_id = ? AND status IN (...) AND completed_at >= ?
CREATE INDEX IF NOT EXISTS idx_orders_shop_status_completed
  ON orders(shop_id, status, completed_at DESC);

-- 5. Reviews: shop_id lookup for avg rating (currently a seq scan)
CREATE INDEX IF NOT EXISTS idx_reviews_shop_id
  ON reviews(shop_id);

-- 6. Shops: clerk_owner_id lookup for canManageShop ownership check
--    Already fast via primary key but this avoids a seq scan on large tenants
CREATE INDEX IF NOT EXISTS idx_shops_clerk_owner_id
  ON shops(clerk_owner_id);
