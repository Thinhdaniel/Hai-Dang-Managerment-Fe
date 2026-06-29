import React, { useMemo, useRef, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    App,
    Button,
    Card,
    Col,
    DatePicker,
    Drawer,
    Empty,
    Row,
    Segmented,
    Select,
    Skeleton,
    Space,
    Statistic,
    Table,
    Tooltip,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    BuildOutlined,
    DownloadOutlined,
    InboxOutlined,
    ReloadOutlined,
    ShopOutlined,
    ToolOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import EChart, { type ECharts, type EChartsCoreOption } from '../components/charts/EChart';
import {
    CHART_SEMANTIC,
    DeltaBadge,
    DonutCenter,
    ECHARTS_AXIS_LABEL,
    ECHARTS_TOOLTIP_STYLE,
    Sparkline,
    barGradient,
    stackedTooltipFormatter,
} from '../components/charts';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess } from '../core/lib/permissions';
import { plantService } from '../core/services/plant.service';
import {
    facilityCostReportService,
    type FacilityCostByPeriod,
    type FacilityCostByPlant,
    type FacilityCostGroupBy,
    type FacilityCostQueryParams,
    type FacilityCostSummary,
    type TopExternalRepairAsset,
} from '../core/services/report.service';

const { RangePicker } = DatePicker;
const { Text } = Typography;

type QuickRange = 'this_month' | 'quarter' | 'six_months' | 'year' | 'custom';

type ReportFilters = {
    plantId?: string;
    dateRange: [Dayjs, Dayjs];
    groupBy: FacilityCostGroupBy;
};

type FacilityDrilldownPayload =
    | {
          kind: 'plant';
          title: string;
          description: string;
          rows: FacilityCostByPlant[];
      }
    | {
          kind: 'asset';
          title: string;
          description: string;
          rows: TopExternalRepairAsset[];
      }
    | {
          kind: 'period';
          title: string;
          description: string;
          row: FacilityCostByPeriod;
          plantId?: string;
      }
    | {
          kind: 'plantDetail';
          title: string;
          description: string;
          row: FacilityCostByPlant;
          startDate?: string;
          endDate?: string;
      }
    | {
          kind: 'message';
          title: string;
          description: string;
      };

const DEFAULT_FILTERS: ReportFilters = {
    dateRange: [dayjs().startOf('month'), dayjs().endOf('day')],
    groupBy: 'month',
};

const COST_COLORS = {
    material: CHART_SEMANTIC.material,
    selfPurchase: CHART_SEMANTIC.purchaseLine,
    repair: CHART_SEMANTIC.repair,
    total: '#13c2c2',
};

const fmtCurrency = (value = 0) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

// Rút gọn tiền theo cách đọc của kế toán Việt: 1,2 tỷ · 850 tr · 12k
const fmtShort = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace('.', ',')} tỷ`;
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace('.', ',')} tr`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
    return String(value);
};

const getQuickRange = (range: QuickRange): [Dayjs, Dayjs] => {
    if (range === 'quarter') {
        const quarterStartMonth = Math.floor(dayjs().month() / 3) * 3;
        return [dayjs().month(quarterStartMonth).startOf('month'), dayjs().endOf('day')];
    }
    if (range === 'six_months') return [dayjs().subtract(5, 'month').startOf('month'), dayjs().endOf('day')];
    if (range === 'year') return [dayjs().startOf('year'), dayjs().endOf('day')];
    return [dayjs().startOf('month'), dayjs().endOf('day')];
};

const toReportParams = (filters: ReportFilters): FacilityCostQueryParams => ({
    plantId: filters.plantId,
    startDate: filters.dateRange[0].format('YYYY-MM-DD'),
    endDate: filters.dateRange[1].format('YYYY-MM-DD'),
    groupBy: filters.groupBy,
});

const getPeriodLabel = (period: string) => {
    if (period.includes('-Q')) return period.replace('-Q', ' / Q');
    if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return dayjs(period).format('DD/MM/YYYY');
    if (/^\d{4}-\d{2}$/.test(period)) return dayjs(`${period}-01`).format('MM/YYYY');
    return period;
};

