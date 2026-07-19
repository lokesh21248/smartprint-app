"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useShopStore } from "@/stores/shopStore";
import { useOrderStore } from "@/stores/orderStore";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { audioManager } from "@/lib/audioManager";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Order } from "@/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Global, module-level cache for duplicate insert protection
// Prevents duplicate notification sound triggers if network hiccups cause duplicate events
const playedOrderIds = new Set<string>();

// Single source of truth — avoids repeated process.env.NODE_ENV lookups
const isDev = process.env.NODE_ENV !== "production";

// ─────────────────────────────────────────────────────────────────────────────
// Audio notification (Delegated to preloaded AudioManager & settingsStore)
// ─────────────────────────────────────────────────────────────────────────────
function playNotificationSound() {
  try {
    const { soundEnabled, notificationSound } = useSettingsStore.getState();
    if (isDev) {
      console.log(
        `[Realtime] 🔊 playNotificationSound: Attempting playback. Enabled=${soundEnabled}, Choice="${notificationSound}"`
      );
    }
    if (soundEnabled) {
      audioManager.play(notificationSound);
    } else if (isDev) {
      console.log("[Realtime] 🔇 playNotificationSound: Alert sound skipped (merchant sound toggle is off)");
    }
  } catch (err) {
    if (isDev) console.error("[Realtime] ❌ playNotificationSound: Playback exception inside realtime trigger:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser push notification
// Permission is requested proactively in useRealtimeOrders via a useEffect
// so it is attached to an explicit user gesture (page load interaction),
// not inside an async event handler where browsers block permission prompts.
// ─────────────────────────────────────────────────────────────────────────────
function showBrowserNotification(order: Order) {
  if (typeof window === "undefined") return;
  if (Notification.permission !== "granted") {
    if (isDev) {
      console.warn("[Realtime] 🔕 Browser notification skipped — permission not granted. Current:", Notification.permission);
    }
    return;
  }
  try {
    new Notification("🖨️ New Print Order!", {
      body: `${order.customer_name || "Customer"} placed an order — ₹${order.total_amount}`,
      icon: "/favicon.ico",
      tag: order.id,
    });
    if (isDev) {
      console.log("[Realtime] 🔔 Browser notification dispatched for order:", order.id);
    }
  } catch (err) {
    if (isDev) console.error("[Realtime] ❌ Browser notification failed:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Map raw DB row → Order type
// (DB uses is_color / is_double_sided / status; our type uses color / double_sided / order_status)
// ─────────────────────────────────────────────────────────────────────────────
function mapRawToOrder(raw: Record<string, unknown>): Order {
  return {
    ...(raw as unknown as Order),
    color: raw.is_color as boolean,
    double_sided: raw.is_double_sided as boolean,
    order_status: raw.status as Order["order_status"],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
// Module-level caches for single realtime channel management
let activeChannel: RealtimeChannel | null = null;
let activeChannelShopId: string | null = null;
let subscriberCount = 0;

// Controlled reconnection manager variables
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let isReconnecting = false;
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 2000;

// Module-level reference to setRealtimeStatus so initSubscription can call it
type StatusSetter = (s: import("@/stores/orderStore").RealtimeStatus) => void;
let _setStatus: StatusSetter | null = null;

/** Call this from the "Reconnect" button — resets backoff and retries immediately */
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

// Supabase realtime channel exposes internal state not in the public types; use a narrow interface instead of any
interface ChannelWithState {
  state: string;
}

// Payload type from Supabase postgres_changes events
type RealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

// Set of active event handlers across all mounted hook instances
const activeHandlers = new Set<(payload: RealtimePayload) => void>();

// Centralized reconnect helper with exponential backoff
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
      // Ensure we remove the channel before establishing a new one
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

// Centralized subscription initializer
async function initSubscription(
  shopId: string,
  setRealtimeChannel: (c: RealtimeChannel | null) => void
) {
  // If we are already subscribed to this shopId, reuse the channel if it's active!
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

  // Guard against placeholder / demo configs
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url || url.includes("your-project")) return;

  // Cleanup old channel if shopId changed
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

  // Registry cleanup
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
    console.log("[Realtime] Subscribing:", shopId);
  }

  const channel = supabase
    .channel(channelName)
    .on(
      // Cast through unknown to satisfy the overloaded `.on()` signature without
      // a self-referential `channel` variable (which would cause TS7022).
      "postgres_changes" as unknown as "system",
      {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload: RealtimePayload) => {
        // Dispatch to all active handlers across hook instances
        activeHandlers.forEach((handler) => handler(payload));
      }
    );

  channel.subscribe((status: string, err?: Error) => {
    if (status === "SUBSCRIBED") {
      // Only log in development — this message exposes the shop UUID and
      // internal infrastructure hints (ALTER PUBLICATION, migration filenames)
      // in the production browser console.
      if (isDev) {
        console.log(
          `[Realtime] ✅ SUBSCRIBED to channel "${channelName}" for shop "${shopId}".`,
          `\n  → If no INSERT events arrive, verify:`,
          `\n  1. orders table is in supabase_realtime publication (run: ALTER PUBLICATION supabase_realtime ADD TABLE orders;)`,
          `\n  2. RLS policy allows anon SELECT on orders (run migration 20260709000001_enable_realtime_orders.sql)`,
        );
      }
      reconnectAttempts = 0;
      isReconnecting = false;
      _setStatus?.("connected");
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      // Keep this warn in both dev and prod — connection failures are actionable
      // and help diagnose issues from Vercel/Sentry error monitoring.
      if (isDev) console.warn(`[Realtime] ⚠️ Subscription status "${status}" for shop "${shopId}"`, err);
      handleReconnect(shopId, setRealtimeChannel);
    } else {
      if (isDev) {
        console.log(`[Realtime] ℹ️ Subscription status: "${status}" for shop "${shopId}"`);
      }
    }
  });

  activeChannel = channel;
  activeChannelShopId = shopId;
  setRealtimeChannel(channel);
}

// Centralized subscription teardown
async function terminateSubscription(
  setRealtimeChannel: (c: RealtimeChannel | null) => void
) {
  const shopId = activeChannelShopId;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  isReconnecting = false;

  if (activeChannel) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[Realtime] Unsubscribing:", shopId);
    }
    const channelToCleanup = activeChannel;
    activeChannel = null;
    activeChannelShopId = null;
    setRealtimeChannel(null);
    const supabase = createClient();
    await supabase.removeChannel(channelToCleanup).catch(() => {});
  }
}

export function useRealtimeOrders(shopId: string | null) {
  const queryClient = useQueryClient();
  const { incrementNotifications } = useShopStore();
  const { addNewOrder, incrementPending, decrementPending, setRealtimeChannel, setRealtimeStatus } = useOrderStore();

  // Wire the module-level status setter so non-hook code (forceReconnect, handleReconnect)
  // can update the store without prop-drilling.
  useEffect(() => {
    _setStatus = setRealtimeStatus;
    return () => { _setStatus = null; };
  }, [setRealtimeStatus]);

  // Proactively request browser notification permission on mount.
  // Must be done here (inside a useEffect, linked to a page-load event) NOT inside
  // the realtime event handler — browsers block permission prompts in async callbacks.
  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Realtime] 🔔 Requesting browser notification permission...");
      }
      Notification.requestPermission().then((perm) => {
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Realtime] 🔔 Browser notification permission: "${perm}"`);
        }
      }).catch((err) => {
        console.warn("[Realtime] Failed to request notification permission:", err);
      });
    } else if (process.env.NODE_ENV !== "production") {
      console.log(`[Realtime] 🔔 Browser notification permission already set: "${Notification.permission}"`);
    }
  }, []);

  // Create refs to keep handler callbacks always fresh without re-subscribing
  const handlersRef = useRef({
    addNewOrder,
    incrementPending,
    decrementPending,
    incrementNotifications,
    queryClient,
  });

  useEffect(() => {
    handlersRef.current = {
      addNewOrder,
      incrementPending,
      decrementPending,
      incrementNotifications,
      queryClient,
    };
  }, [addNewOrder, incrementPending, decrementPending, incrementNotifications, queryClient]);

  // Keep timers at the local hook level
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingInserts = useRef<Order[]>([]);

  // Flush the INSERT batch
  const flushInsertBatch = useCallback(() => {
    const batch = pendingInserts.current.splice(0);
    const activeShopId = shopId;
    if (!batch.length || !activeShopId) return;

    if (process.env.NODE_ENV !== "production") {
      console.log(`[Realtime] 📦 Flushing batch of ${batch.length} order events...`);
    }

    batch.forEach((order) => {
      if (playedOrderIds.has(order.id)) {
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Realtime] 🛡️ Duplicate event detected for order: "${order.id}". Skipping audio chime.`);
        }
        return;
      }
      
      playedOrderIds.add(order.id);
      if (playedOrderIds.size > 100) {
        const oldestKey = playedOrderIds.keys().next().value;
        if (oldestKey !== undefined) {
          playedOrderIds.delete(oldestKey);
        }
      }

      const { addNewOrder: addOrder, incrementPending: incPending, incrementNotifications: incNotifications, queryClient: qClient } = handlersRef.current;

      qClient.setQueryData<Order[]>(["orders", activeShopId], (prev) => {
        if (!prev) return [order];
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev : [order, ...prev];
      });
      qClient.setQueryData<Order[]>(["new-orders", activeShopId], (prev) => {
        if (!prev) return [order];
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev : [order, ...prev];
      });

      addOrder(order);
      incPending();
      incNotifications();
      playNotificationSound();
      showBrowserNotification(order);
    });

    queryClient.invalidateQueries({ queryKey: ["dashboard-stats", activeShopId] });

    if (batch.length === 1) {
      const order = batch[0];
      toast.success(`🖨️ New order from ${order.customer_name || "Guest"}`, {
        description: `₹${order.total_amount?.toFixed(2)} · ${order.page_count} pages × ${order.copies} copies`,
        duration: 10_000,
        action: {
          label: "View",
          onClick: () => (window.location.href = `/dashboard/orders/${order.id}`),
        },
      });
    } else {
      toast.success(`🖨️ ${batch.length} new orders received`, {
        description: "Check your orders dashboard",
        duration: 8_000,
        action: {
          label: "View All",
          onClick: () => (window.location.href = "/dashboard/orders"),
        },
      });
    }

    if (typeof window !== "undefined") {
      const originalTitle = document.title;
      let flashes = 0;
      const interval = setInterval(() => {
        document.title =
          flashes % 2 === 0 ? `🔔 (${batch.length}) NEW ORDER!` : originalTitle;
        flashes++;
        if (flashes >= 10) {
          clearInterval(interval);
          document.title = originalTitle;
        }
      }, 600);
    }
  }, [shopId, queryClient]);

  // Realtime event handler
  const handleRealtimeEvent = useCallback(
    (payload: {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => {
      const activeShopId = shopId;
      if (!activeShopId) return;

      const { queryClient: qClient } = handlersRef.current;

      if (payload.eventType === "INSERT") {
        const order = mapRawToOrder(payload.new);
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Realtime] 📥 Order INSERT event received: ID="${order.id}"`);
        }
        pendingInserts.current.push(order);
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
        batchTimerRef.current = setTimeout(flushInsertBatch, 300);
      } else if (payload.eventType === "UPDATE") {
        const updated = mapRawToOrder(payload.new);
        const oldStatus = (payload.old as Record<string, unknown>).status as string | undefined;
        const newStatus = updated.order_status as string;
        const wasPlaced = oldStatus?.toUpperCase() === "PLACED";
        const isStillPlaced = newStatus?.toUpperCase() === "PLACED";

        if (process.env.NODE_ENV !== "production") {
          console.log(`[Realtime] 📥 Order UPDATE event received: ID="${updated.id}", ${oldStatus} → ${newStatus}`);
        }

        // If order left PLACED status (accepted/rejected by another tab/device)
        // decrement the pending badge and remove from the new-orders feed.
        if (wasPlaced && !isStillPlaced) {
          handlersRef.current.decrementPending();
          qClient.setQueryData<Order[]>(["new-orders", activeShopId], (prev) =>
            (prev ?? []).filter((o) => o.id !== updated.id)
          );
        }

        qClient.setQueryData<Order[]>(["orders", activeShopId], (prev) =>
          (prev ?? []).map((o) =>
            o.id === updated.id ? { ...o, ...updated } : o
          )
        );
        // Only keep in new-orders cache if still PLACED
        if (isStillPlaced) {
          qClient.setQueryData<Order[]>(["new-orders", activeShopId], (prev) =>
            (prev ?? []).map((o) =>
              o.id === updated.id ? { ...o, ...updated } : o
            )
          );
        }
        qClient.invalidateQueries({ queryKey: ["dashboard-stats", activeShopId] });
      } else if (payload.eventType === "DELETE") {
        const id = (payload.old as { id: string }).id;
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Realtime] 📥 Order DELETE event received: ID="${id}"`);
        }
        qClient.setQueryData<Order[]>(["orders", activeShopId], (prev) =>
          (prev ?? []).filter((o) => o.id !== id)
        );
        qClient.setQueryData<Order[]>(["new-orders", activeShopId], (prev) =>
          (prev ?? []).filter((o) => o.id !== id)
        );
      }
    },
    [shopId, flushInsertBatch]
  );

  // Register event handler with global listener set
  useEffect(() => {
    const handler = (payload: RealtimePayload) => handleRealtimeEvent(payload);
    activeHandlers.add(handler);
    return () => {
      activeHandlers.delete(handler);
    };
  }, [handleRealtimeEvent]);

  // Main lifecycle effect
  useEffect(() => {
    if (!shopId) return;

    subscriberCount++;
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Realtime] Hook instance mounted for shop: ${shopId}. Total active subscribers: ${subscriberCount}`);
    }

    initSubscription(shopId, setRealtimeChannel);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Realtime] Visibility visible: Refreshing queries for shop: ${shopId} to fetch background updates...`);
        }
        queryClient.invalidateQueries({ queryKey: ["orders", shopId] });
        queryClient.invalidateQueries({ queryKey: ["new-orders", shopId] });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      subscriberCount--;
      if (process.env.NODE_ENV !== "production") {
        console.log(`[Realtime] Hook instance unmounted for shop: ${shopId}. Remaining active subscribers: ${subscriberCount}`);
      }

      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);

      if (subscriberCount <= 0) {
        terminateSubscription(setRealtimeChannel);
      }
    };
  }, [shopId, setRealtimeChannel, queryClient]);
}
