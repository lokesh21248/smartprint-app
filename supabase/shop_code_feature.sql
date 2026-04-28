ALTER TABLE shops ADD COLUMN IF NOT EXISTS shop_code VARCHAR(6) UNIQUE;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS qr_code_url TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS qr_scan_count INT DEFAULT 0;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS code_use_count INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_shops_code ON shops(shop_code);

CREATE OR REPLACE FUNCTION generate_unique_shop_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
  attempts INT := 0;
  exists_check BOOLEAN;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    
    SELECT EXISTS(SELECT 1 FROM shops WHERE shop_code = result) INTO exists_check;
    
    IF NOT exists_check THEN
      RETURN result;
    END IF;
    
    attempts := attempts + 1;
    IF attempts > 100 THEN
      RAISE EXCEPTION 'Could not generate unique shop code after 100 attempts';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION setup_shop_codes()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.shop_code IS NULL THEN
    NEW.shop_code := generate_unique_shop_code();
  END IF;
  
  IF NEW.qr_code_url IS NULL THEN
    NEW.qr_code_url := 'https://smartprint.app/shop/' || NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_setup_shop_codes ON shops;
CREATE TRIGGER auto_setup_shop_codes
  BEFORE INSERT ON shops
  FOR EACH ROW
  EXECUTE FUNCTION setup_shop_codes();

UPDATE shops 
SET shop_code = generate_unique_shop_code()
WHERE shop_code IS NULL;

UPDATE shops 
SET qr_code_url = 'https://smartprint.app/shop/' || id 
WHERE qr_code_url IS NULL;

CREATE OR REPLACE FUNCTION increment_qr_scan(p_shop_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE shops SET qr_scan_count = qr_scan_count + 1 WHERE id = p_shop_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION find_shop_by_code(p_code TEXT)
RETURNS TABLE(
  id UUID,
  shop_name TEXT,
  address TEXT,
  city TEXT,
  is_active BOOLEAN
) AS $$
BEGIN
  UPDATE shops 
  SET code_use_count = code_use_count + 1 
  WHERE shop_code = UPPER(p_code) AND is_active = true;
  
  RETURN QUERY
  SELECT s.id, s.shop_name, s.address, s.city, s.is_active
  FROM shops s
  WHERE s.shop_code = UPPER(p_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "Public can view active shops by ID" ON shops;
CREATE POLICY "Public can view active shops by ID"
ON shops FOR SELECT
TO anon, authenticated
USING (is_active = true);
