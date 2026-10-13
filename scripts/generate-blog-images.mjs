import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const publicDir = path.join(process.cwd(), "public");

const images = [
  {
    filename: "blog-online-orders.webp",
    badge: "ONLINE PRINTING",
    title: "How Xerox Shops Can Accept Print Orders Online",
    subtitle: "Eliminate counter queues and receive PDF orders directly to your shop dashboard.",
    accentColor: "#10b981",
    bgColor1: "#064e3b",
    bgColor2: "#0f172a",
    iconSvg: `<rect x="60" y="80" width="160" height="220" rx="16" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="4"/><path d="M90 130h100M90 170h100M90 210h60" stroke="#10b981" stroke-width="4" stroke-linecap="round"/><circle cx="140" cy="260" r="10" fill="#10b981"/>`
  },
  {
    filename: "blog-revenue-growth.webp",
    badge: "BUSINESS GROWTH",
    title: "7 Ways to Increase Revenue for Your Print Shop",
    subtitle: "Proven strategies used by Indian copy centres to grow margins and repeat customers.",
    accentColor: "#f59e0b",
    bgColor1: "#78350f",
    bgColor2: "#0f172a",
    iconSvg: `<path d="M60 260 L110 200 L160 220 L220 120" stroke="#f59e0b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><polygon points="210,120 220,120 220,130" stroke="#f59e0b" stroke-width="6" fill="#f59e0b"/><rect x="70" y="270" width="20" height="40" fill="#f59e0b" fill-opacity="0.3"/><rect x="120" y="240" width="20" height="70" fill="#f59e0b" fill-opacity="0.3"/><rect x="170" y="180" width="20" height="130" fill="#f59e0b" fill-opacity="0.3"/>`
  },
  {
    filename: "blog-qr-ordering.webp",
    badge: "QR ORDERING",
    title: "QR Code Ordering for Xerox Shops: Complete Guide",
    subtitle: "Deploy counter QR codes that let walk-in customers upload documents without WhatsApp.",
    accentColor: "#3b82f6",
    bgColor1: "#1e3a8a",
    bgColor2: "#0f172a",
    iconSvg: `<rect x="70" y="90" width="140" height="140" rx="12" fill="none" stroke="#3b82f6" stroke-width="4"/><rect x="90" y="110" width="30" height="30" fill="#3b82f6"/><rect x="160" y="110" width="30" height="30" fill="#3b82f6"/><rect x="90" y="180" width="30" height="30" fill="#3b82f6"/><rect x="145" y="165" width="20" height="20" fill="#3b82f6"/><rect x="175" y="185" width="15" height="15" fill="#3b82f6"/><path d="M140 250 L140 290 M120 270 L160 270" stroke="#3b82f6" stroke-width="4" stroke-linecap="round"/>`
  },
  {
    filename: "blog-document-upload.webp",
    badge: "CUSTOMER EXPERIENCE",
    title: "Benefits of Online Document Upload for Customers",
    subtitle: "Zero wait times, encrypted transfers, instant page calculations, and private storage.",
    accentColor: "#ec4899",
    bgColor1: "#831843",
    bgColor2: "#0f172a",
    iconSvg: `<rect x="70" y="80" width="140" height="180" rx="12" fill="#ec4899" fill-opacity="0.15" stroke="#ec4899" stroke-width="4"/><path d="M140 210 L140 130 M115 155 L140 130 L165 155" stroke="#ec4899" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M100 240 h80" stroke="#ec4899" stroke-width="4" stroke-linecap="round"/>`
  },
  {
    filename: "blog-shop-management.webp",
    badge: "PRINT SHOP MANAGEMENT",
    title: "How to Manage Print Orders Efficiently with Scan2Paper",
    subtitle: "Real-time order statuses, staff delegation, peak-hour workflows, and production logs.",
    accentColor: "#8b5cf6",
    bgColor1: "#4c1d95",
    bgColor2: "#0f172a",
    iconSvg: `<rect x="50" y="90" width="180" height="130" rx="10" fill="#8b5cf6" fill-opacity="0.15" stroke="#8b5cf6" stroke-width="4"/><line x1="50" y1="125" x2="230" y2="125" stroke="#8b5cf6" stroke-width="3"/><circle cx="70" cy="108" r="4" fill="#8b5cf6"/><circle cx="85" cy="108" r="4" fill="#8b5cf6"/><path d="M100 245 L180 245 M140 220 L140 255" stroke="#8b5cf6" stroke-width="4" stroke-linecap="round"/>`
  }
];