// Đổi nhãn kỳ (YYYY-MM-DD | YYYY-MM | YYYY-Qn) thành khoảng ngày để điều hướng sang màn nguồn
const getPeriodRange = (period: string): { start: string; end: string } => {
    if (period.includes('-Q')) {
        const [year, quarter] = period.split('-Q');
        const start = dayjs(`${year}-01-01`).month((Number(quarter) - 1) * 3);
        return { start: start.format('YYYY-MM-DD'), end: start.add(2, 'month').endOf('month').format('YYYY-MM-DD') };
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return { start: period, end: period };
    if (/^\d{4}-\d{2}$/.test(period)) {
        const start = dayjs(`${period}-01`);
        return { start: start.format('YYYY-MM-DD'), end: start.endOf('month').format('YYYY-MM-DD') };
    }
    return { start: period, end: period };
};

const truncateName = (value: string, max = 14) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

export default function FacilityCostReportPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isManager = hasManagerAccess(user?.role);
    const [quickRange, setQuickRange] = useState<QuickRange>('this_month');
    // Bộ lọc tự áp dụng ngay khi chọn — không cần nút "Áp dụng"
    const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
    const [exporting, setExporting] = useState(false);
    const [drilldown, setDrilldown] = useState<FacilityDrilldownPayload | null>(null);

    const params = useMemo(() => toReportParams(filters), [filters]);

    const plantsQuery = useQuery({
        queryKey: ['facility-cost-report-plants'],
        queryFn: () => plantService.getAll(),
        staleTime: 5 * 60_000,
    });

    const reportQuery = useQuery({
        queryKey: ['facility-cost-report', params],
        queryFn: () => facilityCostReportService.getSummary(params),
        staleTime: 60_000,
    });

    // Kỳ liền trước (cùng độ dài) để hiện ±% trên KPI
    const prevParams = useMemo<FacilityCostQueryParams>(() => {
        const [start, end] = filters.dateRange;
        const days = end.diff(start, 'day') + 1;
        return {
            plantId: filters.plantId,
            startDate: start.subtract(days, 'day').format('YYYY-MM-DD'),
            endDate: start.subtract(1, 'day').format('YYYY-MM-DD'),
            groupBy: filters.groupBy,
        };
    }, [filters]);

    const prevReportQuery = useQuery({
        queryKey: ['facility-cost-report-prev', prevParams],
        queryFn: () => facilityCostReportService.getSummary(prevParams),
        staleTime: 60_000,
    });
    const prevSummary = prevReportQuery.data?.summary;

    const trendChartInstance = useRef<ECharts | null>(null);
    const downloadTrendPng = () => {
        const url = trendChartInstance.current?.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
        if (!url) return;
        const link = document.createElement('a');
        link.href = url;
        link.download = `chi-phi-van-hanh-${params.startDate}-${params.endDate}.png`;
        link.click();
    };

    const plants = plantsQuery.data ?? [];
    const report = reportQuery.data;
    const summary = report?.summary;
    const costByPlant = report?.costByPlant ?? [];
    const costByPeriod = report?.costByPeriod ?? [];
    const topAssets = report?.topExternalRepairAssets ?? [];
    const topPlant = costByPlant[0];
    const topAsset = topAssets[0];

    const buildLinkedParams = (extra: Record<string, string | undefined>) => {
        const search = new URLSearchParams({
            startDate: params.startDate ?? '',
            endDate: params.endDate ?? '',
        });

        Object.entries(extra).forEach(([key, value]) => {
            if (value) search.set(key, value);
        });

        return search.toString();
    };

    const handleQuickRangeChange = (value: string | number) => {
        const next = value as QuickRange;
        setQuickRange(next);
        if (next !== 'custom') {
            setFilters((current) => ({ ...current, dateRange: getQuickRange(next) }));
        }
    };

    const handleResetFilters = () => {
        setQuickRange('this_month');
        setFilters(DEFAULT_FILTERS);
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            await facilityCostReportService.exportExcel(params);
            message.success('Đã xuất báo cáo chi phí vận hành');
        } catch {
            message.error('Không thể xuất báo cáo chi phí vận hành');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className='facility-cost-page'>
            <style>{FACILITY_COST_STYLE}</style>
            <PageHeader
                title='Báo cáo chi phí vận hành'
                subtitle={`Kỳ ${filters.dateRange[0].format('DD/MM/YYYY')} - ${filters.dateRange[1].format('DD/MM/YYYY')}`}
            />

            <div className='hd-report-toolbar'>
                <div className='hd-toolbar-scroll'>
                    <Segmented
                        value={quickRange}
                        onChange={handleQuickRangeChange}
                        options={[
                            { label: 'Tháng này', value: 'this_month' },
                            { label: 'Quý này', value: 'quarter' },
                            { label: '6 tháng', value: 'six_months' },
                            { label: 'Năm nay', value: 'year' },
                            { label: 'Tùy chỉnh', value: 'custom' },
                        ]}
                    />
                </div>
                <RangePicker
                    value={filters.dateRange}
                    allowClear={false}
                    format='DD/MM/YYYY'
                    style={{ width: 240 }}
                    onChange={(dates) => {
                        if (!dates) return;
                        setQuickRange('custom');
                        setFilters((current) => ({ ...current, dateRange: dates as [Dayjs, Dayjs] }));
                    }}
                />
                {isManager ? (
                    <Select
                        allowClear
                        showSearch={{ optionFilterProp: 'label' }}
                        placeholder='Tất cả cơ sở'
                        style={{ minWidth: 170 }}
                        value={filters.plantId}
                        loading={plantsQuery.isLoading}
                        onChange={(plantId) => setFilters((current) => ({ ...current, plantId }))}
                        options={plants.map((plant) => ({ label: plant.name, value: plant.id }))}
                    />
                ) : null}
                <Select
                    style={{ width: 110 }}
                    value={filters.groupBy}
                    onChange={(groupBy) => setFilters((current) => ({ ...current, groupBy }))}
                    options={[
                        { label: 'Theo ngày', value: 'day' },
                        { label: 'Theo tháng', value: 'month' },
                        { label: 'Theo quý', value: 'quarter' },
                    ]}
                />
                <Button type='text' size='small' onClick={handleResetFilters}>
                    Đặt lại
                </Button>
                <span className='hd-report-toolbar__spacer' />
                <Tooltip title='Làm mới dữ liệu'>
                    <Button
                        icon={<ReloadOutlined />}
                        loading={reportQuery.isFetching}
                        onClick={() => reportQuery.refetch()}
                    />
                </Tooltip>
                <Button type='primary' icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
                    Xuất Excel
                </Button>
            </div>

            {reportQuery.isError ? (
                <Card variant='outlined'>
                    <Empty description='Không thể tải báo cáo chi phí vận hành' />
                </Card>
            ) : null}

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={10} xxl={8}>
                    <div className='hd-hero-card'>
                        <span className='hd-hero-card__title'>Tổng chi phí vận hành</span>
                        {reportQuery.isLoading ? (
                            <Skeleton active paragraph={{ rows: 2 }} title={false} />
                        ) : (
                            <>
                                <span className='hd-hero-card__value'>
                                    {fmtCurrency(summary?.totalFacilityCost ?? 0)}
                                </span>
                                <DeltaBadge
                                    current={summary?.totalFacilityCost ?? 0}
                                    previous={prevSummary?.totalFacilityCost}
                                    formatter={fmtCurrency}
                                />
                                <div className='hd-hero-card__spark'>
                                    <Sparkline
                                        data={costByPeriod.map(
                                            (row) =>
                                                Number(row.materialDistributionCost ?? 0) +
                                                Number(row.materialSelfPurchaseCost ?? 0) +
                                                Number(row.externalRepairCost ?? 0)
                                        )}
                                    />
                                </div>
                                <div className='hd-hero-card__subs'>
                                    <button
                                        type='button'
                                        onClick={() =>
                                            setDrilldown({
                                                kind: 'plant',
                                                title: 'Chi phí vật tư theo cơ sở',
                                                description:
                                                    'Vật tư CS1 cấp cho cơ sở nhận, cộng phần cơ sở được phép tự mua (vd Phú Sơn).',
                                                rows: costByPlant.filter(
                                                    (row) =>
                                                        Number(row.materialDistributionCost ?? 0) +
                                                            Number(row.materialSelfPurchaseCost ?? 0) >
                                                        0
                                                ),
                                            })
                                        }
                                    >
                                        <i style={{ background: COST_COLORS.material }} />
                                        Vật tư{' '}
                                        <strong>
                                            {fmtShort(
                                                summary?.materialTotalCost ??
                                                    (summary?.materialDistributionCost ?? 0) +
                                                        (summary?.materialSelfPurchaseCost ?? 0)
                                            )}
                                        </strong>
                                    </button>
                                    <button
                                        type='button'
                                        onClick={() =>
                                            setDrilldown({
                                                kind: 'asset',
                                                title: 'Top máy phát sinh chi phí sửa ngoài',
                                                description: 'Các máy có tổng chi phí sửa ngoài cao nhất trong kỳ lọc.',
                                                rows: topAssets,
                                            })
                                        }
                                    >
                                        <i style={{ background: COST_COLORS.repair }} />
                                        Sửa ngoài <strong>{fmtShort(summary?.externalRepairCost ?? 0)}</strong>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </Col>
                <Col xs={24} lg={14} xxl={16}>
                    <Row gutter={[12, 12]} className='facility-cost-kpi-grid'>
                        <Col xs={12} xl={6}>
                            <MetricCard
                                title='Chi phí vật tư'
                                value={
                                    summary?.materialTotalCost ??
                                    (summary?.materialDistributionCost ?? 0) + (summary?.materialSelfPurchaseCost ?? 0)
                                }
                                previousValue={prevSummary?.materialTotalCost}
                                loading={reportQuery.isLoading}
                                icon={<InboxOutlined />}
                                color={COST_COLORS.material}
                                hint='Vật tư CS1 cấp cho cơ sở nhận, cộng phần cơ sở được phép tự mua (vd Phú Sơn).'
                                onClick={() =>
                                    setDrilldown({
                                        kind: 'plant',
                                        title: 'Chi phí vật tư theo cơ sở',
                                        description:
                                            'Vật tư CS1 cấp cho cơ sở nhận, cộng phần cơ sở được phép tự mua (vd Phú Sơn).',
                                        rows: costByPlant.filter(
                                            (row) =>
                                                Number(row.materialDistributionCost ?? 0) +
                                                    Number(row.materialSelfPurchaseCost ?? 0) >
                                                0
                                        ),
                                    })
                                }
                            />
                        </Col>
                        <Col xs={12} xl={6}>
                            <MetricCard
                                title='Chi phí sửa ngoài'
                                value={summary?.externalRepairCost ?? 0}
                                previousValue={prevSummary?.externalRepairCost}
                                loading={reportQuery.isLoading}
                                icon={<BuildOutlined />}
                                color={COST_COLORS.repair}
                                hint='Chi phí sửa chữa hoặc bảo trì thuê ngoài đã hoàn tất trong kỳ.'
                                onClick={() =>
                                    setDrilldown({
                                        kind: 'asset',
                                        title: 'Top máy phát sinh chi phí sửa ngoài',
                                        description: 'Các máy có tổng chi phí sửa ngoài cao nhất trong kỳ lọc.',
                                        rows: topAssets,
                                    })
                                }
                            />
                        </Col>
                        <Col xs={12} xl={6}>
                            <MetricCard
                                title='Sửa ngoài chờ duyệt'
                                value={summary?.pendingApprovalCount ?? 0}
                                loading={reportQuery.isLoading}
                                suffix='phiếu'
                                icon={<WarningOutlined />}
                                color='#faad14'
                                hint='Số phiếu sửa ngoài đang chờ duyệt trong phạm vi cơ sở đã lọc.'
                            />
                        </Col>
                        <Col xs={12} xl={6}>
                            <MetricCard
                                title='Sửa ngoài đang xử lý'
                                value={summary?.inProgressCount ?? 0}
                                loading={reportQuery.isLoading}
                                suffix='phiếu'
                                icon={<ToolOutlined />}
                                color='#1677ff'
                                hint='Số phiếu sửa ngoài đang xử lý trong phạm vi cơ sở đã lọc.'
                            />
                        </Col>
                    </Row>
                </Col>
            </Row>

            <div className='hd-signal-strip'>
                {topPlant ? (
                    <button
                        type='button'
                        className='hd-signal-item'
                        onClick={() =>
                            setDrilldown({
                                kind: 'plantDetail',
                                title: topPlant.plantName,
                                description: 'Cơ sở phát sinh chi phí cao nhất trong kỳ lọc.',
                                row: topPlant,
                                startDate: params.startDate,
                                endDate: params.endDate,
                            })
                        }
                    >
                        <ShopOutlined /> Cơ sở cao nhất:{' '}
                        <strong>
                            {topPlant.plantName} · {fmtShort(topPlant.totalCost)}
                        </strong>
                    </button>
                ) : null}
                {topAsset ? (
                    <button
                        type='button'
                        className='hd-signal-item hd-signal-item--warning'
                        onClick={() =>
                            setDrilldown({
                                kind: 'asset',
                                title: 'Top máy phát sinh chi phí sửa ngoài',
                                description: 'Các máy có tổng chi phí sửa ngoài cao nhất trong kỳ lọc.',
                                rows: topAssets,
                            })
                        }
                    >
                        <ToolOutlined /> Máy tốn nhất:{' '}
                        <strong>
                            {topAsset.assetName} · {fmtShort(topAsset.totalCost)}
                        </strong>
                    </button>
                ) : null}
                <button type='button' className='hd-signal-item' disabled>
                    <BuildOutlined /> {summary?.externalRepairCount ?? 0} phiếu sửa hoàn tất ·{' '}
                    {summary?.distributionRecordCount ?? 0} phiếu cấp phát
                </button>
            </div>

            <Row gutter={[16, 16]}>
                <Col xs={24} xxl={16}>
                    <Card
                        className='facility-cost-section-card'
                        title='Xu hướng chi phí vận hành theo kỳ'
                        variant='outlined'
                        extra={
                            <Tooltip title='Tải biểu đồ thành ảnh PNG'>
                                <Button
                                    size='small'
                                    className='hd-chart-png-btn'
                                    icon={<DownloadOutlined />}
                                    onClick={downloadTrendPng}
                                />
                            </Tooltip>
                        }
                    >
                        {reportQuery.isLoading ? (
                            <Skeleton active paragraph={{ rows: 8 }} />
                        ) : (
                            <CostTrendChart
                                data={costByPeriod}
                                instanceRef={trendChartInstance}
                                onSelectPeriod={(row) =>
                                    setDrilldown({
                                        kind: 'period',
                                        title: `Chi phí kỳ ${getPeriodLabel(row.period)}`,
                                        description:
                                            'Cơ cấu chi phí của kỳ này. Dùng các nút bên dưới để mở danh sách phiếu nguồn.',
                                        row,
                                        plantId: filters.plantId,
                                    })
                                }
                            />
                        )}
                    </Card>
                </Col>
                <Col xs={24} xxl={8}>
                    <CostCompositionPanel summary={summary} />
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                <Col xs={24} xxl={15}>
                    <Card className='facility-cost-section-card' title='Chi phí vận hành theo cơ sở' variant='outlined'>
                        {reportQuery.isLoading ? (
                            <Skeleton active paragraph={{ rows: 6 }} />
                        ) : (
                            <PlantCostChart
                                data={costByPlant}
                                onSelectPlant={(row) =>
                                    setDrilldown({
                                        kind: 'plantDetail',
                                        title: row.plantName,
                                        description: 'Cơ cấu chi phí của cơ sở trong kỳ lọc hiện tại.',
                                        row,
                                        startDate: params.startDate,
                                        endDate: params.endDate,
                                    })
                                }
                            />
                        )}
                    </Card>
                </Col>
                <Col xs={24} xxl={9}>
                    <Card
                        className='facility-cost-section-card'
                        title='Top máy phát sinh chi phí sửa ngoài'
                        variant='outlined'
                    >
                        {reportQuery.isLoading ? (
                            <Skeleton active paragraph={{ rows: 6 }} />
                        ) : (
                            <TopAssetRankList
                                data={topAssets}
                                onOpenHistory={(row) =>
                                    navigate(
                                        `/maintenances?${buildLinkedParams({
                                            assetId: row.assetId,
                                            repairMode: 'external',
                                            status: 'completed',
                                        })}`
                                    )
                                }
                            />
                        )}
                    </Card>
                </Col>
            </Row>

            <FacilityDrilldownDrawer drilldown={drilldown} onClose={() => setDrilldown(null)} />
        </div>
    );
}

function CostCompositionPanel({ summary }: { summary?: FacilityCostSummary }) {
    const materialCost = summary?.materialDistributionCost ?? 0;
    const selfPurchaseCost = summary?.materialSelfPurchaseCost ?? 0;
    const repairCost = summary?.externalRepairCost ?? 0;
    const mixData = [
        { name: 'Vật tư CS1 cấp cho cơ sở', value: materialCost, color: COST_COLORS.material },
        { name: 'Vật tư cơ sở tự mua', value: selfPurchaseCost, color: COST_COLORS.selfPurchase },
        { name: 'Chi phí sửa ngoài', value: repairCost, color: COST_COLORS.repair },
    ].filter((item) => item.value > 0);
    const mixTotal = mixData.reduce((sum, item) => sum + item.value, 0);

    const donutOption = useMemo<EChartsCoreOption>(() => {
        const items = [
            { name: 'Vật tư CS1 cấp cho cơ sở', value: materialCost, color: COST_COLORS.material },
            { name: 'Vật tư cơ sở tự mua', value: selfPurchaseCost, color: COST_COLORS.selfPurchase },
            { name: 'Chi phí sửa ngoài', value: repairCost, color: COST_COLORS.repair },
        ].filter((item) => item.value > 0);

        return {
            tooltip: {
                trigger: 'item',
                ...ECHARTS_TOOLTIP_STYLE,
                formatter: (params: unknown) => {
                    const info = params as { marker?: string; name?: string; value?: number; percent?: number };
                    return `${info.marker ?? ''} ${info.name ?? ''}: <b>${fmtCurrency(Number(info.value ?? 0))}</b> (${info.percent ?? 0}%)`;
                },
            },
            series: [
                {
                    type: 'pie',
                    radius: ['64%', '92%'],
                    center: ['50%', '50%'],
                    padAngle: 2,
                    itemStyle: {
                        borderRadius: 8,
                        borderColor: '#ffffff',
                        borderWidth: 2,
                        shadowBlur: 14,
                        shadowColor: 'rgba(15, 23, 42, 0.14)',
                        shadowOffsetY: 4,
                    },
                    label: { show: false },
                    emphasis: { scale: true, scaleSize: 7 },
                    data: items.map((item) => ({
                        name: item.name,
                        value: item.value,
                        itemStyle: { color: item.color },
                    })),
                    animationType: 'scale',
                    animationEasing: 'elasticOut',
                    animationDuration: 1000,
                    animationDelay: (idx: number) => idx * 200,
                },
            ],
        };
    }, [materialCost, selfPurchaseCost, repairCost]);

    return (
        <Card
            className='facility-cost-section-card facility-cost-composition-card'
            title='Cơ cấu và tín hiệu'
            variant='outlined'
        >
            <div className='facility-cost-donut-frame hd-donut-wrap'>
                {mixData.length ? (
                    <>
                        <EChart option={donutOption} height='100%' />
                        <DonutCenter title='Tổng chi phí' value={fmtShort(mixTotal)} />
                    </>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có dữ liệu chi phí trong kỳ' />
                )}
            </div>
            {mixData.length ? (
                <div className='facility-cost-mix-legend'>
                    {mixData.map((item) => (
                        <div key={item.name} className='facility-cost-mix-legend__row'>
                            <span className='facility-cost-mix-legend__dot' style={{ background: item.color }} />
                            <span className='facility-cost-mix-legend__name'>{item.name}</span>
                            <span className='facility-cost-mix-legend__value'>
                                {fmtCurrency(item.value)}
                                <em>{mixTotal ? ` · ${((item.value / mixTotal) * 100).toFixed(1)}%` : ''}</em>
                            </span>
                        </div>
                    ))}
                </div>
            ) : null}
        </Card>
    );
}

function MetricCard({
    title,
    value,
    previousValue,
    suffix,
    icon,
    color,
    loading,
    hint,
    meta,
    onClick,
}: {
    title: string;
    value: number;
    previousValue?: number;
    suffix?: string;
    icon: React.ReactNode;
    color: string;
    loading?: boolean;
    hint?: string;
    meta?: string;
    onClick?: () => void;
}) {
    const titleNode = <Text className='facility-cost-metric-title'>{title}</Text>;

    return (
        <button type='button' className='facility-cost-metric-button' onClick={onClick} disabled={!onClick}>
            <Card className='facility-cost-metric-card' variant='outlined'>
                <div className='facility-cost-metric-head'>
                    {hint ? <Tooltip title={hint}>{titleNode}</Tooltip> : titleNode}
                    <span className='facility-cost-metric-icon' style={{ color, backgroundColor: `${color}14` }}>
                        {icon}
                    </span>
                </div>
                <Tooltip title={suffix ? `${value} ${suffix}` : fmtCurrency(value)}>
                    <Statistic
                        loading={loading}
                        value={value}
                        suffix={suffix}
                        formatter={(currentValue) =>
                            suffix
                                ? new Intl.NumberFormat('vi-VN').format(Number(currentValue ?? 0))
                                : fmtCurrency(Number(currentValue ?? 0))
                        }
                    />
                </Tooltip>
                {!loading && previousValue !== undefined ? (
                    <DeltaBadge current={value} previous={previousValue} formatter={fmtCurrency} />
                ) : null}
                {meta ? <Text className='facility-cost-metric-meta'>{meta}</Text> : null}
            </Card>
        </button>
    );
}

function CostTrendChart({
    data,
    onSelectPeriod,
    instanceRef,
}: {
    data: FacilityCostByPeriod[];
    onSelectPeriod?: (row: FacilityCostByPeriod) => void;
    instanceRef?: React.RefObject<ECharts | null>;
}) {
    const option = useMemo<EChartsCoreOption>(() => {
        const labels = data.map((row) => getPeriodLabel(row.period));
        const material = data.map((row) => Number(row.materialDistributionCost ?? 0));
        const selfPurchase = data.map((row) => Number(row.materialSelfPurchaseCost ?? 0));
        const repair = data.map((row) => Number(row.externalRepairCost ?? 0));
        const totals = material.map((value, index) => value + selfPurchase[index] + repair[index]);
        const average = totals.reduce((sum, value) => sum + value, 0) / Math.max(totals.length, 1);
        const many = data.length > 18;

        return {
            animationDuration: 1100,
            animationEasing: 'elasticOut',
            animationDurationUpdate: 500,
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(37, 99, 235, 0.06)' } },
                ...ECHARTS_TOOLTIP_STYLE,
                formatter: stackedTooltipFormatter,
            },
            legend: {
                top: 0,
                icon: 'roundRect',
                itemWidth: 12,
                itemHeight: 8,
                itemGap: 16,
                textStyle: { color: '#334155', fontSize: 12, fontWeight: 600 },
            },
            grid: { left: 8, right: 14, top: 36, bottom: many ? 30 : 8, containLabel: true },
            xAxis: {
                type: 'category',
                data: labels,
                axisTick: { show: false },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisLabel: { ...ECHARTS_AXIS_LABEL, rotate: many ? 35 : 0, hideOverlap: true },
            },
            yAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: '#eef2f7', type: 'dashed' } },
                axisLabel: { ...ECHARTS_AXIS_LABEL, formatter: (value: number) => fmtShort(value) },
            },
            dataZoom: many
                ? [
                      { type: 'inside' },
                      {
                          type: 'slider',
                          height: 16,
                          bottom: 4,
                          borderColor: '#e2e8f0',
                          fillerColor: 'rgba(37, 99, 235, 0.12)',
                      },
                  ]
                : undefined,
            series: [
                {
                    name: 'Vật tư CS1 cấp cho cơ sở',
                    type: 'bar',
                    stack: 'cost',
                    data: material,
                    barMaxWidth: 38,
                    itemStyle: {
                        color: barGradient(CHART_SEMANTIC.material),
                        shadowBlur: 8,
                        shadowColor: 'rgba(37, 99, 235, 0.28)',
                        shadowOffsetY: 4,
                    },
                    emphasis: { focus: 'series', itemStyle: { shadowBlur: 16 } },
                    animationDelay: (idx: number) => idx * 70,
                },
                {
                    name: 'Vật tư cơ sở tự mua',
                    type: 'bar',
                    stack: 'cost',
                    data: selfPurchase,
                    barMaxWidth: 38,
                    itemStyle: {
                        color: barGradient(CHART_SEMANTIC.purchaseLine),
                        shadowBlur: 8,
                        shadowColor: 'rgba(30, 58, 138, 0.25)',
                        shadowOffsetY: 4,
                    },
                    emphasis: { focus: 'series', itemStyle: { shadowBlur: 16 } },
                    animationDelay: (idx: number) => idx * 70 + 80,
                },
                {
                    name: 'Chi phí sửa ngoài',
                    type: 'bar',
                    stack: 'cost',
                    data: repair,
                    barMaxWidth: 38,
                    itemStyle: {
                        color: barGradient(CHART_SEMANTIC.repair),
                        borderRadius: [8, 8, 0, 0],
                        shadowBlur: 8,
                        shadowColor: 'rgba(245, 158, 11, 0.28)',
                        shadowOffsetY: 4,
                    },
                    emphasis: { focus: 'series', itemStyle: { shadowBlur: 16 } },
                    animationDelay: (idx: number) => idx * 70 + 150,
                    markLine:
                        data.length > 1 && average > 0
                            ? {
                                  silent: true,
                                  symbol: 'none',
                                  lineStyle: { color: CHART_SEMANTIC.reference, type: 'dashed' },
                                  label: {
                                      formatter: `TB ${fmtShort(average)}`,
                                      color: '#64748b',
                                      fontSize: 11,
                                      position: 'insideEndTop',
                                  },
                                  data: [{ yAxis: average }],
                              }
                            : undefined,
                },
            ],
        };
    }, [data]);

    const events = useMemo(
        () =>
            onSelectPeriod
                ? {
                      click: (params: unknown) => {
                          const info = params as { componentType?: string; dataIndex?: number };
                          if (info?.componentType !== 'series') return;
                          const row = data[info.dataIndex ?? -1];
                          if (row) onSelectPeriod(row);
                      },
                  }
                : undefined,
        [data, onSelectPeriod]
    );

    if (!data.length) {
        return (
            <div className='facility-cost-empty-chart'>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có dữ liệu trong kỳ đã chọn' />
            </div>
        );
    }

    return (
        <>
            <div className='facility-cost-chart-frame'>
                <EChart option={option} height='100%' onEvents={events} instanceRef={instanceRef} />
            </div>
            {onSelectPeriod ? (
                <Text type='secondary' className='facility-cost-chart-hint'>
                    Nhấn vào cột để xem chi tiết kỳ đó · Nhấn legend để ẩn/hiện
                </Text>
            ) : null}
        </>
    );
}

