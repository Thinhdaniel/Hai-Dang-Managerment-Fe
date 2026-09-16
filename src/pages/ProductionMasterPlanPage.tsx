import {
    ApartmentOutlined,
    CalendarOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleFilled,
    ReloadOutlined,
    RightOutlined,
    ThunderboltOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    App,
    Button,
    Checkbox,
    DatePicker,
    Empty,
    Progress,
    Segmented,
    Select,
    Skeleton,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import dayjs from 'dayjs';
import viVN from 'antd/locale/vi_VN';
import { productionWeekStart as mondayOf } from '../core/lib/production-calendar';
import { productionErrorMessage } from '../core/lib/production-error';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MasterPlanApplyModal from '../components/production/MasterPlanApplyModal';
import { useAuth } from '../core/contexts/AuthContext';
import { useResponsive } from '../core/hooks/useResponsive';
import { useSocket } from '../core/hooks/useSocket';
import { isAdmin, isDirector } from '../core/lib/permissions';
import { productionPlantLabel } from '../core/lib/productionAccess';
import { plantService } from '../core/services/plant.service';
import { productionService } from '../core/services/production.service';
import type {
    ProductionCapacityOrderRisk,
    ProductionCapacitySuggestion,
    ProductionMasterPlanPreview,
    ProductionMasterPlanSuggestionInput,
} from '../core/types/production';

const { Text, Title } = Typography;
const number = (value = 0) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
const errorMessage = (error: unknown) => productionErrorMessage(error, 'Không thể tải mô phỏng kế hoạch tổng thể');

type SuggestedBlock = ProductionCapacitySuggestion & {
    orderId: string;
    orderCode: string;
    itemCode: string;
    dueDate: string;
    hourlyRate: number;
    materialBlocked: boolean;
};

const isMaterialBlocked = (order: ProductionCapacityOrderRisk) =>
    order.materialStatus !== 'unknown' &&
    (order.materialStatus !== 'ready' || order.materialReservationStatus !== 'reserved');

const suggestionKey = (suggestion: Pick<SuggestedBlock, 'orderId' | 'date' | 'lineId'>) =>
    `${suggestion.orderId}|${suggestion.date}|${suggestion.lineId}`;

const suggestionStatus = (order: ProductionCapacityOrderRisk) => {
    if (order.unallocatedQuantity > 0) return { label: 'Chưa tìm đủ chỗ', color: 'red' };
    if (order.suggestedAfterDueQuantity > 0) return { label: 'Có phần sau hạn', color: 'volcano' };
    if (order.simulatedQuantity > 0) return { label: 'Có phương án', color: 'blue' };
    return { label: 'Đã có lịch', color: 'green' };
};

const ProductionMasterPlanPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const { user, role } = useAuth();
    const { socket } = useSocket();
    const { isCompact: isMobile } = useResponsive();
    const [plantId, setPlantId] = useState(searchParams.get('plantId') || user?.plantId || '');
    const [startDate, setStartDate] = useState(() => mondayOf(dayjs()));
    const [weeks, setWeeks] = useState(2);
    const [mobileWeek, setMobileWeek] = useState(0);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
    const [applyPreview, setApplyPreview] = useState<ProductionMasterPlanPreview | null>(null);
    const canSwitchPlant = isAdmin(role) || isDirector(role);

    const plantsQuery = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        staleTime: 5 * 60_000,
    });
    useEffect(() => {
        if (plantId) return;
        const preferred = user?.plantId || plantsQuery.data?.[0]?.id;
        if (preferred) setPlantId(preferred);
    }, [plantId, plantsQuery.data, user?.plantId]);

    const capacityQuery = useQuery({
        queryKey: ['production', 'capacity', plantId, startDate.format('YYYY-MM-DD'), weeks],
        queryFn: () => productionService.getCapacity({ plantId, startDate: startDate.format('YYYY-MM-DD'), weeks }),
        enabled: Boolean(plantId),
        refetchInterval: 60_000,
    });
    const report = capacityQuery.data;

    useEffect(() => {
        if (!socket) return;
        const refresh = (payload: { plantId?: string }) => {
            if (!payload.plantId || payload.plantId === plantId) {
                void queryClient.invalidateQueries({ queryKey: ['production', 'capacity'] });
            }
        };
        socket.on('production:order-updated', refresh);
        socket.on('production:plan-updated', refresh);
        socket.on('production:updated', refresh);
        return () => {
            socket.off('production:order-updated', refresh);
            socket.off('production:plan-updated', refresh);
            socket.off('production:updated', refresh);
        };
    }, [plantId, queryClient, socket]);

    const visibleDays = useMemo(
        () => (!report ? [] : isMobile ? report.days.slice(mobileWeek * 7, mobileWeek * 7 + 7) : report.days),
        [isMobile, mobileWeek, report]
    );
    const suggestionsByCell = useMemo(() => {
        const grouped = new Map<string, SuggestedBlock[]>();
        (report?.orders || []).forEach((order) => {
            (order.suggestedAllocations || []).forEach((suggestion) => {
                const key = `${suggestion.lineId}|${suggestion.date}`;
                const rows = grouped.get(key) || [];
                rows.push({
                    ...suggestion,
                    orderId: order.id,
                    orderCode: order.code,
                    itemCode: order.itemCode,
                    dueDate: order.dueDate,
                    hourlyRate: order.hourlyRate,
                    materialBlocked: isMaterialBlocked(order),
                });
                grouped.set(key, rows);
            });
        });
        return grouped;
    }, [report]);
    const allSuggestions = useMemo(
        () =>
            (report?.orders || []).flatMap((order) =>
                (order.suggestedAllocations || []).map((suggestion) => ({
                    ...suggestion,
                    orderId: order.id,
                    orderCode: order.code,
                    itemCode: order.itemCode,
                    dueDate: order.dueDate,
                    hourlyRate: order.hourlyRate,
                    materialBlocked: isMaterialBlocked(order),
                }))
            ),
        [report]
    );
    const suggestionByKey = useMemo(
        () => new Map(allSuggestions.map((suggestion) => [suggestionKey(suggestion), suggestion])),
        [allSuggestions]
    );
    const actionableSuggestions = useMemo(
        () => allSuggestions.filter((suggestion) => !suggestion.materialBlocked),
        [allSuggestions]
    );
    const selectedSuggestions = useMemo(
        () =>
            [...selectedKeys]
                .map((key) => suggestionByKey.get(key))
                .filter((suggestion): suggestion is SuggestedBlock => Boolean(suggestion)),
        [selectedKeys, suggestionByKey]
    );
    const selectedQuantity = selectedSuggestions.reduce((sum, suggestion) => sum + suggestion.quantity, 0);
    const toApplyInput = (suggestion: SuggestedBlock): ProductionMasterPlanSuggestionInput => ({
        orderId: suggestion.orderId,
        date: suggestion.date,
        lineId: suggestion.lineId,
        quantity: Math.max(1, Math.floor(suggestion.quantity + 0.0001)),
        hourlyQuota: suggestion.hourlyRate,
    });
    const queue = useMemo(
        () =>
            (report?.orders || []).filter(
                (order) => order.simulatedQuantity > 0 || order.unallocatedQuantity > 0 || order.uncoveredByDue > 0
            ),
        [report]
    );

    useEffect(() => {
        setSelectedKeys(new Set());
        setApplyPreview(null);
    }, [plantId, startDate, weeks]);

    const previewMutation = useMutation({
        mutationFn: (suggestions: ProductionMasterPlanSuggestionInput[]) =>
            productionService.previewMasterPlan(plantId, suggestions),
        onSuccess: setApplyPreview,
        onError: (error) => message.error(errorMessage(error)),
    });
    const applyMutation = useMutation({
        mutationFn: ({
            suggestions,
            fingerprint,
        }: {
            suggestions: ProductionMasterPlanSuggestionInput[];
            fingerprint: string;
        }) => productionService.applyMasterPlan(plantId, suggestions, fingerprint),
        onSuccess: async (result) => {
            setApplyPreview(null);
            setSelectedKeys(new Set());
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['production', 'capacity'] }),
                queryClient.invalidateQueries({ queryKey: ['production', 'plan'] }),
                queryClient.invalidateQueries({ queryKey: ['production', 'orders'] }),
            ]);
            message.success(
                `Đã tạo ${result.allocationCount} phân bổ, ${number(result.quantity)} SP trong kế hoạch nháp`
            );
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const toggleSuggestion = (key: string, checked: boolean) => {
        setSelectedKeys((current) => {
            const next = new Set(current);
            if (checked) next.add(key);
            else next.delete(key);
            return next;
        });
    };
    const selectAllSuggestions = () => setSelectedKeys(new Set(actionableSuggestions.map(suggestionKey)));
    const reviewSelection = () => {
        if (!selectedSuggestions.length) return;
        previewMutation.mutate(selectedSuggestions.map(toApplyInput));
    };
    const applyReadyRows = async () => {
        if (!applyPreview) return;
        const readyKeys = new Set(applyPreview.rows.filter((row) => row.status === 'ready').map((row) => row.key));
        const readySuggestions = selectedSuggestions.filter((suggestion) => readyKeys.has(suggestionKey(suggestion)));
        if (!readySuggestions.length) return;
        const inputs = readySuggestions.map(toApplyInput);
        let verified: ProductionMasterPlanPreview;
        try {
            verified = await productionService.previewMasterPlan(plantId, inputs);
        } catch (error) {
            message.error(errorMessage(error));
            return;
        }
        if (verified.summary.blockedCount) {
            setApplyPreview(verified);
            message.warning('Dữ liệu vừa thay đổi, cần kiểm tra lại các dòng bị chặn');
            return;
        }
        applyMutation.mutate({ suggestions: inputs, fingerprint: verified.fingerprint });
    };

    const openPlan = (
        date: string,
        orderId?: string,
        suggestion?: Pick<ProductionCapacitySuggestion, 'lineId' | 'quantity'>,
        hourlyRate?: number
    ) => {
        const params = new URLSearchParams({ plantId, date });
        if (orderId) params.set('orderId', orderId);
        if (suggestion?.lineId) params.set('lineId', suggestion.lineId);
        if (suggestion?.quantity) params.set('quantity', String(Math.ceil(suggestion.quantity)));
        if (hourlyRate) params.set('hourlyQuota', String(hourlyRate));
        navigate(`/production/planning?${params.toString()}`);
    };

    const renderSuggestionTooltip = (suggestions: SuggestedBlock[]) => (
        <div className='production-master-tooltip'>
            <strong>Phương án mô phỏng</strong>
            {suggestions.map((suggestion) => (
                <span key={`${suggestion.orderId}-${suggestion.date}-${suggestion.lineId}`}>
                    {suggestion.orderCode} · {number(suggestion.quantity)} SP · {number(suggestion.hours)}h
                    {suggestion.isAfterDue ? ' · sau hạn' : ''}
                </span>
            ))}
        </div>
    );

    if (capacityQuery.isLoading && plantId) {
        return (
            <div className='production-page production-master-page'>
                <Skeleton active paragraph={{ rows: 16 }} />
            </div>
        );
    }

    return (
        <div className='production-page production-master-page'>
            <section className='production-workbench-header production-master-header'>
                <div className='production-workbench-title'>
                    <span className='production-kicker'>Kế hoạch hữu hạn · Phase 3</span>
                    <Title level={2}>Kế hoạch tổng thể</Title>
                    <Text type='secondary'>
                        Đối chiếu lịch đã xếp với phương án cân phần còn thiếu trên quỹ giờ thực tế.
                    </Text>
                </div>
                <div className='production-master-controls'>
                    <Select
                        value={plantId || undefined}
                        onChange={setPlantId}
                        disabled={!canSwitchPlant}
                        loading={plantsQuery.isLoading}
                        options={(plantsQuery.data || []).map((plant) => ({
                            value: plant.id,
                            label: productionPlantLabel(plant),
                        }))}
                    />
                    <DatePicker
                        picker='week'
                        locale={viVN.DatePicker}
                        value={startDate}
                        allowClear={false}
                        format='[Tuần] WW · DD/MM/YYYY'
                        onChange={(value) => {
                            if (!value) return;
                            setStartDate(mondayOf(value));
                            setMobileWeek(0);
                        }}
                    />
                    <Select
                        value={weeks}
                        onChange={(value) => {
                            setWeeks(value);
                            setMobileWeek(0);
                        }}
                        options={[2, 4, 6, 8].map((value) => ({ value, label: `${value} tuần` }))}
                    />
                    <Tooltip title='Tính lại phương án'>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={capacityQuery.isFetching}
                            onClick={() => capacityQuery.refetch()}
                        />
                    </Tooltip>
                </div>
            </section>

            {capacityQuery.isError ? (
                <Alert
                    type='error'
                    showIcon
                    message='Không tải được kế hoạch tổng thể'
                    description={errorMessage(capacityQuery.error)}
                    action={<Button onClick={() => capacityQuery.refetch()}>Thử lại</Button>}
                />
            ) : !report ? null : (
                <>
                    <section className='production-master-kpis'>
                        <div>
                            <span>Đã xếp trong kỳ</span>
                            <strong>
                                {number(report.lines.reduce((sum, line) => sum + line.summary.plannedQuantity, 0))}
                            </strong>
                            <small>SP trong kế hoạch ngày</small>
                        </div>
                        <div className='is-suggested'>
                            <span>Có thể xếp thêm</span>
                            <strong>{number(report.summary.suggestedQuantity)}</strong>
                            <small>{number(report.summary.suggestedBeforeDueQuantity)} SP trước hạn</small>
                        </div>
                        <div className={report.summary.suggestedAfterDueQuantity ? 'is-late' : ''}>
                            <span>Phải xếp sau hạn</span>
                            <strong>{number(report.summary.suggestedAfterDueQuantity)}</strong>
                            <small>SP cần quyết định lại</small>
                        </div>
                        <div className={report.summary.unallocatedQuantity ? 'is-danger' : ''}>
                            <span>Chưa tìm được chỗ</span>
                            <strong>{number(report.summary.unallocatedQuantity)}</strong>
                            <small>SP vượt quỹ giờ trong kỳ</small>
                        </div>
                        <div>
                            <span>Tải quỹ giờ</span>
                            <strong>{number(report.summary.utilizationPercent)}%</strong>
                            <small>Còn {number(report.summary.freeRegularHours)} giờ thường</small>
                        </div>
                    </section>

                    <Alert
                        className='production-master-notice'
                        type='info'
                        showIcon
                        icon={<ThunderboltOutlined />}
                        message='Đây là phương án mô phỏng, chưa ghi vào kế hoạch ngày'
                        description='Chọn các phân bổ cần dùng rồi bấm kiểm tra. Máy chủ sẽ đối chiếu lại đơn hàng, khung giờ và trạng thái ngày; chỉ tạo bản nháp, không tự dùng tăng ca hoặc tự ban hành.'
                    />

                    <section className={`production-master-selection ${selectedSuggestions.length ? 'is-active' : ''}`}>
                        <Checkbox
                            checked={
                                Boolean(actionableSuggestions.length) &&
                                selectedSuggestions.length === actionableSuggestions.length
                            }
                            indeterminate={
                                selectedSuggestions.length > 0 &&
                                selectedSuggestions.length < actionableSuggestions.length
                            }
                            disabled={!actionableSuggestions.length}
                            onChange={(event) =>
                                event.target.checked ? selectAllSuggestions() : setSelectedKeys(new Set())
                            }
                        >
                            Chọn toàn bộ phương án trong kỳ
                        </Checkbox>
                        <div className='production-master-selection__summary'>
                            <strong>{selectedSuggestions.length} phân bổ</strong>
                            <span>{number(selectedQuantity)} SP đang chọn</span>
                        </div>
                        <div className='production-master-selection__actions'>
                            <Button disabled={!selectedSuggestions.length} onClick={() => setSelectedKeys(new Set())}>
                                Bỏ chọn
                            </Button>
                            <Button
                                type='primary'
                                icon={<CheckCircleOutlined />}
                                loading={previewMutation.isPending}
                                disabled={!selectedSuggestions.length}
                                onClick={reviewSelection}
                            >
                                Kiểm tra và tạo kế hoạch nháp
                            </Button>
                        </div>
                    </section>

                    <section className='production-master-section'>
                        <header className='production-master-section__heading'>
                            <div>
                                <Title level={4}>Timeline chuyền</Title>
                                <Text type='secondary'>
                                    Nền xanh là lịch hiện tại, viền nét đứt là phần hệ thống đề xuất.
                                </Text>
                            </div>
                            <div className='production-master-legend'>
                                <span className='is-fixed'>Đã xếp</span>
                                <span className='is-proposed'>Đề xuất</span>
                                <span className='is-late'>Sau hạn</span>
                            </div>
                        </header>

                        {isMobile ? (
                            <>
                                <Segmented
                                    block
                                    value={mobileWeek}
                                    onChange={(value) => setMobileWeek(Number(value))}
                                    options={Array.from({ length: weeks }, (_, index) => ({
                                        label: `Tuần ${index + 1}`,
                                        value: index,
                                    }))}
                                />
                                <div className='production-master-mobile-days'>
                                    {visibleDays.map((day) => (
                                        <article key={day.date} className='production-master-mobile-day'>
                                            <header>
                                                <div>
                                                    <strong>{dayjs(day.date).format('dddd · DD/MM')}</strong>
                                                    <span>
                                                        {day.isWorkingDay
                                                            ? `${number(day.utilizationPercent)}% tải · ${number(day.freeRegularHours)}h trống`
                                                            : 'Ngày nghỉ'}
                                                    </span>
                                                </div>
                                                <Tag color={day.planStatus === 'published' ? 'green' : 'gold'}>
                                                    {day.planStatus === 'published'
                                                        ? 'Đã ban hành'
                                                        : day.planStatus === 'draft'
                                                          ? 'Bản nháp'
                                                          : 'Chưa lập'}
                                                </Tag>
                                            </header>
                                            {day.isWorkingDay ? (
                                                <div className='production-master-mobile-lines'>
                                                    {report.lines.map((line) => {
                                                        const cell = line.cells.find((item) => item.date === day.date)!;
                                                        const proposed =
                                                            suggestionsByCell.get(`${line.id}|${day.date}`) || [];
                                                        const proposedQuantity = proposed.reduce(
                                                            (sum, item) => sum + item.quantity,
                                                            0
                                                        );
                                                        return (
                                                            <button
                                                                key={line.id}
                                                                type='button'
                                                                onClick={() =>
                                                                    openPlan(
                                                                        day.date,
                                                                        proposed[0]?.orderId,
                                                                        proposed[0],
                                                                        proposed[0]?.hourlyRate
                                                                    )
                                                                }
                                                            >
                                                                <span>
                                                                    <strong>{line.code}</strong>
                                                                    <small>
                                                                        {line.leaderName ||
                                                                            line.name ||
                                                                            'Chưa gán tổ trưởng'}
                                                                    </small>
                                                                </span>
                                                                <span>
                                                                    <strong>{number(cell.plannedQuantity)} SP</strong>
                                                                    <small>
                                                                        {proposedQuantity
                                                                            ? `Đề xuất +${number(proposedQuantity)} SP`
                                                                            : 'Không có đề xuất'}
                                                                    </small>
                                                                </span>
                                                                <RightOutlined />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            ) : null}
                                        </article>
                                    ))}
                                </div>
                            </>
                        ) : report.lines.length ? (
                            <div className='production-master-timeline-wrap'>
                                <table className='production-master-timeline'>
                                    <thead>
                                        <tr>
                                            <th>Chuyền</th>
                                            {visibleDays.map((day) => (
                                                <th key={day.date} className={!day.isWorkingDay ? 'is-off' : ''}>
                                                    <span>{dayjs(day.date).format('ddd')}</span>
                                                    <strong>{dayjs(day.date).format('DD/MM')}</strong>
                                                    <small>{number(day.utilizationPercent)}%</small>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.lines.map((line) => (
                                            <tr key={line.id}>
                                                <th>
                                                    <strong>{line.code}</strong>
                                                    <span>{line.leaderName || line.name || 'Chưa gán tổ trưởng'}</span>
                                                    <small>{number(line.summary.utilizationPercent)}% tải kỳ</small>
                                                </th>
                                                {visibleDays.map((day) => {
                                                    const cell = line.cells.find((item) => item.date === day.date)!;
                                                    const proposed =
                                                        suggestionsByCell.get(`${line.id}|${day.date}`) || [];
                                                    return (
                                                        <td
                                                            key={day.date}
                                                            className={!day.isWorkingDay ? 'is-off' : ''}
                                                        >
                                                            {day.isWorkingDay ? (
                                                                <button
                                                                    className='production-master-cell'
                                                                    type='button'
                                                                    onClick={() =>
                                                                        openPlan(
                                                                            day.date,
                                                                            proposed[0]?.orderId,
                                                                            proposed[0],
                                                                            proposed[0]?.hourlyRate
                                                                        )
                                                                    }
                                                                >
                                                                    {cell.plannedQuantity > 0 ? (
                                                                        <span className='production-master-block is-fixed'>
                                                                            <strong>
                                                                                {number(cell.plannedQuantity)} SP
                                                                            </strong>
                                                                            <small>
                                                                                {cell.allocations.length} phân bổ
                                                                            </small>
                                                                        </span>
                                                                    ) : null}
                                                                    {proposed.length ? (
                                                                        <Tooltip
                                                                            title={renderSuggestionTooltip(proposed)}
                                                                        >
                                                                            <span
                                                                                className={`production-master-block is-proposed ${proposed.some((item) => item.isAfterDue) ? 'is-late' : ''}`}
                                                                            >
                                                                                <strong>
                                                                                    +
                                                                                    {number(
                                                                                        proposed.reduce(
                                                                                            (sum, item) =>
                                                                                                sum + item.quantity,
                                                                                            0
                                                                                        )
                                                                                    )}{' '}
                                                                                    SP
                                                                                </strong>
                                                                                <small>{proposed.length} đề xuất</small>
                                                                            </span>
                                                                        </Tooltip>
                                                                    ) : null}
                                                                    {!cell.plannedQuantity && !proposed.length ? (
                                                                        <span className='production-master-empty-slot'>
                                                                            Còn trống
                                                                        </span>
                                                                    ) : null}
                                                                </button>
                                                            ) : (
                                                                <span className='production-master-off'>Nghỉ</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <Empty description='Cơ sở chưa có chuyền hoạt động' />
                        )}
                    </section>

                    <section className='production-master-section production-master-queue'>
                        <header className='production-master-section__heading'>
                            <div>
                                <Title level={4}>Khay cần xếp và xử lý</Title>
                                <Text type='secondary'>
                                    Mỗi quyết định đều truy ngược được về đơn, hạn giao và định mức.
                                </Text>
                            </div>
                            <Tag icon={<ApartmentOutlined />}>{queue.length} đơn cần xem</Tag>
                        </header>
                        {!queue.length ? (
                            <Empty description='Toàn bộ đơn trong kỳ đã có lịch phù hợp' />
                        ) : (
                            <div className='production-master-order-list'>
                                {queue.map((order) => {
                                    const status = suggestionStatus(order);
                                    const suggestions = order.suggestedAllocations || [];
                                    const firstSuggestion = suggestions[0];
                                    const plannedPercent = order.remainingQuantity
                                        ? Math.min(
                                              100,
                                              Math.round((order.plannedInHorizon / order.remainingQuantity) * 100)
                                          )
                                        : 100;
                                    return (
                                        <article
                                            key={order.id}
                                            className={`production-master-order severity-${order.severity}`}
                                        >
                                            <header>
                                                <div>
                                                    <strong>{order.code}</strong>
                                                    <span>
                                                        {order.itemCode} ·{' '}
                                                        {order.customerName ||
                                                            order.itemName ||
                                                            'Chưa khai báo khách hàng'}
                                                    </span>
                                                </div>
                                                <Tag color={status.color}>{status.label}</Tag>
                                            </header>
                                            {isMaterialBlocked(order) ? (
                                                <div className='production-master-material-warning'>
                                                    <WarningOutlined />
                                                    <span>
                                                        {order.materialStatus === 'ready'
                                                            ? 'Tồn khả dụng nhưng chưa được giữ cho đơn này.'
                                                            : `Chưa đủ nguyên phụ liệu: ${order.materialShortageLineCount} dòng thiếu.`}
                                                    </span>
                                                    <Button
                                                        type='link'
                                                        onClick={() =>
                                                            navigate(`/production/materials?plantId=${plantId}`)
                                                        }
                                                    >
                                                        Xử lý vật tư
                                                    </Button>
                                                </div>
                                            ) : order.materialStatus === 'unknown' ? (
                                                <div className='production-master-material-warning is-data-gap'>
                                                    <ExclamationCircleFilled />
                                                    <span>
                                                        Chưa có BOM; phương án vẫn mở để không chặn dữ liệu legacy.
                                                    </span>
                                                    <Button
                                                        type='link'
                                                        onClick={() =>
                                                            navigate(`/production/materials?plantId=${plantId}`)
                                                        }
                                                    >
                                                        Khai báo
                                                    </Button>
                                                </div>
                                            ) : null}
                                            <div className='production-master-order__numbers'>
                                                <span>
                                                    <small>Còn phải làm</small>
                                                    <strong>{number(order.remainingQuantity)} SP</strong>
                                                </span>
                                                <span>
                                                    <small>Đã xếp trong kỳ</small>
                                                    <strong>{number(order.plannedInHorizon)} SP</strong>
                                                </span>
                                                <span>
                                                    <small>Mô phỏng thêm</small>
                                                    <strong>{number(order.simulatedQuantity)} SP</strong>
                                                </span>
                                                <span>
                                                    <small>Vẫn chưa có chỗ</small>
                                                    <strong>{number(order.unallocatedQuantity)} SP</strong>
                                                </span>
                                            </div>
                                            <div className='production-master-order__progress'>
                                                <Progress
                                                    percent={plannedPercent}
                                                    showInfo={false}
                                                    strokeColor={order.unallocatedQuantity ? '#dc2626' : '#2563eb'}
                                                />
                                                <span>
                                                    <ClockCircleOutlined /> Hạn{' '}
                                                    {dayjs(order.dueDate).format('DD/MM/YYYY')}
                                                    {order.projectedCompletionDate
                                                        ? ` · dự kiến ${dayjs(order.projectedCompletionDate).format('DD/MM')}`
                                                        : ''}
                                                </span>
                                            </div>
                                            {suggestions.length ? (
                                                <div className='production-master-order__route'>
                                                    {suggestions.map((suggestion) => {
                                                        const key = suggestionKey({ ...suggestion, orderId: order.id });
                                                        return (
                                                            <div
                                                                key={key}
                                                                className={suggestion.isAfterDue ? 'is-late' : ''}
                                                            >
                                                                <Checkbox
                                                                    checked={selectedKeys.has(key)}
                                                                    disabled={isMaterialBlocked(order)}
                                                                    onChange={(event) =>
                                                                        toggleSuggestion(key, event.target.checked)
                                                                    }
                                                                />
                                                                <button
                                                                    type='button'
                                                                    onClick={() =>
                                                                        openPlan(
                                                                            suggestion.date,
                                                                            order.id,
                                                                            suggestion,
                                                                            order.hourlyRate
                                                                        )
                                                                    }
                                                                >
                                                                    <CalendarOutlined />{' '}
                                                                    {dayjs(suggestion.date).format('DD/MM')} ·{' '}
                                                                    {suggestion.lineCode} ·{' '}
                                                                    {number(suggestion.quantity)} SP
                                                                    <RightOutlined />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : null}
                                            <footer>
                                                <span>
                                                    {order.unallocatedQuantity ? (
                                                        <>
                                                            <ExclamationCircleFilled /> {order.recommendation}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <CheckCircleOutlined /> Có thể chuyển thành kế hoạch ngày
                                                            sau khi kiểm tra.
                                                        </>
                                                    )}
                                                </span>
                                                <Button
                                                    type='primary'
                                                    icon={<CalendarOutlined />}
                                                    onClick={() =>
                                                        openPlan(
                                                            firstSuggestion?.date ||
                                                                (startDate.format('YYYY-MM-DD') < report.range.today
                                                                    ? report.range.today
                                                                    : startDate.format('YYYY-MM-DD')),
                                                            order.id,
                                                            firstSuggestion,
                                                            order.hourlyRate
                                                        )
                                                    }
                                                >
                                                    Mở ngày xếp
                                                </Button>
                                            </footer>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </>
            )}
            <MasterPlanApplyModal
                open={Boolean(applyPreview)}
                preview={applyPreview}
                applying={applyMutation.isPending}
                onClose={() => setApplyPreview(null)}
                onApplyReady={() => void applyReadyRows()}
                onOpenPlan={(date) => openPlan(date)}
            />
        </div>
    );
};

export default ProductionMasterPlanPage;
