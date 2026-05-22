/**
 * compressImage.ts
 *
 * Client-side image compression before upload.
 * Only runs in the browser (safe to call in React components).
 *
 * Strategy:
 * - Skip PDFs and non-image files (returned as-is)
 * - Skip files already under SIZE_THRESHOLD_BYTES
 * - Resize to fit within MAX_DIMENSION while preserving aspect ratio
 * - Re-encode as WebP (browsers that support it) or JPEG as fallback
 * - Fill white background before encoding (safe for transparent PNGs)
 * - Fall back to original file if canvas API fails
 *
 * Typical results on mobile:
 * - 5MB HEIC/PNG → ~300KB WebP  (~16x compression)
 * - 2MB JPEG → ~500KB WebP      (~4x compression)
 * - Small 200KB PNG → skipped   (threshold not met)
 */

const MAX_DIMENSION = 1600;       // px — max width or height after resize
const JPEG_QUALITY = 0.82;        // 0–1 — good quality/size balance for print
const WEBP_QUALITY = 0.85;        // WebP is more efficient so can use slightly higher quality
const SIZE_THRESHOLD_BYTES = 500 * 1024; // 500KB — aggressive: compress more for faster mobile uploads

export interface CompressionResult {
  file: File;
  compressed: boolean;
  originalSizeBytes: number;
  finalSizeBytes: number;
  compressionRatio: number; // 0–1, lower = more compressed
  format: "webp" | "jpeg" | "original";
}

/** Detect WebP encoding support in this browser. */
function supportsWebP(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

/**
 * Compress an image File if it exceeds the size threshold.
 * Returns original file unchanged for PDFs, small images, and on canvas failure.
 */
export async function compressImageIfNeeded(
  file: File,
  sizeThresholdBytes = SIZE_THRESHOLD_BYTES
): Promise<CompressionResult> {
  const originalSizeBytes = file.size;
  const noOp: CompressionResult = {
    file,
    compressed: false,
    originalSizeBytes,
    finalSizeBytes: originalSizeBytes,
    compressionRatio: 1,
    format: "original",
  };

  // Only compress images
  if (!file.type.startsWith("image/")) return noOp;
  // Skip tiny files — compression overhead isn't worth it
  if (file.size <= sizeThresholdBytes) return noOp;

  try {
    const useWebP = supportsWebP();
    const compressed = await resizeAndEncode(file, useWebP);
    const finalSizeBytes = compressed.size;

    // If compression made it bigger, return original
    if (finalSizeBytes >= originalSizeBytes) {
      console.warn("[compressImage] Compressed file is larger than original — using original");
      return noOp;
    }

    const ratio = finalSizeBytes / originalSizeBytes;
    const format = useWebP ? "webp" : "jpeg";
    console.log(
      `[compressImage] ${file.name}: ${(originalSizeBytes / 1024 / 1024).toFixed(1)}MB → ${(finalSizeBytes / 1024 / 1024).toFixed(1)}MB (${Math.round((1 - ratio) * 100)}% smaller, ${format})`
    );

    return { file: compressed, compressed: true, originalSizeBytes, finalSizeBytes, compressionRatio: ratio, format };
  } catch (err) {
    console.warn("[compressImage] Compression failed — using original file:", err);
    return noOp;
  }
}

async function resizeAndEncode(file: File, useWebP: boolean): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // Scale down to fit within MAX_DIMENSION (maintain aspect ratio)
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }

      // Fill white background (safe for transparent PNGs → JPEG/WebP)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = useWebP ? "image/webp" : "image/jpeg";
      const quality = useWebP ? WEBP_QUALITY : JPEG_QUALITY;
      const ext = useWebP ? ".webp" : ".jpg";

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("canvas.toBlob returned null"));
            return;
          }
          const outputName = file.name.replace(/\.[^.]+$/, "") + ext;
          resolve(new File([blob], outputName, { type: mimeType, lastModified: Date.now() }));
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for compression"));
    };

    img.src = objectUrl;
  });
}
