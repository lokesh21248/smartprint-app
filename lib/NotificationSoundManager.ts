import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const LOCAL_AUDIO_PATH = "/sounds/new-order.mp3";
const SUPABASE_AUDIO_PATH = "audio/notifications/new-order.mp3";
const isDev = process.env.NODE_ENV !== "production";

class NotificationSoundManager {
  private audio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private unlocked = false;
  private loadAttempted = false;
  private toastShown = false;
  private primaryUrl: string = LOCAL_AUDIO_PATH;

  constructor() {
    if (typeof window !== "undefined") {
      this.preload();
    }
  }

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }
    return this.audioContext;
  }

  public preload() {
    if (this.loadAttempted || typeof window === "undefined") return;
    this.loadAttempted = true;

    try {
      if (isDev) console.log(`[NotificationSound] 🎧 Preloading local audio from: ${LOCAL_AUDIO_PATH}`);

      this.audio = new Audio(LOCAL_AUDIO_PATH);
      this.audio.preload = "auto";
      this.audio.setAttribute("playsinline", "true");
      this.audio.volume = 0.8;

      this.audio.addEventListener("canplaythrough", () => {
        if (isDev) console.log("[NotificationSound] ✅ Local audio loaded and ready to play.");
      }, { once: true });

      this.audio.addEventListener("error", () => {
        if (isDev) console.warn("[NotificationSound] ⚠️ Local audio load error, attempting Supabase Storage fallback...");
        try {
          const supabase = createClient();
          const [bucket, ...rest] = SUPABASE_AUDIO_PATH.split("/");
          const path = rest.join("/");
          const { data } = supabase.storage.from(bucket).getPublicUrl(path);
          this.primaryUrl = data.publicUrl;
          
          if (this.audio) {
            this.audio.src = this.primaryUrl;
            this.audio.load();
          }
        } catch (err) {
          console.error("[NotificationSound] ❌ Fallback audio load failed:", err);
        }
      });
    } catch (err) {
      console.error("[NotificationSound] ❌ Failed to preload audio:", err);
    }
  }

  /**
   * Called on user interaction (click/touch/keydown) to satisfy browser autoplay policy.
   * Resumes Web Audio API AudioContext and plays a muted/silent warm-up snippet.
   */
  public async unlock(): Promise<boolean> {
    if (this.unlocked) return true;

    try {
      const ctx = this.getAudioContext();
      if (ctx && ctx.state === "suspended") {
        await ctx.resume();
      }

      if (this.audio) {
        const origMuted = this.audio.muted;
        this.audio.muted = true;
        const playPromise = this.audio.play();

        if (playPromise !== undefined) {
          await playPromise;
          this.audio.pause();
          this.audio.currentTime = 0;
          this.audio.muted = origMuted;
        }
      }

      this.unlocked = true;
      if (isDev) console.log("[NotificationSound] ✅ Browser audio unlocked successfully.");
      return true;
    } catch (err) {
      if (isDev) {
        console.warn("[NotificationSound] ⚠️ Audio unlock attempt deferred:", (err as Error).message);
      }
      return false;
    }
  }

  /**
   * Synthesize a pleasant two-tone chime fallback using Web Audio API
   * Guaranteed to work even if HTMLAudioElement fails to load
   */
  private playFallbackChime() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const now = ctx.currentTime;

      // Note 1 (E5 - 659.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Note 2 (A5 - 880 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880, now + 0.15);
      gain2.gain.setValueAtTime(0.4, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.6);

      console.log("[NotificationSound] 🔔 Played synthesized fallback chime.");
    } catch (err) {
      console.error("[NotificationSound] ❌ Fallback chime error:", err);
    }
  }

  public async play() {
    if (!this.audio) {
      console.warn("[NotificationSound] Audio not initialized — attempting preload.");
      this.preload();
    }

    console.log(
      `[NotificationSound] play() requested | unlocked=${this.unlocked} | audioReadyState=${this.audio?.readyState ?? 0}`
    );

    let playedViaAudioElement = false;

    if (this.audio) {
      try {
        // Clone audio element for seamless overlapping plays when multiple orders arrive
        const soundInstance = this.audio.cloneNode(true) as HTMLAudioElement;
        soundInstance.volume = 0.85;
        soundInstance.currentTime = 0;

        const promise = soundInstance.play();
        if (promise !== undefined) {
          await promise;
          playedViaAudioElement = true;
          console.log("[NotificationSound] ✅ Audio element playback successful");
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (error.name === "NotAllowedError") {
          console.warn("[NotificationSound] ⚠️ Playback blocked by browser autoplay policy.");

          if (!this.toastShown) {
            this.toastShown = true;
            toast("🔔 Enable order sound alerts", {
              description: "Click anywhere on the dashboard to enable audio notifications for new orders.",
              action: {
                label: "Enable Sound",
                onClick: async () => {
                  const ok = await this.unlock();
                  this.toastShown = false;
                  if (ok) {
                    toast.success("Notification sounds enabled!");
                    this.play();
                  }
                },
              },
              duration: 10000,
            });
          }
        } else {
          console.warn("[NotificationSound] ⚠️ HTMLAudioElement play error, using fallback chime:", error.message);
        }
      }
    }

    if (!playedViaAudioElement) {
      this.playFallbackChime();
    }
  }
}

export const notificationSoundManager = new NotificationSoundManager();
