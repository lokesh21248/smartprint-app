/**
 * fetchWithRetry.ts
 *
 * Production-grade fetch wrapper with:
 * - Exponential backoff retry (2 retries by default)
 * - AbortController signal propagation (respects existing timeouts)
 * - Selective retry: only retries 5xx/network errors, never 4xx
 * - Jitter on backoff to prevent thundering herd
 * - Structured console logging for debugging
 *
 * Usage:
 *   const res = await fetchWithRetry('/api/orders', { method: 'POST', body }, {
 *     maxRetries: 2,
 *     signal: abortController.signal,
 *     onRetry: (attempt, delay) => console.log(`Retry ${attempt} in ${delay}ms`),
 *   });
 */

export interface FetchWithRetryOptions {
  /** Max number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Base delay in ms before first retry (default: 600ms) */
  baseDelayMs?: number;
  /** AbortController signal — retries respect abort */
  signal?: AbortSignal;
  /** Called before each retry with attempt index (1-based) and delay in ms */
  onRetry?: (attempt: number, delayMs: number) => void;
}

/**
 * Sleep that cancels early if the abort signal fires.
 */
function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

/**
 * Should we retry this failure?
 * - Network errors (no response): YES
 * - HTTP 429, 500, 502, 503, 504: YES
 * - HTTP 4xx (client errors): NO — retrying won't help
 */
function isRetryable(res: Response | null, err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false; // respect abort
  if (!res) return true; // network-level failure
  return res.status === 429 || res.status >= 500;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 2,
    baseDelayMs = 600,
    signal,
    onRetry,
  } = options;

  // Cap at 2 retries (3 attempts total: 1 initial + 2 retries) to prevent infinite loops
  const cappedRetries = Math.min(maxRetries, 2);

  let lastError: unknown;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= cappedRetries; attempt++) {
    // Abort check before each attempt
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    try {
      const response = await fetch(url, { ...init, signal });

      if (!isRetryable(response, null) || attempt === cappedRetries) {
        // Return for all non-retryable responses, or final attempt
        return response;
      }

      // Retryable HTTP error (5xx / 429)
      lastResponse = response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
      lastResponse = null;

      if (!isRetryable(null, err)) {
        throw err; // AbortError or similar — don't retry
      }

      if (attempt === cappedRetries) break;
    }

    // Exponential backoff with ±20% jitter
    const base = baseDelayMs * Math.pow(2, attempt);
    const jitter = base * 0.2 * (Math.random() - 0.5);
    const delay = Math.round(base + jitter);

    console.warn(`[fetchWithRetry] attempt ${attempt + 1}/${cappedRetries} failed — retrying in ${delay}ms`);
    onRetry?.(attempt + 1, delay);

    await sleepWithAbort(delay, signal);
  }

  // All retries exhausted
  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("fetchWithRetry: all attempts failed");
}
