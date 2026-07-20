import {
    AlertOutlined,
    ArrowDownOutlined,
    ArrowUpOutlined,
    CheckCircleFilled,
    ClockCircleOutlined,
    ExpandOutlined,
    EyeOutlined,
    FullscreenExitOutlined,
    LineChartOutlined,
    ReloadOutlined,
    RocketOutlined,
    TeamOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    Button,
    DatePicker,
    Empty,
    Grid,
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
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../core/contexts/AuthContext';
import { useSocket } from '../core/hooks/useSocket';
import { isAdmin, isDirector } from '../core/lib/permissions';
import { plantService } from '../core/services/plant.service';
import { productionService } from '../core/services/production.service';
import type {
    ProductionDayStatus,
    ProductionMonitorAlert,
    ProductionMonitorAlertSeverity,
    ProductionMonitorLine,
    ProductionMonitorLineStatus,
} from '../core/types/production';

const { Text, Title } = Typography;
const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(value);
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể tải dữ liệu điều hành');

type MobileView = 'overview' | 'alerts' | 'lines';
type AlertFilter = 'all' | ProductionMonitorAlertSeverity;

const dayStatusMeta: Record<ProductionDayStatus, { label: string; color: string }> = {
    draft: { label: 'Đang nhập', color: 'gold' },
    submitted: { label: 'Chờ duyệt', color: 'blue' },
    locked: { label: 'Đã khóa sổ', color: 'green' },
};

const lineStatusMeta: Record<ProductionMonitorLineStatus, { label: string; color: string; rank: number }> = {
    critical: { label: 'Nghiêm trọng', color: 'red', rank: 0 },
    missing: { label: 'Thiếu báo', color: 'volcano', rank: 1 },
    at_risk: { label: 'Rủi ro', color: 'gold', rank: 2 },
    not_configured: { label: 'Chưa thiết lập', color: 'default', rank: 3 },
    waiting: { label: 'Chờ đến giờ', color: 'blue', rank: 4 },
    on_track: { label: 'Đúng nhịp', color: 'green', rank: 5 },
};

const achievementTone = (percent: number) => {
    if (percent >= 95 && percent <= 160) return 'success';
    if (percent >= 80 && percent < 95) return 'warning';
    if (percent > 160) return 'spike';
    return 'danger';
};

const ProductionMonitorPage = () => {
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.lg;
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const pageRef = useRef<HTMLDivElement>(null);
    const { user, role } = useAuth();
    const { socket } = useSocket();
    const [date, setDate] = useState<Dayjs>(() => dayjs());
    const [plantId, setPlantId] = useState(user?.plantId || '');
    const [mobileView, setMobileView] = useState<MobileView>('overview');
    const [alertFilter, setAlertFilter] = useState<AlertFilter>('all');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const productionDate = date.format('YYYY-MM-DD');
    const canSwitchPlant = isAdmin(role) || isDirector(role);

    const plantsQuery = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        staleTime: 5 * 60 * 1000,
    });

    useEffect(() => {
        if (plantId) return;
        const preferred = user?.plantId || plantsQuery.data?.[0]?.id;
        if (preferred) setPlantId(preferred);
    }, [plantId, plantsQuery.data, user?.plantId]);

    const monitorQuery = useQuery({
        queryKey: ['production', 'monitor', plantId, productionDate],
        queryFn: () => productionService.getMonitor(plantId, productionDate),
        enabled: Boolean(plantId),
        refetchInterval: 30_000,
    });

    useEffect(() => {
        if (!socket) return;
        const handleUpdate = (payload: { plantId: string; productionDate: string }) => {
            if (payload.plantId !== plantId || payload.productionDate !== productionDate) return;
            void queryClient.invalidateQueries({ queryKey: ['production', 'monitor', plantId, productionDate] });
        };
        socket.on('production:updated', handleUpdate);
        return () => {
            socket.off('production:updated', handleUpdate);
        };
    }, [plantId, productionDate, queryClient, socket]);

    useEffect(() => {
        const handleFullscreen = () => setIsFullscreen(document.fullscreenElement === pageRef.current);
        document.addEventListener('fullscreenchange', handleFullscreen);
        return () => document.removeEventListener('fullscreenchange', handleFullscreen);
    }, []);

    const data = monitorQuery.data;
    const day = data?.day;
    const monitor = data?.monitor;
    const status = day ? dayStatusMeta[day.status] : undefined;

    const filteredAlerts = useMemo(
        () => (monitor?.alerts || []).filter((alert) => alertFilter === 'all' || alert.severity === alertFilter),
        [alertFilter, monitor?.alerts]
    );

    const sortedLines = useMemo(
        () =>
            [...(monitor?.linePerformance || [])].sort(
                (left, right) =>
                    lineStatusMeta[left.status].rank - lineStatusMeta[right.status].rank ||
                    left.achievementPercent - right.achievementPercent ||
                    left.lineCode.localeCompare(right.lineCode)
            ),
        [monitor?.linePerformance]
    );

    const lineRecordById = useMemo(() => new Map((day?.lines || []).map((line) => [line.lineId, line])), [day?.lines]);
    const slotMonitorByKey = useMemo(
        () => new Map((monitor?.slotPerformance || []).map((slot) => [slot.key, slot])),
        [monitor?.slotPerformance]
    );

    const openEntry = (lineId?: string, slotKey?: string) => {
        const params = new URLSearchParams({ plantId, date: productionDate });
        if (lineId) params.set('lineId', lineId);
        if (slotKey) params.set('slot', slotKey);
        navigate(`/production?${params.toString()}`);
    };

    const toggleFullscreen = async () => {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
            return;
        }
        await pageRef.current?.requestFullscreen();
    };

    const renderAlert = (alert: ProductionMonitorAlert) => (
        <button
            type='button'
            key={alert.id}
            className={`production-monitor-alert severity-${alert.severity}`}
            onClick={() => openEntry(alert.lineId, alert.slotKey)}
        >
            <span className='production-monitor-alert__icon'>
                {alert.severity === 'critical' ? <WarningFilled /> : <AlertOutlined />}
            </span>
            <span className='production-monitor-alert__copy'>
                <strong>{alert.title}</strong>
                <small>{alert.description}</small>
            </span>
            <EyeOutlined />
        </button>
    );

    const lineColumns: TableColumnsType<ProductionMonitorLine> = [
        {
            title: 'Chuyền',
            key: 'line',
            width: 190,
            render: (_, line) => (
                <button type='button' className='production-monitor-line-name' onClick={() => openEntry(line.lineId)}>
                    <span>{line.lineCode}</span>
                    <div>
                        <strong>{line.leaderName || line.lineName || 'Chưa có tổ trưởng'}</strong>
                        <small>
                            <TeamOutlined /> {line.workerCount} người
                        </small>
                    </div>
                </button>
            ),
        },
        {
            title: 'Tiến độ đến hiện tại',
            key: 'pace',
            width: 245,
            render: (_, line) => (
                <div className='production-monitor-line-progress'>
                    <div>
                        <strong>{number(line.actualToNow)}</strong>
                        <span>/ {number(line.targetToNow)} SP</span>
                    </div>
                    <Progress
                        percent={Math.min(100, Math.round(line.achievementPercent))}
                        showInfo={false}
                        size='small'
                        strokeColor={line.achievementPercent >= 95 ? '#168a52' : '#c87816'}
                    />
                </div>
            ),
        },
        {
            title: '% đạt',
            dataIndex: 'achievementPercent',
            width: 100,
            align: 'right',
            render: (value) => <strong className={`tone-${achievementTone(value)}`}>{value.toFixed(1)}%</strong>,
        },
        {
            title: 'Đã báo',
            key: 'coverage',
            width: 105,
            align: 'center',
            render: (_, line) => (
                <span className={line.reportedSlots < line.dueSlots ? 'production-monitor-coverage is-missing' : ''}>
                    {line.reportedSlots}/{line.dueSlots}
                </span>
            ),
        },
        {
            title: 'So với nền',
            dataIndex: 'deltaVsBaseline',
            width: 125,
            align: 'right',
            render: (value?: number) =>
                value === undefined ? (
                    <Text type='secondary'>Chưa có nền</Text>
                ) : (
                    <span className={`production-monitor-delta ${value >= 0 ? 'is-up' : 'is-down'}`}>
                        {value >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                        {Math.abs(value).toFixed(1)} điểm
                    </span>
                ),
        },
        {
            title: 'Tình trạng',
            dataIndex: 'status',
            width: 130,
            render: (value: ProductionMonitorLineStatus) => (
                <Tag color={lineStatusMeta[value].color}>{lineStatusMeta[value].label}</Tag>
            ),
        },
        {
            title: '',
            key: 'action',
            width: 50,
            fixed: 'right',
            render: (_, line) => (
                <Button
                    type='text'
                    icon={<EyeOutlined />}
                    onClick={() => openEntry(line.lineId)}
                    aria-label={`Xem ${line.lineCode}`}
                />
            ),
        },
    ];

    const renderMatrix = () => {
        if (!day || !monitor) return null;
        const activeSlots = day.timeSlots.filter((slot) => slot.isActive);
        return (
            <div className='production-monitor-matrix-wrap'>
                <table className='production-monitor-matrix'>
                    <thead>
                        <tr>
                            <th>Chuyền</th>
                            {activeSlots.map((slot) => {
                                const slotMonitor = slotMonitorByKey.get(slot.key);
                                return (
                                    <th
                                        key={slot.key}
                                        className={monitor.currentSlotKey === slot.key ? 'is-current' : undefined}
                                    >
                                        <strong>{slot.label}</strong>
                                        <small>
                                            {monitor.currentSlotKey === slot.key
                                                ? 'Đang chạy'
                                                : slotMonitor?.due
                                                  ? `${slotMonitor.reportedLines}/${slotMonitor.totalLines}`
                                                  : 'Sắp tới'}
                                        </small>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedLines.map((line) => {
                            const record = lineRecordById.get(line.lineId);
                            return (
                                <tr key={line.lineId}>
                                    <th>
                                        <button type='button' onClick={() => openEntry(line.lineId)}>
                                            <strong>{line.lineCode}</strong>
                                            <small>{line.leaderName || 'Chưa có tổ trưởng'}</small>
                                        </button>
                                    </th>
                                    {activeSlots.map((slot) => {
                                        const value = record?.slotValues.find((item) => item.key === slot.key);
                                        const slotMonitor = slotMonitorByKey.get(slot.key);
                                        const percent = value?.target ? (value.actual / value.target) * 100 : 0;
                                        const cellState = !value?.runId
                                            ? 'idle'
                                            : !slotMonitor?.due
                                              ? monitor.currentSlotKey === slot.key
                                                  ? 'current'
                                                  : 'future'
                                              : !value.reported
                                                ? 'missing'
                                                : achievementTone(percent);
                                        return (
                                            <td key={slot.key}>
                                                <Tooltip
                                                    title={
                                                        value?.runId
                                                            ? `${line.lineCode} · ${slot.label}: ${number(value.actual)}/${number(value.target)} SP`
                                                            : `${line.lineCode} không chạy tại ${slot.label}`
                                                    }
                                                >
                                                    <button
                                                        type='button'
                                                        className={`production-monitor-matrix-cell state-${cellState}`}
                                                        onClick={() => openEntry(line.lineId, slot.key)}
                                                    >
                                                        {cellState === 'missing' ? (
                                                            <>
                                                                <WarningFilled />
                                                                <small>Thiếu</small>
                                                            </>
                                                        ) : value?.reported ? (
                                                            <>
                                                                <strong>{number(value.actual)}</strong>
                                                                <small>
                                                                    {value.target
                                                                        ? `${Math.round(percent)}%`
                                                                        : 'Đã báo'}
                                                                </small>
                                                            </>
                                                        ) : cellState === 'current' ? (
                                                            <>
                                                                <ClockCircleOutlined />
                                                                <small>Đang chạy</small>
                                                            </>
                                                        ) : (
                                                            <span>—</span>
                                                        )}
                                                    </button>
                                                </Tooltip>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div ref={pageRef} className='production-page production-monitor-page'>
            <section className='production-workbench-header'>
                <div className='production-workbench-title'>
                    <span className='production-kicker'>Điều hành realtime</span>
                    <Title level={2}>Trung tâm sản lượng</Title>
                    <Text type='secondary'>Nhịp báo giờ, sai lệch khoán và tình trạng từng chuyền.</Text>
                </div>
                <div className='production-monitor-controls'>
                    <Select
                        value={plantId || undefined}
                        onChange={setPlantId}
                        disabled={!canSwitchPlant}
                        loading={plantsQuery.isLoading}
                        options={(plantsQuery.data || []).map((plant) => ({ value: plant.id, label: plant.name }))}
                        placeholder='Chọn cơ sở'
                    />
                    <DatePicker
                        value={date}
                        allowClear={false}
                        format='DD/MM/YYYY'
                        onChange={(value) => setDate(value || dayjs())}
                    />
                    <Tooltip title='Tải lại dữ liệu'>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={monitorQuery.isFetching}
                            onClick={() => monitorQuery.refetch()}
                        />
                    </Tooltip>
                    <Tooltip title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}>
                        <Button
                            icon={isFullscreen ? <FullscreenExitOutlined /> : <ExpandOutlined />}
                            onClick={() => void toggleFullscreen()}
                        />
                    </Tooltip>
                </div>
            </section>

            {isMobile && data ? (
                <Segmented<MobileView>
                    className='production-monitor-mobile-tabs'
                    block
                    value={mobileView}
                    onChange={setMobileView}
                    options={[
                        { value: 'overview', label: 'Tổng quan' },
                        { value: 'alerts', label: `Cảnh báo ${monitor?.alerts.length || 0}` },
                        { value: 'lines', label: 'Chuyền' },
                    ]}
                />
            ) : null}

            {monitorQuery.isLoading ? (
                <section className='production-monitor-loading'>
                    <Skeleton active paragraph={{ rows: 10 }} />
                </section>
            ) : monitorQuery.isError ? (
                <Alert
                    type='error'
                    showIcon
                    message='Không tải được trung tâm điều hành'
                    description={errorMessage(monitorQuery.error)}
                    action={<Button onClick={() => monitorQuery.refetch()}>Thử lại</Button>}
                />
            ) : !data || !day || !monitor ? (
                <section className='production-monitor-empty'>
                    <Empty
                        description={
                            <div>
                                <strong>Ngày này chưa có sổ sản xuất</strong>
                                <p>{date.format('DD/MM/YYYY')}</p>
                            </div>
                        }
                    >
                        <Button type='primary' onClick={() => openEntry()}>
                            Mở ngày sản xuất
                        </Button>
                    </Empty>
                </section>
            ) : (
                <>
                    <section className='production-monitor-livebar'>
                        <div>
                            <span className='production-monitor-live-dot' />
                            <strong>{day.plantName}</strong>
                            {status ? <Tag color={status.color}>{status.label}</Tag> : null}
                        </div>
                        <div>
                            <span>
                                {monitor.currentSlotKey
                                    ? `Khung ${day.timeSlots.find((slot) => slot.key === monitor.currentSlotKey)?.label || monitor.currentSlotKey}`
                                    : 'Ngoài khung sản xuất'}
                            </span>
                            <small>Cập nhật {dayjs(monitor.asOf).format('HH:mm:ss')}</small>
                        </div>
                    </section>

                    {monitor.forecast && (!isMobile || mobileView === 'overview') ? (
                        <section className='production-monitor-forecastbar'>
                            <div className='production-monitor-forecastbar__signal'>
                                <RocketOutlined />
                                <span>
                                    <small>Dự kiến cuối ngày</small>
                                    <strong>{number(monitor.forecast.summary.projectedEndOfDay)} SP</strong>
                                </span>
                            </div>
                            <div className='production-monitor-forecastbar__progress'>
                                <div>
                                    <span>
                                        {monitor.forecast.summary.projectedCompletionPercent.toFixed(1)}% kế hoạch
                                    </span>
                                    <small>
                                        Mục tiêu {number(monitor.forecast.summary.plannedQuantity)} SP · còn{' '}
                                        {number(monitor.forecast.summary.remainingQuantity)} SP
                                    </small>
                                </div>
                                <Progress
                                    percent={Math.min(
                                        100,
                                        Math.round(monitor.forecast.summary.projectedCompletionPercent)
                                    )}
                                    showInfo={false}
                                    strokeColor={
                                        monitor.forecast.summary.projectedCompletionPercent >= 95
                                            ? '#168a52'
                                            : monitor.forecast.summary.projectedCompletionPercent >= 80
                                              ? '#c87816'
                                              : '#c54141'
                                    }
                                />
                            </div>
                            <div className='production-monitor-forecastbar__risk'>
                                <span>
                                    <strong>{monitor.forecast.summary.atRiskAllocations}</strong>
                                    <small>phân bổ rủi ro</small>
                                </span>
                                <Tag>
                                    Tin cậy{' '}
                                    {monitor.forecast.summary.confidence === 'high'
                                        ? 'cao'
                                        : monitor.forecast.summary.confidence === 'medium'
                                          ? 'vừa'
                                          : 'thấp'}
                                </Tag>
                                <Button
                                    type='link'
                                    onClick={() =>
                                        navigate(`/production/planning?plantId=${plantId}&date=${productionDate}`)
                                    }
                                >
                                    Xem kế hoạch
                                </Button>
                            </div>
                        </section>
                    ) : null}

                    {!isMobile || mobileView === 'overview' ? (
                        <>
                            <section className='production-monitor-kpis'>
                                <div className='production-monitor-kpi-primary'>
                                    <span>Sản lượng đến hiện tại</span>
                                    <strong>{number(monitor.summary.actualToNow)}</strong>
                                    <small>/ {number(monitor.summary.targetToNow)} SP</small>
                                </div>
                                <div>
                                    <span>Nhịp đạt</span>
                                    <strong className={`tone-${achievementTone(monitor.summary.achievementToNow)}`}>
                                        {monitor.summary.achievementToNow.toFixed(1)}%
                                    </strong>
                                    <small>
                                        {monitor.summary.baselineAchievement === undefined
                                            ? 'Chưa có đường chuẩn'
                                            : `Nền ${monitor.summary.baselineAchievement.toFixed(1)}%`}
                                    </small>
                                </div>
                                <div>
                                    <span>Độ phủ báo giờ</span>
                                    <strong>{monitor.summary.reportingRate.toFixed(1)}%</strong>
                                    <small>
                                        {monitor.summary.reportedSlots}/{monitor.summary.dueSlots} ô đến hạn
                                    </small>
                                </div>
                                <div>
                                    <span>Đúng nhịp</span>
                                    <strong>{monitor.summary.onTrackLines}</strong>
                                    <small>{monitor.summary.totalLines} chuyền</small>
                                </div>
                                <div className={monitor.summary.atRiskLines ? 'has-risk' : ''}>
                                    <span>Cần xử lý</span>
                                    <strong>{monitor.summary.atRiskLines}</strong>
                                    <small>
                                        {monitor.summary.criticalAlerts} nghiêm trọng · {monitor.summary.warningAlerts}{' '}
                                        cảnh báo
                                    </small>
                                </div>
                            </section>

                            <section className='production-monitor-hour-strip'>
                                {monitor.slotPerformance.map((slot) => (
                                    <div
                                        key={slot.key}
                                        className={`${slot.due ? 'is-due' : 'is-future'} ${monitor.currentSlotKey === slot.key ? 'is-current' : ''}`}
                                    >
                                        <span>{slot.label}</span>
                                        <strong>{slot.due ? number(slot.actual) : '—'}</strong>
                                        <small>
                                            {monitor.currentSlotKey === slot.key
                                                ? 'Đang chạy'
                                                : slot.due
                                                  ? `${slot.reportedLines}/${slot.totalLines} chuyền`
                                                  : 'Sắp tới'}
                                        </small>
                                    </div>
                                ))}
                            </section>

                            <section className='production-monitor-matrix-panel'>
                                <div className='production-monitor-section-heading'>
                                    <div>
                                        <Title level={4}>Ma trận sản lượng theo giờ</Title>
                                        <Text type='secondary'>Số thực tế và tỷ lệ đạt tại từng chuyền.</Text>
                                    </div>
                                    <Button icon={<EyeOutlined />} onClick={() => openEntry()}>
                                        Mở sổ nhập
                                    </Button>
                                </div>
                                {renderMatrix()}
                            </section>
                        </>
                    ) : null}

                    {!isMobile || mobileView === 'alerts' ? (
                        <section className='production-monitor-alert-panel'>
                            <div className='production-monitor-section-heading'>
                                <div>
                                    <Title level={4}>Việc cần xử lý</Title>
                                    <Text type='secondary'>{monitor.alerts.length} tín hiệu đang mở</Text>
                                </div>
                                <Segmented<AlertFilter>
                                    value={alertFilter}
                                    onChange={setAlertFilter}
                                    options={[
                                        { value: 'all', label: 'Tất cả' },
                                        { value: 'critical', label: `Nặng ${monitor.summary.criticalAlerts}` },
                                        { value: 'warning', label: `Cảnh báo ${monitor.summary.warningAlerts}` },
                                    ]}
                                />
                            </div>
                            <div className='production-monitor-alert-list'>
                                {filteredAlerts.length ? (
                                    filteredAlerts.map(renderAlert)
                                ) : (
                                    <div className='production-monitor-all-clear'>
                                        <CheckCircleFilled />
                                        <span>
                                            <strong>Không có tín hiệu trong nhóm này</strong>
                                            <small>Số liệu đến hạn hiện không cần xử lý thêm.</small>
                                        </span>
                                    </div>
                                )}
                            </div>
                        </section>
                    ) : null}

                    {!isMobile || mobileView === 'lines' ? (
                        isMobile ? (
                            <section className='production-monitor-line-cards'>
                                {sortedLines.map((line) => {
                                    const meta = lineStatusMeta[line.status];
                                    return (
                                        <button key={line.lineId} type='button' onClick={() => openEntry(line.lineId)}>
                                            <div>
                                                <span>{line.lineCode}</span>
                                                <div>
                                                    <strong>
                                                        {line.leaderName || line.lineName || 'Chưa có tổ trưởng'}
                                                    </strong>
                                                    <small>{line.workerCount} người</small>
                                                </div>
                                                <Tag color={meta.color}>{meta.label}</Tag>
                                            </div>
                                            <div className='production-monitor-line-card__numbers'>
                                                <span>
                                                    <small>Thực tế</small>
                                                    <strong>{number(line.actualToNow)}</strong>
                                                </span>
                                                <span>
                                                    <small>Mức đạt</small>
                                                    <strong>{line.achievementPercent.toFixed(1)}%</strong>
                                                </span>
                                                <span>
                                                    <small>Đã báo</small>
                                                    <strong>
                                                        {line.reportedSlots}/{line.dueSlots}
                                                    </strong>
                                                </span>
                                            </div>
                                            <Progress
                                                percent={Math.min(100, Math.round(line.achievementPercent))}
                                                showInfo={false}
                                                size='small'
                                                strokeColor={line.achievementPercent >= 95 ? '#168a52' : '#c87816'}
                                            />
                                        </button>
                                    );
                                })}
                            </section>
                        ) : (
                            <section className='production-monitor-line-table'>
                                <div className='production-monitor-section-heading'>
                                    <div>
                                        <Title level={4}>Tình trạng theo chuyền</Title>
                                        <Text type='secondary'>Xếp chuyền cần chú ý lên trước.</Text>
                                    </div>
                                    <LineChartOutlined />
                                </div>
                                <Table<ProductionMonitorLine>
                                    rowKey='lineId'
                                    columns={lineColumns}
                                    dataSource={sortedLines}
                                    pagination={false}
                                    scroll={{ x: 920 }}
                                />
                            </section>
                        )
                    ) : null}
                </>
            )}
        </div>
    );
};

export default ProductionMonitorPage;
