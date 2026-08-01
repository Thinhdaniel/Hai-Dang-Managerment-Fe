export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type NotificationActionType =
    | 'user'
    | 'asset'
    | 'transfer'
    | 'maintenance'
    | 'borrowing'
    | 'purchase_request'
    | 'supply_request'
    | 'technical_purchase'
    | 'purchase_order'
    | 'distribution'
    | 'chat'
    | 'floor_map'
    | 'digest'
    | 'briefing'
    | 'production'
    | 'system';

export interface Notification {
    _id: string;
    userId: string | null;
    title: string;
    message: string;
    type: NotificationType;
    actionType: NotificationActionType;
    actionId?: string;
    actionData?: {
        plantId?: string;
        productionDate?: string;
        slotKey?: string;
        focus?: string;
        [key: string]: unknown;
    };
    dedupeKey?: string;
    deliveryTag?: string;
    isRead: boolean;
    createdAt: string;
    readAt?: string;
}
