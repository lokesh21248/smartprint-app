import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const res = await supabase.rpc('run_sql', {
    query: "SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE '%order_number%';"
  });
  console.log("Triggers:", res.data, res.error);
}

main();
