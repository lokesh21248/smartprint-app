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
import type { AppNotification } from "@/stores/notificationStore";

const isDev = process.env.NODE_ENV !== "production";

// ─── Module-level singleton state ────────────────────────────────────────────
// These live outside the component so they survive route changes (the component
// re-renders but module scope is stable for the lifetime of the page session).
let activeChannel: RealtimeChannel | null = null;
let activeChannelShopId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let isReconnecting = false;

// Tracks order IDs we already know about so realtime inserts of pre-existing
// orders (e.g. from initial SSR load) are not treated as new arrivals.
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
}

interface GlobalNotificationProviderProps {
  shopId: string | null;
  initialNotifications: AppNotification[];
}

export function GlobalNotificationProvider({ shopId, initialNotifications }: GlobalNotificationProviderProps) {
  const queryClient = useQueryClient();
  const { addOrder, updateOrder, removeOrder, setRealtimeChannel, setRealtimeStatus } = useOrderStore();
  const { addNotification } = useNotificationStore();

  // ─── Stable handler ref ───────────────────────────────────────────────────
  // We store ALL mutable values in a ref so the subscription useEffect can
  // have a minimal dep array of [shopId] only. The ref is always current.
  const stateRef = useRef({
    addOrder,
    updateOrder,
    removeOrder,
    addNotification,
    queryClient,
    setRealtimeChannel,
    setRealtimeStatus,
    shopId,
  });

  // Keep the ref in sync on every render — zero cost, no effect re-run.
  stateRef.current = {
    addOrder,
    updateOrder,
    removeOrder,
    addNotification,
    queryClient,
    setRealtimeChannel,
    setRealtimeStatus,
    shopId,
  };

  // ─── One-time seeding guard ────────────────────────────────────────────────
  // We seed the notification store exactly ONCE when this component first
  // mounts. Subsequent re-renders (caused by unreadCount changing, route
  // transitions, etc.) must NOT overwrite the store with the stale SSR
  // snapshot — that would erase any realtime notifications that arrived after
  // the initial server render.
  const hasSeededNotificationsRef = useRef(false);

  // Batch insert timer — coalesces rapid realtime ORDER inserts into one flush
  const pendingInserts = useRef<Order[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Realtime event handler (stable ref, never changes identity) ──────────
  const handleRealtimeEventRef = useRef<((payload: RealtimePayload) => void) | null>(null);

  handleRealtimeEventRef.current = (payload: RealtimePayload) => {
    const {
      addOrder: storeAddOrder,
      updateOrder: storeUpdateOrder,
      removeOrder: storeRemoveOrder,
      addNotification: storeAddNotification,
      queryClient: qClient,
      shopId: currentShopId,
    } = stateRef.current;

    if (!currentShopId) return;

    // ── Notifications table INSERT ─────────────────────────────────────────
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

      if (isDev) {
        console.log("[ORDER_SYNC] 🔔 Realtime notification received:", notif.id, notif.type);
      }

      // addNotification has built-in duplicate protection (checks notif.id)
      storeAddNotification(notif);

      const { soundEnabled } = useSettingsStore.getState();
      if (soundEnabled) {
        playOrderNotification(notif.id);
      }

      const { browserNotificationsEnabled } = useSettingsStore.getState();
      if (
        browserNotificationsEnabled &&
        typeof window !== "undefined" &&
        Notification.permission === "granted"
      ) {
        try {
          const n = new Notification(notif.title, {
            body: notif.body,
            icon: "/favicon.ico",
            tag: notif.id,
          });
          n.onclick = () => {
            window.focus();
            const orderId = notif.data?.order_id;
            if (orderId) {
              window.dispatchEvent(
                new CustomEvent("navigate-to-order", {
                  detail: `/dashboard/orders/${orderId}`,
                })
              );
            }
          };
        } catch (_err) {}
      }

      return;
    }

    // ── Orders table changes ───────────────────────────────────────────────
    if (payload.table === "orders") {
      if (payload.eventType === "INSERT") {
        const order = mapRawToOrder(payload.new);

        // Skip if this order was already known from the initial SSR load
        if (knownOrderIds.has(order.id)) {
          if (isDev) {
            console.log("[ORDER_SYNC] ⏭ Skipping known order INSERT:", order.id);
          }
          return;
        }

        pendingInserts.current.push(order);
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
        batchTimerRef.current = setTimeout(() => {
          const batch = pendingInserts.current.splice(0);
          if (!batch.length) return;

          if (isDev) {
            console.log(`[ORDER_SYNC] 📦 Flushing batch of ${batch.length} new order(s)`);
          }

          batch.forEach((o) => {
            storeAddOrder(o);
            knownOrderIds.add(o.id);

            qClient.setQueryData<Order[]>(["orders", currentShopId], (prev) => {
              if (!prev) return [o];
              const exists = prev.some((x) => x.id === o.id);
              return exists ? prev.map((x) => (x.id === o.id ? o : x)) : [o, ...prev];
            });

            qClient.setQueryData<Order[]>(["new-orders", currentShopId], (prev) => {
              if (!prev) return [o];
              const exists = prev.some((x) => x.id === o.id);
              return exists ? prev.map((x) => (x.id === o.id ? o : x)) : [o, ...prev];
            });
          });

          qClient.invalidateQueries({ queryKey: ["dashboard-stats", currentShopId] });
        }, 150);
      } else if (payload.eventType === "UPDATE") {
        const updated = mapRawToOrder(payload.new);
        storeUpdateOrder(updated.id, updated);

        qClient.setQueryData<Order[]>(["orders", currentShopId], (prev) =>
          (prev ?? []).map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
        );

        const isStillPlaced = updated.order_status === "PLACED";
        qClient.setQueryData<Order[]>(["new-orders", currentShopId], (prev) => {
          if (!prev) return isStillPlaced ? [updated] : [];
          if (isStillPlaced) {
            const exists = prev.some((o) => o.id === updated.id);
            return exists
              ? prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
              : [updated, ...prev];
          }
          return prev.filter((o) => o.id !== updated.id);
        });

        qClient.invalidateQueries({ queryKey: ["dashboard-stats", currentShopId] });
      } else if (payload.eventType === "DELETE") {
        const id = (payload.old as { id: string }).id;
        storeRemoveOrder(id);
        qClient.setQueryData<Order[]>(["orders", currentShopId], (prev) =>
          (prev ?? []).filter((o) => o.id !== id)
        );
        qClient.setQueryData<Order[]>(["new-orders", currentShopId], (prev) =>
          (prev ?? []).filter((o) => o.id !== id)
        );
      }
    }
  };

  // ─── Stable callback wrapper — identity never changes ─────────────────────
  // This is passed directly to Supabase `.on()`. Because it's defined once
  // (stable ref wrapper), Supabase sees the same function reference every time
  // and does not register duplicate listeners.
  const stableRealtimeHandler = useCallback((payload: RealtimePayload) => {
    handleRealtimeEventRef.current?.(payload);
  }, []); // empty deps — intentional; handler reads from ref

  // ─── Main subscription effect — deps: [shopId] ONLY ──────────────────────
  // This effect runs exactly once on mount, and re-runs only if shopId changes
  // (i.e., the admin somehow changes shops without a full page reload, which
  // should not happen but is handled defensively).
  useEffect(() => {
    if (!shopId) return;

    // ── Seed notification store ONCE on first mount ────────────────────────
    if (!hasSeededNotificationsRef.current) {
      hasSeededNotificationsRef.current = true;
      useNotificationStore.getState().setNotifications(initialNotifications);
      if (isDev) {
        console.log(
          "[ORDER_SYNC] 🌱 Seeded notification store with",
          initialNotifications.length,
          "initial notifications"
        );
      }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!url || url.includes("your-project")) return;

    // ── Clean up stale channel for a different shop ───────────────────────
    if (activeChannel && activeChannelShopId !== shopId) {
      const oldChannel = activeChannel;
      activeChannel = null;
      activeChannelShopId = null;
      createClient()
        .removeChannel(oldChannel)
        .catch(() => {});
    }

    // ── Subscription initializer ──────────────────────────────────────────
    const initSubscription = async () => {
      // Guard: if we already have an active, non-reconnecting channel for this
      // shop, reuse it — do NOT create a second channel.
      if (activeChannel && activeChannelShopId === shopId && !isReconnecting) {
        stateRef.current.setRealtimeChannel(activeChannel);
        if (isDev) {
          console.log("[ORDER_SYNC] ♻️ Reusing existing channel for shop:", shopId);
        }
        return;
      }

      const supabase = createClient();
      const channelName = `shop:${shopId}:realtime:v4`;

      // Remove any orphaned Supabase channel with the same name
      const existingChannel = supabase
        .getChannels()
        .find((c) => c.topic === `realtime:${channelName}`);
      if (existingChannel) {
        if (isDev) {
          console.log("[ORDER_SYNC] 🗑 Removing orphaned channel:", channelName);
        }
        await supabase.removeChannel(existingChannel).catch(() => {});
      }

      if (isDev) {
        console.log("[ORDER_SYNC] 📡 Creating new realtime channel:", channelName);
      }

      const channel = supabase.channel(channelName);
      activeChannel = channel;
      activeChannelShopId = shopId;
      stateRef.current.setRealtimeChannel(channel);

      channel
        .on(
          "postgres_changes" as any,
          { event: "*", schema: "public", table: "orders", filter: `shop_id=eq.${shopId}` },
          stableRealtimeHandler
        )
        .on(
          "postgres_changes" as any,
          { event: "INSERT", schema: "public", table: "notifications", filter: `shop_id=eq.${shopId}` },
          stableRealtimeHandler
        );

      channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          reconnectAttempts = 0;
          isReconnecting = false;
          stateRef.current.setRealtimeStatus("connected");
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          if (isDev) {
            console.log("[ORDER_SYNC] ✅ Realtime channel subscribed for shop:", shopId);
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          stateRef.current.setRealtimeStatus("disconnected");
          handleReconnect();
        }
      });
    };

    const handleReconnect = () => {
      if (isReconnecting) return;
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

      isReconnecting = true;
      reconnectAttempts++;
      const delay = Math.min(
        INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1),
        30000
      );
      stateRef.current.setRealtimeStatus("reconnecting");

      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        isReconnecting = false;
        if (activeChannel) {
          const channelToCleanup = activeChannel;
          activeChannel = null;
          createClient()
            .removeChannel(channelToCleanup)
            .catch(() => {});
        }
        initSubscription();
      }, delay);
    };

    initSubscription();

    // Re-validate orders cache when the tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const { queryClient: qc, shopId: sid } = stateRef.current;
        qc.invalidateQueries({ queryKey: ["orders", sid] });
        qc.invalidateQueries({ queryKey: ["new-orders", sid] });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      // NOTE: We intentionally do NOT destroy activeChannel here.
      // The channel must survive route changes within the same session.
      // It is only destroyed when: (a) shopId changes, or (b) the user logs out.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]); // ← ONLY shopId. All other values accessed via stateRef.

  // ─── Browser notification permission request ──────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  return null;
}
