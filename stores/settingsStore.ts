import { create } from "zustand";

interface SettingsState {
  soundEnabled: boolean;
  isLoading: boolean;

  setSoundEnabled: (enabled: boolean, shopId?: string | null) => Promise<void>;
  fetchSettings: (shopId: string | null) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  soundEnabled: true,
  isLoading: false,

  fetchSettings: async (shopId) => {
    if (!shopId) return;
    set({ isLoading: true });
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[SettingsStore] Fetching settings for shop: "${shopId}"`);
      }
      const response = await fetch(`/api/shop/settings?shopId=${shopId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch settings: status ${response.status}`);
      }
      const data = await response.json();
      if (process.env.NODE_ENV !== 'production') {
        console.log("[SettingsStore] ✅ Settings loaded successfully:", data);
      }
      set({
        soundEnabled: data.soundEnabled ?? true,
      });
    } catch (err) {
      console.error("[SettingsStore] ❌ Unexpected error in fetchSettings:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  setSoundEnabled: async (enabled, shopId) => {
    // 1. Optimistic update in memory (snappy feel)
    set({ soundEnabled: enabled });

    if (!shopId) return;
    try {
      const response = await fetch("/api/shop/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, soundEnabled: enabled }),
      });
      if (!response.ok) {
        throw new Error(`Failed to update sound_alerts: status ${response.status}`);
      }
    } catch (err) {
      console.error("[SettingsStore] Unexpected error saving sound_alerts:", err);
    }
  },
}));
