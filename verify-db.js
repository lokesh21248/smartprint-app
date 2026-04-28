const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase env variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function verify() {
  console.log('Verifying Database...');

  // Check auth user
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error('Auth Error:', authError);
  } else {
    const admin = users.find(u => u.email === 'admin@smartprint.com');
    if (admin) {
      console.log('Admin User Found:', admin.id, admin.email);
    } else {
      console.log('Admin User NOT FOUND');
    }
  }

  // Check shop
  const { data: shops, error: shopError } = await supabase
    .from('shops')
    .select('*');

  if (shopError) {
    console.error('Shop Error:', shopError);
  } else {
    console.log('Shops in DB:', shops.length);
    shops.forEach(s => {
      console.log(`- Shop: ${s.shop_name} | Code: ${s.shop_code} | QR: ${s.qr_code_url} | Owner: ${s.owner_id}`);
    });
  }
}

verify();
