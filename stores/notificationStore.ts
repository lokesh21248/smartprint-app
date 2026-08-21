import { create } from "zustand";
import { playOrderNotification } from "@/lib/audio/orderNotification";
import { useSettingsStore } from "@/stores/settingsStore";

export interface AppNotification {
  id: string;
  shop_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

// ─── Module-level sound deduplication ─────────────────────────────────────────
//
// WHY module-level (not Zustand state)?
// Zustand state triggers re-renders. A Set<string> that only gates sound
// should NEVER cause re-renders — it is pure side-effect logic.
//
// WHY does this need to be here (not in GlobalNotificationProvider)?
// Both the Supabase Realtime path AND the API polling path call
// addNotification(). By placing the dedup Set here, in the store that
// both paths write through, we guarantee exactly-once sound playback
// regardless of which delivery mechanism fires first.
//
// Lifecycle: persists for the browser session. Route changes (React re-renders
// of GlobalNotificationProvider) do NOT reset this — which is exactly what
// we want so a navigation doesn't replay the sound.
//
// Size guard: trimmed to 1000 entries to prevent unbounded memory growth in
// very long sessions.
const processedSoundIds = new Set<string>();
const MAX_PROCESSED_IDS = 1000;

function markSoundProcessed(id: string): boolean {
  if (processedSoundIds.has(id)) return false; // already processed

  // Trim oldest entries if we're at the limit
  if (processedSoundIds.size >= MAX_PROCESSED_IDS) {
    const firstKey = processedSoundIds.values().next().value;
    if (firstKey !== undefined) processedSoundIds.delete(firstKey);
  }

  processedSoundIds.add(id);
  return true; // newly processed
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  latestNotification: AppNotification | null;
  lastNotificationId: string | null;

  setNotifications: (notifs: AppNotification[]) => void;
  addNotification: (notif: AppNotification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  latestNotification: null,
  lastNotificationId: null,

  setNotifications: (notifs) => {
    // Only count 'new_order' notifications that are unread
    const unreadCount = notifs.filter((n) => !n.is_read && n.type === "new_order").length;
    set({
      notifications: notifs,
      unreadCount,
      latestNotification: notifs[0] || null,
      lastNotificationId: notifs[0]?.id || null,
    });
  },

  addNotification: (notif) => {
    const state = get();

    // ── Duplicate guard: reject if we already have this notification ID ──────
    if (state.notifications.some((n) => n.id === notif.id)) {
      return;
    }

    const nextNotifs = [notif, ...state.notifications];
    const isUnreadNewOrder = !notif.is_read && notif.type === "new_order";

    set({
      notifications: nextNotifs,
      unreadCount: state.unreadCount + (isUnreadNewOrder ? 1 : 0),
      latestNotification: notif,
      lastNotificationId: notif.id,
    });

    // ── Sound: play once per notification ID, across ALL delivery paths ──────
    //
    // markSoundProcessed() returns true only on the first call for a given ID.
    // Whether the notification arrived via:
    //   A) Supabase Realtime   → GlobalNotificationProvider → addNotification()
    //   B) API polling         → GlobalNotificationProvider → addNotification()
    //
    // ...only the first arrival plays sound. The second is a silent no-op.
    if (isUnreadNewOrder && markSoundProcessed(notif.id)) {
      const { soundEnabled } = useSettingsStore.getState();
      if (soundEnabled) {
        playOrderNotification(notif.id);
      }
    }
  },

  markAsRead: (id) => {
    set((state) => {
      let isChanged = false;
      let wasNewOrder = false;
      const nextNotifs = state.notifications.map((n) => {
        if (n.id === id && !n.is_read) {
          isChanged = true;
          if (n.type === "new_order") {
            wasNewOrder = true;
          }
          return { ...n, is_read: true };
        }
        return n;
      });

      if (!isChanged) return state;

      return {
        notifications: nextNotifs,
        unreadCount: Math.max(0, state.unreadCount - (wasNewOrder ? 1 : 0)),
      };
    });
  },

  markAllAsRead: () => {
    set((state) => ({
      unreadCount: 0,
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
    }));
  },
}));
