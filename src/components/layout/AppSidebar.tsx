import { Badge, Button, Drawer, Layout, Tooltip, Typography } from 'antd';
import {
    AppstoreOutlined,
    AuditOutlined,
    BarChartOutlined,
    BellOutlined,
    BuildOutlined,
    CalculatorOutlined,
    CloseOutlined,
    ClusterOutlined,
    DashboardOutlined,
    DatabaseOutlined,
    DeploymentUnitOutlined,
    FileAddOutlined,
    FormOutlined,
    InboxOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    MessageOutlined,
    QrcodeOutlined,
    SendOutlined,
    ShopOutlined,
    ShoppingCartOutlined,
    SwapOutlined,
    TagsOutlined,
    TeamOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/contexts/AuthContext';
import { useChatContext } from '../../core/contexts/ChatContext';
import { useNotificationContext } from '../../core/contexts/NotificationContext';
import { can, type Capability } from '../../core/lib/permissions';
import { isProcurementPlant } from '../../core/constants/navAccess';

const { Sider } = Layout;
const { Text } = Typography;

type NavigationItem = {
    path: string;
    label: string;
    description?: string;
    icon: ReactNode;
    matchMode?: 'exact' | 'prefix';
    capability?: Capability;
    procurementOnly?: boolean;
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
                description: 'Tình hình vận hành',
                icon: <DashboardOutlined />,
            },
            {
                path: '/chat',
                label: 'Tin nhắn nội bộ',
                description: 'Trao đổi theo cấp vận hành',
                icon: <MessageOutlined />,
                matchMode: 'exact',
            },
            {
                path: '/reports/facility-costs',
                label: 'Báo cáo chi phí',
                description: 'Chi phí vận hành theo cơ sở',
                icon: <CalculatorOutlined />,
                matchMode: 'exact',
                capability: 'report.view',
            },
            {
                path: '/materials/reports',
                label: 'Báo cáo vật tư',
                description: 'Mua, cấp phát, tồn kho, NCC',
                icon: <BarChartOutlined />,
                matchMode: 'exact',
                capability: 'report.view',
            },
        ],
    },
    {
        key: 'material-operations',
        label: 'Vận hành vật tư',
        items: [
            {
                path: '/materials/inventory',
                label: 'Tồn kho',
                description: 'Số lượng theo cơ sở',
                icon: <InboxOutlined />,
                matchMode: 'exact',
                capability: 'inventory.view',
            },
            {
                path: '/materials/distributions',
                label: 'Cấp phát',
                description: 'Phiếu xuất và nhận hàng',
                icon: <SendOutlined />,
                matchMode: 'exact',
                capability: 'distribution.view',
            },
            {
                path: '/materials/supply-requests',
                label: 'Đề xuất cấp vật tư',
                description: 'Yêu cầu từ các cơ sở',
                icon: <FormOutlined />,
                matchMode: 'exact',
                capability: 'supplyRequest.manage',
            },
        ],
    },
    {
        key: 'material-purchasing',
        label: 'Mua sắm vật tư',
        items: [
            {
                path: '/materials/purchase-requests',
                label: 'Đề xuất mua',
                description: 'Tổng hợp nhu cầu mua',
                icon: <FileAddOutlined />,
                matchMode: 'exact',
                procurementOnly: true,
            },
            {
                path: '/materials/purchase-orders',
                label: 'Đặt hàng',
                description: 'PO và nhận hàng',
                icon: <ShoppingCartOutlined />,
                matchMode: 'exact',
                procurementOnly: true,
            },
            {
                path: '/materials/suppliers',
                label: 'Nhà cung cấp',
                description: 'Thông tin NCC',
                icon: <ShopOutlined />,
                matchMode: 'exact',
                capability: 'material.view',
            },
            {
                path: '/materials',
                label: 'Danh mục vật tư',
                description: 'Mã, nhóm, đơn vị tính',
                icon: <DatabaseOutlined />,
                matchMode: 'exact',
                capability: 'material.view',
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
                description: 'Danh sách máy',
                icon: <AppstoreOutlined />,
                capability: 'asset.view',
            },
            {
                path: '/assets/stocktake',
                label: 'Kiểm kê QR',
                description: 'Quét đối chiếu hiện trường',
                icon: <AuditOutlined />,
                matchMode: 'exact',
                capability: 'stocktake',
            },
            {
                path: '/qr-labels',
                label: 'Tem QR',
                description: 'Tạo, in và kích hoạt tem',
                icon: <QrcodeOutlined />,
                capability: 'qrlabel.manage',
            },
            {
                path: '/transfers',
                label: 'Chuyển máy',
                description: 'Điều chuyển giữa cơ sở',
                icon: <SwapOutlined />,
                capability: 'transfer.write',
            },
            {
                path: '/borrowings',
                label: 'Mượn / Trả',
                description: 'Theo dõi mượn trả',
                icon: <DeploymentUnitOutlined />,
                capability: 'borrowing.write',
            },
            {
                path: '/maintenances',
                label: 'Bảo trì',
                description: 'Lịch và lịch sử bảo trì',
                icon: <BuildOutlined />,
                capability: 'maintenance.view',
            },
            {
                path: '/brands',
                label: 'Nhãn hiệu',
                description: 'Hãng và model máy',
                icon: <TagsOutlined />,
                capability: 'brand.manage',
            },
        ],
    },
    {
        key: 'administration',
        label: 'Thiết lập',
        items: [
            {
                path: '/plants',
                label: 'Cơ sở',
                description: 'Nhà máy, xưởng, kho',
                icon: <ClusterOutlined />,
                capability: 'plant.view',
            },
            {
                path: '/users',
                label: 'Người dùng',
                description: 'Tài khoản và phân quyền',
                icon: <TeamOutlined />,
                capability: 'user.view',
            },
            {
                path: '/storage',
                label: 'Kho',
                description: 'Khu vực lưu trữ',
                icon: <InboxOutlined />,
                capability: 'storage.view',
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

const isActivePath = (pathname: string, item: NavigationItem) => {
    if (item.path === '/dashboard') {
        return pathname === '/dashboard' || pathname === '/';
    }

    if (item.matchMode === 'exact') {
        return pathname === item.path;
    }

    return pathname === item.path || pathname.startsWith(`${item.path}/`);
};

const SidebarNavButton = ({
    item,
    collapsed,
    active,
    badge,
    onSelect,
}: {
    item: NavigationItem;
    collapsed: boolean;
    active: boolean;
    badge?: number;
    onSelect: () => void;
}) => {
    const icon = (
        <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[17px] transition-all ${
                active
                    ? 'border-blue-200 bg-white text-blue-600 shadow-sm'
                    : 'border-slate-200 bg-white/80 text-slate-500 group-hover:border-slate-300 group-hover:text-slate-700'
            }`}
        >
            {item.icon}
        </span>
    );

    const button = (
        <button
            type='button'
            onClick={onSelect}
            className={`group flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-all ${
                active
                    ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200/80'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            } ${collapsed ? 'justify-center px-2.5' : ''}`}
        >
            {badge ? (
                <Badge count={badge} size='small' offset={[-2, 4]}>
                    {icon}
                </Badge>
            ) : (
                icon
            )}
            {!collapsed ? (
                <>
                    <span className='min-w-0 flex-1'>
                        <span className='block truncate text-[14px] leading-5 font-semibold'>{item.label}</span>
                        {item.description ? (
                            <span className='mt-0.5 block truncate text-[11px] font-medium text-slate-400 group-hover:text-slate-500'>
                                {item.description}
                            </span>
                        ) : null}
                    </span>
                    {active ? <span className='h-8 w-1 rounded-full bg-blue-500 shadow-sm' /> : null}
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
    const { unreadCount: chatUnreadCount } = useChatContext();
    const { user } = useAuth();

    const role = user?.role;
    const isProcurementManager = can(role, 'procurement.operate') && isProcurementPlant(user);

    const visibleSections = navigationSections
        .map((section) => ({
            ...section,
            items: section.items.filter((item) => {
                if (item.procurementOnly) {
                    return isProcurementManager;
                }
                if (item.capability) {
                    return can(role, item.capability);
                }
                return true;
            }),
        }))
        .filter((section) => section.items.length > 0);

    const handleSelect = (path: string) => {
        navigate(path);

        if (!isDesktop) {
            onMobileClose();
        }
    };

    const renderSidebarContent = (isCollapsed: boolean, onToggleCollapse?: () => void, showClose?: boolean) => (
        <div className='flex h-full flex-col rounded-r-[24px] border-r border-slate-200/80 bg-[rgba(255,255,255,0.96)] shadow-[10px_0_32px_rgba(15,23,42,0.06)] backdrop-blur-xl'>
            <div className={`border-b border-slate-100 px-4 py-4 ${isCollapsed ? 'px-3' : ''}`}>
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                    <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-sm font-bold tracking-[0.24em] text-white shadow-[0_12px_24px_rgba(37,99,235,0.24)]'>
                        HD
                    </div>
                    {!isCollapsed ? (
                        <div className='min-w-0 flex-1'>
                            <Text className='mb-0 block text-[15px] font-bold text-slate-900'>Hai Dang Ops</Text>
                            <Text className='block text-xs text-slate-500'>Quản lý vận hành</Text>
                        </div>
                    ) : null}
                    {showClose ? (
                        <Button
                            type='text'
                            icon={<CloseOutlined />}
                            onClick={onMobileClose}
                            className='flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm'
                        />
                    ) : null}
                </div>
            </div>

            <div className='flex-1 overflow-y-auto px-3 py-3'>
                <div className='space-y-4'>
                    {visibleSections.map((section) => (
                        <section key={section.key} className='space-y-2'>
                            {!isCollapsed ? (
                                <div className='px-2'>
                                    <Text className='text-[11px] font-bold tracking-[0.16em] text-slate-400 uppercase'>
                                        {section.label}
                                    </Text>
                                </div>
                            ) : (
                                <div className='mx-auto h-px w-8 bg-slate-200/80' />
                            )}

                            <div className='space-y-1'>
                                {section.items.map((item) => (
                                    <SidebarNavButton
                                        key={item.path}
                                        item={item}
                                        collapsed={isCollapsed}
                                        active={isActivePath(location.pathname, item)}
                                        badge={item.path === '/chat' ? chatUnreadCount : undefined}
                                        onSelect={() => handleSelect(item.path)}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>

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
                size='min(340px, calc(100vw - 20px))'
                styles={{
                    body: { padding: 0 },
                    root: {
                        background: 'transparent',
                        boxShadow: 'none',
                        paddingTop: `calc(${headerOffset}px + env(safe-area-inset-top))`,
                    },
                    mask: {
                        backdropFilter: 'blur(4px)',
                        background: 'rgba(15, 23, 42, 0.2)',
                    },
                }}
            >
                {renderSidebarContent(false, undefined, true)}
            </Drawer>
        );
    }

    return (
        <Sider
            trigger={null}
            collapsed={collapsed}
            collapsedWidth={collapsedWidth}
            width={width}
            className='!fixed !bottom-0 !left-0 !bg-transparent'
            style={{ top: headerOffset, height: `calc(100vh - ${headerOffset}px)` }}
        >
            {renderSidebarContent(collapsed)}
        </Sider>
    );
};

export default AppSidebar;
