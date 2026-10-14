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

  const completed = orders.filter(o => ['COMPLETED', 'SUCCESS'].includes((o.status || '').toUpperCase()));
  const totalRev = completed.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  const cancelled = orders.filter(o => (o.status || '').toUpperCase() === 'CANCELLED');
  const active = orders.filter(o => !['COMPLETED', 'SUCCESS', 'CANCELLED'].includes((o.status || '').toUpperCase()));

  console.log({
    totalOrders: orders.length,
    completedCount: completed.length,
    totalRevenue: totalRev,
    cancelledCount: cancelled.length,
    activeCount: active.length,
    avgOrderValue: completed.length > 0 ? (totalRev / completed.length).toFixed(1) : 0,
  });
}

main();
