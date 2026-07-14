import { useEffect, useMemo, useState } from 'react';
import { App, Button, Drawer, Empty, Grid, Progress, Segmented, Select, Skeleton, Tabs, Tag, Tooltip } from 'antd';
import {
    AlertTriangle,
    ArrowRight,
    Building2,
    CalendarRange,
    CheckCircle2,
    ChevronRight,
    ClipboardCheck,
    Clock3,
    Gauge,
    Info,
    PackageSearch,
    RefreshCw,
    ShieldCheck,
    TrendingDown,
    TrendingUp,
    Wrench,
} from 'lucide-react';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    useExecutiveBriefingDetail,
    useExecutiveBriefingHistory,
    useLatestExecutiveBriefing,
    useRefreshExecutiveBriefing,
} from '../../core/hooks/useExecutiveBriefing';
import type {
    BriefingContentItem,
    BriefingEvidence,
    BriefingPeriodType,
    BriefingPlantPerformance,
    BriefingSeverity,
    ExecutiveBriefing,
} from '../../core/types/executiveBriefing';

const formatNumber = (value = 0) => Math.round(value).toLocaleString('vi-VN');
const formatMoney = (value = 0) => `${Math.round(value).toLocaleString('vi-VN')} đ`;
const formatCompactMoney = (value = 0) =>
    new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 })
        .format(value)
        .replace('N', 'nghìn') + ' đ';

const severityMeta: Record<BriefingSeverity, { label: string; icon: typeof Info }> = {
    positive: { label: 'Tích cực', icon: CheckCircle2 },
    info: { label: 'Theo dõi', icon: Info },
    warning: { label: 'Cần chú ý', icon: AlertTriangle },
    critical: { label: 'Ưu tiên cao', icon: AlertTriangle },
};

const getErrorMessage = (error: unknown) => {
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }
    return 'Không thể tải bản tin lúc này.';
};

const DeltaLabel = ({ value }: { value: number | null }) => {
    if (value === null) return <span className='briefing-delta briefing-delta--neutral'>Kỳ trước chưa phát sinh</span>;
    if (value === 0) return <span className='briefing-delta briefing-delta--neutral'>Không đổi so với kỳ trước</span>;
    const Icon = value > 0 ? TrendingUp : TrendingDown;
    return (
        <span className={`briefing-delta ${value > 0 ? 'briefing-delta--up' : 'briefing-delta--down'}`}>
            <Icon size={13} strokeWidth={2} /> {Math.abs(value).toLocaleString('vi-VN')}%
        </span>
    );
};

const EvidencePills = ({ item, evidence }: { item: BriefingContentItem; evidence: Map<string, BriefingEvidence> }) => {
    const rows = item.evidenceKeys.map((key) => evidence.get(key)).filter(Boolean) as BriefingEvidence[];
    if (!rows.length) return null;
    return (
        <div className='briefing-evidence-list' aria-label='Số liệu đối chiếu'>
            {rows.map((row) => (
                <Tooltip
                    key={row.key}
                    title={row.formattedPrevious ? `Kỳ trước: ${row.formattedPrevious}` : 'Số liệu tại kỳ báo cáo'}
                >
                    <span className={`briefing-evidence briefing-evidence--${row.tone}`}>
                        <span>{row.label}</span>
                        <strong>{row.formattedValue}</strong>
                    </span>
                </Tooltip>
            ))}
        </div>
    );
};

