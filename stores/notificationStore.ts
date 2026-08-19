import { create } from "zustand";

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
    const unreadCount = notifs.filter((n) => !n.is_read && n.type === 'new_order').length;
    set({
      notifications: notifs,
      unreadCount,
      latestNotification: notifs[0] || null,
      lastNotificationId: notifs[0]?.id || null,
    });
  },

  addNotification: (notif) => {
    const state = get();
    // Duplicate protection
    if (state.notifications.some((n) => n.id === notif.id)) {
      return;
    }
    const nextNotifs = [notif, ...state.notifications];
    const isUnreadNewOrder = !notif.is_read && notif.type === 'new_order';
    
    set({
      notifications: nextNotifs,
      unreadCount: state.unreadCount + (isUnreadNewOrder ? 1 : 0),
      latestNotification: notif,
      lastNotificationId: notif.id,
    });
  },

  markAsRead: (id) => {
    set((state) => {
      let isChanged = false;
      let wasNewOrder = false;
      const nextNotifs = state.notifications.map((n) => {
        if (n.id === id && !n.is_read) {
          isChanged = true;
          if (n.type === 'new_order') {
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
