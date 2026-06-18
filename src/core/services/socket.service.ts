import { io, type Socket } from 'socket.io-client';
import { getStoredAccessToken } from '../lib/auth-session';

const RAW_API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const API_BASE_URL = RAW_API_URL.replace(/\/api\/?$/, '');

let socket: Socket | null = null;

export const socketService = {
    /**
     * Initialize Socket.io connection
     * Must be called after user is authenticated
     */
    connect: (accessToken: string): Socket => {
        // Tai su dung DUY NHAT mot socket dung chung cho ca app (Notification + Chat...).
        // Da co socket (dang ket noi HOAC dang connecting) -> tra ve luon, KHONG huy tao lai.
        // Truoc day huy+tao lai khi chua connected gay race: provider mount cung luc
        // se vo tinh giet socket cua provider kia -> listener (vd presence) treo tren socket chet.
        // auth la HAM nen moi lan (re)connect socket.io tu lay access token moi nhat, khong can tao lai.
        if (socket) {
            return socket;
        }

        socket = io(API_BASE_URL, {
            // auth la HAM -> socket.io goi lai moi lan (re)connect, luon lay access token MOI NHAT
            // tu localStorage. Tranh reconnect bang token het han -> BE bao "Authentication failed".
            auth: (cb) => cb({ token: getStoredAccessToken() || accessToken }),
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity,
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
