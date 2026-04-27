import { useEffect, useCallback } from 'react';
import { useNotificationStore, type Notification } from '../notificationStore';
import { notificationService } from '../services/notification.service';
import { socketService } from '../services/socket.service';
import { notification as antNotification } from 'antd';
import { useAuth } from '../contexts/AuthContext';

// Socket event names
const NOTIFICATION_EVENTS = {
    NEW: 'notify:new',
    READ: 'notify:read',
    CLEARED: 'notify:cleared',
    MARK_READ: 'notify:mark-read',
    CLEAR: 'notify:clear',
} as const;

export const useNotifications = () => {
    const store = useNotificationStore();
    const { isAuthenticated } = useAuth();

    // Initialize notifications on mount
    useEffect(() => {
        if (!isAuthenticated) {
            return;
        }

        const initializeNotifications = async () => {
            try {
                store.setLoading(true);
                store.setError(null);

                const result = await notificationService.getNotifications(20, 0);
                if (result && 'notifications' in result) {
                    store.setNotifications(result.notifications);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Failed to load notifications';
                store.setError(errorMessage);
                console.error('[Notifications] Initialization error:', error);
            } finally {
                store.setLoading(false);
            }
        };

        void initializeNotifications();
    }, [isAuthenticated, store]);

    // Setup socket listeners
    useEffect(() => {
        if (!isAuthenticated || !socketService.getSocket()) {
            return;
        }

        const unsubscribeNew = socketService.on<Notification>(NOTIFICATION_EVENTS.NEW, (notification) => {
            store.addNotification(notification);

            // Show toast notification
            showNotificationToast(notification);
        });

        const unsubscribeRead = socketService.on<{ notificationId: string }>(NOTIFICATION_EVENTS.READ, ({ notificationId }) => {
            store.markAsRead(notificationId);
        });

        const unsubscribeCleared = socketService.on(NOTIFICATION_EVENTS.CLEARED, () => {
            store.clearNotifications();
        });

        return () => {
            unsubscribeNew();
            unsubscribeRead();
            unsubscribeCleared();
        };
    }, [store, isAuthenticated]);

    // Mark notification as read
    const markAsRead = useCallback(
        async (notificationId: string) => {
            try {
                store.markAsRead(notificationId);
                await notificationService.markAsRead(notificationId);
            } catch (error) {
                console.error('[Notifications] Mark as read error:', error);
            }
        },
        [store]
    );

    // Mark all notifications as read
    const markAllAsRead = useCallback(async () => {
        try {
            store.markAllAsRead();
            await notificationService.markAllAsRead();
        } catch (error) {
            console.error('[Notifications] Mark all as read error:', error);
        }
    }, [store]);

    // Delete notification
    const deleteNotification = useCallback(
        async (notificationId: string) => {
            try {
                store.removeNotification(notificationId);
                await notificationService.deleteNotification(notificationId);
            } catch (error) {
                console.error('[Notifications] Delete error:', error);
                // Reload on error
                const result = await notificationService.getNotifications(20, 0);
                if (result && 'notifications' in result) {
                    store.setNotifications(result.notifications);
                }
            }
        },
        [store]
    );

    // Delete all notifications
    const deleteAllNotifications = useCallback(async () => {
        try {
            store.clearNotifications();
            await notificationService.deleteAllNotifications();
        } catch (error) {
            console.error('[Notifications] Delete all error:', error);
        }
    }, [store]);

    return {
        notifications: store.notifications,
        unreadCount: store.unreadCount(),
        loading: store.loading,
        error: store.error,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        deleteAllNotifications,
    };
};

/**
 * Show toast notification based on notification type
 */
function showNotificationToast(notification: Notification) {
    const notificationConfig = {
        message: notification.title,
        description: notification.message,
        duration: 4.5,
    };

    switch (notification.type) {
        case 'success':
            antNotification.success(notificationConfig);
            break;
        case 'warning':
            antNotification.warning(notificationConfig);
            break;
        case 'error':
            antNotification.error(notificationConfig);
            break;
        case 'info':
        default:
            antNotification.info(notificationConfig);
            break;
    }
}

/**
 * Export socket event constants for backend/frontend coordination
 */
export { NOTIFICATION_EVENTS };
