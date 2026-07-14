import { useEffect, useCallback } from 'react';
import { useNotificationStore, type Notification } from '../notificationStore';
import { notificationService } from '../services/notification.service';
import { socketService } from '../services/socket.service';
import { notification as antNotification } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import { queryClient } from '../queryClient';
import { syncAppBadge } from '../lib/app-badge';
import { playNotificationSound, primeNotificationSound, setSystemNotificationSound } from '../lib/notificationSound';
import { systemSettingService } from '../services/systemSetting.service';
import type { Asset } from '../types';

// Socket event names
const NOTIFICATION_EVENTS = {
    NEW: 'notify:new',
    READ: 'notify:read',
    READ_ALL: 'notify:read-all',
    DELETED: 'notify:deleted',
    CLEARED: 'notify:cleared',
    MARK_READ: 'notify:mark-read',
    CLEAR: 'notify:clear',
    ASSET_CREATED: 'asset:created',
    ASSET_UPDATED: 'asset:updated',
    ASSET_DELETED: 'asset:deleted',
} as const;

type AssetRealtimePayload = {
    assetId?: string;
    asset?: Asset;
    action?: string;
    changedFields?: string[];
    updatedAt?: string;
};

const invalidateAssetQueries = (payload?: AssetRealtimePayload) => {
    const assetId = payload?.assetId ?? payload?.asset?.id;

    if (payload?.asset?.id && payload.action !== 'deleted') {
        queryClient.setQueryData(['asset', payload.asset.id], payload.asset);
    }

    queryClient.invalidateQueries({ queryKey: ['assets'] });
    queryClient.invalidateQueries({ queryKey: ['asset-stat'] });
    queryClient.invalidateQueries({ queryKey: ['asset-models'] });
    queryClient.invalidateQueries({ queryKey: ['stocktake-assets'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });

    if (assetId) {
        queryClient.invalidateQueries({ queryKey: ['asset', assetId] });
        queryClient.invalidateQueries({ queryKey: ['transfers', 'asset', assetId] });
        queryClient.invalidateQueries({ queryKey: ['maintenances', 'asset', assetId] });
        queryClient.invalidateQueries({ queryKey: ['borrowings', 'asset', assetId] });
    }
};

export const useNotifications = (socket: import('socket.io-client').Socket | null) => {
    const store = useNotificationStore();
    const { isAuthenticated } = useAuth();
    const unreadCount = store.unreadCount();

    // Mở khoá audio sau tương tác đầu tiên để chuông phát được (autoplay policy)
    useEffect(() => {
        primeNotificationSound();
    }, []);

    // Đồng bộ chuông mp3 hệ thống (admin upload) — cache localStorage dùng ngay, fetch làm mới
    useEffect(() => {
        if (!isAuthenticated) return;
        systemSettingService
            .getNotificationSound()
            .then((sound) => setSystemNotificationSound(sound))
            .catch(() => undefined);
    }, [isAuthenticated]);

    // Keep Home Screen app badge in sync with unread notifications.
    useEffect(() => {
        if (!isAuthenticated) {
            void syncAppBadge(0);
            return;
        }

        void syncAppBadge(unreadCount);
    }, [isAuthenticated, unreadCount]);

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
    }, [isAuthenticated]);

    // Setup socket listeners
    useEffect(() => {
        if (!isAuthenticated || !socket) {
            return;
        }

        const unsubscribeNew = socketService.on<Notification>(NOTIFICATION_EVENTS.NEW, (notification) => {
            store.addNotification(notification);

            // Chuông báo khi có thông báo mới đến (nếu người dùng đang bật)
            playNotificationSound();

            // Invalidate React Query cache based on actionType
            if (notification.actionType) {
                const invalidateMap: Record<string, string[][]> = {
                    transfer: [['transfers'], ['transfers-stats']],
                    asset: [['assets']],
                    borrowing: [['borrowings']],
                    maintenance: [['maintenances'], ['assets'], ['dashboard']],
                    purchase_request: [['purchase-requests']],
                    purchase_order: [['purchase-orders']],
                    supply_request: [['supply-requests']],
                    technical_purchase: [['technical-purchase-requests']],
                    distribution: [['distributions']],
                    floor_map: [['floor-map-reality'], ['floor-map-operations'], ['floor-map']],
                    briefing: [['dashboard', 'executive-briefing']],
                };
                const keys = invalidateMap[notification.actionType] ?? [];
                keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
                if (notification.actionId) {
                    queryClient.invalidateQueries({ queryKey: [notification.actionType, notification.actionId] });
                }
            }

            // Show toast notification
            showNotificationToast(notification);
        });

        const unsubscribeRead = socketService.on<{ notificationId: string }>(
            NOTIFICATION_EVENTS.READ,
            ({ notificationId }) => {
                store.markAsRead(notificationId);
            }
        );

        const unsubscribeReadAll = socketService.on(NOTIFICATION_EVENTS.READ_ALL, () => {
            store.markAllAsRead();
        });

        const unsubscribeDeleted = socketService.on<{ notificationId: string }>(
            NOTIFICATION_EVENTS.DELETED,
            ({ notificationId }) => {
                store.removeNotification(notificationId);
            }
        );

        const unsubscribeCleared = socketService.on(NOTIFICATION_EVENTS.CLEARED, () => {
            store.clearNotifications();
        });

        const unsubscribeAssetCreated = socketService.on<AssetRealtimePayload>(
            NOTIFICATION_EVENTS.ASSET_CREATED,
            invalidateAssetQueries
        );

        const unsubscribeAssetUpdated = socketService.on<AssetRealtimePayload>(
            NOTIFICATION_EVENTS.ASSET_UPDATED,
            invalidateAssetQueries
        );

        const unsubscribeAssetDeleted = socketService.on<AssetRealtimePayload>(
            NOTIFICATION_EVENTS.ASSET_DELETED,
            invalidateAssetQueries
        );

        return () => {
            unsubscribeNew();
            unsubscribeRead();
            unsubscribeReadAll();
            unsubscribeDeleted();
            unsubscribeCleared();
            unsubscribeAssetCreated();
            unsubscribeAssetUpdated();
            unsubscribeAssetDeleted();
        };
    }, [isAuthenticated, socket]);

    // Mark notification as read
    const markAsRead = useCallback(async (notificationId: string) => {
        try {
            store.markAsRead(notificationId);
            await notificationService.markAsRead(notificationId);
        } catch (error) {
            console.error('[Notifications] Mark as read error:', error);
        }
    }, []);

    // Mark all notifications as read
    const markAllAsRead = useCallback(async () => {
        try {
            store.markAllAsRead();
            await notificationService.markAllAsRead();
        } catch (error) {
            console.error('[Notifications] Mark all as read error:', error);
        }
    }, []);

    // Delete notification
    const deleteNotification = useCallback(async (notificationId: string) => {
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
    }, []);

    // Delete all notifications
    const deleteAllNotifications = useCallback(async () => {
        try {
            store.clearNotifications();
            await notificationService.deleteAllNotifications();
        } catch (error) {
            console.error('[Notifications] Delete all error:', error);
        }
    }, []);

    return {
        notifications: store.notifications,
        unreadCount,
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
        title: notification.title,
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
