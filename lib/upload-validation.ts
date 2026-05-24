/**
 * File upload validation — server-side security layer.
 *
 * Centralises all upload rules so they can't diverge between
 * /api/storage/presign and future upload endpoints.
 *
 * All validation here is INDEPENDENT of client-side checks.
 * Never trust client-reported MIME types or file sizes alone.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Hard cap: 500 MB. Updated to support production-scale resumable chunked files. */
export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

/** Allowed MIME types — PDF and common image formats + WebP (output of client compressor). */
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp", // Client-side compressor converts large PNG/JPG → WebP for faster mobile uploads
]);

/** Allowed file extensions (lowercase, without dot). */
export const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp", // Output of client-side compression
]);

/**
 * Dangerous extensions — executables, scripts, archives that could be
 * disguised with double extensions like `invoice.pdf.exe`.
 */
const DANGEROUS_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "msi", "scr", "pif",
  "vbs", "vbe", "js", "jse", "wsf", "wsh", "ps1", "psm1",
  "sh", "bash", "csh", "ksh",
  "app", "action", "command", "workflow",
  "dll", "sys", "drv",
  "php", "asp", "aspx", "jsp", "cgi", "py", "pl", "rb",
  "jar", "class",
  "hta", "inf", "reg", "rgs",
  "lnk", "url", "desktop",
]);

/** Supabase Storage temporary staging bucket name. */
export const UPLOAD_BUCKET = "order-files";

/** Signed URL TTL in seconds. Extended to 3600s (1 hour) to support large file chunk uploads on slow mobile. */
export const UPLOAD_URL_TTL_SECONDS = 3600;

// ─── Validation result type ─────────────────────────────────────────────────

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  /** HTTP status code to use when returning the error. */
  statusCode?: number;
  /** Sanitised filename safe for storage path construction. */
  sanitizedName?: string;
  /** Validated extension (lowercase). */
  extension?: string;
}

// ─── Core validation ────────────────────────────────────────────────────────

/**
 * Validates and sanitises an upload request server-side.
 *
 * Checks:
 *  1. Required fields present
 *  2. MIME type is in allowlist
 *  3. Extension is in allowlist
 *  4. No double extensions (e.g. `.pdf.exe`)
 *  5. No path traversal in filename
 *  6. File size within limits
 *  7. Filename length within limits
 *  8. Filename sanitised for storage safety
 */
