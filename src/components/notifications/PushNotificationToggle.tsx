import { useCallback, useEffect, useState } from 'react';
import { App, Button, Space, Tag, Typography } from 'antd';
import { BellOutlined, CheckCircleOutlined, CloseCircleOutlined, SendOutlined } from '@ant-design/icons';
import { pushNotificationService, type PushNotificationState } from '../../core/services/push-notification.service';

const { Text } = Typography;

const DEFAULT_STATE: PushNotificationState = {
    supported: false,
    enabled: false,
    permission: 'unsupported',
    subscribed: false,
    activeDevices: 0,
};

const getStateCopy = (state: PushNotificationState) => ({ ...state });

const isAppleMobile = () =>
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as Window & { MSStream?: unknown }).MSStream;

const isStandalonePwa = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true);

const getStatus = (state: PushNotificationState) => {
    if (!state.supported) {
        if (isAppleMobile() && !isStandalonePwa()) {
            return {
                color: 'orange',
                label: 'Cần cài PWA',
                description: 'Trên iPhone phải Add to Home Screen và mở app từ icon thì mới nhận thông báo ngoài app.',
            };
        }

        return {
            color: 'default',
            label: 'Không hỗ trợ',
            description: 'Thiết bị hoặc kết nối hiện tại chưa hỗ trợ thông báo ngoài app.',
        };
    }

    if (!state.enabled) {
        return {
            color: 'orange',
            label: 'Chưa cấu hình',
            description: 'Server chưa có VAPID key cho Web Push.',
        };
    }

    if (state.permission === 'denied') {
        return {
            color: 'red',
            label: 'Đang bị chặn',
            description: 'Trình duyệt đang chặn quyền thông báo. Hãy mở cài đặt site để cấp lại quyền.',
        };
    }

    if (state.subscribed) {
        return {
            color: 'green',
            label: 'Đã bật',
            description: 'Thiết bị này sẽ nhận thông báo quan trọng khi bạn không mở hệ thống.',
        };
    }

    return {
        color: 'blue',
        label: 'Chưa bật',
        description: 'Bật để nhận thông báo khi có phiếu cần xử lý hoặc cảnh báo vận hành.',
    };
};

const PushNotificationToggle = () => {
    const { message } = App.useApp();
    const [state, setState] = useState<PushNotificationState>(DEFAULT_STATE);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<'enable' | 'disable' | 'test' | null>(null);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            const nextState = await pushNotificationService.getState();
            setState(getStateCopy(nextState));
        } catch {
            setState(DEFAULT_STATE);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const status = getStatus(state);
    const canEnable = state.supported && state.enabled && state.permission !== 'denied';
    const canTest = state.supported && state.enabled && (state.subscribed || state.activeDevices > 0);

    const handleEnable = async () => {
        try {
            setActionLoading('enable');
            await pushNotificationService.subscribeCurrentDevice();
            message.success('Đã bật thông báo trên thiết bị này');
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Không thể bật thông báo');
        } finally {
            setActionLoading(null);
        }
    };

    const handleDisable = async () => {
        try {
            setActionLoading('disable');
            await pushNotificationService.unsubscribeCurrentDevice();
            message.success('Đã tắt thông báo trên thiết bị này');
            await refresh();
        } catch {
            message.error('Không thể tắt thông báo');
        } finally {
            setActionLoading(null);
        }
    };

    const handleTest = async () => {
        try {
            setActionLoading('test');
            const result = await pushNotificationService.sendTest();
            const delivery = result.delivery;

            if (!delivery.enabled) {
                message.warning('Server chưa cấu hình Web Push');
                return;
            }

            if (delivery.attempted === 0) {
                message.warning('Chưa có thiết bị nào được đăng ký nhận Web Push');
                await refresh();
                return;
            }

            if (delivery.sent > 0) {
                message.success(`Đã gửi thử: ${delivery.sent}/${delivery.attempted} thiết bị`);
            } else {
                message.error(`Web Push gửi lỗi: ${delivery.failed}/${delivery.attempted} thiết bị`);
            }
            await refresh();
        } catch {
            message.error('Không thể gửi thông báo thử nghiệm');
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className='border-b border-slate-100 bg-slate-50/80 px-4 py-3'>
            <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                        <BellOutlined className='text-blue-600' />
                        <Text className='text-[13px] font-semibold text-slate-900'>Thông báo ngoài app</Text>
                        <Tag color={status.color} className='m-0 rounded-full text-[10px] font-semibold'>
                            {status.label}
                        </Tag>
                    </div>
                    <p className='mt-1 mb-0 text-[11px] leading-5 text-slate-500'>{status.description}</p>
                    {state.activeDevices > 0 ? (
                        <Text className='mt-1 block text-[11px] text-slate-400'>
                            {state.activeDevices} thiết bị đang bật thông báo.
                        </Text>
                    ) : null}
                </div>
            </div>
            <Space wrap size={8} className='mt-3'>
                {state.subscribed ? (
                    <Button
                        size='small'
                        icon={<CloseCircleOutlined />}
                        loading={actionLoading === 'disable'}
                        disabled={loading || Boolean(actionLoading)}
                        onClick={handleDisable}
                    >
                        Tắt trên thiết bị này
                    </Button>
                ) : (
                    <Button
                        type='primary'
                        size='small'
                        icon={<CheckCircleOutlined />}
                        loading={actionLoading === 'enable'}
                        disabled={loading || Boolean(actionLoading) || !canEnable}
                        onClick={handleEnable}
                    >
                        Bật thông báo
                    </Button>
                )}
                <Button
                    size='small'
                    icon={<SendOutlined />}
                    loading={actionLoading === 'test'}
                    disabled={loading || Boolean(actionLoading) || !canTest}
                    onClick={handleTest}
                >
                    Gửi thử
                </Button>
            </Space>
        </div>
    );
};

export default PushNotificationToggle;
