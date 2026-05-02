const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase env variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function runAudit() {
  console.log('--- STARTING DATABASE AUDIT ---');

  // Query one record from shops
  const { data: shopRow, error: shopErr } = await supabase.from('shops').select('*').limit(1);
  if (shopErr) {
    console.error('❌ Error reading shops:', shopErr.message);
  } else {
    console.log('✅ Shops table is readable. Data fields in first row:', shopRow.length ? Object.keys(shopRow[0]) : 'No data');
  }

  // Query one record from orders
  const { data: orderRow, error: orderErr } = await supabase.from('orders').select('*').limit(1);
  if (orderErr) {
    console.error('❌ Error reading orders:', orderErr.message);
  } else {
    console.log('✅ Orders table is readable. Data fields in first row:', orderRow.length ? Object.keys(orderRow[0]) : 'No data');
  }

  // We can query the pg_meta endpoint if using supabase CLI, but we don't have that.
  // We can just try selecting the wrong columns to prove the mismatch.
  const { data: mismatchCheck, error: mismatchErr } = await supabase
    .from('shops')
    .select('name, slug, owner_email, price_bw_per_page')
    .limit(1);
  
  if (mismatchErr) {
    console.log('⚠️ Expected mismatch error when querying frontend fields directly:', mismatchErr.message);
  } else {
    console.log('❓ Frontend fields exist in DB?!', mismatchCheck);
  }

}

runAudit();