function PlantCostChart({
    data,
    onSelectPlant,
}: {
    data: FacilityCostByPlant[];
    onSelectPlant?: (row: FacilityCostByPlant) => void;
}) {
    // Sắp tăng dần để cơ sở chi nhiều nhất nằm trên cùng (trục category vẽ từ dưới lên)
    const rows = useMemo(() => [...data].sort((a, b) => a.totalCost - b.totalCost), [data]);

    const option = useMemo<EChartsCoreOption>(() => {
        const names = rows.map((row) => row.plantName);
        const material = rows.map((row) => Number(row.materialDistributionCost ?? 0));
        const selfPurchase = rows.map((row) => Number(row.materialSelfPurchaseCost ?? 0));
        const repair = rows.map((row) => Number(row.externalRepairCost ?? 0));
        const dot = (c: string) =>
            `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:5px"></span>`;

        return {
            animationDuration: 1000,
            animationEasing: 'cubicOut',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(37, 99, 235, 0.06)' } },
                ...ECHARTS_TOOLTIP_STYLE,
                formatter: (params: unknown) => {
                    const points = Array.isArray(params) ? params : [params];
                    const first = points[0] as { dataIndex?: number };
                    const row = rows[first?.dataIndex ?? -1];
                    if (!row) return '';
                    const lines = [
                        `<strong>${row.plantName}</strong>`,
                        `${dot(CHART_SEMANTIC.material)}Vật tư CS1 cấp cho cơ sở: <b>${fmtCurrency(row.materialDistributionCost)}</b> (${row.distributionCount} phiếu)`,
                    ];
                    if (Number(row.materialSelfPurchaseCost ?? 0) > 0) {
                        lines.push(
                            `${dot(CHART_SEMANTIC.purchaseLine)}Vật tư cơ sở tự mua: <b>${fmtCurrency(row.materialSelfPurchaseCost)}</b> (${row.selfPurchaseOrderCount} đơn)`
                        );
                    }
                    lines.push(
                        `${dot(CHART_SEMANTIC.repair)}Chi phí sửa ngoài: <b>${fmtCurrency(row.externalRepairCost)}</b> (${row.externalRepairCount} phiếu)`,
                        `Tổng chi phí vận hành: <b>${fmtCurrency(row.totalCost)}</b>`,
                        '<span style="color:#64748b">Vật tư tính theo cơ sở nhận cấp phát; riêng cơ sở được tự đặt còn cộng phần tự mua.</span>'
                    );
                    return lines.join('<br/>');
                },
            },
            legend: {
                top: 0,
                icon: 'roundRect',
                itemWidth: 12,
                itemHeight: 8,
                itemGap: 16,
                textStyle: { color: '#334155', fontSize: 12, fontWeight: 600 },
            },
            grid: { left: 8, right: 66, top: 32, bottom: 4, containLabel: true },
            xAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: '#eef2f7', type: 'dashed' } },
                axisLabel: { ...ECHARTS_AXIS_LABEL, formatter: (value: number) => fmtShort(value) },
            },
            yAxis: {
                type: 'category',
                data: names,
                axisTick: { show: false },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisLabel: {
                    ...ECHARTS_AXIS_LABEL,
                    formatter: (value: string) => truncateName(value),
                },
            },
            series: [
                {
                    name: 'Vật tư CS1 cấp cho cơ sở',
                    type: 'bar',
                    stack: 'cost',
                    data: material,
                    barMaxWidth: 26,
                    itemStyle: {
                        color: barGradient(CHART_SEMANTIC.material, false),
                        shadowBlur: 6,
                        shadowColor: 'rgba(37, 99, 235, 0.22)',
                        shadowOffsetY: 3,
                    },
                    emphasis: { focus: 'series' },
                    animationDelay: (idx: number) => idx * 90,
                },
                {
                    name: 'Vật tư cơ sở tự mua',
                    type: 'bar',
                    stack: 'cost',
                    data: selfPurchase,
                    barMaxWidth: 26,
                    itemStyle: {
                        color: barGradient(CHART_SEMANTIC.purchaseLine, false),
                        shadowBlur: 6,
                        shadowColor: 'rgba(30, 58, 138, 0.2)',
                        shadowOffsetY: 3,
                    },
                    emphasis: { focus: 'series' },
                    animationDelay: (idx: number) => idx * 90 + 60,
                },
                {
                    name: 'Chi phí sửa ngoài',
                    type: 'bar',
                    stack: 'cost',
                    data: repair,
                    barMaxWidth: 26,
                    itemStyle: {
                        color: barGradient(CHART_SEMANTIC.repair, false),
                        borderRadius: [0, 8, 8, 0],
                        shadowBlur: 6,
                        shadowColor: 'rgba(245, 158, 11, 0.22)',
                        shadowOffsetY: 3,
                    },
                    emphasis: { focus: 'series' },
                    animationDelay: (idx: number) => idx * 90 + 120,
                    label: {
                        show: true,
                        position: 'right',
                        formatter: (params: { dataIndex: number }) => fmtShort(rows[params.dataIndex]?.totalCost ?? 0),
                        color: '#475569',
                        fontSize: 11,
                        fontWeight: 600,
                    },
                },
            ],
        };
    }, [rows]);

    const events = useMemo(
        () =>
            onSelectPlant
                ? {
                      click: (params: unknown) => {
                          const info = params as { componentType?: string; dataIndex?: number };
                          if (info?.componentType !== 'series') return;
                          const row = rows[info.dataIndex ?? -1];
                          if (row) onSelectPlant(row);
                      },
                  }
                : undefined,
        [rows, onSelectPlant]
    );

    if (!data.length) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có dữ liệu trong kỳ đã chọn' />;
    }

    return (
        <>
            <EChart option={option} height={Math.max(220, rows.length * 46 + 70)} onEvents={events} />
            {onSelectPlant ? (
                <Text type='secondary' className='facility-cost-chart-hint'>
                    Phần vật tư là giá trị CS1 cấp/xuất cho cơ sở nhận. Nhấn vào thanh để xem chi tiết cơ sở.
                </Text>
            ) : null}
        </>
    );
}

