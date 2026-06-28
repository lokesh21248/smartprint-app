"use client";

import { useEffect } from "react";
import { audioManager } from "@/lib/audioManager";
import { useSettingsStore } from "@/stores/settingsStore";

interface AudioInitializerProps {
  shopId: string | null;
}

export function AudioInitializer({ shopId }: AudioInitializerProps) {
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  // 1. Fetch persisted settings once from Supabase into the Zustand memory store
  useEffect(() => {
    if (shopId) {
      fetchSettings(shopId);
    }
  }, [shopId, fetchSettings]);

  // 2. Register first-interaction event listeners to unlock audio playbacks (Chrome/Safari requirement)
  useEffect(() => {
    const unlockAudio = () => {
      if (process.env.NODE_ENV !== "production") {
        console.log("[AudioInitializer] 🔓 User interaction detected. Unlocking browser audio...");
      }
      audioManager.unlock();
    };

    // Bind interaction triggers on window in the capture phase to bypass stopPropagation()
    window.addEventListener("click", unlockAudio, { capture: true, once: true });
    window.addEventListener("touchstart", unlockAudio, { capture: true, once: true });
    window.addEventListener("keydown", unlockAudio, { capture: true, once: true });

    return () => {
      window.removeEventListener("click", unlockAudio, { capture: true });
      window.removeEventListener("touchstart", unlockAudio, { capture: true });
      window.removeEventListener("keydown", unlockAudio, { capture: true });
    };
  }, []);

  return null;
}

