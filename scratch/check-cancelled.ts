import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .in('id', [
      'b6cea22f-6448-46e3-bfa1-98827f407135',
      '62768b0c-b5b5-495e-b520-6478e3549dbb'
    ]);
  console.log('Orders details:', JSON.stringify(orders, null, 2));
}

main();
