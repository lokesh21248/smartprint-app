import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const shopId = '7d914133-a97a-4695-bb21-07320fe8c71d';
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, status, total_amount, created_at, updated_at, completed_at, customer_phone')
    .eq('shop_id', shopId)
    .gte('created_at', '2026-10-01T00:00:00Z')
    .order('created_at', { ascending: false });

  console.log('October 2026 Orders for Lakshmi:', orders);
}

main();
