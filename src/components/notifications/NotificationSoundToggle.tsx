import { useEffect, useState } from 'react';
import { App, Button, Popconfirm, Select, Switch, Typography, Upload } from 'antd';
import { DeleteOutlined, PlayCircleOutlined, SoundOutlined, UploadOutlined } from '@ant-design/icons';
import {
    getNotificationSoundId,
    getSystemNotificationSound,
    isNotificationSoundEnabled,
    NOTIFICATION_SOUNDS,
    playNotificationSound,
    setNotificationSoundEnabled,
    setNotificationSoundId,
    setSystemNotificationSound,
    SYSTEM_SOUND_ID,
    type SystemSound,
} from '../../core/lib/notificationSound';
import { systemSettingService } from '../../core/services/systemSetting.service';
import { useAuth } from '../../core/contexts/AuthContext';

const { Text } = Typography;

const MAX_SOUND_FILE_SIZE = 3 * 1024 * 1024;

const NotificationSoundToggle = () => {
    const { message } = App.useApp();
    const { role } = useAuth();
    const isAdmin = role === 'admin';

    const [enabled, setEnabled] = useState(isNotificationSoundEnabled);
    const [soundId, setSoundId] = useState(getNotificationSoundId);
    const [systemSound, setSystemSound] = useState<SystemSound | null>(getSystemNotificationSound);
    const [uploading, setUploading] = useState(false);

    // Làm mới chuông hệ thống khi mở panel (admin có thể vừa đổi trên thiết bị khác)
    useEffect(() => {
        systemSettingService
            .getNotificationSound()
            .then((sound) => {
                setSystemNotificationSound(sound);
                setSystemSound(sound);
                setSoundId(getNotificationSoundId());
            })
            .catch(() => undefined);
    }, []);

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

    const handleUpload = async (file: File) => {
        if (file.size > MAX_SOUND_FILE_SIZE) {
            message.warning('File chuông tối đa 3MB');
            return;
        }

        setUploading(true);
        try {
            const sound = await systemSettingService.uploadNotificationSound(file);
            setSystemNotificationSound(sound);
            setSystemSound(sound);
            // Chuông mới upload trở thành lựa chọn đang dùng để nghe được ngay
            setSoundId(SYSTEM_SOUND_ID);
            setNotificationSoundId(SYSTEM_SOUND_ID);
            playNotificationSound({ force: true, soundId: SYSTEM_SOUND_ID });
            message.success('Đã đặt chuông hệ thống cho mọi người dùng');
        } catch (error: any) {
            message.error(error?.message || 'Không upload được file chuông');
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveSystemSound = async () => {
        try {
            await systemSettingService.deleteNotificationSound();
            setSystemNotificationSound(null);
            setSystemSound(null);
            setSoundId(getNotificationSoundId());
            message.success('Đã gỡ chuông hệ thống, dùng lại chuông có sẵn');
        } catch (error: any) {
            message.error(error?.message || 'Không gỡ được chuông hệ thống');
        }
    };

    const options = [
        ...(systemSound ? [{ value: SYSTEM_SOUND_ID, label: `Chuông công ty — ${systemSound.name}` }] : []),
        ...NOTIFICATION_SOUNDS.map((sound) => ({ value: sound.id, label: sound.label })),
    ];

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
                        className='min-w-0 flex-1'
                        options={options}
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

            {enabled && isAdmin ? (
                <div className='mt-2 flex items-center gap-2'>
                    <Upload
                        accept='.mp3,audio/mpeg'
                        showUploadList={false}
                        beforeUpload={(file) => {
                            void handleUpload(file);
                            return false;
                        }}
                    >
                        <Button size='small' icon={<UploadOutlined />} loading={uploading}>
                            Upload chuông MP3
                        </Button>
                    </Upload>
                    {systemSound ? (
                        <Popconfirm
                            title='Gỡ chuông hệ thống?'
                            description='Mọi người dùng sẽ quay về chuông có sẵn.'
                            okText='Gỡ'
                            cancelText='Đóng'
                            onConfirm={() => void handleRemoveSystemSound()}
                        >
                            <Button size='small' danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    ) : null}
                    <Text className='text-[10.5px] leading-4 text-slate-400'>Áp cho mọi người dùng</Text>
                </div>
            ) : null}
        </div>
    );
};

export default NotificationSoundToggle;