function TopAssetRankList({
    data,
    onOpenHistory,
}: {
    data: TopExternalRepairAsset[];
    onOpenHistory: (row: TopExternalRepairAsset) => void;
}) {
    if (!data.length) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có máy sửa ngoài trong kỳ' />;
    }

    const max = Math.max(...data.map((row) => row.totalCost), 1);

    return (
        <div className='facility-cost-rank-list'>
            {data.slice(0, 8).map((row, index) => (
                <button
                    key={row.assetId}
                    type='button'
                    className='facility-cost-rank-item'
                    onClick={() => onOpenHistory(row)}
                    title='Xem lịch sử sửa ngoài của máy'
                >
                    <span
                        className={
                            index < 3
                                ? 'facility-cost-rank-badge facility-cost-rank-badge--top'
                                : 'facility-cost-rank-badge'
                        }
                    >
                        {index + 1}
                    </span>
                    <span className='facility-cost-rank-main'>
                        <strong>{row.assetName}</strong>
                        <span className='facility-cost-rank-meta'>
                            {[row.machineCode, row.plantName].filter(Boolean).join(' · ')}
                        </span>
                        <span className='facility-cost-rank-bar'>
                            <i style={{ width: `${Math.max((row.totalCost / max) * 100, 4)}%` }} />
                        </span>
                    </span>
                    <span className='facility-cost-rank-value'>
                        <strong>{fmtCurrency(row.totalCost)}</strong>
                        <em>{row.count} lần sửa</em>
                    </span>
                </button>
            ))}
        </div>
    );
}

