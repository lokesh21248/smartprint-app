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

const SOUND_PATH = "/api/audio/notification";
const isDev = process.env.NODE_ENV !== "production";

/**
 * Modern browsers (Chrome, Safari, Edge) track user activation at the document level.
 * Once the user clicks anywhere on the page, the document is granted autoplay rights.
 * We no longer need a complex singleton or unlock gestures—just create and play.
 */

export async function unlockAudio(): Promise<boolean> {
  // Autoplay is handled by the browser's document-level user activation.
  // This function is kept for backward compatibility with AudioInitializer.
  return true;
}

export function playOrderNotification(orderId: string): void {
  if (typeof window === "undefined") return;

  try {
    const audio = new Audio(SOUND_PATH);
    audio.play().then(() => {
      if (isDev) console.log(`[ORDER AUDIO] ✅ Notification played for order: ${orderId}`);
    }).catch((err) => {
      if (isDev) console.warn(`[ORDER AUDIO] ⚠️ Playback blocked for order "${orderId}"`, err);
    });
  } catch (err) {
    if (isDev) console.error(`[ORDER AUDIO] Failed to initialize audio for order: ${orderId}`, err);
  }
}
