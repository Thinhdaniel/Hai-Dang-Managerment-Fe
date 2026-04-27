import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../core/contexts/AuthContext';

type Props = { children: ReactNode };

const ProtectedRoute = ({ children }: Props) => {
    const { isAuthenticated } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to='/login' replace />;
    }

    return children;
};

export default ProtectedRoute;
