import {
    AlertOutlined,
    ArrowRightOutlined,
    ClockCircleOutlined,
    DatabaseOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    SyncOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    App,
    Button,
    Drawer,
    Empty,
    Progress,
    Segmented,
    Select,
    Skeleton,
    Table,
    Tag,
    Typography,
    type TableColumnsType,
} from 'antd';
import dayjs from 'dayjs';
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
    ProductionControlTowerException,
    ProductionControlTowerForecastStatus,
    ProductionControlTowerOrder,
    ProductionControlTowerSeverity,
    ProductionMaterialReadinessStatus,
    ProductionOrderStatus,
} from '../core/types/production';

const { Text, Title } = Typography;
const number = (value = 0) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
const date = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY') : 'Chưa xác định');
const errorText = (error: unknown) =>
    error instanceof Error ? error.message : 'Không thể tải trung tâm điều hành sản xuất';

const forecastMeta: Record<ProductionControlTowerForecastStatus, { label: string; color: string }> = {
    completed: { label: 'Hoàn thành', color: 'green' },
    on_track: { label: 'Đúng hạn', color: 'cyan' },
    at_risk: { label: 'Cần theo dõi', color: 'gold' },
    late: { label: 'Dự báo trễ', color: 'red' },
    no_forecast: { label: 'Thiếu dữ liệu', color: 'default' },
};
const materialMeta: Record<ProductionMaterialReadinessStatus, { label: string; color: string }> = {
    ready: { label: 'Đủ vật tư', color: 'green' },
    partial: { label: 'Thiếu một phần', color: 'orange' },
    shortage: { label: 'Thiếu vật tư', color: 'red' },
    unknown: { label: 'Chưa có BOM', color: 'default' },
};
const orderStatusLabel: Record<ProductionOrderStatus, string> = {
    draft: 'Chuẩn bị',
    ready: 'Sẵn sàng',
    in_production: 'Đang sản xuất',
    paused: 'Tạm dừng',
    completed: 'Hoàn thành',
    cancelled: 'Đã hủy',
};
const severityLabel: Record<ProductionControlTowerSeverity, string> = {
    critical: 'Khẩn cấp',
    warning: 'Cần xử lý',
    normal: 'Ổn định',
};
const exceptionIcon = (severity: ProductionControlTowerException['severity']) =>
    severity === 'critical' ? <AlertOutlined /> : severity === 'warning' ? <WarningOutlined /> : <DatabaseOutlined />;

const ProductionControlTowerPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const { user, role } = useAuth();
    const { isCompact } = useResponsive();
    const { socket } = useSocket();
    const [plantId, setPlantId] = useState(searchParams.get('plantId') || user?.plantId || '');
    const [windowDays, setWindowDays] = useState(30);
    const [severity, setSeverity] = useState<'all' | ProductionControlTowerSeverity>('all');
    const [selected, setSelected] = useState<ProductionControlTowerOrder>();
    const canSwitchPlant = isAdmin(role) || isDirector(role);

    const plantsQuery = useQuery({ queryKey: ['plants'], queryFn: () => plantService.getAll(), staleTime: 300_000 });
    useEffect(() => {
        if (plantId) return;
        const preferred = user?.plantId || plantsQuery.data?.[0]?.id;
        if (preferred) setPlantId(preferred);
    }, [plantId, plantsQuery.data, user?.plantId]);

    const towerQuery = useQuery({
        queryKey: ['production', 'control-tower', plantId, windowDays],
        queryFn: () => productionService.getControlTower(plantId, windowDays),
        enabled: Boolean(plantId),
        refetchInterval: 60_000,
    });
    const report = towerQuery.data;

    useEffect(() => {
        const focusOrderId = searchParams.get('orderId');
        if (!focusOrderId || !report || selected?.id === focusOrderId) return;
        const order = report.orders.find((item) => item.id === focusOrderId);
        if (order) setSelected(order);
    }, [report, searchParams, selected?.id]);

    useEffect(() => {
        if (!socket) return;
        const refresh = (payload: { plantId?: string }) => {
            if (!payload.plantId || payload.plantId === plantId) {
                void queryClient.invalidateQueries({ queryKey: ['production', 'control-tower'] });
            }
        };
        socket.on('production:updated', refresh);
        socket.on('production:order-updated', refresh);
        socket.on('production:plan-updated', refresh);
        socket.on('production:material-updated', refresh);
        return () => {
            socket.off('production:updated', refresh);
            socket.off('production:order-updated', refresh);
            socket.off('production:plan-updated', refresh);
            socket.off('production:material-updated', refresh);
        };
    }, [plantId, queryClient, socket]);

    const syncMutation = useMutation({
        mutationFn: (orderIds?: string[]) => productionService.syncControlTowerStatuses(plantId, orderIds),
        onSuccess: async (result) => {
            message.success(
                result.synchronizedCount
                    ? `Đã đồng bộ trạng thái ${result.synchronizedCount} đơn hàng`
                    : 'Tất cả trạng thái đã khớp số liệu thực tế'
            );
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['production', 'control-tower'] }),
                queryClient.invalidateQueries({ queryKey: ['production', 'orders'] }),
            ]);
        },
        onError: (error) => message.error(errorText(error)),
    });

    const filteredOrders = useMemo(
        () => (report?.orders || []).filter((order) => severity === 'all' || order.severity === severity),
        [report?.orders, severity]
    );
    const visibleExceptions = useMemo(
        () => (report?.exceptions || []).filter((item) => item.severity !== 'info').slice(0, isCompact ? 5 : 8),
        [isCompact, report?.exceptions]
    );

    const actionFor = (exception: ProductionControlTowerException, order?: ProductionControlTowerOrder) => {
        const orderId = exception.orderId || order?.id;
        const params = new URLSearchParams({ plantId });
        if (orderId) params.set('orderId', orderId);
        switch (exception.action) {
            case 'materials':
                navigate(`/production/materials?${params.toString()}`);
                break;
            case 'master_plan':
                navigate(`/production/master-plan?${params.toString()}`);
                break;
            case 'planning':
                navigate(`/production/planning?${params.toString()}`);
                break;
            case 'monitor':
                navigate(`/production/monitor?plantId=${plantId}`);
                break;
            case 'sync_status':
                if (orderId) syncMutation.mutate([orderId]);
                break;
            default:
                navigate(`/production/orders?${params.toString()}`);
        }
    };

    const columns: TableColumnsType<ProductionControlTowerOrder> = [
        {
            title: 'Đơn hàng / mã hàng',
            key: 'order',
            width: 220,
            fixed: 'left',
            render: (_, order) => (
                <button type='button' className='production-tower-order-link' onClick={() => setSelected(order)}>
                    <strong>{order.code}</strong>
                    <span>
                        {order.itemCode} · {order.customerName || 'Chưa có khách hàng'}
                    </span>
                </button>
            ),
        },
        {
            title: 'Tiến độ thực tế',
            key: 'progress',
            width: 190,
            render: (_, order) => (
                <div className='production-tower-progress'>
                    <span>
                        <strong>{number(order.progress.producedQuantity)}</strong> / {number(order.totalQuantity)} SP
                    </span>
                    <Progress
                        percent={Math.min(100, order.progress.completionPercent)}
                        showInfo={false}
                        strokeColor={order.severity === 'critical' ? '#c4320a' : '#1677ff'}
                        size='small'
                    />
                    <small>Còn {number(order.progress.remainingQuantity)} SP</small>
                </div>
            ),
        },
        {
            title: 'Kế hoạch còn lại',
            key: 'plan',
            width: 165,
            render: (_, order) => (
                <div className='production-tower-stack'>
                    <strong>{number(order.planCoveragePercent)}% đã phủ</strong>
                    <span>{number(order.scheduledQuantity)} SP đã ban hành</span>
                    {order.draftQuantity ? <small>+ {number(order.draftQuantity)} SP nháp</small> : null}
                </div>
            ),
        },
        {
            title: 'Dự báo hoàn thành',
            key: 'forecast',
            width: 175,
            render: (_, order) => (
                <div className='production-tower-stack'>
                    <Tag color={forecastMeta[order.forecastStatus].color}>
                        {forecastMeta[order.forecastStatus].label}
                    </Tag>
                    <strong>{date(order.forecastDate)}</strong>
                    <span>Hạn {date(order.dueDate)}</span>
                </div>
            ),
        },
        {
            title: 'Vật tư',
            key: 'material',
            width: 145,
            render: (_, order) => (
                <div className='production-tower-stack'>
                    <Tag color={materialMeta[order.material.status].color}>
                        {materialMeta[order.material.status].label}
                    </Tag>
                    <span>{order.material.reservationStatus === 'reserved' ? 'Đã giữ tồn' : 'Chưa giữ đủ tồn'}</span>
                </div>
            ),
        },
        {
            title: 'Ngoại lệ',
            key: 'exceptions',
            width: 220,
            render: (_, order) => (
                <button
                    type='button'
                    className={`production-tower-exception-cell is-${order.severity}`}
                    onClick={() => setSelected(order)}
                >
                    <strong>{order.exceptions[0]?.title || 'Không có cảnh báo'}</strong>
                    <span>
                        {order.exceptions.length
                            ? `${order.exceptions.length} vấn đề cần xem`
                            : 'Đang vận hành ổn định'}
                    </span>
                    <ArrowRightOutlined />
                </button>
            ),
        },
    ];

    if (towerQuery.isLoading && plantId) {
        return (
            <div className='production-page production-tower-page'>
                <Skeleton active paragraph={{ rows: 16 }} />
            </div>
        );
    }

    return (
        <div className='production-page production-tower-page'>
            <section className='production-workbench-header production-tower-header'>
                <div className='production-workbench-title'>
                    <span className='production-kicker'>Kế hoạch - thực tế · Phase 5</span>
                    <Title level={2}>Control Tower sản xuất</Title>
                    <Text type='secondary'>
                        Một nguồn số liệu cho tiến độ đơn, vật tư, dự báo giao hàng và việc cần xử lý.
                    </Text>
                </div>
                <div className='production-tower-controls'>
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
                    <Select
                        value={windowDays}
                        onChange={setWindowDays}
                        options={[14, 30, 60, 90].map((value) => ({ value, label: `${value} ngày tới` }))}
                    />
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() => towerQuery.refetch()}
                        loading={towerQuery.isFetching}
                    >
                        Làm mới
                    </Button>
                </div>
            </section>

            {towerQuery.isError ? (
                <Alert
                    type='error'
                    showIcon
                    message='Không tải được Control Tower'
                    description={errorText(towerQuery.error)}
                />
            ) : null}

            {report ? (
                <>
                    <section className='production-tower-kpis' aria-label='Tổng quan điều hành'>
                        <div>
                            <span>Đơn đang mở</span>
                            <strong>{number(report.summary.openOrders)}</strong>
                            <small>{number(report.summary.remainingQuantity)} SP còn lại</small>
                        </div>
                        <div className={report.summary.criticalOrders ? 'is-danger' : ''}>
                            <span>Cần xử lý ngay</span>
                            <strong>{number(report.summary.criticalOrders)}</strong>
                            <small>{number(report.summary.warningOrders)} đơn cần theo dõi</small>
                        </div>
                        <div className={report.summary.forecastLateOrders ? 'is-danger' : ''}>
                            <span>Dự báo trễ</span>
                            <strong>{number(report.summary.forecastLateOrders)}</strong>
                            <small>theo lịch và nhịp thực tế</small>
                        </div>
                        <div className={report.summary.materialBlockedOrders ? 'is-warning' : ''}>
                            <span>Vướng vật tư</span>
                            <strong>{number(report.summary.materialBlockedOrders)}</strong>
                            <small>{number(report.summary.statusMismatchOrders)} trạng thái cần đồng bộ</small>
                        </div>
                        <div>
                            <span>Độ phủ kế hoạch</span>
                            <strong>{number(report.summary.planCoveragePercent)}%</strong>
                            <small>{number(report.summary.unplannedQuantity)} SP chưa xếp</small>
                        </div>
                        <div className='is-accent'>
                            <span>Sản lượng hôm nay</span>
                            <strong>{number(report.summary.actualToday)}</strong>
                            <small>cập nhật {dayjs(report.generatedAt).format('HH:mm')}</small>
                        </div>
                    </section>

                    <section className='production-tower-command'>
                        <div>
                            <SafetyCertificateOutlined />
                            <span>
                                <strong>Vòng kín trạng thái đơn hàng</strong>
                                <small>Sản lượng thực tế tự kích hoạt trạng thái đang sản xuất và hoàn thành.</small>
                            </span>
                        </div>
                        <Button
                            icon={<SyncOutlined />}
                            loading={syncMutation.isPending}
                            onClick={() => syncMutation.mutate(undefined)}
                        >
                            Đối soát trạng thái
                        </Button>
                    </section>

                    <section className='production-tower-workspace'>
                        <div className='production-tower-priority'>
                            <header>
                                <div>
                                    <strong>Ưu tiên xử lý</strong>
                                    <span>Ngoại lệ ảnh hưởng trực tiếp đến hạn giao</span>
                                </div>
                                <Tag color={visibleExceptions.length ? 'red' : 'green'}>{visibleExceptions.length}</Tag>
                            </header>
                            <div className='production-tower-priority-list'>
                                {visibleExceptions.length ? (
                                    visibleExceptions.map((exception, index) => (
                                        <button
                                            key={`${exception.orderId}-${exception.code}-${index}`}
                                            type='button'
                                            className={`is-${exception.severity}`}
                                            onClick={() => actionFor(exception)}
                                        >
                                            <i>{exceptionIcon(exception.severity)}</i>
                                            <span>
                                                <strong>
                                                    {exception.orderCode} · {exception.title}
                                                </strong>
                                                <small>{exception.description}</small>
                                            </span>
                                            <ArrowRightOutlined />
                                        </button>
                                    ))
                                ) : (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description='Không có ngoại lệ nghiêm trọng'
                                    />
                                )}
                            </div>
                        </div>
                        <div className='production-tower-rhythm'>
                            <header>
                                <strong>Nhịp điều hành</strong>
                                <span>So sánh phần còn lại với cam kết đã ban hành</span>
                            </header>
                            <div>
                                <span>
                                    <small>Đã xếp chắc chắn</small>
                                    <strong>
                                        {number(report.summary.remainingQuantity - report.summary.unplannedQuantity)} SP
                                    </strong>
                                </span>
                                <span>
                                    <small>Chưa có lịch</small>
                                    <strong>{number(report.summary.unplannedQuantity)} SP</strong>
                                </span>
                            </div>
                            <Progress
                                percent={Math.min(100, report.summary.planCoveragePercent)}
                                strokeColor='#146c5a'
                                trailColor='#e7e9ee'
                            />
                            <p>
                                <ClockCircleOutlined /> Dự báo chỉ dùng kế hoạch đã ban hành và nhịp thực tế gần nhất;
                                bản nháp không được coi là cam kết.
                            </p>
                        </div>
                    </section>

                    <section className='production-tower-orders'>
                        <header className='production-tower-orders__head'>
                            <div>
                                <strong>Danh mục cam kết giao hàng</strong>
                                <span>{filteredOrders.length} đơn trong phạm vi điều hành</span>
                            </div>
                            <Segmented
                                value={severity}
                                onChange={(value) => setSeverity(value as typeof severity)}
                                options={[
                                    { value: 'all', label: `Tất cả ${report.orders.length}` },
                                    { value: 'critical', label: `Khẩn ${report.summary.criticalOrders}` },
                                    { value: 'warning', label: `Theo dõi ${report.summary.warningOrders}` },
                                    { value: 'normal', label: 'Ổn định' },
                                ]}
                            />
                        </header>
                        {filteredOrders.length ? (
                            isCompact ? (
                                <div className='production-tower-cards'>
                                    {filteredOrders.map((order) => (
                                        <article
                                            key={order.id}
                                            className={`production-tower-card is-${order.severity}`}
                                        >
                                            <button type='button' onClick={() => setSelected(order)}>
                                                <header>
                                                    <span>
                                                        <strong>{order.code}</strong>
                                                        <small>
                                                            {order.itemCode} · hạn {date(order.dueDate)}
                                                        </small>
                                                    </span>
                                                    <Tag color={forecastMeta[order.forecastStatus].color}>
                                                        {forecastMeta[order.forecastStatus].label}
                                                    </Tag>
                                                </header>
                                                <div className='production-tower-card__progress'>
                                                    <span>
                                                        <strong>{number(order.progress.producedQuantity)}</strong> /{' '}
                                                        {number(order.totalQuantity)} SP
                                                    </span>
                                                    <Progress
                                                        percent={Math.min(100, order.progress.completionPercent)}
                                                        showInfo={false}
                                                        size='small'
                                                    />
                                                </div>
                                                <dl>
                                                    <div>
                                                        <dt>Còn lại</dt>
                                                        <dd>{number(order.progress.remainingQuantity)}</dd>
                                                    </div>
                                                    <div>
                                                        <dt>Đã phủ lịch</dt>
                                                        <dd>{number(order.planCoveragePercent)}%</dd>
                                                    </div>
                                                    <div>
                                                        <dt>Dự báo</dt>
                                                        <dd>{date(order.forecastDate)}</dd>
                                                    </div>
                                                </dl>
                                                <footer>
                                                    <span>{order.exceptions[0]?.title || 'Không có cảnh báo'}</span>
                                                    <ArrowRightOutlined />
                                                </footer>
                                            </button>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <Table
                                    rowKey='id'
                                    columns={columns}
                                    dataSource={filteredOrders}
                                    pagination={{ pageSize: 12, showSizeChanger: false }}
                                    scroll={{ x: 1120 }}
                                    size='middle'
                                />
                            )
                        ) : (
                            <Empty description='Không có đơn phù hợp bộ lọc' />
                        )}
                    </section>
                </>
            ) : null}

            <Drawer
                open={Boolean(selected)}
                onClose={() => setSelected(undefined)}
                width={isCompact ? '100%' : 720}
                title={selected ? `${selected.code} · ${selected.itemCode}` : 'Chi tiết đơn hàng'}
                className='production-tower-drawer'
            >
                {selected ? (
                    <div className='production-tower-detail'>
                        <section className='production-tower-detail__status'>
                            <span>
                                <small>Trạng thái</small>
                                <strong>{orderStatusLabel[selected.status]}</strong>
                            </span>
                            <span>
                                <small>Hoàn thành</small>
                                <strong>{number(selected.progress.completionPercent)}%</strong>
                            </span>
                            <span>
                                <small>Còn lại</small>
                                <strong>{number(selected.progress.remainingQuantity)} SP</strong>
                            </span>
                            <span>
                                <small>Dự báo</small>
                                <strong>{date(selected.forecastDate)}</strong>
                            </span>
                        </section>

                        <section className='production-tower-detail__section'>
                            <header>
                                <strong>Đường đi kế hoạch - thực tế</strong>
                                <span>30 ngày gần nhất và kế hoạch trong kỳ</span>
                            </header>
                            <div className='production-tower-trajectory'>
                                {[
                                    ...new Set([
                                        ...selected.dailyActual.map((row) => row.date),
                                        ...selected.plans.map((row) => row.date),
                                    ]),
                                ]
                                    .sort()
                                    .map((pointDate) => {
                                        const actual =
                                            selected.dailyActual.find((row) => row.date === pointDate)?.quantity || 0;
                                        const published = selected.plans
                                            .filter((row) => row.date === pointDate && row.status === 'published')
                                            .reduce((sum, row) => sum + row.quantity, 0);
                                        const draft = selected.plans
                                            .filter((row) => row.date === pointDate && row.status === 'draft')
                                            .reduce((sum, row) => sum + row.quantity, 0);
                                        const max = Math.max(1, actual, published, draft);
                                        return (
                                            <div key={pointDate}>
                                                <time>{dayjs(pointDate).format('DD/MM')}</time>
                                                <div>
                                                    <span
                                                        className='is-published'
                                                        style={{ width: `${(published / max) * 100}%` }}
                                                    >
                                                        {published ? `${number(published)} KH` : ''}
                                                    </span>
                                                    <span
                                                        className='is-actual'
                                                        style={{ width: `${(actual / max) * 100}%` }}
                                                    >
                                                        {actual ? `${number(actual)} TT` : ''}
                                                    </span>
                                                    {draft ? (
                                                        <span
                                                            className='is-draft'
                                                            style={{ width: `${(draft / max) * 100}%` }}
                                                        >
                                                            {number(draft)} nháp
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                {!selected.dailyActual.length && !selected.plans.length ? (
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có đường dữ liệu' />
                                ) : null}
                            </div>
                        </section>

                        <section className='production-tower-detail__section'>
                            <header>
                                <strong>Chẩn đoán điều hành</strong>
                                <span>{selected.exceptions.length} tín hiệu</span>
                            </header>
                            <div className='production-tower-detail__exceptions'>
                                {selected.exceptions.length ? (
                                    selected.exceptions.map((exception, index) => (
                                        <article
                                            key={`${exception.code}-${index}`}
                                            className={`is-${exception.severity}`}
                                        >
                                            <i>{exceptionIcon(exception.severity)}</i>
                                            <span>
                                                <strong>{exception.title}</strong>
                                                <small>{exception.description}</small>
                                            </span>
                                            <Button type='link' onClick={() => actionFor(exception, selected)}>
                                                Xử lý
                                            </Button>
                                        </article>
                                    ))
                                ) : (
                                    <Alert
                                        type='success'
                                        showIcon
                                        message='Đơn hàng đang vận hành trong ngưỡng kiểm soát'
                                    />
                                )}
                            </div>
                        </section>

                        <section className='production-tower-detail__facts'>
                            <span>
                                <small>Nhịp thực tế</small>
                                <strong>{number(selected.recentDailyRate)} SP/ngày</strong>
                            </span>
                            <span>
                                <small>Mẫu dữ liệu</small>
                                <strong>{selected.recentSampleCount} ngày</strong>
                            </span>
                            <span>
                                <small>Hiệu suất gần đây</small>
                                <strong>
                                    {selected.recentPerformancePercent === undefined
                                        ? 'Chưa đủ'
                                        : `${number(selected.recentPerformancePercent)}%`}
                                </strong>
                            </span>
                            <span>
                                <small>Độ tin cậy</small>
                                <strong>{selected.forecastConfidence.toUpperCase()}</strong>
                            </span>
                        </section>
                    </div>
                ) : null}
            </Drawer>
        </div>
    );
};

export default ProductionControlTowerPage;
