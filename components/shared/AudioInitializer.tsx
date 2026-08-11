"use client";

import { useEffect } from "react";
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

  return null;
}

