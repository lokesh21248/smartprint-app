import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Order } from "@/types";

export type RealtimeStatus = "connected" | "disconnected" | "reconnecting";

interface OrderState {
  pendingCount: number;
  newOrders: Order[]; // latest unread new orders for notification feed
  realtimeChannel: RealtimeChannel | null;
  realtimeStatus: RealtimeStatus;

  setPendingCount: (count: number) => void;
  incrementPending: () => void;
  decrementPending: () => void;
  addNewOrder: (order: Order) => void;
  clearNewOrders: () => void;

  /** Call this to safely replace (and unsubscribe old) realtime channel */
  setRealtimeChannel: (channel: RealtimeChannel | null) => void;
  /** Explicitly unsubscribe + clear the active channel (call on component unmount) */
  destroyRealtimeChannel: () => void;
  /** Update the realtime connection status shown in the UI banner */
  setRealtimeStatus: (status: RealtimeStatus) => void;
}

export const useOrderStore = create<OrderState>()((set, get) => ({
  pendingCount: 0,
  newOrders: [],
  realtimeChannel: null,
  realtimeStatus: "disconnected",

  setPendingCount: (count) => set({ pendingCount: count }),

  incrementPending: () =>
    set((state) => ({ pendingCount: state.pendingCount + 1 })),

  decrementPending: () =>
    set((state) => ({
      pendingCount: Math.max(0, state.pendingCount - 1),
    })),

  addNewOrder: (order) =>
    set((state) => ({
      // Keep last 10 unread orders, newest first
      newOrders: [order, ...state.newOrders].slice(0, 10),
    })),

  clearNewOrders: () => set({ newOrders: [] }),

  setRealtimeChannel: (channel) => {
    // Unsubscribe the OLD channel before replacing it
    const prev = get().realtimeChannel;
    if (prev) {
      prev.unsubscribe().catch((err: unknown) => {
        console.warn("[orderStore] Failed to unsubscribe old channel:", err);
      });
    }
    set({ realtimeChannel: channel });
  },

  destroyRealtimeChannel: () => {
    const channel = get().realtimeChannel;
    if (channel) {
      channel.unsubscribe().catch((err: unknown) => {
        console.warn("[orderStore] Failed to unsubscribe on destroy:", err);
      });
      set({ realtimeChannel: null });
    }
  },

  setRealtimeStatus: (status) => set({ realtimeStatus: status }),
}));
