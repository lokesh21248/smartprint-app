import { create } from "zustand";

interface SettingsState {
  soundEnabled: boolean;
  /** Whether the shop owner has opted-in to browser desktop notifications.
   *  This is an in-memory preference (not DB-persisted) — the browser's own
   *  Notification.permission is the authoritative gate. Setting this to true
   *  without Notification.permission === "granted" will still produce no
   *  notifications (showBrowserNotification() checks both).
   */
  browserNotificationsEnabled: boolean;
  isLoading: boolean;

  setSoundEnabled: (enabled: boolean, shopId?: string | null) => Promise<void>;
  setBrowserNotificationsEnabled: (enabled: boolean) => void;
  fetchSettings: (shopId: string | null) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  soundEnabled: true,
  // Default to true if the browser already has permission (i.e. previously granted),
  // so that existing users who already clicked "Enable" don't lose notifications.
  browserNotificationsEnabled:
    typeof Notification !== "undefined"
      ? Notification.permission === "granted"
      : false,
  isLoading: false,

  fetchSettings: async (shopId) => {
    if (!shopId) return;
    // Skip if already loaded for this shop (prevents double-fetch in StrictMode / hot reloads)
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[PERF] Settings API: fetching for shop "${shopId}"...`);
        const t0 = Date.now();
        const response = await fetch(`/api/shop/settings?shopId=${shopId}`);
        console.log(`[PERF] Settings API: ${Date.now() - t0} ms`);
        if (!response.ok) throw new Error(`Failed to fetch settings: status ${response.status}`);
        const data = await response.json();
        const permissionGranted =
          typeof Notification !== "undefined" ? Notification.permission === "granted" : false;
        set({
          soundEnabled: data.soundEnabled ?? true,
          browserNotificationsEnabled: get().browserNotificationsEnabled || permissionGranted,
        });
      } else {
        const response = await fetch(`/api/shop/settings?shopId=${shopId}`);
        if (!response.ok) throw new Error(`Failed to fetch settings: status ${response.status}`);
        const data = await response.json();
        const permissionGranted =
          typeof Notification !== "undefined" ? Notification.permission === "granted" : false;
        set({
          soundEnabled: data.soundEnabled ?? true,
          browserNotificationsEnabled: get().browserNotificationsEnabled || permissionGranted,
        });
      }
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

  setBrowserNotificationsEnabled: (enabled) => {
    set({ browserNotificationsEnabled: enabled });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[SettingsStore] Browser notifications ${enabled ? "enabled" : "disabled"}`);
    }
  },
}));
