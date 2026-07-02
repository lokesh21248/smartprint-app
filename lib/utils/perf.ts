/**
 * perf.ts
 *
 * Production-safe performance timers.
 *
 * console.time / console.timeEnd incur V8 timer allocation + stdout writes on
 * every call. In production, this adds 1–3ms per hot endpoint and inflates
 * Vercel log ingestion costs.
 *
 * Usage:
 *   import { perfStart, perfEnd } from "@/lib/utils/perf";
 *   perfStart("[orders:POST:total]");
 *   // ... work ...
 *   perfEnd("[orders:POST:total]");
 *
 * Enable in production by setting: PERF_LOG=true (Vercel env var)
 */

const PERF_ENABLED = process.env.PERF_LOG === "true";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop = (_label: string) => {};

export const perfStart: (label: string) => void = PERF_ENABLED
  ? (label) => console.time(label)
  : noop;

export const perfEnd: (label: string) => void = PERF_ENABLED
  ? (label) => console.timeEnd(label)
  : noop;
