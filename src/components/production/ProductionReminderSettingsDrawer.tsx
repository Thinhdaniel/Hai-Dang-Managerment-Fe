import {
    BellOutlined,
    CheckCircleFilled,
    ClockCircleOutlined,
    MobileOutlined,
    SaveOutlined,
    SendOutlined,
    TeamOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Drawer, Form, InputNumber, Select, Switch, Tag, Tooltip } from 'antd';
import { useEffect } from 'react';
import { useResponsive } from '../../core/hooks/useResponsive';
import { productionService } from '../../core/services/production.service';
import type { ProductionReminderRecipient, UpdateProductionReminderSettingsPayload } from '../../core/types/production';

type Props = {
    open: boolean;
    plantId: string;
    onClose: () => void;
};

type FormValues = Omit<UpdateProductionReminderSettingsPayload, 'plantId'>;

const roleLabel: Record<string, string> = {
    line_leader: 'Tổ trưởng',
    staff: 'Nhân viên',
    manager: 'Quản lý',
};

const recipientChannel = (recipient: ProductionReminderRecipient) => {
    if (recipient.pushDeviceCount > 0 && recipient.telegramLinked) return 'Push + Telegram';
    if (recipient.pushDeviceCount > 0) return `${recipient.pushDeviceCount} thiết bị Push`;
    if (recipient.telegramLinked) return 'Telegram';
    return 'Chưa có kênh ngoài app';
};

