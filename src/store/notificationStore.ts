// ============================================
// 通知狀態管理 (Zustand) — 專注於通知
// ============================================

import { create } from 'zustand';
import type { Notification } from '@/shared/types/types';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;

  setNotifications: (notifications: Notification[], unreadCount: number) => void;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
  addNotification: (notification: Notification) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  setNotifications: (notifications, unreadCount) => {
    set({ notifications, unreadCount });
  },

  markAsRead: (notificationId) => {
    const { notifications, unreadCount } = get();
    const updated = notifications.map((n) =>
      n.id === notificationId ? { ...n, read: true } : n
    );
    const stillUnread = updated.filter((n) => !n.read).length;
    set({ notifications: updated, unreadCount: stillUnread });

    // 同步到後端
    fetch(`/api/notifications/${notificationId}`, { method: 'PATCH' }).catch(() => {});
  },

  markAllAsRead: async () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' });
    } catch {
      // non-critical
    }
  },

  fetchNotifications: async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        const list = data.notifications || data || [];
        const unread = list.filter((n: Notification) => !n.read).length;
        set({ notifications: list, unreadCount: unread });
      }
    } catch {
      // non-critical
    }
  },

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },
}));
