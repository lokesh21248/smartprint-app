import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const shopId = '7d914133-a97a-4695-bb21-07320fe8c71d';

  // 1. Get ALL orders with full details
  const { data: allOrders, count } = await supabase
    .from('orders')
    .select('id, order_number, status, total_amount, created_at, updated_at, completed_at, customer_phone, is_color', { count: 'exact' })
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });

  console.log('=== TOTAL ORDERS IN DATABASE ===');
  console.log(`Count: ${count}`);
  console.log('');

  // 2. Status breakdown
  const statusCounts: Record<string, number> = {};
  const statusRevenue: Record<string, number> = {};
  let totalRevenue = 0;

  for (const o of allOrders || []) {
    const status = (o.status || 'UNKNOWN').toUpperCase();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    statusRevenue[status] = (statusRevenue[status] || 0) + (Number(o.total_amount) || 0);
    totalRevenue += Number(o.total_amount) || 0;
  }

  console.log('=== STATUS BREAKDOWN ===');
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count} orders, ₹${statusRevenue[status]}`);
  }
  console.log(`  TOTAL: ${allOrders?.length} orders, ₹${totalRevenue}`);
  console.log('');

  // 3. Monthly breakdown
  const monthlyData: Record<string, { orders: number; revenue: number }> = {};
  for (const o of allOrders || []) {
    const date = new Date(o.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyData[monthKey]) monthlyData[monthKey] = { orders: 0, revenue: 0 };
    monthlyData[monthKey].orders++;
    monthlyData[monthKey].revenue += Number(o.total_amount) || 0;
  }

  console.log('=== MONTHLY BREAKDOWN ===');
  for (const [month, data] of Object.entries(monthlyData).sort()) {
    console.log(`  ${month}: ${data.orders} orders, ₹${data.revenue}`);
  }
  console.log('');

  // 4. Color vs B&W breakdown
  let bwCount = 0, colorCount = 0;
  for (const o of allOrders || []) {
    if (o.is_color) colorCount++;
    else bwCount++;
  }
  console.log('=== SERVICE TYPE ===');
  console.log(`  B&W: ${bwCount} orders`);
  console.log(`  Color: ${colorCount} orders`);
  console.log('');

  // 5. Peak hours
  const hourCounts: Record<number, number> = {};
  for (const o of allOrders || []) {
    const hour = new Date(o.created_at).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  }
  console.log('=== PEAK HOURS (IST) ===');
  // Convert UTC hours to IST (+5:30)
  for (const [hour, count] of Object.entries(hourCounts).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const istHour = (Number(hour) + 5) % 24; // approximate IST
    console.log(`  ${String(istHour).padStart(2, '0')}:00 IST (${String(hour).padStart(2, '0')}:00 UTC): ${count} orders`);
  }
  console.log('');

  // 6. Completed orders details
  const completedOrders = (allOrders || []).filter(o => o.status?.toUpperCase() === 'COMPLETED');
  console.log('=== COMPLETED ORDERS ===');
  for (const o of completedOrders) {
    const created = new Date(o.created_at);
    const completed = o.completed_at ? new Date(o.completed_at) : new Date(o.updated_at);
    const mins = Math.round((completed.getTime() - created.getTime()) / 60000);
    console.log(`  ${o.order_number}: ₹${o.total_amount}, completed in ${mins} mins, color=${o.is_color}`);
  }
  console.log('');

  // 7. Date range check: what falls in last 7 days, 30 days, 90 days, this month
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const in7d = (allOrders || []).filter(o => new Date(o.created_at) >= sevenDaysAgo);
  const in30d = (allOrders || []).filter(o => new Date(o.created_at) >= thirtyDaysAgo);
  const in90d = (allOrders || []).filter(o => new Date(o.created_at) >= ninetyDaysAgo);
  const inMonth = (allOrders || []).filter(o => new Date(o.created_at) >= startOfMonth);

  console.log('=== ORDERS BY DATE RANGE ===');
  console.log(`  Last 7 days:  ${in7d.length} orders, ₹${in7d.reduce((s, o) => s + (Number(o.total_amount) || 0), 0)}`);
  console.log(`  Last 30 days: ${in30d.length} orders, ₹${in30d.reduce((s, o) => s + (Number(o.total_amount) || 0), 0)}`);
  console.log(`  Last 90 days: ${in90d.length} orders, ₹${in90d.reduce((s, o) => s + (Number(o.total_amount) || 0), 0)}`);
  console.log(`  This Month:   ${inMonth.length} orders, ₹${inMonth.reduce((s, o) => s + (Number(o.total_amount) || 0), 0)}`);

  // 8. All orders table
  console.log('');
  console.log('=== ALL ORDERS (newest first) ===');
  console.log('Order#              | Status     | Amount | Date (IST)          | Color | Phone');
  console.log('-'.repeat(95));
  for (const o of allOrders || []) {
    const date = new Date(o.created_at);
    const istDate = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
    const dateStr = istDate.toISOString().replace('T', ' ').slice(0, 19);
    console.log(
      `${(o.order_number || '').padEnd(20)}| ${(o.status || '').padEnd(11)}| ₹${String(o.total_amount).padEnd(5)}| ${dateStr} | ${o.is_color ? 'Yes' : 'No '}   | ${o.customer_phone || 'N/A'}`
    );
  }
}

main();
