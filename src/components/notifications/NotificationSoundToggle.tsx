import { useState } from 'react';
import { Switch, Typography } from 'antd';
import { SoundOutlined } from '@ant-design/icons';
import {
    isNotificationSoundEnabled,
    playNotificationSound,
    setNotificationSoundEnabled,
} from '../../core/lib/notificationSound';

const { Text } = Typography;

const NotificationSoundToggle = () => {
    const [enabled, setEnabled] = useState(isNotificationSoundEnabled);

    const handleChange = (checked: boolean) => {
        setEnabled(checked);
        setNotificationSoundEnabled(checked);
        if (checked) {
            // Nghe thử ngay khi bật (cũng là tương tác mở khoá audio)
            playNotificationSound({ force: true });
        }
    };

    return (
        <div className='flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3'>
            <div className='flex min-w-0 items-center gap-2'>
                <SoundOutlined className='text-blue-600' />
                <div className='min-w-0'>
                    <Text className='block text-[13px] font-semibold text-slate-900'>Âm thanh thông báo</Text>
                    <Text className='block text-[11px] leading-4 text-slate-500'>
                        Phát chuông khi có thông báo mới đến
                    </Text>
                </div>
            </div>
            <Switch checked={enabled} onChange={handleChange} />
        </div>
    );
};

export default NotificationSoundToggle;
