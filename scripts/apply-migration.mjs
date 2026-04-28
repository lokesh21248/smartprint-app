/**
 * SmartPrint – Apply DB via Supabase Management API
 * 
 * The Management API allows executing arbitrary SQL using a Personal Access Token.
 * 
 * HOW TO GET YOUR TOKEN:
 * 1. Go to https://supabase.com/dashboard/account/tokens
 * 2. Click "Generate new token"  
 * 3. Copy the token and set it below, OR pass as env: SUPABASE_ACCESS_TOKEN=your_token node scripts/apply-migration.mjs
 * 
 * Run: SUPABASE_ACCESS_TOKEN=sbp_xxxx node scripts/apply-migration.mjs
 */

import { readFileSync } from 'fs';

// Read .env.local
const envContent = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PROJECT_REF = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN not set!');
  console.error('\nTo get your token:');
  console.error('1. Go to https://supabase.com/dashboard/account/tokens');
  console.error('2. Click "Generate new token"');
  console.error('3. Run: SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/apply-migration.mjs\n');
  process.exit(1);
}

const SQL = `
-- ── Add guest columns to orders (if not already present) ──
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS short_token TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_completion TIMESTAMPTZ;

-- Make short_token unique if data allows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_short_token_key'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_short_token_key UNIQUE (short_token);
  END IF;
END $$;

-- ── Create otp_verifications ──
CREATE TABLE IF NOT EXISTS otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_verifications(phone);

-- ── Create shop_staff ──
CREATE TABLE IF NOT EXISTS shop_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','staff')),
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_shop ON shop_staff(shop_id);
CREATE INDEX IF NOT EXISTS idx_staff_user ON shop_staff(user_id);

-- ── Create notifications ──
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_order_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

-- ── Create reviews ──
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  customer_id UUID REFERENCES auth.users(id),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reviews_shop ON reviews(shop_id, created_at DESC);

-- ── updated_at trigger for orders ──
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Shop helper functions ──
CREATE OR REPLACE FUNCTION increment_qr_scan(p_shop_id UUID)
RETURNS VOID AS $$
BEGIN UPDATE shops SET qr_scan_count = qr_scan_count + 1 WHERE id = p_shop_id; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION find_shop_by_code(p_code TEXT)
RETURNS TABLE(id UUID, shop_name TEXT, address TEXT, city TEXT, is_active BOOLEAN) AS $$
BEGIN
  UPDATE shops SET code_use_count = code_use_count + 1
  WHERE shop_code = UPPER(p_code) AND is_active = true;
  RETURN QUERY
  SELECT s.id, s.shop_name, s.address, s.city, s.is_active
  FROM shops s WHERE s.shop_code = UPPER(p_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Indexes for orders ──
CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON orders(shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_short_token ON orders(short_token);

-- ── RLS ──
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies cleanly
DROP POLICY IF EXISTS "Shop staff view orders" ON orders;
DROP POLICY IF EXISTS "Shop staff update orders" ON orders;
DROP POLICY IF EXISTS "Anyone can insert orders" ON orders;
DROP POLICY IF EXISTS "Anyone can view order by short token" ON orders;

CREATE POLICY "Shop staff view orders" ON orders
  FOR SELECT USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()
    UNION SELECT shop_id FROM shop_staff WHERE user_id = auth.uid())
  );

CREATE POLICY "Shop staff update orders" ON orders
  FOR UPDATE USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()
    UNION SELECT shop_id FROM shop_staff WHERE user_id = auth.uid())
  );

CREATE POLICY "Anyone can insert orders" ON orders
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Anyone can view order by short token" ON orders
  FOR SELECT TO anon, authenticated
  USING (short_token IS NOT NULL);

DROP POLICY IF EXISTS "Users view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners manage staff" ON shop_staff;
CREATE POLICY "Owners manage staff" ON shop_staff
  FOR ALL USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Service role can manage OTP" ON otp_verifications;
CREATE POLICY "Service role can manage OTP" ON otp_verifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Realtime ──
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

SELECT 'Migration complete!' AS result;
`;

async function applyMigration() {
  console.log(`\n🚀 Applying SmartPrint migration to project: ${PROJECT_REF}\n`);

  const resp = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ query: SQL }),
    }
  );

  const body = await resp.text();

  if (resp.ok) {
    console.log('✅ Migration applied successfully!\n');
    try { console.log(JSON.stringify(JSON.parse(body), null, 2)); } 
    catch { console.log(body); }
  } else {
    console.error(`❌ Failed (HTTP ${resp.status}):\n${body}`);
    process.exit(1);
  }
}

applyMigration().catch(console.error);
