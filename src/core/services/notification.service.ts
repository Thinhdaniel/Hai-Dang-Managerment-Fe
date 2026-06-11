import { api } from '../lib/api';
import type { Notification } from '../notificationStore';

// Backend wraps all responses: { data: T, success: boolean, message: string, status: number }
// The axios interceptor unwraps response.data once, so we receive the outer wrapper.
interface ApiResponse<T> {
    data: T;
    success: boolean;
    message: string;
    status: number;
}

interface GetNotificationsData {
    notifications: Notification[];
    total: number;
    unreadCount: number;
}

export const notificationService = {
    /**
     * Fetch notifications for the current user.
     * Returns the unwrapped data payload { notifications, total, unreadCount }.
     */
    getNotifications: async (limit = 50, offset = 0): Promise<GetNotificationsData> => {
        const response = await api.get<GetNotificationsData>('/notifications', {
            params: { limit, offset },
        });
        return response as unknown as GetNotificationsData;
    },

    /**
     * Mark a single notification as read.
     */
    markAsRead: async (notificationId: string): Promise<void> => {
        await api.patch<ApiResponse<unknown>>(`/notifications/${notificationId}/read`);
    },

    /**
     * Mark all notifications as read.
     */
    markAllAsRead: async (): Promise<void> => {
        await api.patch<ApiResponse<{ updatedCount: number }>>('/notifications/read-all');
    },

    /**
     * Delete a single notification.
     */
    deleteNotification: async (notificationId: string): Promise<void> => {
        await api.delete<ApiResponse<unknown>>(`/notifications/${notificationId}`);
    },

    /**
     * Delete all notifications of the current user.
     */
    deleteAllNotifications: async (): Promise<void> => {
        await api.delete<ApiResponse<unknown>>('/notifications');
    },
};
