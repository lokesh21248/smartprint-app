import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const shopId = '7d914133-a97a-4695-bb21-07320fe8c71d';
  const { data: completed } = await supabase
    .from('orders')
    .select('id, order_number, status, total_amount, created_at, updated_at, completed_at')
    .eq('shop_id', shopId)
    .in('status', ['COMPLETED', 'completed', 'SUCCESS', 'success']);

  console.log(`Completed orders count: ${completed?.length}`);
  console.log('Sample completed orders:', completed?.slice(0, 5));
}

main();
