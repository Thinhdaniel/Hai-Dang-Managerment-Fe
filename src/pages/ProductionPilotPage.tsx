import {
    AuditOutlined,
    CheckCircleFilled,
    ClockCircleOutlined,
    ExclamationCircleFilled,
    ExperimentOutlined,
    FileExcelOutlined,
    FlagOutlined,
    LockOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    PlusOutlined,
    SafetyCertificateOutlined,
    SyncOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    App,
    Button,
    DatePicker,
    Empty,
    Form,
    Input,
    InputNumber,
    Modal,
    Progress,
    Segmented,
    Select,
    Skeleton,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productionErrorMessage } from '../core/lib/production-error';
import { useAuth } from '../core/contexts/AuthContext';
import { hasDirectorAccess } from '../core/lib/permissions';
import { productionPlantLabel } from '../core/lib/productionAccess';
import { plantService } from '../core/services/plant.service';
import { productionService } from '../core/services/production.service';
import type {
    ProductionPilotChecklistItem,
    ProductionPilotChecklistStatus,
    ProductionPilotDay,
    ProductionPilotDayStatus,
    ProductionPilotLimitation,
    ProductionPilotLimitationSeverity,
    ProductionPilotLimitationStatus,
    ProductionPilotMetricKey,
    ProductionPilotMetrics,
    ProductionPilotRun,
    ProductionPilotStatus,
} from '../core/types/production';

const { Text, Title } = Typography;
const today = () => dayjs().format('YYYY-MM-DD');
const number = (value = 0) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
const dateLabel = (value: string) => dayjs(value).format('DD/MM/YYYY');
const weekdayLabel = (value: string) =>
    ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][dayjs(value).day()];
const errorMessage = (error: unknown) => productionErrorMessage(error, 'Không thể thực hiện thao tác');

const statusMeta: Record<ProductionPilotStatus, { label: string; color: string }> = {
    draft: { label: 'Bản nháp', color: 'default' },
    active: { label: 'Đang shadow run', color: 'blue' },
    paused: { label: 'Tạm dừng', color: 'orange' },
    ready_for_signoff: { label: 'Sẵn sàng nghiệm thu', color: 'green' },
    accepted: { label: 'Đã nghiệm thu', color: 'green' },
    cancelled: { label: 'Đã hủy', color: 'red' },
};

const dayStatusMeta: Record<ProductionPilotDayStatus, { label: string; tone: string }> = {
    pending_system: { label: 'Chưa chụp hệ thống', tone: 'neutral' },
    pending_reference: { label: 'Chờ số Excel', tone: 'neutral' },
    matched: { label: 'Đã khớp', tone: 'success' },
    variance: { label: 'Có sai lệch', tone: 'danger' },
    accepted_variance: { label: 'Ngoại lệ đã duyệt', tone: 'warning' },
};

const checklistMeta: Record<ProductionPilotChecklistStatus, { label: string; color: string }> = {
    pending: { label: 'Chưa kiểm thử', color: 'default' },
    passed: { label: 'Đạt', color: 'green' },
    failed: { label: 'Không đạt', color: 'red' },
    blocked: { label: 'Đang bị chặn', color: 'orange' },
    not_applicable: { label: 'Không áp dụng', color: 'blue' },
};

const limitationMeta: Record<ProductionPilotLimitationSeverity, { label: string; color: string }> = {
    critical: { label: 'Nghiêm trọng', color: 'red' },
    high: { label: 'Cao', color: 'volcano' },
    medium: { label: 'Trung bình', color: 'gold' },
    low: { label: 'Thấp', color: 'blue' },
};

const metricMeta: Record<ProductionPilotMetricKey, { label: string; suffix?: string }> = {
    actualOutput: { label: 'Sản lượng thực tế', suffix: 'SP' },
    plannedOutput: { label: 'Sản lượng kế hoạch', suffix: 'SP' },
    openOrders: { label: 'Đơn đang mở', suffix: 'đơn' },
    capacityUtilizationPercent: { label: 'Sử dụng năng lực', suffix: '%' },
    materialBlockedOrders: { label: 'Đơn chặn vật tư', suffix: 'đơn' },
    forecastLateOrders: { label: 'Dự báo trễ', suffix: 'đơn' },
};

const workingDates = (run?: ProductionPilotRun) => {
    if (!run) return [];
    const result: string[] = [];
    let cursor = dayjs(run.startDate);
    const end = dayjs(run.targetEndDate);
    while (!cursor.isAfter(end, 'day') && result.length < 60) {
        if (cursor.day() !== 0) result.push(cursor.format('YYYY-MM-DD'));
        cursor = cursor.add(1, 'day');
    }
    return result;
};

