import { Badge } from 'antd';
import { AppstoreOutlined, DashboardOutlined, DatabaseOutlined, FormOutlined, MenuOutlined } from '@ant-design/icons';
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
const materialCatalogPaths = ['/materials', '/materials/inventory', '/materials/suppliers', '/materials/reports'];
const materialWorkflowPaths = [
    '/materials/supply-requests',
    '/materials/purchase-requests',
    '/materials/purchase-orders',
    '/materials/distributions',
];

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
                isExactOrPrefix(current, '/qr-labels') ||
                isExactOrPrefix(current, '/qr/') ||
                isExactOrPrefix(current, '/transfers') ||
                isExactOrPrefix(current, '/borrowings') ||
                isExactOrPrefix(current, '/maintenances'),
        },
        {
            path: '/materials',
            label: 'Vật tư',
            icon: <DatabaseOutlined />,
            match: (current) => materialCatalogPaths.some((path) => isExactOrPrefix(current, path)),
        },
        {
            path: '/materials/supply-requests',
            label: 'Phiếu',
            icon: <FormOutlined />,
            match: (current) => materialWorkflowPaths.some((path) => isExactOrPrefix(current, path)),
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
