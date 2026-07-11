import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
    App,
    Button,
    DatePicker,
    Drawer,
    Empty,
    Form,
    Grid,
    Input,
    InputNumber,
    Modal,
    Select,
    Spin,
    Switch,
    Tabs,
    Tag,
} from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    PlayCircleOutlined,
    ReloadOutlined,
    SettingOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import EChart, { type EChartsCoreOption } from '../charts/EChart';
import type { RealityAlertRule, RealityOperationalAlert, RealityOperationsDashboard } from '../../core/types';

type AlertUpdate = {
    status?: RealityOperationalAlert['status'];
    assignedTo?: string | null;
    dueAt?: string | null;
    resolutionNote?: string;
};

type Props = {
    open: boolean;
    data?: RealityOperationsDashboard;
    loading?: boolean;
    updatingAlertId?: string | null;
    savingRule?: boolean;
    evaluating?: boolean;
    canConfigure: boolean;
    onClose: () => void;
    onUpdateAlert: (alertId: string, data: AlertUpdate) => void;
    onSaveRule: (rule: Partial<RealityAlertRule>) => void;
    onEvaluate: () => void;
};

const SEVERITY_META = {
    critical: { label: 'Khẩn cấp', color: 'red', border: 'border-l-red-500' },
    warning: { label: 'Cảnh báo', color: 'orange', border: 'border-l-amber-500' },
    info: { label: 'Theo dõi', color: 'blue', border: 'border-l-blue-500' },
} as const;

const STATUS_LABEL = {
    open: 'Mới',
    in_progress: 'Đang xử lý',
    resolved: 'Đã giải quyết',
    dismissed: 'Đã bỏ qua',
} as const;

const AlertList: React.FC<{
    alerts: RealityOperationalAlert[];
    managers: RealityOperationsDashboard['managers'];
    updatingAlertId?: string | null;
    onUpdate: Props['onUpdateAlert'];
    onResolve: (alert: RealityOperationalAlert) => void;
}> = ({ alerts, managers, updatingAlertId, onUpdate, onResolve }) => {
    if (!alerts.length)
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có cảnh báo trong nhóm này' />;
    return (
        <div className='divide-y divide-slate-200'>
            {alerts.map((alert) => {
                const severity = SEVERITY_META[alert.severity];
                const overdue =
                    alert.dueAt &&
                    new Date(alert.dueAt) < new Date() &&
                    !['resolved', 'dismissed'].includes(alert.status);
                const active = ['open', 'in_progress'].includes(alert.status);
                return (
                    <section key={alert.id} className={`border-l-4 py-4 pl-3 ${severity.border}`}>
                        <div className='flex flex-wrap items-start justify-between gap-2'>
                            <div className='min-w-0 flex-1'>
                                <div className='flex flex-wrap items-center gap-2'>
                                    <Tag color={severity.color} className='!m-0'>
                                        {severity.label}
                                    </Tag>
                                    <Tag className='!m-0'>{STATUS_LABEL[alert.status]}</Tag>
                                    {overdue ? (
                                        <Tag color='red' className='!m-0'>
                                            Quá hạn
                                        </Tag>
                                    ) : null}
                                </div>
                                <div className='mt-2 leading-5 font-bold text-slate-900'>{alert.title}</div>
                                <div className='mt-1 text-xs leading-5 text-slate-500'>{alert.message}</div>
                            </div>
                            <div className='shrink-0 text-right'>
                                <div className='text-lg font-black text-slate-900'>{alert.assetIds.length}</div>
                                <div className='text-[11px] text-slate-400'>máy liên quan</div>
                            </div>
                        </div>

                        <div className='mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2'>
                            <Select
                                size='small'
                                allowClear
                                placeholder='Giao người phụ trách'
                                value={alert.assignedTo}
                                disabled={!active || updatingAlertId === alert.id}
                                options={managers.map((manager) => ({ value: manager.id, label: manager.name }))}
                                onChange={(value) => onUpdate(alert.id, { assignedTo: value ?? null })}
                            />
                            <DatePicker
                                size='small'
                                className='w-full'
                                placeholder='Hạn xử lý'
                                value={alert.dueAt ? dayjs(alert.dueAt) : null}
                                disabled={!active || updatingAlertId === alert.id}
                                format='DD/MM/YYYY'
                                onChange={(value) =>
                                    onUpdate(alert.id, { dueAt: value?.endOf('day').toISOString() ?? null })
                                }
                            />
                        </div>

                        <div className='mt-3 flex flex-wrap items-center justify-between gap-2'>
                            <div className='text-[11px] text-slate-400'>
                                Phát hiện {new Date(alert.firstDetectedAt).toLocaleString('vi-VN')} · lặp{' '}
                                {alert.occurrenceCount} lần
                            </div>
                            {active ? (
                                <div className='flex gap-2'>
                                    {alert.status === 'open' ? (
                                        <Button
                                            size='small'
                                            icon={<PlayCircleOutlined />}
                                            loading={updatingAlertId === alert.id}
                                            onClick={() => onUpdate(alert.id, { status: 'in_progress' })}
                                        >
                                            Nhận xử lý
                                        </Button>
                                    ) : null}
                                    <Button
                                        size='small'
                                        type='primary'
                                        icon={<CheckCircleOutlined />}
                                        loading={updatingAlertId === alert.id}
                                        onClick={() => onResolve(alert)}
                                    >
                                        Hoàn tất
                                    </Button>
                                </div>
                            ) : alert.resolutionNote ? (
                                <div className='text-xs text-slate-500 italic'>{alert.resolutionNote}</div>
                            ) : null}
                        </div>
                    </section>
                );
            })}
        </div>
    );
};

