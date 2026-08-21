/**
 * Singleton order notification audio manager.
 *
 * ARCHITECTURE
 * ────────────
 * Primary:  Supabase Storage — audio/notifications/new-order.mp3
 *           URL is fetched ONCE from /api/audio/notification on dashboard load,
 *           cached in a module-level Promise, and reused for every notification.
 *
 * Fallback: Web Audio API oscillator beep — guarantees an audible alert even
 *           when Supabase Storage is unreachable or the browser blocks autoplay.
 *
 * WHY A SINGLETON?
 * ────────────────
 * Browser autoplay policy (Chrome ≥ 66, Safari, Edge) tracks unlock state
 * PER AUDIO OBJECT, not per-URL or per-page. If you create `new Audio()` in
 * the unlock handler and a different `new Audio()` in the playback handler,
 * the browser considers the playback object brand-new and unverified — every
 * `.play()` call is rejected with NotAllowedError.
 *
 * By sharing ONE HTMLAudioElement between unlock and play, the unlock gesture
 * applies to the exact object that will later play notifications.
 *
 * WHY MODULE-LEVEL URL CACHING?
 * ─────────────────────────────
 * We fetch /api/audio/notification exactly ONCE per browser session.
 * The promise is stored at module scope, so:
 *   - Multiple concurrent calls await the same fetch (no duplicate requests)
 *   - Route changes / React re-renders do not re-fetch
 *   - Orders 1, 2, 3 … all reuse the same cached URL
 *
 * LIFECYCLE
 * ──────────
 * 1. `initializeOrderNotificationAudio()` — called once from AudioInitializer
 *    on dashboard mount. Fetches the Supabase Storage URL, creates the Audio
 *    element, sets preload="auto" so the MP3 buffers before any order arrives.
 *
 * 2. `unlockAudio()` — called once on the first user gesture (click / touch /
 *    keydown). Plays at volume 0 then immediately pauses. Satisfies the
 *    browser's "user gesture required" rule without any audible blip.
 *    After this call, `.play()` on the SAME singleton object is always allowed.
 *
 * 3. `playOrderNotification()` — called by notificationStore.addNotification()
 *    after deduplication. Resets currentTime to 0 so rapid back-to-back orders
 *    each play from the start, then calls `.play()`.
 *    Errors are caught — a blocked play never crashes the UI.
 *    Falls back to Web Audio API beep.
 *
 * SSR SAFETY
 * ──────────
 * All `window`, `document`, `Audio`, and `AudioContext` references are guarded
 * by `typeof window !== "undefined"` or are inside functions that are only
 * called from client-side effects / event handlers. No SSR hydration errors.
 */

const isDev = process.env.NODE_ENV !== "production";

// ─── Module-level singleton state ────────────────────────────────────────────

/** Cached promise for the Supabase Storage audio URL. Fetched at most once. */
let audioUrlPromise: Promise<string | null> | null = null;

/** The single HTMLAudioElement used for all notification sounds. */
let audioInstance: HTMLAudioElement | null = null;

/** True once the browser's autoplay policy has been unlocked via user gesture. */
let audioUnlocked = false;

/** True if the MP3 load failed — causes immediate fallback to beep. */
let mp3LoadFailed = false;

// ─── URL fetching ─────────────────────────────────────────────────────────────

/**
 * Fetch the Supabase Storage audio URL from the server API.
 * Network errors → returns null (triggers fallback beep).
 * Never throws.
 */
async function fetchAudioUrl(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const response = await fetch("/api/audio/notification", {
      // Allow browser/CDN caching — the URL is stable for hours
      cache: "default",
    });

    if (!response.ok) {
      if (isDev) console.warn("[AUDIO] /api/audio/notification returned", response.status);
      return null;
    }

    const json = await response.json() as { success: boolean; url?: string };

    if (!json.success || !json.url) {
      if (isDev) console.warn("[AUDIO] /api/audio/notification: success=false or empty URL");
      return null;
    }

    if (isDev) console.log("[AUDIO] ✅ Supabase Storage audio URL received:", json.url);
    return json.url;
  } catch (err) {
    // Network failure (offline, ERR_NAME_NOT_RESOLVED, etc.) — silent, use fallback
    if (isDev) console.warn("[AUDIO] Failed to fetch audio URL:", err);
    return null;
  }
}

/**
 * Return the cached Supabase Storage audio URL, fetching it once if needed.
 * Concurrent callers await the same Promise — no duplicate network requests.
 */
async function getNotificationAudioUrl(): Promise<string | null> {
  if (!audioUrlPromise) {
    audioUrlPromise = fetchAudioUrl();
  }
  return audioUrlPromise;
}

// ─── Audio element lifecycle ──────────────────────────────────────────────────

/**
 * Get (or lazily create) the singleton Audio element.
 * Creates the element only after the Supabase Storage URL is known.
 * Returns null on SSR or if the URL could not be retrieved.
 */
