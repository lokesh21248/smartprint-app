-- ============================================================
-- Enable Supabase Realtime for orders table (PARTITIONED)
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
--
-- ROOT CAUSE:
-- The orders table is partitioned by month (orders_2026_04 ... orders_2026_12).
-- Supabase Realtime WAL events carry the CHILD partition name (orders_2026_07),
-- NOT the parent table name (orders). The frontend subscribes to table: "orders"
-- so events are silently dropped — the channel shows SUBSCRIBED but zero
-- payloads are ever delivered.
--
-- FIX:
-- publish_via_partition_root = true forces Supabase Realtime to emit all
-- child-partition WAL events under the parent table name "orders", making
-- them match the frontend subscription on table: "orders".
--
-- The anon-key RLS policy is required because the browser client has no
-- Supabase Auth session (Clerk handles auth), so auth.uid() = NULL and
-- any existing RLS policies would block realtime delivery.
-- ============================================================

-- ── Step 1: Broadcast partition events under the parent table name ────────────
ALTER PUBLICATION supabase_realtime SET (publish_via_partition_root = true);


-- ── Step 2: RLS policy — allow anon realtime SELECT on orders ─────────────────
DROP POLICY IF EXISTS allow_realtime_select_by_shop ON public.orders;

CREATE POLICY allow_realtime_select_by_shop
  ON public.orders
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- ── Verify (run in a separate query after the above succeeds) ─────────────────
-- 1. Confirm publish_via_partition_root is on:
--    SELECT pubname, pubviaroot
--      FROM pg_publication
--     WHERE pubname = 'supabase_realtime';
--    Expected: pubviaroot = true
--
-- 2. Confirm partitions are in the publication:
--    SELECT pubname, tablename
--      FROM pg_publication_tables
--     WHERE pubname = 'supabase_realtime';
--    Expected: rows for orders_2026_07 (and other months)
--
-- 3. Confirm RLS policy exists:
--    SELECT policyname, cmd, roles
--      FROM pg_policies
--     WHERE tablename = 'orders' AND policyname = 'allow_realtime_select_by_shop';
--    Expected: 'allow_realtime_select_by_shop' | SELECT | {anon,authenticated}
