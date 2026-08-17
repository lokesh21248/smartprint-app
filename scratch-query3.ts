import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { join } from "path";

dotenv.config({ path: join(process.cwd(), ".env.local") });

// Use ANON key this time to see if we get a different error, or maybe we can fetch through a public view
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
  const { data, error } = await supabase.from("notifications").select("*").limit(1);
  console.log("Anon Data:", data);
  console.log("Anon Error:", error);
}

main().catch(console.error);