async function getAudioInstance(): Promise<HTMLAudioElement | null> {
  if (typeof window === "undefined") return null;

  // Return existing instance immediately (synchronous fast-path)
  if (audioInstance) return audioInstance;

  const url = await getNotificationAudioUrl();
  if (!url) return null;

  // Double-check: another concurrent call may have created the instance
  if (audioInstance) return audioInstance;

  if (isDev) console.log("[AUDIO] Creating HTMLAudioElement with Supabase Storage URL");

  const audio = new Audio(url);
  audio.preload = "auto";

  audio.addEventListener(
    "canplaythrough",
    () => {
      if (isDev) console.log("[AUDIO] ✅ MP3 buffered and ready:", url);
    },
    { once: true }
  );

  audio.addEventListener(
    "error",
    (e) => {
      const err = (e.target as HTMLAudioElement).error;
      console.error("[AUDIO] ❌ MP3 load error:", err?.message ?? e);
      mp3LoadFailed = true;
      // Reset URL cache so the next call retries the URL fetch
      audioUrlPromise = null;
    },
    { once: true }
  );

  audioInstance = audio;
  return audio;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pre-fetch the Supabase Storage URL and begin buffering the MP3.
 *
 * Call this once when the shop dashboard mounts (from AudioInitializer).
 * By the time the first order arrives, the MP3 will already be cached in
 * the browser — zero latency notification sound.
 *
 * Safe to call multiple times — idempotent due to module-level caching.
 */
export async function initializeOrderNotificationAudio(): Promise<void> {
  if (typeof window === "undefined") return;

  // getAudioInstance() fetches the URL and creates the element (if not done yet)
  await getAudioInstance();
}

/**
 * Unlock browser autoplay on the first user gesture.
 *
 * Plays the singleton audio at volume 0 then immediately pauses.
 * This satisfies Chrome/Safari/Edge autoplay policy without an audible blip.
 * After this call, `.play()` on the SAME object is always permitted from
 * async notification handlers.
 *
 * Returns true if unlock succeeded, false if the audio is not yet initialized
 * or the browser blocked even the silent play.
 */
export async function unlockAudio(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (audioUnlocked) return true;

  try {
    // getAudioInstance ensures the element exists before we try to unlock
    const audio = await getAudioInstance();
    if (!audio) return false;

    if (isDev) console.log("[AUDIO] Attempting autoplay unlock on first user interaction");

    audio.volume = 0;
    const playPromise = audio.play();

    if (playPromise !== undefined) {
      await playPromise;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1; // restore for real notifications
      audioUnlocked = true;
      if (isDev) console.log("[AUDIO] ✅ Autoplay unlocked");
      return true;
    }

    return false;
  } catch (err) {
    if (isDev) console.warn("[AUDIO] Autoplay unlock failed (browser policy):", err);
    return false;
  }
}

/**
 * Play the Web Audio API fallback beep.
 * Used when the MP3 fails to load, autoplay is blocked, or Supabase Storage
 * is temporarily unavailable.
 * A short pleasant notification tone (880 Hz → 440 Hz, 350ms).
 */
function playFallbackBeep(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);        // A5 — pleasant ding
    oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15); // drop to A4

    gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.35);

    // Close context after tone finishes to free resources
    setTimeout(() => ctx.close().catch(() => {}), 500);

    if (isDev) console.log("[AUDIO] ✅ Fallback beep played");
  } catch (err) {
    if (isDev) console.error("[AUDIO] Fallback beep failed:", err);
  }
}

/**
 * Play the new-order notification sound.
 *
 * Priority:
 *   1. Supabase Storage MP3  (audio/notifications/new-order.mp3)
 *   2. Web Audio API beep    (if MP3 unavailable or autoplay blocked)
 *   3. Silent               (if Web Audio also unavailable)
 *
 * Called by notificationStore.addNotification() after deduplication by
 * processedSoundIds — this function is never called twice for the same
 * notification ID.
 *
 * @param notificationId - used only for dev logging
 */
export function playOrderNotification(notificationId: string): void {
  if (typeof window === "undefined") return;

  if (isDev) console.log("[AUDIO] Playing new-order sound for notification:", notificationId);

  // If the MP3 is known to have failed, go straight to beep
  if (mp3LoadFailed) {
    if (isDev) console.log("[AUDIO] MP3 unavailable — using Web Audio fallback beep");
    playFallbackBeep();
    return;
  }

  // Async play: getAudioInstance() fast-paths via the cached singleton
  (async () => {
    try {
      const audio = await getAudioInstance();

      if (!audio) {
        // URL fetch failed or SSR — use beep
        playFallbackBeep();
        return;
      }

      audio.currentTime = 0;
      audio.volume = 1;

      await audio.play();

      if (isDev) console.log("[AUDIO] ✅ Supabase Storage MP3 played for:", notificationId);
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        // Autoplay blocked — user has not yet interacted with the page
        if (isDev) console.warn("[AUDIO] Play blocked (NotAllowedError) — using fallback beep");
      } else {
        if (isDev) console.warn("[AUDIO] Play failed:", err?.name, err?.message, "— using fallback beep");
      }
      playFallbackBeep();
    }
  })();
}
