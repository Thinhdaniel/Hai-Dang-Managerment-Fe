import { Badge } from 'antd';
import { AppstoreOutlined, DashboardOutlined, DatabaseOutlined, MenuOutlined, SendOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotificationContext } from '../../core/contexts/NotificationContext';

type MobileNavItem = {
    path: string;
    label: string;
    icon: ReactNode;
    match: (pathname: string) => boolean;
    badge?: number;
};

const isExactOrPrefix = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

const MobileBottomNav = ({ onOpenMenu }: { onOpenMenu: () => void }) => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { unreadCount } = useNotificationContext();

    const items: MobileNavItem[] = [
        {
            path: '/dashboard',
            label: 'Tổng quan',
            icon: <DashboardOutlined />,
            match: (current) => current === '/' || current === '/dashboard',
            badge: unreadCount,
        },
        {
            path: '/assets',
            label: 'Máy',
            icon: <AppstoreOutlined />,
            match: (current) =>
                isExactOrPrefix(current, '/assets') ||
                isExactOrPrefix(current, '/transfers') ||
                isExactOrPrefix(current, '/borrowings') ||
                isExactOrPrefix(current, '/maintenances'),
        },
        {
            path: '/materials/inventory',
            label: 'Tồn kho',
            icon: <DatabaseOutlined />,
            match: (current) =>
                isExactOrPrefix(current, '/materials') && !isExactOrPrefix(current, '/materials/distributions'),
        },
        {
            path: '/materials/distributions',
            label: 'Cấp phát',
            icon: <SendOutlined />,
            match: (current) => isExactOrPrefix(current, '/materials/distributions'),
        },
    ];

    return (
        <nav className='mobile-bottom-nav' aria-label='Điều hướng nhanh trên mobile'>
            {items.map((item) => {
                const active = item.match(pathname);
                const content = (
                    <button
                        key={item.path}
                        type='button'
                        aria-current={active ? 'page' : undefined}
                        onClick={() => navigate(item.path)}
                        className={`mobile-bottom-nav__item ${active ? 'mobile-bottom-nav__item--active' : ''}`}
                    >
                        <span className='mobile-bottom-nav__icon'>{item.icon}</span>
                        <span className='mobile-bottom-nav__label'>{item.label}</span>
                    </button>
                );

                return item.badge ? (
                    <Badge key={item.path} count={item.badge} size='small' offset={[-8, 4]}>
                        {content}
                    </Badge>
                ) : (
                    content
                );
            })}

            <button type='button' onClick={onOpenMenu} className='mobile-bottom-nav__item'>
                <span className='mobile-bottom-nav__icon'>
                    <MenuOutlined />
                </span>
                <span className='mobile-bottom-nav__label'>Menu</span>
            </button>
        </nav>
    );
};

export default MobileBottomNav;
