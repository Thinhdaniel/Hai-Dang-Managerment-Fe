import {
    ArrowRightOutlined,
    CheckCircleFilled,
    ClockCircleOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    ReloadOutlined,
    StopOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    App,
    Button,
    DatePicker,
    Drawer,
    Empty,
    Form,
    Input,
    InputNumber,
    Modal,
    Progress,
    Select,
    Skeleton,
    Tag,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { productionService } from '../core/services/production.service';
import type {
    ProductionRolloutAction,
    ProductionRolloutFacility,
    ProductionRolloutStage,
} from '../core/types/production';

const stageMeta: Record<
    ProductionRolloutStage,
    { label: string; description: string; color: string; icon: React.ReactNode }
> = {
    disabled: {
        label: 'Chưa triển khai',
        description: 'Chưa mở dữ liệu Production',
        color: 'default',
        icon: <StopOutlined />,
    },
    preparing: {
        label: 'Đang chuẩn bị',
        description: 'Chuẩn hóa dữ liệu và nhân sự',
        color: 'processing',
        icon: <ClockCircleOutlined />,
    },
    pilot: {
        label: 'Chạy thử',
        description: 'Vận hành song song và đối soát',
        color: 'blue',
        icon: <PlayCircleOutlined />,
    },
    live: {
        label: 'Đang vận hành',
        description: 'Đã nghiệm thu và mở chính thức',
        color: 'success',
        icon: <CheckCircleFilled />,
    },
    paused: {
        label: 'Tạm dừng',
        description: 'Khóa truy cập, giữ nguyên dữ liệu',
        color: 'warning',
        icon: <PauseCircleOutlined />,
    },
};

const nextStages: Record<ProductionRolloutStage, ProductionRolloutStage[]> = {
    disabled: ['preparing'],
    preparing: ['pilot', 'disabled'],
    pilot: ['live', 'paused', 'preparing'],
    live: ['paused'],
    paused: ['live', 'pilot', 'preparing', 'disabled'],
};

const actionMeta: Record<ProductionRolloutAction, { label: string; to: string }> = {
    setup: { label: 'Cấu hình', to: '/production' },
    users: { label: 'Người dùng', to: '/users' },
    orders: { label: 'Đơn hàng', to: '/production/orders' },
    materials: { label: 'BOM vật tư', to: '/production/materials' },
    planning: { label: 'Kế hoạch', to: '/production/planning' },
    pilot: { label: 'Pilot & UAT', to: '/production/pilot' },
};

type TransitionForm = {
    toStage: ProductionRolloutStage;
    reason: string;
    wave?: number;
    plannedGoLiveDate?: Dayjs;
    ownerName?: string;
};

const dateTime = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : 'Chưa có');
const dateOnly = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY') : 'Chưa đặt');
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể cập nhật triển khai');

