"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useShopStore } from "@/stores/shopStore";
import { useOrderStore } from "@/stores/orderStore";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useSettingsStore } from "@/stores/settingsStore";
import { playOrderNotification } from "@/lib/audio/orderNotification";
import type { Order } from "@/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Global, module-level cache for duplicate insert protection
// Prevents duplicate notification sound triggers if network hiccups cause duplicate events
export const knownOrderIds = new Set<string>();

export function markOrdersAsKnown(orderIds: string[]) {
  orderIds.forEach((id) => knownOrderIds.add(id));
}

// Single source of truth — avoids repeated process.env.NODE_ENV lookups
const isDev = process.env.NODE_ENV !== "production";

// ─────────────────────────────────────────────────────────────────────────────
// Audio notification — delegates to the singleton audio manager.
// ─────────────────────────────────────────────────────────────────────────────
function playNotificationSound(orderId: string) {
  const { soundEnabled } = useSettingsStore.getState();
  if (!soundEnabled) {
    if (isDev) console.log(`[ORDER_NOTIFY] 🔇 Sound skipped (disabled) for order: ${orderId}`);
    return;
  }
  if (isDev) console.log(`[ORDER_NOTIFY] 🔊 Sound triggered for order: ${orderId}`);
  playOrderNotification(orderId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser push notification
// ─────────────────────────────────────────────────────────────────────────────
function showBrowserNotification(orderId: string, title: string, body: string) {
  if (typeof window === "undefined") return;

  const { browserNotificationsEnabled } = useSettingsStore.getState();
  if (!browserNotificationsEnabled) {
    if (isDev) {
      console.log("[ORDER_NOTIFY] 🔕 Browser notification skipped — disabled in settings");
    }
    return;
  }
  if (Notification.permission !== "granted") {
    if (isDev) {
      console.warn("[ORDER_NOTIFY] 🔕 Browser notification skipped — permission not granted. Current:", Notification.permission);
    }
    return;
  }
  try {
    const n = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: orderId, // deduplication: same order won't show twice
    });
    n.onclick = () => {
      window.focus();
      const href = `/dashboard/orders/${orderId}`;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("navigate-to-order", { detail: href }));
      }
    };
    if (isDev) {
      console.log("[ORDER_NOTIFY] 🔔 Browser notification dispatched for order:", orderId);
    }
  } catch (err) {
    if (isDev) console.error("[ORDER_NOTIFY] ❌ Browser notification failed:", err);
  }
}

// Map raw DB row → Order type
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

// ─────────────────────────────────────────────────────────────────────────────
// Module-level caches for single realtime channel management
// ─────────────────────────────────────────────────────────────────────────────
let activeChannel: RealtimeChannel | null = null;
let activeChannelShopId: string | null = null;
let subscriberCount = 0;

let teardownTimer: ReturnType<typeof setTimeout> | null = null;
const TEARDOWN_GRACE_MS = 200;

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let isReconnecting = false;
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 2000;

type StatusSetter = (s: import("@/stores/orderStore").RealtimeStatus) => void;
let _setStatus: StatusSetter | null = null;

export function forceReconnect() {
  if (!activeChannelShopId) return;
  reconnectAttempts = 0;
  isReconnecting = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  _setStatus?.("reconnecting");
  initSubscription(activeChannelShopId, () => {});
}

interface ChannelWithState {
  state: string;
}

type RealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

const activeHandlers = new Set<(payload: RealtimePayload) => void>();

