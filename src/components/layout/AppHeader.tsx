import { useEffect, useMemo, useState } from 'react';
import {
    Avatar,
    Badge,
    Button,
    Drawer,
    Dropdown,
    Grid,
    Input,
    Layout,
    Modal,
    Popover,
    Typography,
    type MenuProps,
} from 'antd';
import {
    BellOutlined,
    ClockCircleOutlined,
    CloseOutlined,
    DeleteOutlined,
    DownOutlined,
    LogoutOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    SearchOutlined,
    SettingOutlined,
    LineChartOutlined,
    ToolOutlined,
    UserOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import usePageMeta from '../navigation/usePageMeta';
import { normalizeSearchTerm } from '../../core/lib/search';
import { useAuth } from '../../core/contexts/AuthContext';
import { can, hasManagerAccess } from '../../core/lib/permissions';
import { useNotificationContext } from '../../core/contexts/NotificationContext';
import PushNotificationToggle from '../notifications/PushNotificationToggle';
import NotificationSoundToggle from '../notifications/NotificationSoundToggle';
import NotificationHelpGuide from '../notifications/NotificationHelpGuide';
import InstallPrompt from '../pwa/InstallPrompt';
import { pushNotificationService } from '../../core/services/push-notification.service';

const { Header } = Layout;
const { Text, Title } = Typography;
const { useBreakpoint } = Grid;
// Logo công ty bundle nội bộ (đồng bộ với favicon + icon PWA), không phụ thuộc URL ngoài
const COMPANY_LOGO_URL = '/brand/company-logo.png';

interface AppHeaderProps {
    collapsed: boolean;
    isDesktop: boolean;
    mobileOpen: boolean;
    headerHeight: number;
    onToggle: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({ collapsed, isDesktop, mobileOpen, headerHeight, onToggle }) => {
    const navigate = useNavigate();
    const { role, logout, user } = useAuth();
    const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, deleteAllNotifications } =
        useNotificationContext();
    const { pathname } = useLocation();
    const [searchParams] = useSearchParams();
    const [searchValue, setSearchValue] = useState('');
    const [notificationOpen, setNotificationOpen] = useState(false);
    const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
    const [logoutOpen, setLogoutOpen] = useState(false);
    const [logoutAction, setLogoutAction] = useState<'keep-push' | 'disable-push' | null>(null);
    const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');
    const visibleNotifications =
        notifFilter === 'unread' ? notifications.filter((item) => !item.isRead) : notifications;
    const screens = useBreakpoint();
    const pageMeta = usePageMeta();
    const supportsSearch = pathname.startsWith('/assets');
    const canViewUsers = hasManagerAccess(role);
    const canOpenProduction = can(role, 'production.view');
    const useNotificationDrawer = !isDesktop;

    const quickAction = useMemo(() => {
        if (pathname.startsWith('/borrowings') && pathname !== '/borrowings/new') {
            return {
                label: 'Tạo giao dịch',
                onClick: () => navigate('/borrowings/new'),
            };
        }

        if (pathname.startsWith('/transfers')) {
            return {
                label: 'Danh sách máy',
                onClick: () => navigate('/assets'),
            };
        }

        return null;
    }, [navigate, pathname]);

    useEffect(() => {
        if (!supportsSearch) {
            setSearchValue('');
            return;
        }

        setSearchValue(normalizeSearchTerm(searchParams.get('search')));
    }, [searchParams, supportsSearch]);

    const handleSearch = (value: string) => {
        if (!supportsSearch) {
            return;
        }

        const query = normalizeSearchTerm(value);

        if (!query) {
            navigate('/assets');
            return;
        }

        navigate(`/assets?search=${encodeURIComponent(query)}`);
    };

    const handleLogout = () => {
        setLogoutOpen(true);
    };

    const completeLogout = async (disablePush: boolean) => {
        setLogoutAction(disablePush ? 'disable-push' : 'keep-push');

        try {
            if (disablePush) {
                await pushNotificationService.unsubscribeCurrentDevice();
            }
        } catch {
            // Logout must not be blocked by browser push permission or network failures.
        } finally {
            void logout();
            setLogoutOpen(false);
            setLogoutAction(null);
            navigate('/login', { replace: true });
        }
    };

    const handleProfile = () => {
        if (canViewUsers) {
            navigate('/users');
        }
    };

    const userSummaryItem: NonNullable<MenuProps['items']>[number] = {
        key: 'user-summary',
        disabled: true,
        label: (
            <div className='py-1'>
                <div className='text-[10px] font-medium tracking-[0.16em] text-slate-400 uppercase'>Signed in as</div>
                <div className='mt-1 text-[13px] font-semibold text-slate-900'>{user?.name ?? 'Admin'}</div>
                <div className='mt-0.5 text-[11px] text-slate-500'>{user?.email ?? ''}</div>
            </div>
        ),
    };

    const notificationSettingsItem: NonNullable<MenuProps['items']>[number] = {
        key: 'notification-settings',
        icon: <SettingOutlined />,
        label: 'Cài đặt thông báo',
    };

    const productionAppItem: NonNullable<MenuProps['items']>[number] = {
        key: 'production-app',
        icon: <LineChartOutlined />,
        label: 'Mở Quản lý sản xuất',
    };

    const logoutItem: NonNullable<MenuProps['items']>[number] = {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: 'Logout',
        danger: true,
    };

    const userMenuItems: MenuProps['items'] = canViewUsers
        ? [
              userSummaryItem,
              { type: 'divider' },
              {
                  key: 'profile',
                  icon: <UserOutlined />,
                  label: 'Profile',
              },
              notificationSettingsItem,
              ...(canOpenProduction ? [productionAppItem] : []),
              { type: 'divider' },
              logoutItem,
          ]
        : [
              userSummaryItem,
              { type: 'divider' },
              notificationSettingsItem,
              ...(canOpenProduction ? [productionAppItem] : []),
              { type: 'divider' },
              logoutItem,
          ];

    const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
        if (key === 'profile') {
            handleProfile();
            return;
        }

        if (key === 'notification-settings') {
            setNotificationSettingsOpen(true);
            return;
        }

        if (key === 'production-app') {
            navigate('/production');
            return;
        }

        if (key === 'logout') {
            handleLogout();
        }
    };

    const renderNotificationContent = (variant: 'popover' | 'drawer') => (
        <div className={`notification-panel notification-panel--${variant}`}>
            <div className='notification-panel__header'>
                <div>
                    <div className='text-sm font-semibold text-slate-900'>Thông báo</div>
                    <div className='text-[11px] text-slate-500'>Cảnh báo vận hành và phiếu cần xử lý</div>
                </div>
                <div className='flex items-center gap-2'>
                    {unreadCount > 0 ? (
                        <Button
                            type='text'
                            size='small'
                            className='!px-2 !text-[12px] !text-blue-600 hover:!bg-blue-50'
                            onClick={async () => {
                                await markAllAsRead();
                            }}
                        >
                            Đánh dấu đã đọc
                        </Button>
                    ) : null}
                    {notifications.length > 0 ? (
                        <Button
                            type='text'
                            size='small'
                            danger
                            className='!px-2 !text-[12px]'
                            onClick={async () => {
                                await deleteAllNotifications();
                            }}
                        >
                            Xoá tất cả
                        </Button>
                    ) : null}
                    <span className='rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700'>
                        {unreadCount} mới
                    </span>
                    {variant === 'drawer' ? (
                        <Button
                            type='text'
                            size='small'
                            icon={<CloseOutlined />}
                            onClick={() => setNotificationOpen(false)}
                            className='flex h-8 w-8 items-center justify-center rounded-full'
                        />
                    ) : null}
                </div>
            </div>

            <div className='flex items-center gap-1 px-3 py-2'>
                {(['all', 'unread'] as const).map((key) => (
                    <button
                        key={key}
                        type='button'
                        onClick={() => setNotifFilter(key)}
                        className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                            notifFilter === key
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        {key === 'all' ? 'Tất cả' : `Chưa đọc (${unreadCount})`}
                    </button>
                ))}
            </div>

            <div className='notification-panel__list'>
                {visibleNotifications.length === 0 ? (
                    <div className='py-8 text-center text-sm text-slate-500'>
                        {notifFilter === 'unread' ? 'Không có thông báo chưa đọc' : 'Không có thông báo nào'}
                    </div>
                ) : null}
                {visibleNotifications.map((item) => {
                    const itemIcon =
                        item.type === 'error' ? (
                            <WarningOutlined className='text-rose-500' />
                        ) : item.type === 'warning' ? (
                            <ToolOutlined className='text-amber-500' />
                        ) : (
                            <ClockCircleOutlined className='text-blue-500' />
                        );

                    let href = '/dashboard';
                    if (item.actionType === 'asset') href = `/assets${item.actionId ? `/${item.actionId}` : ''}`;
                    else if (item.actionType === 'transfer') href = '/transfers';
                    else if (item.actionType === 'maintenance') href = '/maintenances';
                    else if (item.actionType === 'borrowing') href = '/borrowings';
                    else if (item.actionType === 'purchase_request') href = '/materials/purchase-requests';
                    else if (item.actionType === 'supply_request') href = '/materials/supply-requests';
                    else if (item.actionType === 'technical_purchase') href = '/materials/technical-purchase-requests';
                    else if (item.actionType === 'purchase_order') href = '/materials/purchase-orders';
                    else if (item.actionType === 'distribution') href = '/materials/distributions';
                    else if (item.actionType === 'chat') {
                        href = `/chat${item.actionId ? `?conversation=${encodeURIComponent(item.actionId)}` : ''}`;
                    } else if (item.actionType === 'floor_map') {
                        href = `/assets/floor-map?reality=1${item.actionId ? `&plantId=${encodeURIComponent(item.actionId)}` : ''}`;
                    } else if (item.actionType === 'briefing') {
                        href = `/dashboard${item.actionId ? `?briefing=${encodeURIComponent(item.actionId)}` : ''}`;
                    }

                    return (
                        <div key={item._id} className='group relative'>
                            <button
                                type='button'
                                onClick={async () => {
                                    setNotificationOpen(false);
                                    if (!item.isRead) {
                                        await markAsRead(item._id);
                                    }
                                    navigate(href);
                                }}
                                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 pr-9 text-left transition-colors hover:bg-slate-50 ${item.isRead ? 'opacity-70' : ''}`}
                            >
                                <div className='mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100'>
                                    {itemIcon}
                                </div>
                                <div className='min-w-0 flex-1'>
                                    <div className='flex items-start justify-between gap-2'>
                                        <span
                                            className={`text-[13px] text-slate-900 ${item.isRead ? 'font-medium' : 'font-semibold'}`}
                                        >
                                            {item.title}
                                        </span>
                                        <span className='text-[10px] text-slate-400'>
                                            {new Date(item.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <p className='mt-1 mb-0 text-[11px] leading-5 text-slate-500'>{item.message}</p>
                                </div>
                            </button>
                            <button
                                type='button'
                                aria-label='Xoá thông báo'
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    await deleteNotification(item._id);
                                }}
                                className='absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-md text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-500'
                            >
                                <DeleteOutlined />
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className='notification-panel__footer'>
                <Button
                    type='link'
                    className='!px-0 !text-[13px] !font-semibold'
                    onClick={() => navigate('/dashboard')}
                >
                    Xem tổng quan vận hành
                </Button>
            </div>
        </div>
    );

    return (
        <Header
            className='app-main-header fixed inset-x-0 top-0 z-[220] flex items-center border-b border-slate-200/80 px-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)] backdrop-blur-xl md:px-5'
            style={{
                height: `calc(${headerHeight}px + env(safe-area-inset-top))`,
                background: 'rgba(248, 250, 252, 0.88)',
                backdropFilter: 'blur(18px)',
            }}
        >
            <div className='app-header-grid grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(240px,280px)_auto] xl:gap-4'>
                <div className='app-header-left flex min-w-0 items-center gap-3'>
                    <Button
                        type='text'
                        icon={
                            isDesktop ? (
                                collapsed ? (
                                    <MenuUnfoldOutlined />
                                ) : (
                                    <MenuFoldOutlined />
                                )
                            ) : mobileOpen ? (
                                <MenuFoldOutlined />
                            ) : (
                                <MenuUnfoldOutlined />
                            )
                        }
                        onClick={onToggle}
                        className='app-icon-button flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/92 text-slate-700 shadow-sm hover:!border-blue-200 hover:!bg-blue-50 hover:!text-blue-700'
                    />

                    <div className='app-header-logo flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.06)]'>
                        {COMPANY_LOGO_URL ? (
                            <img src={COMPANY_LOGO_URL} alt='Company logo' className='h-full w-full object-contain' />
                        ) : (
                            <span className='text-[9px] font-semibold tracking-[0.14em] text-slate-400 uppercase'>
                                Logo
                            </span>
                        )}
                    </div>

                    <div className='min-w-0'>
                        <Title
                            level={4}
                            className='app-header-title !mb-0 truncate !text-[18px] !leading-5 !font-semibold !text-slate-950'
                        >
                            {pageMeta.title}
                        </Title>
                    </div>
                </div>

                {supportsSearch ? (
                    <div className='hidden min-w-0 xl:flex xl:items-center xl:justify-center'>
                        <Input
                            placeholder={pageMeta.searchPlaceholder || 'Tìm kiếm...'}
                            allowClear
                            value={searchValue}
                            onChange={(event) => setSearchValue(event.target.value)}
                            onPressEnter={(e) => handleSearch(e.currentTarget.value)}
                            prefix={<SearchOutlined className='mr-1.5 text-slate-400' />}
                            style={{ height: 38, borderRadius: 12 }}
                            className='w-full border-slate-200 bg-white/90 px-3 shadow-sm transition-all focus-within:border-blue-500 focus-within:bg-white focus-within:shadow-[0_2px_8px_rgba(37,99,235,0.1)] hover:border-blue-300'
                        />
                    </div>
                ) : (
                    <div className='hidden xl:block' />
                )}

                <div className='flex min-w-0 items-center justify-end gap-2'>
                    {supportsSearch && !screens.xl ? (
                        <Button
                            type='text'
                            icon={<SearchOutlined />}
                            onClick={() => navigate('/assets')}
                            className='app-icon-button flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/92 text-slate-700 shadow-sm hover:!border-blue-200 hover:!bg-blue-50 hover:!text-blue-700'
                        />
                    ) : null}

                    {quickAction && screens.xl ? (
                        <Button
                            onClick={quickAction.onClick}
                            className='hidden h-9 rounded-xl border-slate-200 bg-white/92 px-3.5 text-[13px] font-semibold text-slate-700 shadow-sm hover:!border-blue-200 hover:!bg-blue-50 hover:!text-blue-700 2xl:inline-flex'
                        >
                            {quickAction.label}
                        </Button>
                    ) : null}

                    <InstallPrompt />

                    {useNotificationDrawer ? (
                        <Badge count={unreadCount} size='small' offset={[-2, 2]}>
                            <Button
                                type='text'
                                icon={<BellOutlined />}
                                onClick={() => setNotificationOpen(true)}
                                className='app-icon-button flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/92 text-slate-700 shadow-sm hover:!border-blue-200 hover:!bg-blue-50 hover:!text-blue-700'
                            />
                        </Badge>
                    ) : (
                        <Popover
                            content={renderNotificationContent('popover')}
                            trigger='click'
                            placement='bottomRight'
                            open={notificationOpen}
                            onOpenChange={setNotificationOpen}
                            arrow={false}
                            classNames={{ root: 'header-notification-popover' }}
                            styles={{ root: { padding: 0, background: 'transparent', boxShadow: 'none' } }}
                        >
                            <Badge count={unreadCount} size='small' offset={[-2, 2]}>
                                <Button
                                    type='text'
                                    icon={<BellOutlined />}
                                    className='app-icon-button flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/92 text-slate-700 shadow-sm hover:!border-blue-200 hover:!bg-blue-50 hover:!text-blue-700'
                                />
                            </Badge>
                        </Popover>
                    )}

                    <Dropdown
                        menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
                        placement='bottomRight'
                        trigger={['click']}
                    >
                        <button
                            type='button'
                            className='app-user-button flex items-center gap-2 rounded-xl border border-slate-200 bg-white/92 px-2 py-1 text-left shadow-sm transition-colors hover:bg-slate-50'
                        >
                            <Avatar
                                size={32}
                                icon={<UserOutlined />}
                                className='shrink-0 bg-gradient-to-br from-blue-600 to-sky-400 text-white'
                            />
                            {screens.sm ? (
                                <div className='hidden min-w-0 sm:block'>
                                    <Text className='block truncate text-[13px] leading-5 font-semibold text-slate-900'>
                                        {user?.name ?? 'Admin'}
                                    </Text>
                                </div>
                            ) : null}
                            {screens.md ? <DownOutlined className='text-xs text-slate-400' /> : null}
                        </button>
                    </Dropdown>
                </div>
            </div>

            <Drawer
                placement='bottom'
                open={useNotificationDrawer && notificationOpen}
                onClose={() => setNotificationOpen(false)}
                closable={false}
                size='min(82vh, 680px)'
                className='mobile-notification-drawer'
                styles={{
                    body: { padding: 0 },
                    section: { borderRadius: '24px 24px 0 0', overflow: 'hidden' },
                    mask: { backdropFilter: 'blur(4px)', background: 'rgba(15, 23, 42, 0.22)' },
                }}
            >
                {renderNotificationContent('drawer')}
            </Drawer>

            <Drawer
                placement={useNotificationDrawer ? 'bottom' : 'right'}
                open={notificationSettingsOpen}
                onClose={() => setNotificationSettingsOpen(false)}
                closable={false}
                size={useNotificationDrawer ? 'min(72vh, 560px)' : 420}
                className='notification-settings-drawer'
                styles={{
                    body: { padding: 0, background: '#f8fafc' },
                    section: {
                        borderRadius: useNotificationDrawer ? '24px 24px 0 0' : '24px 0 0 24px',
                        overflow: 'hidden',
                    },
                    mask: { backdropFilter: 'blur(4px)', background: 'rgba(15, 23, 42, 0.22)' },
                }}
            >
                <div className='flex h-full flex-col'>
                    <div className='border-b border-slate-200/80 bg-white px-4 py-4'>
                        <div className='flex items-start justify-between gap-3'>
                            <div className='min-w-0'>
                                <div className='text-sm font-semibold text-slate-950'>Cài đặt thông báo</div>
                                <p className='mt-1 mb-0 text-[12px] leading-5 text-slate-500'>
                                    Thiết lập âm thanh và thông báo ngoài app cho thiết bị đang dùng.
                                </p>
                            </div>
                            <Button
                                type='text'
                                size='small'
                                icon={<CloseOutlined />}
                                onClick={() => setNotificationSettingsOpen(false)}
                                className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full'
                            />
                        </div>
                    </div>

                    <div className='flex-1 space-y-3 overflow-y-auto p-3 pb-[calc(16px+env(safe-area-inset-bottom))]'>
                        <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                            <NotificationSoundToggle />
                        </div>
                        <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                            <PushNotificationToggle />
                        </div>
                        <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                            <NotificationHelpGuide />
                        </div>
                    </div>
                </div>
            </Drawer>

            <Modal
                open={logoutOpen}
                centered
                footer={null}
                width={420}
                onCancel={() => setLogoutOpen(false)}
                title='Đăng xuất khỏi hệ thống'
            >
                <div className='space-y-3'>
                    <p className='mb-0 text-[13px] leading-6 text-slate-600'>
                        Nếu đây là thiết bị cá nhân, bạn có thể giữ thông báo ngoài app để vẫn nhận cảnh báo vận hành
                        sau khi phiên đăng nhập hết hạn. Nếu là máy dùng chung, hãy tắt thông báo trên thiết bị này.
                    </p>
                    <div className='grid gap-2'>
                        <Button
                            type='primary'
                            size='large'
                            loading={logoutAction === 'keep-push'}
                            disabled={Boolean(logoutAction)}
                            onClick={() => void completeLogout(false)}
                            className='h-auto justify-start rounded-xl py-3 text-left'
                        >
                            <span className='block'>
                                <span className='block text-sm font-semibold'>Đăng xuất, vẫn giữ thông báo</span>
                                <span className='block text-[11px] font-normal opacity-80'>
                                    Phù hợp với điện thoại hoặc máy cá nhân.
                                </span>
                            </span>
                        </Button>
                        <Button
                            danger
                            size='large'
                            loading={logoutAction === 'disable-push'}
                            disabled={Boolean(logoutAction)}
                            onClick={() => void completeLogout(true)}
                            className='h-auto justify-start rounded-xl py-3 text-left'
                        >
                            <span className='block'>
                                <span className='block text-sm font-semibold'>
                                    Đăng xuất và tắt thông báo thiết bị này
                                </span>
                                <span className='block text-[11px] font-normal opacity-80'>
                                    Nên dùng khi đăng xuất khỏi máy dùng chung.
                                </span>
                            </span>
                        </Button>
                    </div>
                </div>
            </Modal>
        </Header>
    );
};

export default AppHeader;