function FacilityDrilldownDrawer({
    drilldown,
    onClose,
}: {
    drilldown: FacilityDrilldownPayload | null;
    onClose: () => void;
}) {
    const navigate = useNavigate();
    const plantColumns: ColumnsType<FacilityCostByPlant> = [
        { title: 'Cơ sở', dataIndex: 'plantName', ellipsis: true, render: (value) => <Text strong>{value}</Text> },
        {
            title: 'Vật tư CS1 cấp',
            dataIndex: 'materialDistributionCost',
            width: 150,
            align: 'right',
            render: fmtCurrency,
        },
        {
            title: 'Vật tư tự mua',
            dataIndex: 'materialSelfPurchaseCost',
            width: 140,
            align: 'right',
            render: (value: number) => (Number(value ?? 0) > 0 ? fmtCurrency(value) : '—'),
        },
        { title: 'Sửa ngoài', dataIndex: 'externalRepairCost', width: 140, align: 'right', render: fmtCurrency },
        { title: 'Tổng', dataIndex: 'totalCost', width: 150, align: 'right', render: fmtCurrency },
    ];
    const assetColumns: ColumnsType<TopExternalRepairAsset> = [
        {
            title: 'Máy',
            dataIndex: 'assetName',
            ellipsis: true,
            render: (value, row) => (
                <Space orientation='vertical' size={2}>
                    <Text strong>{value}</Text>
                    <Text type='secondary'>{[row.machineCode, row.plantName].filter(Boolean).join(' · ')}</Text>
                </Space>
            ),
        },
        { title: 'Số lần', dataIndex: 'count', width: 90, align: 'right' },
        { title: 'Chi phí', dataIndex: 'totalCost', width: 150, align: 'right', render: fmtCurrency },
    ];

    const renderContent = () => {
        if (!drilldown) return null;
        if (drilldown.kind === 'message') {
            return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={drilldown.description} />;
        }
        if (drilldown.kind === 'period') {
            const { row, plantId } = drilldown;
            const material = Number(row.materialDistributionCost ?? 0);
            const selfPurchase = Number(row.materialSelfPurchaseCost ?? 0);
            const repair = Number(row.externalRepairCost ?? 0);
            const total = material + selfPurchase + repair;
            const range = getPeriodRange(row.period);
            const search = (extra: Record<string, string | undefined>) => {
                const query = new URLSearchParams({ startDate: range.start, endDate: range.end });
                Object.entries(extra).forEach(([key, value]) => {
                    if (value) query.set(key, value);
                });
                return query.toString();
            };
            const items = [
                { label: 'Vật tư CS1 cấp cho cơ sở', value: material, color: COST_COLORS.material },
                ...(selfPurchase > 0
                    ? [{ label: 'Vật tư cơ sở tự mua', value: selfPurchase, color: COST_COLORS.selfPurchase }]
                    : []),
                { label: 'Chi phí sửa ngoài', value: repair, color: COST_COLORS.repair },
            ];
            return (
                <div className='facility-cost-period-detail'>
                    {items.map((item) => (
                        <div key={item.label} className='facility-cost-period-detail__row'>
                            <span className='facility-cost-mix-legend__dot' style={{ background: item.color }} />
                            <span className='facility-cost-mix-legend__name'>{item.label}</span>
                            <span className='facility-cost-mix-legend__value'>
                                {fmtCurrency(item.value)}
                                <em>{total ? ` · ${((item.value / total) * 100).toFixed(1)}%` : ''}</em>
                            </span>
                        </div>
                    ))}
                    <div className='facility-cost-period-detail__row facility-cost-period-detail__row--total'>
                        <span className='facility-cost-mix-legend__dot' style={{ background: '#0f172a' }} />
                        <span className='facility-cost-mix-legend__name'>Tổng chi phí kỳ</span>
                        <span className='facility-cost-mix-legend__value'>{fmtCurrency(total)}</span>
                    </div>
                    <Space wrap>
                        <Button onClick={() => navigate(`/materials/distributions?${search({ toPlantId: plantId })}`)}>
                            Phiếu cấp phát kỳ này
                        </Button>
                        <Button
                            onClick={() =>
                                navigate(
                                    `/maintenances?${search({ plantId, repairMode: 'external', status: 'completed' })}`
                                )
                            }
                        >
                            Phiếu sửa ngoài kỳ này
                        </Button>
                    </Space>
                </div>
            );
        }
        if (drilldown.kind === 'plantDetail') {
            const { row, startDate, endDate } = drilldown;
            const material = Number(row.materialDistributionCost ?? 0);
            const selfPurchase = Number(row.materialSelfPurchaseCost ?? 0);
            const repair = Number(row.externalRepairCost ?? 0);
            const total = Number(row.totalCost ?? material + selfPurchase + repair);
            const search = (extra: Record<string, string | undefined>) => {
                const query = new URLSearchParams({ startDate: startDate ?? '', endDate: endDate ?? '' });
                Object.entries(extra).forEach(([key, value]) => {
                    if (value) query.set(key, value);
                });
                return query.toString();
            };
            const breakdown = [
                { label: 'Vật tư CS1 cấp cho cơ sở', value: material, color: COST_COLORS.material },
                ...(selfPurchase > 0
                    ? [{ label: 'Vật tư cơ sở tự mua', value: selfPurchase, color: COST_COLORS.selfPurchase }]
                    : []),
                { label: 'Chi phí sửa ngoài', value: repair, color: COST_COLORS.repair },
            ];
            return (
                <div className='facility-cost-period-detail'>
                    {breakdown.map((item) => (
                        <div key={item.label} className='facility-cost-period-detail__row'>
                            <span className='facility-cost-mix-legend__dot' style={{ background: item.color }} />
                            <span className='facility-cost-mix-legend__name'>{item.label}</span>
                            <span className='facility-cost-mix-legend__value'>
                                {fmtCurrency(item.value)}
                                <em>{total ? ` · ${((item.value / total) * 100).toFixed(1)}%` : ''}</em>
                            </span>
                        </div>
                    ))}
                    <div className='facility-cost-period-detail__row facility-cost-period-detail__row--total'>
                        <span className='facility-cost-mix-legend__dot' style={{ background: '#0f172a' }} />
                        <span className='facility-cost-mix-legend__name'>Tổng chi phí</span>
                        <span className='facility-cost-mix-legend__value'>{fmtCurrency(total)}</span>
                    </div>
                    <div className='facility-cost-period-detail__row'>
                        <span className='facility-cost-mix-legend__name'>Phiếu cấp phát / sửa ngoài / máy sửa</span>
                        <span className='facility-cost-mix-legend__value'>
                            {row.distributionCount ?? 0} / {row.externalRepairCount ?? 0} /{' '}
                            {row.externalRepairAssetCount ?? 0}
                        </span>
                    </div>
                    <Space wrap>
                        <Button
                            onClick={() => navigate(`/materials/distributions?${search({ toPlantId: row.plantId })}`)}
                        >
                            Phiếu cấp phát
                        </Button>
                        <Button
                            onClick={() =>
                                navigate(
                                    `/maintenances?${search({
                                        plantId: row.plantId,
                                        repairMode: 'external',
                                        status: 'completed',
                                    })}`
                                )
                            }
                        >
                            Phiếu sửa ngoài
                        </Button>
                    </Space>
                </div>
            );
        }
        if (drilldown.kind === 'asset') {
            return (
                <Table
                    rowKey={(row) => row.assetId}
                    columns={assetColumns}
                    dataSource={drilldown.rows}
                    size='small'
                    scroll={{ x: 560 }}
                    pagination={{ pageSize: 8, showSizeChanger: true }}
                />
            );
        }
        return (
            <Table
                rowKey={(row) => row.plantId || row.plantName}
                columns={plantColumns}
                dataSource={drilldown.rows}
                size='small'
                scroll={{ x: 700 }}
                pagination={{ pageSize: 8, showSizeChanger: true }}
            />
        );
    };

    return (
        <Drawer
            open={Boolean(drilldown)}
            onClose={onClose}
            title={drilldown?.title}
            size='min(100vw, 720px)'
            destroyOnHidden
        >
            <div className='facility-cost-drilldown'>
                {drilldown?.description ? <Text type='secondary'>{drilldown.description}</Text> : null}
                {renderContent()}
            </div>
        </Drawer>
    );
}

