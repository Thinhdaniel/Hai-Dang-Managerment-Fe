import { useEffect } from 'react';
import { socketService } from '../services/socket.service';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook to manage Socket.io connection lifecycle
 * Automatically connects when user is authenticated and disconnects on logout
 */
export const useSocket = () => {
    const { accessToken, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!isAuthenticated || !accessToken) {
            // Disconnect if not authenticated
            if (socketService.isConnected()) {
                socketService.disconnect();
            }
            return;
        }

        // Connect if not already connected
        if (!socketService.isConnected()) {
            socketService.connect(accessToken);
        }

        return () => {
            // Cleanup: disconnect on unmount or when auth changes
            // Note: We don't disconnect here to maintain connection across route changes
            // Only disconnect when user logs out (handled in AuthContext)
        };
    }, [isAuthenticated, accessToken]);

    return {
        isConnected: socketService.isConnected(),
        socket: socketService.getSocket(),
    };
};
