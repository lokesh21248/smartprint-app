import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

// Centralized configuration for the notification sound
const NOTIFICATION_AUDIO_PATH = "audio/notifications/new-order.mp3";
const isDev = process.env.NODE_ENV !== "production";

class NotificationSoundManager {
  private audio: HTMLAudioElement | null = null;
  private unlocked = false;
  private loadAttempted = false;
  private toastShown = false;

  constructor() {
    // Only initialize on the client — module may be imported on the server
    if (typeof window !== "undefined") {
      this.preload();
    }
  }

  public preload() {
    if (this.loadAttempted || typeof window === "undefined") return;
    this.loadAttempted = true;

    try {
      const supabase = createClient();
      const [bucket, ...rest] = NOTIFICATION_AUDIO_PATH.split("/");
      const path = rest.join("/");

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      const url = data.publicUrl;

      if (isDev) console.log(`[NotificationSound] 🎧 Preloading from: ${url}`);

      this.audio = new Audio(url);
      this.audio.preload = "auto";
      this.audio.setAttribute("playsinline", "true");
      this.audio.volume = 0.7;
      this.audio.muted = false;

      this.audio.addEventListener("canplaythrough", () => {
        if (isDev) console.log("[NotificationSound] ✅ Audio loaded and ready to play.");
      }, { once: true });

      this.audio.addEventListener("error", (e) => {
        console.error("[NotificationSound] ❌ Audio load error:", (e.target as HTMLAudioElement)?.error);
      });

    } catch (err) {
      console.error("[NotificationSound] ❌ Failed to preload:", err);
    }
  }

  /**
   * Call this from a user interaction (click/keydown) to satisfy browser autoplay policy.
   * Plays and immediately pauses at position 0 to "warm up" the audio element.
   * Sets this.unlocked = true only after the warm-up succeeds.
   */
  public unlock() {
    if (this.unlocked || !this.audio) return;

    if (isDev) console.log("[NotificationSound] 🔓 Unlocking browser audio...");

    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this.audio!.pause();
          this.audio!.currentTime = 0;
          this.unlocked = true;
          if (isDev) console.log("[NotificationSound] ✅ Browser audio unlocked successfully.");
        })
        .catch((err) => {
          // This is expected if called before full load — not a fatal error
          if (isDev) console.warn("[NotificationSound] ⚠️ Unlock deferred (audio not ready):", err.message);
        });
    }
  }

  public async play() {
    if (!this.audio) {
      if (isDev) console.warn("[NotificationSound] Audio not initialized — attempting preload.");
      this.preload();
      return;
    }

    if (isDev) {
      console.log(
        `[Audio] PLAY ATTEMPT — readyState=${this.audio.readyState}, unlocked=${this.unlocked}, muted=${this.audio.muted}, volume=${this.audio.volume}`
      );
    }

    try {
      this.audio.currentTime = 0;
      const promise = this.audio.play();

      if (promise !== undefined) {
        promise
          .then(() => {
            if (isDev) console.log("[Audio] PLAY SUCCESS ✅");
          })
          .catch((err: Error) => {
            if (err.name === "NotAllowedError") {
              if (isDev) console.warn("[Audio] PLAY FAILED — NotAllowedError (autoplay blocked by browser)");

              // Show a one-time, unobtrusive toast so the user can enable audio
              if (!this.toastShown) {
                this.toastShown = true;
                toast("🔔 Enable notification sounds", {
                  description: "Click below to allow audio alerts for new orders.",
                  action: {
                    label: "Enable Sound",
                    onClick: () => {
                      this.unlock();
                      this.toastShown = false; // allow re-show if they dismiss without clicking
                      toast.success("Notification sounds enabled");
                    },
                  },
                  duration: 10000,
                });
              }
            } else {
              console.error("[Audio] PLAY FAILED —", err.name, err.message);
            }
          });
      }
    } catch (err) {
      console.error("[NotificationSound] ❌ Unexpected play error:", err);
    }
  }
}

export const notificationSoundManager = new NotificationSoundManager();
