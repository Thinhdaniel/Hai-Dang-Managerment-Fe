import React, { useCallback, useMemo, useRef, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    Alert,
    App,
    Badge,
    Button,
    Card,
    Col,
    DatePicker,
    Descriptions,
    Drawer,
    Empty,
    Grid,
    Input,
    Modal,
    Row,
    Segmented,
    Select,
    Skeleton,
    Space,
    Statistic,
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    AlertOutlined,
    BarChartOutlined,
    CalendarOutlined,
    DatabaseOutlined,
    DownloadOutlined,
    FilterOutlined,
    InboxOutlined,
    LineChartOutlined,
    ReloadOutlined,
    SearchOutlined,
    ShopOutlined,
    SlidersOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../components/shared/PageHeader';
import EChart, { type ECharts, type EChartsCoreOption } from '../components/charts/EChart';
import {
    CHART_SEMANTIC,
    DeltaBadge,
    DonutCenter,
    ECHARTS_AXIS_LABEL,
    ECHARTS_LEGEND_TOP,
    ECHARTS_TOOLTIP_STYLE,
    Sparkline,
    barGradient,
    blueByRank,
    makeAxisTooltipFormatter,
} from '../components/charts';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess } from '../core/lib/permissions';
import { plantService } from '../core/services/plant.service';
import {
    distributionService,
    materialReportService,
    materialService,
    materialSupplierService,
    type Distribution,
    type DistributionCostByPeriod,
    type DistributionCostByPlant,
    type Material,
    type MaterialCostFlowByPlant,
    type MaterialCostByPeriodPoint,
    type MaterialReportSummary,
    type MaterialReportQueryParams,
    type MaterialSupplier,
    type PriceComparisonReportRow,
    type SupplierReportRow,
    type TopConsumedMaterial,
} from '../core/services/material.service';

const { RangePicker } = DatePicker;
const { Text } = Typography;
const { useBreakpoint } = Grid;

type GroupBy = NonNullable<MaterialReportQueryParams['groupBy']>;
type QuickRange = 'this_month' | 'quarter' | 'six_months' | 'year' | 'custom';
type DetailPayload =
    | { type: 'purchase'; title: string; record: PriceComparisonReportRow }
    | { type: 'distribution'; title: string; record: Distribution | DistributionCostByPlant | MaterialCostFlowByPlant }
    | { type: 'material'; title: string; record: TopConsumedMaterial }
    | { type: 'supplier'; title: string; record: SupplierReportRow };

type MaterialDrilldownPayload =
    | { kind: 'purchase'; title: string; description: string; rows: PriceComparisonReportRow[]; loading?: boolean }
    | { kind: 'distribution'; title: string; description: string; rows: Distribution[]; loading?: boolean }
    | { kind: 'materials'; title: string; description: string; rows: TopConsumedMaterial[]; loading?: boolean }
    | { kind: 'suppliers'; title: string; description: string; rows: SupplierReportRow[]; loading?: boolean }
    | { kind: 'message'; title: string; description: string };

type ActiveFilterChip = {
    key: string;
    label: string;
    color?: string;
};

type MaterialKpiConfig = {
    title: string;
    value: number;
    previousValue?: number;
    formatter?: (value: number) => string;
    suffix?: string;
    icon: React.ReactNode;
    color: string;
    hint: string;
    onClick?: () => void;
};

type ReportFilters = {
    plantId?: string;
    dateRange: [Dayjs, Dayjs];
    materialId?: string;
    category?: string;
    supplierId?: string;
    status?: string;
    groupBy: GroupBy;
};

const truncateLabel = (value: string, max = 16) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    draft: { label: 'Nháp', color: 'default' },
    pending: { label: 'Chờ xử lý', color: 'warning' },
    confirmed: { label: 'Đã xác nhận', color: 'blue' },
    in_progress: { label: 'Đang lên đơn', color: 'blue' },
    ordered: { label: 'Đã đặt hàng', color: 'processing' },
    received: { label: 'Đã nhận', color: 'success' },
    cancelled: { label: 'Đã hủy', color: 'error' },
    distributed: { label: 'Đã xuất', color: 'processing' },
};

const GROUP_BY_LABEL: Record<GroupBy, string> = {
    day: 'Ngày',
    week: 'Tuần',
    month: 'Tháng',
    quarter: 'Quý',
};

const DEFAULT_FILTERS: ReportFilters = {
    dateRange: [dayjs().startOf('month'), dayjs().endOf('day')],
    groupBy: 'month',
};

const fmtCurrency = (value = 0) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

const fmtNumber = (value = 0) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);

// Rút gọn tiền theo cách đọc của kế toán Việt: 1,2 tỷ · 850 tr · 12k
const fmtShort = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace('.', ',')} tỷ`;
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace('.', ',')} tr`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
    return String(value);
};

const normalizeList = <T,>(response: T[] | { data?: T[] } | undefined): T[] => {
    if (!response) return [];
    return Array.isArray(response) ? response : (response.data ?? []);
};

const toReportParams = (filters: ReportFilters): MaterialReportQueryParams => ({
    plantId: filters.plantId,
    startDate: filters.dateRange[0].format('YYYY-MM-DD'),
    endDate: filters.dateRange[1].format('YYYY-MM-DD'),
    materialId: filters.materialId,
    category: filters.category,
    supplierId: filters.supplierId,
    status: filters.status,
    groupBy: filters.groupBy,
});

const getQuickRange = (range: QuickRange): [Dayjs, Dayjs] => {
    if (range === 'quarter') {
        const quarterStartMonth = Math.floor(dayjs().month() / 3) * 3;
        return [dayjs().month(quarterStartMonth).startOf('month'), dayjs().endOf('day')];
    }
    if (range === 'six_months') return [dayjs().subtract(5, 'month').startOf('month'), dayjs().endOf('day')];
    if (range === 'year') return [dayjs().startOf('year'), dayjs().endOf('day')];
    return [dayjs().startOf('month'), dayjs().endOf('day')];
};

const renderStatus = (status?: string) => {
    const info = STATUS_LABEL[status ?? ''] ?? { label: status || 'Không rõ', color: 'default' };
    return <Tag color={info.color}>{info.label}</Tag>;
};

