-- ============================================================
-- Fix: Add notifications table to Supabase Realtime publication
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
--
-- ROOT CAUSE:
-- The notifications table was never added to the supabase_realtime
-- WAL publication. The frontend subscribes to notifications INSERT
-- events via Realtime, but Supabase never broadcasts them because
-- the table is not in the publication — the channel shows SUBSCRIBED
-- but zero payloads are ever delivered.
--
-- RESULT:
-- - No notification badge update on new order
-- - No toast/popup on new order
-- - No sound on new order
-- All these are downstream consumers of the notifications realtime event.
-- ============================================================

-- ── Step 1: Add notifications to realtime publication ─────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;


-- ── Step 2: RLS policy — allow realtime SELECT delivery ───────────────────────
-- The browser client uses the anon key (Clerk handles auth, not Supabase Auth,
-- so auth.uid() = NULL). The subscription-level filter `shop_id=eq.{shopId}`
-- ensures each shop only receives its own notification events.
DROP POLICY IF EXISTS allow_realtime_select_notifications ON public.notifications;

CREATE POLICY allow_realtime_select_notifications
  ON public.notifications
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- ── Step 3: Indexes for efficient badge queries ────────────────────────────────
-- Covers: SELECT WHERE shop_id = ? AND type = 'new_order' AND is_read = false
CREATE INDEX IF NOT EXISTS idx_notifications_shop_type_unread
  ON public.notifications(shop_id, type, is_read);

-- Covers: SELECT WHERE shop_id = ? AND is_read = false
CREATE INDEX IF NOT EXISTS idx_notifications_shop_unread
  ON public.notifications(shop_id, is_read);


-- ── Verification ───────────────────────────────────────────────────────────────
-- 1. Confirm notifications is in the publication:
--    SELECT pubname, tablename FROM pg_publication_tables
--     WHERE pubname = 'supabase_realtime' AND tablename = 'notifications';
--    Expected: 1 row
--
-- 2. Confirm RLS policy exists:
--    SELECT policyname, cmd, roles FROM pg_policies
--     WHERE tablename = 'notifications' AND policyname = 'allow_realtime_select_notifications';
--    Expected: 'allow_realtime_select_notifications' | SELECT | {anon,authenticated}
