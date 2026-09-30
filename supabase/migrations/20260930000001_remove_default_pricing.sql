-- Drop dependent view first
DROP VIEW IF EXISTS shop_profiles CASCADE;

-- Drop legacy check constraints
ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_price_bw_per_page_check;
ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_price_color_per_page_check;

-- Drop default values so newly created shops do not get automatic 200 / 1000
ALTER TABLE shops ALTER COLUMN price_bw_per_page DROP DEFAULT;
ALTER TABLE shops ALTER COLUMN price_color_per_page DROP DEFAULT;

-- Allow NULL so shops that haven't set prices start empty
ALTER TABLE shops ALTER COLUMN price_bw_per_page DROP NOT NULL;
ALTER TABLE shops ALTER COLUMN price_color_per_page DROP NOT NULL;

-- Support fractional pricing (e.g. ₹1.50, ₹2.50 per page)
ALTER TABLE shops ALTER COLUMN price_bw_per_page TYPE NUMERIC(10,2);
ALTER TABLE shops ALTER COLUMN price_color_per_page TYPE NUMERIC(10,2);

-- Check constraints allowing NULL or non-negative values
ALTER TABLE shops ADD CONSTRAINT shops_price_bw_per_page_check CHECK (price_bw_per_page IS NULL OR price_bw_per_page >= 0);
ALTER TABLE shops ADD CONSTRAINT shops_price_color_per_page_check CHECK (price_color_per_page IS NULL OR price_color_per_page >= 0);

-- Clear legacy default prices (200 / 1000) from shops that never set custom pricing
UPDATE shops 
SET price_bw_per_page = NULL, price_color_per_page = NULL 
WHERE price_bw_per_page = 200 AND price_color_per_page = 1000;

-- Recreate shop_profiles view
CREATE OR REPLACE VIEW shop_profiles AS
 SELECT id,
    clerk_owner_id,
    name,
    slug,
    shop_code,
    owner_name,
    owner_email,
    owner_phone,
    alternate_phone,
    address_line1,
    address_line2,
    city,
    state,
    pincode,
    lat,
    lng,
    price_bw_per_page,
    price_color_per_page,
    price_double_sided_discount_pct,
    shop_photo_url,
    qr_code_url,
    business_hours,
    is_approved,
    is_open,
    is_active,
    approved_at,
    approved_by_clerk_id,
    suspension_reason,
    total_orders,
    qr_scan_count,
    created_at,
    updated_at,
    last_login_at,
    owner_id
   FROM shops;
