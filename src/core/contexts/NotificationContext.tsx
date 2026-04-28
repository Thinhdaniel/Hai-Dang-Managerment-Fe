import { createContext, useContext, type ReactNode } from 'react';
import { useNotifications as useNotificationsHook } from '../hooks/useNotifications';
import { useSocket } from '../hooks/useSocket';

interface NotificationContextValue {
    notifications: any[];
    unreadCount: number;
    loading: boolean;
    error: string | null;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    deleteAllNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
    useSocket();
    const notificationData = useNotificationsHook();

    return (
        <NotificationContext.Provider value={notificationData}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotificationContext = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotificationContext must be used within NotificationProvider');
    }
    return context;
};