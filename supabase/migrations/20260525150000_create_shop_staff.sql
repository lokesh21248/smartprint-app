-- =====================================================
-- SMARTPRINT DATABASE MIGRATION - CREATE SHOP_STAFF
-- Re-creates missing public.shop_staff table and corrects orders RLS policies
-- =====================================================

BEGIN;

-- 1. Create shop_staff table if not exists
CREATE TABLE IF NOT EXISTS public.shop_staff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID REFERENCES public.shops(id) ON DELETE CASCADE NOT NULL,
  user_id     TEXT,                                 -- Clerk User ID (NULL until they accept invite)
  email       TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  invited_at  TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  is_active   BOOLEAN DEFAULT true,
  UNIQUE(shop_id, email),
  UNIQUE(shop_id, user_id)
);

-- 2. Create indexes for high-speed lookups
CREATE INDEX IF NOT EXISTS idx_staff_shop ON public.shop_staff(shop_id);
CREATE INDEX IF NOT EXISTS idx_staff_user ON public.shop_staff(user_id);

-- 3. Disable Row Level Security (RLS) on shop_staff table, matching the Clerk authentication model
ALTER TABLE public.shop_staff DISABLE ROW LEVEL SECURITY;

-- 4. Correct buggy RLS policy on orders table
-- The previous enterprise hardening script had a typo referencing public.staff instead of public.shop_staff.
DROP POLICY IF EXISTS "Shop staff can view orders" ON public.orders;

CREATE POLICY "Shop staff can view orders"
ON public.orders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.shop_staff
    WHERE shop_staff.shop_id = orders.shop_id
    AND shop_staff.user_id::text = auth.uid()::text
  )
  OR
  EXISTS (
    SELECT 1 FROM public.shops
    WHERE shops.id = orders.shop_id
    AND shops.clerk_owner_id = auth.uid()::text
  )
);

COMMIT;
