import api from '../lib/api';

export type SystemNotificationSound = {
    url: string;
    name: string;
    updatedAt?: string;
};

export const systemSettingService = {
    getNotificationSound: (): Promise<SystemNotificationSound | null> =>
        api.get<SystemNotificationSound | null>('/system-settings/notification-sound'),

    uploadNotificationSound: (file: File): Promise<SystemNotificationSound | null> => {
        const formData = new FormData();
        formData.append('sound', file);
        return api.put<SystemNotificationSound | null, FormData>('/system-settings/notification-sound', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000,
        });
    },

    deleteNotificationSound: (): Promise<null> => api.delete<null>('/system-settings/notification-sound'),
};
