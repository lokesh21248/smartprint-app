import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Generate a signed URL for a private Supabase Storage object.
 * SERVER-SIDE ONLY — uses the service role key.
 *
 * @param bucket    Storage bucket name (e.g. "order-files")
 * @param path      Object path within the bucket (e.g. "shop-id/order-id/file.pdf")
 * @param expiresIn Seconds until the signed URL expires (default: 1 hour)
 */
export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 60
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
export async function createSignedUrls(
  bucket: string,
  paths: string[],
  expiresIn = 60
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

/**
 * Move a storage object from one bucket to another.
 * Downloads from source, uploads to destination, then deletes from source.
 */
export async function moveFileAcrossBuckets(
  fromBucket: string,
  toBucket: string,
  path: string,
  mimeType: string
): Promise<void> {
  if (fromBucket === toBucket) {
    console.log(`[storage] Skip moving file ${path} — source and target bucket are the same (${fromBucket}).`);
    return;
  }
  const admin = createAdminClient();

  // 1. Download file from source bucket
  const { data: fileData, error: downloadError } = await admin.storage
    .from(fromBucket)
    .download(path);

  if (downloadError || !fileData) {
    throw new Error(`Failed to download file from ${fromBucket}/${path}: ${downloadError?.message ?? "unknown error"}`);
  }

  // 2. Upload file to target bucket
  const { error: uploadError } = await admin.storage
    .from(toBucket)
    .upload(path, fileData, { contentType: mimeType, upsert: true });

  if (uploadError) {
    throw new Error(`Failed to upload file to ${toBucket}/${path}: ${uploadError.message}`);
  }

  // 3. Delete file from source bucket
  const { error: removeError } = await admin.storage
    .from(fromBucket)
    .remove([path]);

  if (removeError) {
    console.warn(`[storage] Failed to remove source file from ${fromBucket}/${path} after successful move:`, removeError.message);
  }
}
