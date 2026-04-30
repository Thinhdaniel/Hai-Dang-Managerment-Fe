import { useEffect, useState } from 'react';
import { socketService } from '../services/socket.service';
import { useAuth } from '../contexts/AuthContext';
import type { Socket } from 'socket.io-client';

/**
 * Hook to manage Socket.io connection lifecycle
 * Automatically connects when user is authenticated and disconnects on logout
 */
export const useSocket = () => {
    const { accessToken, isAuthenticated } = useAuth();
    const [socket, setSocket] = useState<Socket | null>(socketService.getSocket());

    useEffect(() => {
        if (!isAuthenticated || !accessToken) {
            // Disconnect if not authenticated
            if (socketService.isConnected()) {
                socketService.disconnect();
                setSocket(null);
            }
            return;
        }

        // Connect if not already connected
        if (!socketService.isConnected()) {
            const newSocket = socketService.connect(accessToken);
            setSocket(newSocket);
        } else {
            setSocket(socketService.getSocket());
        }

        return () => {
            // Cleanup: disconnect on unmount or when auth changes
            // Note: We don't disconnect here to maintain connection across route changes
            // Only disconnect when user logs out (handled in AuthContext)
        };
    }, [isAuthenticated, accessToken]);

    return {
        isConnected: socketService.isConnected(),
        socket,
    };
};
