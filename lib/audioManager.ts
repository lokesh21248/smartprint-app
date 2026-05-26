/**
 * AudioManager
 * 
 * Production-grade client-side audio playback system.
 * Caches preloaded HTMLAudioElement instances and provides a 
 * Web Audio API synthesizer fallback for guaranteed, offline-safe 
 * audio alert delivery on all mobile and desktop browsers.
 */
class AudioManager {
  private audioCache: Record<string, HTMLAudioElement> = {};
  private unlocked = false;
  private audioCtx: AudioContext | null = null;
  private sounds = ["whatsapp", "cash", "bell", "ding"];

  constructor() {
    if (typeof window !== "undefined") {
      this.preload();
    }
  }

  /**
   * Preloads all sound elements into memory
   */
  public preload() {
    console.log("[AudioManager] 🎧 Preloading all notification sounds...");
    this.sounds.forEach((sound) => {
      try {
        if (this.audioCache[sound]) return; // Already cached

        const audio = new Audio(`/sounds/${sound}.mp3`);
        audio.preload = "auto";
        
        // Critical for iOS Safari, mobile viewports & PWA: plays inline without fullscreen video/audio blocks
        audio.setAttribute("playsinline", "true");

        // Cache the preloaded HTMLAudioElement instance
        this.audioCache[sound] = audio;
        console.log(`[AudioManager] Preload success: ${sound}.mp3 cached`);
      } catch (err) {
        console.error(`[AudioManager] ❌ Failed to preload sound "${sound}":`, err);
      }
    });
  }

  /**
   * Unlocks the browser audio context.
   * Must be called in response to a user interaction (click, touchstart, etc.)
   * to comply with Chrome and iOS Safari autoplay restriction policies.
   */
  public unlock() {
    if (this.unlocked) return;

    console.log("[AudioManager] 🔓 Unlocking browser audio for this session...");

    // 1. Silent playback on preloaded cached audio elements to satisfy mobile autoplay policies
    Object.entries(this.audioCache).forEach(([name, audio]) => {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            console.log(`[AudioManager] HTML5 pre-play unlocked successfully: ${name}`);
          })
          .catch((err) => {
            console.warn(`[AudioManager] Autoplay unlock deferred for "${name}":`, err.message);
          });
      }
    });

    // 2. Warm up and initialize client-side Web Audio API Context
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
        if (this.audioCtx.state === "suspended") {
          this.audioCtx.resume();
        }
      }
    } catch (e) {
      console.warn("[AudioManager] Failed to initialize AudioContext:", e);
    }

    this.unlocked = true;
    console.log("[AudioManager] 🔊 Browser audio successfully warmed & unlocked!");
  }

  /**
   * Plays the specified notification sound instantly with zero lag.
   * Resets the playback head to 0 to enable continuous overlapping triggers.
   */
  public async play(sound: string) {
    // 1. Resolve sound target with a bulletproof fallback to "whatsapp" if missing or invalid
    let targetSound = sound;
    if (!targetSound || !this.sounds.includes(targetSound)) {
      console.warn(`[AudioManager] Sound name "${sound}" is empty or invalid. Falling back to "whatsapp".`);
      targetSound = "whatsapp";
    }

    if (!this.audioCache[targetSound]) {
      console.warn(`[AudioManager] Sound "${targetSound}" not found in cache. Re-initializing cache and falling back to "whatsapp".`);
      this.preload();
      targetSound = "whatsapp";
    }

    const audio = this.audioCache[targetSound];

    if (audio) {
      try {
        console.log(`[AudioManager] 🔊 Sound play requested for: "${targetSound}"`);
        // Reset playback position so subsequent triggers start instantly
        audio.currentTime = 0;
        await audio.play();
        console.log(`[AudioManager] ✅ Audio element playing: "${targetSound}"`);
        return;
      } catch (err: any) {
        console.warn(
          `[AudioManager] ⚠️ HTML5 play failed for "${targetSound}" (Autoplay block or missing codec). Error:`,
          err.message || err
        );
      }
    }

    // 2. Programmatic high-quality synthesizer fallback (works offline and under autoplay restrictions)
    console.log(`[AudioManager] ⚡ Falling back to Web Audio Synthesis for: "${targetSound}"`);
    this.playSynthesizedSound(targetSound);
  }

  /**
   * Synthesizes audio using custom frequencies matching the selected notifications.
   * Perfect zero-dependency backup that works in offline and mobile autoplay limits.
   */
  private playSynthesizedSound(sound: string) {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioCtx && AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }

      const ctx = this.audioCtx;
      if (!ctx) return;

      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const now = ctx.currentTime;

      if (sound === "whatsapp") {
        // WhatsApp dual tone: 554.37Hz (C#5) and 659.25Hz (E5) chimes
        this.synthesizeChime(ctx, 554.37, now, 0.08);
        this.synthesizeChime(ctx, 659.25, now + 0.09, 0.18);
        console.log("[AudioManager] Synthesized WhatsApp dual-tone");
      } else if (sound === "cash") {
        // Cash Register: Metallic noise transient + high coin chime (1567Hz)
        this.synthesizeNoise(ctx, now, 0.1);
        this.synthesizeChime(ctx, 1567.98, now + 0.05, 0.45, "triangle");
        console.log("[AudioManager] Synthesized Cash Register chimes");
      } else if (sound === "bell") {
        // Service Bell: Resonance frequency (880Hz + 883Hz wobbling beat)
        this.synthesizeBell(ctx, 880, now, 0.8);
        console.log("[AudioManager] Synthesized Service Bell chime");
      } else {
        // Ding: 1174.66Hz (D6) simple clean ding
        this.synthesizeChime(ctx, 1174.66, now, 0.3, "sine");
        console.log("[AudioManager] Synthesized Minimalist Ding chime");
      }
    } catch (e) {
      console.error("[AudioManager] ❌ Web Audio synthesis failed completely:", e);
    }
  }

  private synthesizeChime(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType = "sine"
  ) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  private synthesizeNoise(ctx: AudioContext, startTime: number, duration: number) {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Populate buffer with random noise values
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = ctx.createBufferSource();
    noiseNode.buffer = buffer;

    // Apply bandpass filter to give it a metallic rattle
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1000, startTime);
    filter.Q.setValueAtTime(3, startTime);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.15, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    noiseNode.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    noiseNode.start(startTime);
    noiseNode.stop(startTime + duration + 0.05);
  }

  private synthesizeBell(ctx: AudioContext, baseFreq: number, startTime: number, duration: number) {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(baseFreq, startTime);

    osc2.type = "sine";
    osc2.frequency.setValueAtTime(baseFreq + 3, startTime); // creates bell wobble (beat frequency)

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.25, startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(startTime);
    osc2.start(startTime);

    osc1.stop(startTime + duration + 0.05);
    osc2.stop(startTime + duration + 0.05);
  }
}

// Singleton export
export const audioManager = new AudioManager();
export default audioManager;