function handleReconnect(
  shopId: string,
  setRealtimeChannel: (c: RealtimeChannel | null) => void
) {
  if (isReconnecting) return;
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    if (isDev) console.error(`[Realtime] ❌ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for shop "${shopId}". Stopping retries.`);
    _setStatus?.("disconnected");
    return;
  }

  isReconnecting = true;
  reconnectAttempts++;
  const delay = Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1), 30000);
  _setStatus?.("reconnecting");

  if (isDev) {
    console.log(`[Realtime] 🔄 Scheduling reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} for shop "${shopId}" in ${delay}ms...`);
  }

  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(async () => {
    isReconnecting = false;
    try {
      if (isDev) {
        console.log(`[Realtime] 🚀 Executing scheduled reconnect attempt ${reconnectAttempts} for shop "${shopId}"...`);
      }
      if (activeChannel) {
        const channelToCleanup = activeChannel;
        activeChannel = null;
        const supabase = createClient();
        await supabase.removeChannel(channelToCleanup).catch(() => {});
      }
      await initSubscription(shopId, setRealtimeChannel);
    } catch (e) {
      if (isDev) console.error(`[Realtime] ❌ Reconnect attempt ${reconnectAttempts} failed:`, e);
      handleReconnect(shopId, setRealtimeChannel);
    }
  }, delay);
}

async function initSubscription(
  shopId: string,
  setRealtimeChannel: (c: RealtimeChannel | null) => void
) {
  if (activeChannel && activeChannelShopId === shopId) {
    const state = (activeChannel as unknown as ChannelWithState).state;
    if (state === "joined" || state === "joining") {
      if (isDev) {
        console.log(`[Realtime] 🛡️ Channel already exists and is active (${state}) for shop ${shopId}. Reusing active channel.`);
      }
      return;
    } else {
      if (isDev) {
        console.log(`[Realtime] 🔄 Channel exists but is in "${state}" state. Re-initializing.`);
      }
      const oldChannel = activeChannel;
      activeChannel = null;
      const supabase = createClient();
      await supabase.removeChannel(oldChannel).catch(() => {});
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url || url.includes("your-project")) return;

  if (activeChannel && activeChannelShopId !== shopId) {
    if (isDev) {
      console.log(`[Realtime] 🔌 Shop ID changed from ${activeChannelShopId} to ${shopId}. Cleaning up old channel.`);
    }
    const oldChannel = activeChannel;
    activeChannel = null;
    activeChannelShopId = null;
    const supabase = createClient();
    await supabase.removeChannel(oldChannel).catch(() => {});
  }

  const supabase = createClient();
  const channelName = `shop:${shopId}:orders:v3`;
  const channelTopic = `realtime:${channelName}`;

  const existingChannel = supabase
    .getChannels()
    .find((c) => c.topic === channelTopic);

  if (existingChannel) {
    if (isDev) {
      console.log(`[Realtime] 🗑️ Removing duplicate channel from Supabase registry: ${channelName}`);
    }
    await supabase.removeChannel(existingChannel).catch(() => {});
  }

  if (isDev) {
    console.log(`[ORDER_SYNC] Subscribing to channel "${channelName}" for shop: ${shopId}`);
  }

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes" as any,
      {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload: RealtimePayload) => {
        if (isDev) {
          console.log(`[Realtime] 📡 RAW channel event (orders): type=${payload.eventType} id=${(payload.new as Record<string,unknown>)?.id ?? (payload.old as Record<string,unknown>)?.id ?? "?"}`);
        }
        activeHandlers.forEach((handler) => handler(payload));
      }
    )
    .on(
      "postgres_changes" as any,
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload: RealtimePayload) => {
        if (isDev) {
          console.log(`[Realtime] 📡 RAW channel event (notifications): type=${payload.eventType} id=${(payload.new as Record<string,unknown>)?.id ?? "?"}`);
        }
        activeHandlers.forEach((handler) => handler(payload));
      }
    );

  channel.subscribe((status: string, err?: Error) => {
    if (status === "SUBSCRIBED") {
      if (isDev) {
        console.log(`[ORDER REALTIME] subscription created: shop:${shopId}`);
        console.log(`[ORDER REALTIME] status: SUBSCRIBED`);
      }
      reconnectAttempts = 0;
      isReconnecting = false;
      _setStatus?.("connected");
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      if (isDev) console.warn(`[ORDER REALTIME] ⚠️ Subscription status "${status}" for shop "${shopId}"`, err);
      handleReconnect(shopId, setRealtimeChannel);
    } else {
      if (isDev) {
        console.log(`[ORDER REALTIME] status: ${status}`);
      }
    }
  });

  activeChannel = channel;
  activeChannelShopId = shopId;
  setRealtimeChannel(channel);
}

