import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Space, Tag, Typography } from 'antd';
import {
    BellOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    CopyOutlined,
    DisconnectOutlined,
    LinkOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    SendOutlined,
} from '@ant-design/icons';
import {
    pushNotificationService,
    type PushDevice,
    type TelegramLinkResponse,
    type PushNotificationState,
    type TelegramNotificationStatus,
} from '../../core/services/push-notification.service';

const { Text } = Typography;

const DEFAULT_STATE: PushNotificationState = {
    supported: false,
    enabled: false,
    permission: 'unsupported',
    subscribed: false,
    activeDevices: 0,
};

const getStateCopy = (state: PushNotificationState) => ({ ...state });

const DEFAULT_TELEGRAM_STATUS: TelegramNotificationStatus = {
    enabled: false,
    linked: false,
};

const TELEGRAM_POLL_INTERVAL_MS = 2500;
const TELEGRAM_POLL_TIMEOUT_MS = 90 * 1000;

const formatDateTime = (value?: string) => {
    if (!value) return 'Chưa có dữ liệu';
    return new Date(value).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
    });
};

const isAppleMobile = () =>
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as Window & { MSStream?: unknown }).MSStream;

const isStandalonePwa = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true);

const isMobileDevice = () =>
    typeof navigator !== 'undefined' && /Android|iPad|iPhone|iPod/i.test(navigator.userAgent);

const buildTelegramAppDeepLink = (deepLink?: string) => {
    if (!deepLink) return undefined;

    try {
        const url = new URL(deepLink);
        const botUsername = url.pathname.replace(/^\/+/, '');
        const startToken = url.searchParams.get('start');

        if (!botUsername || !startToken) return undefined;
        return `tg://resolve?domain=${encodeURIComponent(botUsername)}&start=${encodeURIComponent(startToken)}`;
    } catch {
        return undefined;
    }
};

