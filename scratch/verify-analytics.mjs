import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const shopId = '7d914133-a97a-4695-bb21-07320fe8c71d';

async function verify() {
  const now = new Date('2026-10-14T12:00:00Z');
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const { data: orders } = await supabase
    .from('orders')
    .select('total_amount, status, created_at, updated_at, completed_at, customer_phone, is_color')
    .eq('shop_id', shopId)
    .gte('created_at', ninetyDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  console.log('Total orders in last 90 days:', orders?.length);

  for (const range of ['7d', '30d', '90d', 'month']) {
    let start = new Date(now);
    if (range === '7d') {
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else if (range === '30d') {
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
    } else if (range === '90d') {
      start.setDate(now.getDate() - 89);
      start.setHours(0, 0, 0, 0);
    } else if (range === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }

    const filtered = (orders || []).filter(o => new Date(o.created_at) >= start);
    const revenue = filtered.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const aov = filtered.length > 0 ? (revenue / filtered.length).toFixed(1) : '0';

    let totalMins = 0, completedCount = 0;
    for (const o of filtered) {
      if (o.status === 'COMPLETED' || o.status === 'SUCCESS') {
        const ct = new Date(o.created_at).getTime();
        const done = o.completed_at ? new Date(o.completed_at).getTime() : new Date(o.updated_at).getTime();
        const diff = (done - ct) / 60000;
        if (diff >= 0) { totalMins += diff; completedCount++; }
      }
    }
    const avgCompletion = completedCount > 0 ? Math.round(totalMins / completedCount) : 0;

    console.log(`\n=== Range [${range.toUpperCase()}] ===`);
    console.log(`  Total Orders: ${filtered.length}`);
    console.log(`  Total Revenue: ₹${revenue}`);
    console.log(`  Avg Order Value: ₹${aov}`);
    console.log(`  Avg Completion Time: ${avgCompletion} mins (${completedCount} completed orders)`);
  }

  // Check Status Breakdown for 7d
  const start7d = new Date(now);
  start7d.setDate(now.getDate() - 6);
  start7d.setHours(0, 0, 0, 0);
  const filtered7d = (orders || []).filter(o => new Date(o.created_at) >= start7d);
  const statusCounts = {};
  for (const o of filtered7d) {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  }
  console.log('\n7d Status Breakdown:', statusCounts);

  // Check Color vs BW
  let bw = 0, color = 0;
  for (const o of filtered7d) {
    if (o.is_color) color++;
    else bw++;
  }
  console.log(`7d Services: B&W = ${bw}, Color = ${color}`);

  // Check Peak hours
  const peakHoursCount = {};
  for (const o of filtered7d) {
    const hour = new Date(o.created_at).getHours();
    const hourStr = `${hour.toString().padStart(2, '0')}:00`;
    peakHoursCount[hourStr] = (peakHoursCount[hourStr] || 0) + 1;
  }
  console.log('Peak Hours (sample):', Object.entries(peakHoursCount).sort());
}

verify().catch(console.error);
