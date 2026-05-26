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

// ─────────────────────────────────────────────────────────────────────────────
// Audio notification (Delegated to preloaded AudioManager & settingsStore)
// ─────────────────────────────────────────────────────────────────────────────
function playNotificationSound() {
  try {
    const { soundEnabled, notificationSound } = useSettingsStore.getState();
    if (soundEnabled) {
      audioManager.play(notificationSound);
    }
  } catch (err) {
    console.error("[useRealtimeOrders] Failed to play notification sound:", err);
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

  // Stable refs so callbacks don't stale-close over old values
  const channelRef = useRef<RealtimeChannel | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Batch inserts over 300ms to prevent re-renders on burst traffic
  const pendingInserts = useRef<Order[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Flush the INSERT batch ────────────────────────────────────────────────
  const flushInsertBatch = useCallback(() => {
    const batch = pendingInserts.current.splice(0);
    if (!batch.length) return;

    // Patch cache: prepend new orders (deduplication guard)
    batch.forEach((order) => {
      queryClient.setQueryData<Order[]>(["orders", shopId], (prev) => {
        if (!prev) return [order];
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev : [order, ...prev];
      });
      queryClient.setQueryData<Order[]>(["new-orders", shopId], (prev) => {
        if (!prev) return [order];
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev : [order, ...prev];
      });

      addNewOrder(order);
      incrementPending();
      incrementNotifications();
      playNotificationSound();
      showBrowserNotification(order);
    });

    // Invalidate only the stats aggregate — it can't be patched locally
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats", shopId] });

    // Toast
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
  }, [queryClient, shopId, addNewOrder, incrementPending, incrementNotifications]);

  // ── Realtime event handler ────────────────────────────────────────────────
  const handleRealtimeEvent = useCallback(
    (payload: {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => {
      if (payload.eventType === "INSERT") {
        const order = mapRawToOrder(payload.new);
        pendingInserts.current.push(order);
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
        // 300ms debounce — tight enough to feel instant, loose enough to batch bursts
        batchTimerRef.current = setTimeout(flushInsertBatch, 300);
      } else if (payload.eventType === "UPDATE") {
        const updated = mapRawToOrder(payload.new);
        // Patch cache instantly — no HTTP needed
        queryClient.setQueryData<Order[]>(["orders", shopId], (prev) =>
          (prev ?? []).map((o) =>
            o.id === updated.id ? { ...o, ...updated } : o
          )
        );
        queryClient.setQueryData<Order[]>(["new-orders", shopId], (prev) =>
          (prev ?? []).map((o) =>
            o.id === updated.id ? { ...o, ...updated } : o
          )
        );
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats", shopId] });
      } else if (payload.eventType === "DELETE") {
        const id = (payload.old as { id: string }).id;
        queryClient.setQueryData<Order[]>(["orders", shopId], (prev) =>
          (prev ?? []).filter((o) => o.id !== id)
        );
        queryClient.setQueryData<Order[]>(["new-orders", shopId], (prev) =>
          (prev ?? []).filter((o) => o.id !== id)
        );
      }
    },
    [queryClient, shopId, flushInsertBatch]
  );

  // ── Subscribe / unsubscribe helpers ──────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (channelRef.current) {
      try {
        const supabase = createClient();
        await supabase.removeChannel(channelRef.current);
      } catch {
        // Ignore cleanup errors
      }
      channelRef.current = null;
      setRealtimeChannel(null);
    }
  }, [setRealtimeChannel]);

  const subscribe = useCallback(() => {
    if (!shopId) return;

    // Guard against placeholder / demo configs
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!url || url.includes("your-project")) return;

    // Tear down any existing channel first to prevent duplicate subscriptions
    if (channelRef.current) {
      const supabase = createClient();
      supabase.removeChannel(channelRef.current).catch(() => {});
      channelRef.current = null;
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`shop:${shopId}:orders:v2`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `shop_id=eq.${shopId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => handleRealtimeEvent(payload)
      )
      .subscribe((status: string, err?: Error) => {
        if (status === "SUBSCRIBED") {
          retryCountRef.current = 0; // reset backoff on success
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Exponential backoff: 1s → 2s → 4s → … → max 30s
          const delay = Math.min(1_000 * 2 ** retryCountRef.current, 30_000);
          retryCountRef.current += 1;
          console.warn(
            `[Realtime] ${status} — retrying in ${delay}ms (attempt ${retryCountRef.current})`,
            err
          );
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => subscribe(), delay);
        }
      });

    channelRef.current = channel;
    setRealtimeChannel(channel);
  }, [shopId, handleRealtimeEvent, setRealtimeChannel]);

  // ── Effect ────────────────────────────────────────────────────────────────
  useEffect(() => {
    subscribe();

    // Visibility-aware lifecycle:
    // When the tab is hidden the browser may kill the WebSocket.
    // → On hide: gracefully remove the channel.
    // → On show: resubscribe + invalidate to fetch any missed events.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
        unsubscribe();
      } else {
        subscribe();
        // One-shot refetch to catch any missed events while backgrounded
        queryClient.invalidateQueries({ queryKey: ["orders", shopId] });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]); // Re-subscribe only when shopId changes
}
