import {
    CalendarOutlined,
    ClockCircleOutlined,
    DatabaseOutlined,
    ReloadOutlined,
    RightOutlined,
    ThunderboltOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    Button,
    DatePicker,
    Empty,
    Progress,
    Segmented,
    Select,
    Skeleton,
    Table,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import dayjs from 'dayjs';
import viVN from 'antd/locale/vi_VN';
import { productionWeekStart as mondayOf } from '../core/lib/production-calendar';
import { productionErrorMessage } from '../core/lib/production-error';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../core/contexts/AuthContext';
import { useResponsive } from '../core/hooks/useResponsive';
import { useSocket } from '../core/hooks/useSocket';
import { isAdmin, isDirector } from '../core/lib/permissions';
import { productionPlantLabel } from '../core/lib/productionAccess';
import { plantService } from '../core/services/plant.service';
import { productionService } from '../core/services/production.service';
import type {
    ProductionCapacityCell,
    ProductionCapacityDay,
    ProductionCapacityOrderRisk,
    ProductionCapacityRiskCode,
} from '../core/types/production';

const { Text, Title } = Typography;
const number = (value = 0) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
const errorMessage = (error: unknown) => productionErrorMessage(error, 'Không thể tải dữ liệu năng lực');

const riskTone: Record<ProductionCapacityRiskCode, { color: string; label: string }> = {
    completed: { color: 'green', label: 'Đã đủ' },
    overdue: { color: 'red', label: 'Quá hạn' },
    data_gap: { color: 'orange', label: 'Thiếu dữ liệu' },
    capacity_shortfall: { color: 'red', label: 'Thiếu năng lực' },
    late: { color: 'volcano', label: 'Dự kiến trễ' },
    needs_scheduling: { color: 'gold', label: 'Chưa xếp đủ' },
    covered: { color: 'green', label: 'Đã phủ' },
};

const cellLabel: Record<ProductionCapacityCell['status'], string> = {
    free: 'Còn trống',
    loaded: 'Đã xếp',
    full: 'Gần kín',
    overtime: 'Có tăng ca',
    overloaded: 'Quá tải',
};

const ProductionCapacityPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { user, role } = useAuth();
    const { socket } = useSocket();
    const { isCompact: isMobile } = useResponsive();
    const [plantId, setPlantId] = useState(
        (isAdmin(role) || isDirector(role) ? searchParams.get('plantId') : null) || user?.plantId || ''
    );
    const [startDate, setStartDate] = useState(() => mondayOf(dayjs()));
    const [weeks, setWeeks] = useState(2);
    const [mobileWeek, setMobileWeek] = useState(0);
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

    const openPlan = (date: string, orderId?: string) => {
        const params = new URLSearchParams({ plantId, date });
        if (orderId) params.set('orderId', orderId);
        navigate(`/production/planning?${params.toString()}`);
    };

    const orderPlanningDate = () => {
        const today = report?.range.today || dayjs().format('YYYY-MM-DD');
        return startDate.format('YYYY-MM-DD') < today ? today : startDate.format('YYYY-MM-DD');
    };

    const riskColumns: TableColumnsType<ProductionCapacityOrderRisk> = [
        {
            title: 'Đơn hàng',
            key: 'order',
            width: 230,
            render: (_, order) => (
                <button
                    className='production-capacity-order-link'
                    type='button'
                    onClick={() => openPlan(orderPlanningDate(), order.id)}
                >
                    <strong>{order.code}</strong>
                    <span>{order.customerName || order.itemName || 'Chưa khai báo khách hàng'}</span>
                </button>
            ),
        },
        {
            title: 'Mã hàng',
            dataIndex: 'itemCode',
            width: 110,
            render: (value) => <strong>{value}</strong>,
        },
        {
            title: 'Còn lại',
            dataIndex: 'remainingQuantity',
            align: 'right',
            width: 115,
            render: (value) => `${number(value)} SP`,
        },
        {
            title: 'Đã xếp trước hạn',
            key: 'coverage',
            width: 170,
            render: (_, order) => (
                <div className='production-capacity-coverage'>
                    <strong>{number(order.plannedByDue)} SP</strong>
                    <Progress
                        percent={Math.min(
                            100,
                            order.remainingQuantity
                                ? Math.round((order.plannedByDue / order.remainingQuantity) * 100)
                                : 100
                        )}
                        showInfo={false}
                        size='small'
                        strokeColor={order.uncoveredByDue > 0 ? '#d97706' : '#16856b'}
                    />
                    <small>Còn thiếu {number(order.uncoveredByDue)} SP</small>
                </div>
            ),
        },
        {
            title: 'Hạn giao',
            dataIndex: 'dueDate',
            width: 120,
            render: (value) => dayjs(value).format('DD/MM/YYYY'),
        },
        {
            title: 'Dự kiến xong',
            dataIndex: 'projectedCompletionDate',
            width: 125,
            render: (value) => (value ? dayjs(value).format('DD/MM/YYYY') : 'Chưa xác định'),
        },
        {
            title: 'Đánh giá',
            key: 'risk',
            width: 170,
            fixed: 'right',
            render: (_, order) => (
                <div className='production-capacity-risk-cell'>
                    <Tag color={riskTone[order.riskCode].color}>{riskTone[order.riskCode].label}</Tag>
                    <small>{order.recommendation}</small>
                </div>
            ),
        },
    ];

    const cellTooltip = (cell: ProductionCapacityCell) => (
        <div className='production-capacity-tooltip'>
            <strong>
                {cell.lineCode} · {dayjs(cell.date).format('DD/MM')}
            </strong>
            <span>Tải giờ thường: {number(cell.utilizationPercent)}%</span>
            <span>Kế hoạch: {number(cell.plannedQuantity)} SP</span>
            <span>Năng lực theo khoán: {number(cell.nominalQuantityCapacity)} SP</span>
            {cell.plannedOvertimeHours ? <span>Tăng ca: {number(cell.plannedOvertimeHours)} giờ</span> : null}
            {cell.allocations.map((allocation) => (
                <small key={allocation.id}>
                    {allocation.itemCode} · {number(allocation.plannedQuantity)} SP
                </small>
            ))}
        </div>
    );

    if (capacityQuery.isLoading && plantId) {
        return (
            <div className='production-page production-capacity-page'>
                <Skeleton active paragraph={{ rows: 14 }} />
            </div>
        );
    }

    return (
        <div className='production-page production-capacity-page'>
            <section className='production-workbench-header production-capacity-header'>
                <div className='production-workbench-title'>
                    <span className='production-kicker'>Kế hoạch tổng thể</span>
                    <Title level={2}>Năng lực & cam kết giao hàng</Title>
                    <Text type='secondary'>Tải chuyền, phần chưa xếp và nguy cơ trễ theo cùng một kỳ kế hoạch.</Text>
                </div>
                <div className='production-capacity-controls'>
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
                    <Tooltip title='Tải lại số liệu'>
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
                    message='Không tải được năng lực sản xuất'
                    description={errorMessage(capacityQuery.error)}
                    action={<Button onClick={() => capacityQuery.refetch()}>Thử lại</Button>}
                />
            ) : !report ? null : (
                <>
                    <section className='production-capacity-kpis'>
                        <div className='is-primary'>
                            <span>Mức sử dụng</span>
                            <strong>{number(report.summary.utilizationPercent)}%</strong>
                            <small>
                                {number(report.summary.plannedRegularHours)} /{' '}
                                {number(report.summary.regularCapacityHours)} giờ thường
                            </small>
                        </div>
                        <div className={report.summary.atRiskOrderCount ? 'is-danger' : ''}>
                            <span>Đơn cần xử lý</span>
                            <strong>{report.summary.atRiskOrderCount}</strong>
                            <small>Trong kỳ đang xem</small>
                        </div>
                        <div className={report.summary.overloadedCellCount ? 'is-warning' : ''}>
                            <span>Điểm quá tải</span>
                            <strong>{report.summary.overloadedCellCount}</strong>
                            <small>Vượt {number(report.summary.overloadQuantity)} SP theo khoán</small>
                        </div>
                        <div>
                            <span>Quỹ giờ còn trống</span>
                            <strong>{number(report.summary.freeRegularHours)}h</strong>
                            <small>
                                {report.summary.activeLineCount} chuyền · {report.summary.workingDayCount} ngày làm
                            </small>
                        </div>
                        <div className={report.summary.plannedOvertimeHours ? 'has-overtime' : ''}>
                            <span>Đã xếp tăng ca</span>
                            <strong>{number(report.summary.plannedOvertimeHours)}h</strong>
                            <small>{report.summary.draftPlanDayCount} ngày kế hoạch nháp</small>
                        </div>
                    </section>

                    {report.dataQuality.missingRateItems.length ? (
                        <Alert
                            className='production-capacity-data-alert'
                            type='warning'
                            showIcon
                            icon={<DatabaseOutlined />}
                            message={`${report.dataQuality.missingRateItems.length} mã hàng thiếu năng suất chuẩn`}
                            description={report.dataQuality.missingRateItems
                                .map((item) => item.code)
                                .filter(Boolean)
                                .join(', ')}
                        />
                    ) : null}

                    <section className='production-capacity-section'>
                        <div className='production-monitor-section-heading'>
                            <div>
                                <Title level={4}>Bản đồ tải chuyền</Title>
                                <Text type='secondary'>
                                    {dayjs(report.range.startDate).format('DD/MM')} -{' '}
                                    {dayjs(report.range.endDate).format('DD/MM/YYYY')}
                                </Text>
                            </div>
                            <div className='production-capacity-legend'>
                                <span className='is-free'>Trống</span>
                                <span className='is-loaded'>Đã xếp</span>
                                <span className='is-full'>Gần kín</span>
                                <span className='is-overloaded'>Quá tải</span>
                            </div>
                        </div>

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
                                <div className='production-capacity-mobile-days'>
                                    {visibleDays.map((day) => (
                                        <article key={day.date} className='production-capacity-mobile-day'>
                                            <header>
                                                <div>
                                                    <strong>{dayjs(day.date).format('dddd')}</strong>
                                                    <span>{dayjs(day.date).format('DD/MM/YYYY')}</span>
                                                </div>
                                                <Tag
                                                    color={
                                                        !day.isWorkingDay
                                                            ? 'default'
                                                            : day.overloadedLineCount
                                                              ? 'red'
                                                              : day.planStatus === 'published'
                                                                ? 'green'
                                                                : 'gold'
                                                    }
                                                >
                                                    {!day.isWorkingDay
                                                        ? 'Nghỉ'
                                                        : day.planStatus === 'published'
                                                          ? 'Đã ban hành'
                                                          : day.planStatus === 'draft'
                                                            ? 'Bản nháp'
                                                            : 'Chưa lập'}
                                                </Tag>
                                            </header>
                                            {day.isWorkingDay ? (
                                                <>
                                                    <div className='production-capacity-mobile-day__summary'>
                                                        <span>
                                                            <small>Sử dụng</small>
                                                            <strong>{number(day.utilizationPercent)}%</strong>
                                                        </span>
                                                        <span>
                                                            <small>Còn trống</small>
                                                            <strong>{number(day.freeRegularHours)}h</strong>
                                                        </span>
                                                        <span>
                                                            <small>Sản lượng</small>
                                                            <strong>{number(day.plannedQuantity)}</strong>
                                                        </span>
                                                    </div>
                                                    <div className='production-capacity-mobile-lines'>
                                                        {report.lines.map((line) => {
                                                            const cell = line.cells.find(
                                                                (item) => item.date === day.date
                                                            )!;
                                                            return (
                                                                <button
                                                                    key={line.id}
                                                                    type='button'
                                                                    className={`production-capacity-mobile-line is-${cell.status}`}
                                                                    onClick={() => openPlan(day.date)}
                                                                >
                                                                    <span>
                                                                        <strong>{line.code}</strong>
                                                                        <small>{cellLabel[cell.status]}</small>
                                                                    </span>
                                                                    <span>
                                                                        <strong>
                                                                            {number(cell.utilizationPercent)}%
                                                                        </strong>
                                                                        <small>{number(cell.plannedQuantity)} SP</small>
                                                                    </span>
                                                                    <RightOutlined />
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </>
                                            ) : null}
                                        </article>
                                    ))}
                                </div>
                            </>
                        ) : report.lines.length ? (
                            <div className='production-capacity-matrix-wrap'>
                                <table className='production-capacity-matrix'>
                                    <thead>
                                        <tr>
                                            <th>Chuyền</th>
                                            {visibleDays.map((day) => (
                                                <th key={day.date} className={!day.isWorkingDay ? 'is-off' : ''}>
                                                    <span>{dayjs(day.date).format('ddd')}</span>
                                                    <strong>{dayjs(day.date).format('DD/MM')}</strong>
                                                    <small>
                                                        {day.planStatus === 'published'
                                                            ? 'Đã ban hành'
                                                            : day.planStatus === 'draft'
                                                              ? 'Bản nháp'
                                                              : 'Chưa lập'}
                                                    </small>
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
                                                    <small>{number(line.summary.utilizationPercent)}% trong kỳ</small>
                                                </th>
                                                {visibleDays.map((day) => {
                                                    const cell = line.cells.find((item) => item.date === day.date)!;
                                                    return (
                                                        <td
                                                            key={day.date}
                                                            className={!day.isWorkingDay ? 'is-off' : ''}
                                                        >
                                                            {day.isWorkingDay ? (
                                                                <Tooltip title={cellTooltip(cell)} placement='top'>
                                                                    <button
                                                                        type='button'
                                                                        className={`production-capacity-cell is-${cell.status}`}
                                                                        onClick={() => openPlan(day.date)}
                                                                    >
                                                                        <strong>
                                                                            {number(cell.utilizationPercent)}%
                                                                        </strong>
                                                                        <span>{number(cell.plannedQuantity)} SP</span>
                                                                        {cell.plannedOvertimeHours ? (
                                                                            <small>
                                                                                +{number(cell.plannedOvertimeHours)}h TC
                                                                            </small>
                                                                        ) : (
                                                                            <small>
                                                                                {cell.allocations.length} phân bổ
                                                                            </small>
                                                                        )}
                                                                    </button>
                                                                </Tooltip>
                                                            ) : (
                                                                <span className='production-capacity-off-mark'>
                                                                    Nghỉ
                                                                </span>
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
                            <Empty description='Cơ sở chưa có chuyền đang hoạt động' />
                        )}
                    </section>

                    <section className='production-capacity-section production-capacity-risks'>
                        <div className='production-monitor-section-heading'>
                            <div>
                                <Title level={4}>Cam kết giao hàng</Title>
                                <Text type='secondary'>Ưu tiên theo mức độ rủi ro và hạn giao.</Text>
                            </div>
                            <Tag icon={<ClockCircleOutlined />}>{report.orders.length} đơn trong kỳ</Tag>
                        </div>
                        {!report.orders.length ? (
                            <Empty description='Không có đơn hàng đến hạn trong kỳ' />
                        ) : isMobile ? (
                            <div className='production-capacity-risk-list'>
                                {report.orders.map((order) => (
                                    <article
                                        key={order.id}
                                        className={`production-capacity-risk-card severity-${order.severity}`}
                                    >
                                        <header>
                                            <div>
                                                <strong>{order.code}</strong>
                                                <span>
                                                    {order.itemCode} · hạn {dayjs(order.dueDate).format('DD/MM')}
                                                </span>
                                            </div>
                                            <Tag color={riskTone[order.riskCode].color}>
                                                {riskTone[order.riskCode].label}
                                            </Tag>
                                        </header>
                                        <div className='production-capacity-risk-card__metrics'>
                                            <span>
                                                <small>Còn lại</small>
                                                <strong>{number(order.remainingQuantity)} SP</strong>
                                            </span>
                                            <span>
                                                <small>Trước hạn</small>
                                                <strong>{number(order.plannedByDue)} SP</strong>
                                            </span>
                                            <span>
                                                <small>Dự kiến xong</small>
                                                <strong>
                                                    {order.projectedCompletionDate
                                                        ? dayjs(order.projectedCompletionDate).format('DD/MM')
                                                        : 'Chưa rõ'}
                                                </strong>
                                            </span>
                                        </div>
                                        <p>{order.recommendation}</p>
                                        <Button
                                            type='text'
                                            icon={<CalendarOutlined />}
                                            onClick={() => openPlan(orderPlanningDate(), order.id)}
                                        >
                                            Lập kế hoạch
                                        </Button>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <Table<ProductionCapacityOrderRisk>
                                rowKey='id'
                                columns={riskColumns}
                                dataSource={report.orders}
                                pagination={false}
                                scroll={{ x: 1120 }}
                                rowClassName={(order) => (order.severity >= 5 ? 'production-capacity-risk-row' : '')}
                            />
                        )}
                    </section>

                    <section className='production-capacity-method'>
                        <div>
                            <ThunderboltOutlined />
                            <span>
                                <strong>Năng suất dự báo</strong>
                                <small>
                                    {report.orders.filter((order) => order.rateSource === 'configured').length} đơn dùng
                                    định mức đã khai báo
                                </small>
                            </span>
                        </div>
                        <div>
                            <WarningOutlined />
                            <span>
                                <strong>Độ tin cậy dữ liệu</strong>
                                <small>
                                    {report.orders.filter((order) => order.confidence === 'high').length}/
                                    {report.orders.length} đơn đạt mức cao
                                </small>
                            </span>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
};

export default ProductionCapacityPage;
