import { useEffect, useState } from 'react';
import { DisconnectOutlined } from '@ant-design/icons';

const getOnlineState = () => (typeof navigator === 'undefined' ? true : navigator.onLine);

const OfflineStatus = () => {
    const [online, setOnline] = useState(getOnlineState);

    useEffect(() => {
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (online) return null;

    return (
        <div className='pwa-offline-banner' role='status'>
            <DisconnectOutlined />
            <span>Đang ngoại tuyến. Dữ liệu sẽ cập nhật lại khi có mạng.</span>
        </div>
    );
};

export default OfflineStatus;
