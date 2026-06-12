import {
    AppstoreOutlined,
    DashboardOutlined,
    DatabaseOutlined,
    MenuOutlined,
    MessageOutlined,
    QrcodeOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/contexts/AuthContext';
import { useChatContext } from '../../core/contexts/ChatContext';
import { can, type Capability } from '../../core/lib/permissions';

type MobileNavItem = {
    path: string;
    label: string;
    icon: ReactNode;
    match: (pathname: string) => boolean;
    badge?: number;
    capability?: Capability;
};

type DockButtonProps = {
    item: MobileNavItem;
    active: boolean;
    onClick: () => void;
};

const isExactOrPrefix = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);
const materialCatalogPaths = ['/materials', '/materials/inventory', '/materials/suppliers', '/materials/reports'];
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
    const { unreadCount: chatUnreadCount } = useChatContext();
    const { user } = useAuth();
    const role = user?.role;

    const allItems: MobileNavItem[] = [
        {
            path: '/dashboard',
            label: 'Tổng quan',
            icon: <DashboardOutlined />,
            match: (current) => current === '/' || current === '/dashboard',
        },
        {
            path: '/chat',
            label: 'Tin nhắn',
            icon: <MessageOutlined />,
            match: (current) => isExactOrPrefix(current, '/chat'),
            badge: chatUnreadCount,
        },
        {
            path: '/assets',
            label: 'Máy',
            icon: <AppstoreOutlined />,
            capability: 'asset.view',
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
            capability: 'material.view',
            match: (current) => materialCatalogPaths.some((path) => isExactOrPrefix(current, path)),
        },
    ];
    const items = allItems.filter((item) => !item.capability || can(role, item.capability));
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
