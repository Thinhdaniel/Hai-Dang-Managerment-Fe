import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { App } from 'antd';
import { useAuth } from '../core/contexts/AuthContext';
import type { AccessCheck } from '../core/constants/navAccess';

type Props = { children: ReactNode };

const ProtectedRoute = ({ children }: Props) => {
    const { isAuthenticated } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to='/login' replace />;
    }

    return children;
};

export default ProtectedRoute;

type RequireAccessProps = {
    check: AccessCheck;
    children: ReactNode;
};

/** Chặn truy cập trang theo quyền. Thiếu quyền → đẩy về Dashboard kèm thông báo. */
export const RequireAccess = ({ check, children }: RequireAccessProps) => {
    const { isAuthenticated, user } = useAuth();
    const { message } = App.useApp();
    const allowed = isAuthenticated && check(user);

    useEffect(() => {
        if (isAuthenticated && !allowed) {
            message.warning('Bạn không có quyền truy cập chức năng này.');
        }
    }, [isAuthenticated, allowed, message]);

        if (!isAuthenticated) {
            return <Navigate to='/login' replace />;
        }

        if (!allowed) {
            return <Navigate to='/dashboard' replace />;
        }

    return children;
};
