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
    Popover,
    Typography,
    type MenuProps,
} from 'antd';
import {
    BellOutlined,
    ClockCircleOutlined,
    CloseOutlined,
    DownOutlined,
    LogoutOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    SearchOutlined,
    ToolOutlined,
    UserOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import usePageMeta from '../navigation/usePageMeta';
import { normalizeSearchTerm } from '../../core/lib/search';
import { useAuth } from '../../core/contexts/AuthContext';
import { hasManagerAccess } from '../../core/lib/permissions';
import { useNotificationContext } from '../../core/contexts/NotificationContext';
import PushNotificationToggle from '../notifications/PushNotificationToggle';
import NotificationSoundToggle from '../notifications/NotificationSoundToggle';
import InstallPrompt from '../pwa/InstallPrompt';

const { Header } = Layout;
const { Text, Title } = Typography;
const { useBreakpoint } = Grid;
const COMPANY_LOGO_URL =
    'https://res.cloudinary.com/dn0kgs7mi/image/upload/v1777042068/461879796_122098397930558026_2620600354798656289_n_zi0tf9.jpg';

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
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationContext();
    const { pathname } = useLocation();
    const [searchParams] = useSearchParams();
    const [searchValue, setSearchValue] = useState('');
    const [notificationOpen, setNotificationOpen] = useState(false);
    const screens = useBreakpoint();
    const pageMeta = usePageMeta();
    const supportsSearch = pathname.startsWith('/assets');
    const canViewUsers = hasManagerAccess(role);
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

    const handleLogout = async () => {
        await logout();
        navigate('/login');
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

    const userMenuItems: MenuProps['items'] = canViewUsers
        ? [
              userSummaryItem,
              { type: 'divider' },
              {
                  key: 'profile',
                  icon: <UserOutlined />,
                  label: 'Profile',
              },
              {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: 'Logout',
                  danger: true,
              },
          ]
        : [
              userSummaryItem,
              { type: 'divider' },
              {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: 'Logout',
                  danger: true,
              },
          ];

    const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
        if (key === 'profile') {
            handleProfile();
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

            <NotificationSoundToggle />

            <PushNotificationToggle />

            <div className='notification-panel__list'>
                {notifications.length === 0 ? (
                    <div className='py-8 text-center text-sm text-slate-500'>Không có thông báo nào</div>
                ) : null}
                {notifications.map((item) => {
                    const itemIcon =
                        item.type === 'error' ? (
                            <WarningOutlined className='text-rose-500' />
                        ) : item.type === 'warning' ? (
                            <ToolOutlined className='text-amber-500' />
                        ) : (
                            <ClockCircleOutlined className='text-blue-500' />
                        );

                    let href = '/dashboard';
                    if (item.actionType === 'machine' || item.actionType === 'asset')
                        href = `/assets${item.actionId ? `/${item.actionId}` : ''}`;
                    else if (item.actionType === 'transfer') href = '/transfers';
                    else if (item.actionType === 'maintenance') href = '/maintenances';
                    else if (item.actionType === 'borrowing') href = '/borrowings';
                    else if (item.actionType === 'purchase_request') href = '/materials/purchase-requests';
                    else if (item.actionType === 'supply_request') href = '/materials/supply-requests';
                    else if (item.actionType === 'purchase_order') href = '/materials/purchase-orders';
                    else if (item.actionType === 'distribution') href = '/materials/distributions';

                    return (
                        <button
                            key={item._id}
                            type='button'
                            onClick={async () => {
                                setNotificationOpen(false);
                                if (!item.isRead) {
                                    await markAsRead(item._id);
                                }
                                navigate(href);
                            }}
                            className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50 ${item.isRead ? 'opacity-70' : ''}`}
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
                height='min(82vh, 680px)'
                className='mobile-notification-drawer'
                styles={{
                    body: { padding: 0 },
                    content: { borderRadius: '24px 24px 0 0', overflow: 'hidden' },
                    mask: { backdropFilter: 'blur(4px)', background: 'rgba(15, 23, 42, 0.22)' },
                }}
            >
                {renderNotificationContent('drawer')}
            </Drawer>
        </Header>
    );
};

export default AppHeader;
