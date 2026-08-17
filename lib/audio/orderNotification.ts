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

let audioInstance: HTMLAudioElement | null = null;

function getAudioInstance(): HTMLAudioElement {
  if (typeof window === "undefined") return null as any;
  if (!audioInstance) {
    audioInstance = new Audio(SOUND_PATH);
    audioInstance.preload = "auto";
  }
  return audioInstance;
}

export async function unlockAudio(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  
  try {
    const audio = getAudioInstance();
    // Play and immediately pause at volume 0 to unlock without sound
    audio.volume = 0;
    const playPromise = audio.play();
    
    if (playPromise !== undefined) {
      await playPromise;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1; // restore volume for actual notifications
      return true;
    }
    return false;
  } catch (err) {
    if (isDev) console.warn("[ORDER AUDIO] ⚠️ Audio unlock failed", err);
    return false;
  }
}

export function playOrderNotification(orderId: string): void {
  if (typeof window === "undefined") return;

  try {
    const audio = getAudioInstance();
    audio.currentTime = 0;
    audio.volume = 1;
    audio.play().then(() => {
      if (isDev) console.log(`[ORDER AUDIO] ✅ Notification played for order: ${orderId}`);
    }).catch((err) => {
      if (isDev) console.warn(`[ORDER AUDIO] ⚠️ Playback blocked for order "${orderId}"`, err);
    });
  } catch (err) {
    if (isDev) console.error(`[ORDER AUDIO] Failed to initialize audio for order: ${orderId}`, err);
  }
}