const ProductionRolloutPage = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<TransitionForm>();
    const [selected, setSelected] = useState<ProductionRolloutFacility>();
    const [detail, setDetail] = useState<ProductionRolloutFacility>();
    const [transitionOpen, setTransitionOpen] = useState(false);
    const targetStage = Form.useWatch('toStage', form);

    const portfolioQuery = useQuery({
        queryKey: ['production', 'rollout'],
        queryFn: productionService.getRolloutPortfolio,
        staleTime: 15_000,
    });

    const transitionMutation = useMutation({
        mutationFn: async (values: TransitionForm) => {
            if (!selected) throw new Error('Chưa chọn cơ sở');
            return productionService.transitionRollout(selected.plant.id, {
                revision: selected.revision,
                toStage: values.toStage,
                reason: values.reason,
                wave: values.wave,
                plannedGoLiveDate: values.plannedGoLiveDate?.format('YYYY-MM-DD') || null,
                ownerName: values.ownerName?.trim() || null,
            });
        },
        onSuccess: (facility) => {
            message.success(`Đã chuyển ${facility.plant.name} sang ${stageMeta[facility.stage].label}`);
            setTransitionOpen(false);
            setSelected(undefined);
            form.resetFields();
            void queryClient.invalidateQueries({ queryKey: ['production', 'rollout'] });
            void queryClient.invalidateQueries({ queryKey: ['production-access'] });
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const summary = portfolioQuery.data?.summary;
    const facilities = portfolioQuery.data?.facilities || [];
    const waves = useMemo(
        () =>
            Array.from(
                new Set(facilities.map((item) => item.wave).filter((value): value is number => Boolean(value)))
            ).sort((left, right) => left - right),
        [facilities]
    );

    const openTransition = (facility: ProductionRolloutFacility, toStage?: ProductionRolloutStage) => {
        setSelected(facility);
        form.setFieldsValue({
            toStage: toStage || nextStages[facility.stage][0],
            wave: facility.wave,
            ownerName: facility.ownerName,
            plannedGoLiveDate: facility.plannedGoLiveDate ? dayjs(facility.plannedGoLiveDate) : undefined,
            reason: '',
        });
        setTransitionOpen(true);
    };

    if (portfolioQuery.isPending) {
        return <Skeleton active paragraph={{ rows: 12 }} className='production-rollout-loading' />;
    }

    return (
        <div className='production-rollout-page'>
            <header className='production-rollout-header'>
                <div>
                    <span className='production-rollout-eyebrow'>QUẢN TRỊ TRIỂN KHAI</span>
                    <h1>Rollout Production đa cơ sở</h1>
                    <p>Mở từng nhà máy theo readiness gate, có lịch sử quyết định và đường lui rõ ràng.</p>
                </div>
                <Button
                    icon={<ReloadOutlined />}
                    loading={portfolioQuery.isFetching}
                    onClick={() => void portfolioQuery.refetch()}
                >
                    Làm mới
                </Button>
            </header>

            {portfolioQuery.isError ? (
                <Alert
                    type='error'
                    showIcon
                    title='Không tải được trung tâm triển khai'
                    description={errorMessage(portfolioQuery.error)}
                />
            ) : null}

            <section className='production-rollout-kpis' aria-label='Tổng quan triển khai'>
                <article className='is-primary'>
                    <span>Cơ sở đang vận hành</span>
                    <strong>
                        {summary?.byStage.live || 0}/{summary?.totalPlants || 0}
                    </strong>
                    <small>{summary?.enabledPlants || 0} cơ sở đang mở quyền Production</small>
                </article>
                <article>
                    <span>Đang chuẩn bị / pilot</span>
                    <strong>{(summary?.byStage.preparing || 0) + (summary?.byStage.pilot || 0)}</strong>
                    <small>{summary?.byStage.paused || 0} cơ sở đang tạm dừng</small>
                </article>
                <article>
                    <span>Đủ điều kiện pilot</span>
                    <strong>{summary?.pilotReady || 0}</strong>
                    <small>Đã qua toàn bộ gate nền tảng</small>
                </article>
                <article>
                    <span>Đủ điều kiện chạy thật</span>
                    <strong>{summary?.liveReady || 0}</strong>
                    <small>Bao gồm kế hoạch và ký UAT</small>
                </article>
            </section>

            <section className='production-rollout-flow' aria-label='Luồng triển khai chuẩn'>
                {(['disabled', 'preparing', 'pilot', 'live'] as ProductionRolloutStage[]).map((stage, index) => (
                    <div className={`production-rollout-flow__step is-${stage}`} key={stage}>
                        <span>{index + 1}</span>
                        <div>
                            <strong>{stageMeta[stage].label}</strong>
                            <small>{stageMeta[stage].description}</small>
                        </div>
                        {index < 3 ? <ArrowRightOutlined /> : null}
                    </div>
                ))}
            </section>

            {waves.length ? (
                <div className='production-rollout-wave-note'>
                    Đợt đã lập: {waves.map((wave) => `Wave ${wave}`).join(' · ')}
                </div>
            ) : null}

            <section className='production-rollout-grid'>
                {facilities.map((facility) => {
                    const meta = stageMeta[facility.stage];
                    const percent = Math.round((facility.readiness.passedCount / facility.readiness.totalCount) * 100);
                    const primaryTarget = nextStages[facility.stage][0];
                    return (
                        <article className={`production-rollout-card is-${facility.stage}`} key={facility.plant.id}>
                            <div className='production-rollout-card__head'>
                                <div>
                                    <span className='production-rollout-plant-code'>{facility.plant.code}</span>
                                    <h2>{facility.plant.name}</h2>
                                </div>
                                <Tag icon={meta.icon} color={meta.color}>
                                    {meta.label}
                                </Tag>
                            </div>

                            <div className='production-rollout-card__meta'>
                                <span>
                                    <small>ĐỢT</small>
                                    <strong>{facility.wave ? `Wave ${facility.wave}` : 'Chưa xếp'}</strong>
                                </span>
                                <span>
                                    <small>GO-LIVE</small>
                                    <strong>{dateOnly(facility.plannedGoLiveDate)}</strong>
                                </span>
                                <span>
                                    <small>PHỤ TRÁCH</small>
                                    <strong>{facility.ownerName || 'Chưa giao'}</strong>
                                </span>
                            </div>

                            <div className='production-rollout-readiness'>
                                <div>
                                    <span>Mức sẵn sàng</span>
                                    <strong>
                                        {facility.readiness.passedCount}/{facility.readiness.totalCount}
                                    </strong>
                                </div>
                                <Progress
                                    percent={percent}
                                    showInfo={false}
                                    strokeColor={facility.readiness.liveReady ? '#0f8a5f' : '#3159d9'}
                                />
                            </div>

                            <div className='production-rollout-gates'>
                                <span className={facility.readiness.pilotReady ? 'is-passed' : ''}>
                                    {facility.readiness.pilotReady ? <CheckCircleFilled /> : <WarningFilled />} Gate
                                    pilot
                                </span>
                                <span className={facility.readiness.liveReady ? 'is-passed' : ''}>
                                    {facility.readiness.liveReady ? <CheckCircleFilled /> : <WarningFilled />} Gate vận
                                    hành
                                </span>
                            </div>

                            <div className='production-rollout-card__foot'>
                                <Button onClick={() => setDetail(facility)}>Xem readiness</Button>
                                <Button
                                    type={facility.stage === 'live' ? 'default' : 'primary'}
                                    danger={primaryTarget === 'paused'}
                                    icon={primaryTarget === 'paused' ? <PauseCircleOutlined /> : <ArrowRightOutlined />}
                                    onClick={() => openTransition(facility, primaryTarget)}
                                >
                                    {primaryTarget === 'paused' ? 'Tạm dừng' : `Sang ${stageMeta[primaryTarget].label}`}
                                </Button>
                            </div>
                        </article>
                    );
                })}
            </section>

            {!facilities.length ? <Empty description='Chưa có cơ sở để triển khai' /> : null}

            <Drawer
                open={Boolean(detail)}
                onClose={() => setDetail(undefined)}
                width={560}
                title={detail ? `${detail.plant.code} · ${detail.plant.name}` : 'Readiness'}
                className='production-rollout-drawer'
                extra={detail ? <Tag color={stageMeta[detail.stage].color}>{stageMeta[detail.stage].label}</Tag> : null}
            >
                {detail ? (
                    <>
                        <Alert
                            type={
                                detail.readiness.liveReady
                                    ? 'success'
                                    : detail.readiness.pilotReady
                                      ? 'info'
                                      : 'warning'
                            }
                            showIcon
                            title={
                                detail.readiness.liveReady
                                    ? 'Đủ điều kiện vận hành chính thức'
                                    : detail.readiness.pilotReady
                                      ? 'Đủ điều kiện bắt đầu pilot'
                                      : 'Còn hạng mục phải hoàn thiện'
                            }
                            description='Các gate được tính trực tiếp từ dữ liệu hiện có, không đánh dấu thủ công.'
                        />
                        <div className='production-rollout-checklist'>
                            {detail.readiness.checks.map((check) => (
                                <div className={check.passed ? 'is-passed' : 'is-blocked'} key={check.code}>
                                    <span className='production-rollout-checklist__icon'>
                                        {check.passed ? <CheckCircleFilled /> : <WarningFilled />}
                                    </span>
                                    <span>
                                        <strong>{check.label}</strong>
                                        <small>
                                            {check.requiredFor === 'pilot'
                                                ? 'Bắt buộc trước pilot'
                                                : 'Bắt buộc trước go-live'}
                                        </small>
                                    </span>
                                    <b>{check.value || 0}</b>
                                    {!check.passed ? (
                                        <Link to={actionMeta[check.action].to}>{actionMeta[check.action].label}</Link>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                        <div className='production-rollout-audit'>
                            <h3>Lịch sử quyết định</h3>
                            {detail.history.length ? (
                                detail.history.map((entry) => (
                                    <div key={entry.id}>
                                        <span className='production-rollout-audit__dot' />
                                        <p>
                                            <strong>
                                                {stageMeta[entry.fromStage].label} → {stageMeta[entry.toStage].label}
                                            </strong>
                                            <small>
                                                {entry.actorName} · {dateTime(entry.at)}
                                            </small>
                                            <em>{entry.reason}</em>
                                        </p>
                                    </div>
                                ))
                            ) : (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description='Chưa có lần chuyển giai đoạn'
                                />
                            )}
                        </div>
                    </>
                ) : null}
            </Drawer>

            <Modal
                open={transitionOpen}
                onCancel={() => setTransitionOpen(false)}
                onOk={() => void form.validateFields().then((values) => transitionMutation.mutate(values))}
                confirmLoading={transitionMutation.isPending}
                okText='Xác nhận chuyển giai đoạn'
                cancelText='Hủy'
                title={selected ? `Điều phối ${selected.plant.name}` : 'Chuyển giai đoạn'}
                width={620}
                destroyOnHidden
            >
                {selected ? (
                    <Form form={form} layout='vertical' className='production-rollout-transition-form'>
                        <div className='production-rollout-transition-path'>
                            <Tag color={stageMeta[selected.stage].color}>{stageMeta[selected.stage].label}</Tag>
                            <ArrowRightOutlined />
                            <Form.Item name='toStage' noStyle>
                                <Select
                                    options={nextStages[selected.stage].map((stage) => ({
                                        value: stage,
                                        label: stageMeta[stage].label,
                                    }))}
                                />
                            </Form.Item>
                        </div>
                        <Alert
                            type={targetStage === 'paused' ? 'warning' : 'info'}
                            showIcon
                            title={
                                targetStage === 'paused'
                                    ? 'Tạm dừng sẽ khóa quyền Production tại cơ sở'
                                    : 'Hệ thống sẽ kiểm tra gate trước khi chuyển'
                            }
                            description={
                                targetStage === 'paused'
                                    ? 'Toàn bộ dữ liệu cũ vẫn được giữ nguyên và có thể khôi phục sau.'
                                    : 'Không thể bỏ qua dữ liệu nền, nhân sự, kế hoạch hoặc biên bản nghiệm thu bắt buộc.'
                            }
                        />
                        <div className='production-rollout-transition-grid'>
                            <Form.Item name='wave' label='Đợt triển khai'>
                                <InputNumber min={1} max={100} className='w-full' placeholder='Ví dụ: 2' />
                            </Form.Item>
                            <Form.Item name='plannedGoLiveDate' label='Ngày dự kiến chạy thật'>
                                <DatePicker format='DD/MM/YYYY' className='w-full' />
                            </Form.Item>
                        </div>
                        <Form.Item name='ownerName' label='Người phụ trách'>
                            <Input maxLength={160} placeholder='Họ tên đầu mối triển khai tại cơ sở' />
                        </Form.Item>
                        <Form.Item
                            name='reason'
                            label='Căn cứ quyết định'
                            rules={[{ required: true, min: 10, message: 'Nêu căn cứ tối thiểu 10 ký tự' }]}
                        >
                            <Input.TextArea
                                rows={4}
                                maxLength={500}
                                showCount
                                placeholder='Ghi rõ kết quả kiểm tra, quyết định và phạm vi áp dụng...'
                            />
                        </Form.Item>
                    </Form>
                ) : null}
            </Modal>
        </div>
    );
};

export default ProductionRolloutPage;
