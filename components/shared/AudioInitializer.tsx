"use client";

import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { unlockAudio, initializeOrderNotificationAudio } from "@/lib/audio/orderNotification";

interface AudioInitializerProps {
  shopId: string | null;
}

/**
 * AudioInitializer — three responsibilities:
 * 1. Fetch persisted notification settings (soundEnabled) from Supabase.
 * 2. Pre-fetch the Supabase Storage audio URL and begin buffering the MP3
 *    immediately when the shop dashboard mounts — so the first notification
 *    plays with zero latency.
 * 3. Unlock browser autoplay on first user interaction so that subsequent
 *    audio.play() calls in the realtime handler are allowed.
 *
 * The preload (step 2) triggers GET /api/audio/notification once, which
 * returns the Supabase Storage URL. The module-level cache in
 * lib/audio/orderNotification.ts ensures the URL is fetched only once
 * per browser session regardless of re-renders or route changes.
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

  // Pre-fetch Supabase Storage URL + begin buffering the MP3.
  // Runs once on mount. The audio module caches the URL — subsequent
  // renders / route changes do not trigger additional network requests.
  useEffect(() => {
    initializeOrderNotificationAudio().catch(() => {
      // Failure is handled inside the audio module (falls back to beep).
      // We never let this error propagate to React.
    });
  }, []);

  // Unlock browser autoplay on first user gesture (Chrome/Safari/Edge requirement).
  // Must use the SAME HTMLAudioElement that will later play notifications —
  // that's why unlockAudio() operates on the module-level singleton.
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
