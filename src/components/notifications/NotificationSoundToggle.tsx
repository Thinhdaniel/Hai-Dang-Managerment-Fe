import { useState } from 'react';
import { Button, Select, Switch, Typography } from 'antd';
import { PlayCircleOutlined, SoundOutlined } from '@ant-design/icons';
import {
    getNotificationSoundId,
    isNotificationSoundEnabled,
    NOTIFICATION_SOUNDS,
    playNotificationSound,
    setNotificationSoundEnabled,
    setNotificationSoundId,
} from '../../core/lib/notificationSound';

const { Text } = Typography;

const NotificationSoundToggle = () => {
    const [enabled, setEnabled] = useState(isNotificationSoundEnabled);
    const [soundId, setSoundId] = useState(getNotificationSoundId);

    const handleToggle = (checked: boolean) => {
        setEnabled(checked);
        setNotificationSoundEnabled(checked);
        if (checked) {
            // Nghe thử ngay khi bật (cũng là tương tác mở khoá audio)
            playNotificationSound({ force: true });
        }
    };

    const handleSelect = (id: string) => {
        setSoundId(id);
        setNotificationSoundId(id);
        playNotificationSound({ force: true, soundId: id });
    };

    return (
        <div className='border-b border-slate-100 bg-white px-4 py-3'>
            <div className='flex items-center justify-between gap-3'>
                <div className='flex min-w-0 items-center gap-2'>
                    <SoundOutlined className='text-blue-600' />
                    <div className='min-w-0'>
                        <Text className='block text-[13px] font-semibold text-slate-900'>Âm thanh thông báo</Text>
                        <Text className='block text-[11px] leading-4 text-slate-500'>
                            Phát chuông khi có thông báo mới đến
                        </Text>
                    </div>
                </div>
                <Switch checked={enabled} onChange={handleToggle} />
            </div>

            {enabled ? (
                <div className='mt-2.5 flex items-center gap-2'>
                    <Select
                        size='small'
                        value={soundId}
                        onChange={handleSelect}
                        className='flex-1'
                        options={NOTIFICATION_SOUNDS.map((sound) => ({ value: sound.id, label: sound.label }))}
                    />
                    <Button
                        size='small'
                        icon={<PlayCircleOutlined />}
                        onClick={() => playNotificationSound({ force: true, soundId })}
                    >
                        Nghe thử
                    </Button>
                </div>
            ) : null}
        </div>
    );
};

export default NotificationSoundToggle;
