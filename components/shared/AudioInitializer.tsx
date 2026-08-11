"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { notificationSoundManager } from "@/lib/NotificationSoundManager";

interface AudioInitializerProps {
  shopId: string | null;
}

/**
 * AudioInitializer mounts inside the authenticated dashboard layout.
 * Responsibilities:
 *   1. Fetch persisted sound settings from Supabase once per session.
 *   2. Register user-interaction listeners to unlock browser audio (autoplay policy).
 *      The unlock fires at most ONCE on the first interaction (click/keydown/touchstart).
 *      It does NOT play a sound — it only warms up the audio element.
 */
export function AudioInitializer({ shopId }: AudioInitializerProps) {
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  // 1. Load persisted settings (soundEnabled) from Supabase into Zustand store
  useEffect(() => {
    if (shopId) {
      fetchSettings(shopId);
    }
  }, [shopId, fetchSettings]);

  // 2. Unlock browser audio on first user interaction (required by Chrome/Safari autoplay policy)
  useEffect(() => {
    let unlocked = false;

    const handleInteraction = () => {
      if (unlocked) return;
      unlocked = true;
      notificationSoundManager.unlock();

      // Remove all listeners after first successful unlock
      window.removeEventListener("click", handleInteraction, { capture: true });
      window.removeEventListener("pointerdown", handleInteraction, { capture: true });
      window.removeEventListener("touchstart", handleInteraction, { capture: true });
      window.removeEventListener("keydown", handleInteraction, { capture: true });
    };

    // Use capture phase so this fires before any stopPropagation() calls
    window.addEventListener("click", handleInteraction, { capture: true });
    window.addEventListener("pointerdown", handleInteraction, { capture: true });
    window.addEventListener("touchstart", handleInteraction, { capture: true });
    window.addEventListener("keydown", handleInteraction, { capture: true });

    return () => {
      window.removeEventListener("click", handleInteraction, { capture: true });
      window.removeEventListener("pointerdown", handleInteraction, { capture: true });
      window.removeEventListener("touchstart", handleInteraction, { capture: true });
      window.removeEventListener("keydown", handleInteraction, { capture: true });
    };
  }, []);

  return null;
}
