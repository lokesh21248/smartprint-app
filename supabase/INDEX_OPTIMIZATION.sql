-- ============================================================
-- SmartPrint: INDEX OPTIMIZATION + QUERY STRATEGY REFERENCE
-- ============================================================
-- Run each section independently in Supabase SQL Editor.
-- READ-ONLY sections are safe at any time.
-- ⚠️  Index creation uses CONCURRENTLY — safe on live DB (no locks).
-- ============================================================


-- ─── SECTION 1: CURRENT INDEX INVENTORY (READ-ONLY) ─────────────────────────
-- Run first to understand what already exists before adding anything.

SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'shops', 'otp_verifications')
ORDER BY tablename, indexname;


-- ─── SECTION 2: QUERY EXPLAIN (Verify no full table scans) ──────────────────
-- Run EXPLAIN on your most common queries to verify index usage.
-- Look for: "Index Scan" or "Bitmap Index Scan" (good)
-- Avoid: "Seq Scan" on large tables (bad)

-- 2a. Dashboard orders query (most frequent):
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, status, customer_name, total_amount, created_at
FROM orders
WHERE shop_id = '00000000-0000-0000-0000-000000000000'  -- replace with real shop ID
  AND status IN ('PLACED', 'ACCEPTED', 'PRINTING')
ORDER BY created_at DESC
LIMIT 50;
-- Expected: should use idx_orders_shop_id_status_created_at (multi-column)

-- 2b. Analytics query:
EXPLAIN (ANALYZE, BUFFERS)
SELECT total_amount, status, created_at, customer_phone, is_color
FROM orders
WHERE shop_id = '00000000-0000-0000-0000-000000000000'
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 1000;
-- Expected: should use idx_orders_shop_id_status_created_at + partition pruning

-- 2c. Shop lookup (authentication path):
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM shops WHERE clerk_owner_id = 'user_abc123';
-- Expected: should use idx_shops_clerk_owner_id


-- ─── SECTION 3: ENSURE OPTIMAL INDEXES EXIST ────────────────────────────────
-- Only create indexes that don't already exist.
-- CONCURRENTLY = no table lock on live DB.

-- 3a. shops — clerk_owner_id lookup (every dashboard request)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shops_clerk_owner_id
  ON shops (clerk_owner_id);

-- 3b. shops — slug lookup (every QR scan, public endpoint)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shops_slug
  ON shops (slug);

-- 3c. orders — composite for dashboard list (shop + active statuses + newest first)
-- This single index satisfies: WHERE shop_id=? AND status IN (...) ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_shop_status_created
  ON orders (shop_id, status, created_at DESC);
-- ⚠️  On partitioned tables, this creates the index on the parent.
-- PostgreSQL automatically propagates it to all existing + future child partitions.

-- 3d. orders — customer phone lookup (duplicate detection, OTP linking)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_phone
  ON orders (customer_phone);

-- 3e. otp_verifications — phone + expires (most frequent auth query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_otp_phone_expires
  ON otp_verifications (phone, expires_at)
  WHERE verified = false;  -- partial: skip already-used OTPs

-- 3f. orders — short_token lookup (every order tracking request)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_short_token
  ON orders (short_token);


-- ─── SECTION 4: IDENTIFY AND DROP REDUNDANT INDEXES ─────────────────────────
-- Run SECTION 1 first. If you see indexes that are strict subsets of others, drop them.
-- Example: if idx_orders_shop_id EXISTS and idx_orders_shop_status_created ALSO EXISTS,
-- the single-column shop_id index is redundant for filtered queries.

-- 4a. Identify unused indexes (pg_stat_user_indexes tracks usage since last stats reset)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan        AS times_used,
  idx_tup_read    AS tuples_read,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'orders%'
  AND idx_scan = 0          -- never used since last pg_stat_reset
ORDER BY pg_relation_size(indexrelid) DESC;
-- If an index shows idx_scan=0 and it's been running for weeks, it's safe to drop.
-- Command: DROP INDEX CONCURRENTLY <indexname>;


-- ─── SECTION 5: PARTITION STRATEGY NOTES ────────────────────────────────────
-- orders table is partitioned by RANGE on created_at (monthly partitions).
-- This means:
--   - Queries with created_at filters automatically skip irrelevant partitions
--   - e.g. WHERE created_at >= '2026-05-01' only scans orders_2026_05
--   - This is "partition pruning" — free performance for date-bounded queries
--
-- BEST PRACTICES for partition-aware queries:
--   ✅ Always include created_at in WHERE when possible
--   ✅ Prefer gte(created_at, X) over OFFSET-based pagination for old data
--   ❌ Never run unbounded queries: SELECT * FROM orders (no WHERE)
--   ❌ Never delete/update without a created_at filter (scans all partitions)
--
-- FUTURE PARTITION CREATION (run at start of each month):
DO $$
DECLARE
  base_date  DATE := DATE_TRUNC('month', CURRENT_DATE);
  start_date DATE;
  end_date   DATE;
  tbl_name   TEXT;
  i          INT;
BEGIN
  FOR i IN 0..5 LOOP  -- current month + 5 months ahead
    start_date := base_date + (i || ' months')::INTERVAL;
    end_date   := start_date + INTERVAL '1 month';
    tbl_name   := 'orders_' || TO_CHAR(start_date, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF orders FOR VALUES FROM (%L) TO (%L)',
      tbl_name, start_date, end_date
    );
    RAISE NOTICE 'Ensured partition: %', tbl_name;
  END LOOP;
END $$;


-- ─── SECTION 6: FINAL HEALTH CHECK (READ-ONLY) ───────────────────────────────

SELECT
  pg_size_pretty(pg_database_size(current_database())) AS total_db_size,
  (SELECT COUNT(*) FROM orders)           AS total_orders,
  (SELECT COUNT(*) FROM shops)            AS total_shops,
  (SELECT COUNT(*) FROM otp_verifications WHERE expires_at > NOW() AND verified = false) AS active_otps,
  NOW() AT TIME ZONE 'Asia/Kolkata'       AS run_at_ist;