const FACILITY_COST_STYLE = `
.facility-cost-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.facility-cost-page .page-header-card {
    border: 1px solid #e8edf4;
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
}
.facility-cost-kpi-grid {
    height: 100%;
}
.facility-cost-kpi-grid > .ant-col {
    display: flex;
}
.facility-cost-kpi-grid .facility-cost-metric-button {
    width: 100%;
}
.facility-cost-filter-card,
.facility-cost-metric-card,
.facility-cost-section-card {
    border-radius: 8px;
}
.facility-cost-active-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.facility-cost-active-filters--compact {
    margin-top: 14px;
}
.facility-cost-filter-chip {
    margin-inline-end: 0;
    border-radius: 999px;
    font-weight: 600;
}
.facility-cost-filter-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;
}
.facility-cost-segmented-scroll {
    max-width: 100%;
    overflow-x: auto;
    padding-bottom: 2px;
}
.facility-cost-segmented-scroll .ant-segmented {
    min-width: max-content;
}
.facility-cost-header-actions {
    flex-shrink: 0;
}
.facility-cost-filter-label {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
}
.facility-cost-filter-note {
    display: block;
    margin-top: 10px;
    font-size: 12px;
    color: #64748b;
}
.facility-cost-control {
    width: 100%;
}
.facility-cost-metric-card .ant-card-body {
    min-height: 128px;
    min-width: 0;
}
.facility-cost-metric-card .ant-statistic {
    min-width: 0;
}
.facility-cost-metric-card .ant-statistic-content {
    font-size: clamp(18px, 0.7rem + 0.7vw, 24px);
    font-weight: 700;
    line-height: 1.25;
    word-break: break-word;
    overflow-wrap: anywhere;
}
.facility-cost-metric-card .ant-statistic-content-suffix {
    font-size: 13px;
    word-break: keep-all;
}
.facility-cost-metric-button {
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
}
.facility-cost-metric-button:disabled {
    cursor: default;
}
.facility-cost-metric-card {
    height: 100%;
    transition:
        transform 160ms ease,
        box-shadow 160ms ease,
        border-color 160ms ease;
}
.facility-cost-metric-button:not(:disabled):hover .facility-cost-metric-card {
    transform: translateY(-2px);
    border-color: #91caff;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
}
.facility-cost-metric-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
}
.facility-cost-metric-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    color: #475569;
}
.facility-cost-metric-meta {
    display: block;
    margin-top: 4px;
    overflow: hidden;
    color: #475569;
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.facility-cost-metric-icon,
.facility-cost-status-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
}
.facility-cost-metric-icon {
    width: 38px;
    height: 38px;
    font-size: 18px;
}
.facility-cost-chart-frame,
.facility-cost-empty-chart {
    height: 340px;
    min-width: 0;
}
.facility-cost-chart-hint {
    display: block;
    margin-top: 6px;
    font-size: 11px;
    text-align: center;
}
.facility-cost-mix-legend {
    display: grid;
    gap: 6px;
}
.facility-cost-mix-legend__row,
.facility-cost-period-detail__row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
}
.facility-cost-period-detail__row--total {
    padding-top: 8px;
    border-top: 1px dashed #e2e8f0;
    font-weight: 700;
}
.facility-cost-mix-legend__dot {
    width: 9px;
    height: 9px;
    flex: 0 0 9px;
    border-radius: 999px;
}
.facility-cost-mix-legend__name {
    flex: 1 1 auto;
    min-width: 0;
    color: #475569;
}
.facility-cost-mix-legend__value {
    flex-shrink: 0;
    color: #0f172a;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}
.facility-cost-mix-legend__value em {
    color: #94a3b8;
    font-style: normal;
    font-weight: 500;
}
.facility-cost-period-detail {
    display: grid;
    gap: 10px;
}
.facility-cost-rank-list {
    display: grid;
    gap: 8px;
}
.facility-cost-rank-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid #eef2f7;
    border-radius: 10px;
    background: #ffffff;
    text-align: left;
    cursor: pointer;
    transition:
        transform 160ms ease,
        border-color 160ms ease,
        box-shadow 160ms ease;
}
.facility-cost-rank-item:hover {
    transform: translateY(-1px);
    border-color: #93c5fd;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}
.facility-cost-rank-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex: 0 0 26px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #475569;
    font-size: 12px;
    font-weight: 800;
}
.facility-cost-rank-badge--top {
    background: linear-gradient(135deg, #1d4ed8, #3b82f6);
    color: #ffffff;
    box-shadow: 0 4px 10px rgba(37, 99, 235, 0.35);
}
.facility-cost-rank-main {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 3px;
}
.facility-cost-rank-main > strong {
    overflow: hidden;
    color: #0f172a;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.facility-cost-rank-meta {
    overflow: hidden;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.facility-cost-rank-bar {
    display: block;
    height: 5px;
    border-radius: 999px;
    background: #f1f5f9;
    overflow: hidden;
}
.facility-cost-rank-bar > i {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #f59e0b, #fbbf24);
}
.facility-cost-rank-value {
    display: grid;
    flex-shrink: 0;
    justify-items: end;
    gap: 2px;
}
.facility-cost-rank-value > strong {
    color: #0f172a;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
}
.facility-cost-rank-value > em {
    color: #94a3b8;
    font-size: 11px;
    font-style: normal;
    font-weight: 600;
}
.facility-cost-section-card {
    transition:
        transform 160ms ease,
        box-shadow 160ms ease;
}
.facility-cost-section-card:hover {
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}
.facility-cost-empty-chart {
    display: flex;
    align-items: center;
    justify-content: center;
}
.facility-cost-composition-card .ant-card-body {
    display: grid;
    gap: 16px;
}
.facility-cost-donut-frame {
    height: 220px;
    min-width: 0;
}
.facility-cost-insight-list {
    display: grid;
    gap: 10px;
}
.facility-cost-insight-list > button {
    display: grid;
    gap: 4px;
    width: 100%;
    padding: 12px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
    text-align: left;
    cursor: pointer;
    transition:
        transform 160ms ease,
        border-color 160ms ease,
        background 160ms ease;
}
.facility-cost-insight-list > button:hover {
    transform: translateY(-1px);
    border-color: #91caff;
    background: #fff;
}
.facility-cost-insight-list > button span {
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
}
.facility-cost-insight-list > button strong {
    min-width: 0;
    color: #0f172a;
    line-height: 1.35;
    overflow-wrap: anywhere;
}
.facility-cost-status-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}
.facility-cost-status-grid--compact {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}
.facility-cost-status-tile {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
    padding: 12px;
    border: 1px solid #eef2f7;
    border-radius: 8px;
    background: #fff;
}
.facility-cost-status-icon {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
}
.facility-cost-status-content,
.facility-cost-asset-cell {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 4px;
}
.facility-cost-drilldown {
    display: grid;
    gap: 14px;
}
@media (max-width: 767px) {
    .facility-cost-page {
        gap: 12px;
    }
    .facility-cost-header-actions {
        width: 100%;
        justify-content: stretch;
    }
    .facility-cost-header-actions .ant-space-item,
    .facility-cost-header-actions .ant-btn {
        flex: 1 1 0;
    }
    .facility-cost-filter-card .ant-card-body,
    .facility-cost-section-card .ant-card-body,
    .facility-cost-metric-card .ant-card-body {
        padding: 12px;
    }
    .facility-cost-filter-toolbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 10px;
        margin-bottom: 12px;
    }
    .facility-cost-metric-card .ant-card-body {
        min-height: 118px;
    }
    .facility-cost-metric-card .ant-statistic-content {
        font-size: 18px !important;
        line-height: 1.25;
        word-break: break-word;
    }
    .facility-cost-metric-card .ant-statistic-content-suffix {
        display: block;
        margin-inline-start: 0;
        margin-top: 2px;
        font-size: 11px;
    }
    .facility-cost-chart-frame,
    .facility-cost-empty-chart {
        height: 260px;
    }
    .facility-cost-donut-frame {
        height: 210px;
    }
    .facility-cost-status-grid {
        grid-template-columns: 1fr;
    }
    .facility-cost-active-filters {
        gap: 5px;
    }
    .facility-cost-filter-chip {
        max-width: 100%;
        white-space: normal;
        line-height: 1.35;
    }
    .facility-cost-section-card .ant-table-wrapper {
        margin-inline: -12px;
    }
    .facility-cost-section-card .ant-table {
        font-size: 12px;
    }
}
`;
