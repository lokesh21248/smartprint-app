-- =====================================================
-- SMARTPRINT DATABASE MIGRATION - CREATE SHOP_SETTINGS
-- =====================================================

BEGIN;

-- 1. Create shop_settings table if not exists
CREATE TABLE IF NOT EXISTS public.shop_settings (
  shop_id            UUID PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  sound_alerts       BOOLEAN DEFAULT true,
  notification_sound TEXT DEFAULT 'whatsapp',
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- 2. Add columns if not exists (in case the table existed but was missing columns)
ALTER TABLE public.shop_settings
ADD COLUMN IF NOT EXISTS sound_alerts BOOLEAN DEFAULT true;

ALTER TABLE public.shop_settings
ADD COLUMN IF NOT EXISTS notification_sound TEXT DEFAULT 'whatsapp';

-- 3. Disable Row Level Security (RLS) matching the Clerk authentication model
ALTER TABLE public.shop_settings DISABLE ROW LEVEL SECURITY;

-- 4. Seed settings for any existing shops to ensure they have default values
INSERT INTO public.shop_settings (shop_id, sound_alerts, notification_sound)
SELECT id, true, 'whatsapp'
FROM public.shops
ON CONFLICT (shop_id) DO NOTHING;

COMMIT;