const BriefingItemList = ({
    items,
    evidence,
    emptyText,
    onAction,
}: {
    items: BriefingContentItem[];
    evidence: Map<string, BriefingEvidence>;
    emptyText: string;
    onAction: (url: string) => void;
}) => {
    if (!items.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
    return (
        <div className='briefing-item-list'>
            {items.map((item) => {
                const meta = severityMeta[item.severity];
                const Icon = meta.icon;
                return (
                    <article key={item.id} className={`briefing-item briefing-item--${item.severity}`}>
                        <span className='briefing-item__icon' aria-hidden='true'>
                            <Icon size={17} strokeWidth={2} />
                        </span>
                        <div className='min-w-0 flex-1'>
                            <div className='briefing-item__heading'>
                                <strong>{item.title}</strong>
                                <span>{meta.label}</span>
                            </div>
                            <p>{item.detail}</p>
                            <EvidencePills item={item} evidence={evidence} />
                            {item.actionUrl ? (
                                <button
                                    type='button'
                                    className='briefing-inline-action'
                                    onClick={() => onAction(item.actionUrl!)}
                                >
                                    {item.actionLabel || 'Mở nghiệp vụ'} <ArrowRight size={14} />
                                </button>
                            ) : null}
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

const PlantList = ({ rows }: { rows: BriefingPlantPerformance[] }) => {
    if (!rows.length) return <Empty description='Chưa có dữ liệu theo cơ sở' />;
    return (
        <div className='briefing-plant-list'>
            <div className='briefing-plant-list__header' aria-hidden='true'>
                <span>Cơ sở</span>
                <span>Sẵn sàng</span>
                <span>Bảo trì</span>
                <span>Tồn thấp</span>
                <span>Kiểm kê</span>
            </div>
            {rows.map((plant) => (
                <div key={plant.plantId} className='briefing-plant-row'>
                    <div className='briefing-plant-row__name'>
                        <span className={`briefing-plant-status briefing-plant-status--${plant.attentionLevel}`} />
                        <span>
                            <strong>{plant.plantName}</strong>
                            <small>
                                {formatNumber(plant.activeMachines)}/{formatNumber(plant.operationalMachines)} máy hoạt
                                động
                            </small>
                        </span>
                    </div>
                    <div className='briefing-plant-row__metric briefing-plant-row__availability'>
                        <Progress
                            percent={Math.round(plant.availabilityPct)}
                            size='small'
                            showInfo={false}
                            strokeColor={
                                plant.availabilityPct >= 90
                                    ? '#16876d'
                                    : plant.availabilityPct >= 75
                                      ? '#d97706'
                                      : '#dc2626'
                            }
                        />
                        <strong>{formatNumber(plant.availabilityPct)}%</strong>
                    </div>
                    <div className='briefing-plant-row__metric' data-label='Bảo trì'>
                        <strong>{formatNumber(plant.overdueTickets)}</strong>
                        <small>quá hạn</small>
                    </div>
                    <div className='briefing-plant-row__metric' data-label='Tồn thấp'>
                        <strong>{formatNumber(plant.lowStockCount)}</strong>
                        <small>vật tư</small>
                    </div>
                    <div className='briefing-plant-row__metric' data-label='Kiểm kê'>
                        <strong>{formatNumber(plant.stocktakeAnomalies)}</strong>
                        <small>bất thường</small>
                    </div>
                </div>
            ))}
        </div>
    );
};

const DrawerOverview = ({ briefing, onAction }: { briefing: ExecutiveBriefing; onAction: (url: string) => void }) => {
    const evidence = useMemo(
        () => new Map(briefing.snapshot.evidence.map((entry) => [entry.key, entry])),
        [briefing.snapshot.evidence]
    );
    const { fleet, maintenance, materials, operations } = briefing.snapshot;
    return (
        <div className='briefing-drawer-pane'>
            <section className='briefing-narrative'>
                <span className='briefing-section-kicker'>Tóm tắt điều hành</span>
                <p>{briefing.summary}</p>
            </section>

            <section>
                <div className='briefing-section-heading'>
                    <div>
                        <span className='briefing-section-kicker'>Chỉ số trọng yếu</span>
                        <h3>Trạng thái tại thời điểm chốt</h3>
                    </div>
                    <span className='briefing-section-note'>Không cộng gộp các luồng chi phí</span>
                </div>
                <div className='briefing-detail-kpis'>
                    <div>
                        <Gauge size={18} />
                        <span>Sẵn sàng</span>
                        <strong>{formatNumber(fleet.availabilityPct)}%</strong>
                        <small>{formatNumber(fleet.activeMachines)} máy hoạt động</small>
                    </div>
                    <div>
                        <Wrench size={18} />
                        <span>Bảo trì quá hạn</span>
                        <strong>{formatNumber(maintenance.overdueTickets)}</strong>
                        <small>{formatNumber(maintenance.openTickets)} phiếu đang mở</small>
                    </div>
                    <div>
                        <PackageSearch size={18} />
                        <span>Tồn thấp</span>
                        <strong>{formatNumber(materials.lowStockCount)}</strong>
                        <small>{formatNumber(materials.openPurchaseShortages)} dòng chờ giao bù</small>
                    </div>
                    <div>
                        <ClipboardCheck size={18} />
                        <span>Sai lệch vận hành</span>
                        <strong>{formatNumber(operations.mislocatedAssets + operations.stocktakeAnomalies)}</strong>
                        <small>vị trí và kiểm kê</small>
                    </div>
                </div>
            </section>

            <section className='briefing-financial-section'>
                <div className='briefing-section-heading'>
                    <div>
                        <span className='briefing-section-kicker'>Giá trị ghi nhận trong kỳ</span>
                        <h3>Ba luồng được trình bày độc lập</h3>
                    </div>
                </div>
                <div className='briefing-financial-grid'>
                    <div>
                        <span>Đơn mua đã đặt/nhận</span>
                        <strong>{formatMoney(materials.purchaseValue.current)}</strong>
                        <DeltaLabel value={materials.purchaseValue.deltaPct} />
                        <small>Giá trị cam kết mua, không phải chi phí cấp phát.</small>
                    </div>
                    <div>
                        <span>Vật tư đã cấp phát</span>
                        <strong>{formatMoney(materials.distributionValue.current)}</strong>
                        <DeltaLabel value={materials.distributionValue.deltaPct} />
                        <small>Giá trị xuất dùng theo phiếu cấp phát đã ghi nhận.</small>
                    </div>
                    <div>
                        <span>Sửa ngoài hoàn tất</span>
                        <strong>{formatMoney(maintenance.externalRepairCost.current)}</strong>
                        <DeltaLabel value={maintenance.externalRepairCost.deltaPct} />
                        <small>Chi phí thực tế của phiếu sửa ngoài hoàn tất.</small>
                    </div>
                </div>
            </section>

            <div className='briefing-content-columns'>
                <section>
                    <div className='briefing-section-heading'>
                        <div>
                            <span className='briefing-section-kicker'>Điểm tích cực</span>
                            <h3>Kết quả đáng ghi nhận</h3>
                        </div>
                    </div>
                    <BriefingItemList
                        items={briefing.highlights}
                        evidence={evidence}
                        emptyText='Chưa có điểm nổi bật đủ dữ liệu xác nhận'
                        onAction={onAction}
                    />
                </section>
                <section>
                    <div className='briefing-section-heading'>
                        <div>
                            <span className='briefing-section-kicker'>Rủi ro</span>
                            <h3>Việc cần Ban giám đốc chú ý</h3>
                        </div>
                    </div>
                    <BriefingItemList
                        items={briefing.risks}
                        evidence={evidence}
                        emptyText='Không có cảnh báo ưu tiên cao trong kỳ'
                        onAction={onAction}
                    />
                </section>
            </div>

            <section className='briefing-actions-section'>
                <div className='briefing-section-heading'>
                    <div>
                        <span className='briefing-section-kicker'>Hành động đề xuất</span>
                        <h3>Danh sách xử lý ưu tiên</h3>
                    </div>
                </div>
                <BriefingItemList
                    items={briefing.actions}
                    evidence={evidence}
                    emptyText='Chưa có hành động cần đề xuất'
                    onAction={onAction}
                />
            </section>
        </div>
    );
};

const DataNotes = ({ briefing }: { briefing: ExecutiveBriefing }) => {
    const aiReady = briefing.generationStatus === 'ready';
    const modelLabel = aiReady ? briefing.model || briefing.provider || 'Không ghi nhận' : 'Quy tắc hệ thống';

    return (
        <div className='briefing-drawer-pane'>
            <section className={`briefing-ai-source briefing-ai-source--${aiReady ? 'ready' : 'fallback'}`}>
                <span className='briefing-ai-source__icon'>
                    {aiReady ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
                </span>
                <div>
                    <span className='briefing-section-kicker'>Phương thức diễn giải</span>
                    <strong>{aiReady ? 'AI đã hoàn tất phân tích có kiểm chứng' : 'Đang dùng quy tắc hệ thống'}</strong>
                    <p>
                        {aiReady
                            ? 'AI chỉ bổ sung cách diễn giải trên các bằng chứng đã được backend tính và đối chiếu.'
                            : `${briefing.fallbackReason || 'Nhà cung cấp AI tạm thời không khả dụng.'} Số liệu, cảnh báo và hành động vẫn được tạo từ dữ liệu thật.`}
                    </p>
                    {!aiReady && briefing.nextAiRetryAt ? (
                        <small>
                            <Clock3 size={13} /> Hệ thống tự thử lại từ{' '}
                            {dayjs(briefing.nextAiRetryAt).format('HH:mm DD/MM/YYYY')}
                        </small>
                    ) : null}
                </div>
            </section>
            {briefing.snapshot.dataWarnings.length ? (
                <section className='briefing-data-warning'>
                    <AlertTriangle size={19} />
                    <div>
                        <strong>Lưu ý chất lượng dữ liệu</strong>
                        {briefing.snapshot.dataWarnings.map((warning) => (
                            <p key={warning}>{warning}</p>
                        ))}
                    </div>
                </section>
            ) : (
                <section className='briefing-data-ok'>
                    <ShieldCheck size={20} />
                    <div>
                        <strong>Không có cảnh báo nguồn dữ liệu</strong>
                        <p>Các tập dữ liệu chính đã được tổng hợp thành công tại thời điểm chốt.</p>
                    </div>
                </section>
            )}
            <section>
                <div className='briefing-section-heading'>
                    <div>
                        <span className='briefing-section-kicker'>Phạm vi và định nghĩa</span>
                        <h3>Cách hệ thống tính các chỉ số</h3>
                    </div>
                </div>
                <div className='briefing-definition-list'>
                    {briefing.snapshot.dataDefinitions.map((definition) => (
                        <div key={definition.key}>
                            <strong>{definition.label}</strong>
                            <p>{definition.definition}</p>
                        </div>
                    ))}
                </div>
            </section>
            <section className='briefing-provenance'>
                <span className='briefing-section-kicker'>Thông tin bản tin</span>
                <dl>
                    <div>
                        <dt>Thời điểm chốt</dt>
                        <dd>{dayjs(briefing.dataAsOf).format('DD/MM/YYYY HH:mm')}</dd>
                    </div>
                    <div>
                        <dt>Kỳ so sánh</dt>
                        <dd>{briefing.comparisonLabel}</dd>
                    </div>
                    <div>
                        <dt>Phiên bản</dt>
                        <dd>v{briefing.version}</dd>
                    </div>
                    <div>
                        <dt>Nội dung</dt>
                        <dd>
                            {briefing.generationStatus === 'ready'
                                ? 'Phân tích có kiểm chứng'
                                : 'Tóm tắt xác định dự phòng'}
                        </dd>
                    </div>
                    <div>
                        <dt>Mô hình</dt>
                        <dd>{modelLabel}</dd>
                    </div>
                    {briefing.aiAttemptedAt ? (
                        <div>
                            <dt>Lần xử lý AI</dt>
                            <dd>{dayjs(briefing.aiAttemptedAt).format('DD/MM/YYYY HH:mm')}</dd>
                        </div>
                    ) : null}
                </dl>
            </section>
        </div>
    );
};

const DashboardExecutiveBriefing = () => {
    const navigate = useNavigate();
    const screens = Grid.useBreakpoint();
    const { message } = App.useApp();
    const [searchParams, setSearchParams] = useSearchParams();
    const briefingFromUrl = searchParams.get('briefing') || undefined;
    const [period, setPeriod] = useState<BriefingPeriodType>('week');
    const [drawerOpen, setDrawerOpen] = useState(Boolean(briefingFromUrl));
    const [selectedId, setSelectedId] = useState<string | undefined>(briefingFromUrl);
    const isMobile = !screens.md;

    const latestQuery = useLatestExecutiveBriefing(period);
    const detailQuery = useExecutiveBriefingDetail(selectedId);
    const historyQuery = useExecutiveBriefingHistory(period, drawerOpen);
    const refreshMutation = useRefreshExecutiveBriefing();
    const briefing = selectedId ? detailQuery.data : latestQuery.data;
    const activeQuery = selectedId ? detailQuery : latestQuery;
    const [previewBriefing, setPreviewBriefing] = useState<ExecutiveBriefing | undefined>(latestQuery.data);

    useEffect(() => {
        if (!briefingFromUrl) return;
        setSelectedId(briefingFromUrl);
        setDrawerOpen(true);
    }, [briefingFromUrl]);

    useEffect(() => {
        if (detailQuery.data?.periodType && detailQuery.data.periodType !== period) {
            setPeriod(detailQuery.data.periodType);
        }
    }, [detailQuery.data?.periodType, period]);

    useEffect(() => {
        if (latestQuery.data) setPreviewBriefing(latestQuery.data);
    }, [latestQuery.data]);

    const closeDrawer = () => {
        setDrawerOpen(false);
        setSelectedId(undefined);
        if (searchParams.has('briefing')) {
            const next = new URLSearchParams(searchParams);
            next.delete('briefing');
            setSearchParams(next, { replace: true });
        }
    };

    const changePeriod = (value: string | number) => {
        setPeriod(value as BriefingPeriodType);
        setSelectedId(undefined);
    };

    const handleAction = (url: string) => {
        closeDrawer();
        navigate(url);
    };

    const handleRefresh = async () => {
        try {
            const result = await refreshMutation.mutateAsync(period);
            setSelectedId(undefined);
            message.success(
                result.changed ? 'Đã cập nhật bản tin từ dữ liệu mới nhất' : 'Bản tin đã ở phiên bản mới nhất'
            );
        } catch (error) {
            message.error(getErrorMessage(error));
        }
    };

    const mainMetrics = previewBriefing
        ? [
              {
                  label: 'Máy sẵn sàng',
                  value: `${formatNumber(previewBriefing.snapshot.fleet.availabilityPct)}%`,
                  caption: `${formatNumber(previewBriefing.snapshot.fleet.activeMachines)} máy hoạt động`,
                  icon: Gauge,
                  tone: 'teal',
              },
              {
                  label: 'Bảo trì quá hạn',
                  value: formatNumber(previewBriefing.snapshot.maintenance.overdueTickets),
                  caption: `${formatNumber(previewBriefing.snapshot.maintenance.openTickets)} phiếu đang mở`,
                  icon: Wrench,
                  tone: previewBriefing.snapshot.maintenance.overdueTickets ? 'amber' : 'teal',
              },
              {
                  label: 'Vật tư tồn thấp',
                  value: formatNumber(previewBriefing.snapshot.materials.lowStockCount),
                  caption: 'Theo định mức đã khai báo',
                  icon: PackageSearch,
                  tone: previewBriefing.snapshot.materials.lowStockCount ? 'rose' : 'teal',
              },
              {
                  label: 'Giá trị đơn mua',
                  value: formatCompactMoney(previewBriefing.snapshot.materials.purchaseValue.current),
                  caption: 'Không cộng với cấp phát',
                  icon: ClipboardCheck,
                  tone: 'blue',
              },
          ]
        : [];

    const historyOptions = [
        ...(latestQuery.data ? [{ value: 'latest', label: `${latestQuery.data.periodLabel} · Mới nhất` }] : []),
        ...(historyQuery.data ?? [])
            .filter((row) => row._id !== latestQuery.data?._id)
            .map((row) => ({ value: row._id, label: row.periodLabel })),
    ];

    if (latestQuery.isLoading && !previewBriefing && !drawerOpen) {
        return (
            <section className='dashboard-briefing dashboard-briefing--loading'>
                <Skeleton active paragraph={{ rows: 3 }} />
            </section>
        );
    }

    if ((latestQuery.isError || !latestQuery.data) && !previewBriefing && !drawerOpen) {
        return (
            <section className='dashboard-briefing dashboard-briefing--error'>
                <span className='dashboard-briefing__mark'>
                    <AlertTriangle size={20} />
                </span>
                <div>
                    <strong>Chưa tải được bản tin vận hành</strong>
                    <p>{getErrorMessage(latestQuery.error)}</p>
                </div>
                <Button onClick={() => latestQuery.refetch()} loading={latestQuery.isFetching}>
                    Thử lại
                </Button>
            </section>
        );
    }

    return (
        <>
            <section className='dashboard-briefing'>
                <div className='dashboard-briefing__header'>
                    <div className='dashboard-briefing__identity'>
                        <span className='dashboard-briefing__mark'>
                            <CalendarRange size={20} strokeWidth={2} />
                        </span>
                        <div>
                            <div className='dashboard-briefing__title-line'>
                                <h2>Bản tin vận hành</h2>
                                <Tag color={previewBriefing?.generationStatus === 'ready' ? 'green' : 'gold'}>
                                    {previewBriefing?.generationStatus === 'ready'
                                        ? 'Đã đối chiếu'
                                        : 'Quy tắc hệ thống'}
                                </Tag>
                            </div>
                            <p>
                                {previewBriefing?.periodLabel || 'Đang tải kỳ báo cáo'} · Dữ liệu chốt{' '}
                                {previewBriefing?.dataAsOf
                                    ? dayjs(previewBriefing.dataAsOf).format('DD/MM HH:mm')
                                    : '--'}
                            </p>
                        </div>
                    </div>
                    <Segmented
                        size='small'
                        value={period}
                        onChange={changePeriod}
                        options={[
                            { label: 'Tuần', value: 'week' },
                            { label: 'Tháng', value: 'month' },
                        ]}
                    />
                </div>

                <div className='dashboard-briefing__metrics'>
                    {mainMetrics.map((metric) => {
                        const Icon = metric.icon;
                        return (
                            <div
                                key={metric.label}
                                className={`dashboard-briefing-metric dashboard-briefing-metric--${metric.tone}`}
                            >
                                <span className='dashboard-briefing-metric__icon'>
                                    <Icon size={17} strokeWidth={2} />
                                </span>
                                <span className='dashboard-briefing-metric__label'>{metric.label}</span>
                                <strong>{metric.value}</strong>
                                <small>{metric.caption}</small>
                            </div>
                        );
                    })}
                </div>

                <div className='dashboard-briefing__body'>
                    <div className='dashboard-briefing__summary'>
                        <span className='briefing-section-kicker'>Nhận định kỳ này</span>
                        <p>{previewBriefing?.summary || 'Đang đối chiếu dữ liệu bản tin vận hành.'}</p>
                    </div>
                    <div className='dashboard-briefing__priority'>
                        <span
                            className={`briefing-priority-icon ${previewBriefing?.risks[0] ? 'is-warning' : 'is-stable'}`}
                        >
                            {previewBriefing?.risks[0] ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
                        </span>
                        <div>
                            <small>{previewBriefing?.risks[0] ? 'Ưu tiên điều hành' : 'Trạng thái ưu tiên'}</small>
                            <strong>{previewBriefing?.risks[0]?.title || 'Không có cảnh báo ưu tiên cao'}</strong>
                            <p>{previewBriefing?.risks[0]?.detail || 'Tiếp tục duy trì lịch rà soát theo cơ sở.'}</p>
                        </div>
                    </div>
                </div>

                <button type='button' className='dashboard-briefing__open' onClick={() => setDrawerOpen(true)}>
                    Xem bản tin đầy đủ <ChevronRight size={17} />
                </button>
            </section>

            <Drawer
                title={null}
                open={drawerOpen}
                onClose={closeDrawer}
                placement={isMobile ? 'bottom' : 'right'}
                size={isMobile ? '94%' : 820}
                destroyOnHidden
                className='executive-briefing-drawer'
                styles={{
                    body: { padding: 0 },
                    header: { display: 'none' },
                    wrapper: isMobile ? { maxHeight: '94dvh' } : undefined,
                }}
            >
                <div className='briefing-drawer-header'>
                    <div className='briefing-drawer-header__top'>
                        <div className='briefing-drawer-header__title'>
                            <span className='dashboard-briefing__mark'>
                                <CalendarRange size={20} />
                            </span>
                            <div>
                                <span className='briefing-section-kicker'>Báo cáo dành cho Ban giám đốc</span>
                                <h2>Bản tin vận hành</h2>
                            </div>
                        </div>
                        <Button
                            type='text'
                            aria-label='Đóng bản tin'
                            onClick={closeDrawer}
                            className='briefing-drawer-close'
                        >
                            ×
                        </Button>
                    </div>
                    <div className='briefing-drawer-controls'>
                        <Segmented
                            value={period}
                            onChange={changePeriod}
                            options={[
                                { label: 'Theo tuần', value: 'week' },
                                { label: 'Theo tháng', value: 'month' },
                            ]}
                        />
                        <Select
                            aria-label='Chọn kỳ bản tin'
                            value={selectedId || 'latest'}
                            options={historyOptions}
                            loading={historyQuery.isLoading}
                            onChange={(value) => setSelectedId(value === 'latest' ? undefined : value)}
                            className='briefing-period-select'
                        />
                        <Tooltip title='Đối chiếu lại dữ liệu và cập nhật nội dung kỳ mới nhất'>
                            <Button
                                icon={<RefreshCw size={16} />}
                                loading={refreshMutation.isPending}
                                onClick={handleRefresh}
                            >
                                {!isMobile ? 'Cập nhật' : null}
                            </Button>
                        </Tooltip>
                    </div>
                    {briefing ? (
                        <div className='briefing-drawer-meta'>
                            <span>
                                <CalendarRange size={14} /> {briefing.periodLabel}
                            </span>
                            <span>
                                <Clock3 size={14} /> Chốt {dayjs(briefing.dataAsOf).format('DD/MM/YYYY HH:mm')}
                            </span>
                            <span>
                                <ShieldCheck size={14} />{' '}
                                {briefing.generationStatus === 'ready'
                                    ? 'Nội dung đã kiểm chứng số liệu'
                                    : 'Số liệu đã kiểm chứng · diễn giải dự phòng'}
                            </span>
                        </div>
                    ) : null}
                </div>

                {activeQuery.isLoading ? (
                    <div className='briefing-drawer-loading'>
                        <Skeleton active paragraph={{ rows: 8 }} />
                    </div>
                ) : activeQuery.isError || !briefing ? (
                    <div className='briefing-drawer-empty'>
                        <Empty description={getErrorMessage(activeQuery.error)}>
                            <Button onClick={() => activeQuery.refetch()}>Tải lại</Button>
                        </Empty>
                    </div>
                ) : (
                    <Tabs
                        className='briefing-tabs'
                        defaultActiveKey='overview'
                        items={[
                            {
                                key: 'overview',
                                label: 'Tổng quan',
                                children: <DrawerOverview briefing={briefing} onAction={handleAction} />,
                            },
                            {
                                key: 'plants',
                                label: (
                                    <span className='inline-flex items-center gap-1.5'>
                                        <Building2 size={15} /> Theo cơ sở
                                    </span>
                                ),
                                children: (
                                    <div className='briefing-drawer-pane'>
                                        <section>
                                            <div className='briefing-section-heading'>
                                                <div>
                                                    <span className='briefing-section-kicker'>Đối chiếu cơ sở</span>
                                                    <h3>Tín hiệu vận hành trực tiếp</h3>
                                                </div>
                                                <span className='briefing-section-note'>
                                                    Không dùng điểm xếp hạng tổng hợp
                                                </span>
                                            </div>
                                            <PlantList rows={briefing.snapshot.plants} />
                                        </section>
                                    </div>
                                ),
                            },
                            {
                                key: 'data',
                                label: 'Nguồn số liệu',
                                children: <DataNotes briefing={briefing} />,
                            },
                        ]}
                    />
                )}
            </Drawer>
        </>
    );
};

export default DashboardExecutiveBriefing;
