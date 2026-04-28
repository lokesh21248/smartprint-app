"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useShopStore } from "@/stores/shopStore";
import { useOrderStore } from "@/stores/orderStore";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Order } from "@/types";

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

// Throttle: max N calls per interval
function createThrottle(fn: (...args: unknown[]) => void, limit: number, interval: number) {
  let count = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: unknown[]) => {
    if (count < limit) {
      count++;
      fn(...args);
    }
    if (!timer) {
      timer = setTimeout(() => {
        count = 0;
        timer = null;
      }, interval);
    }
  };
}

export function useRealtimeOrders(shopId: string | null) {
  const queryClient = useQueryClient();
  const { soundEnabled, incrementNotifications } = useShopStore();
  const { addNewOrder, incrementPending, setRealtimeChannel } = useOrderStore();
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  const handleNewOrder = useCallback(
    (order: Order) => {
      // Update React Query cache
      queryClient.invalidateQueries({ queryKey: ["orders", shopId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", shopId] });

      addNewOrder(order);
      incrementPending();
      incrementNotifications();

      if (soundEnabled) playNotificationSound();
      showBrowserNotification(order);

      // Visual flash & Tab title change
      if (typeof window !== "undefined") {
        const originalTitle = document.title;
        let flashes = 0;
        const flashInterval = setInterval(() => {
          document.title = flashes % 2 === 0 ? "🔔 (1) NEW ORDER!" : originalTitle;
          document.body.classList.toggle("bg-red-50");
          flashes++;
          if (flashes >= 10) {
            clearInterval(flashInterval);
            document.title = originalTitle;
            document.body.classList.remove("bg-red-50");
          }
        }, 500);
      }

      toast.success(
        `🖨️ New order from ${order.customer_name || "Guest"}`,
        {
          description: `₹${order.total_amount} · ${order.page_count} pages × ${order.copies} copies`,
          duration: 10000,
          action: { label: "View", onClick: () => window.location.href = `/orders/${order.id}` },
        }
      );
    },
    [queryClient, shopId, soundEnabled, addNewOrder, incrementPending, incrementNotifications]
  );

  const throttledHandler = useRef(
    createThrottle(handleNewOrder as (...args: unknown[]) => void, 10, 1000)
  );

  useEffect(() => {
    if (!shopId) return;

    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL ||
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
          throttledHandler.current(payload.new as Order);
        }
      )
      .subscribe();

    channelRef.current = channel;
    setRealtimeChannel(channel);

    return () => {
      supabase.removeChannel(channel);
      setRealtimeChannel(null);
    };
  }, [shopId, setRealtimeChannel]);
}
