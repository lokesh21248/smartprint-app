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
 *      Remains active until notificationSoundManager.isUnlocked() returns true.
 */
export function AudioInitializer({ shopId }: AudioInitializerProps) {
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  // 1. Load persisted settings (soundEnabled) from Supabase into Zustand store
  useEffect(() => {
    if (shopId) {
      fetchSettings(shopId);
    }
  }, [shopId, fetchSettings]);

  // 2. Unlock browser audio on user interaction (required by Chrome/Safari autoplay policy)
  useEffect(() => {
    const removeListeners = () => {
      window.removeEventListener("click", handleInteraction, { capture: true });
      window.removeEventListener("pointerdown", handleInteraction, { capture: true });
      window.removeEventListener("touchstart", handleInteraction, { capture: true });
      window.removeEventListener("keydown", handleInteraction, { capture: true });
    };

    const handleInteraction = async () => {
      if (notificationSoundManager.isUnlocked()) {
        removeListeners();
        return;
      }

      const success = await notificationSoundManager.unlock();
      if (success || notificationSoundManager.isUnlocked()) {
        removeListeners();
      }
    };

    // Use capture phase so this fires before any stopPropagation() calls
    window.addEventListener("click", handleInteraction, { capture: true });
    window.addEventListener("pointerdown", handleInteraction, { capture: true });
    window.addEventListener("touchstart", handleInteraction, { capture: true });
    window.addEventListener("keydown", handleInteraction, { capture: true });

    return () => {
      removeListeners();
    };
  }, []);

  return null;
}
