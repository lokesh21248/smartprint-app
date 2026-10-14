import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const shopId = '7d914133-a97a-4695-bb21-07320fe8c71d';
  
  // Get ALL orders for this shop (no date filter)
  const { data: allOrders, count } = await supabase
    .from('orders')
    .select('id, order_number, status, total_amount, created_at, completed_at, customer_phone, is_color', { count: 'exact' })
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(50);

  console.log(`Total orders for shop: ${count}`);
  console.log('All orders:', JSON.stringify(allOrders, null, 2));
  
  // Check distinct statuses
  const statuses = [...new Set(allOrders?.map(o => o.status))];
  console.log('Distinct statuses:', statuses);
}

main();