export default function MaterialReportPage() {
    const { message } = App.useApp();
    const { user } = useAuth();
    const screens = useBreakpoint();
    const isManager = hasManagerAccess(user?.role);
    const isMobile = !screens.md;
    const [quickRange, setQuickRange] = useState<QuickRange>('this_month');
    // Bộ lọc tự áp dụng ngay khi chọn — không cần nút "Áp dụng"
    const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
    const [filterOpen, setFilterOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [detail, setDetail] = useState<DetailPayload | null>(null);
    const [drilldown, setDrilldown] = useState<MaterialDrilldownPayload | null>(null);
    const [detailSearch, setDetailSearch] = useState('');

    const params = useMemo(() => toReportParams(filters), [filters]);

    const plantsQuery = useQuery({
        queryKey: ['report-plants'],
        queryFn: () => plantService.getAll(),
        staleTime: 5 * 60_000,
    });

    const materialsQuery = useQuery({
        queryKey: ['report-materials'],
        queryFn: () => materialService.getAll({ limit: 1000, isActive: true }),
        staleTime: 5 * 60_000,
    });

    const suppliersQuery = useQuery({
        queryKey: ['report-suppliers'],
        queryFn: () => materialSupplierService.getAll({ limit: 500, isActive: true }),
        staleTime: 5 * 60_000,
    });

    const summaryQuery = useQuery({
        queryKey: ['material-report-summary', params],
        queryFn: () => materialReportService.getSummary(params),
        staleTime: 60_000,
    });

    // Kỳ liền trước (cùng độ dài) để hiện ±% trên KPI
    const prevParams = useMemo<MaterialReportQueryParams>(() => {
        const [start, end] = filters.dateRange;
        const days = end.diff(start, 'day') + 1;
        return {
            ...toReportParams(filters),
            startDate: start.subtract(days, 'day').format('YYYY-MM-DD'),
            endDate: start.subtract(1, 'day').format('YYYY-MM-DD'),
        };
    }, [filters]);

    const prevSummaryQuery = useQuery({
        queryKey: ['material-report-summary-prev', prevParams],
        queryFn: () => materialReportService.getSummary(prevParams),
        staleTime: 60_000,
    });
    const prevSummary = prevSummaryQuery.data;

    const costQuery = useQuery({
        queryKey: ['material-report-cost', params],
        queryFn: () => materialReportService.getCostByPeriod(params),
        staleTime: 60_000,
    });

    const topQuery = useQuery({
        queryKey: ['material-report-top', params],
        queryFn: () => materialReportService.getTopMaterials({ ...params, limit: 15 }),
        staleTime: 60_000,
    });

    const supplierQuery = useQuery({
        queryKey: ['material-report-supplier', params],
        queryFn: () => materialReportService.getBySupplier(params),
        staleTime: 60_000,
    });

    const priceQuery = useQuery({
        queryKey: ['material-report-price', params],
        queryFn: () => materialReportService.getPriceComparison(params),
        staleTime: 60_000,
    });

    const distributionQuery = useQuery({
        queryKey: ['material-report-distribution', params],
        queryFn: () => materialReportService.getDistributionCost(params),
        staleTime: 60_000,
    });

    const costFlowByPlantQuery = useQuery({
        queryKey: ['material-report-cost-flow-by-plant', params],
        queryFn: () => materialReportService.getCostFlowByPlant(params),
        staleTime: 60_000,
    });

    const distributionDetailQuery = useQuery({
        queryKey: ['material-report-distribution-detail', params],
        queryFn: () =>
            distributionService.getAll({
                startDate: params.startDate,
                endDate: params.endDate,
                toPlantId: params.plantId,
                page: 1,
                limit: 200,
            }),
        staleTime: 60_000,
    });

    const plants = plantsQuery.data ?? [];
    const materials = normalizeList<Material>(materialsQuery.data);
    const suppliers = normalizeList<MaterialSupplier>(suppliersQuery.data);
    const summary = summaryQuery.data;
    const costTrend = costQuery.data ?? [];
    const topMaterials = topQuery.data ?? [];
    const supplierRows = supplierQuery.data ?? [];
    const priceRows = priceQuery.data ?? [];
    const distributionCost = distributionQuery.data;
    const costFlowByPlant = costFlowByPlantQuery.data ?? [];
    const distributionDetails = normalizeList<Distribution>(distributionDetailQuery.data);

    const isLoading =
        summaryQuery.isLoading ||
        costQuery.isLoading ||
        topQuery.isLoading ||
        supplierQuery.isLoading ||
        priceQuery.isLoading ||
        distributionQuery.isLoading ||
        costFlowByPlantQuery.isLoading;

    const hasError =
        summaryQuery.isError ||
        costQuery.isError ||
        topQuery.isError ||
        supplierQuery.isError ||
        priceQuery.isError ||
        distributionQuery.isError ||
        costFlowByPlantQuery.isError;

    const categoryOptions = useMemo(
        () =>
            [...new Set(materials.map((material) => material.category).filter(Boolean))]
                .sort((a, b) => String(a).localeCompare(String(b)))
                .map((category) => ({ label: category, value: category })),
        [materials]
    );

    const filteredPurchaseDetails = useMemo(() => {
        const keyword = detailSearch.trim().toLowerCase();
        if (!keyword) return priceRows;
        return priceRows.filter((record) =>
            [record.orderCode, record.supplierName, record.status, ...(record.requestCodes ?? [])]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(keyword)
        );
    }, [detailSearch, priceRows]);

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

    const handleRefresh = () => {
        summaryQuery.refetch();
        costQuery.refetch();
        topQuery.refetch();
        supplierQuery.refetch();
        priceQuery.refetch();
        distributionQuery.refetch();
        costFlowByPlantQuery.refetch();
        distributionDetailQuery.refetch();
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            await materialReportService.exportExcel(params);
            message.success('Đã xuất báo cáo Excel theo bộ lọc hiện tại');
            setExportOpen(false);
        } catch {
            message.error('Không thể xuất báo cáo Excel');
        } finally {
            setExporting(false);
        }
    };

    // Số filter phụ đang bật — hiện badge trên nút "Bộ lọc"
    const advancedFilterCount = [filters.materialId, filters.category, filters.supplierId, filters.status].filter(
        Boolean
    ).length;

    // Chip gỡ nhanh từng filter phụ
    const advancedFilterChips = useMemo<ActiveFilterChip[]>(() => {
        const chips: ActiveFilterChip[] = [];
        if (filters.category) {
            chips.push({ key: 'category', label: `Nhóm VT: ${filters.category}`, color: 'purple' });
        }
        if (filters.materialId) {
            chips.push({
                key: 'materialId',
                label: `Vật tư: ${materials.find((material) => material.id === filters.materialId)?.name ?? 'Đã chọn'}`,
                color: 'green',
            });
        }
        if (filters.supplierId) {
            chips.push({
                key: 'supplierId',
                label: `NCC: ${suppliers.find((supplier) => supplier.id === filters.supplierId)?.name ?? 'Đã chọn'}`,
                color: 'gold',
            });
        }
        if (filters.status) {
            chips.push({
                key: 'status',
                label: `Trạng thái: ${STATUS_LABEL[filters.status]?.label ?? filters.status}`,
                color: 'orange',
            });
        }
        return chips;
    }, [filters, materials, suppliers]);

    const clearAdvancedFilter = (key: string) => {
        setFilters((current) => ({ ...current, [key]: undefined }));
    };

    const heroPurchaseCost = summary?.totalPurchaseCost ?? summary?.totalMonthlyCost ?? 0;
    const heroPrevPurchaseCost = prevSummary
        ? (prevSummary.totalPurchaseCost ?? prevSummary.totalMonthlyCost ?? 0)
        : undefined;

    const kpis: MaterialKpiConfig[] = [
        {
            title: 'Giá trị cấp phát vật tư',
            value: summary?.totalDistributionCost ?? 0,
            previousValue: prevSummary ? (prevSummary.totalDistributionCost ?? 0) : undefined,
            formatter: fmtCurrency,
            icon: <InboxOutlined />,
            color: '#722ed1',
            hint: 'Tổng giá trị vật tư đã cấp phát hoặc xuất cho cơ sở nhận trong kỳ.',
            onClick: () =>
                setDrilldown({
                    kind: 'distribution',
                    title: 'Chi tiết cấp phát vật tư',
                    description: 'Các phiếu cấp phát/xuất vật tư trong kỳ và bộ lọc hiện tại.',
                    rows: distributionDetails,
                    loading: distributionDetailQuery.isLoading,
                }),
        },
        {
            title: 'Net sau hoàn trả',
            value: summary?.totalNetPurchaseCost ?? 0,
            previousValue: prevSummary ? (prevSummary.totalNetPurchaseCost ?? 0) : undefined,
            formatter: fmtCurrency,
            icon: <LineChartOutlined />,
            color: '#52c41a',
            hint: 'Chi phí mua vật tư sau khi trừ hoàn trả hoặc điều chỉnh nếu có.',
            onClick: () =>
                setDrilldown({
                    kind: 'purchase',
                    title: 'Chi tiết net sau hoàn trả',
                    description: 'Các đơn mua vật tư sau khi tính hoàn trả/điều chỉnh nếu có.',
                    rows: filteredPurchaseDetails,
                    loading: priceQuery.isLoading,
                }),
        },
        {
            title: 'Lệch giá',
            value: summary?.totalPriceVariance ?? 0,
            formatter: fmtCurrency,
            icon: <AlertOutlined />,
            color: (summary?.totalPriceVariance ?? 0) > 0 ? '#f5222d' : '#52c41a',
            hint: 'Chênh lệch giữa giá dự kiến/tham chiếu và giá thực tế sau hoàn trả.',
            onClick: () =>
                setDrilldown({
                    kind: 'purchase',
                    title: 'Các đơn có lệch giá',
                    description: 'Danh sách đơn mua có chênh lệch giữa dự tính và thực tế.',
                    rows: priceRows.filter((row) => Math.abs(row.difference ?? 0) > 0),
                    loading: priceQuery.isLoading,
                }),
        },
        {
            title: 'Dưới ngưỡng',
            value: summary?.lowStockCount ?? 0,
            suffix: 'vật tư',
            icon: <WarningOutlined />,
            color: '#f5222d',
            hint: 'Vật tư có tồn thấp hơn ngưỡng tối thiểu.',
            onClick: () =>
                setDrilldown({
                    kind: 'materials',
                    title: 'Vật tư dưới ngưỡng',
                    description: 'Các vật tư tiêu hao nhiều hoặc đang được đánh dấu dưới ngưỡng trong dữ liệu hiện có.',
                    rows: topMaterials.filter(
                        (row) => (row.currentStock ?? Number.POSITIVE_INFINITY) < (row.minStockLevel ?? 0)
                    ),
                    loading: topQuery.isLoading,
                }),
        },
    ];

    const topSupplier = supplierRows[0];
    const topPlant = distributionCost?.byPlant?.[0];
    const highVarianceCount = priceRows.filter((row) => Math.abs(row.difference ?? 0) > 0).length;

    return (
        <div className='report-page'>
            <style>{REPORT_PAGE_STYLE}</style>
            <PageHeader
                title='Báo cáo vật tư'
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
                        onChange={(plantId) => setFilters((current) => ({ ...current, plantId }))}
                        options={plants.map((plant) => ({ label: plant.name, value: plant.id }))}
                    />
                ) : null}
                <Badge count={advancedFilterCount} size='small'>
                    <Button icon={<FilterOutlined />} onClick={() => setFilterOpen(true)}>
                        Bộ lọc
                    </Button>
                </Badge>
                <Button type='text' size='small' onClick={handleResetFilters}>
                    Đặt lại
                </Button>
                <span className='hd-report-toolbar__spacer' />
                <Tooltip title='Làm mới dữ liệu'>
                    <Button icon={<ReloadOutlined />} loading={isLoading} onClick={handleRefresh} />
                </Tooltip>
                <Button type='primary' icon={<DownloadOutlined />} onClick={() => setExportOpen(true)}>
                    Xuất Excel
                </Button>
            </div>

            {advancedFilterChips.length ? (
                <div className='hd-chip-row'>
                    {advancedFilterChips.map((chip) => (
                        <Tag
                            key={chip.key}
                            color={chip.color}
                            closable
                            onClose={(event) => {
                                event.preventDefault();
                                clearAdvancedFilter(chip.key);
                            }}
                            className='report-filter-chip'
                        >
                            {chip.label}
                        </Tag>
                    ))}
                </div>
            ) : null}

            <Drawer
                title='Bộ lọc nâng cao'
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                size={360}
                destroyOnHidden={false}
            >
                <div className='report-filter-drawer'>
                    <div>
                        <Text className='report-filter-label'>Nhóm vật tư</Text>
                        <Select
                            allowClear
                            showSearch={{ optionFilterProp: 'label' }}
                            placeholder='Tất cả nhóm'
                            className='report-filter-control'
                            value={filters.category}
                            onChange={(category) =>
                                setFilters((current) => ({ ...current, category, materialId: undefined }))
                            }
                            options={categoryOptions}
                        />
                    </div>
                    <div>
                        <Text className='report-filter-label'>Vật tư</Text>
                        <Select
                            allowClear
                            showSearch={{ optionFilterProp: 'label' }}
                            placeholder='Tất cả vật tư'
                            className='report-filter-control'
                            value={filters.materialId}
                            onChange={(materialId) => setFilters((current) => ({ ...current, materialId }))}
                            options={materials
                                .filter((material) => !filters.category || material.category === filters.category)
                                .map((material) => ({
                                    label: `${material.code ? `${material.code} · ` : ''}${material.name}`,
                                    value: material.id,
                                }))}
                        />
                    </div>
                    <div>
                        <Text className='report-filter-label'>Nhà cung cấp</Text>
                        <Select
                            allowClear
                            showSearch={{ optionFilterProp: 'label' }}
                            placeholder='Tất cả NCC'
                            className='report-filter-control'
                            value={filters.supplierId}
                            onChange={(supplierId) => setFilters((current) => ({ ...current, supplierId }))}
                            options={suppliers.map((supplier) => ({ label: supplier.name, value: supplier.id }))}
                        />
                    </div>
                    <div>
                        <Text className='report-filter-label'>Trạng thái mua hàng</Text>
                        <Select
                            allowClear
                            placeholder='Tất cả trạng thái'
                            className='report-filter-control'
                            value={filters.status}
                            onChange={(status) => setFilters((current) => ({ ...current, status }))}
                            options={Object.entries(STATUS_LABEL)
                                .filter(([status]) =>
                                    ['draft', 'confirmed', 'in_progress', 'ordered', 'received', 'cancelled'].includes(
                                        status
                                    )
                                )
                                .map(([value, info]) => ({ label: info.label, value }))}
                        />
                    </div>
                    <div>
                        <Text className='report-filter-label'>Gom biểu đồ</Text>
                        <Segmented
                            block
                            value={filters.groupBy}
                            onChange={(groupBy) =>
                                setFilters((current) => ({ ...current, groupBy: groupBy as GroupBy }))
                            }
                            options={[
                                { label: 'Ngày', value: 'day' },
                                { label: 'Tuần', value: 'week' },
                                { label: 'Tháng', value: 'month' },
                                { label: 'Quý', value: 'quarter' },
                            ]}
                        />
                    </div>
                </div>
            </Drawer>

            {hasError ? (
                <Alert
                    showIcon
                    type='error'
                    title='Không tải được một phần dữ liệu báo cáo'
                    description='Vui lòng kiểm tra lại bộ lọc hoặc thử làm mới trang.'
                    action={<Button onClick={handleRefresh}>Thử lại</Button>}
                />
            ) : null}

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={10} xxl={8}>
                    <div className='hd-hero-card'>
                        <span className='hd-hero-card__title'>Chi phí mua vật tư</span>
                        {summaryQuery.isLoading ? (
                            <Skeleton active paragraph={{ rows: 2 }} title={false} />
                        ) : (
                            <>
                                <span className='hd-hero-card__value'>{fmtCurrency(heroPurchaseCost)}</span>
                                <DeltaBadge
                                    current={heroPurchaseCost}
                                    previous={heroPrevPurchaseCost}
                                    formatter={fmtCurrency}
                                />
                                <div className='hd-hero-card__spark'>
                                    <Sparkline data={costTrend.map((point) => Number(point.totalAmount ?? 0))} />
                                </div>
                                <div className='hd-hero-card__subs'>
                                    <button
                                        type='button'
                                        onClick={() =>
                                            setDrilldown({
                                                kind: 'purchase',
                                                title: 'Chi tiết chi phí mua vật tư',
                                                description:
                                                    'Các đơn mua vật tư tạo nên KPI trong kỳ và bộ lọc hiện tại.',
                                                rows: filteredPurchaseDetails,
                                                loading: priceQuery.isLoading,
                                            })
                                        }
                                    >
                                        <i style={{ background: CHART_SEMANTIC.purchaseLine }} />
                                        Net sau hoàn trả <strong>{fmtShort(summary?.totalNetPurchaseCost ?? 0)}</strong>
                                    </button>
                                    <button
                                        type='button'
                                        onClick={() =>
                                            setDrilldown({
                                                kind: 'distribution',
                                                title: 'Chi tiết cấp phát vật tư',
                                                description:
                                                    'Các phiếu cấp phát/xuất vật tư trong kỳ và bộ lọc hiện tại.',
                                                rows: distributionDetails,
                                                loading: distributionDetailQuery.isLoading,
                                            })
                                        }
                                    >
                                        <i style={{ background: CHART_SEMANTIC.material }} />
                                        Cấp phát <strong>{fmtShort(summary?.totalDistributionCost ?? 0)}</strong>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </Col>
                <Col xs={24} lg={14} xxl={16}>
                    <Row gutter={[12, 12]} className='report-kpi-grid'>
                        {kpis.map((kpi) => (
                            <Col key={kpi.title} xs={12} xl={6}>
                                <ReportKpiCard kpi={kpi} loading={summaryQuery.isLoading} />
                            </Col>
                        ))}
                    </Row>
                </Col>
            </Row>

            <div className='hd-signal-strip'>
                {(summary?.lowStockCount ?? 0) > 0 ? (
                    <button
                        type='button'
                        className='hd-signal-item hd-signal-item--danger'
                        onClick={() =>
                            setDrilldown({
                                kind: 'materials',
                                title: 'Vật tư dưới ngưỡng',
                                description: 'Danh sách vật tư dưới ngưỡng từ dữ liệu đang có trong báo cáo.',
                                rows: topMaterials.filter(
                                    (row) => (row.currentStock ?? Number.POSITIVE_INFINITY) < (row.minStockLevel ?? 0)
                                ),
                            })
                        }
                    >
                        <WarningOutlined /> <strong>{summary?.lowStockCount}</strong> vật tư dưới ngưỡng tồn
                    </button>
                ) : null}
                {highVarianceCount > 0 ? (
                    <button
                        type='button'
                        className='hd-signal-item hd-signal-item--warning'
                        onClick={() =>
                            setDrilldown({
                                kind: 'purchase',
                                title: 'Các đơn có lệch giá',
                                description: 'Chênh lệch giữa giá dự kiến/tham chiếu và giá thực tế.',
                                rows: priceRows.filter((row) => Math.abs(row.difference ?? 0) > 0),
                            })
                        }
                    >
                        <AlertOutlined /> <strong>{highVarianceCount}</strong> đơn mua có lệch giá
                    </button>
                ) : null}
                {(summary?.pendingRequestCount ?? 0) > 0 ? (
                    <button type='button' className='hd-signal-item' disabled>
                        <CalendarOutlined /> <strong>{summary?.pendingRequestCount}</strong> phiếu mua chờ duyệt
                    </button>
                ) : null}
                {topSupplier ? (
                    <button
                        type='button'
                        className='hd-signal-item'
                        onClick={() =>
                            setDrilldown({
                                kind: 'suppliers',
                                title: 'Chi phí mua vật tư theo nhà cung cấp',
                                description: 'Tỷ trọng và giá trị mua vật tư theo NCC trong kỳ.',
                                rows: supplierRows,
                            })
                        }
                    >
                        <ShopOutlined /> NCC lớn nhất:{' '}
                        <strong>
                            {topSupplier.supplierName} · {fmtShort(topSupplier.totalAmount ?? 0)}
                        </strong>
                    </button>
                ) : null}
                {topPlant ? (
                    <button
                        type='button'
                        className='hd-signal-item'
                        onClick={() =>
                            setDrilldown({
                                kind: 'materials',
                                title: 'Top vật tư tiêu hao',
                                description: 'Các vật tư có lượng xuất/cấp phát lớn trong kỳ.',
                                rows: topMaterials,
                            })
                        }
                    >
                        <InboxOutlined /> Cơ sở nhận nhiều nhất:{' '}
                        <strong>
                            {topPlant.plantName} · {fmtShort(topPlant.totalWithVat)}
                        </strong>
                    </button>
                ) : null}
            </div>

            <Card className='report-main-card' variant='outlined'>
                <Tabs
                    className='report-tabs'
                    destroyOnHidden
                    tabBarGutter={isMobile ? 8 : 16}
                    size={isMobile ? 'small' : 'middle'}
                    items={[
                        {
                            key: 'overview',
                            label: 'Tổng quan',
                            icon: <BarChartOutlined />,
                            children: (
                                <OverviewTab
                                    costTrend={costTrend}
                                    topMaterials={topMaterials}
                                    suppliers={supplierRows}
                                    distribution={distributionCost}
                                    costFlowByPlant={costFlowByPlant}
                                    loading={isLoading}
                                    onOpenDetail={setDetail}
                                />
                            ),
                        },
                        {
                            key: 'consumption',
                            label: 'Tiêu hao vật tư',
                            icon: <DatabaseOutlined />,
                            children: (
                                <ConsumptionTab
                                    data={topMaterials}
                                    loading={topQuery.isLoading}
                                    onOpenDetail={setDetail}
                                />
                            ),
                        },
                        {
                            key: 'supplier-price',
                            label: 'NCC & giá',
                            icon: <ShopOutlined />,
                            children: (
                                <SupplierPriceTab
                                    suppliers={supplierRows}
                                    prices={priceRows}
                                    loading={supplierQuery.isLoading || priceQuery.isLoading}
                                    onOpenDetail={setDetail}
                                />
                            ),
                        },
                        {
                            key: 'distribution',
                            label: 'Cấp phát vật tư',
                            icon: <InboxOutlined />,
                            children: (
                                <DistributionTab
                                    data={distributionCost}
                                    loading={distributionQuery.isLoading}
                                    onOpenDetail={setDetail}
                                />
                            ),
                        },
                        {
                            key: 'detail',
                            label: 'Dữ liệu chi tiết',
                            icon: <SlidersOutlined />,
                            children: (
                                <DetailTab
                                    purchaseRows={filteredPurchaseDetails}
                                    distributionRows={distributionDetails}
                                    search={detailSearch}
                                    setSearch={setDetailSearch}
                                    loading={priceQuery.isLoading || distributionDetailQuery.isLoading}
                                    onOpenDetail={setDetail}
                                />
                            ),
                        },
                    ]}
                />
            </Card>

            <Modal
                title='Xuất báo cáo Excel'
                open={exportOpen}
                confirmLoading={exporting}
                okText='Xuất Excel'
                cancelText='Đóng'
                onOk={handleExport}
                onCancel={() => setExportOpen(false)}
            >
                <Text type='secondary'>
                    File sẽ được tạo theo đúng bộ lọc đang áp dụng, gồm các sheet nghiệp vụ chính.
                </Text>
                <div className='report-export-list'>
                    {[
                        'Tổng quan vật tư',
                        'Mua vật tư theo kỳ',
                        'Mua vật tư',
                        'Cấp phát vật tư',
                        'Top tiêu hao',
                        'Nhà cung cấp',
                    ].map((sheet) => (
                        <Tag key={sheet} color='blue'>
                            {sheet}
                        </Tag>
                    ))}
                </div>
            </Modal>

            <ReportDetailDrawer detail={detail} onClose={() => setDetail(null)} />
            <MaterialDrilldownDrawer drilldown={drilldown} onClose={() => setDrilldown(null)} />
        </div>
    );
}

