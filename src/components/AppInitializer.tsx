import type { PropsWithChildren } from 'react';
import { useSocket } from '../core/hooks/useSocket';
import { useNotifications } from '../core/hooks/useNotifications';

/**
 * AppInitializer component handles Socket.io connection and notification setup
 * This should wrap the entire app but be placed after AuthProvider
 */
export const AppInitializer: React.FC<PropsWithChildren> = ({ children }) => {
    // Initialize Socket.io connection
    useSocket();

    // Initialize notifications
    useNotifications();

    return <>{children}</>;
};
