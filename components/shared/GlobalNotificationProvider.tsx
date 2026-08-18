"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrderStore } from "@/stores/orderStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useQueryClient } from "@tanstack/react-query";
import { useSettingsStore } from "@/stores/settingsStore";
import { playOrderNotification } from "@/lib/audio/orderNotification";
import type { Order } from "@/types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import type { AppNotification } from "@/stores/notificationStore";

const isDev = process.env.NODE_ENV !== "production";

// Module-level caches
let activeChannel: RealtimeChannel | null = null;
let activeChannelShopId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let isReconnecting = false;

export const knownOrderIds = new Set<string>();

export function markOrdersAsKnown(orderIds: string[]) {
  orderIds.forEach((id) => knownOrderIds.add(id));
}

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 2000;

type RealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

function normalizeStatus(raw: unknown): Order["order_status"] {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "NEW") return "PLACED" as Order["order_status"];
  return s as Order["order_status"];
}

function mapRawToOrder(raw: Record<string, unknown>): Order {
  return {
    ...(raw as unknown as Order),
    color: Boolean(raw.is_color),
    double_sided: Boolean(raw.is_double_sided),
    order_status: normalizeStatus(raw.status),
    total_amount: Number(raw.total_amount) || 0,
    page_count: Number(raw.page_count) || 0,
    copies: Number(raw.copies) || 1,
    created_at: (raw.created_at as string) || new Date().toISOString(),
    updated_at: (raw.updated_at as string) || (raw.created_at as string) || new Date().toISOString(),
  };
}

export function forceReconnect(shopId: string | null) {
  if (!shopId) return;
  reconnectAttempts = 0;
  isReconnecting = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  // Reconnect logic will be handled by the provider instance
}

interface GlobalNotificationProviderProps {
  shopId: string | null;
  initialNotifications: AppNotification[];
}

