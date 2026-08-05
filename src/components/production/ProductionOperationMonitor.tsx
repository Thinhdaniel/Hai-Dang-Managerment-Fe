import {
    AlertOutlined,
    ApartmentOutlined,
    CheckCircleFilled,
    ClockCircleOutlined,
    EyeOutlined,
    FieldTimeOutlined,
    FilterOutlined,
    SearchOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { Button, Empty, Input, Progress, Segmented, Select, Table, Tag, Typography, type TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import type {
    ProductionDay,
    ProductionMonitor,
    ProductionMonitorOperation,
    ProductionMonitorOperationStatus,
} from '../../core/types/production';
import ProductionOperationDetailDrawer from './ProductionOperationDetailDrawer';

const { Text, Title } = Typography;
const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(value);

type OperationFilter = 'all' | 'missing' | 'behind' | 'stable';

type Props = {
    day: ProductionDay;
    monitor: ProductionMonitor;
    isMobile: boolean;
    onOpenEntry: (lineId?: string, slotKey?: string) => void;
};

const statusMeta: Record<
    ProductionMonitorOperationStatus,
    { label: string; color: string; rank: number; tone: string }
> = {
    critical: { label: 'Nghiêm trọng', color: 'red', rank: 0, tone: 'danger' },
    missing: { label: 'Thiếu nhập', color: 'volcano', rank: 1, tone: 'danger' },
    at_risk: { label: 'Dưới khoán', color: 'gold', rank: 2, tone: 'warning' },
    waiting: { label: 'Chờ đến giờ', color: 'blue', rank: 3, tone: 'neutral' },
    reference: { label: 'Tham khảo', color: 'default', rank: 4, tone: 'neutral' },
    on_track: { label: 'Đúng nhịp', color: 'green', rank: 5, tone: 'success' },
};

const matchesFilter = (operation: ProductionMonitorOperation, filter: OperationFilter) => {
    if (filter === 'missing') return operation.status === 'missing';
    if (filter === 'behind') return operation.status === 'critical' || operation.status === 'at_risk';
    if (filter === 'stable') return operation.status === 'on_track' || operation.status === 'reference';
    return true;
};

const ProductionOperationMonitor = ({ day, monitor, isMobile, onOpenEntry }: Props) => {
    const [filter, setFilter] = useState<OperationFilter>('all');
    const [lineId, setLineId] = useState('all');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<ProductionMonitorOperation>();
    const summary = monitor.operationSummary || {
        trackedLines: 0,
        trackCount: 0,
        requiredTrackCount: 0,
        expectedEntries: 0,
        reportedEntries: 0,
        missingEntries: 0,
        coveragePercent: 100,
        behindTrackCount: 0,
        onTrackTrackCount: 0,
        currentTrackCount: 0,
        currentReportedCount: 0,
        criticalAlerts: 0,
        warningAlerts: 0,
    };
    const operations = monitor.operationPerformance || [];
    const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');

    const lineOptions = useMemo(
        () => [
            { value: 'all', label: 'Tất cả chuyền' },
            ...[...new Map(operations.map((operation) => [operation.lineId, operation.lineCode])).entries()]
                .sort((left, right) => left[1].localeCompare(right[1], 'vi-VN', { numeric: true }))
                .map(([value, label]) => ({ value, label })),
        ],
        [operations]
    );

    const filtered = useMemo(
        () =>
            operations
                .filter((operation) => lineId === 'all' || operation.lineId === lineId)
                .filter((operation) => matchesFilter(operation, filter))
                .filter((operation) => {
                    if (!normalizedSearch) return true;
                    return [
                        operation.lineCode,
                        operation.lineName,
                        operation.leaderName,
                        operation.itemCode,
                        operation.operationCode,
                        operation.operationName,
                    ]
                        .filter(Boolean)
                        .some((value) => String(value).toLocaleLowerCase('vi-VN').includes(normalizedSearch));
                })
                .sort(
                    (left, right) =>
                        statusMeta[left.status].rank - statusMeta[right.status].rank ||
                        left.lineCode.localeCompare(right.lineCode, 'vi-VN', { numeric: true }) ||
                        left.sortOrder - right.sortOrder ||
                        left.operationCode.localeCompare(right.operationCode)
                ),
        [filter, lineId, normalizedSearch, operations]
    );

    const grouped = useMemo(() => {
        const groups = new Map<
            string,
            {
                key: string;
                lineCode: string;
                lineName?: string;
                itemCode: string;
                operations: ProductionMonitorOperation[];
            }
        >();
        filtered.forEach((operation) => {
            const key = `${operation.lineId}:${operation.itemCode}`;
            const existing = groups.get(key) || {
                key,
                lineCode: operation.lineCode,
                lineName: operation.lineName || operation.leaderName,
                itemCode: operation.itemCode,
                operations: [],
            };
            existing.operations.push(operation);
            groups.set(key, existing);
        });
        return [...groups.values()];
    }, [filtered]);

    const alertByTrack = useMemo(
        () => new Map(operations.map((operation) => [operation.trackId, operation])),
        [operations]
    );

    const columns: TableColumnsType<ProductionMonitorOperation> = [
        {
            title: 'Chuyền / mã hàng',
            key: 'scope',
            width: 180,
            fixed: 'left',
            render: (_, operation) => (
                <button type='button' className='production-operation-scope' onClick={() => setSelected(operation)}>
                    <span>{operation.lineCode}</span>
                    <div>
                        <strong>{operation.itemCode}</strong>
                        <small>{operation.leaderName || operation.lineName || 'Chưa có tổ trưởng'}</small>
                    </div>
                </button>
            ),
        },
        {
            title: 'Công đoạn',
            key: 'operation',
            width: 220,
            render: (_, operation) => (
                <div className='production-operation-name'>
                    <span>
                        <ApartmentOutlined />
                    </span>
                    <div>
                        <strong>{operation.operationName}</strong>
                        <small>
                            {operation.operationCode} · {operation.required ? 'bắt buộc' : 'tham khảo'}
                        </small>
                    </div>
                </div>
            ),
        },
        {
            title: 'Khung hiện tại',
            key: 'current',
            width: 160,
            render: (_, operation) =>
                operation.currentSlot ? (
                    <div className='production-operation-current'>
                        <strong>
                            {operation.currentSlot.reported ? number(operation.currentSlot.actual) : '—'}
                            <small> / {number(operation.currentSlot.target)}</small>
                        </strong>
                        <span className={operation.currentSlot.reported ? 'is-reported' : ''}>
                            {operation.currentSlot.reported ? 'Đã nhập' : 'Đang chạy'}
                        </span>
                    </div>
                ) : (
                    <Text type='secondary'>Ngoài phạm vi</Text>
                ),
        },
        {
            title: 'Lũy kế đến giờ',
            key: 'cumulative',
            width: 205,
            render: (_, operation) => (
                <div className='production-operation-progress'>
                    <div>
                        <strong>{number(operation.actualToNow)}</strong>
                        <span>
                            / {number(operation.targetToNow)} {operation.unit}
                        </span>
                    </div>
                    {operation.targetToNow > 0 ? (
                        <Progress
                            percent={Math.min(100, Math.round(operation.achievementPercent))}
                            showInfo={false}
                            size='small'
                            strokeColor={
                                operation.achievementPercent >= 95
                                    ? '#067647'
                                    : operation.achievementPercent >= 80
                                      ? '#b54708'
                                      : '#b42318'
                            }
                        />
                    ) : null}
                </div>
            ),
        },
        {
            title: 'Mức đạt',
            dataIndex: 'achievementPercent',
            width: 105,
            align: 'right',
            render: (value: number, operation) => (
                <strong className={`tone-${statusMeta[operation.status].tone}`}>
                    {operation.targetToNow > 0 ? `${value.toFixed(1)}%` : '—'}
                </strong>
            ),
        },
        {
            title: 'Độ phủ',
            key: 'coverage',
            width: 115,
            align: 'center',
            render: (_, operation) =>
                operation.required ? (
                    <span className={operation.missingSlotKeys.length ? 'production-monitor-coverage is-missing' : ''}>
                        {operation.reportedEntries}/{operation.expectedEntries}
                    </span>
                ) : (
                    <Tag>Tham khảo</Tag>
                ),
        },
        {
            title: 'Cập nhật cuối',
            key: 'updated',
            width: 150,
            render: (_, operation) => (
                <div className='production-operation-updated'>
                    <strong>
                        {operation.lastUpdatedAt ? dayjs(operation.lastUpdatedAt).format('HH:mm DD/MM') : 'Chưa có'}
                    </strong>
                    <small>{operation.lastEnteredByName || '—'}</small>
                </div>
            ),
        },
        {
            title: 'Tình trạng',
            dataIndex: 'status',
            width: 125,
            render: (status: ProductionMonitorOperationStatus) => (
                <Tag color={statusMeta[status].color}>{statusMeta[status].label}</Tag>
            ),
        },
        {
            title: '',
            key: 'action',
            width: 52,
            fixed: 'right',
            render: (_, operation) => (
                <Button
                    type='text'
                    icon={<EyeOutlined />}
                    aria-label={`Xem ${operation.operationName}`}
                    onClick={() => setSelected(operation)}
                />
            ),
        },
    ];

    if (!operations.length) {
        return (
            <section className='production-operation-monitor production-operation-monitor--empty'>
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                        <div>
                            <strong>Ngày này chưa theo dõi công đoạn trọng yếu</strong>
                            <p>Gán công đoạn cho mã hàng và bật theo dõi tại màn nhập sản lượng.</p>
                        </div>
                    }
                >
                    <Button type='primary' onClick={() => onOpenEntry()}>
                        Mở sổ nhập sản lượng
                    </Button>
                </Empty>
            </section>
        );
    }

    return (
        <section className='production-operation-monitor'>
            <div className='production-operation-monitor__kpis'>
                <div className='is-primary'>
                    <span>
                        <ApartmentOutlined /> Công đoạn đang quản lý
                    </span>
                    <strong>{number(summary.trackCount)}</strong>
                    <small>{summary.trackedLines} chuyền có theo dõi</small>
                </div>
                <div>
                    <span>
                        <FieldTimeOutlined /> Độ phủ đến hạn
                    </span>
                    <strong>{summary.expectedEntries ? `${summary.coveragePercent.toFixed(1)}%` : '—'}</strong>
                    <small>
                        {summary.reportedEntries}/{summary.expectedEntries} lượt bắt buộc
                    </small>
                </div>
                <div className={summary.missingEntries ? 'has-danger' : ''}>
                    <span>
                        <ClockCircleOutlined /> Thiếu nhập
                    </span>
                    <strong>{number(summary.missingEntries)}</strong>
                    <small>{summary.missingEntries ? 'cần bổ sung ngay' : 'không còn lượt thiếu'}</small>
                </div>
                <div className={summary.behindTrackCount ? 'has-warning' : ''}>
                    <span>
                        <AlertOutlined /> Dưới khoán
                    </span>
                    <strong>{number(summary.behindTrackCount)}</strong>
                    <small>công đoạn cần kiểm tra nhịp</small>
                </div>
                <div>
                    <span>
                        <CheckCircleFilled /> Khung hiện tại
                    </span>
                    <strong>
                        {summary.currentReportedCount}/{summary.currentTrackCount}
                    </strong>
                    <small>
                        {summary.lastUpdatedAt
                            ? `cập nhật ${dayjs(summary.lastUpdatedAt).format('HH:mm')}`
                            : 'chưa phát sinh cập nhật'}
                    </small>
                </div>
            </div>

            <div className='production-operation-monitor__toolbar'>
                <div>
                    <Title level={4}>Nhịp công đoạn theo chuyền</Title>
                    <Text type='secondary'>Mỗi dòng là một bán thành phẩm độc lập, không cộng chéo thành tổng.</Text>
                </div>
                <div className='production-operation-monitor__filters'>
                    <Input
                        allowClear
                        value={search}
                        prefix={<SearchOutlined />}
                        placeholder='Tìm chuyền, mã hàng, công đoạn'
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <Select value={lineId} options={lineOptions} suffixIcon={<FilterOutlined />} onChange={setLineId} />
                    <Segmented<OperationFilter>
                        value={filter}
                        onChange={setFilter}
                        options={[
                            { value: 'all', label: `Tất cả ${operations.length}` },
                            { value: 'missing', label: `Thiếu ${summary.missingEntries}` },
                            { value: 'behind', label: `Chậm ${summary.behindTrackCount}` },
                            { value: 'stable', label: 'Ổn định' },
                        ]}
                    />
                </div>
            </div>

            {(monitor.operationAlerts || []).length ? (
                <div className='production-operation-monitor__alerts'>
                    <div>
                        <WarningFilled />
                        <span>
                            <strong>Cần xử lý trước</strong>
                            <small>{(monitor.operationAlerts || []).length} tín hiệu công đoạn đang mở</small>
                        </span>
                    </div>
                    <div>
                        {(monitor.operationAlerts || []).slice(0, isMobile ? 3 : 5).map((alert) => (
                            <button
                                type='button'
                                className={`severity-${alert.severity}`}
                                key={alert.id}
                                onClick={() => setSelected(alertByTrack.get(alert.trackId))}
                            >
                                <strong>{alert.title}</strong>
                                <small>{alert.description}</small>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {filtered.length ? (
                isMobile ? (
                    <div className='production-operation-mobile-groups'>
                        {grouped.map((group) => (
                            <article key={group.key}>
                                <header>
                                    <span>{group.lineCode}</span>
                                    <div>
                                        <strong>Mã {group.itemCode}</strong>
                                        <small>{group.lineName || 'Chuyền sản xuất'}</small>
                                    </div>
                                    <em>{group.operations.length} CĐ</em>
                                </header>
                                <div>
                                    {group.operations.map((operation) => {
                                        const meta = statusMeta[operation.status];
                                        return (
                                            <button
                                                type='button'
                                                className={`tone-${meta.tone}`}
                                                key={operation.key}
                                                onClick={() => setSelected(operation)}
                                            >
                                                <span className='production-operation-mobile-groups__icon'>
                                                    <ApartmentOutlined />
                                                </span>
                                                <span className='production-operation-mobile-groups__name'>
                                                    <strong>{operation.operationName}</strong>
                                                    <small>
                                                        {operation.operationCode} ·{' '}
                                                        {operation.required ? 'bắt buộc' : 'tham khảo'}
                                                    </small>
                                                </span>
                                                <span className='production-operation-mobile-groups__value'>
                                                    <strong>
                                                        {number(operation.actualToNow)}
                                                        <small>/{number(operation.targetToNow)}</small>
                                                    </strong>
                                                    <em>{meta.label}</em>
                                                </span>
                                                <EyeOutlined />
                                            </button>
                                        );
                                    })}
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <Table<ProductionMonitorOperation>
                        className='production-operation-monitor__table'
                        rowKey='key'
                        columns={columns}
                        dataSource={filtered}
                        pagination={false}
                        scroll={{ x: 1310, y: 620 }}
                    />
                )
            ) : (
                <div className='production-operation-monitor__no-result'>
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có công đoạn phù hợp bộ lọc' />
                </div>
            )}

            <ProductionOperationDetailDrawer
                open={Boolean(selected)}
                day={day}
                operation={selected}
                onClose={() => setSelected(undefined)}
                onOpenEntry={(selectedLineId, slotKey) => onOpenEntry(selectedLineId, slotKey)}
            />
        </section>
    );
};

export default ProductionOperationMonitor;
