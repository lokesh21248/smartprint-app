import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('=== AUDITING ALL ORDERS IN DATABASE ===\n');

  const { data: shops } = await supabase.from('shops').select('id, name, slug');
  const shopMap = new Map((shops || []).map(s => [s.id, s]));

  const { data: allOrders, error } = await supabase
    .from('orders')
    .select('id, order_number, short_token, shop_id, customer_name, customer_phone, total_amount, status, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching orders:', error);
    return;
  }

  console.log(`Total orders fetched: ${allOrders.length}`);

  // Count by shop
  const countByShop = {};
  for (const o of allOrders) {
    const shop = shopMap.get(o.shop_id);
    const shopName = shop ? `${shop.name} (${shop.slug})` : `Unknown (${o.shop_id})`;
    countByShop[shopName] = (countByShop[shopName] || 0) + 1;
  }

  console.log('\nOrders breakdown by shop:');
  for (const [sName, cnt] of Object.entries(countByShop).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${sName.padEnd(50)}: ${cnt} orders`);
  }

  // Specifically check Xerox Lakshmi orders
  const lakshmiId = '7d914133-a97a-4695-bb21-07320fe8c71d';
  const lakshmiOrders = allOrders.filter(o => o.shop_id === lakshmiId);
  console.log(`\nXerox Lakshmi total orders: ${lakshmiOrders.length}`);

  // Check how many orders in Lakshmi have customer names from CUSTOMERS list in seed script vs real
  const seedNames = [
    'Sai Kiran', 'Priya Sharma', 'Rahul Reddy', 'Ananya Verma',
    'Manoj Kumar', 'Divya Sri', 'Karthik Raja', 'Sneha Patel',
    'Venkat Rao', 'Lakshmi Prasanna', 'Harish Babu', 'Tejaswini',
    'Naveen Chandra', 'Bhavani Shankar', 'Swathi Krishna', 'Test Customer'
  ];

  const seedOrders = lakshmiOrders.filter(o => seedNames.includes(o.customer_name));
  const nonSeedOrders = lakshmiOrders.filter(o => !seedNames.includes(o.customer_name));

  console.log(`  Identified Seed/Test orders in Lakshmi (matching seed scripts): ${seedOrders.length}`);
  console.log(`  Authentic / Original orders in Lakshmi: ${nonSeedOrders.length}`);

  console.log('\nSample Authentic / Original orders in Lakshmi (newest to oldest):');
  nonSeedOrders.slice(0, 15).forEach(o => {
    console.log(`    ${o.order_number || o.short_token} | ${o.customer_name} | ${o.customer_phone} | ₹${o.total_amount} | ${o.status} | ${o.created_at}`);
  });

  // Check other shops for test patterns (e.g. test, dummy, etc.)
  const otherShopOrders = allOrders.filter(o => o.shop_id !== lakshmiId);
  const suspiciousOther = otherShopOrders.filter(o => 
    /test/i.test(o.customer_name || '') || 
    /dummy/i.test(o.customer_name || '') ||
    o.customer_phone === '9876543210' ||
    o.customer_phone === '1234567890'
  );

  console.log(`\nSuspicious/Test orders in other shops: ${suspiciousOther.length}`);
  suspiciousOther.forEach(o => {
    const shop = shopMap.get(o.shop_id);
    console.log(`    [${shop?.name}] ${o.order_number || o.short_token} | ${o.customer_name} | ${o.customer_phone} | ${o.created_at}`);
  });

  // Check customer_sessions for test data
  const { data: allSessions } = await supabase.from('customer_sessions').select('*').limit(500);
  console.log(`\nCustomer sessions total: ${allSessions?.length}`);
  const testSessions = (allSessions || []).filter(s => 
    /test/i.test(s.customer_name || '') || 
    seedNames.includes(s.customer_name)
  );
  console.log(`Customer sessions matching test names: ${testSessions.length}`);

  // Check notifications for test data
  const { data: allNotifs } = await supabase.from('notifications').select('*').limit(500);
  console.log(`\nNotifications total: ${allNotifs?.length}`);
  const testNotifs = (allNotifs || []).filter(n => 
    /test/i.test(n.title || '') || 
    /test/i.test(n.body || '')
  );
  console.log(`Notifications matching test patterns: ${testNotifs.length}`);
}

main().catch(console.error);
