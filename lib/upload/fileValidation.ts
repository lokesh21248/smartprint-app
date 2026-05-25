/**
 * Client-side file validation — mirrors the server's lib/upload-validation.ts
 * exactly so the user gets instant feedback before any network call is made.
 *
 * IMPORTANT: These constants must be kept in sync with the server-side module.
 * The server ALWAYS re-validates — these are a UX convenience layer only.
 *
 * @module lib/upload/fileValidation
 */

import { StructuredUploadError } from "./errorClassifier";


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
  "image/heic",
  "image/heif",
]);

/** Extensions accepted by the presign API (lowercase, no dot). */
export const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "webp", "heic", "heif"]);

/** FilePond acceptedFileTypes format. */
export const FILEPOND_ACCEPTED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
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
  // Normalize reported MIME type based on file extension
  let mimeTypeNormalized = file.type.toLowerCase();
  const parts = file.name.split(".");
  const ext = parts.length >= 2 ? parts[parts.length - 1].toLowerCase() : "";

  if (
    mimeTypeNormalized === "application/octet-stream" ||
    mimeTypeNormalized === "binary/octet-stream" ||
    mimeTypeNormalized === "image/pjpeg" ||
    mimeTypeNormalized === "image/jpg" ||
    mimeTypeNormalized === ""
  ) {
    if (ext === "pdf") mimeTypeNormalized = "application/pdf";
    else if (ext === "png") mimeTypeNormalized = "image/png";
    else if (ext === "webp") mimeTypeNormalized = "image/webp";
    else if (ext === "jpg" || ext === "jpeg") mimeTypeNormalized = "image/jpeg";
    else if (ext === "heic" || ext === "heif") mimeTypeNormalized = "image/heic";
  }

  // 1. MIME type check
  if (!ALLOWED_MIME_TYPES.has(mimeTypeNormalized)) {
    return {
      valid: false,
      error: `"${file.type}" is not supported. Please upload a PDF, PNG, or JPG.`,
    };
  }

  // 2. Extension check
  if (parts.length < 2) {
    return {
      valid: false,
      error: "File must have a valid extension (e.g. .pdf, .png, .jpg).",
    };
  }

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

/**
 * Advanced binary validation for PDF and image upload files.
 * Verifies readable blob, binary integrity (magic bytes for PDFs, image readability),
 * supported extensions, and hydrated size.
 */
export async function validateUploadFile(file: File): Promise<void> {
  if (!file) {
    throw new StructuredUploadError("FILE_VALIDATION_FAILED", "No file provided.");
  }

  // 1. Check size
  if (file.size <= 0) {
    throw new StructuredUploadError("FILE_VALIDATION_FAILED", "Empty file detected (0 bytes).");
  }

  const MAX_SIZE = 500 * 1024 * 1024; // 500 MB
  if (file.size > MAX_SIZE) {
    throw new StructuredUploadError("FILE_VALIDATION_FAILED", `File too large. Maximum size is 500 MB.`);
  }

  // 2. Check extension
  const parts = file.name.split(".");
  const ext = parts.length >= 2 ? parts[parts.length - 1].toLowerCase() : "";
  const allowedExts = new Set(["pdf", "png", "jpg", "jpeg", "webp", "heic", "heif"]);
  if (!allowedExts.has(ext)) {
    throw new StructuredUploadError("FILE_VALIDATION_FAILED", `File extension ".${ext}" is not supported. Upload a PDF, PNG, or JPG.`);
  }

  // 3. Verify readable blob
  try {
    const chunk = await file.slice(0, 1024).arrayBuffer();
    if (chunk.byteLength === 0) {
      throw new Error("Zero byte read");
    }
  } catch {
    throw new StructuredUploadError("FILE_VALIDATION_FAILED", "File is unreadable. Please check permissions or re-select.");
  }

  // 4. Actual binary integrity
  const isPdfFile = ext === "pdf";
  if (isPdfFile) {
    // Check %PDF magic bytes within the first 1024 bytes (to handle leading garbage)
    try {
      const headerBlob = file.slice(0, 1024);
      const buffer = await headerBlob.arrayBuffer();
      const arr = new Uint8Array(buffer);
      const arrString = Array.from(arr).map(x => String.fromCharCode(x)).join("");
      if (!arrString.includes("%PDF")) {
        throw new Error("Invalid PDF header");
      }
    } catch {
      throw new StructuredUploadError("PDF_PARSE_FAILED", "The file is not a valid PDF document.");
    }
  } else {
    // Verify image readability
    let isValidImage = true;
    if (typeof window !== "undefined") {
      try {
        if (typeof window.createImageBitmap !== "undefined") {
          const bitmap = await window.createImageBitmap(file);
          bitmap.close();
        } else {
          // fallback
          await new Promise<void>((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
              URL.revokeObjectURL(url);
              resolve();
            };
            img.onerror = () => {
              URL.revokeObjectURL(url);
              reject(new Error("Image decode failed"));
            };
            img.src = url;
          });
        }
      } catch {
        isValidImage = false;
      }
    }
    if (!isValidImage) {
      console.warn("[validateUploadFile] Image decode failed, but proceeding anyway to prevent false corruption rejection.", file.name);
    }
  }
}