function ReportKpiCard({ kpi, loading }: { kpi: MaterialKpiConfig; loading?: boolean }) {
    return (
        <button type='button' className='report-kpi-button' onClick={kpi.onClick} disabled={!kpi.onClick}>
            <Card className='report-kpi-card' loading={loading} variant='outlined'>
                <div className='report-kpi-head'>
                    <Tooltip title={kpi.hint}>
                        <Text type='secondary' className='report-kpi-title'>
                            {kpi.title}
                        </Text>
                    </Tooltip>
                    <span className='report-kpi-icon' style={{ color: kpi.color, background: `${kpi.color}16` }}>
                        {kpi.icon}
                    </span>
                </div>
                <Tooltip title={kpi.formatter ? kpi.formatter(kpi.value) : fmtNumber(kpi.value)}>
                    <Statistic
                        value={kpi.value}
                        formatter={(value) => (kpi.formatter ? kpi.formatter(Number(value)) : fmtNumber(Number(value)))}
                        suffix={kpi.suffix}
                        styles={{ content: { color: kpi.color, fontWeight: 700 } }}
                    />
                </Tooltip>
                {kpi.previousValue !== undefined ? (
                    <DeltaBadge
                        current={kpi.value}
                        previous={kpi.previousValue}
                        formatter={kpi.formatter ?? fmtNumber}
                    />
                ) : null}
                {kpi.onClick ? <Text className='report-kpi-action'>Nhấn để xem chi tiết</Text> : null}
            </Card>
        </button>
    );
}

