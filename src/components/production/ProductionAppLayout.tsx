import { App, Avatar, Button, ConfigProvider, Dropdown, Grid, Tooltip, Typography, type MenuProps } from 'antd';
import {
    AppstoreOutlined,
    CalendarOutlined,
    DownOutlined,
    EditOutlined,
    FundProjectionScreenOutlined,
    HistoryOutlined,
    LineChartOutlined,
    LogoutOutlined,
    PieChartOutlined,
    SwapOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/contexts/AuthContext';
import { useSocket } from '../../core/hooks/useSocket';
import { can } from '../../core/lib/permissions';
import '../../styles/production.css';

const { Text } = Typography;

const PRODUCTION_FONT = "'Be Vietnam Pro', 'Segoe UI', system-ui, -apple-system, sans-serif";

const ProductionAppLayout = () => {
    const navigate = useNavigate();
    const screens = Grid.useBreakpoint();
    const { modal } = App.useApp();
    const { user, role, logout } = useAuth();
    const { socket } = useSocket();
    const [online, setOnline] = useState(() => navigator.onLine);
    const [realtimeConnected, setRealtimeConnected] = useState(() => Boolean(socket?.connected));

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
        { key: 'management', icon: <AppstoreOutlined />, label: 'Quản lý máy & vật tư' },
        { type: 'divider' },
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
            <div className='production-app-shell'>
                <header className='pd-header'>
                    <button type='button' className='pd-brand' onClick={() => navigate('/production')}>
                        <img src='/brand/company-logo.png' alt='' />
                        <strong>
                            Hải Đăng <em>Production</em>
                        </strong>
                    </button>

                    <nav className='pd-nav' aria-label='Điều hướng sản xuất'>
                        {navItems.map((item) => (
                            <NavLink key={item.to} to={item.to} end={item.end}>
                                {item.icon}
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </nav>

                    <div className='pd-header__right'>
                        <div
                            className={`pd-live ${realtimeOk ? 'is-online' : ''}`}
                            title={realtimeOk ? 'Đồng bộ thời gian thực' : 'Đang chờ kết nối'}
                        >
                            {screens.sm ? (realtimeOk ? 'Realtime' : 'Chờ đồng bộ') : null}
                        </div>

                        {screens.md ? (
                            <Tooltip title='Về Quản lý máy & vật tư'>
                                <Button icon={<SwapOutlined />} onClick={() => navigate('/dashboard')} />
                            </Tooltip>
                        ) : null}

                        <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={['click']}>
                            <button type='button' className='pd-account'>
                                <Avatar size={30} src={user?.avatarUrl} icon={<UserOutlined />} />
                                {screens.sm ? <Text strong>{user?.name || 'Tài khoản'}</Text> : null}
                                <DownOutlined />
                            </button>
                        </Dropdown>
                    </div>
                </header>

                <main className='pd-main'>
                    <Outlet />
                </main>

                <nav className='pd-tabbar' aria-label='Điều hướng sản xuất'>
                    {navItems.map((item) => (
                        <NavLink key={item.to} to={item.to} end={item.end}>
                            {item.icon}
                            <span>{item.short || item.label}</span>
                        </NavLink>
                    ))}
                </nav>
            </div>
        </ConfigProvider>
    );
};

export default ProductionAppLayout;
