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

// ─────────────────────────────────────────────────────────────────────────────
// Audio notification (Delegated to preloaded AudioManager & settingsStore)
// ─────────────────────────────────────────────────────────────────────────────
function playNotificationSound() {
  try {
    const { soundEnabled, notificationSound } = useSettingsStore.getState();
    console.log(
      `[Realtime] 🔊 playNotificationSound: Attempting playback. Enabled=${soundEnabled}, Choice="${notificationSound}"`
    );
    if (soundEnabled) {
      audioManager.play(notificationSound);
    } else {
      console.log("[Realtime] 🔇 playNotificationSound: Alert sound skipped (merchant sound toggle is off)");
    }
  } catch (err) {
    console.error("[Realtime] ❌ playNotificationSound: Playback exception inside realtime trigger:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser push notification
// ─────────────────────────────────────────────────────────────────────────────
function showBrowserNotification(order: Order) {
  if (typeof window === "undefined") return;
  if (Notification.permission === "granted") {
    new Notification("🖨️ New Print Order!", {
      body: `${order.customer_name || "Customer"} placed an order — ₹${order.total_amount}`,
      icon: "/favicon.ico",
      tag: order.id,
    });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") showBrowserNotification(order);
    });
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
export function useRealtimeOrders(shopId: string | null) {
  const queryClient = useQueryClient();
  const { incrementNotifications } = useShopStore();
  const { addNewOrder, incrementPending, setRealtimeChannel } = useOrderStore();

  // Keep references to all values that might change to avoid re-subscription loops
  const shopIdRef = useRef(shopId);
  const addNewOrderRef = useRef(addNewOrder);
  const incrementPendingRef = useRef(incrementPending);
  const incrementNotificationsRef = useRef(incrementNotifications);
  
  // Update mutable refs on each render
  useEffect(() => {
    shopIdRef.current = shopId;
    addNewOrderRef.current = addNewOrder;
    incrementPendingRef.current = incrementPending;
    incrementNotificationsRef.current = incrementNotifications;
  }, [shopId, addNewOrder, incrementPending, incrementNotifications]);

  // Stable refs for subscription management
  const channelRef = useRef<RealtimeChannel | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Batch inserts over 300ms to prevent re-renders on burst traffic
  const pendingInserts = useRef<Order[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Flush the INSERT batch ────────────────────────────────────────────────
  const flushInsertBatch = useCallback(() => {
    const batch = pendingInserts.current.splice(0);
    const activeShopId = shopIdRef.current;
    if (!batch.length || !activeShopId) return;

    console.log(`[Realtime] 📦 Flushing batch of ${batch.length} order events...`);

    // Patch cache: prepend new orders (deduplication guard)
    batch.forEach((order) => {
      // 1. Duplicate Event Protection
      if (playedOrderIds.has(order.id)) {
        console.log(`[Realtime] 🛡️ Duplicate event detected for order: "${order.id}". Skipping audio chime.`);
        return;
      }
      
      // Cache the played order ID (limit size to 100 to prevent memory leaks)
      playedOrderIds.add(order.id);
      if (playedOrderIds.size > 100) {
        const oldestKey = playedOrderIds.keys().next().value;
        if (oldestKey !== undefined) {
          playedOrderIds.delete(oldestKey);
        }
      }

      queryClient.setQueryData<Order[]>(["orders", activeShopId], (prev) => {
        if (!prev) return [order];
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev : [order, ...prev];
      });
      queryClient.setQueryData<Order[]>(["new-orders", activeShopId], (prev) => {
        if (!prev) return [order];
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev : [order, ...prev];
      });

      addNewOrderRef.current(order);
      incrementPendingRef.current();
      incrementNotificationsRef.current();
      playNotificationSound();
      showBrowserNotification(order);
    });

    // Invalidate dashboard stats
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats", activeShopId] });

    // Toast alerts
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

    // Tab title flash
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
  }, [queryClient]);

  // ── Realtime event handler ────────────────────────────────────────────────
  const handleRealtimeEvent = useCallback(
    (payload: {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => {
      const activeShopId = shopIdRef.current;
      if (!activeShopId) return;

      if (payload.eventType === "INSERT") {
        const order = mapRawToOrder(payload.new);
        console.log(
          `[Realtime] 📥 Order INSERT event received: ID="${order.id}", customer="${order.customer_name || "Guest"}", amount=₹${order.total_amount}`
        );
        pendingInserts.current.push(order);
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
        // 300ms debounce to batch bursts cleanly
        batchTimerRef.current = setTimeout(flushInsertBatch, 300);
      } else if (payload.eventType === "UPDATE") {
        const updated = mapRawToOrder(payload.new);
        console.log(`[Realtime] 📥 Order UPDATE event received: ID="${updated.id}", status="${updated.order_status}"`);
        // Patch cache instantly
        queryClient.setQueryData<Order[]>(["orders", activeShopId], (prev) =>
          (prev ?? []).map((o) =>
            o.id === updated.id ? { ...o, ...updated } : o
          )
        );
        queryClient.setQueryData<Order[]>(["new-orders", activeShopId], (prev) =>
          (prev ?? []).map((o) =>
            o.id === updated.id ? { ...o, ...updated } : o
          )
        );
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats", activeShopId] });
      } else if (payload.eventType === "DELETE") {
        const id = (payload.old as { id: string }).id;
        console.log(`[Realtime] 📥 Order DELETE event received: ID="${id}"`);
        queryClient.setQueryData<Order[]>(["orders", activeShopId], (prev) =>
          (prev ?? []).filter((o) => o.id !== id)
        );
        queryClient.setQueryData<Order[]>(["new-orders", activeShopId], (prev) =>
          (prev ?? []).filter((o) => o.id !== id)
        );
      }
    },
    [queryClient, flushInsertBatch]
  );

  // ── Stable Subscribe / unsubscribe helpers ──────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (channelRef.current) {
      const activeShopId = shopIdRef.current;
      console.log(`[Realtime] 🔌 Unsubscribing channel for shop: "${activeShopId}"`);
      try {
        const supabase = createClient();
        await supabase.removeChannel(channelRef.current);
        console.log("[Realtime] ✅ Cleanup complete");
      } catch (err) {
        console.warn("[Realtime] ⚠️ Channel removal error (ignored during teardown):", err);
      }
      channelRef.current = null;
      setRealtimeChannel(null);
    }
  }, [setRealtimeChannel]);

  const subscribe = useCallback(() => {
    const activeShopId = shopIdRef.current;
    if (!activeShopId) return;

    // Guard against placeholder / demo configs
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!url || url.includes("your-project")) return;

    // 1. Prevent duplicate subscription channels (local ref guard)
    if (channelRef.current) {
      console.log("[Realtime] 🛡️ Local ref guard: active channel ref exists. Skipping subscription creation.");
      return;
    }

    const supabase = createClient();
    const channelName = `shop:${activeShopId}:orders:v3`;
    const channelTopic = `realtime:${channelName}`;

    // 2. Global Supabase registry check — catches React Strict Mode double-invocations
    //    where cleanup nulled channelRef but the channel is still alive in Supabase internals.
    const existingChannel = supabase
      .getChannels()
      .find((c) => c.topic === channelTopic);

    if (existingChannel) {
      console.log(`[Realtime] 🗑️ Removed duplicate channel from Supabase registry: ${channelName}`);
      supabase.removeChannel(existingChannel).catch(() => {
        // Best-effort removal; ignore errors
      });
    }

    console.log(`[Realtime] 🔌 Subscribing to Supabase orders for shop: "${activeShopId}"...`);

    const channel = supabase
      .channel(channelName)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `shop_id=eq.${activeShopId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => handleRealtimeEvent(payload)
      )
      .subscribe((status: string, err?: Error) => {
        if (status === "SUBSCRIBED") {
          console.log(`[Realtime] ✅ Connected: listening to public.orders for shop "${activeShopId}"`);
          retryCountRef.current = 0; // reset backoff on success
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          const delay = Math.min(1_000 * 2 ** retryCountRef.current, 30_000);
          retryCountRef.current += 1;
          console.warn(
            `[Realtime] ⚠️ Subscription status "${status}" — retrying in ${delay}ms (attempt ${retryCountRef.current})`,
            err
          );
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            // Only retry if no active channel exists
            if (!channelRef.current) subscribe();
          }, delay);
        }
      });

    channelRef.current = channel;
    setRealtimeChannel(channel);
  }, [handleRealtimeEvent, setRealtimeChannel]);

  // ── Effect ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (shopId) {
      subscribe();
    }

    // Visibility-aware lifecycle:
    // When the tab is hidden the browser may kill the WebSocket.
    // → On hide: gracefully remove the channel.
    // → On show: resubscribe + invalidate to fetch any missed events.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        console.log("[Realtime] Tab backgrounded: Removing subscription...");
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
        unsubscribe();
      } else {
        console.log("[Realtime] Tab focused: Restoring subscription...");
        subscribe();
        // One-shot refetch to catch any missed events while backgrounded
        const activeShopId = shopIdRef.current;
        if (activeShopId) {
          queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      console.log("[Realtime] 🧹 Unmounting: cleaning up handlers & unsubscribing...");
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]); // Only triggers on mount/unmount and when the specific shopId changes.
}
