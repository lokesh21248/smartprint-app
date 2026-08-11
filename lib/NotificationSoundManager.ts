import { createClient } from "@/lib/supabase/client";

// Centralized configuration for the notification sound
const NOTIFICATION_AUDIO_PATH = "audio/notifications/new-order.mp3";
const isDev = process.env.NODE_ENV !== "production";

class NotificationSoundManager {
  private audio: HTMLAudioElement | null = null;
  private unlocked = false;
  private loadAttempted = false;

  constructor() {
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
      
      if (isDev) console.log(`[NotificationSound] 🎧 Preloading from: ${data.publicUrl}`);

      this.audio = new Audio(data.publicUrl);
      this.audio.preload = "auto";
      this.audio.setAttribute("playsinline", "true");
      
      // Default volume
      this.audio.volume = 0.7;

      // Add a global click listener to unlock audio if it hasn't been unlocked yet
      const unlockHandler = () => {
        this.unlock();
        document.removeEventListener("click", unlockHandler);
        document.removeEventListener("touchstart", unlockHandler);
        document.removeEventListener("keydown", unlockHandler);
      };
      
      document.addEventListener("click", unlockHandler);
      document.addEventListener("touchstart", unlockHandler);
      document.addEventListener("keydown", unlockHandler);

    } catch (err) {
      if (isDev) console.error(`[NotificationSound] ❌ Failed to preload:`, err);
    }
  }

  public unlock() {
    if (this.unlocked || !this.audio) return;
    
    if (isDev) console.log("[NotificationSound] 🔓 Unlocking browser audio...");
    
    // Play and immediately pause to satisfy autoplay restrictions
    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this.audio?.pause();
          if (this.audio) this.audio.currentTime = 0;
          this.unlocked = true;
          if (isDev) console.log(`[NotificationSound] HTML5 audio unlocked successfully.`);
        })
        .catch((err) => {
          if (isDev) console.warn(`[NotificationSound] Autoplay unlock deferred:`, err.message);
        });
    }
  }

  public async play() {
    if (!this.audio) {
      if (isDev) console.warn("[NotificationSound] Audio not initialized. Attempting preload.");
      this.preload();
    }

    if (this.audio) {
      try {
        if (isDev) console.log(`[NotificationSound] 🔊 Playing notification sound...`);
        this.audio.currentTime = 0;
        await this.audio.play();
        if (isDev) console.log(`[NotificationSound] ✅ Playback successful.`);
      } catch (err: unknown) {
        if (isDev) console.warn(
          `[NotificationSound] ⚠️ Play failed (Autoplay block or network issue):`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }
}

export const notificationSoundManager = new NotificationSoundManager();
