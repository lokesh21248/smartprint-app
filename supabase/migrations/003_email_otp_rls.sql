-- =============================================================================
-- Migration: 003_email_otp_rls.sql
-- Description: Enable RLS + define policies for all critical tables.
--              Safe to run multiple times (IF NOT EXISTS guards).
-- =============================================================================

-- ── 1. Enable RLS on all critical tables (idempotent) ────────────────────────
ALTER TABLE IF EXISTS public.shops       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shop_staff  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reviews     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;

-- ── 2. Shops ──────────────────────────────────────────────────────────────────
-- Drop before recreate to keep migration idempotent
DROP POLICY IF EXISTS "shop_owner_all"          ON public.shops;
DROP POLICY IF EXISTS "shop_public_read"        ON public.shops;

-- Shop owners can read/write their own shop row
CREATE POLICY "shop_owner_all" ON public.shops
  FOR ALL
  USING  (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Anyone can read approved + active shops (public discovery / QR landing)
CREATE POLICY "shop_public_read" ON public.shops
  FOR SELECT
  USING (is_approved = true AND is_active = true);

-- ── 3. Orders ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "order_shop_owner_all"    ON public.orders;
DROP POLICY IF EXISTS "order_customer_read"     ON public.orders;

-- Shop owner can manage all orders belonging to their shop
CREATE POLICY "order_shop_owner_all" ON public.orders
  FOR ALL
  USING (
    shop_id IN (
      SELECT id FROM public.shops WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    shop_id IN (
      SELECT id FROM public.shops WHERE owner_id = auth.uid()
    )
  );

-- Customer can read their own orders (uses short_token for guest; customer_id for auth'd)
CREATE POLICY "order_customer_read" ON public.orders
  FOR SELECT
  USING (
    (auth.uid() IS NOT NULL AND customer_id = auth.uid())
  );

-- ── 4. Shop Staff ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "staff_shop_owner_all"    ON public.shop_staff;
DROP POLICY IF EXISTS "staff_self_read"         ON public.shop_staff;

-- Shop owner manages all staff records for their shop
CREATE POLICY "staff_shop_owner_all" ON public.shop_staff
  FOR ALL
  USING (
    shop_id IN (
      SELECT id FROM public.shops WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    shop_id IN (
      SELECT id FROM public.shops WHERE owner_id = auth.uid()
    )
  );

-- Staff members can read their own record
CREATE POLICY "staff_self_read" ON public.shop_staff
  FOR SELECT
  USING (user_id = auth.uid());

-- ── 5. Reviews ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "review_public_read"      ON public.reviews;
DROP POLICY IF EXISTS "review_owner_write"      ON public.reviews;

-- All reviews are publicly readable (for shop rating display)
CREATE POLICY "review_public_read" ON public.reviews
  FOR SELECT USING (true);

-- Customers can only insert/update their own reviews
CREATE POLICY "review_owner_write" ON public.reviews
  FOR ALL
  USING  (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- ── 6. Notifications ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notification_owner_all"  ON public.notifications;

-- Users can only see/delete their own notifications
CREATE POLICY "notification_owner_all" ON public.notifications
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 7. Storage: order-files bucket ───────────────────────────────────────────
-- Run these in Supabase SQL Editor AFTER creating the 'order-files' bucket
-- and setting it to Private in the Storage settings UI.
--
-- INSERT INTO storage.policies (bucket_id, name, definition, check_definition, command)
-- VALUES
--   (
--     'order-files',
--     'Authenticated users can upload',
--     'auth.uid() IS NOT NULL',
--     'auth.uid() IS NOT NULL',
--     'INSERT'
--   ),
--   (
--     'order-files',
--     'Owner can read own files',
--     'auth.uid() IS NOT NULL',
--     NULL,
--     'SELECT'
--   );
--
-- NOTE: Storage policies are managed through the Supabase dashboard
--       Storage → order-files → Policies tab. The signed-url API route
--       (app/api/storage/signed-url/route.ts) already handles access
--       control at the application layer using the service role key.