function terminateSubscription(
  setRealtimeChannel: (c: RealtimeChannel | null) => void
) {
  const shopId = activeChannelShopId;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  isReconnecting = false;

  if (teardownTimer) {
    clearTimeout(teardownTimer);
    teardownTimer = null;
  }

  if (!activeChannel) return;

  teardownTimer = setTimeout(async () => {
    teardownTimer = null;
    if (subscriberCount > 0) {
      if (isDev) {
        console.log(`[Realtime] 🛡️ Teardown cancelled — ${subscriberCount} active subscriber(s) still present.`);
      }
      return;
    }
    if (!activeChannel) return;
    if (isDev) console.log(`[ORDER REALTIME] subscription closed: shop:${shopId}`);
    const channelToCleanup = activeChannel;
    activeChannel = null;
    activeChannelShopId = null;
    setRealtimeChannel(null);
    const supabase = createClient();
    await supabase.removeChannel(channelToCleanup).catch(() => {});
  }, TEARDOWN_GRACE_MS);
}

export function useRealtimeOrders(shopId: string | null) {
  const queryClient = useQueryClient();
  const { incrementNotifications } = useShopStore();
  const { addOrder, updateOrder, removeOrder, setRealtimeChannel, setRealtimeStatus } = useOrderStore();

  useEffect(() => {
    _setStatus = setRealtimeStatus;
    return () => { _setStatus = null; };
  }, [setRealtimeStatus]);

  const realtimeStatus = useOrderStore((s) => s.realtimeStatus);

  useEffect(() => {
    if (realtimeStatus === "connected" && shopId) {
      if (isDev) {
        console.log(`[Realtime] Syncing data on connection for shop: ${shopId}`);
      }
      queryClient.invalidateQueries({ queryKey: ["orders", shopId] });
      queryClient.invalidateQueries({ queryKey: ["new-orders", shopId] });
    }
  }, [realtimeStatus, shopId, queryClient]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch((err) => {
        console.warn("[Realtime] Failed to request notification permission:", err);
      });
    }
  }, []);

  const handlersRef = useRef({
    addOrder,
    updateOrder,
    removeOrder,
    incrementNotifications,
    queryClient,
  });

  useEffect(() => {
    handlersRef.current = {
      addOrder,
      updateOrder,
      removeOrder,
      incrementNotifications,
      queryClient,
    };
  }, [addOrder, updateOrder, removeOrder, incrementNotifications, queryClient]);

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
      // 1. Immediately update centralized Zustand orderStore
      handlersRef.current.addOrder(order);
      if (isDev) {
        console.log(`[ORDER REALTIME] global store updated: ${order.id}`);
      }

      // 2. Immediately update React Query cache
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

  const handleRealtimeEvent = useCallback(
    (payload: RealtimePayload) => {
      const activeShopId = activeChannelShopId;
      if (!activeShopId) return;

      if (payload.table === "notifications" && payload.eventType === "INSERT") {
        const notif = payload.new;
        const orderId = notif.id as string;
        
        if (knownOrderIds.has(orderId)) {
          if (isDev) console.log(`[ORDER REALTIME] 🛡️ Notification for "${orderId}" already known — skipping alert.`);
          return;
        }
        knownOrderIds.add(orderId);
        if (knownOrderIds.size > 500) {
          const oldest = knownOrderIds.values().next().value;
          if (oldest !== undefined) knownOrderIds.delete(oldest);
        }
        
        handlersRef.current.incrementNotifications();
        
        if (isDev) {
          console.log(`[ORDER REALTIME] sound triggered: ${orderId}`);
          console.log(`[ORDER REALTIME] notification triggered: ${orderId}`);
        }
        playNotificationSound(orderId);
        showBrowserNotification(orderId, notif.title as string, notif.body as string);
        
        toast.success(notif.title as string, {
          description: notif.body as string,
          duration: 12_000,
          action: {
            label: "View Order",
            onClick: () => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("navigate-to-order", {
                    detail: `/dashboard/orders/${orderId}`,
                  })
                );
              }
            },
          },
        });
        
        if (typeof window !== "undefined") {
          const originalTitle = document.title;
          let flashes = 0;
          const interval = setInterval(() => {
            document.title = flashes % 2 === 0 ? `🔔 NEW ORDER!` : originalTitle;
            flashes++;
            if (flashes >= 10) {
              clearInterval(interval);
              document.title = originalTitle;
            }
          }, 600);
        }
        return;
      }

      const { updateOrder: storeUpdateOrder, removeOrder: storeRemoveOrder, queryClient: qClient } = handlersRef.current;

      if (payload.eventType === "INSERT") {
        const order = mapRawToOrder(payload.new);
        if (isDev) {
          console.log(`[ORDER REALTIME] INSERT received: orderId=${order.id}, shopId=${order.shop_id}`);
        }
        pendingInserts.current.push(order);
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
        batchTimerRef.current = setTimeout(flushInsertBatch, 150);
      } else if (payload.eventType === "UPDATE") {
        const updated = mapRawToOrder(payload.new);
        if (isDev) {
          console.log(`[ORDER_SYNC] 📥 Order status update received: ID="${updated.id}", status=${updated.order_status}`);
        }

        // 1. Immediately update centralized store
        storeUpdateOrder(updated.id, updated);

        // 2. Immediately update React Query caches
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
        if (isDev) {
          console.log(`[ORDER_SYNC] 📥 Order deleted: ID="${id}"`);
        }
        storeRemoveOrder(id);
        qClient.setQueryData<Order[]>(["orders", activeShopId], (prev) =>
          (prev ?? []).filter((o) => o.id !== id)
        );
        qClient.setQueryData<Order[]>(["new-orders", activeShopId], (prev) =>
          (prev ?? []).filter((o) => o.id !== id)
        );
      }
    },
    [flushInsertBatch]
  );

  useEffect(() => {
    const handler = (payload: RealtimePayload) => handleRealtimeEvent(payload);
    activeHandlers.add(handler);
    return () => {
      activeHandlers.delete(handler);
    };
  }, [handleRealtimeEvent]);

  useEffect(() => {
    if (!shopId) return;

    if (teardownTimer) {
      clearTimeout(teardownTimer);
      teardownTimer = null;
      if (isDev) {
        console.log(`[Realtime] 🛡️ Pending teardown cancelled — new subscriber arrived for shop: ${shopId}`);
      }
    }

    if (subscriberCount < 0) subscriberCount = 0;
    subscriberCount++;
    if (isDev) {
      console.log(`[ORDER_SYNC] Global listener initialized for shop: ${shopId}. Active subscribers: ${subscriberCount}`);
    }

    initSubscription(shopId, setRealtimeChannel);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (isDev) {
          console.log(`[Realtime] Visibility visible: Refreshing queries for shop: ${shopId}...`);
        }
        queryClient.invalidateQueries({ queryKey: ["orders", shopId] });
        queryClient.invalidateQueries({ queryKey: ["new-orders", shopId] });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      subscriberCount = Math.max(0, subscriberCount - 1);
      if (isDev) {
        console.log(`[ORDER_SYNC] Listener unmounted for shop: ${shopId}. Remaining active subscribers: ${subscriberCount}`);
      }

      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);

      if (subscriberCount <= 0) {
        terminateSubscription(setRealtimeChannel);
      }
    };
  }, [shopId, setRealtimeChannel, queryClient]);
}
