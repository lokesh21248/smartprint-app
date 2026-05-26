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
      audioManager.unlock();
      
      // Clean up event listeners immediately after first interaction
      cleanupListeners();
    };

    const cleanupListeners = () => {
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    };

    // Bind interaction triggers
    document.addEventListener("click", unlockAudio);
    document.addEventListener("touchstart", unlockAudio);
    document.addEventListener("keydown", unlockAudio);

    return () => {
      cleanupListeners();
    };
  }, []);

  return null;
}
