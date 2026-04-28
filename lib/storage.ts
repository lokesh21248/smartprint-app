import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Generate a signed URL for a private Supabase Storage object.
 * SERVER-SIDE ONLY — uses the service role key.
 *
 * @param bucket    Storage bucket name (e.g. "order-files")
 * @param path      Object path within the bucket (e.g. "shop-id/order-id/file.pdf")
 * @param expiresIn Seconds until the signed URL expires (default: 1 hour)
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600
): Promise<string> {
  const admin = createAdminClient();

  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to generate signed URL for ${bucket}/${path}: ${error?.message ?? "unknown error"}`
    );
  }

  return data.signedUrl;
}

/**
 * Generate signed URLs for multiple objects in one call.
 * Returns a map of path → signedUrl.
 */
export async function getSignedUrls(
  bucket: string,
  paths: string[],
  expiresIn = 3600
): Promise<Record<string, string>> {
  const admin = createAdminClient();

  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrls(paths, expiresIn);

  if (error || !data) {
    throw new Error(
      `Failed to generate signed URLs for ${bucket}: ${error?.message ?? "unknown error"}`
    );
  }

  const result: Record<string, string> = {};
  data.forEach(({ path: p, signedUrl }) => {
    if (p && signedUrl) result[p] = signedUrl;
  });
  return result;
}