const ProductionPilotPage = () => {
    const [searchParams] = useSearchParams();
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const { user, role } = useAuth();
    const [plantId, setPlantId] = useState(
        (hasDirectorAccess(role) ? searchParams.get('plantId') : null) || user?.plantId || ''
    );
    const [selectedId, setSelectedId] = useState('');
    const [section, setSection] = useState<'shadow' | 'uat' | 'risk'>('shadow');
    const [createOpen, setCreateOpen] = useState(false);
    const [referenceDay, setReferenceDay] = useState<string>();
    const [varianceDay, setVarianceDay] = useState<ProductionPilotDay>();
    const [checklistItem, setChecklistItem] = useState<ProductionPilotChecklistItem>();
    const [limitationOpen, setLimitationOpen] = useState(false);
    const [signoffOpen, setSignoffOpen] = useState(false);
    const [createForm] = Form.useForm();
    const [referenceForm] = Form.useForm();
    const [varianceForm] = Form.useForm();
    const [checklistForm] = Form.useForm();
    const [limitationForm] = Form.useForm();
    const [signoffForm] = Form.useForm();
    const canSignoff = hasDirectorAccess(role);

    const plantsQuery = useQuery({ queryKey: ['plants'], queryFn: () => plantService.getAll(), staleTime: 300_000 });
    const visiblePlants = useMemo(
        () =>
            canSignoff
                ? plantsQuery.data || []
                : (plantsQuery.data || []).filter((plant) => plant.id === user?.plantId),
        [canSignoff, plantsQuery.data, user?.plantId]
    );
    useEffect(() => {
        if (!plantId) setPlantId(user?.plantId || plantsQuery.data?.[0]?.id || '');
    }, [plantId, plantsQuery.data, user?.plantId]);

    const listQuery = useQuery({
        queryKey: ['production', 'pilot-runs', plantId],
        queryFn: () => productionService.getPilotRuns(plantId),
        enabled: Boolean(plantId),
    });
    useEffect(() => {
        const items = listQuery.data?.items || [];
        if (selectedId && items.some((item) => item.id === selectedId)) return;
        const preferred = items.find((item) => ['active', 'ready_for_signoff'].includes(item.status)) || items[0];
        setSelectedId(preferred?.id || '');
    }, [listQuery.data, selectedId]);

    const detailQuery = useQuery({
        queryKey: ['production', 'pilot-run', selectedId],
        queryFn: () => productionService.getPilotRun(selectedId),
        enabled: Boolean(selectedId),
    });
    const run = detailQuery.data;

    const acceptRun = (next: ProductionPilotRun, success: string) => {
        queryClient.setQueryData(['production', 'pilot-run', next.id], next);
        void queryClient.invalidateQueries({ queryKey: ['production', 'pilot-runs', next.plantId] });
        message.success(success);
    };
    const mutationError = (error: unknown) => {
        message.error(errorMessage(error));
        if (selectedId) void queryClient.invalidateQueries({ queryKey: ['production', 'pilot-run', selectedId] });
    };

    const createMutation = useMutation({
        mutationFn: (values: {
            name: string;
            sourceFileName?: string;
            sourceDescription?: string;
            period: [Dayjs, Dayjs];
            minimumShadowDays: number;
            quantityVariancePercent: number;
            capacityVariancePoints: number;
            countVariance: number;
        }) =>
            productionService.createPilotRun({
                plantId,
                name: values.name,
                sourceFileName: values.sourceFileName,
                sourceDescription: values.sourceDescription,
                startDate: values.period[0].format('YYYY-MM-DD'),
                targetEndDate: values.period[1].format('YYYY-MM-DD'),
                thresholds: {
                    minimumShadowDays: values.minimumShadowDays,
                    quantityVariancePercent: values.quantityVariancePercent,
                    capacityVariancePoints: values.capacityVariancePoints,
                    countVariance: values.countVariance,
                },
            }),
        onSuccess: (next) => {
            setCreateOpen(false);
            createForm.resetFields();
            setSelectedId(next.id);
            acceptRun(next, 'Đã tạo hồ sơ pilot');
        },
        onError: mutationError,
    });

    const statusMutation = useMutation({
        mutationFn: ({ status, note }: { status: 'active' | 'paused' | 'cancelled'; note?: string }) =>
            productionService.updatePilotStatus(run!.id, run!.revision, status, note),
        onSuccess: (next) => acceptRun(next, 'Đã cập nhật trạng thái pilot'),
        onError: mutationError,
    });
    const captureMutation = useMutation({
        mutationFn: () => productionService.capturePilotDay(run!.id, run!.revision, today()),
        onSuccess: (next) => acceptRun(next, 'Đã chụp số hệ thống hôm nay'),
        onError: mutationError,
    });
    const referenceMutation = useMutation({
        mutationFn: (values: ProductionPilotMetrics & { sourceSheet?: string; note?: string }) =>
            productionService.savePilotReference(run!.id, referenceDay!, run!.revision, values),
        onSuccess: (next) => {
            setReferenceDay(undefined);
            referenceForm.resetFields();
            acceptRun(next, 'Đã đối chiếu với số Excel');
        },
        onError: mutationError,
    });
    const varianceMutation = useMutation({
        mutationFn: ({ note }: { note: string }) =>
            productionService.acceptPilotVariance(run!.id, varianceDay!.date, run!.revision, note),
        onSuccess: (next) => {
            setVarianceDay(undefined);
            varianceForm.resetFields();
            acceptRun(next, 'Đã ghi nhận ngoại lệ có giải trình');
        },
        onError: mutationError,
    });
    const checklistMutation = useMutation({
        mutationFn: ({ status, evidence }: { status: ProductionPilotChecklistStatus; evidence: string }) =>
            productionService.updatePilotChecklist(run!.id, checklistItem!.code, run!.revision, status, evidence),
        onSuccess: (next) => {
            setChecklistItem(undefined);
            checklistForm.resetFields();
            acceptRun(next, 'Đã cập nhật kết quả UAT');
        },
        onError: mutationError,
    });
    const limitationMutation = useMutation({
        mutationFn: (values: {
            title: string;
            impact: string;
            mitigation?: string;
            owner?: string;
            dueDate?: Dayjs;
            severity: ProductionPilotLimitationSeverity;
        }) =>
            productionService.addPilotLimitation(run!.id, run!.revision, {
                ...values,
                dueDate: values.dueDate?.format('YYYY-MM-DD'),
                status: 'open',
            }),
        onSuccess: (next) => {
            setLimitationOpen(false);
            limitationForm.resetFields();
            acceptRun(next, 'Đã thêm giới hạn cần quản lý');
        },
        onError: mutationError,
    });
    const limitationStatusMutation = useMutation({
        mutationFn: ({ item, status }: { item: ProductionPilotLimitation; status: ProductionPilotLimitationStatus }) =>
            productionService.updatePilotLimitation(run!.id, item.id, run!.revision, { status }),
        onSuccess: (next) => acceptRun(next, 'Đã cập nhật trạng thái giới hạn'),
        onError: mutationError,
    });
    const signoffMutation = useMutation({
        mutationFn: ({ note }: { note: string }) => productionService.signoffPilotRun(run!.id, run!.revision, note),
        onSuccess: (next) => {
            setSignoffOpen(false);
            signoffForm.resetFields();
            acceptRun(next, 'Đã ký nghiệm thu pilot');
        },
        onError: mutationError,
    });

    const daysByDate = useMemo(() => new Map((run?.days || []).map((day) => [day.date, day])), [run?.days]);
    const dates = useMemo(() => workingDates(run), [run]);
    const checklistPercent = run?.summary.checklistTotal
        ? Math.round((run.summary.checklistCompleted / run.summary.checklistTotal) * 100)
        : 0;
    const shadowPercent = run
        ? Math.min(100, Math.round((run.summary.reconciledDays / run.summary.minimumShadowDays) * 100))
        : 0;

    const openReference = (date: string, day?: ProductionPilotDay) => {
        setReferenceDay(date);
        referenceForm.setFieldsValue(
            day?.reference || {
                actualOutput: day?.systemSnapshot?.actualOutput,
                plannedOutput: day?.systemSnapshot?.plannedOutput,
                openOrders: day?.systemSnapshot?.openOrders,
                capacityUtilizationPercent: day?.systemSnapshot?.capacityUtilizationPercent,
                materialBlockedOrders: day?.systemSnapshot?.materialBlockedOrders,
                forecastLateOrders: day?.systemSnapshot?.forecastLateOrders,
            }
        );
    };

    const confirmCancel = () =>
        modal.confirm({
            title: 'Hủy đợt pilot?',
            content: 'Hồ sơ và bằng chứng vẫn được giữ nhưng không thể tiếp tục chụp số.',
            okText: 'Hủy đợt pilot',
            cancelText: 'Giữ lại',
            okButtonProps: { danger: true },
            onOk: () => statusMutation.mutate({ status: 'cancelled', note: 'Hủy pilot theo quyết định người dùng' }),
        });

    return (
        <div className='production-pilot-page'>
            <header className='production-pilot-header'>
                <div>
                    <Text className='production-page-eyebrow'>Triển khai có kiểm soát</Text>
                    <Title level={2}>Pilot & UAT Center</Title>
                    <Text>Chạy song song Excel, lưu bằng chứng và khóa điều kiện trước khi rollout.</Text>
                </div>
                <div className='production-pilot-header__actions'>
                    <Select
                        value={plantId || undefined}
                        onChange={(value) => {
                            setPlantId(value);
                            setSelectedId('');
                        }}
                        options={visiblePlants.map((plant) => ({
                            value: plant.id,
                            label: productionPlantLabel(plant),
                        }))}
                        placeholder='Chọn cơ sở'
                        loading={plantsQuery.isLoading}
                        disabled={!canSignoff}
                    />
                    <Select
                        value={selectedId || undefined}
                        onChange={setSelectedId}
                        options={(listQuery.data?.items || []).map((item) => ({
                            value: item.id,
                            label: `${item.code} · ${item.name}`,
                        }))}
                        placeholder='Chọn đợt pilot'
                        allowClear
                    />
                    <Button
                        type='primary'
                        icon={<PlusOutlined />}
                        onClick={() => setCreateOpen(true)}
                        disabled={!plantId}
                    >
                        Tạo đợt pilot
                    </Button>
                </div>
            </header>

            {detailQuery.isLoading ? (
                <Skeleton active paragraph={{ rows: 12 }} />
            ) : listQuery.isError || detailQuery.isError ? (
                <Alert
                    type='error'
                    showIcon
                    title='Không tải được dữ liệu pilot'
                    description={errorMessage(listQuery.error || detailQuery.error)}
                    action={
                        <Button onClick={() => void (listQuery.isError ? listQuery.refetch() : detailQuery.refetch())}>
                            Thử lại
                        </Button>
                    }
                />
            ) : !run ? (
                <section className='production-pilot-empty'>
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có hồ sơ pilot cho cơ sở này' />
                    <Button type='primary' icon={<ExperimentOutlined />} onClick={() => setCreateOpen(true)}>
                        Thiết lập shadow run 10 ngày
                    </Button>
                </section>
            ) : (
                <>
                    <section className='production-pilot-command'>
                        <div className='production-pilot-command__identity'>
                            <div className='production-pilot-code'>{run.code}</div>
                            <div>
                                <strong>{run.name}</strong>
                                <span>
                                    {dateLabel(run.startDate)} – {dateLabel(run.targetEndDate)} ·{' '}
                                    {run.sourceFileName || 'Nguồn Excel chưa đặt tên'}
                                </span>
                            </div>
                        </div>
                        <div className='production-pilot-command__actions'>
                            <Tag color={statusMeta[run.status].color}>{statusMeta[run.status].label}</Tag>
                            {run.status === 'draft' || run.status === 'paused' ? (
                                <Button
                                    type='primary'
                                    icon={<PlayCircleOutlined />}
                                    loading={statusMutation.isPending}
                                    onClick={() => statusMutation.mutate({ status: 'active' })}
                                >
                                    {run.status === 'draft' ? 'Bắt đầu pilot' : 'Tiếp tục'}
                                </Button>
                            ) : null}
                            {['active', 'ready_for_signoff'].includes(run.status) ? (
                                <Button
                                    icon={<PauseCircleOutlined />}
                                    loading={statusMutation.isPending}
                                    onClick={() =>
                                        statusMutation.mutate({ status: 'paused', note: 'Tạm dừng để xử lý dữ liệu' })
                                    }
                                >
                                    Tạm dừng
                                </Button>
                            ) : null}
                            {!['accepted', 'cancelled'].includes(run.status) ? (
                                <Button danger onClick={confirmCancel}>
                                    Hủy
                                </Button>
                            ) : null}
                        </div>
                    </section>

                    <section className='production-pilot-kpis' aria-label='Tiến độ nghiệm thu'>
                        <div>
                            <span>Ngày đã đối soát</span>
                            <strong>
                                {run.summary.reconciledDays}/{run.summary.minimumShadowDays}
                            </strong>
                            <Progress percent={shadowPercent} showInfo={false} size='small' />
                        </div>
                        <div>
                            <span>Ngày khớp tuyệt đối</span>
                            <strong>{run.summary.matchedDays}</strong>
                            <small>{run.summary.acceptedVarianceDays} ngày ngoại lệ được duyệt</small>
                        </div>
                        <div className={run.summary.varianceDays ? 'is-danger' : ''}>
                            <span>Sai lệch chưa xử lý</span>
                            <strong>{run.summary.varianceDays}</strong>
                            <small>{run.summary.pendingDays} ngày còn thiếu dữ liệu</small>
                        </div>
                        <div>
                            <span>Checklist UAT</span>
                            <strong>
                                {run.summary.checklistCompleted}/{run.summary.checklistTotal}
                            </strong>
                            <Progress percent={checklistPercent} showInfo={false} size='small' />
                        </div>
                        <div className={run.summary.blockingLimitations ? 'is-danger' : ''}>
                            <span>Rủi ro đang chặn</span>
                            <strong>{run.summary.blockingLimitations}</strong>
                            <small>Mức nghiêm trọng hoặc cao</small>
                        </div>
                    </section>

                    <section className={`production-pilot-gate ${run.summary.eligibleForSignoff ? 'is-ready' : ''}`}>
                        <div className='production-pilot-gate__icon'>
                            {run.summary.eligibleForSignoff ? <SafetyCertificateOutlined /> : <LockOutlined />}
                        </div>
                        <div>
                            <strong>
                                {run.summary.eligibleForSignoff ? 'Đã mở khóa nghiệm thu' : 'Gate nghiệm thu đang khóa'}
                            </strong>
                            <span>
                                Hệ thống chỉ mở ký khi đủ ngày shadow run, toàn bộ checklist bắt buộc đạt và không còn
                                rủi ro chặn.
                            </span>
                        </div>
                        <div className='production-pilot-gate__checks'>
                            <span className={run.summary.shadowDaysPassed ? 'is-done' : ''}>10 ngày đối soát</span>
                            <span className={run.summary.checklistPassed ? 'is-done' : ''}>Checklist UAT</span>
                            <span className={!run.summary.blockingLimitations ? 'is-done' : ''}>
                                Không còn rủi ro chặn
                            </span>
                        </div>
                    </section>

                    <Segmented
                        className='production-pilot-sections'
                        value={section}
                        onChange={(value) => setSection(value as typeof section)}
                        options={[
                            { value: 'shadow', label: 'Đối soát hằng ngày', icon: <FileExcelOutlined /> },
                            { value: 'uat', label: 'Checklist UAT', icon: <AuditOutlined /> },
                            { value: 'risk', label: 'Rủi ro & nghiệm thu', icon: <FlagOutlined /> },
                        ]}
                        block
                    />

                    {section === 'shadow' ? (
                        <section className='production-pilot-workspace'>
                            <div className='production-pilot-section-heading'>
                                <div>
                                    <Title level={4}>Nhật ký shadow run</Title>
                                    <Text>
                                        Ảnh chụp hệ thống được khóa theo thời điểm; số Excel là nguồn đối chứng độc lập.
                                    </Text>
                                </div>
                                <Button
                                    type='primary'
                                    icon={<SyncOutlined />}
                                    loading={captureMutation.isPending}
                                    disabled={
                                        !['active', 'ready_for_signoff'].includes(run.status) ||
                                        !dates.includes(today())
                                    }
                                    onClick={() => captureMutation.mutate()}
                                >
                                    Chụp số hôm nay
                                </Button>
                            </div>
                            <Alert
                                type='info'
                                showIcon
                                message='Chụp số vào cuối ngày sau khi tổ trưởng đã báo đủ'
                                description={`Ngưỡng: sản lượng ±${run.thresholds.quantityVariancePercent}%, năng lực ±${run.thresholds.capacityVariancePoints} điểm %, số lượng đơn phải lệch không quá ${run.thresholds.countVariance}.`}
                            />
                            <div className='production-pilot-day-list'>
                                {dates.map((date, index) => {
                                    const day = daysByDate.get(date);
                                    const meta = dayStatusMeta[day?.status || 'pending_system'];
                                    const failed = day?.comparisons.filter((row) => !row.passed) || [];
                                    const isFuture = date > today();
                                    return (
                                        <article className={`production-pilot-day is-${meta.tone}`} key={date}>
                                            <div className='production-pilot-day__date'>
                                                <span>Ngày {index + 1}</span>
                                                <strong>{dateLabel(date)}</strong>
                                                <small>{weekdayLabel(date)}</small>
                                            </div>
                                            <div className='production-pilot-day__state'>
                                                <span className={`pilot-state is-${meta.tone}`}>{meta.label}</span>
                                                {day?.systemSnapshot ? (
                                                    <small>
                                                        Chụp {dayjs(day.systemSnapshot.capturedAt).format('HH:mm')}
                                                    </small>
                                                ) : null}
                                            </div>
                                            <div className='production-pilot-day__numbers'>
                                                <div>
                                                    <span>Hệ thống</span>
                                                    <strong>
                                                        {day?.systemSnapshot
                                                            ? `${number(day.systemSnapshot.actualOutput)} SP`
                                                            : '—'}
                                                    </strong>
                                                    <small>
                                                        {day?.systemSnapshot
                                                            ? `${number(day.systemSnapshot.plannedOutput)} SP kế hoạch`
                                                            : 'Chưa có snapshot'}
                                                    </small>
                                                </div>
                                                <div>
                                                    <span>Excel</span>
                                                    <strong>
                                                        {day?.reference
                                                            ? `${number(day.reference.actualOutput)} SP`
                                                            : '—'}
                                                    </strong>
                                                    <small>
                                                        {day?.reference
                                                            ? `${number(day.reference.plannedOutput)} SP kế hoạch`
                                                            : 'Chưa nhập đối chứng'}
                                                    </small>
                                                </div>
                                            </div>
                                            <div className='production-pilot-day__variance'>
                                                {failed.length ? (
                                                    <Tooltip
                                                        title={failed
                                                            .map((row) => metricMeta[row.key].label)
                                                            .join(', ')}
                                                    >
                                                        <span>
                                                            <WarningOutlined /> {failed.length} chỉ số lệch
                                                        </span>
                                                    </Tooltip>
                                                ) : day?.status === 'matched' ? (
                                                    <span className='is-ok'>
                                                        <CheckCircleFilled /> Trong ngưỡng
                                                    </span>
                                                ) : (
                                                    <span>Chưa đủ dữ liệu</span>
                                                )}
                                            </div>
                                            <div className='production-pilot-day__actions'>
                                                {!isFuture && run.status !== 'accepted' ? (
                                                    <Button size='small' onClick={() => openReference(date, day)}>
                                                        {day?.reference ? 'Sửa số Excel' : 'Nhập số Excel'}
                                                    </Button>
                                                ) : null}
                                                {date === today() &&
                                                ['active', 'ready_for_signoff'].includes(run.status) ? (
                                                    <Button
                                                        size='small'
                                                        onClick={() => captureMutation.mutate()}
                                                        loading={captureMutation.isPending}
                                                    >
                                                        {day?.systemSnapshot ? 'Chụp lại' : 'Chụp hệ thống'}
                                                    </Button>
                                                ) : null}
                                                {day?.status === 'variance' ? (
                                                    <Button
                                                        size='small'
                                                        type='link'
                                                        danger
                                                        onClick={() => setVarianceDay(day)}
                                                    >
                                                        Giải trình
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    ) : null}

                    {section === 'uat' ? (
                        <section className='production-pilot-workspace'>
                            <div className='production-pilot-section-heading'>
                                <div>
                                    <Title level={4}>Bộ kiểm thử nghiệm thu</Title>
                                    <Text>
                                        Mỗi kết quả phải có bằng chứng; không đánh dấu đạt chỉ để hoàn thành tiến độ.
                                    </Text>
                                </div>
                                <div className='production-pilot-progress-ring'>
                                    <Progress type='circle' percent={checklistPercent} size={58} />
                                </div>
                            </div>
                            <div className='production-pilot-checklist'>
                                {(run.checklist || []).map((item) => (
                                    <button
                                        type='button'
                                        key={item.code}
                                        className={`production-pilot-check is-${item.status}`}
                                        onClick={() => {
                                            setChecklistItem(item);
                                            checklistForm.setFieldsValue({
                                                status: item.status,
                                                evidence: item.evidence,
                                            });
                                        }}
                                    >
                                        <span className='production-pilot-check__icon'>
                                            {item.status === 'passed' ? (
                                                <CheckCircleFilled />
                                            ) : item.status === 'failed' ? (
                                                <ExclamationCircleFilled />
                                            ) : (
                                                <ClockCircleOutlined />
                                            )}
                                        </span>
                                        <span className='production-pilot-check__body'>
                                            <small>
                                                {item.category} · {item.code}
                                            </small>
                                            <strong>{item.title}</strong>
                                            <em>{item.evidence || 'Chưa có bằng chứng kiểm thử'}</em>
                                        </span>
                                        <Tag color={checklistMeta[item.status].color}>
                                            {checklistMeta[item.status].label}
                                        </Tag>
                                    </button>
                                ))}
                            </div>
                        </section>
                    ) : null}

                    {section === 'risk' ? (
                        <section className='production-pilot-workspace'>
                            <div className='production-pilot-section-heading'>
                                <div>
                                    <Title level={4}>Known limitations & quyết định rollout</Title>
                                    <Text>Ghi rõ tác động, người xử lý và biện pháp giảm thiểu trước khi ký.</Text>
                                </div>
                                <Button
                                    icon={<PlusOutlined />}
                                    onClick={() => setLimitationOpen(true)}
                                    disabled={run.status === 'accepted'}
                                >
                                    Thêm giới hạn
                                </Button>
                            </div>
                            <div className='production-pilot-risk-layout'>
                                <div className='production-pilot-limitations'>
                                    {(run.knownLimitations || []).length ? (
                                        (run.knownLimitations || []).map((item) => (
                                            <article
                                                key={item.id}
                                                className={`production-pilot-limitation is-${item.severity}`}
                                            >
                                                <div>
                                                    <Tag color={limitationMeta[item.severity].color}>
                                                        {limitationMeta[item.severity].label}
                                                    </Tag>
                                                    <strong>{item.title}</strong>
                                                    <p>{item.impact}</p>
                                                    <small>
                                                        {item.mitigation || 'Chưa có biện pháp giảm thiểu'}
                                                        {item.owner ? ` · Phụ trách: ${item.owner}` : ''}
                                                    </small>
                                                </div>
                                                <Select
                                                    size='small'
                                                    value={item.status}
                                                    disabled={
                                                        run.status === 'accepted' || limitationStatusMutation.isPending
                                                    }
                                                    onChange={(status) =>
                                                        limitationStatusMutation.mutate({ item, status })
                                                    }
                                                    options={[
                                                        { value: 'open', label: 'Đang mở' },
                                                        { value: 'mitigated', label: 'Đã giảm thiểu' },
                                                        { value: 'accepted', label: 'Chấp nhận rủi ro' },
                                                        { value: 'resolved', label: 'Đã xử lý' },
                                                    ]}
                                                />
                                            </article>
                                        ))
                                    ) : (
                                        <Empty
                                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                                            description='Chưa ghi nhận giới hạn nào'
                                        />
                                    )}
                                </div>
                                <aside
                                    className={`production-pilot-signoff ${run.summary.eligibleForSignoff ? 'is-ready' : ''}`}
                                >
                                    <SafetyCertificateOutlined />
                                    <Title level={4}>
                                        {run.signoff ? 'Pilot đã được nghiệm thu' : 'Quyết định chuyển nguồn sự thật'}
                                    </Title>
                                    {run.signoff ? (
                                        <>
                                            <Tag color='green'>UAT v{run.signoff.version} · ĐÃ KÝ</Tag>
                                            <p>{run.signoff.note}</p>
                                            <small>
                                                {run.signoff.signedBy?.name} ·{' '}
                                                {dayjs(run.signoff.signedAt).format('DD/MM/YYYY HH:mm')}
                                            </small>
                                        </>
                                    ) : (
                                        <>
                                            <p>
                                                Chỉ ký sau khi đã xem số đối soát, bằng chứng kiểm thử và phương án
                                                rollback.
                                            </p>
                                            <Button
                                                type='primary'
                                                icon={<SafetyCertificateOutlined />}
                                                disabled={!run.summary.eligibleForSignoff || !canSignoff}
                                                onClick={() => setSignoffOpen(true)}
                                            >
                                                Ký nghiệm thu UAT
                                            </Button>
                                            {!canSignoff ? <small>Chờ Giám đốc hoặc Super Admin ký.</small> : null}
                                        </>
                                    )}
                                </aside>
                            </div>
                        </section>
                    ) : null}
                </>
            )}

            <Modal
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                title='Thiết lập đợt pilot'
                okText='Tạo hồ sơ'
                cancelText='Đóng'
                confirmLoading={createMutation.isPending}
                onOk={() => createForm.submit()}
                width={680}
            >
                <Form
                    form={createForm}
                    layout='vertical'
                    initialValues={{
                        period: [dayjs(), dayjs().add(13, 'day')],
                        minimumShadowDays: 10,
                        quantityVariancePercent: 2,
                        capacityVariancePoints: 3,
                        countVariance: 0,
                    }}
                    onFinish={(values) => createMutation.mutate(values)}
                >
                    <Form.Item name='name' label='Tên đợt pilot' rules={[{ required: true, min: 3 }]}>
                        <Input placeholder='Ví dụ: Pilot kế hoạch sản xuất CS1 - tháng 9' />
                    </Form.Item>
                    <div className='production-pilot-form-grid'>
                        <Form.Item name='period' label='Thời gian shadow run' rules={[{ required: true }]}>
                            <DatePicker.RangePicker format='DD/MM/YYYY' allowClear={false} />
                        </Form.Item>
                        <Form.Item name='sourceFileName' label='File Excel đối chứng'>
                            <Input placeholder='KE_HOACH_SAN_XUAT_CS1.xlsx' />
                        </Form.Item>
                    </div>
                    <Form.Item name='sourceDescription' label='Quy ước nguồn số'>
                        <Input.TextArea
                            rows={2}
                            placeholder='Tên sheet, giờ chốt số và người chịu trách nhiệm file Excel'
                        />
                    </Form.Item>
                    <div className='production-pilot-thresholds'>
                        <Form.Item name='minimumShadowDays' label='Số ngày tối thiểu'>
                            <InputNumber min={1} max={60} />
                        </Form.Item>
                        <Form.Item name='quantityVariancePercent' label='Sai lệch sản lượng (%)'>
                            <InputNumber min={0} max={100} />
                        </Form.Item>
                        <Form.Item name='capacityVariancePoints' label='Sai lệch năng lực (điểm %)'>
                            <InputNumber min={0} max={100} />
                        </Form.Item>
                        <Form.Item name='countVariance' label='Sai lệch số đơn'>
                            <InputNumber min={0} max={1000} />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>

            <Modal
                open={Boolean(referenceDay)}
                onCancel={() => setReferenceDay(undefined)}
                title={`Số Excel đối chứng · ${referenceDay ? dateLabel(referenceDay) : ''}`}
                okText='Lưu và đối soát'
                cancelText='Đóng'
                confirmLoading={referenceMutation.isPending}
                onOk={() => referenceForm.submit()}
                width={720}
            >
                <Form form={referenceForm} layout='vertical' onFinish={(values) => referenceMutation.mutate(values)}>
                    <Alert
                        type='warning'
                        showIcon
                        message='Nhập đúng số trong file cũ, không sao chép số hệ thống để làm đẹp kết quả.'
                    />
                    <div className='production-pilot-reference-grid'>
                        {(Object.keys(metricMeta) as ProductionPilotMetricKey[]).map((key) => (
                            <Form.Item key={key} name={key} label={metricMeta[key].label} rules={[{ required: true }]}>
                                <InputNumber
                                    min={0}
                                    precision={key === 'capacityUtilizationPercent' ? 1 : 0}
                                    addonAfter={metricMeta[key].suffix}
                                />
                            </Form.Item>
                        ))}
                    </div>
                    <div className='production-pilot-form-grid'>
                        <Form.Item name='sourceSheet' label='Sheet / vùng dữ liệu'>
                            <Input placeholder='Sheet Tổng hợp, dòng 25' />
                        </Form.Item>
                        <Form.Item name='note' label='Ghi chú'>
                            <Input placeholder='Số chốt lúc 18:10' />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>

            <Modal
                open={Boolean(varianceDay)}
                onCancel={() => setVarianceDay(undefined)}
                title='Chấp nhận sai lệch có kiểm soát'
                okText='Ghi nhận ngoại lệ'
                okButtonProps={{ danger: true }}
                confirmLoading={varianceMutation.isPending}
                onOk={() => varianceForm.submit()}
            >
                <div className='production-pilot-variance-list'>
                    {varianceDay?.comparisons
                        .filter((row) => !row.passed)
                        .map((row) => (
                            <div key={row.key}>
                                <span>{metricMeta[row.key].label}</span>
                                <strong>
                                    {number(row.systemValue)} ↔ {number(row.referenceValue)}
                                </strong>
                                <em>
                                    Lệch {number(row.difference)} · {number(row.variancePercent)}%
                                </em>
                            </div>
                        ))}
                </div>
                <Form form={varianceForm} layout='vertical' onFinish={(values) => varianceMutation.mutate(values)}>
                    <Form.Item
                        name='note'
                        label='Nguyên nhân và căn cứ chấp nhận'
                        rules={[{ required: true, min: 10 }]}
                    >
                        <Input.TextArea
                            rows={3}
                            placeholder='Nêu rõ nguồn lệch, người xác minh và cách xử lý sau pilot'
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                open={Boolean(checklistItem)}
                onCancel={() => setChecklistItem(undefined)}
                title={checklistItem?.title}
                okText='Lưu bằng chứng'
                cancelText='Đóng'
                confirmLoading={checklistMutation.isPending}
                onOk={() => checklistForm.submit()}
            >
                <Form form={checklistForm} layout='vertical' onFinish={(values) => checklistMutation.mutate(values)}>
                    <Form.Item name='status' label='Kết quả' rules={[{ required: true }]}>
                        <Select
                            options={Object.entries(checklistMeta).map(([value, meta]) => ({
                                value,
                                label: meta.label,
                            }))}
                        />
                    </Form.Item>
                    <Form.Item
                        name='evidence'
                        label='Bằng chứng / kết quả thực hiện'
                        rules={[{ required: true, min: 5 }]}
                    >
                        <Input.TextArea
                            rows={4}
                            placeholder='Mô tả dữ liệu thử, kết quả, người xác minh hoặc liên kết biên bản'
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                open={limitationOpen}
                onCancel={() => setLimitationOpen(false)}
                title='Thêm known limitation'
                okText='Thêm vào hồ sơ'
                cancelText='Đóng'
                confirmLoading={limitationMutation.isPending}
                onOk={() => limitationForm.submit()}
            >
                <Form form={limitationForm} layout='vertical' onFinish={(values) => limitationMutation.mutate(values)}>
                    <Form.Item name='title' label='Giới hạn' rules={[{ required: true, min: 3 }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name='impact' label='Tác động nghiệp vụ' rules={[{ required: true, min: 5 }]}>
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <Form.Item name='mitigation' label='Biện pháp giảm thiểu'>
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <div className='production-pilot-form-grid'>
                        <Form.Item name='severity' label='Mức độ' rules={[{ required: true }]}>
                            <Select
                                options={Object.entries(limitationMeta).map(([value, meta]) => ({
                                    value,
                                    label: meta.label,
                                }))}
                            />
                        </Form.Item>
                        <Form.Item name='owner' label='Người phụ trách'>
                            <Input />
                        </Form.Item>
                    </div>
                    <Form.Item name='dueDate' label='Hạn xử lý'>
                        <DatePicker format='DD/MM/YYYY' />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                open={signoffOpen}
                onCancel={() => setSignoffOpen(false)}
                title='Ký nghiệm thu UAT'
                okText='Ký và chốt pilot'
                cancelText='Đóng'
                confirmLoading={signoffMutation.isPending}
                onOk={() => signoffForm.submit()}
            >
                <Alert type='success' showIcon message='Hồ sơ đã vượt qua toàn bộ gate tự động.' />
                <Form form={signoffForm} layout='vertical' onFinish={(values) => signoffMutation.mutate(values)}>
                    <Form.Item
                        name='note'
                        label='Kết luận nghiệm thu và phạm vi rollout'
                        rules={[{ required: true, min: 10 }]}
                    >
                        <Input.TextArea
                            rows={4}
                            placeholder='Chấp thuận chuyển nguồn dữ liệu chính thức cho cơ sở/phạm vi nào...'
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default ProductionPilotPage;
