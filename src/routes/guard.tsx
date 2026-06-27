import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { App, Spin } from 'antd';
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
    const isResolvingUser = isAuthenticated && !user;
    const allowed = isAuthenticated && Boolean(user) && check(user);

    useEffect(() => {
        if (isAuthenticated && user && !allowed) {
            message.warning('Bạn không có quyền truy cập chức năng này.');
        }
    }, [isAuthenticated, user, allowed, message]);

    if (!isAuthenticated) {
        return <Navigate to='/login' replace />;
    }

    if (isResolvingUser) {
        return (
            <div className='flex min-h-[42vh] items-center justify-center'>
                <Spin />
            </div>
        );
    }

    if (!allowed) {
        return <Navigate to='/dashboard' replace />;
    }

    return children;
};
