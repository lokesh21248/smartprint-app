"use client";

import { useEffect, useRef } from "react";
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
 */
export function AudioInitializer({ shopId }: AudioInitializerProps) {
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const isUnlockingRef = useRef(false);

  // Load soundEnabled setting from Supabase into Zustand store
  useEffect(() => {
    if (shopId) {
      fetchSettings(shopId);
    }
  }, [shopId, fetchSettings]);

  // Unlock browser autoplay on first user gesture (Chrome/Safari/Edge requirement).
  useEffect(() => {
    const handleInteraction = async () => {
      if (isUnlockingRef.current) return;
      isUnlockingRef.current = true;
      
      const success = await unlockAudio();
      
      if (success) {
        document.removeEventListener("click", handleInteraction);
        document.removeEventListener("touchstart", handleInteraction);
        document.removeEventListener("pointerdown", handleInteraction);
        document.removeEventListener("keydown", handleInteraction);
      } else {
        isUnlockingRef.current = false;
      }
    };

    document.addEventListener("click", handleInteraction);
    document.addEventListener("touchstart", handleInteraction);
    document.addEventListener("pointerdown", handleInteraction);
    document.addEventListener("keydown", handleInteraction);

    return () => {
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("touchstart", handleInteraction);
      document.removeEventListener("pointerdown", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };
  }, []);

  return null;
}
