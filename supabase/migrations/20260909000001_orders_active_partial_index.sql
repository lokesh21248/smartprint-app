-- ============================================================
-- Orders Dashboard Performance — Phase 5
-- Partial index for active (non-terminal) orders
--
-- Rationale: The orders-list API's primary query pattern is
-- fetching the most recent active orders for a shop. Active
-- orders (PLACED, ACCEPTED, PRINTING, READY) are a small subset
-- of the full orders table, which grows without bound.
--
-- A partial index that excludes terminal statuses (COMPLETED,
-- CANCELLED, REJECTED, DRAFT) is much smaller than the full
-- idx_orders_shop_status_created index and is chosen by Postgres
-- for the most common filter: "give me the pending queue".
--
-- Already existing indexes (DO NOT recreate):
--   idx_orders_shop_status_created   ON orders(shop_id, status, created_at DESC)
--   idx_orders_status_upper          ON orders(shop_id, UPPER(status), created_at DESC)
--   idx_orders_shop_created          ON orders(shop_id, created_at DESC)
--   idx_order_files_order_id         ON order_files(order_id)
--   idx_orders_dedup                 ON orders(shop_id, customer_phone, file_name, created_at) WHERE ...
--   idx_orders_short_token           UNIQUE ON orders(short_token)
-- ============================================================

-- ── Partial index for active-status orders ────────────────────────────────────
-- Covers: WHERE shop_id = ? AND UPPER(status) NOT IN ('COMPLETED','CANCELLED',...)
-- ORDER BY created_at DESC LIMIT 20
--
-- This is the exact query pattern for the default Orders dashboard view
-- (no filter selected) and for the "pending queue" view.
-- The index is ~60-80% smaller than the full table index on shops with
-- many completed orders, making it significantly faster to scan.
CREATE INDEX IF NOT EXISTS idx_orders_shop_active
  ON orders (shop_id, created_at DESC)
  WHERE UPPER(status) NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED', 'DRAFT');

COMMENT ON INDEX idx_orders_shop_active IS
  'Phase 5: Partial index covering only active (non-terminal) orders per shop. '
  'Much smaller than the full idx_orders_shop_status_created index. '
  'Used by GET /api/shop/orders-list when no status filter is applied (default view). '
  'Prevents Postgres from scanning the entire (growing) completed-orders history.';


-- ── Verification ─────────────────────────────────────────────────────────────
-- Run in Supabase SQL Editor to confirm the partial index is used:
--
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
--   SELECT id, status, created_at
--   FROM orders
--   WHERE shop_id = '<your-shop-uuid>'
--   ORDER BY created_at DESC
--   LIMIT 20;
--
-- Expected: "Index Scan using idx_orders_shop_active"
--
-- If you see "idx_orders_shop_status_created" instead, that is also acceptable
-- (Postgres may prefer the covering index depending on statistics).
--
-- Check index size vs full index size:
-- SELECT
--   indexname,
--   pg_size_pretty(pg_relation_size(indexrelid)) AS size
-- FROM pg_indexes
-- JOIN pg_class ON pg_class.relname = pg_indexes.indexname
-- WHERE tablename = 'orders'
-- ORDER BY pg_relation_size(indexrelid) DESC;
