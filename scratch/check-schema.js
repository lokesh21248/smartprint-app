const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function check() {
  const { data, error } = await supabase.from('shops').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Columns:', Object.keys(data[0] || {}));
    console.log('Sample data:', data[0]);
  }
}

check();
