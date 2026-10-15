import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import fs from 'fs';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const QUARANTINE_SHOP_ID = '56abcddb-ef7b-49f4-9b68-73024511a1c4';

async function quarantineTestData() {
  console.log('=== Step 1: Identifying all test and dummy orders ===');

  const seedNames = new Set([
    'Sai Kiran', 'Priya Sharma', 'Rahul Reddy', 'Ananya Verma',
    'Manoj Kumar', 'Divya Sri', 'Karthik Raja', 'Sneha Patel',
    'Venkat Rao', 'Lakshmi Prasanna', 'Harish Babu', 'Tejaswini',
    'Naveen Chandra', 'Bhavani Shankar', 'Swathi Krishna'
  ]);

  const { data: allOrders, error } = await supabase
    .from('orders')
    .select('*');

  if (error) {
    console.error('Failed to fetch orders:', error);
    process.exit(1);
  }

  const testOrders = allOrders.filter(o =>
    seedNames.has(o.customer_name) ||
    /test/i.test(o.customer_name || '') ||
    /dummy/i.test(o.customer_name || '') ||
    ['9999999999', '1234567890', '9876543210'].includes(o.customer_phone)
  );

  console.log(`Found ${testOrders.length} test/dummy orders to quarantine.`);

  // Save backup to scratch/backup-seed-orders.json
  const backupDir = resolve(process.cwd(), 'scratch');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupPath = resolve(backupDir, 'backup-seed-orders.json');
  fs.writeFileSync(backupPath, JSON.stringify(testOrders, null, 2), 'utf8');
  console.log(`Backup of all ${testOrders.length} test orders saved to ${backupPath}`);

  const testIds = testOrders.map(o => o.id);

  console.log('\n=== Step 2: Quarantining test orders from live shops ===');
  let quarantinedCount = 0;
  for (let i = 0; i < testIds.length; i += 50) {
    const chunk = testIds.slice(i, i + 50);
    const { data: updOrders, error: updErr } = await supabase
      .from('orders')
      .update({
        shop_id: QUARANTINE_SHOP_ID,
        deleted_at: new Date().toISOString(),
        notes: '[TEST_DATA_REMOVED_FROM_FRONTEND]'
      })
      .in('id', chunk)
      .select('id');

    if (updErr) {
      console.error(`Error updating chunk ${i}:`, updErr);
    } else {
      quarantinedCount += updOrders?.length ?? 0;
    }
  }

  console.log(`Successfully quarantined ${quarantinedCount} test/dummy orders!`);

  // Verify Xerox Lakshmi orders
  const lakshmiId = '7d914133-a97a-4695-bb21-07320fe8c71d';
  const { data: lakshmiOrders } = await supabase
    .from('orders')
    .select('id, customer_name, customer_phone, total_amount, status, created_at')
    .eq('shop_id', lakshmiId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  console.log(`\nXerox Lakshmi active real orders count: ${lakshmiOrders?.length}`);
  console.log('Sample Xerox Lakshmi active real orders:');
  (lakshmiOrders || []).slice(0, 5).forEach(o => {
    console.log(`  - ${o.customer_name} | ${o.customer_phone} | ₹${o.total_amount} | ${o.status} | ${o.created_at}`);
  });
}

quarantineTestData().catch(console.error);
