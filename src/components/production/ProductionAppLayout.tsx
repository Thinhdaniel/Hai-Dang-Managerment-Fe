import { App, Avatar, Button, ConfigProvider, Drawer, Dropdown, Tooltip, Typography, type MenuProps } from 'antd';
import {
    AppstoreOutlined,
    CalendarOutlined,
    DownOutlined,
    EditOutlined,
    EllipsisOutlined,
    FundProjectionScreenOutlined,
    HistoryOutlined,
    LineChartOutlined,
    LogoutOutlined,
    PieChartOutlined,
    SwapOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/contexts/AuthContext';
import { useResponsive } from '../../core/hooks/useResponsive';
import { useSocket } from '../../core/hooks/useSocket';
import { can, isLineLeader } from '../../core/lib/permissions';
import '../../styles/production.css';

const { Text } = Typography;

const PRODUCTION_FONT = "'Be Vietnam Pro', 'Segoe UI', system-ui, -apple-system, sans-serif";

const ProductionAppLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isPhone } = useResponsive();
    const { modal } = App.useApp();
    const { user, role, logout } = useAuth();
    const { socket } = useSocket();
    const [online, setOnline] = useState(() => navigator.onLine);
    const [realtimeConnected, setRealtimeConnected] = useState(() => Boolean(socket?.connected));
    const [moreOpen, setMoreOpen] = useState(false);

    useEffect(() => {
        const onOnline = () => setOnline(true);
        const onOffline = () => setOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);

    useEffect(() => {
        if (!socket) return;
        const onConnect = () => setRealtimeConnected(true);
        const onDisconnect = () => setRealtimeConnected(false);
        setRealtimeConnected(socket.connected);
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
        };
    }, [socket]);

    const manage = can(role, 'production.manage');
    // Tổ trưởng chỉ có đúng màn nhập sản lượng — không hiện điều hướng nào khác,
    // không lối sang app quản lý máy/vật tư.
    const leaderOnly = isLineLeader(role);
    const navItems = [
        manage ? { to: '/production/planning', end: false, icon: <CalendarOutlined />, label: 'Kế hoạch' } : null,
        { to: '/production', end: true, icon: <EditOutlined />, label: 'Nhập sản lượng', short: 'Nhập liệu' },
        manage ? { to: '/production/monitor', end: false, icon: <LineChartOutlined />, label: 'Điều hành' } : null,
        manage
            ? {
                  to: '/production/board',
                  end: false,
                  icon: <FundProjectionScreenOutlined />,
                  label: 'Bảng chuyền',
                  short: 'Bảng',
              }
            : null,
        manage ? { to: '/production/reports', end: false, icon: <PieChartOutlined />, label: 'Báo cáo' } : null,
        { to: '/production/history', end: false, icon: <HistoryOutlined />, label: 'Lịch sử' },
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));

    // Thanh tab dưới chia đều chiều ngang: quá 5 mục thì mỗi mục còn ~62px ở
    // 390px, chữ dính nhau và bấm dễ trượt. Giữ 4 mục hay dùng, phần còn lại
    // gom vào "Khác" mở bảng chọn từ đáy.
    const MAX_TABS = 5;
    const needsOverflow = isPhone && navItems.length > MAX_TABS;
    const primaryNav = needsOverflow ? navItems.slice(0, MAX_TABS - 1) : navItems;
    const overflowNav = needsOverflow ? navItems.slice(MAX_TABS - 1) : [];
    const overflowActive = overflowNav.some((item) =>
        item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
    );

    const menuItems: MenuProps['items'] = [
        {
            key: 'account',
            disabled: true,
            label: (
                <div className='production-user-summary'>
                    <strong>{user?.name || 'Người dùng'}</strong>
                    <span>{user?.plant?.name || user?.email || ''}</span>
                </div>
            ),
        },
        { type: 'divider' },
        // Tổ trưởng không có quyền vào app quản lý máy/vật tư nên bỏ hẳn lối này.
        ...(leaderOnly
            ? []
            : ([
                  { key: 'management', icon: <AppstoreOutlined />, label: 'Quản lý máy & vật tư' },
                  { type: 'divider' },
              ] as NonNullable<MenuProps['items']>)),
        { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true },
    ];

    const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
        if (key === 'management') {
            navigate('/dashboard');
            return;
        }
        if (key === 'logout') {
            modal.confirm({
                title: 'Đăng xuất khỏi hệ thống?',
                content: 'Các số liệu đã lưu trên máy chủ không bị ảnh hưởng.',
                okText: 'Đăng xuất',
                cancelText: 'Ở lại',
                okButtonProps: { danger: true },
                onOk: async () => {
                    await logout();
                    navigate('/login', { replace: true });
                },
            });
        }
    };

    const realtimeOk = online && realtimeConnected;

    return (
        <ConfigProvider
            theme={{
                token: {
                    colorPrimary: '#2f51d9',
                    colorInfo: '#2f51d9',
                    colorSuccess: '#067647',
                    colorWarning: '#b54708',
                    colorError: '#b42318',
                    colorText: '#171a20',
                    colorTextSecondary: '#5b6472',
                    colorBorder: '#d2d7e0',
                    colorBorderSecondary: '#e5e8ee',
                    borderRadius: 8,
                    fontFamily: PRODUCTION_FONT,
                },
            }}
        >
            <div className={`production-app-shell${leaderOnly ? ' is-leader' : ''}`}>
                <header className='pd-header'>
                    <button type='button' className='pd-brand' onClick={() => navigate('/production')}>
                        <img src='/brand/company-logo.png' alt='' />
                        <strong>
                            Hải Đăng <em>Production</em>
                        </strong>
                    </button>

                    {leaderOnly ? (
                        <div className='pd-leader-tag'>Báo sản lượng theo giờ</div>
                    ) : (
                        <nav className='pd-nav' aria-label='Điều hướng sản xuất'>
                            {navItems.map((item) => (
                                <NavLink key={item.to} to={item.to} end={item.end}>
                                    {item.icon}
                                    <span>{item.label}</span>
                                </NavLink>
                            ))}
                        </nav>
                    )}

                    <div className='pd-header__right'>
                        <div
                            className={`pd-live ${realtimeOk ? 'is-online' : ''}`}
                            title={realtimeOk ? 'Đồng bộ thời gian thực' : 'Đang chờ kết nối'}
                        >
                            {isPhone ? null : realtimeOk ? 'Realtime' : 'Chờ đồng bộ'}
                        </div>

                        {isPhone || leaderOnly ? null : (
                            <Tooltip title='Về Quản lý máy & vật tư'>
                                <Button icon={<SwapOutlined />} onClick={() => navigate('/dashboard')} />
                            </Tooltip>
                        )}

                        <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={['click']}>
                            <button type='button' className='pd-account'>
                                <Avatar size={30} src={user?.avatarUrl} icon={<UserOutlined />} />
                                {isPhone ? null : <Text strong>{user?.name || 'Tài khoản'}</Text>}
                                <DownOutlined />
                            </button>
                        </Dropdown>
                    </div>
                </header>

                <main className='pd-main'>
                    <Outlet />
                </main>

                <nav
                    className='pd-tabbar'
                    aria-label='Điều hướng sản xuất'
                    hidden={leaderOnly}
                    style={leaderOnly ? { display: 'none' } : undefined}
                >
                    {primaryNav.map((item) => (
                        <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMoreOpen(false)}>
                            {item.icon}
                            <span>{item.short || item.label}</span>
                        </NavLink>
                    ))}
                    {overflowNav.length ? (
                        <button
                            type='button'
                            className={`pd-tabbar__more ${overflowActive ? 'is-active' : ''}`}
                            aria-expanded={moreOpen}
                            onClick={() => setMoreOpen(true)}
                        >
                            <EllipsisOutlined />
                            <span>Khác</span>
                        </button>
                    ) : null}
                </nav>

                <Drawer
                    open={moreOpen}
                    onClose={() => setMoreOpen(false)}
                    placement='bottom'
                    height='auto'
                    title='Chuyển trang'
                    className='pd-more-sheet'
                >
                    <div className='pd-more-list'>
                        {overflowNav.map((item) => (
                            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMoreOpen(false)}>
                                {item.icon}
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </div>
                </Drawer>
            </div>
        </ConfigProvider>
    );
};

export default ProductionAppLayout;
