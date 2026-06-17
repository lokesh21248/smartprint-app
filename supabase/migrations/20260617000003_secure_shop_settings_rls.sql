-- Migration: Enable Row Level Security and define policies for shop_settings
-- Created: 2026-06-17

-- 1. Enable Row Level Security on shop_settings
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;

-- 2. Clean up any existing policies
DROP POLICY IF EXISTS "owners_select_settings" ON shop_settings;
DROP POLICY IF EXISTS "owners_insert_settings" ON shop_settings;
DROP POLICY IF EXISTS "owners_update_settings" ON shop_settings;

-- 3. Create SELECT policy for authenticated shop owners
CREATE POLICY "owners_select_settings" ON shop_settings
  FOR SELECT
  TO authenticated
  USING (
    shop_id IN (
      SELECT id FROM shops WHERE clerk_owner_id = (auth.jwt() ->> 'sub')
    )
  );

-- 4. Create INSERT policy for authenticated shop owners
CREATE POLICY "owners_insert_settings" ON shop_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    shop_id IN (
      SELECT id FROM shops WHERE clerk_owner_id = (auth.jwt() ->> 'sub')
    )
  );

-- 5. Create UPDATE policy for authenticated shop owners
CREATE POLICY "owners_update_settings" ON shop_settings
  FOR UPDATE
  TO authenticated
  USING (
    shop_id IN (
      SELECT id FROM shops WHERE clerk_owner_id = (auth.jwt() ->> 'sub')
    )
  )
  WITH CHECK (
    shop_id IN (
      SELECT id FROM shops WHERE clerk_owner_id = (auth.jwt() ->> 'sub')
    )
  );
