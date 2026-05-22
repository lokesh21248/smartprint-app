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
 * - Re-encode as JPEG at JPEG_QUALITY
 * - Fall back to original file if canvas API fails
 *
 * Typical results on mobile:
 * - 5MB HEIC/PNG → ~400KB JPEG  (~8x compression)
 * - 2MB JPEG → ~700KB JPEG      (~3x compression, already small)
 */

const MAX_DIMENSION = 1600;      // px — max width or height after resize
const JPEG_QUALITY = 0.82;       // 0–1 — good balance of quality vs size
const SIZE_THRESHOLD_BYTES = 3 * 1024 * 1024; // Only compress if > 3MB

export interface CompressionResult {
  file: File;
  compressed: boolean;
  originalSizeBytes: number;
  finalSizeBytes: number;
  compressionRatio: number; // 0–1, lower = more compressed
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
  };

  // Only compress images
  if (!file.type.startsWith("image/")) return noOp;
  // Skip tiny files — compression overhead isn't worth it
  if (file.size <= sizeThresholdBytes) return noOp;

  try {
    const compressed = await resizeAndEncode(file);
    const finalSizeBytes = compressed.size;

    // If compression made it bigger somehow, return original
    if (finalSizeBytes >= originalSizeBytes) {
      console.warn("[compressImage] Compressed file is larger than original — using original");
      return noOp;
    }

    const ratio = finalSizeBytes / originalSizeBytes;
    console.log(
      `[compressImage] ${file.name}: ${(originalSizeBytes / 1024 / 1024).toFixed(1)}MB → ${(finalSizeBytes / 1024 / 1024).toFixed(1)}MB (${Math.round((1 - ratio) * 100)}% smaller)`
    );

    return { file: compressed, compressed: true, originalSizeBytes, finalSizeBytes, compressionRatio: ratio };
  } catch (err) {
    console.warn("[compressImage] Compression failed — using original file:", err);
    return noOp;
  }
}

async function resizeAndEncode(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // Scale down to fit within MAX_DIMENSION
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

      // Fill white background (for transparent PNGs converted to JPEG)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("canvas.toBlob returned null"));
            return;
          }
          // Preserve original name but mark as JPEG
          const outputName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
          resolve(new File([blob], outputName, { type: "image/jpeg", lastModified: Date.now() }));
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for compression"));
    };

    img.src = objectUrl;
  });
}