export function GlobalNotificationProvider({ shopId, initialNotifications }: GlobalNotificationProviderProps) {
  const queryClient = useQueryClient();
  const { addOrder, updateOrder, removeOrder, setRealtimeChannel, setRealtimeStatus } = useOrderStore();
  const { addNotification, notifications } = useNotificationStore();

  const handlersRef = useRef({
    addOrder,
    updateOrder,
    removeOrder,
    addNotification,
    queryClient,
  });

  useEffect(() => {
    handlersRef.current = {
      addOrder,
      updateOrder,
      removeOrder,
      addNotification,
      queryClient,
    };
  }, [addOrder, updateOrder, removeOrder, addNotification, queryClient]);

  const pendingInserts = useRef<Order[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushInsertBatch = useCallback(() => {
    const batch = pendingInserts.current.splice(0);
    const activeShopId = activeChannelShopId;
    if (!batch.length || !activeShopId) return;

    if (isDev) {
      console.log(`[ORDER_SYNC] 📦 Flushing batch of ${batch.length} new order event(s)...`);
    }

    batch.forEach((order) => {
      handlersRef.current.addOrder(order);
      
      handlersRef.current.queryClient.setQueryData<Order[]>(["orders", activeShopId], (prev) => {
        if (!prev) return [order];
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev.map((o) => (o.id === order.id ? order : o)) : [order, ...prev];
      });

      handlersRef.current.queryClient.setQueryData<Order[]>(["new-orders", activeShopId], (prev) => {
        if (!prev) return [order];
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev.map((o) => (o.id === order.id ? order : o)) : [order, ...prev];
      });
    });

    handlersRef.current.queryClient.invalidateQueries({ queryKey: ["dashboard-stats", activeShopId] });
  }, []);

  const handleRealtimeEvent = useCallback((payload: RealtimePayload) => {
    const activeShopId = activeChannelShopId;
    if (!activeShopId) return;

    if (payload.table === "notifications" && payload.eventType === "INSERT") {
      const notifRaw = payload.new;
      
      const notif: AppNotification = {
        id: notifRaw.id as string,
        shop_id: notifRaw.shop_id as string,
        type: notifRaw.type as string,
        title: notifRaw.title as string,
        body: notifRaw.body as string,
        data: (notifRaw.data as Record<string, any>) || {},
        is_read: Boolean(notifRaw.is_read),
        created_at: notifRaw.created_at as string,
      };

      // Add to global state (duplicate protection happens inside store)
      handlersRef.current.addNotification(notif);
      
      const { soundEnabled } = useSettingsStore.getState();
      if (soundEnabled) {
        playOrderNotification(notif.id);
      }

      const { browserNotificationsEnabled } = useSettingsStore.getState();
      if (browserNotificationsEnabled && typeof window !== "undefined" && Notification.permission === "granted") {
        try {
          const n = new Notification(notif.title, {
            body: notif.body,
            icon: "/favicon.ico",
            tag: notif.id,
          });
          n.onclick = () => {
            window.focus();
            if (notif.data?.order_id) {
              window.dispatchEvent(
                new CustomEvent("navigate-to-order", {
                  detail: `/dashboard/orders/${notif.data.order_id}`,
                })
              );
            }
          };
        } catch (err) {}
      }
      
      return;
    }

    const { updateOrder: storeUpdateOrder, removeOrder: storeRemoveOrder, queryClient: qClient } = handlersRef.current;

    if (payload.table === "orders") {
      if (payload.eventType === "INSERT") {
        const order = mapRawToOrder(payload.new);
        pendingInserts.current.push(order);
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
        batchTimerRef.current = setTimeout(flushInsertBatch, 150);
      } else if (payload.eventType === "UPDATE") {
        const updated = mapRawToOrder(payload.new);
        storeUpdateOrder(updated.id, updated);

        qClient.setQueryData<Order[]>(["orders", activeShopId], (prev) =>
          (prev ?? []).map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
        );

        const isStillPlaced = updated.order_status === "PLACED";
        qClient.setQueryData<Order[]>(["new-orders", activeShopId], (prev) => {
          if (!prev) return isStillPlaced ? [updated] : [];
          if (isStillPlaced) {
            const exists = prev.some((o) => o.id === updated.id);
            return exists
              ? prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
              : [updated, ...prev];
          }
          return prev.filter((o) => o.id !== updated.id);
        });

        qClient.invalidateQueries({ queryKey: ["dashboard-stats", activeShopId] });
      } else if (payload.eventType === "DELETE") {
        const id = (payload.old as { id: string }).id;
        storeRemoveOrder(id);
        qClient.setQueryData<Order[]>(["orders", activeShopId], (prev) =>
          (prev ?? []).filter((o) => o.id !== id)
        );
        qClient.setQueryData<Order[]>(["new-orders", activeShopId], (prev) =>
          (prev ?? []).filter((o) => o.id !== id)
        );
      }
    }
  }, [flushInsertBatch]);

  // Main subscription setup
  useEffect(() => {
    if (!shopId) return;
    
    // Seed initial notifications immediately
    useNotificationStore.getState().setNotifications(initialNotifications);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!url || url.includes("your-project")) return;

    if (activeChannel && activeChannelShopId !== shopId) {
      const oldChannel = activeChannel;
      activeChannel = null;
      activeChannelShopId = null;
      createClient().removeChannel(oldChannel).catch(() => {});
    }

    const initSubscription = () => {
      const supabase = createClient();
      const channelName = `shop:${shopId}:realtime:v4`;
      
      const existingChannel = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
      if (existingChannel) {
        supabase.removeChannel(existingChannel).catch(() => {});
      }

      const channel = supabase.channel(channelName);
      activeChannel = channel;
      activeChannelShopId = shopId;
      setRealtimeChannel(channel);

      channel
        .on(
          "postgres_changes" as any,
          { event: "*", schema: "public", table: "orders", filter: `shop_id=eq.${shopId}` },
          handleRealtimeEvent
        )
        .on(
          "postgres_changes" as any,
          { event: "INSERT", schema: "public", table: "notifications", filter: `shop_id=eq.${shopId}` },
          handleRealtimeEvent
        );

      channel.subscribe((status: string, err?: Error) => {
        if (status === "SUBSCRIBED") {
          reconnectAttempts = 0;
          isReconnecting = false;
          setRealtimeStatus("connected");
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeStatus("disconnected");
          handleReconnect();
        }
      });
    };

    const handleReconnect = () => {
      if (isReconnecting) return;
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

      isReconnecting = true;
      reconnectAttempts++;
      const delay = Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1), 30000);
      setRealtimeStatus("reconnecting");

      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        isReconnecting = false;
        if (activeChannel) {
          const channelToCleanup = activeChannel;
          activeChannel = null;
          createClient().removeChannel(channelToCleanup).catch(() => {});
        }
        initSubscription();
      }, delay);
    };

    initSubscription();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["orders", shopId] });
        queryClient.invalidateQueries({ queryKey: ["new-orders", shopId] });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    };
  }, [shopId, setRealtimeChannel, setRealtimeStatus, queryClient, handleRealtimeEvent]);

  // Request browser notification permissions on mount
  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  return null;
}
