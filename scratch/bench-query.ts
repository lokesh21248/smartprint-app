import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const shopId = '7d914133-a97a-4695-bb21-07320fe8c71d';
  const t0 = performance.now();
  const { data, error } = await supabase
    .from('orders')
    .select('total_amount, status, created_at, updated_at, completed_at, customer_phone, is_color')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(1000);
  const elapsed = performance.now() - t0;
  console.log(`Fetched ${data?.length} orders in ${elapsed.toFixed(1)}ms. Error:`, error);
}

main();
