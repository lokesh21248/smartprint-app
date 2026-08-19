/**
 * Singleton order notification audio manager.
 *
 * ARCHITECTURE
 * ────────────
 * Primary:  /sounds/new-order.mp3 (local static file, served by Next.js,
 *           zero network latency, no Supabase dependency)
 * Fallback: Web Audio API oscillator beep (guarantees audible alert even
 *           if the MP3 fails to load, e.g. first visit before caching)
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
 * LIFECYCLE
 * ──────────
 * 1. `initOrderNotificationAudio()` — called once at module import time
 *    (client-only). Creates the element, sets preload="auto", attaches error
 *    listener so MP3 load failures are logged (never silently swallowed).
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
 *    play never crashes the UI. Falls back to Web Audio API beep.
 */

// Primary: local static file — no Supabase dependency, instant load
const SOUND_PATH = "/sounds/new-order.mp3";

const isDev = process.env.NODE_ENV !== "production";

let audioInstance: HTMLAudioElement | null = null;
let audioUnlocked = false;
let mp3LoadFailed = false;

function getAudioInstance(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audioInstance) {
    if (isDev) console.log("[AUDIO] initializing notification sound");

    audioInstance = new Audio(SOUND_PATH);
    audioInstance.preload = "auto";

    audioInstance.addEventListener("canplaythrough", () => {
      if (isDev) console.log("[AUDIO] audio URL loaded:", SOUND_PATH);
    }, { once: true });

    audioInstance.addEventListener("error", (e) => {
      const err = (e.target as HTMLAudioElement).error;
      console.error("[AUDIO] MP3 load failed:", err?.message ?? e);
      mp3LoadFailed = true;
    }, { once: true });
  }
  return audioInstance;
}

// Eagerly initialize on module load (client only) so the audio element
// is created and starts buffering before any notification arrives.
if (typeof window !== "undefined") {
  getAudioInstance();
}

export async function unlockAudio(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (audioUnlocked) return true;

  try {
    const audio = getAudioInstance();
    if (!audio) return false;

    if (isDev) console.log("[AUDIO] attempting audio unlock on first user interaction");

    // Play and immediately pause at volume 0 to unlock without sound
    audio.volume = 0;
    const playPromise = audio.play();

    if (playPromise !== undefined) {
      await playPromise;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1; // restore volume for actual notifications
      audioUnlocked = true;
      if (isDev) console.log("[AUDIO] audio unlocked ✅");
      return true;
    }
    return false;
  } catch (err) {
    if (isDev) console.warn("[AUDIO] audio unlock failed:", err);
    return false;
  }
}

/**
 * Play the Web Audio API fallback beep.
 * Used when the MP3 fails to load or autoplay is blocked.
 * A short pleasant notification tone (440 Hz, 150ms).
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

    // Close context after tone finishes
    setTimeout(() => ctx.close().catch(() => {}), 500);

    if (isDev) console.log("[AUDIO] fallback beep played ✅");
  } catch (err) {
    if (isDev) console.error("[AUDIO] fallback beep failed:", err);
  }
}

export function playOrderNotification(notificationId: string): void {
  if (typeof window === "undefined") return;

  if (isDev) console.log("[AUDIO] playing new-order sound for notification:", notificationId);

  // If the MP3 is known to have failed, go straight to fallback
  if (mp3LoadFailed) {
    if (isDev) console.log("[AUDIO] MP3 unavailable — using Web Audio API fallback beep");
    playFallbackBeep();
    return;
  }

  try {
    const audio = getAudioInstance();
    if (!audio) {
      playFallbackBeep();
      return;
    }

    audio.currentTime = 0;
    audio.volume = 1;

    audio.play()
      .then(() => {
        if (isDev) console.log("[AUDIO] ✅ notification played for:", notificationId);
      })
      .catch((err: Error) => {
        if (err.name === "NotAllowedError") {
          // Autoplay restriction — audio not yet unlocked (user hasn't interacted)
          if (isDev) console.warn("[AUDIO] play blocked (NotAllowedError) — audio not unlocked yet. Using fallback beep.");
          playFallbackBeep();
        } else {
          if (isDev) console.warn("[AUDIO] play failed:", err.name, err.message, "— using fallback beep");
          playFallbackBeep();
        }
      });
  } catch (err) {
    if (isDev) console.error("[AUDIO] play error:", err);
    playFallbackBeep();
  }
}
