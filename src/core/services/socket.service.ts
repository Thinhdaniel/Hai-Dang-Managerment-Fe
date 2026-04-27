import { io, type Socket } from 'socket.io-client';

const RAW_API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const API_BASE_URL = RAW_API_URL.replace(/\/api\/?$/, '');

let socket: Socket | null = null;

export const socketService = {
    /**
     * Initialize Socket.io connection
     * Must be called after user is authenticated
     */
    connect: (accessToken: string): Socket => {
        if (socket?.connected) {
            return socket;
        }

        socket = io(API_BASE_URL, {
            auth: {
                token: accessToken,
            },
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
            transports: ['websocket', 'polling'],
        });

        socket.on('connect', () => {
            console.log('[Socket.io] Connected:', socket?.id);
        });

        socket.on('connect_error', (error) => {
            console.error('[Socket.io] Connection error:', error);
        });

        socket.on('disconnect', (reason) => {
            console.log('[Socket.io] Disconnected:', reason);
        });

        socket.on('reconnect_attempt', () => {
            console.log('[Socket.io] Attempting to reconnect...');
        });

        socket.on('reconnect', () => {
            console.log('[Socket.io] Reconnected');
        });

        return socket;
    },

    /**
     * Disconnect Socket.io connection
     */
    disconnect: () => {
        if (socket) {
            socket.disconnect();
            socket = null;
        }
    },

    /**
     * Get current socket instance
     */
    getSocket: (): Socket | null => {
        return socket;
    },

    /**
     * Check if socket is connected
     */
    isConnected: (): boolean => {
        return socket?.connected ?? false;
    },

    /**
     * Listen to a socket event
     */
    on: <T = unknown>(event: string, callback: (data: T) => void): (() => void) => {
        if (!socket) {
            console.warn('[Socket.io] Socket not initialized. Call connect() first.');
            return () => {};
        }

        socket.on(event, callback);

        // Return unsubscribe function
        return () => {
            socket?.off(event, callback);
        };
    },

    /**
     * Emit a socket event
     */
    emit: <T = unknown>(event: string, data?: T): void => {
        if (!socket) {
            console.warn('[Socket.io] Socket not initialized. Call connect() first.');
            return;
        }

        socket.emit(event, data);
    },

    /**
     * Listen to socket event once
     */
    once: <T = unknown>(event: string, callback: (data: T) => void): void => {
        if (!socket) {
            console.warn('[Socket.io] Socket not initialized. Call connect() first.');
            return;
        }

        socket.once(event, callback);
    },

    /**
     * Remove all listeners for an event
     */
    offAll: (event: string): void => {
        if (!socket) {
            return;
        }

        socket.off(event);
    },
};
