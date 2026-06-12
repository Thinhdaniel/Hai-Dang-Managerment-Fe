export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type NotificationActionType =
    | 'user'
    | 'asset'
    | 'transfer'
    | 'maintenance'
    | 'borrowing'
    | 'purchase_request'
    | 'supply_request'
    | 'purchase_order'
    | 'distribution'
    | 'chat'
    | 'system';

export interface Notification {
    _id: string;
    userId: string | null;
    title: string;
    message: string;
    type: NotificationType;
    actionType: NotificationActionType;
    actionId?: string;
    isRead: boolean;
    createdAt: string;
    readAt?: string;
}
