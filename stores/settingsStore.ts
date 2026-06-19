import { create } from "zustand";

export type NotificationSound = "whatsapp" | "cash" | "bell" | "ding";

interface SettingsState {
  soundEnabled: boolean;
  notificationSound: NotificationSound;
  isLoading: boolean;

  setSoundEnabled: (enabled: boolean, shopId?: string | null) => Promise<void>;
  setNotificationSound: (sound: NotificationSound, shopId?: string | null) => Promise<void>;
  fetchSettings: (shopId: string | null) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  soundEnabled: true,
  notificationSound: "whatsapp",
  isLoading: false,

  fetchSettings: async (shopId) => {
    if (!shopId) return;
    set({ isLoading: true });
    try {
      console.log(`[SettingsStore] Fetching settings for shop: "${shopId}"`);
      const response = await fetch(`/api/shop/settings?shopId=${shopId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch settings: status ${response.status}`);
      }
      const data = await response.json();
      console.log("[SettingsStore] ✅ Settings loaded successfully:", data);
      set({
        soundEnabled: data.soundEnabled ?? true,
        notificationSound: (data.notificationSound as NotificationSound) ?? "whatsapp",
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

  setNotificationSound: async (sound, shopId) => {
    // 1. Optimistic update in memory
    set({ notificationSound: sound });

    if (!shopId) return;
    try {
      const response = await fetch("/api/shop/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, notificationSound: sound }),
      });
      if (!response.ok) {
        throw new Error(`Failed to update notification_sound: status ${response.status}`);
      }
    } catch (err) {
      console.error("[SettingsStore] Unexpected error saving notification_sound:", err);
    }
  },
}));