const openTelegramLink = (deepLink: string, preparedWindow?: Window | null) => {
    if (preparedWindow && !preparedWindow.closed) {
        try {
            preparedWindow.opener = null;
            preparedWindow.location.href = deepLink;
            return;
        } catch {
            /* fall back below */
        }
    }

    if (isMobileDevice()) {
        window.location.href = deepLink;
        return;
    }

    window.open(deepLink, '_blank', 'noopener,noreferrer');
};

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
    const telegramPollTimerRef = useRef<number | null>(null);
    const [state, setState] = useState<PushNotificationState>(DEFAULT_STATE);
    const [telegramStatus, setTelegramStatus] = useState<TelegramNotificationStatus>(DEFAULT_TELEGRAM_STATUS);
    const [telegramLink, setTelegramLink] = useState<TelegramLinkResponse | null>(null);
    const [telegramPolling, setTelegramPolling] = useState(false);
    const [devices, setDevices] = useState<PushDevice[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<'enable' | 'disable' | 'test' | null>(null);
    const [telegramLoading, setTelegramLoading] = useState<'link' | 'unlink' | null>(null);
    const [deviceActionId, setDeviceActionId] = useState<string | null>(null);

    const clearTelegramPollTimer = useCallback(() => {
        if (telegramPollTimerRef.current !== null) {
            window.clearTimeout(telegramPollTimerRef.current);
            telegramPollTimerRef.current = null;
        }
    }, []);

    const refreshTelegramStatus = useCallback(async () => {
        const nextTelegram = await pushNotificationService.getTelegramStatus();
        setTelegramStatus(nextTelegram);

        if (nextTelegram.linked && !nextTelegram.disabledAt) {
            setTelegramLink(null);
        }

        return nextTelegram;
    }, []);

    const startTelegramStatusPolling = useCallback(
        (expiresAt?: string) => {
            clearTelegramPollTimer();
            setTelegramPolling(true);

            const startedAt = Date.now();
            const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
            const timeoutAt = Number.isFinite(expiresAtMs)
                ? Math.min(expiresAtMs, startedAt + TELEGRAM_POLL_TIMEOUT_MS)
                : startedAt + TELEGRAM_POLL_TIMEOUT_MS;

            const check = async () => {
                try {
                    const nextTelegram = await refreshTelegramStatus();

                    if (nextTelegram.linked && !nextTelegram.disabledAt) {
                        clearTelegramPollTimer();
                        setTelegramPolling(false);
                        message.success('Đã kết nối Telegram với tài khoản này');
                        return;
                    }
                } catch {
                    /* keep polling while the user is switching apps */
                }

                if (Date.now() >= timeoutAt) {
                    clearTelegramPollTimer();
                    setTelegramPolling(false);
                    message.warning('Chưa xác nhận được Telegram. Nếu Telegram chỉ hiện /start, hãy bấm Gửi rồi quay lại app.');
                    return;
                }

                telegramPollTimerRef.current = window.setTimeout(check, TELEGRAM_POLL_INTERVAL_MS);
            };

            telegramPollTimerRef.current = window.setTimeout(check, 1200);
        },
        [clearTelegramPollTimer, message, refreshTelegramStatus]
    );

    const refresh = useCallback(async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const [nextState, nextTelegram] = await Promise.all([
                pushNotificationService.getState(),
                pushNotificationService.getTelegramStatus().catch(() => DEFAULT_TELEGRAM_STATUS),
            ]);
            setState(getStateCopy(nextState));
            setTelegramStatus(nextTelegram);
            if (nextTelegram.linked && !nextTelegram.disabledAt) {
                setTelegramLink(null);
            }
            if (nextState.supported && nextState.enabled) {
                const nextDevices = await pushNotificationService.getDevices();
                setDevices(nextDevices);
            } else {
                setDevices([]);
            }
        } catch {
            setState(DEFAULT_STATE);
            setDevices([]);
        } finally {
            if (showLoading) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        const handleResume = () => {
            if (document.visibilityState === 'hidden') return;
            void refreshTelegramStatus().catch(() => undefined);
        };

        document.addEventListener('visibilitychange', handleResume);
        window.addEventListener('focus', handleResume);

        return () => {
            document.removeEventListener('visibilitychange', handleResume);
            window.removeEventListener('focus', handleResume);
            clearTelegramPollTimer();
        };
    }, [clearTelegramPollTimer, refreshTelegramStatus]);

    const status = getStatus(state);
    const canEnable = state.supported && state.enabled && state.permission !== 'denied';
    const canTest = state.supported && state.enabled && (state.subscribed || state.activeDevices > 0);
    const activeDevices = devices.filter((device) => device.isActive);
    const shouldShowIosGuide = isAppleMobile() && !isStandalonePwa();
    const telegramAppDeepLink = useMemo(() => buildTelegramAppDeepLink(telegramLink?.deepLink), [telegramLink?.deepLink]);

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

    const handleToggleTrust = async (device: PushDevice) => {
        try {
            setDeviceActionId(device.id);
            await pushNotificationService.updateDevice(device.id, { trusted: !device.trusted });
            message.success(!device.trusted ? 'Đã bật hiển thị chi tiết cho thiết bị' : 'Đã ẩn chi tiết trên thiết bị');
            await refresh();
        } catch {
            message.error('Không thể cập nhật thiết bị');
        } finally {
            setDeviceActionId(null);
        }
    };

    const handleDeactivateDevice = async (device: PushDevice) => {
        try {
            setDeviceActionId(device.id);
            await pushNotificationService.deactivateDevice(device.id);
            message.success('Đã tắt thông báo trên thiết bị');
            await refresh();
        } catch {
            message.error('Không thể tắt thiết bị');
        } finally {
            setDeviceActionId(null);
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

    const handleConnectTelegram = async () => {
        const preparedWindow = window.open('', '_blank');

        try {
            if (preparedWindow) {
                preparedWindow.document.title = 'Đang mở Telegram';
                preparedWindow.document.body.innerHTML =
                    '<div style="font-family:system-ui;padding:24px;color:#0f172a">Đang mở Telegram...</div>';
            }
            setTelegramLoading('link');
            const result = await pushNotificationService.createTelegramLink();

            if (!result.enabled || !result.deepLink) {
                preparedWindow?.close();
                message.warning('Server chưa cấu hình Telegram Bot');
                return;
            }

            setTelegramLink(result);
            openTelegramLink(result.deepLink, preparedWindow);
            startTelegramStatusPolling(result.expiresAt);
            message.info('Telegram đã mở. Bấm Start/Gửi trong bot, app sẽ tự cập nhật khi kết nối xong.');
        } catch {
            preparedWindow?.close();
            message.error('Không thể tạo liên kết Telegram');
        } finally {
            setTelegramLoading(null);
        }
    };

    const handleUnlinkTelegram = async () => {
        try {
            setTelegramLoading('unlink');
            await pushNotificationService.unlinkTelegram();
            clearTelegramPollTimer();
            setTelegramPolling(false);
            setTelegramLink(null);
            message.success('Đã ngắt Telegram khỏi tài khoản');
            await refresh();
        } catch {
            message.error('Không thể ngắt Telegram');
        } finally {
            setTelegramLoading(null);
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
                    {shouldShowIosGuide ? (
                        <div className='mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800'>
                            iPhone Safari chỉ nhận Web Push khi cài PWA: bấm <b>Chia sẻ</b> →{' '}
                            <b>Thêm vào Màn hình chính</b> → mở lại từ icon Hải Đăng.
                        </div>
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

            <div className='mt-4 rounded-xl border border-slate-200 bg-white p-3'>
                <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                            <SendOutlined className='text-sky-600' />
                            <Text className='text-[12px] font-semibold text-slate-900'>Telegram dự phòng</Text>
                            <Tag
                                color={
                                    !telegramStatus.enabled
                                        ? 'default'
                                        : telegramStatus.linked && !telegramStatus.disabledAt
                                          ? 'green'
                                          : 'orange'
                                }
                                className='m-0 rounded-full text-[10px]'
                            >
                                {!telegramStatus.enabled
                                    ? 'Chưa cấu hình'
                                    : telegramStatus.linked && !telegramStatus.disabledAt
                                      ? 'Đã kết nối'
                                      : 'Chưa kết nối'}
                            </Tag>
                        </div>
                        <p className='mt-1 mb-0 text-[11px] leading-5 text-slate-500'>
                            Kênh miễn phí để nhận thông báo khi trình duyệt/PWA không còn hoạt động.
                        </p>
                        {telegramStatus.linked ? (
                            <Text className='mt-1 block text-[11px] text-slate-400'>
                                Đã nối {telegramStatus.telegramUsername ? `@${telegramStatus.telegramUsername}` : 'Telegram'}
                                {telegramStatus.linkedAt ? ` · ${formatDateTime(telegramStatus.linkedAt)}` : ''}
                            </Text>
                        ) : null}
                    </div>
                    {telegramStatus.linked ? (
                        <Button
                            size='small'
                            icon={<DisconnectOutlined />}
                            loading={telegramLoading === 'unlink'}
                            disabled={Boolean(telegramLoading)}
                            onClick={handleUnlinkTelegram}
                        >
                            Ngắt
                        </Button>
                    ) : (
                        <Button
                            size='small'
                            type='primary'
                            icon={<LinkOutlined />}
                            loading={telegramLoading === 'link'}
                            disabled={!telegramStatus.enabled || Boolean(telegramLoading)}
                            onClick={handleConnectTelegram}
                        >
                            Kết nối
                        </Button>
                    )}
                </div>
                {telegramLink?.deepLink && !telegramStatus.linked ? (
                    <div className='mt-3 rounded-xl border border-sky-200 bg-sky-50/80 p-3'>
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                            <Text className='text-[12px] font-semibold text-sky-900'>
                                {telegramPolling ? 'Đang chờ Telegram xác nhận...' : 'Chưa thấy Telegram xác nhận'}
                            </Text>
                            <Tag color='blue' className='m-0 rounded-full text-[10px]'>
                                Link hết hạn {formatDateTime(telegramLink.expiresAt)}
                            </Tag>
                        </div>
                        <p className='mt-1 mb-2 text-[11px] leading-5 text-sky-700'>
                            Nếu iPhone không tự mở app, bấm <b>Mở Telegram</b>, sau đó bấm <b>Start</b> hoặc{' '}
                            <b>Gửi</b> lệnh /start trong bot rồi quay lại Hải Đăng MS.
                        </p>
                        <Space wrap size={8}>
                            <Button
                                size='small'
                                type='primary'
                                icon={<SendOutlined />}
                                href={telegramLink.deepLink}
                                target='_blank'
                                rel='noopener noreferrer'
                                onClick={() => startTelegramStatusPolling(telegramLink.expiresAt)}
                            >
                                Mở Telegram
                            </Button>
                            {telegramAppDeepLink ? (
                                <Button
                                    size='small'
                                    href={telegramAppDeepLink}
                                    onClick={() => startTelegramStatusPolling(telegramLink.expiresAt)}
                                >
                                    Mở app
                                </Button>
                            ) : null}
                            <Button
                                size='small'
                                icon={<ReloadOutlined />}
                                loading={telegramPolling}
                                onClick={() => startTelegramStatusPolling(telegramLink.expiresAt)}
                            >
                                Kiểm tra
                            </Button>
                            <Button
                                size='small'
                                icon={<CopyOutlined />}
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(telegramLink.deepLink || '');
                                        message.success('Đã copy link Telegram');
                                    } catch {
                                        message.warning('Không copy được, hãy bấm Mở Telegram');
                                    }
                                }}
                            >
                                Copy link
                            </Button>
                        </Space>
                    </div>
                ) : null}
            </div>

            {devices.length > 0 ? (
                <div className='mt-4 border-t border-slate-200 pt-3'>
                    <div className='mb-2 flex items-center justify-between gap-2'>
                        <Text className='text-[12px] font-semibold text-slate-800'>Thiết bị nhận thông báo</Text>
                        <Tag className='m-0 rounded-full text-[10px]'>{activeDevices.length} đang bật</Tag>
                    </div>
                    <div className='space-y-2'>
                        {devices.slice(0, 5).map((device) => (
                            <div key={device.id} className='rounded-xl border border-slate-200 bg-white p-3'>
                                <div className='flex items-start justify-between gap-2'>
                                    <div className='min-w-0'>
                                        <div className='flex flex-wrap items-center gap-1.5'>
                                            <Text className='block truncate text-[12px] font-semibold text-slate-900'>
                                                {device.deviceName}
                                            </Text>
                                            <Tag
                                                color={device.isActive ? 'green' : 'default'}
                                                className='m-0 rounded-full text-[10px]'
                                            >
                                                {device.isActive ? 'Đang bật' : 'Đã tắt'}
                                            </Tag>
                                            <Tag
                                                color={device.trusted ? 'blue' : 'orange'}
                                                className='m-0 rounded-full text-[10px]'
                                            >
                                                {device.trusted ? 'Tin cậy' : 'Ẩn chi tiết'}
                                            </Tag>
                                        </div>
                                        <p className='mt-1 mb-0 text-[11px] leading-5 text-slate-500'>
                                            Gửi gần nhất: {formatDateTime(device.lastSuccessAt || device.lastSentAt)}
                                        </p>
                                        {device.failureCount > 0 ? (
                                            <p className='mt-0.5 mb-0 text-[11px] text-amber-600'>
                                                {device.failureCount} lần gửi lỗi gần đây
                                            </p>
                                        ) : null}
                                    </div>
                                    <SafetyCertificateOutlined
                                        className={device.trusted ? 'text-blue-500' : 'text-slate-300'}
                                    />
                                </div>
                                {device.isActive ? (
                                    <div className='mt-2 flex flex-wrap gap-2'>
                                        <Button
                                            size='small'
                                            loading={deviceActionId === device.id}
                                            onClick={() => handleToggleTrust(device)}
                                        >
                                            {device.trusted ? 'Ẩn chi tiết' : 'Tin cậy'}
                                        </Button>
                                        <Button
                                            size='small'
                                            danger
                                            loading={deviceActionId === device.id}
                                            onClick={() => handleDeactivateDevice(device)}
                                        >
                                            Tắt thiết bị
                                        </Button>
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default PushNotificationToggle;
