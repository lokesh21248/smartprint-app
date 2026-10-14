import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: shops } = await supabase.from('shops').select('*');
  console.log('Total shops:', shops?.length);
  for (const s of shops || []) {
    const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('shop_id', s.id);
    if (count > 0 || s.clerk_user_id || s.owner_id) {
      console.log(`Shop: "${s.name}" (ID: ${s.id})`);
      console.log(`  clerk_user_id: ${s.clerk_user_id}`);
      console.log(`  owner_id: ${s.owner_id}`);
      console.log(`  total orders: ${count}`);
    }
  }

  // Also check sample order to see all columns
  const { data: sampleOrder } = await supabase.from('orders').select('*').limit(1).single();
  console.log('\nSample Order columns:');
  console.log(Object.keys(sampleOrder || {}));
}

main().catch(console.error);
