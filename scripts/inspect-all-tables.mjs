import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
  console.log('=== Step 1: Listing All Tables in Public Schema ===');
  
  // Try via run_sql or direct query on known table names
  const knownTables = [
    'shops',
    'shop_staff',
    'orders',
    'order_files',
    'customer_sessions',
    'notifications',
    'daily_summaries',
    'audit_log',
    'job_logs',
    'reviews',
    'print_jobs',
    'scan_logs',
    'file_uploads',
    'otp_verifications',
    'shop_settings',
    'printers',
    'scanners'
  ];

  const existingTables = [];
  for (const table of knownTables) {
    try {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (!error) {
        existingTables.push({ table, count: count ?? 0 });
      } else {
        // Table might not exist or permission error
        if (error.code !== '42P01') { // 42P01 is relation does not exist
          console.log(`Table '${table}' error:`, error.message, error.code);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  console.log('\nDiscovered Tables & Row Counts:');
  for (const t of existingTables) {
    console.log(`  - ${t.table.padEnd(25)} : ${t.count} rows`);
  }

  // Check triggers on orders table
  console.log('\n=== Step 2: Checking Triggers on orders table ===');
  const triggerRpc = await supabase.rpc('run_sql', {
    query: `
      SELECT tgname, proname, tgenabled
      FROM pg_trigger t
      JOIN pg_proc p ON t.tgfoid = p.oid
      WHERE tgrelid = 'orders'::regclass;
    `
  });
  if (triggerRpc.error) {
    console.log('RPC run_sql error (expected if not present):', triggerRpc.error.message);
  } else {
    console.log('Triggers:', triggerRpc.data);
  }

  // Check foreign keys referencing orders
  console.log('\n=== Step 3: Checking Foreign Keys Referencing orders ===');
  const fkRpc = await supabase.rpc('run_sql', {
    query: `
      SELECT
        tc.table_name, kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND ccu.table_name = 'orders';
    `
  });
  if (!fkRpc.error) {
    console.log('Foreign keys pointing to orders:', fkRpc.data);
  }

  // List all tables from information_schema if run_sql works
  const allTablesRpc = await supabase.rpc('run_sql', {
    query: `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `
  });
  if (!allTablesRpc.error) {
    console.log('\nAll Base Tables in public schema (from information_schema):');
    console.log(allTablesRpc.data.map(r => r.table_name));
  }
}

inspect().catch(console.error);