const RealityOperationsDrawer: React.FC<Props> = ({
    open,
    data,
    loading,
    updatingAlertId,
    savingRule,
    evaluating,
    canConfigure,
    onClose,
    onUpdateAlert,
    onSaveRule,
    onEvaluate,
}) => {
    const screens = Grid.useBreakpoint();
    const isDesktop = Boolean(screens.md);
    const { message } = App.useApp();
    const [historyMode, setHistoryMode] = useState(false);
    const [resolveAlert, setResolveAlert] = useState<RealityOperationalAlert | null>(null);
    const [resolutionNote, setResolutionNote] = useState('');
    const [form] = Form.useForm<RealityAlertRule>();

    useEffect(() => {
        if (data?.rule) form.setFieldsValue(data.rule);
    }, [data?.rule, form]);

    const activeAlerts = useMemo(
        () => (data?.alerts ?? []).filter((alert) => ['open', 'in_progress'].includes(alert.status)),
        [data?.alerts]
    );
    const historyAlerts = useMemo(
        () => (data?.alerts ?? []).filter((alert) => ['resolved', 'dismissed'].includes(alert.status)),
        [data?.alerts]
    );
    const trendOption = useMemo<EChartsCoreOption>(() => {
        const snapshots = [...(data?.snapshots ?? [])].reverse();
        return {
            animationDuration: 500,
            grid: { top: 20, right: 14, bottom: 28, left: 42 },
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: snapshots.map((item) => item.snapshotKey.slice(5)), boundaryGap: false },
            yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%' } },
            series: [
                {
                    type: 'line',
                    smooth: true,
                    data: snapshots.map((item) => item.score),
                    symbolSize: 6,
                    lineStyle: { width: 3, color: '#0891b2' },
                    itemStyle: { color: '#0891b2' },
                    areaStyle: { color: 'rgba(8,145,178,0.10)' },
                },
            ],
        };
    }, [data?.snapshots]);

    const submitRule = async () => {
        try {
            const values = await form.validateFields();
            onSaveRule(values);
        } catch {
            message.warning('Kiểm tra lại các ngưỡng cảnh báo');
        }
    };

    const tabs = [
        {
            key: 'work',
            label: `Công việc (${activeAlerts.length})`,
            children: (
                <div>
                    <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
                        <div className='inline-flex rounded-lg border border-slate-200 p-0.5'>
                            <button
                                type='button'
                                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${!historyMode ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
                                onClick={() => setHistoryMode(false)}
                            >
                                Đang xử lý
                            </button>
                            <button
                                type='button'
                                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${historyMode ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
                                onClick={() => setHistoryMode(true)}
                            >
                                Lịch sử
                            </button>
                        </div>
                        {canConfigure ? (
                            <Button size='small' icon={<ReloadOutlined />} loading={evaluating} onClick={onEvaluate}>
                                Đánh giá ngay
                            </Button>
                        ) : null}
                    </div>
                    <AlertList
                        alerts={historyMode ? historyAlerts : activeAlerts}
                        managers={data?.managers ?? []}
                        updatingAlertId={updatingAlertId}
                        onUpdate={onUpdateAlert}
                        onResolve={(alert) => {
                            setResolveAlert(alert);
                            setResolutionNote('');
                        }}
                    />
                </div>
            ),
        },
        {
            key: 'trend',
            label: 'Xu hướng 90 ngày',
            children: data?.snapshots.length ? (
                <div>
                    <div className='text-sm font-bold text-slate-900'>Độ tin cậy sơ đồ theo ngày</div>
                    <div className='mt-1 text-xs text-slate-500'>
                        Snapshot được cập nhật tối đa một bản mỗi cơ sở mỗi ngày.
                    </div>
                    <EChart option={trendOption} height={300} className='mt-3' />
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có snapshot xu hướng' />
            ),
        },
        ...(canConfigure
            ? [
                  {
                      key: 'settings',
                      label: (
                          <span>
                              <SettingOutlined /> Thiết lập
                          </span>
                      ),
                      children: (
                          <Form form={form} layout='vertical' requiredMark={false}>
                              <div className='mb-4 flex items-center justify-between border-b border-slate-200 pb-3'>
                                  <div>
                                      <div className='font-bold text-slate-900'>Bật cảnh báo vận hành</div>
                                      <div className='text-xs text-slate-500'>
                                          Tắt rule vẫn tiếp tục lưu snapshot hằng ngày.
                                      </div>
                                  </div>
                                  <Form.Item name='enabled' valuePropName='checked' noStyle>
                                      <Switch />
                                  </Form.Item>
                              </div>
                              <div className='grid grid-cols-1 gap-x-4 sm:grid-cols-2'>
                                  <Form.Item
                                      name='minScore'
                                      label='Điểm tin cậy tối thiểu'
                                      rules={[{ required: true }]}
                                  >
                                      <InputNumber min={0} max={100} addonAfter='%' className='w-full' />
                                  </Form.Item>
                                  <Form.Item name='staleDays' label='Bằng chứng cũ sau' rules={[{ required: true }]}>
                                      <InputNumber min={7} max={180} addonAfter='ngày' className='w-full' />
                                  </Form.Item>
                                  <Form.Item
                                      name='driftThreshold'
                                      label='Cảnh báo khi sai vùng từ'
                                      rules={[{ required: true }]}
                                  >
                                      <InputNumber min={1} max={1000} addonAfter='máy' className='w-full' />
                                  </Form.Item>
                                  <Form.Item
                                      name='stalePercentThreshold'
                                      label='Tỷ lệ dữ liệu cũ tối đa'
                                      rules={[{ required: true }]}
                                  >
                                      <InputNumber min={1} max={100} addonAfter='%' className='w-full' />
                                  </Form.Item>
                                  <Form.Item
                                      name='coverageOverdueDays'
                                      label='Quá hạn coverage sau'
                                      rules={[{ required: true }]}
                                  >
                                      <InputNumber min={1} max={365} addonAfter='ngày' className='w-full' />
                                  </Form.Item>
                                  <Form.Item
                                      name='proposalOverdueDays'
                                      label='Proposal chờ duyệt quá'
                                      rules={[{ required: true }]}
                                  >
                                      <InputNumber min={1} max={90} addonAfter='ngày' className='w-full' />
                                  </Form.Item>
                                  <Form.Item
                                      name='cooldownHours'
                                      label='Thời gian chống gửi lặp'
                                      rules={[{ required: true }]}
                                  >
                                      <InputNumber min={1} max={168} addonAfter='giờ' className='w-full' />
                                  </Form.Item>
                                  <Form.Item name='defaultAssignee' label='Người phụ trách mặc định'>
                                      <Select
                                          allowClear
                                          options={(data?.managers ?? []).map((item) => ({
                                              value: item.id,
                                              label: item.name,
                                          }))}
                                      />
                                  </Form.Item>
                              </div>
                              <div className='flex justify-end'>
                                  <Button type='primary' loading={savingRule} onClick={submitRule}>
                                      Lưu thiết lập
                                  </Button>
                              </div>
                          </Form>
                      ),
                  },
              ]
            : []),
    ];

    return (
        <>
            <Drawer
                open={open}
                onClose={onClose}
                placement={isDesktop ? 'right' : 'bottom'}
                width={isDesktop ? 760 : undefined}
                height={isDesktop ? undefined : '92vh'}
                title={
                    <div>
                        <div className='font-bold text-slate-900'>Reality Operations</div>
                        <div className='text-xs font-normal text-slate-500'>
                            Cảnh báo, giao việc và xu hướng độ tin cậy
                        </div>
                    </div>
                }
                styles={{
                    body: { padding: isDesktop ? 20 : 14 },
                    content: { borderRadius: isDesktop ? 0 : '18px 18px 0 0' },
                }}
            >
                {loading ? (
                    <div className='flex min-h-64 items-center justify-center'>
                        <Spin />
                    </div>
                ) : data ? (
                    <div>
                        <div className='mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4'>
                            {[
                                ['Mới', data.summary.open, <WarningOutlined key='a' />],
                                ['Đang xử lý', data.summary.inProgress, <PlayCircleOutlined key='b' />],
                                ['Quá hạn', data.summary.overdue, <ClockCircleOutlined key='c' />],
                                ['Đã giải quyết', data.summary.resolved, <CheckCircleOutlined key='d' />],
                            ].map(([label, value, icon]) => (
                                <div key={String(label)} className='border-b-2 border-slate-200 px-2 py-2'>
                                    <div className='flex items-center justify-between text-slate-400'>
                                        {icon}
                                        <span className='text-xl font-black text-slate-900'>{value}</span>
                                    </div>
                                    <div className='mt-1 text-xs font-semibold text-slate-500'>{label}</div>
                                </div>
                            ))}
                        </div>
                        <Tabs items={tabs} destroyOnHidden />
                    </div>
                ) : (
                    <Empty description='Không tải được dữ liệu vận hành' />
                )}
            </Drawer>

            <Modal
                open={Boolean(resolveAlert)}
                title='Xác nhận đã giải quyết'
                okText='Hoàn tất công việc'
                cancelText='Hủy'
                confirmLoading={Boolean(resolveAlert && updatingAlertId === resolveAlert.id)}
                onCancel={() => setResolveAlert(null)}
                onOk={() => {
                    if (!resolveAlert) return;
                    onUpdateAlert(resolveAlert.id, {
                        status: 'resolved',
                        resolutionNote: resolutionNote.trim() || 'Đã kiểm tra và xử lý',
                    });
                    setResolveAlert(null);
                }}
            >
                <div className='mb-3 text-sm text-slate-600'>{resolveAlert?.title}</div>
                <Input.TextArea
                    rows={3}
                    maxLength={500}
                    showCount
                    placeholder='Ghi lại cách đã xử lý hoặc kết quả kiểm tra'
                    value={resolutionNote}
                    onChange={(event) => setResolutionNote(event.target.value)}
                />
            </Modal>
        </>
    );
};

export default RealityOperationsDrawer;
