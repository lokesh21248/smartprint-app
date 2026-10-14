import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: shops } = await supabase.from('shops').select('id, name, owner_email').limit(5);
  console.log('Shops:', shops);

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, shop_id, status, total_amount, created_at, updated_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('Recent Orders:', orders);
  if (error) console.error('Error fetching orders:', error);
}

main();
