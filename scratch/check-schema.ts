import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Check one existing order to see all columns
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .limit(1)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('=== ORDER TABLE COLUMNS ===');
  console.log(Object.keys(data));
  console.log('');
  console.log('=== SAMPLE ORDER ===');
  console.log(JSON.stringify(data, null, 2));
}

main();
