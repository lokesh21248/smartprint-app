"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { unlockAudio } from "@/lib/audio/orderNotification";

interface AudioInitializerProps {
  shopId: string | null;
}

/**
 * AudioInitializer — two responsibilities only:
 * 1. Fetch persisted notification settings (soundEnabled) from Supabase.
 * 2. Unlock browser autoplay on first user interaction so that subsequent
 *    audio.play() calls in the realtime handler are allowed.
 *
 * CRITICAL: unlockAudio() calls .play() on the SAME singleton HTMLAudioElement
 * that playOrderNotification() uses later. This is required because browser
 * autoplay policy tracks unlock state PER-OBJECT — unlocking a different Audio
 * instance does nothing for the playback object (that was the original bug).
 */
export function AudioInitializer({ shopId }: AudioInitializerProps) {
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  // Load soundEnabled setting from Supabase into Zustand store
  useEffect(() => {
    if (shopId) {
      fetchSettings(shopId);
    }
  }, [shopId, fetchSettings]);

  // Unlock browser autoplay on first user gesture (Chrome/Safari/Edge requirement).
  //
  // We call unlockAudio() from the singleton module — this plays the exact same
  // HTMLAudioElement that will later play order notifications, at volume 0.
  // After this runs, all future .play() calls on that element are unrestricted,
  // even from async Supabase realtime callbacks.
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
    };

    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  return null;
}
