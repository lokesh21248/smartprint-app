/**
 * Singleton order notification audio manager.
 *
 * WHY A SINGLETON?
 * ─────────────────
 * Browser autoplay policy (Chrome ≥ 66, Safari, Edge) tracks unlock state
 * PER AUDIO OBJECT, not per-URL or per-page. If you create `new Audio()` in
 * the unlock handler and a different `new Audio()` in the playback handler,
 * the browser considers the playback object brand-new and unverified — every
 * `.play()` call is rejected with NotAllowedError.
 *
 * By sharing ONE HTMLAudioElement between unlock and play, the unlock gesture
 * applies to the exact object that will later play notifications.
 *
 * LIFECYCLE
 * ──────────
 * 1. `initOrderNotificationAudio()` — called once at module import time
 *    (client-only). Creates the element, sets preload="auto".
 *
 * 2. `unlockAudio()` — called once on the first user gesture (click / touch /
 *    keydown). Plays the file at volume 0 then immediately pauses. This
 *    satisfies the browser's "user gesture required" rule without any
 *    audible blip. After this call, `.play()` on the SAME object is
 *    always allowed, even from async event handlers.
 *
 * 3. `playOrderNotification()` — called by the realtime INSERT handler.
 *    Resets `currentTime` to 0 so overlapping orders each play from the
 *    start, then calls `.play()`. Errors are caught and logged — a blocked
 *    play never crashes the UI.
 */

const SOUND_PATH = "/sounds/new-order.mp3";
const isDev = process.env.NODE_ENV !== "production";

// Module-level singleton — one instance per browser tab, for the entire
// page lifetime. Never reassigned after the first initialization.
let _audio: HTMLAudioElement | null = null;
let _unlocked = false;

/** Initialize the singleton audio element (client-side only). */
function initOrderNotificationAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (_audio) return _audio;

  try {
    _audio = new Audio(SOUND_PATH);
    _audio.preload = "auto";
    _audio.volume = 1;
    if (isDev) console.log("[ORDER AUDIO] Singleton initialized:", SOUND_PATH);
  } catch (err) {
    if (isDev) console.error("[ORDER AUDIO] Failed to initialize singleton:", err);
    return null;
  }

  return _audio;
}

// Initialize immediately on module import (client-only — SSR guard is inside
// initOrderNotificationAudio). This gives the browser maximum time to buffer
// the audio file before any order arrives.
initOrderNotificationAudio();

/**
 * Call once on the first user gesture (click / touchstart / keydown).
 *
 * Plays the audio at volume 0 and immediately pauses it. This is enough for
 * Chrome/Safari/Edge to consider the element "user-gesture-activated" — all
 * future `.play()` calls on this SAME element are then allowed without
 * restrictions, even from async Supabase realtime callbacks.
 */
export async function unlockAudio(): Promise<void> {
  if (_unlocked) return;

  const audio = initOrderNotificationAudio();
  if (!audio) return;

  try {
    audio.volume = 0;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
    _unlocked = true;
    if (isDev) console.log("[ORDER AUDIO] ✅ Autoplay unlocked via user gesture.");
  } catch (err) {
    // This can happen on mobile if the gesture is too indirect.
    // Not fatal — we just try again on the next interaction.
    if (isDev) console.warn("[ORDER AUDIO] Unlock failed (will retry on next gesture):", err);
  }
}

/**
 * Play the order notification sound.
 *
 * Safe to call from any async context (Supabase realtime handler, setTimeout,
 * Promise callbacks). Errors are caught and logged — never thrown.
 *
 * If the audio hasn't been unlocked yet (user never interacted with page),
 * the call will still attempt to play. In that case the browser may allow it
 * if the tab was freshly opened by the user, or block it and log a warning.
 */
export async function playOrderNotification(orderId: string): Promise<void> {
  const audio = initOrderNotificationAudio();
  if (!audio) return;

  try {
    // Reset to start so rapid back-to-back orders each play fully
    audio.currentTime = 0;
    audio.volume = 1;

    await audio.play();

    if (isDev) console.log(`[ORDER AUDIO] ✅ Notification played for order: ${orderId}`);
  } catch (err) {
    if (isDev) {
      console.warn(
        `[ORDER AUDIO] ⚠️ Playback blocked for order "${orderId}" —`,
        "user may not have interacted with the page yet.",
        err
      );
    }
  }
}