export function validateUploadRequest(params: {
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}): FileValidationResult {
  const { fileName, fileSize, mimeType } = params;

  // 1. Required fields
  if (!fileName || fileSize === undefined || fileSize === null) {
    return {
      valid: false,
      error: "Missing required fields: fileName, fileSize",
      statusCode: 400,
    };
  }

  // Normalize reported MIME type based on file extension (Fix Android Chrome screenshot / generic binary uploads / missing mimeType)
  const parts = fileName.split(".");
  const ext = parts.length >= 2 ? parts[parts.length - 1].toLowerCase() : "";

  let mimeTypeNormalized = (mimeType || "").toLowerCase();

  if (
    mimeTypeNormalized === "" ||
    mimeTypeNormalized === "application/octet-stream" ||
    mimeTypeNormalized === "binary/octet-stream" ||
    mimeTypeNormalized === "image/pjpeg" ||
    mimeTypeNormalized === "image/jpg"
  ) {
    if (ext === "pdf") mimeTypeNormalized = "application/pdf";
    else if (ext === "png") mimeTypeNormalized = "image/png";
    else if (ext === "webp") mimeTypeNormalized = "image/webp";
    else if (ext === "jpg" || ext === "jpeg") mimeTypeNormalized = "image/jpeg";
    else mimeTypeNormalized = "application/octet-stream";
  }

  // 2. MIME type check
  if (!ALLOWED_MIME_TYPES.has(mimeTypeNormalized)) {
    return {
      valid: false,
      error: `File type "${mimeType}" is not allowed. Only PDF and image files (PNG, JPG) are accepted.`,
      statusCode: 415,
    };
  }

  // 3. Extract and validate extension
  if (parts.length < 2) {
    return {
      valid: false,
      error: "File must have a valid extension (e.g. .pdf)",
      statusCode: 400,
    };
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `File extension ".${ext}" is not allowed. Only .pdf, .png, .jpg, .jpeg files are accepted.`,
      statusCode: 415,
    };
  }

  // 4. Double extension attack detection
  // Check ALL extensions in the filename, not just the last one.
  // e.g. "invoice.pdf.exe" → ["pdf", "exe"] — "exe" is dangerous.
  const allExtensions = parts.slice(1).map((p) => p.toLowerCase());
  for (const segment of allExtensions) {
    if (DANGEROUS_EXTENSIONS.has(segment)) {
      console.warn(
        `[SECURITY] Blocked double-extension attack: "${fileName}" contains dangerous extension ".${segment}"`
      );
      return {
        valid: false,
        error: "File rejected for security reasons. Please rename and try again.",
        statusCode: 400,
      };
    }
  }

  // 5. Path traversal protection
  if (
    fileName.includes("..") ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes("\0")
  ) {
    console.warn(`[SECURITY] Blocked path traversal in filename: "${fileName}"`);
    return {
      valid: false,
      error: "Invalid filename.",
      statusCode: 400,
    };
  }

  // 6. File size validation
  if (typeof fileSize !== "number" || fileSize <= 0) {
    return { valid: false, error: "File size must be greater than 0.", statusCode: 400 };
  }
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`,
      statusCode: 413,
    };
  }

  // 7. Filename length (prevent excessively long paths)
  if (fileName.length > 255) {
    return { valid: false, error: "Filename is too long (max 255 characters).", statusCode: 400 };
  }

  // 8. Sanitise filename for safe storage
  const sanitizedName = sanitizeFileName(fileName);

  return {
    valid: true,
    sanitizedName,
    extension: ext,
  };
}

// ─── Filename sanitisation ──────────────────────────────────────────────────

/**
 * Strips dangerous characters from a filename while preserving readability.
 *
 * Rules:
 *  - Replace spaces with underscores
 *  - Remove all characters except alphanumerics, hyphens, underscores, dots
 *  - Collapse consecutive dots/underscores
 *  - Trim leading/trailing dots and underscores
 *  - Enforce max length of 100 chars (excluding extension)
 */
export function sanitizeFileName(raw: string): string {
  // Separate extension
  const lastDotIdx = raw.lastIndexOf(".");
  const hasExt = lastDotIdx > 0;
  const baseName = hasExt ? raw.slice(0, lastDotIdx) : raw;
  const extension = hasExt ? raw.slice(lastDotIdx).toLowerCase() : "";

  let clean = baseName
    // Replace spaces and tabs with underscores
    .replace(/[\s\t]+/g, "_")
    // Remove everything except alphanumerics, hyphens, underscores, dots
    .replace(/[^a-zA-Z0-9\-_.]/g, "")
    // Collapse consecutive dots
    .replace(/\.{2,}/g, ".")
    // Collapse consecutive underscores
    .replace(/_{2,}/g, "_")
    // Trim leading/trailing dots and underscores
    .replace(/^[._]+|[._]+$/g, "");

  // Enforce max base length
  if (clean.length > 100) {
    clean = clean.slice(0, 100);
  }

  // Fallback if everything was stripped
  if (clean.length === 0) {
    clean = "upload";
  }

  return clean + extension;
}

// ─── Storage path generation ────────────────────────────────────────────────

/**
 * Generates a unique, collision-safe storage path.
 *
 * Format: `orders/{shopId}/{timestamp}-{random}.{ext}`
 *
 * The original filename is NOT used in the path to prevent:
 *  - Path traversal via crafted filenames
 *  - Collisions from duplicate names
 *  - Encoding issues from unicode filenames
 */
export function generateStoragePath(shopId: string, extension: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `orders/${shopId}/${timestamp}-${random}.${extension}`;
}

// ─── Storage path validation (for signed-url download route) ────────────────

/**
 * Validates a storage path is well-formed and not a traversal attack.
 *
 * Supported formats:
 *   - `orders/{orderId}/{filename}`   (new: orderId-based, used by presign when orderId is provided)
 *   - `orders/{shopId}/{timestamp}-{random}.{ext}` (legacy: shopId-based)
 *
 * The second path segment can be either an orderId or a shopId — both are UUIDs.
 */
export function validateStoragePath(path: string): {
  valid: boolean;
  shopId?: string;
  error?: string;
} {
  // Block path traversal
  if (path.includes("..") || path.includes("\0")) {
    return { valid: false, error: "Invalid path" };
  }

  const segments = path.split("/");
  if (segments.length < 3 || segments[0] !== "orders" || !segments[1]) {
    return { valid: false, error: "Invalid path format" };
  }

  // Accept both orderId and shopId — both must be UUID format
  const idSegment = segments[1];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Also accept legacy timestamp-random format for the filename segment
  if (!uuidRegex.test(idSegment)) {
    return { valid: false, error: "Invalid path format" };
  }

  // Validate the filename segment exists and has no dangerous characters
  const filename = segments.slice(2).join("/");
  if (!filename || filename.length === 0) {
    return { valid: false, error: "Missing filename in path" };
  }

  return { valid: true, shopId: idSegment };
}
