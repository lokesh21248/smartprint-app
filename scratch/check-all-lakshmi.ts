import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const shopId = '7d914133-a97a-4695-bb21-07320fe8c71d';
  const { data: allOrders } = await supabase
    .from('orders')
    .select('id, order_number, status, total_amount, created_at, updated_at, completed_at, customer_phone')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });

  console.log(`Total orders for Lakshmi: ${allOrders?.length}`);
  console.log('Sample of Lakshmi orders:', allOrders?.slice(0, 10));
}

main();
