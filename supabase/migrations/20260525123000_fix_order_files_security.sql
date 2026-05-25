-- =====================================================
-- SMARTPRINT ENTERPRISE SECURITY + PERFORMANCE MIGRATION
-- Production-grade Supabase hardening
-- =====================================================

-- =====================================================
-- 1. ADD MISSING COLUMNS SAFELY
-- =====================================================

ALTER TABLE public.order_files
ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id),
ADD COLUMN IF NOT EXISTS uploaded_by TEXT,
ADD COLUMN IF NOT EXISTS scan_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS infected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS scan_attempts INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS scan_error TEXT,
ADD COLUMN IF NOT EXISTS mime_type TEXT,
ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- =====================================================
-- 2. FIX CHECK CONSTRAINT SAFELY
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_order_files_scan_status'
  ) THEN

    ALTER TABLE public.order_files
    ADD CONSTRAINT chk_order_files_scan_status
    CHECK (
      scan_status IN (
        'pending',
        'scanning',
        'clean',
        'infected',
        'failed'
      )
    );

  END IF;
END $$;

-- =====================================================
-- 3. BACKFILL shop_id SAFELY
-- =====================================================

UPDATE public.order_files of
SET shop_id = o.shop_id
FROM public.orders o
WHERE of.order_id = o.id
AND of.shop_id IS NULL;

-- =====================================================
-- 4. PERFORMANCE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_order_files_order_id
ON public.order_files(order_id);

CREATE INDEX IF NOT EXISTS idx_order_files_shop_id
ON public.order_files(shop_id);

CREATE INDEX IF NOT EXISTS idx_order_files_scan_status
ON public.order_files(scan_status);

CREATE INDEX IF NOT EXISTS idx_order_files_created_at
ON public.order_files(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_files_shop_created
ON public.order_files(shop_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_files_storage_path
ON public.order_files(storage_path);

-- =====================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.order_files ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. DROP OLD POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Customers can view their own files"
ON public.order_files;

DROP POLICY IF EXISTS "Shop staff can view shop files"
ON public.order_files;

DROP POLICY IF EXISTS "Admins have full access"
ON public.order_files;

DROP POLICY IF EXISTS "Users can insert own files"
ON public.order_files;

DROP POLICY IF EXISTS "Backend can update files"
ON public.order_files;

DROP POLICY IF EXISTS "Backend can delete files"
ON public.order_files;

-- =====================================================
-- 7. CUSTOMER SELECT POLICY
-- =====================================================

CREATE POLICY "Customers can view their own files"
ON public.order_files
FOR SELECT
USING (
  uploaded_by = auth.uid()::text
);

-- =====================================================
-- 8. SHOP STAFF POLICY
-- =====================================================

CREATE POLICY "Shop staff can view shop files"
ON public.order_files
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.staff
    WHERE staff.shop_id = order_files.shop_id
    AND staff.user_id::text = auth.uid()::text
  )

  OR

  EXISTS (
    SELECT 1
    FROM public.shops
    WHERE shops.id = order_files.shop_id
    AND shops.clerk_owner_id = auth.uid()::text
  )
);

-- =====================================================
-- 9. ADMIN POLICY
-- =====================================================

CREATE POLICY "Admins have full access"
ON public.order_files
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.users
    WHERE users.id::text = auth.uid()::text
    AND users.role = 'admin'
  )
);

-- =====================================================
-- 10. INSERT POLICY
-- =====================================================

CREATE POLICY "Users can insert own files"
ON public.order_files
FOR INSERT
WITH CHECK (
  uploaded_by = auth.uid()::text
);

-- =====================================================
-- 11. BACKEND UPDATE POLICY
-- =====================================================

CREATE POLICY "Backend can update files"
ON public.order_files
FOR UPDATE
USING (
  auth.role() = 'service_role'
);

-- =====================================================
-- 12. BACKEND DELETE POLICY
-- =====================================================

CREATE POLICY "Backend can delete files"
ON public.order_files
FOR DELETE
USING (
  auth.role() = 'service_role'
);

-- =====================================================
-- 13. AUDIT LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.file_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  file_id UUID
  REFERENCES public.order_files(id)
  ON DELETE SET NULL,

  shop_id UUID
  REFERENCES public.shops(id),

  user_id TEXT,

  action TEXT NOT NULL CHECK (
    action IN (
      'upload',
      'download',
      'delete',
      'scan_started',
      'scan_clean',
      'scan_infected',
      'scan_failed'
    )
  ),

  ip_address TEXT,
  details JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 14. AUDIT LOG INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_file_audit_logs_file_id
ON public.file_audit_logs(file_id);

CREATE INDEX IF NOT EXISTS idx_file_audit_logs_shop_id
ON public.file_audit_logs(shop_id);

CREATE INDEX IF NOT EXISTS idx_file_audit_logs_created_at
ON public.file_audit_logs(created_at DESC);

-- =====================================================
-- 15. ENABLE RLS ON AUDIT LOGS
-- =====================================================

ALTER TABLE public.file_audit_logs
ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 16. DROP OLD AUDIT POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Admins can view all audit logs"
ON public.file_audit_logs;

DROP POLICY IF EXISTS "Service role can insert audit logs"
ON public.file_audit_logs;

-- =====================================================
-- 17. SECURE AUDIT LOG POLICIES
-- =====================================================

CREATE POLICY "Admins can view all audit logs"
ON public.file_audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.users
    WHERE users.id::text = auth.uid()::text
    AND users.role = 'admin'
  )
);

CREATE POLICY "Service role can insert audit logs"
ON public.file_audit_logs
FOR INSERT
WITH CHECK (
  auth.role() = 'service_role'
);

-- =====================================================
-- 18. SECURE STORAGE BUCKETS
-- =====================================================

UPDATE storage.buckets
SET public = false
WHERE id IN ('temp-uploads', 'order-files');

-- =====================================================
-- 19. REMOVE OLD PUBLIC STORAGE POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Public Access"
ON storage.objects;

DROP POLICY IF EXISTS "Give public access to order-files"
ON storage.objects;

DROP POLICY IF EXISTS "Give public access to temp-uploads"
ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can access own storage objects"
ON storage.objects;

DROP POLICY IF EXISTS "Users can access only their own storage objects"
ON storage.objects;

DROP POLICY IF EXISTS "Service role full storage access"
ON storage.objects;

-- =====================================================
-- 20. STORAGE POLICY - USER ACCESS
-- =====================================================

CREATE POLICY "Users can access only their own storage objects"
ON storage.objects
FOR SELECT
USING (
  bucket_id IN ('temp-uploads', 'order-files')
  AND owner = auth.uid()::text
);

-- =====================================================
-- 21. STORAGE POLICY - SERVICE ROLE
-- =====================================================

CREATE POLICY "Service role full storage access"
ON storage.objects
FOR ALL
USING (
  auth.role() = 'service_role'
);

-- =====================================================
-- 22. ENABLE RLS ON STORAGE OBJECTS
-- =====================================================

ALTER TABLE storage.objects
ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 23. OPTIONAL: AUTO UPDATE updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_files_updated_at
ON public.order_files;

CREATE TRIGGER trg_order_files_updated_at
BEFORE UPDATE ON public.order_files
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- 24. VERIFY SECURITY
-- =====================================================

-- Verify RLS enabled
ALTER TABLE public.order_files FORCE ROW LEVEL SECURITY;
ALTER TABLE public.file_audit_logs FORCE ROW LEVEL SECURITY;

-- =====================================================
-- DONE
-- =====================================================
