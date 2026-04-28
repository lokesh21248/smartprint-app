import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Read .env.local manually
const envContent = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log('🔍 Checking Supabase Database...\n');

  // Check shops table
  const { data: shops, error: shopErr } = await supabase.from('shops').select('id, shop_name, shop_code, owner_id').limit(5);
  if (shopErr) {
    console.error('❌ shops table error:', shopErr.message);
  } else {
    console.log(`✅ shops table: ${shops.length} shop(s) found`);
    shops.forEach(s => console.log(`   → ${s.shop_name} | code: ${s.shop_code} | id: ${s.id}`));
  }

  // Check orders table columns
  const { data: orders, error: orderErr } = await supabase
    .from('orders')
    .select('id, status, customer_name, customer_phone, short_token')
    .limit(3);
  if (orderErr) {
    if (orderErr.message.includes('customer_name')) {
      console.error('\n❌ orders table MISSING new columns (customer_name, customer_phone, short_token)');
      console.log('   → You need to run the SQL migration!');
    } else {
      console.error('\n❌ orders table error:', orderErr.message);
    }
  } else {
    console.log(`\n✅ orders table has guest columns: customer_name, customer_phone, short_token`);
    console.log(`   → ${orders.length} order(s) sampled`);
  }

  // Check otp_verifications table
  const { error: otpErr } = await supabase.from('otp_verifications').select('id').limit(1);
  if (otpErr) {
    console.error('\n❌ otp_verifications table MISSING');
    console.log('   → You need to run the SQL migration!');
  } else {
    console.log('\n✅ otp_verifications table exists');
  }

  // Auth users
  const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    console.error('\n❌ Auth error:', authErr.message);
  } else {
    console.log(`\n✅ Auth: ${users.length} user(s) registered`);
    users.slice(0, 3).forEach(u => console.log(`   → ${u.email}`));
  }

  console.log('\n--- Check Complete ---');
}

check();
