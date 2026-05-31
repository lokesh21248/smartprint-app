/**
 * Scan2PaperLogo — reusable SVG logo component.
 *
 * Props:
 *  - variant: "full" (icon + wordmark) | "icon" (icon only)
 *  - size:    controls the icon height in px (wordmark scales proportionally)
 *  - color:   "color" (charcoal + blue accent) | "mono" (all charcoal)
 *  - className: extra Tailwind / CSS classes on the wrapper <div>
 */

import React from "react";
import { cn } from "@/lib/utils";

interface Scan2PaperLogoProps {
  variant?: "full" | "icon";
  size?: number;
  color?: "color" | "mono";
  className?: string;
}

export function Scan2PaperLogo({
  variant = "full",
  size = 36,
  color = "color",
  className,
}: Scan2PaperLogoProps) {
  const accentColor = color === "color" ? "#2563EB" : "#111827";
  const midLayerColor = color === "color" ? "#93C5FD" : "#6B7280";
  const backLayerColor = color === "color" ? "#CBD5E1" : "#9CA3AF";
  const dotRing = color === "color" ? "#111827" : "#111827";

  // The SVG icon viewBox is 60 x 68 — scale via width/height
  const iconW = Math.round(size * (60 / 68));
  const iconH = size;

  if (variant === "icon") {
    return (
      <div className={cn("flex-shrink-0", className)} aria-label="Scan2Paper">
        <IconSVG
          width={iconW}
          height={iconH}
          accentColor={accentColor}
          midLayerColor={midLayerColor}
          backLayerColor={backLayerColor}
          dotRing={dotRing}
        />
      </div>
    );
  }

  // Full variant: icon above wordmark, stacked vertically
  const fontSize = Math.round(size * 0.45);

  return (
    <div
      className={cn("flex flex-col items-center gap-1.5", className)}
      aria-label="Scan2Paper"
    >
      <IconSVG
        width={iconW}
        height={iconH}
        accentColor={accentColor}
        midLayerColor={midLayerColor}
        backLayerColor={backLayerColor}
        dotRing={dotRing}
      />
      <span
        style={{
          fontFamily: "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif",
          fontWeight: 600,
          fontSize: `${fontSize}px`,
          letterSpacing: "-0.02em",
          color: "#111827",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        Scan
        <span style={{ color: accentColor }}>2</span>
        Paper
      </span>
    </div>
  );
}

// ─── Inline icon SVG ─────────────────────────────────────────────────────────

interface IconSVGProps {
  width: number;
  height: number;
  accentColor: string;
  midLayerColor: string;
  backLayerColor: string;
  dotRing: string;
}

function IconSVG({
  width,
  height,
  accentColor,
  midLayerColor,
  backLayerColor,
  dotRing,
}: IconSVGProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 60 68"
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      shapeRendering="geometricPrecision"
    >
      {/* ── Back layer ── */}
      <rect
        x="0" y="10"
        width="52" height="56"
        rx="5"
        fill={backLayerColor}
        transform="rotate(-11, 26, 38)"
      />

      {/* ── Middle layer ── */}
      <rect
        x="1" y="8"
        width="52" height="56"
        rx="5"
        fill={midLayerColor}
        transform="rotate(-4.5, 27, 36)"
      />

      {/* ── Front layer (primary document) ── */}
      <rect
        x="2" y="4"
        width="52" height="56"
        rx="5"
        fill={accentColor}
      />

      {/* ── Text / scan lines on front sheet ── */}
      <rect x="11" y="16" width="34" height="4" rx="2" fill="#fff" opacity="0.95" />
      <rect x="11" y="25" width="26" height="4" rx="2" fill="#fff" opacity="0.72" />
      <rect x="11" y="34" width="31" height="4" rx="2" fill="#fff" opacity="0.95" />
      <rect x="11" y="43" width="20" height="4" rx="2" fill="#fff" opacity="0.60" />
      <rect x="11" y="52" width="28" height="4" rx="2" fill="#fff" opacity="0.80" />

      {/* ── Corner scan-point dot ── */}
      <circle cx="47" cy="11" r="6" fill={dotRing} />
      <circle cx="47" cy="11" r="3.2" fill="#fff" />
    </svg>
  );
}

/**
 * Inline SVG used in <head> for og:image / social preview — returns raw SVG string.
 * Not a React component; use in scripts or server-side generation only.
 */
export const SCAN2PAPER_SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 68" shape-rendering="geometricPrecision">
  <rect x="0" y="10" width="52" height="56" rx="5" fill="#CBD5E1" transform="rotate(-11, 26, 38)"/>
  <rect x="1" y="8"  width="52" height="56" rx="5" fill="#93C5FD" transform="rotate(-4.5, 27, 36)"/>
  <rect x="2" y="4"  width="52" height="56" rx="5" fill="#2563EB"/>
  <rect x="11" y="16" width="34" height="4" rx="2" fill="#fff" opacity="0.95"/>
  <rect x="11" y="25" width="26" height="4" rx="2" fill="#fff" opacity="0.72"/>
  <rect x="11" y="34" width="31" height="4" rx="2" fill="#fff" opacity="0.95"/>
  <rect x="11" y="43" width="20" height="4" rx="2" fill="#fff" opacity="0.60"/>
  <rect x="11" y="52" width="28" height="4" rx="2" fill="#fff" opacity="0.80"/>
  <circle cx="47" cy="11" r="6"   fill="#111827"/>
  <circle cx="47" cy="11" r="3.2" fill="#fff"/>
</svg>`;
