import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type NotificationActionType =
    | 'machine'
    | 'user'
    | 'asset'
    | 'transfer'
    | 'maintenance'
    | 'borrowing'
    | 'system';

export interface Notification {
    _id: string;
    userId: string;
    title: string;
    message: string;
    type: NotificationType;
    actionType: NotificationActionType;
    actionId?: string;
    isRead: boolean;
    createdAt: string;
    readAt?: string;
}

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
        persist(
            (set, get) => ({
                notifications: [],
                loading: false,
                error: null,

                addNotification: (notification: Notification) => {
                    set((state) => ({
                        notifications: [notification, ...state.notifications],
                    }));
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
            {
                name: 'notification-store',
                partialize: (state) => ({
                    notifications: state.notifications,
                }),
            }
        )
    )
);
