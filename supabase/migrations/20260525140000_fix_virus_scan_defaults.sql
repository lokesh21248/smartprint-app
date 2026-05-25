-- =====================================================
-- SMARTPRINT ENTERPRISE VIRUS SCAN HARDENING MIGRATION
-- Safe defaults for all upload and file entities
-- =====================================================

BEGIN;

-- 1. Hardening order_files table
ALTER TABLE public.order_files
ADD COLUMN IF NOT EXISTS security_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS scan_status text DEFAULT 'pending';

UPDATE public.order_files
SET security_status = 'pending'
WHERE security_status IS NULL;

UPDATE public.order_files
SET scan_status = 'pending'
WHERE scan_status IS NULL;

-- 2. Hardening upload_sessions table
ALTER TABLE public.upload_sessions
ADD COLUMN IF NOT EXISTS security_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS scan_status text DEFAULT 'pending';

UPDATE public.upload_sessions
SET security_status = 'pending'
WHERE security_status IS NULL;

UPDATE public.upload_sessions
SET scan_status = 'pending'
WHERE scan_status IS NULL;

-- 3. Hardening uploaded_files table (generic/fallback support)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'uploaded_files'
  ) THEN
    EXECUTE 'ALTER TABLE public.uploaded_files ADD COLUMN IF NOT EXISTS security_status text DEFAULT ''pending''';
    EXECUTE 'ALTER TABLE public.uploaded_files ADD COLUMN IF NOT EXISTS scan_status text DEFAULT ''pending''';
    EXECUTE 'UPDATE public.uploaded_files SET security_status = ''pending'' WHERE security_status IS NULL';
    EXECUTE 'UPDATE public.uploaded_files SET scan_status = ''pending'' WHERE scan_status IS NULL';
  END IF;
END $$;

COMMIT;
