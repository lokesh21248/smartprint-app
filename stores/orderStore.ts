import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Order } from "@/types";

export type RealtimeStatus = "connected" | "disconnected" | "reconnecting";

interface OrderState {
  orders: Order[];
  newOrders: Order[]; // latest unread new orders for notification feed
  pendingCount: number;
  isHydrated: boolean;
  realtimeChannel: RealtimeChannel | null;
  realtimeStatus: RealtimeStatus;

  setOrders: (orders: Order[]) => void;
  addOrder: (order: Order) => void;
  updateOrder: (orderId: string, updates: Partial<Order>) => void;
  removeOrder: (orderId: string) => void;
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

function calculatePendingCount(orders: Order[]): number {
  return orders.filter(
    (o) => o.order_status?.toUpperCase() === "PLACED"
  ).length;
}

export const useOrderStore = create<OrderState>()((set, get) => ({
  orders: [],
  newOrders: [],
  pendingCount: 0,
  isHydrated: false,
  realtimeChannel: null,
  realtimeStatus: "disconnected",

  setOrders: (orders) => {
    // Preserve any live realtime orders that arrived and might not be in the initial batch
    const existingOrders = get().orders;
    let mergedOrders: Order[];

    if (existingOrders.length === 0) {
      mergedOrders = orders;
    } else {
      // Merge: Keep all new orders from incoming batch + append older ones from existing state if missing
      const existingMap = new Map(existingOrders.map((o) => [o.id, o]));
      orders.forEach((o) => {
        // Always overwrite with the fresher incoming order data
        existingMap.set(o.id, o);
      });
      mergedOrders = Array.from(existingMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    const pendingCount = calculatePendingCount(mergedOrders);
    set({
      orders: mergedOrders,
      pendingCount,
      isHydrated: true,
    });
  },

  addOrder: (order) => {
    set((state) => {
      // Deduplicate by order.id
      const exists = state.orders.some((o) => o.id === order.id);
      if (exists) {
        // If already exists, update in place
        const updatedOrders = state.orders.map((o) =>
          o.id === order.id ? { ...o, ...order } : o
        );
        return {
          orders: updatedOrders,
          pendingCount: calculatePendingCount(updatedOrders),
        };
      }

      // Prepend the new order at the top
      const nextOrders = [order, ...state.orders];
      const pendingCount = calculatePendingCount(nextOrders);
      const nextNewOrders = [
        order,
        ...state.newOrders.filter((o) => o.id !== order.id),
      ].slice(0, 10);

      return {
        orders: nextOrders,
        newOrders: nextNewOrders,
        pendingCount,
      };
    });
  },

  updateOrder: (orderId, updates) => {
    set((state) => {
      const updatedOrders = state.orders.map((o) =>
        o.id === orderId ? { ...o, ...updates } : o
      );
      const updatedNewOrders = state.newOrders
        .map((o) => (o.id === orderId ? { ...o, ...updates } : o))
        .filter((o) => o.order_status?.toUpperCase() === "PLACED");

      return {
        orders: updatedOrders,
        newOrders: updatedNewOrders,
        pendingCount: calculatePendingCount(updatedOrders),
      };
    });
  },

  removeOrder: (orderId) => {
    set((state) => {
      const filteredOrders = state.orders.filter((o) => o.id !== orderId);
      const filteredNewOrders = state.newOrders.filter((o) => o.id !== orderId);

      return {
        orders: filteredOrders,
        newOrders: filteredNewOrders,
        pendingCount: calculatePendingCount(filteredOrders),
      };
    });
  },

  setPendingCount: (count) => set({ pendingCount: count }),

  incrementPending: () =>
    set((state) => ({ pendingCount: state.pendingCount + 1 })),

  decrementPending: () =>
    set((state) => ({
      pendingCount: Math.max(0, state.pendingCount - 1),
    })),

  addNewOrder: (order) =>
    set((state) => ({
      newOrders: [order, ...state.newOrders.filter((o) => o.id !== order.id)].slice(0, 10),
    })),

  clearNewOrders: () => set({ newOrders: [] }),

  setRealtimeChannel: (channel) => {
    const prev = get().realtimeChannel;
    if (prev && prev !== channel) {
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
