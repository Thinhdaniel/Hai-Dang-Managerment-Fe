import React, { useEffect, useState } from 'react';
import { Grid, Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import AppHeader from './AppHeader';
import AppSidebar from './AppSidebar';

const { Content } = Layout;
const { useBreakpoint } = Grid;

const HEADER_HEIGHT = 72;
const SIDEBAR_WIDTH = 296;
const SIDEBAR_COLLAPSED_WIDTH = 104;

const AppLayout: React.FC = () => {
    const screens = useBreakpoint();
    const isDesktop = Boolean(screens.lg);
    const [desktopCollapsed, setDesktopCollapsed] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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

    return (
        <Layout className='min-h-screen bg-transparent'>
            <AppHeader
                collapsed={desktopCollapsed}
                isDesktop={isDesktop}
                mobileOpen={mobileSidebarOpen}
                onToggle={handleToggleSidebar}
            />

            <Layout className='bg-transparent' style={{ paddingTop: HEADER_HEIGHT }}>
                <AppSidebar
                    collapsed={desktopCollapsed}
                    isDesktop={isDesktop}
                    mobileOpen={mobileSidebarOpen}
                    width={SIDEBAR_WIDTH}
                    collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
                    headerOffset={HEADER_HEIGHT}
                    onCollapse={setDesktopCollapsed}
                    onMobileClose={() => setMobileSidebarOpen(false)}
                />

                <Layout
                    className='bg-transparent transition-[margin-left] duration-200'
                    style={{
                        marginLeft: isDesktop ? (desktopCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH) : 0,
                    }}
                >
                    <Content className='bg-transparent' style={{ margin: screens.md ? '24px' : '14px', overflow: 'initial' }}>
                        <div className='flex flex-col gap-6'>
                            <Outlet />
                        </div>
                    </Content>
                </Layout>
            </Layout>
        </Layout>
    );
};

export default AppLayout;