function OverviewTab({
    costTrend,
    topMaterials,
    suppliers,
    distribution,
    costFlowByPlant,
    loading,
    onOpenDetail,
}: {
    costTrend: MaterialCostByPeriodPoint[];
    topMaterials: TopConsumedMaterial[];
    suppliers: SupplierReportRow[];
    distribution?: { byPlant: DistributionCostByPlant[]; byPeriod: DistributionCostByPeriod[] };
    costFlowByPlant: MaterialCostFlowByPlant[];
    loading: boolean;
    onOpenDetail: (detail: DetailPayload) => void;
}) {
    const combinedTrend = useMemo(() => {
        const rows = new Map<string, { period: string; purchaseCost: number; distributionValue: number }>();
        costTrend.forEach((point) => {
            rows.set(point.period, {
                period: point.period,
                purchaseCost: Number(point.totalAmount ?? 0),
                distributionValue: rows.get(point.period)?.distributionValue ?? 0,
            });
        });
        (distribution?.byPeriod ?? []).forEach((point) => {
            const current = rows.get(point.period) ?? { period: point.period, purchaseCost: 0, distributionValue: 0 };
            current.distributionValue = Number(point.totalWithVat ?? 0);
            rows.set(point.period, current);
        });
        return Array.from(rows.values()).sort((a, b) => a.period.localeCompare(b.period));
    }, [costTrend, distribution]);

    const trendInstance = useRef<ECharts | null>(null);
    const downloadTrendPng = () => {
        const url = trendInstance.current?.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
        if (!url) return;
        const link = document.createElement('a');
        link.href = url;
        link.download = 'vat-tu-mua-va-cap-phat.png';
        link.click();
    };

    const trendOption = useMemo<EChartsCoreOption>(() => {
        const many = combinedTrend.length > 18;
        return {
            animationDuration: 1100,
            animationEasing: 'elasticOut',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(37, 99, 235, 0.06)' } },
                ...ECHARTS_TOOLTIP_STYLE,
                formatter: makeAxisTooltipFormatter(),
            },
            legend: ECHARTS_LEGEND_TOP,
            grid: { left: 8, right: 14, top: 36, bottom: many ? 30 : 8, containLabel: true },
            xAxis: {
                type: 'category',
                data: combinedTrend.map((row) => row.period),
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
                    name: 'Giá trị cấp phát vật tư',
                    type: 'bar',
                    data: combinedTrend.map((row) => row.distributionValue),
                    barMaxWidth: 28,
                    barGap: '18%',
                    itemStyle: {
                        color: barGradient(CHART_SEMANTIC.material),
                        borderRadius: [8, 8, 0, 0],
                        shadowBlur: 8,
                        shadowColor: 'rgba(37, 99, 235, 0.28)',
                        shadowOffsetY: 4,
                    },
                    emphasis: { focus: 'series', itemStyle: { shadowBlur: 16 } },
                    animationDelay: (idx: number) => idx * 70,
                },
                {
                    name: 'Chi phí mua vật tư net',
                    type: 'bar',
                    data: combinedTrend.map((row) => row.purchaseCost),
                    barMaxWidth: 28,
                    itemStyle: {
                        color: barGradient(CHART_SEMANTIC.purchaseLine),
                        borderRadius: [8, 8, 0, 0],
                        shadowBlur: 8,
                        shadowColor: 'rgba(30, 58, 138, 0.26)',
                        shadowOffsetY: 4,
                    },
                    emphasis: { focus: 'series', itemStyle: { shadowBlur: 16 } },
                    animationDelay: (idx: number) => idx * 70 + 35,
                },
            ],
        };
    }, [combinedTrend]);

    // Trạng thái bật/tắt từng luồng chi phí qua legend. Khi tắt 1 luồng, biểu đồ
    // sắp xếp lại + đổi nhãn theo phần ĐANG HIỂN THỊ để cột luôn giảm dần và số
    // khớp với độ dài cột (tránh "rối mắt": cột ngắn nhưng nhãn ghi tổng đầy đủ).
    const [plantSeriesOn, setPlantSeriesOn] = useState({ purchase: true, distribution: true });

    const rowVisibleCost = useCallback(
        (row: MaterialCostFlowByPlant) =>
            (plantSeriesOn.purchase ? row.purchaseCost : 0) +
            (plantSeriesOn.distribution ? row.distributionCost : 0),
        [plantSeriesOn]
    );

    // Sắp tăng dần để cơ sở tốn nhiều nhất nằm trên cùng (trục category vẽ từ dưới lên)
    const plantRows = useMemo(
        () => [...costFlowByPlant].sort((a, b) => rowVisibleCost(a) - rowVisibleCost(b)),
        [costFlowByPlant, rowVisibleCost]
    );

    const plantOption = useMemo<EChartsCoreOption>(
        () => ({
            animationDuration: 1000,
            animationEasing: 'cubicOut',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(37, 99, 235, 0.06)' } },
                ...ECHARTS_TOOLTIP_STYLE,
                formatter: (params: unknown) => {
                    const points = Array.isArray(params) ? params : [params];
                    const first = points[0] as { dataIndex?: number };
                    const row = plantRows[first?.dataIndex ?? -1];
                    if (!row) return '';
                    // Dot màu cố định theo luồng (không phụ thuộc thứ tự points — vốn lệch khi ẩn 1 luồng)
                    const dot = (c: string) =>
                        `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:5px"></span>`;
                    const off = (on: boolean) => (on ? '' : ' <span style="color:#94a3b8">(đang ẩn)</span>');
                    const bothOn = plantSeriesOn.purchase && plantSeriesOn.distribution;
                    const lines = [
                        `<strong>${row.plantName}</strong>`,
                        `${dot(CHART_SEMANTIC.purchaseLine)}Chi phí mua vật tư: <b>${fmtCurrency(row.purchaseCost)}</b> (${row.purchaseOrderCount} đơn, ${row.purchaseItemCount} dòng)${off(plantSeriesOn.purchase)}`,
                        `${dot(CHART_SEMANTIC.material)}Giá trị cấp phát nhận: <b>${fmtCurrency(row.distributionCost)}</b> (${row.distributionCount} phiếu, ${row.distributionItemCount} dòng)${off(plantSeriesOn.distribution)}`,
                        `${bothOn ? 'Tổng chi phí vật tư' : 'Tổng đang hiển thị'}: <b>${fmtCurrency(rowVisibleCost(row))}</b>`,
                    ];
                    if (!row.canPurchase && row.purchaseCost === 0) {
                        lines.push('<span style="color:#64748b">Cơ sở này thường nhận vật tư qua cấp phát, không trực tiếp mua.</span>');
                    }
                    return lines.join('<br/>');
                },
            },
            legend: {
                ...ECHARTS_LEGEND_TOP,
                selected: {
                    'Chi phí mua vật tư': plantSeriesOn.purchase,
                    'Giá trị cấp phát nhận': plantSeriesOn.distribution,
                },
            },
            grid: { left: 8, right: 72, top: 34, bottom: 4, containLabel: true },
            xAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: '#eef2f7', type: 'dashed' } },
                axisLabel: { ...ECHARTS_AXIS_LABEL, formatter: (value: number) => fmtShort(value) },
            },
            yAxis: {
                type: 'category',
                data: plantRows.map((row) => row.plantName),
                axisTick: { show: false },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisLabel: { ...ECHARTS_AXIS_LABEL, formatter: (value: string) => truncateLabel(value, 15) },
            },
            series: [
                {
                    name: 'Chi phí mua vật tư',
                    type: 'bar',
                    stack: 'material-cost',
                    barMaxWidth: 24,
                    data: plantRows.map((row) => row.purchaseCost),
                    itemStyle: {
                        color: barGradient(CHART_SEMANTIC.purchaseLine, false),
                        shadowBlur: 6,
                        shadowColor: 'rgba(30, 58, 138, 0.2)',
                        shadowOffsetY: 3,
                    },
                    // Nhãn tổng chỉ gắn vào luồng "mua" khi luồng "cấp phát" bị ẩn
                    // (lúc đó "mua" là phần ngoài cùng) — tránh mất nhãn khi tắt cấp phát.
                    label: {
                        show: !plantSeriesOn.distribution,
                        position: 'right',
                        formatter: (params: { dataIndex: number }) =>
                            fmtShort(rowVisibleCost(plantRows[params.dataIndex] ?? ({} as MaterialCostFlowByPlant))),
                        color: '#475569',
                        fontSize: 11,
                        fontWeight: 600,
                    },
                    emphasis: { focus: 'series', itemStyle: { shadowBlur: 14 } },
                    animationDelay: (idx: number) => idx * 90,
                },
                {
                    name: 'Giá trị cấp phát nhận',
                    type: 'bar',
                    stack: 'material-cost',
                    barMaxWidth: 24,
                    data: plantRows.map((row) => row.distributionCost),
                    itemStyle: {
                        color: barGradient(CHART_SEMANTIC.material, false),
                        borderRadius: [0, 8, 8, 0],
                        shadowBlur: 6,
                        shadowColor: 'rgba(37, 99, 235, 0.22)',
                        shadowOffsetY: 3,
                    },
                    // Nhãn tổng hiển thị phần ĐANG HIỂN THỊ (khớp độ dài cột), không phải totalCost cứng
                    label: {
                        show: plantSeriesOn.distribution,
                        position: 'right',
                        formatter: (params: { dataIndex: number }) =>
                            fmtShort(rowVisibleCost(plantRows[params.dataIndex] ?? ({} as MaterialCostFlowByPlant))),
                        color: '#475569',
                        fontSize: 11,
                        fontWeight: 600,
                    },
                    emphasis: { focus: 'series', itemStyle: { shadowBlur: 14 } },
                    animationDelay: (idx: number) => idx * 90 + 80,
                },
            ],
        }),
        [plantRows, plantSeriesOn, rowVisibleCost]
    );

    const plantEvents = useMemo(
        () => ({
            click: (params: unknown) => {
                const info = params as { componentType?: string; dataIndex?: number };
                if (info?.componentType !== 'series') return;
                const row = plantRows[info.dataIndex ?? -1];
                if (row) onOpenDetail({ type: 'distribution', title: row.plantName, record: row });
            },
            // Bật/tắt luồng qua legend -> cập nhật state để sắp xếp lại cột + đổi nhãn theo phần hiển thị
            legendselectchanged: (params: unknown) => {
                const sel = (params as { selected?: Record<string, boolean> }).selected ?? {};
                setPlantSeriesOn({
                    purchase: sel['Chi phí mua vật tư'] !== false,
                    distribution: sel['Giá trị cấp phát nhận'] !== false,
                });
            },
        }),
        [plantRows, onOpenDetail]
    );

    const supplierMix = useMemo(() => {
        const topSupplierRows = suppliers.slice(0, 5);
        const otherSupplierTotal = suppliers.slice(5).reduce((sum, row) => sum + (row.totalAmount ?? 0), 0);
        return [
            ...topSupplierRows.map((row, index) => ({
                name: row.supplierName,
                value: row.totalAmount ?? 0,
                color: blueByRank(index, Math.max(topSupplierRows.length, 2)),
                row: row as SupplierReportRow | undefined,
            })),
            ...(otherSupplierTotal > 0
                ? [{ name: 'Khác', value: otherSupplierTotal, color: CHART_SEMANTIC.other, row: undefined }]
                : []),
        ].filter((item) => item.value > 0);
    }, [suppliers]);
    const supplierTotal = supplierMix.reduce((sum, item) => sum + item.value, 0);

    const supplierOption = useMemo<EChartsCoreOption>(
        () => ({
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
                    radius: ['62%', '90%'],
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
                    data: supplierMix.map((item) => ({
                        name: item.name,
                        value: item.value,
                        itemStyle: { color: item.color },
                    })),
                    animationType: 'scale',
                    animationEasing: 'elasticOut',
                    animationDuration: 1000,
                    animationDelay: (idx: number) => idx * 150,
                },
            ],
        }),
        [supplierMix]
    );

    const supplierEvents = useMemo(
        () => ({
            click: (params: unknown) => {
                const info = params as { dataIndex?: number };
                const item = supplierMix[info?.dataIndex ?? -1];
                if (item?.row) onOpenDetail({ type: 'supplier', title: item.row.supplierName, record: item.row });
            },
        }),
        [supplierMix, onOpenDetail]
    );

    if (loading) return <ReportSkeleton />;

    return (
        <Row gutter={[16, 16]}>
            <Col xs={24} xxl={16}>
                <SectionCard
                    title='Mua vật tư và cấp phát theo thời gian'
                    extra={
                        <Space size={8}>
                            <Tag color='blue'>Không cộng double-count</Tag>
                            <Tooltip title='Tải biểu đồ thành ảnh PNG'>
                                <Button
                                    size='small'
                                    className='hd-chart-png-btn'
                                    icon={<DownloadOutlined />}
                                    onClick={downloadTrendPng}
                                />
                            </Tooltip>
                        </Space>
                    }
                >
                    <ChartFrame empty={!combinedTrend.length}>
                        <EChart
                            option={trendOption}
                            height='100%'
                            instanceRef={trendInstance}
                            className='report-chart-fill'
                        />
                    </ChartFrame>
                    <Text type='secondary' className='report-chart-hint'>
                        Nhấn legend để ẩn/hiện từng chỉ số
                    </Text>
                </SectionCard>
            </Col>
            <Col xs={24} xxl={8}>
                <SectionCard title='Tỷ trọng nhà cung cấp'>
                    <ChartFrame empty={!supplierMix.length} height={240}>
                        <div className='hd-donut-wrap report-chart-fill'>
                            <EChart option={supplierOption} height='100%' onEvents={supplierEvents} />
                            <DonutCenter title='Tổng mua' value={fmtShort(supplierTotal)} />
                        </div>
                    </ChartFrame>
                    <div className='report-mix-legend'>
                        {supplierMix.map((item) => (
                            <button
                                key={item.name}
                                type='button'
                                className='report-mix-legend__row'
                                disabled={!item.row}
                                onClick={
                                    item.row
                                        ? () =>
                                              onOpenDetail({
                                                  type: 'supplier',
                                                  title: item.row!.supplierName,
                                                  record: item.row!,
                                              })
                                        : undefined
                                }
                            >
                                <span className='report-mix-legend__dot' style={{ background: item.color }} />
                                <span className='report-mix-legend__name'>{item.name}</span>
                                <span className='report-mix-legend__value'>
                                    {fmtCurrency(item.value)}
                                    <em>
                                        {supplierTotal ? ` · ${((item.value / supplierTotal) * 100).toFixed(1)}%` : ''}
                                    </em>
                                </span>
                            </button>
                        ))}
                    </div>
                </SectionCard>
            </Col>
            <Col xs={24} xl={14}>
                <SectionCard title='Tổng chi phí vật tư theo cơ sở'>
                    {plantRows.length ? (
                        <>
                            <EChart
                                option={plantOption}
                                height={Math.max(200, plantRows.length * 44 + 50)}
                                onEvents={plantEvents}
                            />
                            <Text type='secondary' className='report-chart-hint'>
                                Mua vật tư được gom theo cơ sở phát sinh nhu cầu; cấp phát được gom theo cơ sở nhận.
                                Nhấn legend để ẩn/hiện từng luồng chi phí.
                            </Text>
                        </>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có dữ liệu trong kỳ đã chọn' />
                    )}
                </SectionCard>
            </Col>
            <Col xs={24} xl={10}>
                <SectionCard title='Top vật tư tiêu hao'>
                    <TopMaterialMiniList data={topMaterials} onOpenDetail={onOpenDetail} />
                </SectionCard>
            </Col>
        </Row>
    );
}

