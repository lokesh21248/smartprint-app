import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: shops } = await supabase.from('shops').select('id, name, owner_email').ilike('name', '%lakshmi%');
  console.log('Lakshmi shops:', shops);

  if (shops && shops.length > 0) {
    for (const shop of shops) {
      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false });
      console.log(`Orders for ${shop.name} (${shop.id}):`, orders);
    }
  }
}

main();
