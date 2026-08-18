"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useNotificationStore, type AppNotification } from "@/stores/notificationStore";
import { X, Bell, ShoppingBag } from "lucide-react";
import { markNotificationAsRead } from "@/lib/actions/notifications";

// Module-level set so it persists across re-renders.
// Ensures we never show a duplicate notification for the same notification ID.
export const shownNotificationIds = new Set<string>();

export function markNotificationsAsSeen(ids: string[]) {
  ids.forEach((id) => shownNotificationIds.add(id));
}

interface NotificationUIState {
  notification: AppNotification;
  dismissAt: number;
}

export function GlobalNewOrderNotification() {
  const notifications = useNotificationStore((s) => s.notifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const [queue, setQueue] = useState<NotificationUIState[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Watch notifications from the global store
  useEffect(() => {
    if (!notifications.length) return;

    const unseen = notifications.filter((n) => !shownNotificationIds.has(n.id) && !n.is_read);
    if (!unseen.length) return;

    unseen.forEach((n) => shownNotificationIds.add(n.id));

    if (shownNotificationIds.size > 500) {
      const oldest = shownNotificationIds.values().next().value;
      if (oldest !== undefined) shownNotificationIds.delete(oldest);
    }

    const now = Date.now();
    const newEntries: NotificationUIState[] = unseen.map((notification) => ({
      notification,
      dismissAt: now + 12_000,
    }));

    setQueue((prev) => [...prev, ...newEntries]);
  }, [notifications]);

  const dismiss = useCallback((id: string) => {
    setQueue((prev) => prev.filter((n) => n.notification.id !== id));
    markAsRead(id);
    markNotificationAsRead(id).catch((err) => console.error("Failed to mark read:", err));
  }, [markAsRead]);

  useEffect(() => {
    if (!queue.length) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    const soonest = Math.min(...queue.map((n) => n.dismissAt));
    const delay = Math.max(0, soonest - Date.now());

    timerRef.current = setTimeout(() => {
      const now = Date.now();
      // Auto-dismiss from queue, don't necessarily mark as read in store, 
      // but the user can click it in the header later.
      setQueue((prev) => prev.filter((n) => n.dismissAt > now));
    }, delay + 50);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [queue]);

  const handleViewOrder = useCallback((notification: AppNotification) => {
    dismiss(notification.id);
    if (typeof window !== "undefined" && notification.data?.order_id) {
      window.dispatchEvent(
        new CustomEvent("navigate-to-order", {
          detail: `/dashboard/orders/${notification.data.order_id}`,
        })
      );
    }
  }, [dismiss]);

  if (!queue.length) return null;

  const visible = queue.slice(0, 3);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      aria-label="New notifications"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none"
      style={{ maxWidth: "min(400px, calc(100vw - 2rem))" }}
    >
      {visible.map(({ notification }) => (
        <NewOrderCard
          key={notification.id}
          notification={notification}
          onDismiss={dismiss}
          onViewOrder={() => handleViewOrder(notification)}
        />
      ))}
      {queue.length > 3 && (
        <div
          className="pointer-events-auto bg-slate-800 text-white text-xs font-semibold rounded-xl px-4 py-2.5 shadow-lg text-center"
          style={{ animation: "slideIn 200ms ease-out" }}
        >
          +{queue.length - 3} more new notification{queue.length - 3 === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

interface NewOrderCardProps {
  notification: AppNotification;
  onDismiss: (id: string) => void;
  onViewOrder: () => void;
}

function NewOrderCard({ notification, onDismiss, onViewOrder }: NewOrderCardProps) {
  const [exiting, setExiting] = useState(false);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(notification.id), 250);
  };

  const handleView = () => {
    setExiting(true);
    setTimeout(() => onViewOrder(), 150);
  };

  const orderData = notification.data || {};
  const formattedAmount = orderData.total_amount
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(Number(orderData.total_amount))
    : null;

  return (
    <div
      role="alert"
      aria-label={`${notification.title}: ${notification.body}`}
      className="pointer-events-auto relative bg-white border border-emerald-200 rounded-2xl shadow-2xl overflow-hidden"
      style={{
        animation: exiting
          ? "slideOut 250ms ease-in forwards"
          : "slideIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-400 to-emerald-600 rounded-l-2xl" />

      <div className="pl-4 pr-3 pt-3 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
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
                🔔 {notification.title}
              </p>
              <p className="text-sm font-black text-slate-900 truncate leading-tight">
                {notification.body}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            id={`dismiss-notification-${notification.id}`}
            aria-label="Dismiss notification"
            className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all duration-150 active:scale-90"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {orderData.order_id && (
          <div className="bg-slate-50 rounded-xl p-2.5 mb-3 space-y-1">
            {formattedAmount && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 font-medium">Amount</span>
                <span className="text-sm font-black text-slate-900">{formattedAmount}</span>
              </div>
            )}

            {orderData.customer_name && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 font-medium">Customer</span>
                <span className="text-xs font-semibold text-slate-700 truncate max-w-[160px]">
                  {orderData.customer_name}
                </span>
              </div>
            )}

            {(orderData.page_count > 0 || orderData.copies > 0) && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 font-medium">Print</span>
                <span className="text-xs font-semibold text-slate-600">
                  {orderData.page_count}pg × {orderData.copies}{" "}
                  <span className={orderData.color ? "text-blue-600" : "text-slate-500"}>
                    ({orderData.color ? "Color" : "B&W"})
                  </span>
                </span>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          id={`view-notification-${notification.id}`}
          onClick={handleView}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-bold rounded-xl px-4 py-2.5 transition-all duration-150 active:scale-[0.98] shadow-sm"
        >
          {orderData.order_id ? (
            <>
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              View Order
            </>
          ) : (
            "View Details"
          )}
        </button>
      </div>

      <AutoDismissBar durationMs={12_000} />
    </div>
  );
}

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
