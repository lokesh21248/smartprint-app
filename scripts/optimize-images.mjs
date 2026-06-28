/**
 * Image optimization script for Scan2Paper
 * Converts large PNG blog images to WebP format using sharp.
 *
 * Run once: node scripts/optimize-images.mjs
 * Or add as prebuild step in package.json.
 */

import { readdir, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const PUBLIC_DIR = join(process.cwd(), "public");

// Images to convert: [source, target, quality]
const CONVERSIONS = [
  { src: "blog-document-upload.png", quality: 82 },
  { src: "blog-online-orders.png",   quality: 82 },
  { src: "blog-qr-ordering.png",     quality: 82 },
  { src: "blog-shop-management.png", quality: 82 },
  { src: "logo.png",                 quality: 90 },
];

async function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function convertToWebP({ src, quality }) {
  const srcPath = join(PUBLIC_DIR, src);
  const destName = src.replace(/\.(png|jpg|jpeg)$/i, ".webp");
  const destPath = join(PUBLIC_DIR, destName);

  try {
    const srcStat = await stat(srcPath);
    const srcSize = srcStat.size;

    await sharp(srcPath)
      .webp({ quality, effort: 4 })
      .toFile(destPath);

    const destStat = await stat(destPath);
    const destSize = destStat.size;
    const savings = (((srcSize - destSize) / srcSize) * 100).toFixed(1);

    console.log(
      `✅ ${src} → ${destName}  |  ${await formatBytes(srcSize)} → ${await formatBytes(destSize)}  (-${savings}%)`
    );
  } catch (err) {
    console.error(`❌ Failed to convert ${src}:`, err.message);
  }
}

console.log("🖼  Scan2Paper image optimizer\n");
for (const conv of CONVERSIONS) {
  await convertToWebP(conv);
}
console.log("\nDone. Update image references in components to use .webp extensions.");
