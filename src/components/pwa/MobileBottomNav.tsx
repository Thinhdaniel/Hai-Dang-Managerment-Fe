import {
    AppstoreOutlined,
    DashboardOutlined,
    DatabaseOutlined,
    FormOutlined,
    MenuOutlined,
    QrcodeOutlined,
} from '@ant-design/icons';
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

type DockButtonProps = {
    item: MobileNavItem;
    active: boolean;
    onClick: () => void;
};

const isExactOrPrefix = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);
const materialCatalogPaths = ['/materials', '/materials/inventory', '/materials/suppliers', '/materials/reports'];
const materialWorkflowPaths = [
    '/materials/supply-requests',
    '/materials/purchase-requests',
    '/materials/purchase-orders',
    '/materials/distributions',
];

const formatBadge = (count?: number) => {
    if (!count) return '';
    return count > 9 ? '9+' : String(count);
};

const BottomDockItem = ({ item, active, onClick }: DockButtonProps) => {
    const badge = formatBadge(item.badge);

    return (
        <button
            type='button'
            aria-current={active ? 'page' : undefined}
            onClick={onClick}
            className={`mobile-bottom-nav__item ${active ? 'mobile-bottom-nav__item--active' : ''}`}
        >
            <span className='mobile-bottom-nav__icon-wrap'>
                <span className='mobile-bottom-nav__icon'>{item.icon}</span>
                {badge ? <span className='mobile-bottom-nav__badge'>{badge}</span> : null}
            </span>
            <span className='mobile-bottom-nav__label'>{item.label}</span>
        </button>
    );
};

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
    const leftItems = items.slice(0, 2);
    const rightItems: MobileNavItem[] = [
        ...items.slice(2),
        {
            path: '#menu',
            label: 'Khác',
            icon: <MenuOutlined />,
            match: () => false,
        },
    ];
    const scanActive = pathname === '/scan';

    return (
        <nav className='mobile-bottom-nav' aria-label='Điều hướng nhanh trên mobile'>
            <div className='mobile-bottom-nav__group mobile-bottom-nav__group--left'>
                {leftItems.map((item) => (
                    <BottomDockItem
                        key={item.path}
                        item={item}
                        active={item.match(pathname)}
                        onClick={() => navigate(item.path)}
                    />
                ))}
            </div>

            <button
                type='button'
                onClick={() => navigate('/scan')}
                aria-current={scanActive ? 'page' : undefined}
                aria-label='Quét QR'
                className={`mobile-bottom-nav__scan ${scanActive ? 'mobile-bottom-nav__scan--active' : ''}`}
            >
                <span className='mobile-bottom-nav__scan-core'>
                    <QrcodeOutlined />
                </span>
            </button>

            <div className='mobile-bottom-nav__group mobile-bottom-nav__group--right'>
                {rightItems.map((item) => (
                    <BottomDockItem
                        key={item.path}
                        item={item}
                        active={item.match(pathname)}
                        onClick={() => {
                            if (item.path === '#menu') {
                                onOpenMenu();
                                return;
                            }
                            navigate(item.path);
                        }}
                    />
                ))}
            </div>
        </nav>
    );
};

export default MobileBottomNav;
