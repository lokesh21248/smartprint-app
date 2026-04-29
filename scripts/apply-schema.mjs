/**
 * SmartPrint – Apply Full Schema via Direct PostgreSQL Connection
 * 
 * Uses the Supabase direct connection string.
 * Format: postgresql://postgres.[ref]:[password]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
 * 
 * Run: node scripts/apply-schema.mjs
 */

import pg from 'pg';
import { readFileSync } from 'fs';

const { Client } = pg;

// Read env
const envContent = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];

// The DATABASE_URL format for Supabase (pooler - transaction mode)
// User needs to provide DB password from Supabase Dashboard > Settings > Database
const DB_PASSWORD = env.SUPABASE_DB_PASSWORD;

if (!DB_PASSWORD) {
  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log('  ❌  Missing SUPABASE_DB_PASSWORD in .env.local');
  console.log('══════════════════════════════════════════════════════════');
  console.log('');
  console.log('To automatically apply the database schema, do this:');
  console.log('');
  console.log('  1. Go to: https://supabase.com/dashboard/project/eqbqbtpxzbondzxqsncy/settings/database');
  console.log('  2. Copy your "Database Password"');
  console.log('  3. Add this line to your .env.local file:');
  console.log('');
  console.log('     SUPABASE_DB_PASSWORD=your-password-here');
  console.log('');
  console.log('  4. Then run: node scripts/apply-schema.mjs');
  console.log('');
  console.log('  OR: Copy supabase/FULL_SETUP.sql and paste it into:');
  console.log('  https://supabase.com/dashboard/project/eqbqbtpxzbondzxqsncy/sql/new');
  console.log('');
  process.exit(1);
}

// Connection string using Supabase's transaction pooler (port 6543)
const connectionString = `postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;

const SQL = readFileSync('supabase/CLERK_SCHEMA.sql', 'utf8');

const client = new Client({ connectionString });

console.log('🔌 Connecting to Supabase PostgreSQL...');

try {
  await client.connect();
  console.log('✅ Connected!\n');
  console.log('📦 Applying schema...');
  
  await client.query(SQL);
  
  console.log('✅ Schema applied successfully!');
  console.log('\n🔍 Verifying tables...');
  
  const tables = await client.query(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);
  
  console.log('📋 Tables in public schema:');
  tables.rows.forEach(r => console.log(`   ✓ ${r.tablename}`));
  
  await client.end();
  console.log('\n🎉 Database is ready!');
} catch (err) {
  console.error('❌ Error:', err.message);
  if (err.message.includes('password')) {
    console.log('\n⚠️  Check your SUPABASE_DB_PASSWORD in .env.local');
  }
  await client.end().catch(() => {});
  process.exit(1);
}
