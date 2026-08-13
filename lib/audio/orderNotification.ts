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

let _audio: HTMLAudioElement | null = null;
let _unlocked = false;
let _unlocking = false;

/** Initialize the singleton audio element inside a user gesture. */
function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!_audio) {
    try {
      _audio = new Audio(SOUND_PATH);
      _audio.preload = "auto";
      if (isDev) console.log("[ORDER AUDIO] Audio object initialized");
    } catch (err) {
      if (isDev) console.error("[ORDER AUDIO] Failed to initialize audio:", err);
    }
  }
  return _audio;
}

/**
 * Call on user gesture to satisfy browser autoplay policies.
 * Returns true if successfully unlocked, false otherwise.
 */
export async function unlockAudio(): Promise<boolean> {
  if (_unlocked) return true;
  if (_unlocking) return false;
  
  _unlocking = true;
  
  const audio = getAudio();
  if (!audio) {
    _unlocking = false;
    return false;
  }

  try {
    audio.volume = 0;
    // Play then pause immediately to register as user-activated
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
    _unlocked = true;
    if (isDev) console.log("[ORDER AUDIO] ✅ Autoplay unlocked via user gesture.");
    return true;
  } catch (err) {
    if (isDev) console.warn("[ORDER AUDIO] Unlock failed (will retry):", err);
    return false;
  } finally {
    _unlocking = false;
  }
}

const playQueue: string[] = [];
let isPlaying = false;

async function processQueue() {
  if (isPlaying || playQueue.length === 0) return;
  isPlaying = true;

  const audio = getAudio();
  if (!audio) {
    playQueue.length = 0; // Clear queue
    isPlaying = false;
    return;
  }

  while (playQueue.length > 0) {
    const orderId = playQueue.shift();
    if (!orderId) continue;
    
    try {
      audio.currentTime = 0;
      audio.volume = 1;
      await audio.play();
      
      if (isDev) console.log(`[ORDER AUDIO] ✅ Notification played for order: ${orderId}`);
      
      // Wait for audio to finish before playing the next
      await new Promise<void>((resolve) => {
        const onEnded = () => {
          audio.removeEventListener("ended", onEnded);
          audio.removeEventListener("pause", onEnded);
          resolve();
        };
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("pause", onEnded);
        // Fallback in case events don't fire
        setTimeout(onEnded, 5000);
      });
      
    } catch (err) {
      if (isDev) {
        console.warn(`[ORDER AUDIO] ⚠️ Playback blocked for order "${orderId}"`, err);
      }
      // If playback fails, stop processing the queue
      playQueue.length = 0; 
      break;
    }
  }

  isPlaying = false;
}

export function playOrderNotification(orderId: string): void {
  playQueue.push(orderId);
  processQueue();
}
