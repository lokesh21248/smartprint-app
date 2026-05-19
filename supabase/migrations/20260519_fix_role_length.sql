-- Fix: Increase character varying limit for role columns
-- The previous limit was 6, which caused issues when inserting 'shop_owner' (10 chars)

DO $$ 
BEGIN
  -- 1. Profiles Table
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
    ALTER TABLE profiles ALTER COLUMN role TYPE VARCHAR(32);
  END IF;

  -- 2. Shops Table (if it has a role column, though usually it's shop_staff)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shops' AND column_name = 'role') THEN
    ALTER TABLE shops ALTER COLUMN role TYPE VARCHAR(32);
  END IF;

  -- 3. Shop_Staff Table
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_staff' AND column_name = 'role') THEN
    ALTER TABLE shop_staff ALTER COLUMN role TYPE VARCHAR(32);
  END IF;

  -- 4. Onboarding Table
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'onboarding' AND column_name = 'role') THEN
    ALTER TABLE onboarding ALTER COLUMN role TYPE VARCHAR(32);
  END IF;
  
  -- 5. Customer_sessions Table (just in case)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customer_sessions' AND column_name = 'role') THEN
    ALTER TABLE customer_sessions ALTER COLUMN role TYPE VARCHAR(32);
  END IF;

END $$;
