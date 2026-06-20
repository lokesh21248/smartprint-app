/**
 * imageCompressor.ts
 *
 * Client-side image compression using the Canvas API.
 * No external dependencies required.
 *
 * Strategy:
 *  - Only compresses JPEG, PNG, WebP images that exceed the size threshold.
 *  - Converts to image/webp (universally supported in modern browsers) at quality 0.82.
 *  - Caps max dimension at 2400px (sufficient for A4 print at ~200 DPI).
 *  - Returns the original File unmodified if:
 *      - File is a PDF
 *      - File is already under the threshold
 *      - Canvas/compression is not available (SSR or old browser)
 *      - Compression fails for any reason (graceful degradation)
 *  - Preserves the original filename but updates the extension to .webp.
 *
 * @module lib/upload/imageCompressor
 */

"use client";

/** Compress images larger than this size (bytes). 2MB default. */
const COMPRESS_THRESHOLD_BYTES = 2 * 1024 * 1024; // 2MB

/** Maximum side dimension in pixels after compression. */
const MAX_DIMENSION_PX = 2400;

/** WebP output quality (0–1). 0.82 balances file size vs. print quality. */
const WEBP_QUALITY = 0.82;

const COMPRESSIBLE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/**
 * Compress an image file if it exceeds the size threshold.
 *
 * @param file        Original File object
 * @param thresholdBytes  Compress only if file.size > this (default: 2MB)
 * @returns           Compressed File (or original if compression is skipped/fails)
 */
export async function compressImage(
  file: File,
  thresholdBytes: number = COMPRESS_THRESHOLD_BYTES
): Promise<File> {
  // Skip non-compressible files immediately
  if (!isCompressible(file)) return file;
  if (file.size <= thresholdBytes) return file;

  // SSR guard
  if (typeof window === "undefined" || typeof document === "undefined") return file;

  try {
    return await _compressViaCanvas(file);
  } catch (err) {
    console.warn(`[imageCompressor] Compression failed for "${file.name}", using original:`, err);
    return file;
  }
}

/** Returns true if the file is a compressible image type. */
export function isCompressible(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (COMPRESSIBLE_TYPES.has(mime)) return true;
  // Fallback by extension when MIME is missing/wrong (common on Android)
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return true;
  return false;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _compressViaCanvas(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);

  // Calculate new dimensions respecting aspect ratio
  let { width, height } = bitmap;
  if (width > MAX_DIMENSION_PX || height > MAX_DIMENSION_PX) {
    const ratio = Math.min(MAX_DIMENSION_PX / width, MAX_DIMENSION_PX / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas 2D context unavailable");
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Convert to WebP blob
  const blob = await _canvasToBlob(canvas, "image/webp", WEBP_QUALITY);

  // Only use the compressed version if it's actually smaller
  if (blob.size >= file.size) {
    console.log(
      `[imageCompressor] Compression not beneficial for "${file.name}" (${_fmt(file.size)} → ${_fmt(blob.size)}), keeping original.`
    );
    return file;
  }

  // Build output filename: replace extension with .webp
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const newName = `${baseName}.webp`;

  const compressed = new File([blob], newName, {
    type: "image/webp",
    lastModified: Date.now(),
  });

  console.log(
    `[imageCompressor] Compressed "${file.name}": ${_fmt(file.size)} → ${_fmt(compressed.size)} (${Math.round((1 - compressed.size / file.size) * 100)}% reduction)`
  );

  return compressed;
}

function _canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null"));
      },
      type,
      quality
    );
  });
}

function _fmt(bytes: number): string {
  const kb = bytes / 1024;
  return kb > 1024 ? `${(kb / 1024).toFixed(1)}MB` : `${Math.round(kb)}KB`;
}
