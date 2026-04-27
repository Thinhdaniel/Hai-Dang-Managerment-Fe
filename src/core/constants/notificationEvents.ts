/**
 * Backend Guide: Real-Time Notification System
 * 
 * This guide provides comprehensive instructions for implementing the backend
 * notification system using Node.js/Express + Socket.io + MongoDB
 * 
 * 📦 Installation:
 * npm install socket.io socket.io-cors
 * npm install --save-dev @types/socket.io
 */

export const NOTIFICATION_EVENTS = {
    // Client → Server events
    MARK_READ: 'notify:mark-read',
    CLEAR: 'notify:clear',

    // Server → Client events
    NEW: 'notify:new',
    READ: 'notify:read',
    CLEARED: 'notify:cleared',

    // Machine events
    MACHINE_CREATED: 'machine:created',
    MACHINE_UPDATED: 'machine:updated',
    MACHINE_DELETED: 'machine:deleted',
    MACHINE_STATUS_CHANGED: 'machine:status-changed',

    // User events
    USER_CREATED: 'user:created',
    USER_UPDATED: 'user:updated',
    USER_DELETED: 'user:deleted',

    // Asset events
    ASSET_CREATED: 'asset:created',
    ASSET_UPDATED: 'asset:updated',
    ASSET_DELETED: 'asset:deleted',

    // Transfer events
    TRANSFER_CREATED: 'transfer:created',
    TRANSFER_APPROVED: 'transfer:approved',
    TRANSFER_REJECTED: 'transfer:rejected',

    // Maintenance events
    MAINTENANCE_DUE: 'maintenance:due',
    MAINTENANCE_COMPLETED: 'maintenance:completed',

    // Borrowing events
    BORROWING_CREATED: 'borrowing:created',
    BORROWING_APPROVED: 'borrowing:approved',
    BORROWING_REJECTED: 'borrowing:rejected',
} as const;

export type NotificationEvent = typeof NOTIFICATION_EVENTS[keyof typeof NOTIFICATION_EVENTS];
