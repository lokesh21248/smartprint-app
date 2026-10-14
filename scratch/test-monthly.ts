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
    .select('total_amount, status, created_at, updated_at, completed_at, customer_phone, is_color')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });

  if (!orders) return;

  // Let's test grouping by month for "all"
  const monthlyData: Record<string, { revenue: number; orders: number }> = {};
  for (const o of orders) {
    const d = new Date(o.created_at);
    const key = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
    if (!monthlyData[key]) monthlyData[key] = { revenue: 0, orders: 0 };
    monthlyData[key].orders++;
    const s = (o.status || '').toUpperCase();
    if (s === 'COMPLETED' || s === 'SUCCESS') {
      monthlyData[key].revenue += Number(o.total_amount) || 0;
    }
  }

  console.log('Monthly summary for all orders:', monthlyData);
}

main();
