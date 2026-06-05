import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import { router } from './routes/routes';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './core/contexts/AuthContext';
import { NotificationProvider } from './core/contexts/NotificationContext';
import { queryClient } from './core/queryClient';
import OfflineStatus from './components/pwa/OfflineStatus';
import ServiceWorkerManager from './components/pwa/ServiceWorkerManager';

function App() {
    return (
        <ConfigProvider
            theme={{
                token: {
                    colorPrimary: '#1890ff',
                    colorSuccess: '#52c41a',
                    colorWarning: '#fa8c16',
                    colorError: '#f5222d',
                    colorInfo: '#1890ff',
                    borderRadius: 4,
                    fontFamily:
                        'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                },
                components: {
                    Layout: {
                        headerBg: 'rgba(248,250,252,0.84)',
                        siderBg: '#001529',
                        bodyBg: '#fbf9f8',
                    },
                    Card: {
                        colorBgContainer: '#ffffff',
                    },
                },
            }}
        >
            <AntdApp>
                <QueryClientProvider client={queryClient}>
                    <AuthProvider>
                        <NotificationProvider>
                            <RouterProvider router={router} />
                            <OfflineStatus />
                            <ServiceWorkerManager />
                        </NotificationProvider>
                    </AuthProvider>
                </QueryClientProvider>
            </AntdApp>
        </ConfigProvider>
    );
}

export default App;
