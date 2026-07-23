import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Grid, Layout } from 'antd';
import { Navigate, Outlet } from 'react-router-dom';
import AppHeader from './AppHeader';
import AppSidebar from './AppSidebar';
import MobileBottomNav from '../pwa/MobileBottomNav';
import AssistantLauncher from '../AssistantLauncher';
import { useAuth } from '../../core/contexts/AuthContext';
import { isLineLeader } from '../../core/lib/permissions';

const AssetAssistantDrawer = lazy(() => import('../AssetAssistantDrawer'));

const { Content } = Layout;
const { useBreakpoint } = Grid;

const DESKTOP_HEADER_HEIGHT = 72;
const MOBILE_HEADER_HEIGHT = 64;
const SIDEBAR_WIDTH = 296;
const SIDEBAR_COLLAPSED_WIDTH = 104;

const AppLayout: React.FC = () => {
    const { role } = useAuth();
    const screens = useBreakpoint();
    const isDesktop = Boolean(screens.lg);
    const headerHeight = isDesktop ? DESKTOP_HEADER_HEIGHT : MOBILE_HEADER_HEIGHT;
    const [desktopCollapsed, setDesktopCollapsed] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [assistantOpen, setAssistantOpen] = useState(false);

    useEffect(() => {
        if (isDesktop) {
            setMobileSidebarOpen(false);
        }
    }, [isDesktop]);

    const handleToggleSidebar = () => {
        if (isDesktop) {
            setDesktopCollapsed((value) => !value);
            return;
        }

        setMobileSidebarOpen((value) => !value);
    };

    // Tổ trưởng không có phần mềm quản lý máy/vật tư — mọi đường vào cây "/"
    // đều đẩy thẳng về màn nhập sản lượng theo giờ (một chốt chặn duy nhất).
    // Đặt sau toàn bộ hook để không phá thứ tự hook (rules-of-hooks).
    if (isLineLeader(role)) {
        return <Navigate to='/production' replace />;
    }

    return (
        <Layout className='min-h-screen bg-transparent'>
            <AppHeader
                collapsed={desktopCollapsed}
                isDesktop={isDesktop}
                mobileOpen={mobileSidebarOpen}
                headerHeight={headerHeight}
                onToggle={handleToggleSidebar}
            />

            <Layout
                className='bg-transparent'
                style={{ paddingTop: `calc(${headerHeight}px + env(safe-area-inset-top))` }}
            >
                <AppSidebar
                    collapsed={desktopCollapsed}
                    isDesktop={isDesktop}
                    mobileOpen={mobileSidebarOpen}
                    width={SIDEBAR_WIDTH}
                    collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
                    headerOffset={headerHeight}
                    onCollapse={setDesktopCollapsed}
                    onMobileClose={() => setMobileSidebarOpen(false)}
                />

                <Layout
                    className='bg-transparent transition-[margin-left] duration-200'
                    style={{
                        marginLeft: isDesktop ? (desktopCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH) : 0,
                    }}
                >
                    <Content
                        className='bg-transparent'
                        style={{
                            margin: isDesktop ? '24px' : screens.md ? '18px' : '12px',
                            overflow: 'initial',
                            paddingBottom: isDesktop ? undefined : 'calc(122px + env(safe-area-inset-bottom))',
                        }}
                    >
                        <div className='flex flex-col gap-6'>
                            <Outlet />
                        </div>
                    </Content>
                </Layout>
            </Layout>

            {!isDesktop ? <MobileBottomNav onOpenMenu={() => setMobileSidebarOpen(true)} /> : null}

            {/* Trợ lý vận hành toàn cục — truy cập ở mọi trang; ẩn nút khi cửa sổ đang mở */}
            {!assistantOpen ? (
                <AssistantLauncher isDesktop={isDesktop} onClick={() => setAssistantOpen(true)} />
            ) : null}
            {assistantOpen ? (
                <Suspense fallback={null}>
                    <AssetAssistantDrawer open={assistantOpen} onClose={() => setAssistantOpen(false)} />
                </Suspense>
            ) : null}
        </Layout>
    );
};

export default AppLayout;
