const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Paths
const rootDir = path.resolve(__dirname, '..');
const svgPath = path.join(rootDir, 'public', 'logo.svg');
const appFaviconPath = path.join(rootDir, 'app', 'favicon.ico');
const appIconPath = path.join(rootDir, 'app', 'icon.png');
const publicFaviconPath = path.join(rootDir, 'public', 'favicon.ico');
const publicIcon192Path = path.join(rootDir, 'public', 'icon-192.png');
const publicIcon512Path = path.join(rootDir, 'public', 'icon-512.png');
const publicAppleTouchIconPath = path.join(rootDir, 'public', 'apple-touch-icon.png');

// Helper to create ICO from PNG buffers
function createIco(pngBuffers) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Icon type
  header.writeUInt16LE(pngBuffers.length, 4); // Number of images

  const entries = [];
  let currentOffset = 6 + 16 * pngBuffers.length;

  for (const png of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(png.width >= 256 ? 0 : png.width, 0);
    entry.writeUInt8(png.height >= 256 ? 0 : png.height, 1);
    entry.writeUInt8(0, 2); // Color palette size
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(png.data.length, 8); // Image size
    entry.writeUInt32LE(currentOffset, 12); // Image offset
    entries.push(entry);

    currentOffset += png.data.length;
  }

  return Buffer.concat([
    header,
    ...entries,
    ...pngBuffers.map(p => p.data)
  ]);
}

async function run() {
  try {
    if (!fs.existsSync(svgPath)) {
      throw new Error(`SVG source file not found at: ${svgPath}`);
    }

    console.log('Reading logo.svg...');
    const svgBuffer = fs.readFileSync(svgPath);

    // 1. Generate PNGs at required sizes
    console.log('Generating PNG sizes...');
    const size16 = await sharp(svgBuffer).resize(16, 16).png().toBuffer();
    const size32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
    const size48 = await sharp(svgBuffer).resize(48, 48).png().toBuffer();
    const size180 = await sharp(svgBuffer).resize(180, 180).png().toBuffer();
    const size192 = await sharp(svgBuffer).resize(192, 192).png().toBuffer();
    const size512 = await sharp(svgBuffer).resize(512, 512).png().toBuffer();

    // Ensure target directories exist
    fs.mkdirSync(path.join(rootDir, 'app'), { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'public'), { recursive: true });

    // 2. Generate ICO file containing 16x16, 32x32, and 48x48
    console.log('Generating favicon.ico...');
    const icoBuffer = createIco([
      { width: 16, height: 16, data: size16 },
      { width: 32, height: 32, data: size32 },
      { width: 48, height: 48, data: size48 }
    ]);

    // 3. Write all files
    console.log('Writing files to disk...');
    
    // /app/favicon.ico
    fs.writeFileSync(appFaviconPath, icoBuffer);
    console.log(`Saved: ${appFaviconPath}`);

    // /app/icon.png
    fs.writeFileSync(appIconPath, size32);
    console.log(`Saved: ${appIconPath}`);

    // /public/favicon.ico
    fs.writeFileSync(publicFaviconPath, icoBuffer);
    console.log(`Saved: ${publicFaviconPath}`);

    // /public/icon-192.png
    fs.writeFileSync(publicIcon192Path, size192);
    console.log(`Saved: ${publicIcon192Path}`);

    // /public/icon-512.png
    fs.writeFileSync(publicIcon512Path, size512);
    console.log(`Saved: ${publicIcon512Path}`);

    // /public/apple-touch-icon.png
    fs.writeFileSync(publicAppleTouchIconPath, size180);
    console.log(`Saved: ${publicAppleTouchIconPath}`);

    console.log('✨ All favicon and icon files successfully generated!');
  } catch (error) {
    console.error('❌ Failed to generate favicons:', error);
    process.exit(1);
  }
}

run();
