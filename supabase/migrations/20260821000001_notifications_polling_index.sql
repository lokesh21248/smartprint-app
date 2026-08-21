-- Migration: 20260821000001_notifications_polling_index.sql
--
-- Adds a partial composite index optimised for the API polling query:
--
--   SELECT id, type, title, body, data, created_at
--   FROM notifications
--   WHERE shop_id = $1 AND is_read = false
--   ORDER BY created_at DESC
--   LIMIT 20;
--
-- WHY A PARTIAL INDEX?
--   A partial index (WHERE is_read = false) only indexes unread rows.
--   In a live shop, the vast majority of notifications are eventually read,
--   so the partial index stays small and cheap to maintain. A full index
--   on (shop_id, is_read, created_at) would include millions of historical
--   read rows unnecessarily.
--
-- BENEFIT:
--   This covers the polling query path with an index-only scan when possible,
--   eliminating full sequential scans on the notifications table even as
--   historical data grows.

CREATE INDEX IF NOT EXISTS idx_notifications_shop_unread
  ON notifications (shop_id, created_at DESC)
  WHERE is_read = false;

-- Additional index for the mark-as-read pattern:
--   UPDATE notifications SET is_read = true
--   WHERE id = $1 AND shop_id = $2
-- The PK on `id` already covers this, but a composite index helps when we
-- also filter on shop_id (IDOR-safe updates).
-- Note: This index is only created if it doesn't already exist from prior migrations.
CREATE INDEX IF NOT EXISTS idx_notifications_id_shop
  ON notifications (id, shop_id);
