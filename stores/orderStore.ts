import { create } from "zustand";
import type { Order } from "@/types";

interface OrderState {
  pendingCount: number;
  newOrders: Order[]; // latest unread new orders for notification feed
  realtimeChannel: unknown | null;

  setPendingCount: (count: number) => void;
  incrementPending: () => void;
  decrementPending: () => void;
  addNewOrder: (order: Order) => void;
  clearNewOrders: () => void;
  setRealtimeChannel: (channel: unknown | null) => void;
}

export const useOrderStore = create<OrderState>()((set) => ({
  pendingCount: 0,
  newOrders: [],
  realtimeChannel: null,

  setPendingCount: (count) => set({ pendingCount: count }),
  incrementPending: () =>
    set((state) => ({ pendingCount: state.pendingCount + 1 })),
  decrementPending: () =>
    set((state) => ({
      pendingCount: Math.max(0, state.pendingCount - 1),
    })),
  addNewOrder: (order) =>
    set((state) => ({
      newOrders: [order, ...state.newOrders].slice(0, 10),
    })),
  clearNewOrders: () => set({ newOrders: [] }),
  setRealtimeChannel: (channel) => set({ realtimeChannel: channel }),
}));
