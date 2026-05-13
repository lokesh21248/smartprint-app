"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useShopStore } from "@/stores/shopStore";
import { useOrderStore } from "@/stores/orderStore";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Order } from "@/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

let audioCtx: AudioContext | null = null;

function playNotificationSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    oscillator.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + 0.2);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.5);
  } catch {
    // Audio not available
  }
}

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



export function useRealtimeOrders(shopId: string | null) {
  const queryClient = useQueryClient();
  const { soundEnabled, incrementNotifications } = useShopStore();
  const { addNewOrder, incrementPending, setRealtimeChannel } = useOrderStore();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Batch pending order events every 500ms to avoid re-rendering on every
  // single DB change when a shop is getting 100+ orders/hour.
  const pendingBatch = useRef<Order[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushBatch = useCallback(() => {
    const batch = pendingBatch.current.splice(0);
    if (!batch.length) return;

    // ── Zero-HTTP cache update ──────────────────────────────────────────────
    // Patch both order caches directly from the realtime payload.
    // This avoids triggering background HTTP refetches (previously 3 per event).
    // Only stats (aggregates we can't patch locally) need a real invalidation.
    batch.forEach((order) => {
      // Update main orders list
      queryClient.setQueryData<Order[]>(["orders", shopId], (prev) => {
        if (!prev) return [order, ...[]];
        // Deduplicate: don't add if already present (React Strict Mode fires twice)
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev : [order, ...prev];
      });
      // Update new-orders feed (dashboard widget)
      queryClient.setQueryData<Order[]>(["new-orders", shopId], (prev) => {
        if (!prev) return [order];
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev : [order, ...prev];
      });
    });

    // Only invalidate the stats aggregation — it can't be patched locally
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats", shopId] });

    // Notifications & sound
    batch.forEach((order) => {
      addNewOrder(order);
      incrementPending();
      incrementNotifications();
      if (soundEnabled) playNotificationSound();
      showBrowserNotification(order);
    });

    // Single toast summarising the batch
    if (batch.length === 1) {
      const order = batch[0];
      toast.success(`🖨️ New order from ${order.customer_name || "Guest"}`, {
        description: `₹${order.total_amount.toFixed(2)} · ${order.page_count} pages × ${order.copies} copies`,
        duration: 10000,
        action: { label: "View", onClick: () => (window.location.href = `/orders/${order.id}`) },
      });
    } else {
      toast.success(`🖨️ ${batch.length} new orders received`, {
        description: "Check your orders dashboard",
        duration: 8000,
        action: { label: "View All", onClick: () => (window.location.href = "/orders") },
      });
    }
  }, [queryClient, shopId, soundEnabled, addNewOrder, incrementPending, incrementNotifications]);

  const handleNewOrder = useCallback(
    (order: Order) => {
      pendingBatch.current.push(order);
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      batchTimerRef.current = setTimeout(flushBatch, 500); // 500ms debounce

      // Tab title flash is immediate (low cost)
      if (typeof window !== "undefined") {
        const originalTitle = document.title;
        let flashes = 0;
        const flashInterval = setInterval(() => {
          document.title = flashes % 2 === 0 ? "🔔 (1) NEW ORDER!" : originalTitle;
          flashes++;
          if (flashes >= 10) {
            clearInterval(flashInterval);
            document.title = originalTitle;
          }
        }, 500);
      }
    },
    [flushBatch]
  );

  const subscribe = useCallback(() => {
    if (!shopId) return;
    const isDemo =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project");
    if (isDemo) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`shop:${shopId}:orders`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          // Realtime sends raw DB row — must map to Order type
          // DB column → Order type field mismatches:
          //   is_color      → color
          //   is_double_sided → double_sided
          //   status        → order_status
          const raw = payload.new as Record<string, unknown>;
          const mapped: Order = {
            ...(raw as unknown as Order),
            color: raw.is_color as boolean,
            double_sided: raw.is_double_sided as boolean,
            order_status: raw.status as Order["order_status"],
          };
          handleNewOrder(mapped);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Reset backoff on successful connection
          retryCountRef.current = 0;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Exponential backoff: 1s, 2s, 4s, 8s … capped at 30s
          const delay = Math.min(1000 * 2 ** retryCountRef.current, 30_000);
          retryCountRef.current += 1;
          console.warn(`[Realtime] Channel ${status} — retrying in ${delay}ms (attempt ${retryCountRef.current})`);
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            supabase.removeChannel(channel).then(() => subscribe());
          }, delay);
        }
      });

    channelRef.current = channel;
    setRealtimeChannel(channel);
  }, [shopId, handleNewOrder, setRealtimeChannel]);

  useEffect(() => {
    subscribe();

    // ── Visibility-aware subscription ──────────────────────────────────────
    // On mobile, browsers kill backgrounded WebSocket connections which causes
    // a reconnect loop. Instead: gracefully unsubscribe when hidden, and
    // resubscribe + do a single fresh fetch when visible again.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Clean up gracefully to avoid reconnect loops
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
        setRealtimeChannel(null);
      } else {
        // Tab is visible again: resubscribe and fetch any missed orders
        subscribe();
        queryClient.invalidateQueries({ queryKey: ["orders", shopId] });
        queryClient.invalidateQueries({ queryKey: ["new-orders", shopId] });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      setRealtimeChannel(null);
    };
  }, [subscribe, setRealtimeChannel, queryClient, shopId]);
}
