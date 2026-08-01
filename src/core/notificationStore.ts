import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Notification } from './types/notification';

export type { Notification, NotificationActionType, NotificationType } from './types/notification';

interface NotificationStoreState {
    notifications: Notification[];
    loading: boolean;
    error: string | null;

    // Actions
    addNotification: (notification: Notification) => void;
    removeNotification: (id: string) => void;
    setNotifications: (notifications: Notification[]) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    clearNotifications: () => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;

    // Selectors
    unreadCount: () => number;
    getUnreadNotifications: () => Notification[];
}

export const useNotificationStore = create<NotificationStoreState>()(
    devtools(
        (set, get) => ({
            notifications: [],
            loading: false,
            error: null,

            addNotification: (notification: Notification) => {
                set((state) => {
                    // Nhắc việc lặp lại dùng cùng _id: thay nội dung và đưa lại
                    // lên đầu thay vì bỏ qua bản realtime mới nhất.
                    return {
                        notifications: [
                            notification,
                            ...state.notifications.filter((item) => item._id !== notification._id),
                        ],
                    };
                });
            },

            removeNotification: (id: string) => {
                set((state) => ({
                    notifications: state.notifications.filter((n) => n._id !== id),
                }));
            },

            setNotifications: (notifications: Notification[]) => {
                set({ notifications });
            },

            markAsRead: (id: string) => {
                set((state) => ({
                    notifications: state.notifications.map((n) =>
                        n._id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
                    ),
                }));
            },

            markAllAsRead: () => {
                set((state) => ({
                    notifications: state.notifications.map((n) => ({
                        ...n,
                        isRead: true,
                        readAt: new Date().toISOString(),
                    })),
                }));
            },

            clearNotifications: () => {
                set({ notifications: [] });
            },

            setLoading: (loading: boolean) => {
                set({ loading });
            },

            setError: (error: string | null) => {
                set({ error });
            },

            unreadCount: () => {
                return get().notifications.filter((n) => !n.isRead).length;
            },

            getUnreadNotifications: () => {
                return get().notifications.filter((n) => !n.isRead);
            },
        }),
        { name: 'NotificationStore' }
    )
);
