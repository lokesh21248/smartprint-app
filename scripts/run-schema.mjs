/**
 * SmartPrint — Apply Schema via Supabase pg endpoint
 * 
 * This script uses the undocumented but supported /pg endpoint
 * that Supabase exposes for service_role connections.
 * 
 * Run: node scripts/run-schema.mjs
 */

import { readFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/['"]/g, '');
}

const SUPABASE_URL   = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY    = env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_REF    = new URL(SUPABASE_URL).hostname.split('.')[0];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

console.log(`\n🚀  SmartPrint Schema Migration`);
console.log(`📡  Project: ${PROJECT_REF}\n`);

// ─── SQL statements (idempotent — safe to re-run) ──────────────────────────
const STATEMENTS = [
  // Extensions
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,

  // ── shops ──────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS shops (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    shop_name     TEXT NOT NULL,
    address       TEXT NOT NULL DEFAULT '',
    city          TEXT NOT NULL DEFAULT '',
    state         TEXT NOT NULL DEFAULT '',
    pincode       TEXT NOT NULL DEFAULT '',
    phone         TEXT NOT NULL DEFAULT '',
    email         TEXT,
    photos        TEXT[]   DEFAULT '{}',
    services      TEXT[]   DEFAULT '{}',
    pricing       JSONB    NOT NULL DEFAULT '{}',
    timings       JSONB    NOT NULL DEFAULT '{}',
    rating_avg    DECIMAL(3,2) DEFAULT 0,
    total_reviews INT      DEFAULT 0,
    total_orders  INT      DEFAULT 0,
    is_approved   BOOLEAN  DEFAULT false,
    is_open       BOOLEAN  DEFAULT true,
    is_active     BOOLEAN  DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_shops_owner  ON shops(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_shops_active ON shops(is_active, is_approved, is_open)`,

  // ── orders ─────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS orders (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number         TEXT UNIQUE NOT NULL,
    short_token          TEXT UNIQUE,
    customer_id          UUID REFERENCES auth.users(id),
    customer_name        TEXT,
    customer_phone       TEXT,
    shop_id              UUID REFERENCES shops(id) ON DELETE CASCADE,
    files                JSONB NOT NULL DEFAULT '[]',
    print_config         JSONB NOT NULL DEFAULT '{}',
    special_instructions TEXT,
    total_pages          INT           NOT NULL DEFAULT 0,
    total_amount         DECIMAL(10,2) NOT NULL DEFAULT 0,
    status               TEXT NOT NULL DEFAULT 'placed'
                           CHECK (status IN ('placed','accepted','printing','ready','completed','cancelled','rejected')),
    status_history       JSONB DEFAULT '[]',
    estimated_completion TIMESTAMPTZ,
    rejection_reason     TEXT,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
  )`,
  // Add guest columns if the table already existed without them
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name  TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS short_token    TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_orders_shop_status  ON orders(shop_id, status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_short_token  ON orders(short_token) WHERE short_token IS NOT NULL`,

  // ── otp_verifications ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS otp_verifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone      TEXT NOT NULL,
    code_hash  TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts   INT DEFAULT 0,
    verified   BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_otp_phone   ON otp_verifications(phone)`,
  `CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications(expires_at)`,

  // ── shop_staff ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS shop_staff (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id    UUID REFERENCES shops(id) ON DELETE CASCADE,
    user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('owner','manager','staff')),
    permissions JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(shop_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_staff_shop ON shop_staff(shop_id)`,
  `CREATE INDEX IF NOT EXISTS idx_staff_user ON shop_staff(user_id)`,

  // ── notifications ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS notifications (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type             TEXT NOT NULL,
    title            TEXT NOT NULL,
    message          TEXT NOT NULL,
    related_order_id UUID,
    is_read          BOOLEAN DEFAULT false,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC)`,

  // ── reviews ─────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS reviews (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID REFERENCES orders(id),
    customer_id UUID REFERENCES auth.users(id),
    shop_id     UUID REFERENCES shops(id) ON DELETE CASCADE,
    rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_shop ON reviews(shop_id, created_at DESC)`,

  // ── updated_at trigger ─────────────────────────────────────────────────────
  `CREATE OR REPLACE FUNCTION update_updated_at()
   RETURNS TRIGGER AS $$
   BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
   $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS orders_updated_at ON orders`,
  `CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at()`,
  `DROP TRIGGER IF EXISTS shops_updated_at ON shops`,
  `CREATE TRIGGER shops_updated_at BEFORE UPDATE ON shops FOR EACH ROW EXECUTE FUNCTION update_updated_at()`,

  // ── RLS ────────────────────────────────────────────────────────────────────
  `ALTER TABLE shops            ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE orders           ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE shop_staff       ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE notifications    ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY`,

  // shops policies
  `DROP POLICY IF EXISTS "Owners view own shops"    ON shops`,
  `DROP POLICY IF EXISTS "Owners update own shops"  ON shops`,
  `DROP POLICY IF EXISTS "Owners insert shops"      ON shops`,
  `DROP POLICY IF EXISTS "Public view active shops" ON shops`,
  `CREATE POLICY "Owners view own shops"    ON shops FOR SELECT              USING (owner_id = auth.uid())`,
  `CREATE POLICY "Owners update own shops"  ON shops FOR UPDATE              USING (owner_id = auth.uid())`,
  `CREATE POLICY "Owners insert shops"      ON shops FOR INSERT WITH CHECK (owner_id = auth.uid())`,
  `CREATE POLICY "Public view active shops" ON shops FOR SELECT              USING (is_active = true AND is_approved = true)`,

  // orders policies
  `DROP POLICY IF EXISTS "Shop staff view orders"            ON orders`,
  `DROP POLICY IF EXISTS "Shop staff update orders"          ON orders`,
  `DROP POLICY IF EXISTS "Anyone insert orders"              ON orders`,
  `DROP POLICY IF EXISTS "Guests view own orders by token"   ON orders`,
  `DROP POLICY IF EXISTS "Anyone can insert orders"          ON orders`,
  `DROP POLICY IF EXISTS "Anyone can view order by short token" ON orders`,
  `CREATE POLICY "Shop staff view orders" ON orders FOR SELECT USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM shop_staff WHERE user_id = auth.uid()
    )
    OR short_token IS NOT NULL
  )`,
  `CREATE POLICY "Shop staff update orders" ON orders FOR UPDATE USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM shop_staff WHERE user_id = auth.uid()
    )
  )`,
  `CREATE POLICY "Anyone insert orders" ON orders FOR INSERT TO anon, authenticated WITH CHECK (true)`,

  // otp policies
  `DROP POLICY IF EXISTS "Service role only otp"        ON otp_verifications`,
  `DROP POLICY IF EXISTS "Service role manages OTPs"    ON otp_verifications`,
  `DROP POLICY IF EXISTS "Service role can manage OTP"  ON otp_verifications`,
  `CREATE POLICY "Service role only otp" ON otp_verifications FOR ALL TO service_role USING (true)`,

  // staff / notifications / reviews policies
  `DROP POLICY IF EXISTS "Owners manage staff"       ON shop_staff`,
  `CREATE POLICY "Owners manage staff" ON shop_staff FOR ALL USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()))`,
  `DROP POLICY IF EXISTS "Users view own notifications"   ON notifications`,
  `DROP POLICY IF EXISTS "Users update own notifications" ON notifications`,
  `CREATE POLICY "Users view own notifications"   ON notifications FOR SELECT USING (user_id = auth.uid())`,
  `CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (user_id = auth.uid())`,
  `DROP POLICY IF EXISTS "Shop staff view reviews" ON reviews`,
  `CREATE POLICY "Shop staff view reviews" ON reviews FOR SELECT USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM shop_staff WHERE user_id = auth.uid()
    )
  )`,

  // ── Realtime ───────────────────────────────────────────────────────────────
  `ALTER PUBLICATION supabase_realtime ADD TABLE orders`,
];

// ─── Execute each statement via the Supabase pg REST endpoint ─────────────
async function exec(sql, label) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer':        'params=single-object',
    },
    body: JSON.stringify({ query: sql }),
  });

  // Supabase pg endpoint: POST to /rest/v1/ with raw query
  // If that doesn't work, fall back to the management API
  if (resp.status === 404 || resp.status === 405) {
    // Try management API
    const mgmtUrl = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
    const mgmt = await fetch(mgmtUrl, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    return { status: mgmt.status, text: await mgmt.text() };
  }

  return { status: resp.status, text: await resp.text() };
}

let ok = 0, fail = 0;
for (let i = 0; i < STATEMENTS.length; i++) {
  const sql   = STATEMENTS[i].trim();
  const label = sql.split('\n')[0].slice(0, 70);
  try {
    const { status, text } = await exec(sql, label);
    const isOk = status >= 200 && status < 300;
    const isAlreadyExists = text.includes('already exists');
    const isNotExists     = text.includes('does not exist') && sql.startsWith('DROP');
    if (isOk || isAlreadyExists || isNotExists) {
      console.log(`✅ [${i + 1}/${STATEMENTS.length}] ${label}`);
      ok++;
    } else {
      console.error(`❌ [${i + 1}/${STATEMENTS.length}] ${label}`);
      console.error(`   Status ${status}: ${text.slice(0, 200)}`);
      fail++;
    }
  } catch (e) {
    console.error(`💥 [${i + 1}/${STATEMENTS.length}] ${label}: ${e.message}`);
    fail++;
  }
}

console.log(`\n── Done ──  ✅ ${ok} succeeded  ❌ ${fail} failed\n`);
if (fail > 0) {
  console.log('👉  If you see auth errors, paste reset-schema.sql into the Supabase SQL Editor manually.');
}
