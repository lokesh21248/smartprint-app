import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

Deno.serve(async (req) => {
  // Ensure only authorized requests run this (e.g., from our cron)
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${supabaseServiceKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  // Fetch expired records
  const { data: files, error } = await supabase
    .from("uploaded_documents")
    .select("id, file_path")
    .lt("created_at", twoHoursAgo)
    .limit(500); // Batch size to avoid timeouts

  if (error) {
    console.error("Error fetching documents:", error);
    return new Response(JSON.stringify(error), { status: 500 });
  }

  if (!files || files.length === 0) {
    return new Response("No files to clean up", { status: 200 });
  }

  console.log(`Found ${files.length} files to delete...`);

  // Delete from storage
  const filePaths = files.map((f) => f.file_path);
  const { error: storageError } = await supabase.storage
    .from("order-files")
    .remove(filePaths);

  if (storageError) {
    console.error("Storage deletion error:", storageError);
    // Continue anyway to delete the DB records of successfully removed files if possible,
    // or just fail. We'll fail to ensure we retry next time.
    return new Response(JSON.stringify(storageError), { status: 500 });
  }

  // Delete from DB tracking table
  const fileIds = files.map((f) => f.id);
  const { error: dbError } = await supabase
    .from("uploaded_documents")
    .delete()
    .in("id", fileIds);

  if (dbError) {
    console.error("DB deletion error:", dbError);
    return new Response(JSON.stringify(dbError), { status: 500 });
  }

  console.log(`Successfully deleted ${files.length} expired files.`);
  return new Response(`Cleanup completed: ${files.length} files removed`, { status: 200 });
});
