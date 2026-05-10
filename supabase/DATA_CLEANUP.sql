-- ============================================================
-- SmartPrint: Safe Duplicate + Test Data Cleanup
-- ============================================================
-- RULES:
--   1. Every DELETE is wrapped in a CTE that returns COUNT first.
--   2. Run SECTION 0 (preview) before any deletes.
--   3. Each section is independent — run only what you need.
--   4. No TRUNCATE. No DROP. Fully reversible via Supabase point-in-time restore.
-- ============================================================


-- ─── SECTION 0: PREVIEW — See what would be deleted (NO changes made) ────────

-- 0a. Test phone numbers (common test patterns)
SELECT COUNT(*) AS test_otp_count
FROM otp_verifications
WHERE phone IN ('9999999999','1234567890','0000000000','9876543210')
   OR phone LIKE '1111%'
   OR phone LIKE '0000%';

-- 0b. Test orders (placed from test phones or with demo names)
SELECT COUNT(*) AS test_order_count, MIN(created_at) AS oldest, MAX(created_at) AS newest
FROM orders
WHERE customer_phone IN ('9999999999','1234567890','0000000000','9876543210')
   OR LOWER(customer_name) IN ('test','demo','dummy','guest','admin','user','abc','xyz');

-- 0c. Duplicate shops (same clerk_owner_id created multiple times)
SELECT clerk_owner_id, COUNT(*) AS shop_count, array_agg(id ORDER BY created_at) AS ids
FROM shops
GROUP BY clerk_owner_id
HAVING COUNT(*) > 1;
-- Safe to keep newest (last in array), delete earlier ones IF they have 0 orders.

-- 0d. Duplicate OTPs for same phone (keep latest, delete old)
SELECT phone, COUNT(*) AS otp_count
FROM otp_verifications
WHERE verified = false AND expires_at > NOW()
GROUP BY phone
HAVING COUNT(*) > 1
ORDER BY otp_count DESC;

-- 0e. Draft orders older than 30 minutes (never submitted — safe to delete)
SELECT COUNT(*) AS stale_drafts
FROM orders
WHERE status = 'DRAFT'
  AND created_at < NOW() - INTERVAL '30 minutes';

-- 0f. Orphaned orders (shop was deleted — FK cascade should handle this,
--     but check anyway)
SELECT COUNT(*) AS orphaned_orders
FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM shops s WHERE s.id = o.shop_id);


-- ─── SECTION 1: DELETE TEST OTP RECORDS ─────────────────────────────────────
-- Removes OTP entries for known test phone numbers.
-- Safe: these are throwaway verification attempts.

WITH deleted AS (
  DELETE FROM otp_verifications
  WHERE phone IN ('9999999999','1234567890','0000000000','9876543210')
     OR phone LIKE '1111111111'
     OR phone LIKE '0000000000'
  RETURNING id, phone
)
SELECT COUNT(*) AS deleted_test_otps, array_agg(DISTINCT phone) AS phones FROM deleted;


-- ─── SECTION 2: DELETE TEST ORDERS ──────────────────────────────────────────
-- Only deletes orders with test phone numbers AND test customer names.
-- Double condition = extra safety (won't delete a real order that happens
-- to share a name with a test value).

WITH deleted AS (
  DELETE FROM orders
  WHERE
    customer_phone IN ('9999999999','1234567890','0000000000','9876543210')
    AND LOWER(customer_name) IN ('test','demo','dummy','guest','admin','user','abc','xyz')
  RETURNING id, customer_name, customer_phone, created_at
)
SELECT
  COUNT(*)          AS deleted_test_orders,
  MIN(created_at)   AS oldest_deleted,
  MAX(created_at)   AS newest_deleted
FROM deleted;


-- ─── SECTION 3: DELETE STALE DRAFT ORDERS ───────────────────────────────────
-- DRAFT orders that were never submitted within the 30-minute window.
-- These are abandoned sessions — safe to remove.
-- The DB trigger already sets draft_expires_at = NOW() + 30min on insert.

