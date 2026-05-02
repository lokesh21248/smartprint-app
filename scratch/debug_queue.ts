import { createAdminClient } from "./lib/supabase/admin";

async function checkQueue() {
  const supabase = createAdminClient();
  const { data: jobs, error } = await supabase.from("webhook_jobs").select("*");
  if (error) {
    console.error("Error fetching jobs:", error.message);
    return;
  }
  console.log(`Found ${jobs.length} jobs in queue.`);
  jobs.forEach(j => console.log(`- Job ${j.id}: status=${j.status}, retries=${j.retry_count}`));
}

checkQueue();