function ConsumptionTab({
    data,
    loading,
    onOpenDetail,
}: {
    data: TopConsumedMaterial[];
    loading: boolean;
    onOpenDetail: (detail: DetailPayload) => void;
}) {
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const chartData = useMemo(() => data.slice(0, isMobile ? 10 : 15), [data, isMobile]);

    const consumptionOption = useMemo<EChartsCoreOption>(() => {
        const horizontal = isMobile;
        // Bar ngang: đảo mảng để hạng 1 nằm trên cùng (trục category vẽ từ dưới lên)
        const source = horizontal ? [...chartData].reverse() : chartData;
        const seriesData = source.map((row, index) => ({
            value: row.totalQuantityOut ?? 0,
            itemStyle: {
                color: barGradient(
                    blueByRank(horizontal ? source.length - 1 - index : index, source.length),
                    !horizontal
                ),
                borderRadius: horizontal ? ([0, 8, 8, 0] as number[]) : ([8, 8, 0, 0] as number[]),
                shadowBlur: 6,
                shadowColor: 'rgba(37, 99, 235, 0.22)',
                shadowOffsetY: 3,
            },
        }));
        const categoryAxis = {
            type: 'category' as const,
            data: source.map((row) => row.materialName),
            axisTick: { show: false },
            axisLine: { lineStyle: { color: '#e2e8f0' } },
            axisLabel: {
                ...ECHARTS_AXIS_LABEL,
                formatter: (value: string) => truncateLabel(value, horizontal ? 16 : 13),
                ...(horizontal ? {} : { rotate: 30, hideOverlap: false, interval: 0 }),
            },
        };
        const valueAxis = {
            type: 'value' as const,
            splitLine: { lineStyle: { color: '#eef2f7', type: 'dashed' as const } },
            axisLabel: { ...ECHARTS_AXIS_LABEL, formatter: (value: number) => fmtShort(value) },
        };

        return {
            animationDuration: 1000,
            animationEasing: 'elasticOut',
            tooltip: {
                trigger: 'item',
                ...ECHARTS_TOOLTIP_STYLE,
                formatter: (params: unknown) => {
                    const info = params as { dataIndex?: number; marker?: string };
                    const row = source[info.dataIndex ?? -1];
                    if (!row) return '';
                    return `${info.marker ?? ''} ${row.materialName}: <b>${fmtNumber(row.totalQuantityOut ?? 0)} ${row.unit ?? ''}</b>`;
                },
            },
            grid: horizontal
                ? { left: 8, right: 52, top: 8, bottom: 4, containLabel: true }
                : { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
            xAxis: horizontal ? valueAxis : categoryAxis,
            yAxis: horizontal ? categoryAxis : valueAxis,
            series: [
                {
                    name: 'SL xuất',
                    type: 'bar',
                    data: seriesData,
                    barMaxWidth: 26,
                    label: horizontal
                        ? {
                              show: true,
                              position: 'right',
                              formatter: (params: { dataIndex: number }) =>
                                  fmtShort(source[params.dataIndex]?.totalQuantityOut ?? 0),
                              color: '#475569',
                              fontSize: 11,
                              fontWeight: 600,
                          }
                        : undefined,
                    emphasis: { itemStyle: { shadowBlur: 14 } },
                    animationDelay: (idx: number) => idx * 60,
                },
            ],
        };
    }, [chartData, isMobile]);

    const consumptionEvents = useMemo(
        () => ({
            click: (params: unknown) => {
                const info = params as { componentType?: string; dataIndex?: number };
                if (info?.componentType !== 'series') return;
                const source = isMobile ? [...chartData].reverse() : chartData;
                const row = source[info.dataIndex ?? -1];
                if (row) onOpenDetail({ type: 'material', title: row.materialName, record: row });
            },
        }),
        [chartData, isMobile, onOpenDetail]
    );

    const columns: ColumnsType<TopConsumedMaterial> = [
        {
            title: 'Mã VT',
            dataIndex: 'materialCode',
            width: 120,
            responsive: ['md'],
            render: (value) => <Text code>{value || '-'}</Text>,
        },
        { title: 'Tên vật tư', dataIndex: 'materialName', ellipsis: true },
        { title: 'Nhóm', dataIndex: 'category', width: 160, responsive: ['lg'], render: (value) => value || '-' },
        { title: 'ĐVT', dataIndex: 'unit', width: 90, responsive: ['md'] },
        {
            title: 'SL xuất',
            dataIndex: 'totalQuantityOut',
            align: 'right',
            sorter: (a, b) => (a.totalQuantityOut ?? 0) - (b.totalQuantityOut ?? 0),
            render: (value) => fmtNumber(value),
        },
        {
            title: 'Tồn hiện tại',
            dataIndex: 'currentStock',
            align: 'right',
            responsive: ['sm'],
            render: (value) => fmtNumber(value),
        },
        {
            title: 'Trạng thái',
            width: 150,
            render: (_, row) =>
                (row.currentStock ?? 0) < (row.minStockLevel ?? 0) ? (
                    <Tag color='error' icon={<WarningOutlined />}>
                        Dưới ngưỡng
                    </Tag>
                ) : (
                    <Tag color='success'>Đủ hàng</Tag>
                ),
        },
    ];

    return (
        <Row gutter={[16, 16]}>
            <Col xs={24}>
                <SectionCard title='Biểu đồ top vật tư xuất kho'>
                    <ChartFrame
                        empty={!chartData.length}
                        height={isMobile ? Math.max(280, chartData.length * 34 + 40) : 340}
                    >
                        <EChart
                            option={consumptionOption}
                            height='100%'
                            onEvents={consumptionEvents}
                            className='report-chart-fill'
                        />
                    </ChartFrame>
                    <Text type='secondary' className='report-chart-hint'>
                        Nhấn vào thanh để xem chi tiết vật tư
                    </Text>
                </SectionCard>
            </Col>
            <Col xs={24}>
                <Table
                    rowKey={(row) => row.materialId || row.materialCode || row.materialName}
                    loading={loading}
                    columns={columns}
                    dataSource={data}
                    size='small'
                    scroll={isMobile ? undefined : { x: 980 }}
                    pagination={{ pageSize: 10, showSizeChanger: true }}
                    onRow={(record) => ({
                        onClick: () => onOpenDetail({ type: 'material', title: record.materialName, record }),
                    })}
                />
            </Col>
        </Row>
    );
}

function SupplierPriceTab({
    suppliers,
    prices,
    loading,
    onOpenDetail,
}: {
    suppliers: SupplierReportRow[];
    prices: PriceComparisonReportRow[];
    loading: boolean;
    onOpenDetail: (detail: DetailPayload) => void;
}) {
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const totalSupplierCost = suppliers.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0);
    const supplierColumns: ColumnsType<SupplierReportRow> = [
        { title: 'Nhà cung cấp', dataIndex: 'supplierName', ellipsis: true },
        {
            title: 'Số đơn',
            dataIndex: 'orderCount',
            width: 110,
            align: 'right',
            responsive: ['sm'],
            sorter: (a, b) => (a.orderCount ?? 0) - (b.orderCount ?? 0),
        },
        {
            title: 'Tổng tiền',
            dataIndex: 'totalAmount',
            width: 160,
            align: 'right',
            sorter: (a, b) => (a.totalAmount ?? 0) - (b.totalAmount ?? 0),
            render: (value) => fmtCurrency(value),
        },
        {
            title: 'Tỷ trọng',
            width: 120,
            align: 'right',
            render: (_, row) =>
                totalSupplierCost ? `${(((row.totalAmount ?? 0) / totalSupplierCost) * 100).toFixed(1)}%` : '-',
        },
    ];

    const priceColumns: ColumnsType<PriceComparisonReportRow> = [
        { title: 'Mã PO', dataIndex: 'orderCode', width: 130, render: (value) => <Text code>{value || '-'}</Text> },
        { title: 'Nhà cung cấp', dataIndex: 'supplierName', ellipsis: true, responsive: ['sm'] },
        {
            title: 'Đề xuất',
            dataIndex: 'requestCodes',
            width: 220,
            responsive: ['lg'],
            render: (codes?: string[]) => (codes ?? []).map((code) => <Tag key={code}>{code}</Tag>),
        },
        {
            title: 'Dự tính',
            dataIndex: 'estimatedTotal',
            width: 150,
            align: 'right',
            responsive: ['md'],
            render: (value) => fmtCurrency(value),
        },
        {
            title: 'Thực tế net',
            dataIndex: 'netActual',
            width: 150,
            align: 'right',
            render: (_value, row) => fmtCurrency(row.netActual ?? row.actualTotal ?? 0),
        },
        {
            title: 'Chênh lệch',
            dataIndex: 'difference',
            width: 160,
            align: 'right',
            sorter: (a, b) => (a.difference ?? 0) - (b.difference ?? 0),
            render: (value = 0) => (
                <Text type={value > 0 ? 'danger' : value < 0 ? 'success' : 'secondary'}>
                    {value ? fmtCurrency(value) : '-'}
                </Text>
            ),
        },
        { title: 'Trạng thái', dataIndex: 'status', width: 130, responsive: ['md'], render: renderStatus },
    ];

    return (
        <Row gutter={[16, 16]}>
            <Col xs={24} xl={9}>
                <SectionCard title='Chi phí mua vật tư theo nhà cung cấp'>
                    <Table
                        rowKey={(row) => row.supplierId || row.supplierName}
                        loading={loading}
                        columns={supplierColumns}
                        dataSource={suppliers}
                        size='small'
                        pagination={{ pageSize: 8 }}
                        onRow={(record) => ({
                            onClick: () => onOpenDetail({ type: 'supplier', title: record.supplierName, record }),
                        })}
                    />
                </SectionCard>
            </Col>
            <Col xs={24} xl={15}>
                <SectionCard title='So sánh dự tính và thực tế'>
                    <Table
                        rowKey={(row) => row.orderId}
                        loading={loading}
                        columns={priceColumns}
                        dataSource={prices}
                        size='small'
                        scroll={isMobile ? undefined : { x: 1050 }}
                        pagination={{ pageSize: 8, showSizeChanger: true }}
                        rowClassName={(row) => ((row.difference ?? 0) > 0 ? 'report-row-danger' : '')}
                        onRow={(record) => ({
                            onClick: () =>
                                onOpenDetail({ type: 'purchase', title: record.orderCode || 'Đơn mua vật tư', record }),
                        })}
                    />
                </SectionCard>
            </Col>
        </Row>
    );
}

