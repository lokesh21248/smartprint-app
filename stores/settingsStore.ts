import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";

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
      const supabase = createClient();
      
      console.log(`[SettingsStore] Fetching settings for shop: "${shopId}"`);

      // 2. Fetch settings row
      const { data, error } = await supabase
        .from("shop_settings")
        .select("sound_alerts, notification_sound")
        .eq("shop_id", shopId)
        .maybeSingle();

      if (error) {
        console.error("[SettingsStore] ❌ Error fetching settings:", error);
      } else if (data) {
        console.log("[SettingsStore] ✅ Settings loaded successfully:", data);
        set({
          soundEnabled: data.sound_alerts ?? true,
          notificationSound: (data.notification_sound as NotificationSound) ?? "whatsapp",
        });
      } else {
        console.log("[SettingsStore] ℹ️ Settings row not found. Seeding default settings...");
        // Seed default shop settings row if it doesn't exist
        const { error: upsertError } = await supabase
          .from("shop_settings")
          .upsert({
            shop_id: shopId,
            sound_alerts: true,
            notification_sound: "whatsapp",
          }, { onConflict: "shop_id" });

        if (upsertError) {
          console.error("[SettingsStore] ❌ Error seeding default settings:", upsertError);
        } else {
          console.log("[SettingsStore] ✅ Default settings seeded successfully.");
          set({ soundEnabled: true, notificationSound: "whatsapp" });
        }
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
      const supabase = createClient();
      const { error } = await supabase
        .from("shop_settings")
        .upsert({
          shop_id: shopId,
          sound_alerts: enabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: "shop_id" });

      if (error) {
        console.error("[SettingsStore] Failed to save sound_alerts:", error);
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
      const supabase = createClient();
      const { error } = await supabase
        .from("shop_settings")
        .upsert({
          shop_id: shopId,
          notification_sound: sound,
          updated_at: new Date().toISOString(),
        }, { onConflict: "shop_id" });

      if (error) {
        console.error("[SettingsStore] Failed to save notification_sound:", error);
      }
    } catch (err) {
      console.error("[SettingsStore] Unexpected error saving notification_sound:", err);
    }
  },
}));
