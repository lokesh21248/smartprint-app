/**
 * SmartPrint – Apply SQL via Supabase REST API
 * Uses the pg_query RPC endpoint available on all Supabase projects.
 * Run: node scripts/apply-sql.mjs
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Read env
const envContent = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_REF = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');

console.log(`\n🚀 SmartPrint Database Setup`);
console.log(`📡 Project: ${PROJECT_REF}\n`);

// The SQL to apply — broken into individual statements for reliability
const statements = [
  // ── orders table ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    customer_id UUID REFERENCES auth.users(id),
    customer_name TEXT,
    customer_phone TEXT,
    short_token TEXT UNIQUE,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    files JSONB NOT NULL DEFAULT '[]',
    print_config JSONB NOT NULL DEFAULT '{}',
    special_instructions TEXT,
    total_pages INT NOT NULL DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'placed'
      CHECK (status IN ('placed','accepted','printing','ready','completed','cancelled','rejected')),
    status_history JSONB DEFAULT '[]',
    estimated_completion TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // If orders table already exists, add the missing columns
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS short_token TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS files JSONB`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_config JSONB`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_completion TIMESTAMPTZ`,

  // ── Indexes ────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON orders(shop_id, status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_short_token ON orders(short_token)`,

  // ── otp_verifications table ────────────────────────────────
  `CREATE TABLE IF NOT EXISTS otp_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INT DEFAULT 0,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_verifications(phone)`,

  // ── shop_staff table ───────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS shop_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner','manager','staff')),
    permissions JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(shop_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_staff_shop ON shop_staff(shop_id)`,
  `CREATE INDEX IF NOT EXISTS idx_staff_user ON shop_staff(user_id)`,

  // ── notifications table ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_order_id UUID,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC)`,

  // ── reviews table ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id),
    customer_id UUID REFERENCES auth.users(id),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_shop ON reviews(shop_id, created_at DESC)`,

  // ── updated_at trigger ─────────────────────────────────────
  `CREATE OR REPLACE FUNCTION update_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql`,

  `DROP TRIGGER IF EXISTS orders_updated_at ON orders`,
  `CREATE TRIGGER orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at()`,

  // ── Shop code functions ────────────────────────────────────
  `CREATE OR REPLACE FUNCTION generate_unique_shop_code()
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
      IF NOT exists_check THEN RETURN result; END IF;
      attempts := attempts + 1;
      IF attempts > 100 THEN RAISE EXCEPTION 'Could not generate unique code'; END IF;
    END LOOP;
  END;
  $$ LANGUAGE plpgsql`,

  `CREATE OR REPLACE FUNCTION increment_qr_scan(p_shop_id UUID)
  RETURNS VOID AS $$
  BEGIN
    UPDATE shops SET qr_scan_count = qr_scan_count + 1 WHERE id = p_shop_id;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER`,

  `CREATE OR REPLACE FUNCTION find_shop_by_code(p_code TEXT)
  RETURNS TABLE(id UUID, shop_name TEXT, address TEXT, city TEXT, is_active BOOLEAN) AS $$
  BEGIN
    UPDATE shops SET code_use_count = code_use_count + 1
    WHERE shop_code = UPPER(p_code) AND is_active = true;
    RETURN QUERY
    SELECT s.id, s.shop_name, s.address, s.city, s.is_active
    FROM shops s WHERE s.shop_code = UPPER(p_code);
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER`,

  // ── Enable RLS ─────────────────────────────────────────────
  `ALTER TABLE orders ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE notifications ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE reviews ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY`,

  // ── Drop old policies ──────────────────────────────────────
  `DROP POLICY IF EXISTS "Shop staff view orders" ON orders`,
  `DROP POLICY IF EXISTS "Shop staff update orders" ON orders`,
  `DROP POLICY IF EXISTS "Anyone can insert orders" ON orders`,
  `DROP POLICY IF EXISTS "Anyone can view order by short token" ON orders`,
  `DROP POLICY IF EXISTS "Users view own notifications" ON notifications`,
  `DROP POLICY IF EXISTS "Users update own notifications" ON notifications`,
  `DROP POLICY IF EXISTS "Owners manage staff" ON shop_staff`,
  `DROP POLICY IF EXISTS "Shop staff view reviews" ON reviews`,
  `DROP POLICY IF EXISTS "Service role can manage OTP" ON otp_verifications`,

  // ── RLS Policies ───────────────────────────────────────────
  `CREATE POLICY "Shop staff view orders" ON orders
    FOR SELECT USING (
      shop_id IN (
        SELECT id FROM shops WHERE owner_id = auth.uid()
        UNION
        SELECT shop_id FROM shop_staff WHERE user_id = auth.uid()
      )
    )`,

  `CREATE POLICY "Shop staff update orders" ON orders
    FOR UPDATE USING (
      shop_id IN (
        SELECT id FROM shops WHERE owner_id = auth.uid()
        UNION
        SELECT shop_id FROM shop_staff WHERE user_id = auth.uid()
      )
    )`,

  `CREATE POLICY "Anyone can insert orders" ON orders
    FOR INSERT TO anon, authenticated WITH CHECK (true)`,

  `CREATE POLICY "Anyone can view order by short token" ON orders
    FOR SELECT TO anon, authenticated
    USING (short_token IS NOT NULL)`,

  `CREATE POLICY "Users view own notifications" ON notifications
    FOR SELECT USING (user_id = auth.uid())`,

  `CREATE POLICY "Users update own notifications" ON notifications
    FOR UPDATE USING (user_id = auth.uid())`,

  `CREATE POLICY "Owners manage staff" ON shop_staff
    FOR ALL USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()))`,

  `CREATE POLICY "Shop staff view reviews" ON reviews
    FOR SELECT USING (
      shop_id IN (
        SELECT id FROM shops WHERE owner_id = auth.uid()
        UNION
        SELECT shop_id FROM shop_staff WHERE user_id = auth.uid()
      )
    )`,

  `CREATE POLICY "Service role can manage OTP" ON otp_verifications
    FOR ALL TO service_role USING (true) WITH CHECK (true)`,

  // ── Realtime ───────────────────────────────────────────────
  `ALTER PUBLICATION supabase_realtime ADD TABLE orders`,
];

// Apply using Supabase REST API (pg endpoint)
async function runSQL(sql) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ sql }),
  });

  if (!response.ok) {
    // Fallback: try the management endpoint
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

// Alternative: use supabase-js with raw query via rpc
async function runSQLViaRPC(sql) {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  if (error) throw error;
  return data;
}

// Best approach: use the Supabase PostgREST SQL endpoint directly
async function executeSQL(sql) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ query: sql }),
  });
  return response;
}

async function applyViaFetch(sql, label) {
  // Use the pg endpoint (available on all Supabase projects via management API)
  // Alternatively, apply via supabase-js
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false }
  });
  
  // Try creating table by inserting if needed, or just use direct DB call
  const { error } = await supabase.from('_migrations_').select('id').limit(1);
  
  // Use raw REST API - Supabase exposes a /pg endpoint for service_role
  const resp = await fetch(`${SUPABASE_URL}/pg`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  
  if (resp.ok) {
    return { ok: true };
  }
  
  return { ok: false, error: await resp.text() };
}

// Main execution - use the Supabase DB directly via REST
async function main() {
  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i].trim();
    const label = sql.split('\n')[0].substring(0, 60) + '...';
    
    try {
      // Use the Supabase query endpoint
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
      });
      
      if (resp.ok || resp.status === 404) {
        // 404 means exec_sql function doesn't exist — try alternative
        if (resp.status === 404) {
          throw new Error('exec_sql not available');
        }
        process.stdout.write(`✅ [${i+1}/${statements.length}] OK\n`);
        successCount++;
      } else {
        const body = await resp.text();
        if (body.includes('already exists') || body.includes('does not exist') && sql.includes('DROP')) {
          process.stdout.write(`⚠️  [${i+1}/${statements.length}] Skipped (already applied)\n`);
          successCount++;
        } else {
          process.stdout.write(`❌ [${i+1}/${statements.length}] Error: ${body.substring(0, 100)}\n`);
          errors.push({ index: i+1, sql: label, error: body });
          errorCount++;
        }
      }
    } catch (e) {
      // If exec_sql RPC doesn't exist, we need to use management API
      process.stdout.write(`❌ [${i+1}/${statements.length}] ${e.message}\n`);
      errors.push({ index: i+1, error: e.message });
      errorCount++;
      break;
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors:  ${errorCount}`);
  
  if (errors.length > 0) {
    console.log('\n── Errors detail ──');
    errors.forEach(e => console.log(`[${e.index}] ${e.error?.substring(0, 200)}`));
  }
}

main().catch(console.error);
