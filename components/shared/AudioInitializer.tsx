"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

interface AudioInitializerProps {
  shopId: string | null;
}

/**
 * AudioInitializer — two responsibilities only:
 * 1. Fetch persisted notification settings (soundEnabled) from Supabase.
 * 2. Unlock browser autoplay on first user interaction so that subsequent
 *    audio.play() calls in the realtime handler are allowed.
 */
export function AudioInitializer({ shopId }: AudioInitializerProps) {
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  // Load soundEnabled setting from Supabase into Zustand store
  useEffect(() => {
    if (shopId) {
      fetchSettings(shopId);
    }
  }, [shopId, fetchSettings]);

  // Unlock browser autoplay on first user gesture (Chrome/Safari requirement).
  // Creates a silent Audio element, plays it muted, then discards it.
  // This satisfies the browser's "user gesture required" rule without making
  // any audible sound, so future audio.play() calls in the order handler work.
  useEffect(() => {
    const unlock = () => {
      try {
        const silent = new Audio("/sounds/new-order.mp3");
        silent.volume = 0;
        silent.play().then(() => { silent.pause(); }).catch(() => {});
      } catch (_) {}
    };

    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  return null;
}
