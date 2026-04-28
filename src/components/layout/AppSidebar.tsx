import { Button, Drawer, Layout, Tooltip, Typography, Badge } from 'antd';
import {
    AppstoreOutlined,
    BuildOutlined,
    ClusterOutlined,
    DashboardOutlined,
    DeploymentUnitOutlined,
    InboxOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    SwapOutlined,
    TagsOutlined,
    TeamOutlined,
    BellOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../core/contexts/AuthContext';
import { hasManagerAccess } from '../../core/lib/permissions';
import { useNotificationContext } from '../../core/contexts/NotificationContext';

const { Sider } = Layout;
const { Text } = Typography;

type NavigationItem = {
    path: string;
    label: string;
    icon: ReactNode;
};

type NavigationSection = {
    key: string;
    label: string;
    items: NavigationItem[];
};

const navigationSections: NavigationSection[] = [
    {
        key: 'overview',
        label: 'Tổng quan',
        items: [
            {
                path: '/dashboard',
                label: 'Bảng điều khiển',
                icon: <DashboardOutlined />,
            },
        ],
    },
    {
        key: 'machine-management',
        label: 'Quản lý máy',
        items: [
            {
                path: '/assets',
                label: 'Máy',
                icon: <AppstoreOutlined />,
            },
            {
                path: '/transfers',
                label: 'Chuyển máy',
                icon: <SwapOutlined />,
            },
            {
                path: '/borrowings',
                label: 'Mượn / Trả',
                icon: <DeploymentUnitOutlined />,
            },
            {
                path: '/brands',
                label: 'Nhãn hiệu',
                icon: <TagsOutlined />,
            },
            {
                path: '/maintenances',
                label: 'Bảo trì',
                icon: <BuildOutlined />,
            },
        ],
    },
    {
        key: 'other',
        label: 'Khác',
        items: [
            {
                path: '/storage',
                label: 'Kho',
                icon: <InboxOutlined />,
            },
            {
                path: '/plants',
                label: 'Cơ sở',
                icon: <ClusterOutlined />,
            },
            {
                path: '/users',
                label: 'Người dùng',
                icon: <TeamOutlined />,
            },
        ],
    },
];

interface AppSidebarProps {
    collapsed: boolean;
    isDesktop: boolean;
    mobileOpen: boolean;
    width: number;
    collapsedWidth: number;
    headerOffset: number;
    onCollapse: (collapsed: boolean) => void;
    onMobileClose: () => void;
}

const isActivePath = (pathname: string, path: string) => {
    if (path === '/dashboard') {
        return pathname === '/dashboard' || pathname === '/';
    }

    return pathname.startsWith(path);
};

const SidebarNavButton = ({
    item,
    collapsed,
    active,
    onSelect,
}: {
    item: NavigationItem;
    collapsed: boolean;
    active: boolean;
    onSelect: () => void;
}) => {
    const button = (
        <button
            type='button'
            onClick={onSelect}
            className={`group flex w-full items-center gap-3 rounded-[22px] px-3 py-3 text-left transition-all ${
                active
                    ? 'bg-gradient-to-r from-blue-50 via-white to-sky-50 text-blue-700 shadow-[0_14px_26px_rgba(37,99,235,0.12)] ring-1 ring-blue-200/80'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            } ${collapsed ? 'justify-center px-2.5' : ''}`}
        >
            <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-[18px] transition-all ${
                    active
                        ? 'border-blue-200 bg-white text-blue-600 shadow-sm'
                        : 'border-slate-200 bg-white/80 text-slate-500 group-hover:border-slate-300 group-hover:text-slate-700'
                }`}
            >
                {item.icon}
            </span>
            {!collapsed ? (
                <>
                    <span className='min-w-0 flex-1 truncate text-[14px] font-semibold'>{item.label}</span>
                    {active ? <span className='h-2.5 w-2.5 rounded-full bg-blue-500 shadow-sm' /> : null}
                </>
            ) : null}
        </button>
    );

    if (!collapsed) {
        return button;
    }

    return (
        <Tooltip placement='right' title={item.label}>
            {button}
        </Tooltip>
    );
};

const AppSidebar: React.FC<AppSidebarProps> = ({
    collapsed,
    isDesktop,
    mobileOpen,
    width,
    collapsedWidth,
    headerOffset,
    onCollapse,
    onMobileClose,
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { unreadCount } = useNotificationContext();

    const handleSelect = (path: string) => {
        navigate(path);

        if (!isDesktop) {
            onMobileClose();
        }
    };

    // Custom SidebarContent with notification button
    const SidebarWithNotification = ({ isCollapsed, onToggleCollapse }: { isCollapsed: boolean; onToggleCollapse?: () => void }) => (
        <div className='flex h-full flex-col rounded-r-[28px] border-r border-slate-200/80 bg-[rgba(255,255,255,0.94)] shadow-[14px_0_40px_rgba(15,23,42,0.06)] backdrop-blur-xl'>
            <div className={`border-b border-slate-100 px-4 py-5 ${isCollapsed ? 'px-3' : ''}`}>
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                    <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-blue-600 to-sky-400 text-sm font-bold tracking-[0.28em] text-white shadow-[0_16px_30px_rgba(37,99,235,0.26)]'>
                        HD
                    </div>
                    {!isCollapsed ? (
                        <div className='min-w-0'>
                            <Text className='mb-0 block text-[15px] font-bold text-slate-900'>Hai Dang Ops</Text>
                            <Text className='block text-xs text-slate-500'>Quản lý vận hành</Text>
                        </div>
                    ) : null}
                </div>
            </div>

            <div className='flex-1 overflow-y-auto px-3 py-4'>
                <div className='space-y-5'>
                    {navigationSections.map((section) => (
                        <section key={section.key} className='space-y-2'>
                            {!isCollapsed ? (
                                <div className='px-2'>
                                    <Text className='text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400'>
                                        {section.label}
                                    </Text>
                                </div>
                            ) : (
                                <div className='mx-auto h-px w-8 bg-slate-200/80' />
                            )}

                            <div className='space-y-1.5'>
                                {section.items.map((item) => (
                                    <SidebarNavButton
                                        key={item.path}
                                        item={item}
                                        collapsed={isCollapsed}
                                        active={isActivePath(location.pathname, item.path)}
                                        onSelect={() => handleSelect(item.path)}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>

            {/* Notification button */}
            <div className={`border-t border-slate-100 p-3 ${isCollapsed ? 'flex justify-center' : ''}`}>
                <Badge count={unreadCount} size='small' offset={isCollapsed ? [-2, 2] : undefined}>
                    <Button
                        type='text'
                        icon={<BellOutlined />}
                        onClick={() => navigate('/dashboard')}
                        className={`h-11 rounded-2xl border border-slate-200 bg-white/88 font-semibold text-slate-700 shadow-sm hover:!border-blue-200 hover:!bg-blue-50 hover:!text-blue-700 ${
                            isCollapsed ? 'w-11' : 'w-full justify-start px-4'
                        }`}
                    >
                        {isCollapsed ? null : 'Thông báo'}
                    </Button>
                </Badge>
            </div>

            {onToggleCollapse ? (
                <div className={`border-t border-slate-100 p-3 ${isCollapsed ? 'flex justify-center' : ''}`}>
                    <Button
                        type='text'
                        icon={isCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        onClick={onToggleCollapse}
                        className={`h-11 rounded-2xl border border-slate-200 bg-white/88 font-semibold text-slate-700 shadow-sm hover:!border-blue-200 hover:!bg-blue-50 hover:!text-blue-700 ${
                            isCollapsed ? 'w-11' : 'w-full justify-start px-4'
                        }`}
                    >
                        {isCollapsed ? null : 'Thu gọn thanh bên'}
                    </Button>
                </div>
            ) : null}
        </div>
    );

    if (!isDesktop) {
        return (
            <Drawer
                placement='left'
                open={mobileOpen}
                onClose={onMobileClose}
                closable={false}
                width={304}
                styles={{
                    body: { padding: 0 },
                    content: {
                        background: 'transparent',
                        boxShadow: 'none',
                        paddingTop: `${headerOffset}px`,
                    },
                    mask: {
                        backdropFilter: 'blur(4px)',
                        background: 'rgba(15, 23, 42, 0.2)',
                    },
                }}
            >
                <SidebarWithNotification isCollapsed={false} onToggleCollapse={undefined} />
            </Drawer>
        );
    }

    return (
        <Sider
            trigger={null}
            collapsed={collapsed}
            collapsedWidth={collapsedWidth}
            width={width}
            className='!fixed !left-0 !bottom-0 !bg-transparent'
            style={{ top: headerOffset, height: `calc(100vh - ${headerOffset}px)` }}
        >
            <SidebarWithNotification isCollapsed={collapsed} />
        </Sider>
    );
};

export default AppSidebar;
