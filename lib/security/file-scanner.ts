/**
 * lib/security/file-scanner.ts
 *
 * Reusable server-side file security primitives.
 *
 * Extracted from app/api/cron/scan-files/route.ts so they can be:
 *  - Unit tested independently
 *  - Reused by future scan endpoints or webhooks
 *  - Maintained in one place
 *
 * References:
 *  - OWASP Testing Guide — PDF Malware
 *  - CVE-2010-0188 (Adobe Reader embedded file exploit)
 *  - Didier Stevens — PDF Analysis Techniques
 */

// ─── Layer 1: Magic Byte Validation ─────────────────────────────────────────
// Validates the file's true type against its first bytes.
// Rejects files that lie about their type via extension spoofing.

export interface MagicByteResult {
  valid: boolean;
  /** Detected MIME type if valid */
  type?: string;
}

/**
 * Checks the magic bytes (file signature) of a file buffer.
 * Only inspects the first 12 bytes — no full parse needed.
 */
export function validateMagicBytes(buffer: ArrayBuffer): MagicByteResult {
  const arr = new Uint8Array(buffer).subarray(0, 12);
  const hex = Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  if (hex.startsWith("25504446")) return { valid: true, type: "application/pdf" }; // %PDF
  if (hex.startsWith("FFD8FF")) return { valid: true, type: "image/jpeg" };
  if (hex.startsWith("89504E47")) return { valid: true, type: "image/png" };
  if (hex.startsWith("52494646")) return { valid: true, type: "image/webp" }; // RIFF → WebP container

  return { valid: false };
}

// ─── Layer 2: PDF Threat Content Analysis ──────────────────────────────────
// Scans the raw PDF byte stream for known malicious object patterns.
//
// PDFs are document-format containers — malware is embedded via JavaScript
// actions, auto-open triggers, launch actions, and embedded executables.
// We scan the raw bytes (decoded as latin-1 to preserve all byte values)
// because PDF content streams can be partially decoded without a full parser.

export interface ThreatPattern {
  /** Regex tested against the decoded PDF text */
  pattern: RegExp;
  /** Human-readable threat description for audit logs */
  description: string;
  /** Risk severity */
  severity: "high" | "medium" | "low";
}

export const PDF_THREAT_PATTERNS: ThreatPattern[] = [
  // ── High severity — direct code execution ────────────────────────────────
  {
    pattern: /\/JavaScript\s*[<([\s]/i,
    description: "Embedded JavaScript action",
    severity: "high",
  },
  {
    pattern: /\/JS\s*[<([\s]/i,
    description: "Embedded JavaScript (short form)",
    severity: "high",
  },
  {
    pattern: /\/OpenAction\s*[<[\/]/i,
    description: "Auto-execute action on document open",
    severity: "high",
  },
  {
    pattern: /\/Launch\s*[<[\/]/i,
    description: "Launch external application action",
    severity: "high",
  },
  {
    pattern: /\/EmbeddedFile\s/i,
    description: "Embedded file object (potential dropper)",
    severity: "high",
  },
  {
    pattern: /app\.alert\s*\(/i,
    description: "Acrobat JavaScript alert call",
    severity: "high",
  },
  {
    pattern: /app\.exec\s*\(/i,
    description: "Acrobat JavaScript exec call",
    severity: "high",
  },
  // ── Medium severity — suspicious but not always malicious ───────────────
  {
    pattern: /\/AA\s*[<[\/]/i,
    description: "Additional Actions dictionary (auto-trigger)",
    severity: "medium",
  },
  {
    pattern: /\/RichMedia\s/i,
    description: "RichMedia annotation (Flash/video embed)",
    severity: "medium",
  },
  {
    pattern: /\/XFA\s/i,
    description: "XFA form (legacy, exploitable in old Acrobat)",
    severity: "medium",
  },
  // ── Low severity — informational, flag but don't block ──────────────────
  {
    pattern: /\/URI\s*\(\s*https?:\/\//i,
    description: "External URI link",
    severity: "low",
  },
];

export interface PdfAnalysisResult {
  /** Whether the file should be quarantined */
  infected: boolean;
  /** All matched patterns (for audit log) */
  threats: Array<{ description: string; severity: string }>;
  /** Highest severity found */
  maxSeverity: "high" | "medium" | "low" | null;
}

/**
 * Scans a PDF buffer for known malicious content patterns.
 * Only applies to files confirmed as PDF via magic byte check.
 *
 * Decodes as latin-1 (ISO-8859-1) — maps each byte to the corresponding
 * Unicode code point, preserving all byte values for regex scanning.
 * This is safe for pattern matching even on compressed/encoded streams
 * because PDF object dictionaries (where threat keywords live) are always
 * in plain ASCII.
 */
export function analyzePdfContent(buffer: ArrayBuffer): PdfAnalysisResult {
  const text = new TextDecoder("iso-8859-1").decode(buffer);

  const threats: Array<{ description: string; severity: string }> = [];

  for (const { pattern, description, severity } of PDF_THREAT_PATTERNS) {
    // Reset stateful regex before each test (important for /g flag safety)
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      threats.push({ description, severity });
    }
  }

  const highThreat = threats.some((t) => t.severity === "high");
  const mediumThreat = threats.some((t) => t.severity === "medium");

  // Block on ANY high-severity threat.
  // Medium is flagged in the log but currently allowed (can be tightened via config).
  const infected = highThreat;

  const maxSeverity = highThreat
    ? "high"
    : mediumThreat
    ? "medium"
    : threats.length > 0
    ? "low"
    : null;

  return { infected, threats, maxSeverity };
}
