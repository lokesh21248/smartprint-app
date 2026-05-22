/**
 * Client-side file validation — mirrors the server's lib/upload-validation.ts
 * exactly so the user gets instant feedback before any network call is made.
 *
 * IMPORTANT: These constants must be kept in sync with the server-side module.
 * The server ALWAYS re-validates — these are a UX convenience layer only.
 *
 * @module lib/upload/fileValidation
 */

// ─── Constants (must match lib/upload-validation.ts) ─────────────────────────

/** Hard cap: 25 MB — matches Supabase Storage limit and presign API. */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** Human-readable cap for display in UI. */
export const MAX_FILE_SIZE_MB = 25;

/** MIME types accepted by the presign API. */
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp", // Output of client-side compressor (Chrome/Safari WebP encoding)
]);

/** Extensions accepted by the presign API (lowercase, no dot). */
export const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "webp"]);

/** FilePond acceptedFileTypes format. */
export const FILEPOND_ACCEPTED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

/** Max FilePond size string. */
export const FILEPOND_MAX_SIZE = `${MAX_FILE_SIZE_MB}MB`;

// ─── Types ───────────────────────────────────────────────────────────────────

export type FileCategory = "pdf" | "image";

export interface ClientValidationResult {
  valid: boolean;
  error?: string;
  category?: FileCategory;
  extension?: string;
}

// ─── Core validator ───────────────────────────────────────────────────────────

/**
 * Validates a File object on the client before initiating any network request.
 * Mirrors the same logic as validateUploadRequest() on the server.
 */
export function validateFileClient(file: File): ClientValidationResult {
  // 1. MIME type check
  if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    return {
      valid: false,
      error: `"${file.type}" is not supported. Please upload a PDF, PNG, or JPG.`,
    };
  }

  // 2. Extension check
  const parts = file.name.split(".");
  if (parts.length < 2) {
    return {
      valid: false,
      error: "File must have a valid extension (e.g. .pdf, .png, .jpg).",
    };
  }

  const ext = parts[parts.length - 1].toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `.${ext} files are not supported. Upload a PDF, PNG, or JPG.`,
    };
  }

  // 3. Path traversal / double-extension guard (client-side best-effort)
  if (
    file.name.includes("..") ||
    file.name.includes("/") ||
    file.name.includes("\\") ||
    file.name.includes("\0")
  ) {
    return { valid: false, error: "Invalid filename." };
  }

  // 4. Size check
  if (file.size === 0) {
    return { valid: false, error: "File is empty." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`,
    };
  }

  // 5. Determine category
  const category: FileCategory = file.type === "application/pdf" ? "pdf" : "image";

  return { valid: true, category, extension: ext };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formats bytes to human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Returns true if a file is a PDF. */
export function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

/** Returns true if a file is an image. */
export function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}
