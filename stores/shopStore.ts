import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Shop, UserRole } from "@/types";

interface ShopState {
  shop: Shop | null;
  userRole: UserRole | null;
  notificationCount: number;
  soundEnabled: boolean;
  autoAccept: boolean;
  autoAcceptWindow: number; // minutes

  setShop: (shop: Shop | null) => void;
  setUserRole: (role: UserRole | null) => void;
  setNotificationCount: (count: number) => void;
  incrementNotifications: () => void;
  clearNotifications: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  toggleShopOpen: () => void;
  setAutoAccept: (enabled: boolean) => void;
  setAutoAcceptWindow: (minutes: number) => void;
}

export const useShopStore = create<ShopState>()(
  persist(
    (set) => ({
      shop: null,
      userRole: null,
      notificationCount: 0,
      soundEnabled: true,
      autoAccept: false,
      autoAcceptWindow: 30,

      setShop: (shop) => set({ shop }),
      setUserRole: (role) => set({ userRole: role }),
      setNotificationCount: (count) => set({ notificationCount: count }),
      incrementNotifications: () =>
        set((state) => ({ notificationCount: state.notificationCount + 1 })),
      clearNotifications: () => set({ notificationCount: 0 }),
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      toggleShopOpen: () =>
        set((state) => ({
          shop: state.shop
            ? { ...state.shop, is_open: !state.shop.is_open }
            : null,
        })),
      setAutoAccept: (enabled) => set({ autoAccept: enabled }),
      setAutoAcceptWindow: (minutes) => set({ autoAcceptWindow: minutes }),
    }),
    {
      name: "smartprint-shop",
      partialize: (state) => ({
        soundEnabled: state.soundEnabled,
        autoAccept: state.autoAccept,
        autoAcceptWindow: state.autoAcceptWindow,
      }),
    }
  )
);
