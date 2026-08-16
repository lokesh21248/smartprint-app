"use client";

/**
 * GlobalNewOrderNotification
 *
 * A rich, fixed-position notification overlay that appears on ANY admin page
 * when a new order arrives via Supabase Realtime. It subscribes to the global
 * orderStore.newOrders array — which is populated by useRealtimeOrders
 * (mounted in ShopStoreInitializer in the dashboard layout) — so it works
 * regardless of which page is currently active.
 *
 * Features:
 * - Fixed position, high z-index (above everything)
 * - Shows order ID, amount, customer name
 * - "View Order" button navigates to the existing order detail route
 * - "Close" button and automatic 12s dismissal
 * - Deduplicates by order.id — one notification per order, ever
 * - Mobile-responsive layout
 * - Smooth slide-in / fade-in animation
 *
 * Mounted ONCE in the authenticated dashboard layout. Renders nothing until
 * a new order arrives.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useOrderStore } from "@/stores/orderStore";
import { X, Bell, ShoppingBag } from "lucide-react";
import type { Order } from "@/types";

// Module-level set so it persists across re-renders and even hot-reloads
// in dev. Ensures we never show a duplicate notification for the same order ID.
const shownOrderIds = new Set<string>();

interface NotificationState {
  order: Order;
  dismissAt: number; // timestamp when auto-dismiss fires
}

export function GlobalNewOrderNotification() {
  const newOrders = useOrderStore((s) => s.newOrders);
  const [queue, setQueue] = useState<NotificationState[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Watch newOrders from the global store — when a genuinely new order arrives
  // (one we haven't shown a notification for), add it to our local queue.
  useEffect(() => {
    if (!newOrders.length) return;

    const unseen = newOrders.filter((o) => !shownOrderIds.has(o.id));
    if (!unseen.length) return;

    unseen.forEach((o) => shownOrderIds.add(o.id));

    // Keep the deduplication set bounded so it doesn't grow unboundedly over
    // a long session. 500 entries is more than enough for any shift.
    if (shownOrderIds.size > 500) {
      const oldest = shownOrderIds.values().next().value;
      if (oldest !== undefined) shownOrderIds.delete(oldest);
    }

    const now = Date.now();
    const newEntries: NotificationState[] = unseen.map((order) => ({
      order,
      dismissAt: now + 12_000, // 12 seconds auto-dismiss
    }));

    setQueue((prev) => [...prev, ...newEntries]);
  }, [newOrders]);

  // Dismiss a single notification by order ID
  const dismiss = useCallback((orderId: string) => {
    setQueue((prev) => prev.filter((n) => n.order.id !== orderId));
  }, []);

  // Auto-dismiss — schedule a re-check whenever the queue changes
  useEffect(() => {
    if (!queue.length) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    const soonest = Math.min(...queue.map((n) => n.dismissAt));
    const delay = Math.max(0, soonest - Date.now());

    timerRef.current = setTimeout(() => {
      const now = Date.now();
      setQueue((prev) => prev.filter((n) => n.dismissAt > now));
    }, delay + 50); // +50ms buffer so the timer fires after the deadline

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [queue]);

  // Navigate to order detail via existing OrderNavigationHandler event bus
  const handleViewOrder = useCallback((orderId: string) => {
    dismiss(orderId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("navigate-to-order", {
          detail: `/dashboard/orders/${orderId}`,
        })
      );
    }
  }, [dismiss]);

  if (!queue.length) return null;

  // Show at most 3 stacked notifications to avoid flooding the screen
  const visible = queue.slice(0, 3);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      aria-label="New order notifications"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none"
      style={{ maxWidth: "min(400px, calc(100vw - 2rem))" }}
    >
      {visible.map((notification) => (
        <NewOrderCard
          key={notification.order.id}
          order={notification.order}
          onDismiss={dismiss}
          onViewOrder={handleViewOrder}
        />
      ))}
      {queue.length > 3 && (
        <div
          className="pointer-events-auto bg-slate-800 text-white text-xs font-semibold rounded-xl px-4 py-2.5 shadow-lg text-center"
          style={{ animation: "slideIn 200ms ease-out" }}
        >
          +{queue.length - 3} more new order{queue.length - 3 === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

// ─── Individual notification card ──────────────────────────────────────────

interface NewOrderCardProps {
  order: Order;
  onDismiss: (id: string) => void;
  onViewOrder: (id: string) => void;
}

function NewOrderCard({ order, onDismiss, onViewOrder }: NewOrderCardProps) {
  const [exiting, setExiting] = useState(false);

  const handleDismiss = () => {
    setExiting(true);
    // Wait for the exit animation before removing from queue
    setTimeout(() => onDismiss(order.id), 250);
  };

  const handleView = () => {
    setExiting(true);
    setTimeout(() => onViewOrder(order.id), 150);
  };

  const formattedAmount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(order.total_amount ?? 0);

  return (
    <div
      role="alert"
      aria-label={`New order received: ${order.short_token}`}
      className="pointer-events-auto relative bg-white border border-emerald-200 rounded-2xl shadow-2xl overflow-hidden"
      style={{
        animation: exiting
          ? "slideOut 250ms ease-in forwards"
          : "slideIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      {/* Accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-400 to-emerald-600 rounded-l-2xl" />

      <div className="pl-4 pr-3 pt-3 pb-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Bell icon with pulse ring */}
            <div className="relative flex-shrink-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                <Bell className="h-4.5 w-4.5 text-emerald-600" aria-hidden="true" />
              </div>
              <span
                className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white"
                aria-hidden="true"
              />
            </div>

            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600 leading-none mb-0.5">
                🔔 New Order
              </p>
              <p className="text-sm font-black text-slate-900 truncate leading-tight">
                #{order.short_token}
              </p>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={handleDismiss}
            id={`dismiss-order-notification-${order.id}`}
            aria-label="Dismiss notification"
            className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all duration-150 active:scale-90"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Order details */}
        <div className="bg-slate-50 rounded-xl p-2.5 mb-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500 font-medium">Amount</span>
            <span className="text-sm font-black text-slate-900">{formattedAmount}</span>
          </div>

          {order.customer_name && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 font-medium">Customer</span>
              <span className="text-xs font-semibold text-slate-700 truncate max-w-[160px]">
                {order.customer_name}
              </span>
            </div>
          )}

          {(order.page_count > 0 || order.copies > 0) && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 font-medium">Print</span>
              <span className="text-xs font-semibold text-slate-600">
                {order.page_count}pg × {order.copies}{" "}
                <span className={order.color ? "text-blue-600" : "text-slate-500"}>
                  ({order.color ? "Color" : "B&W"})
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Action button */}
        <button
          type="button"
          id={`view-order-notification-${order.id}`}
          onClick={handleView}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-bold rounded-xl px-4 py-2.5 transition-all duration-150 active:scale-[0.98] shadow-sm"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          View Order
        </button>
      </div>

      {/* Progress bar — visual countdown for auto-dismiss */}
      <AutoDismissBar durationMs={12_000} />
    </div>
  );
}

// ─── Auto-dismiss progress bar ──────────────────────────────────────────────

function AutoDismissBar({ durationMs }: { durationMs: number }) {
  return (
    <div className="h-0.5 bg-emerald-50">
      <div
        className="h-full bg-emerald-300 origin-left"
        style={{
          animation: `shrink ${durationMs}ms linear forwards`,
        }}
      />
    </div>
  );
}
