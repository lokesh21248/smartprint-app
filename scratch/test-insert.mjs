import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testInsert() {
  const shopId = '7d914133-a97a-4695-bb21-07320fe8c71d';
  const orderId = randomUUID();
  const now = new Date('2026-10-14T10:30:00Z');
  const completedAt = new Date('2026-10-14T10:38:00Z');

  const testOrder = {
    id: orderId,
    short_token: 'tst' + Math.random().toString(36).substring(2, 10),
    order_number: 'ORD-261014-9999',
    shop_id: shopId,
    customer_name: 'Test Customer',
    customer_phone: '9876543210',
    customer_phone_verified: true,
    customer_ip: '106.192.4.97',
    file_s3_key: `orders/${orderId}/document.pdf`,
    file_name: 'test_document.pdf',
    file_size_bytes: 250000,
    page_count: 5,
    copies: 2,
    is_color: true,
    is_double_sided: false,
    notes: 'Urgent print',
    total_amount: 90,
    status: 'COMPLETED',
    status_history: [
      { at: now.toISOString(), status: 'PLACED' },
      { at: new Date(now.getTime() + 60000).toISOString(), from: 'PLACED', status: 'ACCEPTED' },
      { at: new Date(now.getTime() + 180000).toISOString(), from: 'ACCEPTED', status: 'PRINTING' },
      { at: new Date(now.getTime() + 360000).toISOString(), from: 'PRINTING', status: 'READY' },
      { at: completedAt.toISOString(), from: 'READY', status: 'COMPLETED' },
    ],
    cancellation_reason: null,
    placed_at: now.toISOString(),
    accepted_at: new Date(now.getTime() + 60000).toISOString(),
    printing_at: new Date(now.getTime() + 180000).toISOString(),
    ready_at: new Date(now.getTime() + 360000).toISOString(),
    completed_at: completedAt.toISOString(),
    cancelled_at: null,
    created_at: now.toISOString(),
    updated_at: completedAt.toISOString(),
    files: [
      {
        url: `orders/${orderId}/document.pdf`,
        name: 'test_document.pdf',
        size: 250000,
        color: true,
        pages: 5,
        copies: 2,
        mimeType: 'application/pdf',
        scanStatus: 'passed',
        doubleSided: false,
        securityStatus: 'passed',
      },
    ],
    deleted_at: null,
    file_status: 'active',
  };

  const { data, error } = await supabase.from('orders').insert(testOrder).select();
  if (error) {
    console.error('Insert error:', error);
  } else {
    console.log('Insert success! Inserted:', data[0].id, data[0].order_number);
    // clean up test order
    await supabase.from('orders').delete().eq('id', orderId);
    console.log('Cleanup success!');
  }
}

testInsert().catch(console.error);
