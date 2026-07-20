import { App, Avatar, Button, ConfigProvider, Dropdown, Grid, Typography, type MenuProps } from 'antd';
import {
    AppstoreOutlined,
    CalendarOutlined,
    DownOutlined,
    EditOutlined,
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

const { Text } = Typography;

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

    return (
        <ConfigProvider
            theme={{
                token: {
                    colorPrimary: '#147a4b',
                    colorSuccess: '#168a52',
                    colorWarning: '#c87816',
                    borderRadius: 6,
                },
            }}
        >
            <div className='production-app-shell'>
                <header className='production-app-header'>
                    <button type='button' className='production-brand' onClick={() => navigate('/production')}>
                        <img src='/brand/company-logo.png' alt='' />
                        <span className='production-brand__copy'>
                            <strong>Hải Đăng Production</strong>
                            <small>Điều hành sản lượng</small>
                        </span>
                    </button>

                    <nav className='production-app-nav' aria-label='Điều hướng sản xuất'>
                        {can(role, 'production.manage') ? (
                            <NavLink to='/production/planning'>
                                <CalendarOutlined />
                                <span>Kế hoạch</span>
                            </NavLink>
                        ) : null}
                        <NavLink to='/production' end>
                            <EditOutlined />
                            <span>Nhập sản lượng</span>
                        </NavLink>
                        {can(role, 'production.manage') ? (
                            <NavLink to='/production/monitor'>
                                <LineChartOutlined />
                                <span>Điều hành</span>
                            </NavLink>
                        ) : null}
                        {can(role, 'production.manage') ? (
                            <NavLink to='/production/reports'>
                                <PieChartOutlined />
                                <span>Báo cáo</span>
                            </NavLink>
                        ) : null}
                        <NavLink to='/production/history'>
                            <HistoryOutlined />
                            <span>Lịch sử & báo cáo</span>
                        </NavLink>
                    </nav>

                    <div className='production-app-header__right'>
                        <div
                            className={`production-connection ${online && realtimeConnected ? 'is-online' : 'is-offline'}`}
                            title={online && realtimeConnected ? 'Đồng bộ thời gian thực' : 'Đang chờ kết nối'}
                        >
                            {screens.sm ? (online && realtimeConnected ? 'Realtime' : 'Chờ đồng bộ') : null}
                        </div>

                        {screens.md ? (
                            <Button icon={<SwapOutlined />} onClick={() => navigate('/dashboard')}>
                                Đổi ứng dụng
                            </Button>
                        ) : null}

                        <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={['click']}>
                            <button type='button' className='production-account-button'>
                                <Avatar size={34} src={user?.avatarUrl} icon={<UserOutlined />} />
                                {screens.sm ? <Text strong>{user?.name || 'Tài khoản'}</Text> : null}
                                <DownOutlined />
                            </button>
                        </Dropdown>
                    </div>
                </header>

                <main className='production-app-main'>
                    <Outlet />
                </main>
            </div>
        </ConfigProvider>
    );
};

export default ProductionAppLayout;
