import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectTriggers() {
  // Try querying pg_trigger via RPC if any
  const rpcs = ['run_sql', 'exec_sql', 'execute_sql', 'sql'];
  for (const r of rpcs) {
    try {
      const { data, error } = await supabase.rpc(r, { query: 'SELECT 1;' });
      console.log(`RPC ${r}:`, error ? error.message : 'SUCCESS', data);
    } catch (e) {
      console.log(`RPC ${r} thrown:`, e.message);
    }
  }
}

inspectTriggers().catch(console.error);
