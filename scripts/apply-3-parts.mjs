/**
 * Apply Supabase 3-Part Setup (Schema + RLS + RPC)
 *
 * Reads SUPABASE_DB_PASSWORD from .env.local and runs:
 *   supabase/PART_1_SCHEMA.sql
 *   supabase/PART_2_RLS.sql
 *   supabase/PART_3_RPC.sql
 *
 * Run: node scripts/apply-3-parts.mjs
 */

import pg from 'pg';
import { readFileSync } from 'fs';

const { Client } = pg;

const envContent = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const DB_PASSWORD = env.SUPABASE_DB_PASSWORD;

if (!DB_PASSWORD) {
  console.log('');
  console.log('❌ Missing SUPABASE_DB_PASSWORD in .env.local');
  console.log('');
  console.log('To run automatically:');
  console.log(`  1. Open: https://supabase.com/dashboard/project/${PROJECT_REF}/settings/database`);
  console.log('  2. Copy your "Database Password"');
  console.log('  3. Add to .env.local:  SUPABASE_DB_PASSWORD=your-password-here');
  console.log('  4. Re-run: node scripts/apply-3-parts.mjs');
  console.log('');
  console.log('OR paste each PART_*.sql file into the SQL editor:');
  console.log(`  https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
  console.log('');
  process.exit(1);
}

const connectionString = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;

const PARTS = [
  { name: 'Part 1 — Schema', file: 'supabase/PART_1_SCHEMA.sql' },
  { name: 'Part 2 — RLS Policies', file: 'supabase/PART_2_RLS.sql' },
  { name: 'Part 3 — RPC + Views', file: 'supabase/PART_3_RPC.sql' },
];

const client = new Client({ connectionString });
console.log('🔌 Connecting to Supabase PostgreSQL...');

try {
  await client.connect();
  console.log('✅ Connected!\n');

  for (const part of PARTS) {
    console.log(`▶ Running ${part.name} (${part.file})...`);
    const sql = readFileSync(part.file, 'utf8');
    const result = await client.query(sql);
    const last = Array.isArray(result) ? result[result.length - 1] : result;
    if (last && last.rows && last.rows[0]) {
      console.log(`   ${JSON.stringify(last.rows[0])}`);
    }
    console.log(`✅ ${part.name} done\n`);
  }

  console.log('🔍 Final verification...');
  const checks = [
    { label: 'Tables (expect 6)', q: `SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'` },
    { label: 'RLS-enabled tables (expect 6)', q: `SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true` },
    { label: 'Policies (expect >=13)', q: `SELECT COUNT(*)::int AS n FROM pg_policies WHERE schemaname = 'public'` },
    { label: 'Functions (expect >=17)', q: `SELECT COUNT(*)::int AS n FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname NOT LIKE 'pg_%'` },
    { label: 'Order partitions (expect 6)', q: `SELECT COUNT(*)::int AS n FROM pg_inherits JOIN pg_class p ON pg_inherits.inhparent = p.oid WHERE p.relname = 'orders'` },
  ];

  for (const c of checks) {
    const r = await client.query(c.q);
    console.log(`   ${c.label}: ${r.rows[0].n}`);
  }

  await client.end();
  console.log('\n🎉 All 3 parts applied. Database ready.');
} catch (err) {
  console.error('❌ Error:', err.message);
  if (err.position) console.error('   at SQL position:', err.position);
  await client.end().catch(() => {});
  process.exit(1);
}