function DistributionTab({
    data,
    loading,
    onOpenDetail,
}: {
    data?: { byPlant: DistributionCostByPlant[]; byPeriod: DistributionCostByPeriod[] };
    loading: boolean;
    onOpenDetail: (detail: DetailPayload) => void;
}) {
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const rows = data?.byPlant ?? [];
    const total = rows.reduce((sum, row) => sum + row.totalWithVat, 0);

    const distributionOption = useMemo<EChartsCoreOption>(() => {
        const periods = data?.byPeriod ?? [];
        const many = periods.length > 18;
        return {
            animationDuration: 1000,
            animationEasing: 'elasticOut',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(37, 99, 235, 0.06)' } },
                ...ECHARTS_TOOLTIP_STYLE,
                formatter: makeAxisTooltipFormatter(),
            },
            grid: { left: 8, right: 14, top: 16, bottom: many ? 30 : 8, containLabel: true },
            xAxis: {
                type: 'category',
                data: periods.map((row) => row.period),
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
                    name: 'Giá trị cấp phát vật tư',
                    type: 'bar',
                    data: periods.map((row) => row.totalWithVat),
                    barMaxWidth: 34,
                    itemStyle: {
                        color: barGradient(CHART_SEMANTIC.material),
                        borderRadius: [8, 8, 0, 0],
                        shadowBlur: 8,
                        shadowColor: 'rgba(37, 99, 235, 0.28)',
                        shadowOffsetY: 4,
                    },
                    emphasis: { itemStyle: { shadowBlur: 16 } },
                    animationDelay: (idx: number) => idx * 70,
                },
            ],
        };
    }, [data]);

    const columns: ColumnsType<DistributionCostByPlant> = [
        { title: 'Cơ sở nhận', dataIndex: 'plantName', ellipsis: true, width: 180 },
        { title: 'Số phiếu', dataIndex: 'count', width: 100, align: 'right', responsive: ['md'] },
        {
            title: 'Tiền hàng',
            dataIndex: 'totalAmount',
            width: 145,
            align: 'right',
            responsive: ['lg'],
            render: (value) => fmtCurrency(value),
        },
        {
            title: 'Tổng có VAT',
            dataIndex: 'totalWithVat',
            width: 160,
            align: 'right',
            sorter: (a, b) => a.totalWithVat - b.totalWithVat,
            render: (value) => fmtCurrency(value),
        },
        {
            title: 'Tỷ trọng',
            width: 105,
            align: 'right',
            responsive: ['sm'],
            render: (_, row) => (total ? `${((row.totalWithVat / total) * 100).toFixed(1)}%` : '-'),
        },
    ];

    return (
        <Row gutter={[16, 16]}>
            <Col xs={24} xl={14}>
                <SectionCard title='Giá trị cấp phát vật tư theo thời gian'>
                    <ChartFrame empty={!data?.byPeriod?.length}>
                        <EChart option={distributionOption} height='100%' className='report-chart-fill' />
                    </ChartFrame>
                </SectionCard>
            </Col>
            <Col xs={24} xl={10}>
                <SectionCard title='Giá trị cấp phát theo cơ sở nhận'>
                    <Table
                        className='report-distribution-plant-table'
                        rowKey={(row) => row.plantId}
                        loading={loading}
                        columns={columns}
                        dataSource={rows}
                        size='small'
                        scroll={isMobile ? undefined : { x: 360 }}
                        pagination={{ pageSize: 8 }}
                        onRow={(record) => ({
                            onClick: () => onOpenDetail({ type: 'distribution', title: record.plantName, record }),
                        })}
                    />
                </SectionCard>
            </Col>
        </Row>
    );
}