function createSvg({ badge, title, subtitle, accentColor, bgColor1, bgColor2, iconSvg }) {
  // 1200 x 630 standard open-graph & hero article banner
  return `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgColor1}" />
      <stop offset="50%" stop-color="${bgColor2}" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="40%" r="50%">
      <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.25" />
      <stop offset="100%" stop-color="${accentColor}" stop-opacity="0" />
    </radialGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGrad)" />
  <rect width="1200" height="630" fill="url(#grid)" />
  <circle cx="950" cy="280" r="380" fill="url(#glow)" />

  <!-- Brand logo mark top-left -->
  <g transform="translate(80, 70)">
    <polygon points="24,14 44,25 24,36 4,25" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>
    <polygon points="24,8  44,19 24,30 4,19" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>
    <polygon points="24,2  44,13 24,24 4,13" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>
    <text x="56" y="24" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="20" fill="#ffffff" letter-spacing="-0.5">Scan<tspan fill="#38bdf8">2</tspan>Paper</text>
  </g>

  <!-- Badge -->
  <g transform="translate(80, 160)">
    <rect width="210" height="34" rx="17" fill="${accentColor}" fill-opacity="0.15" stroke="${accentColor}" stroke-width="1.5"/>
    <text x="105" y="22" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif" font-weight="700" font-size="12" fill="${accentColor}" text-anchor="middle" letter-spacing="1.5">${badge}</text>
  </g>

  <!-- Main Title -->
  <text x="80" y="270" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-weight="800" font-size="44" fill="#ffffff" letter-spacing="-1">
    ${escapeXml(title)}
  </text>

  <!-- Subtitle -->
  <text x="80" y="340" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-weight="400" font-size="22" fill="#94a3b8">
    ${escapeXml(subtitle)}
  </text>

  <!-- Graphic representation container -->
  <g transform="translate(860, 160)">
    <circle cx="140" cy="150" r="140" fill="${accentColor}" fill-opacity="0.08" stroke="${accentColor}" stroke-opacity="0.3" stroke-width="2"/>
    ${iconSvg}
  </g>

  <!-- Footer indicator -->
  <g transform="translate(80, 550)">
    <line x1="0" y1="0" x2="1040" y2="0" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    <text x="0" y="30" font-family="Inter, sans-serif" font-size="14" fill="#64748b" font-weight="500">Scan2Paper Publication Series</text>
    <text x="1040" y="30" font-family="Inter, sans-serif" font-size="14" fill="#64748b" text-anchor="end" font-weight="500">scan2paper.com/blog</text>
  </g>
</svg>
`.trim();
}

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

async function run() {
  console.log("Generating optimized WebP blog banners...");
  for (const item of images) {
    const svg = createSvg(item);
    const dest = path.join(publicDir, item.filename);
    await sharp(Buffer.from(svg))
      .webp({ quality: 85, effort: 4 })
      .toFile(dest);
    const stat = fs.statSync(dest);
    console.log(`✅ Generated ${item.filename} (${(stat.size / 1024).toFixed(1)} KB)`);
  }

  // Also ensure blog-revenue-growth.png exists or is webp
  const revenueWebp = path.join(publicDir, "blog-revenue-growth.webp");
  const revenuePng = path.join(publicDir, "blog-revenue-growth.png");
  if (fs.existsSync(revenueWebp) && !fs.existsSync(revenuePng)) {
    // Generate png fallback if needed
    const svgRevenue = createSvg(images[1]);
    await sharp(Buffer.from(svgRevenue)).png().toFile(revenuePng);
    console.log("✅ Generated blog-revenue-growth.png fallback");
  }
}

run().catch(console.error);
