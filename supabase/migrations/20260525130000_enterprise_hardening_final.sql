-- =====================================================
-- SMARTPRINT ENTERPRISE HARDENING FINAL
-- Phases 1, 7, 12, 13
-- =====================================================

-- 1. FORCE RLS ON ALL CRITICAL TABLES
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.upload_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_files FORCE ROW LEVEL SECURITY;
ALTER TABLE public.file_audit_logs FORCE ROW LEVEL SECURITY;

-- 2. DROP ALL EXISTING POLICIES ON THESE TABLES TO REMOVE USING (true) AND INSECURE RULES
DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname, tablename
    FROM pg_policies 
    WHERE tablename IN ('orders', 'upload_sessions', 'notifications') 
      AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 3. RECREATE SECURE ISOLATED POLICIES

-- =========================================
-- ORDERS POLICIES
-- =========================================
CREATE POLICY "Shop staff can view orders"
ON public.orders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.staff
    WHERE staff.shop_id = orders.shop_id
    AND staff.user_id::text = auth.uid()::text
  )
  OR
  EXISTS (
    SELECT 1 FROM public.shops
    WHERE shops.id = orders.shop_id
    AND shops.clerk_owner_id = auth.uid()::text
  )
);

CREATE POLICY "Admins have full access to orders"
ON public.orders FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id::text = auth.uid()::text
    AND users.role = 'admin'
  )
);

CREATE POLICY "Service role full access to orders"
ON public.orders FOR ALL
USING (auth.role() = 'service_role');

-- =========================================
-- UPLOAD SESSIONS POLICIES
-- =========================================
CREATE POLICY "Users can manage own upload sessions"
ON public.upload_sessions FOR ALL
USING (
  user_id = auth.uid()::text
);

CREATE POLICY "Service role full access to upload sessions"
ON public.upload_sessions FOR ALL
USING (auth.role() = 'service_role');

-- =========================================
-- NOTIFICATIONS POLICIES
-- =========================================
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (
  user_id = auth.uid()::text
);

CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (
  user_id = auth.uid()::text
);

CREATE POLICY "Service role full access to notifications"
ON public.notifications FOR ALL
USING (auth.role() = 'service_role');

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_orders_shop_created ON public.orders(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_user_id ON public.upload_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read) WHERE read = false;

-- 5. ENABLE REALTIME REPLICATION
-- Adds tables to the supabase_realtime publication
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_files;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- DONE