function DetailTab({
    purchaseRows,
    distributionRows,
    search,
    setSearch,
    loading,
    onOpenDetail,
}: {
    purchaseRows: PriceComparisonReportRow[];
    distributionRows: Distribution[];
    search: string;
    setSearch: (value: string) => void;
    loading: boolean;
    onOpenDetail: (detail: DetailPayload) => void;
}) {
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const purchaseColumns: ColumnsType<PriceComparisonReportRow> = [
        { title: 'Mã PO', dataIndex: 'orderCode', width: 140, render: (value) => <Text code>{value || '-'}</Text> },
        {
            title: 'Nhà cung cấp',
            dataIndex: 'supplierName',
            ellipsis: true,
            responsive: ['sm'],
            render: (value) => value || '-',
        },
        {
            title: 'Phiếu đề xuất',
            dataIndex: 'requestCodes',
            width: 210,
            responsive: ['lg'],
            render: (codes?: string[]) => (codes ?? []).map((code) => <Tag key={code}>{code}</Tag>),
        },
        {
            title: 'Dự tính',
            dataIndex: 'estimatedTotal',
            width: 140,
            align: 'right',
            responsive: ['md'],
            render: (value) => fmtCurrency(value ?? 0),
        },
        {
            title: 'Thực tế net',
            dataIndex: 'netActual',
            width: 150,
            align: 'right',
            render: (_value, row) => fmtCurrency(row.netActual ?? row.actualTotal ?? 0),
        },
        { title: 'Trạng thái', dataIndex: 'status', width: 140, responsive: ['sm'], render: renderStatus },
        {
            title: 'Ngày nhận',
            dataIndex: 'receivedAt',
            width: 140,
            responsive: ['md'],
            render: (value) => (value ? dayjs(value).format('DD/MM/YYYY') : '-'),
        },
    ];

    const distributionColumns: ColumnsType<Distribution> = [
        {
            title: 'Mã phiếu',
            dataIndex: 'distributionCode',
            width: 150,
            render: (value) => <Text code>{value || '-'}</Text>,
        },
        {
            title: 'Cơ sở nhận',
            dataIndex: ['toPlant', 'name'],
            ellipsis: true,
            render: (_value, row) => row.toPlant?.name || '-',
        },
        {
            title: 'Số dòng',
            dataIndex: 'items',
            width: 100,
            align: 'right',
            responsive: ['md'],
            render: (items) => items?.length ?? 0,
        },
        {
            title: 'Tổng tiền',
            dataIndex: 'items',
            width: 160,
            align: 'right',
            render: (items) =>
                fmtCurrency((items ?? []).reduce((sum: number, item: any) => sum + (item.totalWithVat ?? 0), 0)),
        },
        { title: 'Trạng thái', dataIndex: 'status', width: 140, responsive: ['sm'], render: renderStatus },
        {
            title: 'Ngày xuất',
            dataIndex: 'distributedAt',
            width: 140,
            responsive: ['md'],
            render: (value) => (value ? dayjs(value).format('DD/MM/YYYY') : '-'),
        },
    ];

    return (
        <div className='report-stack'>
            <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder='Tìm mã phiếu, nhà cung cấp, vật tư...'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className='report-detail-search'
            />
            <Row gutter={[16, 16]}>
                <Col xs={24} xl={12}>
                    <SectionCard title='Đơn mua vật tư'>
                        <Table
                            rowKey={(row) => row.orderId}
                            loading={loading}
                            columns={purchaseColumns}
                            dataSource={purchaseRows}
                            size='small'
                            scroll={isMobile ? undefined : { x: 850 }}
                            pagination={{ pageSize: 8 }}
                            onRow={(record) => ({
                                onClick: () =>
                                    onOpenDetail({
                                        type: 'purchase',
                                        title: record.orderCode || 'Đơn mua vật tư',
                                        record,
                                    }),
                            })}
                        />
                    </SectionCard>
                </Col>
                <Col xs={24} xl={12}>
                    <SectionCard title='Phiếu cấp phát vật tư'>
                        <Table
                            rowKey={(row) => row.id}
                            loading={loading}
                            columns={distributionColumns}
                            dataSource={distributionRows}
                            size='small'
                            scroll={isMobile ? undefined : { x: 850 }}
                            pagination={{ pageSize: 8 }}
                            onRow={(record) => ({
                                onClick: () =>
                                    onOpenDetail({
                                        type: 'distribution',
                                        title: record.distributionCode || 'Phiếu cấp phát vật tư',
                                        record,
                                    }),
                            })}
                        />
                    </SectionCard>
                </Col>
            </Row>
        </div>
    );
}

function SectionCard({
    title,
    extra,
    children,
}: {
    title: string;
    extra?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <Card
            className='report-section-card'
            title={<span className='report-section-title'>{title}</span>}
            extra={extra}
            variant='outlined'
        >
            {children}
        </Card>
    );
}

