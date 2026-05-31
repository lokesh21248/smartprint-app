/**
 * Scan2PaperLogo — reusable SVG logo component.
 * Matches the exact brand design: 3 stacked diamond outlines (stroke-only,
 * white fill) with the Scan2Paper wordmark below.
 *
 * Props:
 *  - variant:   "full" (icon + wordmark) | "icon" (icon only)
 *  - size:      icon height in px (wordmark scales proportionally)
 *  - color:     "color" (charcoal icon, blue "2") | "mono" (all charcoal)
 *  - className: extra Tailwind / CSS classes on the wrapper element
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
  const strokeColor = "#111827";
  const accentColor = color === "color" ? "#2563EB" : "#111827";

  // viewBox is 120 x 100; scale via width/height
  const iconW = Math.round(size * (120 / 100));
  const iconH = size;

  const icon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 100"
      width={iconW}
      height={iconH}
      aria-hidden="true"
      focusable="false"
      shapeRendering="geometricPrecision"
      overflow="visible"
    >
      {/* ── Layer 3 — back (bottommost, drawn first) ── */}
      <polygon
        points="60,41  106,68  60,95  14,68"
        fill="white"
        stroke={strokeColor}
        strokeWidth="4"
        strokeLinejoin="round"
      />

      {/* ── Layer 2 — middle ── */}
      <polygon
        points="60,29  106,56  60,83  14,56"
        fill="white"
        stroke={strokeColor}
        strokeWidth="4"
        strokeLinejoin="round"
      />

      {/* ── Layer 1 — front (topmost) ── */}
      <polygon
        points="60,17  106,44  60,71  14,44"
        fill="white"
        stroke={strokeColor}
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (variant === "icon") {
    return (
      <div className={cn("flex-shrink-0", className)} aria-label="Scan2Paper">
        {icon}
      </div>
    );
  }

  // Full variant — icon above wordmark
  const fontSize = Math.round(size * 0.52);

  return (
    <div
      className={cn("flex flex-col items-center", className)}
      style={{ gap: Math.round(size * 0.18) }}
      aria-label="Scan2Paper"
    >
      {icon}
      <span
        style={{
          fontFamily: "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif",
          fontWeight: 700,
          fontSize: `${fontSize}px`,
          letterSpacing: "-0.025em",
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

/**
 * Raw SVG string — use for og:image, email templates, or server-side rendering.
 * Not a React component.
 */
export const SCAN2PAPER_SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100" shape-rendering="geometricPrecision" overflow="visible">
  <polygon points="60,41  106,68  60,95  14,68" fill="white" stroke="#111827" stroke-width="4" stroke-linejoin="round"/>
  <polygon points="60,29  106,56  60,83  14,56" fill="white" stroke="#111827" stroke-width="4" stroke-linejoin="round"/>
  <polygon points="60,17  106,44  60,71  14,44" fill="white" stroke="#111827" stroke-width="4" stroke-linejoin="round"/>
</svg>`;
