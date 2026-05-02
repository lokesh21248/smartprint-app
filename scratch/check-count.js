const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { count, error } = await supabase.from('shops').select('*', { count: 'exact', head: true });
  if (error) console.error(error);
  console.log('Total shops:', count);
}

check();