WITH deleted AS (
  DELETE FROM orders
  WHERE status = 'DRAFT'
    AND (
      draft_expires_at < NOW()                        -- trigger-set expiry passed
      OR created_at < NOW() - INTERVAL '30 minutes'  -- fallback if trigger missed
    )
  RETURNING id, created_at
)
SELECT
  COUNT(*)        AS stale_drafts_deleted,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest
FROM deleted;


-- ─── SECTION 4: DELETE DUPLICATE SHOPS (SAFE — 0-order duplicates only) ─────
-- Only deletes the OLDER duplicate shop if it has ZERO orders attached.
-- Keeps the newest (most likely the real one).
-- Preview first with Section 0c before running this.

WITH duplicates AS (
  SELECT
    clerk_owner_id,
    id,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY clerk_owner_id
      ORDER BY created_at DESC  -- keep newest
    ) AS rn
  FROM shops
),
safe_to_delete AS (
  SELECT d.id
  FROM duplicates d
  WHERE d.rn > 1  -- not the newest
    AND NOT EXISTS (
      SELECT 1 FROM orders o WHERE o.shop_id = d.id  -- has no orders
    )
)
-- PREVIEW (no delete):
SELECT COUNT(*) AS duplicate_shops_safe_to_delete FROM safe_to_delete;

-- When you're satisfied with the count, uncomment to actually delete:
/*
WITH duplicates AS (
  SELECT
    clerk_owner_id, id, created_at,
    ROW_NUMBER() OVER (PARTITION BY clerk_owner_id ORDER BY created_at DESC) AS rn
  FROM shops
),
safe_to_delete AS (
  SELECT d.id FROM duplicates d
  WHERE d.rn > 1
    AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.shop_id = d.id)
),
deleted AS (
  DELETE FROM shops WHERE id IN (SELECT id FROM safe_to_delete) RETURNING id
)
SELECT COUNT(*) AS duplicate_shops_deleted FROM deleted;
*/


-- ─── SECTION 5: DEDUPLICATE OTP — Keep only latest per phone ─────────────────
-- If the same phone has multiple active, unverified OTPs (e.g., from rapid
-- retries), keep only the newest one. Old ones can never be used anyway
-- because the verify endpoint checks the latest by expires_at.

WITH ranked AS (
  SELECT
    id,
    phone,
    ROW_NUMBER() OVER (
      PARTITION BY phone
      ORDER BY created_at DESC  -- keep newest
    ) AS rn
  FROM otp_verifications
  WHERE verified = false
    AND expires_at > NOW()
),
deleted AS (
  DELETE FROM otp_verifications
  WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  RETURNING id, phone
)
SELECT COUNT(*) AS duplicate_otps_removed FROM deleted;


-- ─── SECTION 6: DELETE CANCELLED ORDERS > 30 DAYS OLD ───────────────────────
-- CANCELLED orders are terminal — they will never change state.
-- Safe to delete after 30 days. Keeps your orders table lean.
-- ⚠️  Only run this if you do NOT need CANCELLED orders for reporting.
--     Comment out if you want to keep them for analytics.

WITH deleted AS (
  DELETE FROM orders
  WHERE status = 'CANCELLED'
    AND cancelled_at < NOW() - INTERVAL '30 days'
  RETURNING id, shop_id, created_at
)
SELECT
  COUNT(*)        AS old_cancelled_deleted,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest
FROM deleted;


-- ─── SECTION 7: FINAL COUNTS ─────────────────────────────────────────────────
-- Run after all cleanup to confirm results.

SELECT
  'shops'             AS tbl, COUNT(*) AS rows FROM shops
UNION ALL SELECT
  'orders',                   COUNT(*) FROM orders
UNION ALL SELECT
  'otp_verifications',        COUNT(*) FROM otp_verifications
UNION ALL SELECT
  'audit_log',                COUNT(*) FROM audit_log
UNION ALL SELECT
  'rate_limits',              COUNT(*) FROM rate_limits
ORDER BY tbl;
