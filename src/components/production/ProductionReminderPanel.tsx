import {
    BellFilled,
    CheckCircleFilled,
    ClockCircleOutlined,
    MobileOutlined,
    ReloadOutlined,
    SendOutlined,
    SettingOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { pushNotificationService } from '../../core/services/push-notification.service';
import { productionService } from '../../core/services/production.service';
import type { ProductionDay, ProductionReminderEvent } from '../../core/types/production';
import ProductionReminderSettingsDrawer from './ProductionReminderSettingsDrawer';

type Props = {
    plantId: string;
    productionDate: string;
    day?: ProductionDay | null;
    canManage: boolean;
    onFocusSlot: (slotKey: string) => void;
};

const isIosBrowserWithoutPwa = () =>
    typeof window !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );

const effectiveMissingCodes = (event: ProductionReminderEvent, day?: ProductionDay | null) => {
    if (!day) return event.missingLineCodes;
    return event.missingLineCodes.filter((lineCode) => {
        const line = day.lines.find((item) => item.lineCode === lineCode);
        const slot = line?.slotValues.find((item) => item.key === event.slotKey);
        return Boolean(slot?.runId && !slot.reported);
    });
};

const ProductionReminderPanel = ({ plantId, productionDate, day, canManage, onFocusSlot }: Props) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const isToday = productionDate === dayjs().format('YYYY-MM-DD');

    const statusQuery = useQuery({
        queryKey: ['production', 'reminders', 'status', plantId, productionDate],
        queryFn: () => productionService.getReminderStatus(plantId, productionDate),
        enabled: Boolean(plantId && day && isToday),
        refetchInterval: 60_000,
        staleTime: 20_000,
    });

    const pushStateQuery = useQuery({
        queryKey: ['notifications', 'push', 'current-device'],
        queryFn: () => pushNotificationService.getState(),
        enabled: Boolean(day && isToday),
        staleTime: 30_000,
    });

    const openEvents = useMemo(
        () =>
            (statusQuery.data?.events || [])
                .filter((event) => event.state === 'open' && effectiveMissingCodes(event, day).length > 0)
                .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()),
        [day, statusQuery.data?.events]
    );
    const missingLineCodes = useMemo(
        () => [...new Set(openEvents.flatMap((event) => effectiveMissingCodes(event, day)))],
        [day, openEvents]
    );
    const oldest = openEvents[0];
    const rule = statusQuery.data?.rule;
    const currentDeviceReady = Boolean(pushStateQuery.data?.subscribed);
    const accountChannelReady = Boolean(statusQuery.data?.channel.ready);
    const iosGuide = isIosBrowserWithoutPwa();

    const testMutation = useMutation({
        mutationFn: () => productionService.sendReminderTest(plantId),
        onSuccess: (result) => {
            const recipientName = result.recipient?.fullname || 'tài khoản hiện tại';
            if (result.webPushSent > 0) {
                message.success(`Đã gửi Push tới ${recipientName} (${result.webPushSent} thiết bị)`);
            } else if (result.telegramSent > 0) {
                message.success(`Web Push chưa nhận; đã gửi Telegram tới ${recipientName}`);
            } else {
                message.warning(`${recipientName} chưa có kênh ngoài app. Hãy bật thông báo trên điện thoại.`);
            }
        },
        onError: (error) => message.error(error instanceof Error ? error.message : 'Không gửi được thông báo thử'),
    });

    const enableMutation = useMutation({
        mutationFn: () => pushNotificationService.subscribeCurrentDevice('Điện thoại nhập sản lượng'),
        onSuccess: async () => {
            message.success('Đã bật nhắc sản lượng trên thiết bị này');
            await Promise.all([
                pushStateQuery.refetch(),
                queryClient.invalidateQueries({
                    queryKey: ['production', 'reminders', 'status', plantId, productionDate],
                }),
            ]);
        },
        onError: (error) => message.error(error instanceof Error ? error.message : 'Không thể bật thông báo'),
    });

    if (!day || !isToday) return null;

    const focusMissing = () => {
        if (!oldest) return;
        onFocusSlot(oldest.slotKey);
        window.requestAnimationFrame(() => {
            document.querySelector('.pd-mobile-slots, .pd-timeline')?.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                block: 'nearest',
            });
        });
    };

    const tone =
        statusQuery.isError || rule?.enabled === false
            ? 'warning'
            : openEvents.length
              ? openEvents.some((event) => event.escalatedAt)
                  ? 'danger'
                  : 'warning'
              : 'ready';
    const title = statusQuery.isPending
        ? 'Đang kiểm tra kênh nhắc giờ'
        : statusQuery.isError
          ? 'Chưa kiểm tra được nhắc giờ'
          : rule?.enabled === false
            ? 'Nhắc sản lượng đang tắt'
            : openEvents.length
              ? `${missingLineCodes.length} chuyền chưa báo sản lượng`
              : 'Nhắc theo giờ đang hoạt động';
    const description = statusQuery.isPending
        ? 'Đồng bộ trạng thái Web Push và các khung giờ đã đến hạn.'
        : statusQuery.isError
          ? 'Dữ liệu nhập sản vẫn hoạt động bình thường. Chạm thử lại để kiểm tra kênh nhắc.'
          : rule?.enabled === false
            ? 'Quản lý cần bật lại quy tắc trước khi hệ thống gửi cảnh báo.'
            : openEvents.length
              ? `${openEvents.length} khung còn thiếu; cũ nhất ${oldest.slotLabel}. Hệ thống đã nhắc ${oldest.reminderCount} lần.`
              : iosGuide && !currentDeviceReady
                ? 'Trên iPhone: Chia sẻ → Thêm vào Màn hình chính, mở từ icon rồi bật thông báo.'
                : !currentDeviceReady
                  ? accountChannelReady
                      ? 'Tài khoản có kênh dự phòng, nhưng thiết bị này chưa bật Web Push.'
                      : 'Bật thông báo để vẫn nhận lời nhắc khi đóng ứng dụng.'
                  : `Chờ ${rule?.graceMinutes ?? 2} phút sau mỗi khung, nhắc lại mỗi ${rule?.repeatMinutes ?? 5} phút.`;

    return (
        <>
            <section className={`pd-reminder-bar pd-reminder-bar--${tone}`} aria-live='polite'>
                <span className='pd-reminder-bar__signal'>
                    {statusQuery.isError ? (
                        <WarningFilled />
                    ) : openEvents.length ? (
                        <BellFilled />
                    ) : (
                        <CheckCircleFilled />
                    )}
                </span>
                <div className='pd-reminder-bar__copy'>
                    <strong>{title}</strong>
                    <span>{description}</span>
                    {missingLineCodes.length ? <small>{missingLineCodes.slice(0, 8).join(' · ')}</small> : null}
                </div>
                <div className='pd-reminder-bar__actions'>
                    {statusQuery.isError ? (
                        <Button icon={<ReloadOutlined />} onClick={() => statusQuery.refetch()}>
                            Thử lại
                        </Button>
                    ) : null}
                    {oldest ? (
                        <Button type='primary' icon={<ClockCircleOutlined />} onClick={focusMissing}>
                            Nhập ngay
                        </Button>
                    ) : null}
                    {!currentDeviceReady && !iosGuide && pushStateQuery.data?.supported ? (
                        <Button
                            type={oldest ? 'default' : 'primary'}
                            icon={<MobileOutlined />}
                            loading={enableMutation.isPending}
                            onClick={() => enableMutation.mutate()}
                        >
                            Bật trên máy này
                        </Button>
                    ) : null}
                    {iosGuide && !currentDeviceReady ? (
                        <Tooltip title='Mở Safari, bấm Chia sẻ, chọn Thêm vào Màn hình chính rồi mở app từ icon'>
                            <Button
                                icon={<MobileOutlined />}
                                onClick={() =>
                                    message.info(
                                        'Mở bằng Safari, bấm Chia sẻ → Thêm vào Màn hình chính, sau đó mở app từ icon.'
                                    )
                                }
                            >
                                Cách bật iPhone
                            </Button>
                        </Tooltip>
                    ) : null}
                    {!oldest && (currentDeviceReady || accountChannelReady) ? (
                        <Tooltip title='Gửi thử cho tài khoản đang đăng nhập trên thiết bị này'>
                            <Button
                                aria-label='Gửi thử cho tài khoản hiện tại'
                                icon={<SendOutlined />}
                                loading={testMutation.isPending}
                                onClick={() => testMutation.mutate()}
                            />
                        </Tooltip>
                    ) : null}
                    {canManage ? (
                        <Tooltip title='Cài đặt nhắc sản lượng'>
                            <Button
                                aria-label='Cài đặt nhắc sản lượng'
                                icon={<SettingOutlined />}
                                onClick={() => setSettingsOpen(true)}
                            />
                        </Tooltip>
                    ) : null}
                </div>
            </section>
            {canManage ? (
                <ProductionReminderSettingsDrawer
                    open={settingsOpen}
                    plantId={plantId}
                    onClose={() => setSettingsOpen(false)}
                />
            ) : null}
        </>
    );
};

export default ProductionReminderPanel;