const ProductionReminderSettingsDrawer = ({ open, plantId, onClose }: Props) => {
    const { isPhone } = useResponsive();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<FormValues>();

    const settingsQuery = useQuery({
        queryKey: ['production', 'reminders', 'settings', plantId],
        queryFn: () => productionService.getReminderSettings(plantId),
        enabled: open && Boolean(plantId),
        staleTime: 30_000,
    });

    useEffect(() => {
        const rule = settingsQuery.data?.rule;
        if (!rule) return;
        form.setFieldsValue({
            enabled: rule.enabled,
            graceMinutes: rule.graceMinutes,
            repeatMinutes: rule.repeatMinutes,
            escalationMinutes: rule.escalationMinutes,
            escalateToManagers: rule.escalateToManagers,
            telegramFallback: rule.telegramFallback,
            underTargetEnabled: rule.underTargetEnabled,
            underTargetThreshold: rule.underTargetThreshold,
            additionalRecipientIds: rule.additionalRecipientIds,
        });
    }, [form, settingsQuery.data?.rule]);

    const saveMutation = useMutation({
        mutationFn: (values: FormValues) => productionService.updateReminderSettings({ plantId, ...values }),
        onSuccess: async () => {
            message.success('Đã lưu quy tắc nhắc sản lượng');
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['production', 'reminders', 'settings', plantId] }),
                queryClient.invalidateQueries({ queryKey: ['production', 'reminders', 'status', plantId] }),
            ]);
            onClose();
        },
        onError: (error) => message.error(error instanceof Error ? error.message : 'Không thể lưu cấu hình nhắc giờ'),
    });

    const testRecipientMutation = useMutation({
        mutationFn: (recipient: ProductionReminderRecipient) =>
            productionService.sendReminderTest(plantId, recipient.id),
        onSuccess: async (result) => {
            const recipientName = result.recipient?.fullname || 'người nhận';
            if (result.webPushSent > 0) {
                message.success(`Đã gửi Push tới ${recipientName} (${result.webPushSent} thiết bị)`);
            } else if (result.telegramSent > 0) {
                message.success(`Đã gửi Telegram tới ${recipientName}; Web Push chưa khả dụng`);
            } else {
                message.warning(
                    `${recipientName} chưa có kênh ngoài app. Cần bật Push trên điện thoại của tài khoản này.`
                );
            }
            await queryClient.invalidateQueries({ queryKey: ['production', 'reminders', 'settings', plantId] });
        },
        onError: (error) => message.error(error instanceof Error ? error.message : 'Không gửi được thông báo thử'),
    });

    const recipients = settingsQuery.data?.recipients || [];
    const lineLeaders = recipients.filter((recipient) => recipient.role === 'line_leader');
    const selectedAdditionalIds: string[] = Form.useWatch('additionalRecipientIds', form) || [];
    const escalationEnabled = Form.useWatch('escalateToManagers', form) !== false;
    const activeRecipientIds = new Set([
        ...lineLeaders.map((recipient) => recipient.id),
        ...selectedAdditionalIds,
        ...(escalationEnabled
            ? recipients.filter((recipient) => recipient.role === 'manager').map((recipient) => recipient.id)
            : []),
    ]);
    const activeRecipients = recipients.filter((recipient) => activeRecipientIds.has(recipient.id));
    const offlineRecipients = activeRecipients.filter(
        (recipient) => recipient.pushDeviceCount === 0 && !recipient.telegramLinked
    );

    return (
        <Drawer
            open={open}
            onClose={onClose}
            placement={isPhone ? 'bottom' : 'right'}
            height={isPhone ? '92dvh' : undefined}
            width={isPhone ? undefined : 520}
            className='pd-reminder-settings'
            title={
                <div className='pd-reminder-settings__title'>
                    <span className='pd-reminder-settings__title-icon'>
                        <BellOutlined />
                    </span>
                    <span>
                        <strong>Nhắc nhập sản theo giờ</strong>
                        <small>{settingsQuery.data?.plant.name || 'Cấu hình cơ sở'}</small>
                    </span>
                </div>
            }
            footer={
                <div className='pd-reminder-settings__footer'>
                    <Button onClick={onClose}>Đóng</Button>
                    <Button
                        type='primary'
                        icon={<SaveOutlined />}
                        loading={saveMutation.isPending}
                        onClick={() => form.submit()}
                    >
                        Lưu quy tắc
                    </Button>
                </div>
            }
            loading={settingsQuery.isLoading}
            destroyOnHidden
        >
            {settingsQuery.isError ? (
                <Alert
                    type='error'
                    showIcon
                    message='Không tải được cấu hình nhắc giờ'
                    action={<Button onClick={() => settingsQuery.refetch()}>Thử lại</Button>}
                />
            ) : (
                <Form<FormValues>
                    form={form}
                    layout='vertical'
                    requiredMark={false}
                    onFinish={(values) => saveMutation.mutate(values)}
                >
                    <section className='pd-reminder-settings__section pd-reminder-settings__section--lead'>
                        <Form.Item name='enabled' valuePropName='checked' noStyle>
                            <Switch />
                        </Form.Item>
                        <div>
                            <strong>Bật nhắc tự động</strong>
                            <p>Chỉ đánh giá chuyền đã xác nhận nhân sự và có mã hàng chạy trong khung giờ.</p>
                        </div>
                    </section>

                    <section className='pd-reminder-settings__section'>
                        <div className='pd-reminder-settings__section-head'>
                            <ClockCircleOutlined />
                            <span>
                                <strong>Nhịp nhắc</strong>
                                <small>Theo giờ Việt Nam, không nhắc khung chưa kết thúc</small>
                            </span>
                        </div>
                        <div className='pd-reminder-settings__number-grid'>
                            <Form.Item
                                name='graceMinutes'
                                label='Chờ sau khi hết giờ'
                                rules={[{ required: true, message: 'Nhập thời gian chờ' }]}
                            >
                                <InputNumber min={0} max={15} addonAfter='phút' />
                            </Form.Item>
                            <Form.Item
                                name='repeatMinutes'
                                label='Nhắc lại nếu còn thiếu'
                                rules={[{ required: true, message: 'Nhập chu kỳ nhắc' }]}
                            >
                                <InputNumber min={5} max={30} addonAfter='phút' />
                            </Form.Item>
                            <Form.Item
                                name='escalationMinutes'
                                label='Báo quản lý sau'
                                dependencies={['repeatMinutes']}
                                rules={[
                                    { required: true, message: 'Nhập mốc báo quản lý' },
                                    ({ getFieldValue }) => ({
                                        validator: (_, value) =>
                                            Number(value) >= Number(getFieldValue('repeatMinutes') || 5)
                                                ? Promise.resolve()
                                                : Promise.reject(new Error('Phải sau ít nhất một chu kỳ nhắc')),
                                    }),
                                ]}
                            >
                                <InputNumber min={5} max={120} addonAfter='phút' />
                            </Form.Item>
                        </div>
                        <Form.Item name='escalateToManagers' valuePropName='checked' noStyle>
                            <Switch />
                        </Form.Item>
                        <span className='pd-reminder-settings__switch-label'>
                            Gửi cảnh báo cho quản lý cơ sở khi quá hạn
                        </span>
                    </section>

                    <section className='pd-reminder-settings__section'>
                        <div className='pd-reminder-settings__section-head'>
                            <WarningFilled />
                            <span>
                                <strong>Cảnh báo tiến độ</strong>
                                <small>Chỉ gửi một lần sau khi tất cả chuyền đã báo khung giờ</small>
                            </span>
                        </div>
                        <div className='pd-reminder-settings__inline-control'>
                            <Form.Item name='underTargetEnabled' valuePropName='checked' noStyle>
                                <Switch />
                            </Form.Item>
                            <span>Cảnh báo chuyền dưới</span>
                            <Form.Item name='underTargetThreshold' noStyle>
                                <InputNumber min={10} max={100} addonAfter='%' />
                            </Form.Item>
                            <span>khoán giờ</span>
                        </div>
                    </section>

                    <section className='pd-reminder-settings__section'>
                        <div className='pd-reminder-settings__section-head'>
                            <TeamOutlined />
                            <span>
                                <strong>Người nhận</strong>
                                <small>Tổ trưởng nhận mặc định; chọn thêm nhân viên tổng hợp nếu cần</small>
                            </span>
                        </div>
                        <Form.Item name='additionalRecipientIds' label='Người nhận bổ sung'>
                            <Select
                                mode='multiple'
                                allowClear
                                showSearch
                                optionFilterProp='label'
                                placeholder='Chọn nhân viên hoặc quản lý'
                                options={recipients
                                    .filter((recipient) => recipient.role !== 'line_leader')
                                    .map((recipient) => ({
                                        value: recipient.id,
                                        label: `${recipient.fullname} · ${roleLabel[recipient.role] || recipient.role}`,
                                    }))}
                            />
                        </Form.Item>
                        <Form.Item name='telegramFallback' valuePropName='checked' noStyle>
                            <Switch />
                        </Form.Item>
                        <span className='pd-reminder-settings__switch-label'>
                            Dùng Telegram khi Web Push không gửi được
                        </span>

                        <div className='pd-reminder-recipient-list'>
                            {activeRecipients.map((recipient) => {
                                const ready = recipient.pushDeviceCount > 0 || recipient.telegramLinked;
                                const recipientType =
                                    recipient.role === 'line_leader'
                                        ? 'Mặc định'
                                        : selectedAdditionalIds.includes(recipient.id)
                                          ? 'Bổ sung'
                                          : 'Báo quản lý';
                                return (
                                    <div key={recipient.id} className='pd-reminder-recipient'>
                                        <span className={ready ? 'is-ready' : 'is-offline'}>
                                            {ready ? <CheckCircleFilled /> : <MobileOutlined />}
                                        </span>
                                        <div className='pd-reminder-recipient__copy'>
                                            <strong>{recipient.fullname}</strong>
                                            <small>
                                                {recipientType} · {recipientChannel(recipient)}
                                            </small>
                                        </div>
                                        <div className='pd-reminder-recipient__actions'>
                                            <Tag color={ready ? 'success' : 'warning'}>
                                                {ready ? 'Sẵn sàng' : 'Cần bật'}
                                            </Tag>
                                            <Tooltip title={`Gửi thử riêng tới thiết bị của ${recipient.fullname}`}>
                                                <Button
                                                    size='small'
                                                    icon={<SendOutlined />}
                                                    aria-label={`Gửi thử cho ${recipient.fullname}`}
                                                    loading={
                                                        testRecipientMutation.isPending &&
                                                        testRecipientMutation.variables?.id === recipient.id
                                                    }
                                                    disabled={
                                                        testRecipientMutation.isPending &&
                                                        testRecipientMutation.variables?.id !== recipient.id
                                                    }
                                                    onClick={() => testRecipientMutation.mutate(recipient)}
                                                />
                                            </Tooltip>
                                        </div>
                                    </div>
                                );
                            })}
                            {!activeRecipients.length ? (
                                <Alert type='warning' showIcon message='Chưa có tài khoản nào được nhận nhắc giờ' />
                            ) : null}
                        </div>
                        {offlineRecipients.length ? (
                            <p className='pd-reminder-settings__warning'>
                                <SendOutlined /> {offlineRecipients.length} tài khoản chưa có Web Push hoặc Telegram; họ
                                chỉ thấy thông báo khi đang mở app.
                            </p>
                        ) : null}
                    </section>
                </Form>
            )}
        </Drawer>
    );
};

export default ProductionReminderSettingsDrawer;