function ChartFrame({ empty, height = 340, children }: { empty: boolean; height?: number; children: React.ReactNode }) {
    if (empty) {
        return (
            <div className='report-chart-frame report-empty-chart' style={{ height }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có dữ liệu trong kỳ đã chọn' />
            </div>
        );
    }
    return (
        <div className='report-chart-frame' style={{ height }}>
            {children}
        </div>
    );
}

function ReportSkeleton() {
    return (
        <Row gutter={[16, 16]}>
            {[1, 2, 3, 4].map((item) => (
                <Col key={item} xs={24} xl={12}>
                    <Card variant='outlined'>
                        <Skeleton active paragraph={{ rows: 8 }} />
                    </Card>
                </Col>
            ))}
        </Row>
    );
}

function TopMaterialMiniList({
    data,
    onOpenDetail,
}: {
    data: TopConsumedMaterial[];
    onOpenDetail: (detail: DetailPayload) => void;
}) {
    if (!data.length) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có dữ liệu tiêu hao' />;
    }

    const max = Math.max(...data.map((row) => row.totalQuantityOut ?? 0), 1);
    return (
        <div className='report-mini-stack'>
            {data.slice(0, 8).map((row, index) => {
                const percent = ((row.totalQuantityOut ?? 0) / max) * 100;
                return (
                    <button
                        key={row.materialId || row.materialName}
                        type='button'
                        className='report-rank-row'
                        onClick={() => onOpenDetail({ type: 'material', title: row.materialName, record: row })}
                    >
                        <span className='report-rank-index'>{index + 1}</span>
                        <span className='report-rank-main'>
                            <span className='report-rank-name'>{row.materialName}</span>
                            <span className='report-rank-bar'>
                                <span style={{ width: `${percent}%` }} />
                            </span>
                        </span>
                        <span className='report-rank-value'>
                            {fmtNumber(row.totalQuantityOut)} {row.unit}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

function ReportDetailDrawer({ detail, onClose }: { detail: DetailPayload | null; onClose: () => void }) {
    const record: any = detail?.record;
    return (
        <Drawer open={Boolean(detail)} onClose={onClose} title={detail?.title} size='min(100vw, 560px)' destroyOnHidden>
            {!detail ? null : (
                <div className='report-stack'>
                    <Descriptions column={1} bordered size='small'>
                        {Object.entries(record ?? {})
                            .filter(([, value]) => ['string', 'number'].includes(typeof value))
                            .slice(0, 12)
                            .map(([key, value]) => (
                                <Descriptions.Item key={key} label={key}>
                                    {String(value)}
                                </Descriptions.Item>
                            ))}
                    </Descriptions>
                    {Array.isArray(record?.items) ? (
                        <Table
                            rowKey={(_, index) => String(index)}
                            dataSource={record.items}
                            size='small'
                            pagination={false}
                            scroll={{ x: 640 }}
                            columns={[
                                { title: 'Vật tư', dataIndex: 'materialName', ellipsis: true },
                                { title: 'ĐVT', dataIndex: 'unit', width: 80 },
                                {
                                    title: 'SL',
                                    dataIndex: 'quantityOrdered',
                                    width: 90,
                                    align: 'right',
                                    render: (_value, row: any) =>
                                        fmtNumber(row.quantityOrdered ?? row.quantityRequested ?? row.quantity ?? 0),
                                },
                                {
                                    title: 'Tổng',
                                    dataIndex: 'totalWithVat',
                                    width: 130,
                                    align: 'right',
                                    render: (value, row: any) => fmtCurrency(value ?? row.totalPrice ?? 0),
                                },
                            ]}
                        />
                    ) : null}
                </div>
            )}
        </Drawer>
    );
}

function MaterialDrilldownDrawer({
    drilldown,
    onClose,
}: {
    drilldown: MaterialDrilldownPayload | null;
    onClose: () => void;
}) {
    const purchaseColumns: ColumnsType<PriceComparisonReportRow> = [
        { title: 'Mã PO', dataIndex: 'orderCode', width: 140, render: (value) => <Text code>{value || '-'}</Text> },
        { title: 'Nhà cung cấp', dataIndex: 'supplierName', ellipsis: true },
        { title: 'Dự tính', dataIndex: 'estimatedTotal', width: 130, align: 'right', render: fmtCurrency },
        {
            title: 'Thực tế net',
            dataIndex: 'netActual',
            width: 140,
            align: 'right',
            render: (_value, row) => fmtCurrency(row.netActual ?? row.actualTotal ?? 0),
        },
        { title: 'Lệch giá', dataIndex: 'difference', width: 130, align: 'right', render: fmtCurrency },
    ];
    const distributionColumns: ColumnsType<Distribution> = [
        {
            title: 'Mã phiếu',
            dataIndex: 'distributionCode',
            width: 150,
            render: (value) => <Text code>{value || '-'}</Text>,
        },
        {
            title: 'Cơ sở nhận',
            dataIndex: ['toPlant', 'name'],
            ellipsis: true,
            render: (_value, row) => row.toPlant?.name || '-',
        },
        { title: 'Số dòng', dataIndex: 'items', width: 100, align: 'right', render: (items) => items?.length ?? 0 },
        {
            title: 'Tổng có VAT',
            dataIndex: 'items',
            width: 150,
            align: 'right',
            render: (items) =>
                fmtCurrency((items ?? []).reduce((sum: number, item: any) => sum + Number(item.totalWithVat ?? 0), 0)),
        },
        { title: 'Trạng thái', dataIndex: 'status', width: 130, render: renderStatus },
    ];
    const materialColumns: ColumnsType<TopConsumedMaterial> = [
        { title: 'Mã VT', dataIndex: 'materialCode', width: 120, render: (value) => <Text code>{value || '-'}</Text> },
        { title: 'Tên vật tư', dataIndex: 'materialName', ellipsis: true },
        { title: 'Nhóm', dataIndex: 'category', width: 150, render: (value) => value || '-' },
        { title: 'SL xuất', dataIndex: 'totalQuantityOut', width: 120, align: 'right', render: fmtNumber },
        { title: 'Tồn', dataIndex: 'currentStock', width: 100, align: 'right', render: fmtNumber },
    ];
    const supplierColumns: ColumnsType<SupplierReportRow> = [
        { title: 'Nhà cung cấp', dataIndex: 'supplierName', ellipsis: true },
        { title: 'Số đơn', dataIndex: 'orderCount', width: 100, align: 'right' },
        { title: 'Tổng tiền', dataIndex: 'totalAmount', width: 150, align: 'right', render: fmtCurrency },
    ];

    const renderContent = () => {
        if (!drilldown) return null;
        if (drilldown.kind === 'message') {
            return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={drilldown.description} />;
        }
        const commonProps = {
            loading: drilldown.loading,
            size: 'small' as const,
            pagination: { pageSize: 8, showSizeChanger: true },
        };
        if (drilldown.kind === 'purchase') {
            return (
                <Table
                    {...commonProps}
                    rowKey={(row) => row.orderId}
                    columns={purchaseColumns}
                    dataSource={drilldown.rows}
                    scroll={{ x: 760 }}
                />
            );
        }
        if (drilldown.kind === 'distribution') {
            return (
                <Table
                    {...commonProps}
                    rowKey={(row) => row.id}
                    columns={distributionColumns}
                    dataSource={drilldown.rows}
                    scroll={{ x: 760 }}
                />
            );
        }
        if (drilldown.kind === 'materials') {
            return (
                <Table
                    {...commonProps}
                    rowKey={(row) => row.materialId || row.materialCode || row.materialName}
                    columns={materialColumns}
                    dataSource={drilldown.rows}
                    scroll={{ x: 720 }}
                />
            );
        }
        return (
            <Table
                {...commonProps}
                rowKey={(row) => row.supplierId || row.supplierName}
                columns={supplierColumns}
                dataSource={drilldown.rows}
                scroll={{ x: 520 }}
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
            <div className='report-stack'>
                {drilldown?.description ? <Text type='secondary'>{drilldown.description}</Text> : null}
                {renderContent()}
            </div>
        </Drawer>
    );
}

const REPORT_PAGE_STYLE = `
.report-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.report-page .page-header-card {
    border: 1px solid #dbeafe;
    background:
        linear-gradient(135deg, rgba(22, 119, 255, 0.1), rgba(82, 196, 26, 0.06)),
        #ffffff;
    box-shadow: 0 16px 36px rgba(15, 23, 42, 0.06);
}
.report-filter-card,
.report-kpi-card,
.report-main-card,
.report-section-card,
.report-insight-card {
    border-radius: 8px;
}
.report-active-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.report-active-filters--compact {
    margin-top: 14px;
}
.report-filter-chip {
    margin-inline-end: 0;
    border-radius: 999px;
    font-weight: 600;
}
.report-filter-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;
}
.report-quick-range-scroll {
    max-width: 100%;
    overflow-x: auto;
    padding-bottom: 2px;
}
.report-quick-range-scroll .ant-segmented {
    min-width: max-content;
}
.report-filter-actions,
.report-header-actions {
    flex-shrink: 0;
}
.report-filter-grid {
    align-items: end;
}
.report-filter-label {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
}
.report-filter-control {
    width: 100%;
}
.report-kpi-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
}
.report-kpi-button {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
}
.report-kpi-button:disabled {
    cursor: default;
}
.report-kpi-card {
    height: 100%;
    transition:
        transform 160ms ease,
        box-shadow 160ms ease,
        border-color 160ms ease;
}
.report-kpi-button:not(:disabled):hover .report-kpi-card {
    transform: translateY(-2px);
    border-color: #91caff;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
}
.report-kpi-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
}
.report-kpi-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 8px;
    font-size: 18px;
}
.report-kpi-action {
    display: block;
    margin-top: 6px;
    font-size: 11px;
    color: #64748b;
}
.report-kpi-card .ant-card-body {
    min-width: 0;
}
.report-kpi-card .ant-statistic {
    min-width: 0;
}
.report-kpi-card .ant-statistic-content {
    font-size: clamp(18px, 0.7rem + 0.7vw, 24px);
    line-height: 1.25;
    word-break: break-word;
    overflow-wrap: anywhere;
}
.report-kpi-card .ant-statistic-content-suffix {
    font-size: 13px;
    word-break: keep-all;
}
.report-section-title {
    font-weight: 700;
}
.report-section-card {
    transition:
        transform 160ms ease,
        box-shadow 160ms ease;
}
.report-section-card:hover {
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}
.report-empty-chart {
    display: flex;
    align-items: center;
    justify-content: center;
}
.report-chart-frame {
    min-width: 0;
}
.report-chart-fill {
    width: 100%;
    height: 100%;
    min-width: 0;
}
.report-kpi-grid {
    height: 100%;
}
.report-kpi-grid > .ant-col {
    display: flex;
}
.report-kpi-grid .report-kpi-button {
    width: 100%;
}
.report-filter-drawer {
    display: grid;
    gap: 16px;
}
.report-chart-hint {
    display: block;
    margin-top: 6px;
    font-size: 11px;
    text-align: center;
}
.report-mix-legend {
    display: grid;
    gap: 4px;
    margin-top: 10px;
}
.report-mix-legend__row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    transition: background 140ms ease;
}
.report-mix-legend__row:disabled {
    cursor: default;
}
.report-mix-legend__row:not(:disabled):hover {
    background: #f1f5f9;
}
.report-mix-legend__dot {
    width: 9px;
    height: 9px;
    flex: 0 0 9px;
    border-radius: 999px;
}
.report-mix-legend__name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: #475569;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.report-mix-legend__value {
    flex-shrink: 0;
    color: #0f172a;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}
.report-mix-legend__value em {
    color: #94a3b8;
    font-style: normal;
    font-weight: 500;
}
.report-insight-card .ant-card-body {
    padding: 16px;
}
.report-insight-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
}
.report-insight-head > div {
    display: grid;
    gap: 2px;
}
.report-insight-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
    gap: 10px;
}
.report-insight-item {
    display: grid;
    gap: 6px;
    min-height: 82px;
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
.report-insight-item:hover {
    transform: translateY(-1px);
    border-color: #91caff;
    background: #ffffff;
}
.report-insight-item span {
    font-size: 12px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
}
.report-insight-item strong {
    min-width: 0;
    color: #0f172a;
    line-height: 1.35;
    overflow-wrap: anywhere;
}
.report-insight-item--warning {
    background: #fff7e6;
    border-color: #ffd591;
}
.report-insight-item--success {
    background: #f6ffed;
    border-color: #b7eb8f;
}
.report-insight-item--info {
    background: #e6f4ff;
    border-color: #91caff;
}
.report-tabs .ant-tabs-nav {
    margin-bottom: 16px;
}
.report-tabs .ant-tabs-nav-wrap {
    overflow-x: auto;
}
.report-tabs .ant-tabs-tab {
    white-space: nowrap;
}
.report-distribution-plant-table {
    min-width: 0;
}
.report-row-danger td {
    background: #fff1f0;
}
.report-full-width {
    width: 100%;
}
.report-stack,
.report-mini-stack {
    display: flex;
    flex-direction: column;
    width: 100%;
}
.report-stack {
    gap: 16px;
}
.report-mini-stack {
    gap: 10px;
}
.report-detail-search {
    max-width: 420px;
}
.report-export-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
}
.report-rank-row {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #eef2f7;
    border-radius: 8px;
    background: #fff;
    cursor: pointer;
    text-align: left;
}
.report-rank-row:hover {
    border-color: #91caff;
    background: #f8fbff;
}
.report-rank-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: #eff6ff;
    color: #1677ff;
    font-weight: 700;
}
.report-rank-main {
    min-width: 0;
}
.report-rank-name {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #0f172a;
    font-weight: 600;
}
.report-rank-bar {
    display: block;
    height: 5px;
    margin-top: 6px;
    border-radius: 999px;
    background: #eef2f7;
    overflow: hidden;
}
.report-rank-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #1677ff;
}
.report-rank-value {
    color: #475569;
    font-weight: 700;
    white-space: nowrap;
}
@media (max-width: 767px) {
    .report-page {
        gap: 12px;
    }
    .report-header-actions {
        width: 100%;
        justify-content: stretch;
    }
    .report-header-actions .ant-space-item,
    .report-header-actions .ant-btn {
        flex: 1 1 0;
    }
    .report-filter-card .ant-card-body,
    .report-main-card .ant-card-body,
    .report-section-card .ant-card-body {
        padding: 12px;
    }
    .report-kpi-card .ant-card-body {
        padding: 12px;
        min-height: 132px;
    }
    .report-filter-toolbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 10px;
        margin-bottom: 12px;
    }
    .report-filter-actions {
        display: grid;
        grid-template-columns: 1fr auto;
        width: 100%;
    }
    .report-active-filters {
        gap: 5px;
    }
    .report-filter-chip {
        max-width: 100%;
        white-space: normal;
        line-height: 1.35;
    }
    .report-filter-actions .ant-badge,
    .report-filter-actions .ant-btn {
        width: 100%;
    }
    .report-filter-label {
        margin-bottom: 5px;
    }
    .report-kpi-head {
        gap: 8px;
        margin-bottom: 6px;
    }
    .report-kpi-title {
        font-size: 11px;
        line-height: 1.25;
    }
    .report-kpi-icon {
        width: 32px;
        height: 32px;
        font-size: 16px;
    }
    .report-kpi-card .ant-statistic-content {
        font-size: 18px !important;
        line-height: 1.25;
        word-break: break-word;
    }
    .report-kpi-card .ant-statistic-content-suffix {
        display: block;
        margin-inline-start: 0;
        margin-top: 2px;
        font-size: 11px;
    }
    .report-insight-grid {
        grid-template-columns: minmax(0, 1fr);
    }
    .report-insight-item {
        min-height: auto;
    }
    .report-main-card .ant-tabs-tab {
        padding: 8px 4px;
        font-size: 12px;
    }
    .report-section-card .ant-card-head {
        min-height: 42px;
        padding: 0 12px;
    }
    .report-section-card .ant-card-extra {
        margin-inline-start: 8px;
    }
    .report-section-title {
        font-size: 13px;
    }
    .report-chart-frame {
        height: 260px !important;
        overflow: hidden;
    }
    .report-detail-search {
        max-width: none;
    }
    .report-rank-row {
        grid-template-columns: 28px minmax(0, 1fr);
        gap: 10px;
        padding: 10px;
    }
    .report-rank-value {
        grid-column: 2;
        font-size: 12px;
        white-space: normal;
    }
    .report-rank-name {
        font-size: 13px;
    }
    .report-stack {
        gap: 12px;
    }
    .report-main-card .ant-table-wrapper,
    .report-section-card .ant-table-wrapper {
        margin-inline: -12px;
    }
    .report-main-card .ant-table,
    .report-section-card .ant-table {
        font-size: 12px;
    }
    .report-section-card .report-distribution-plant-table {
        margin-inline: 0;
    }
    .report-distribution-plant-table .ant-table-cell {
        padding: 8px 10px !important;
    }
}
`;
