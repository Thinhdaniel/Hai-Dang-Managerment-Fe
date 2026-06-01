import React, { useMemo, useState } from 'react';
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
    DollarOutlined,
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
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ComposedChart,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip as ChartTooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../components/shared/PageHeader';
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
    | { type: 'distribution'; title: string; record: Distribution | DistributionCostByPlant }
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

const CHART_COLORS = ['#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    draft: { label: 'Nháp', color: 'default' },
    pending: { label: 'Chờ xử lý', color: 'warning' },
    confirmed: { label: 'Đã xác nhận', color: 'blue' },
    ordered: { label: 'Đã đặt', color: 'processing' },
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

const fmtShort = (value: number) => {
    if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
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
    const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
    const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
    const [exportOpen, setExportOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [detail, setDetail] = useState<DetailPayload | null>(null);
    const [drilldown, setDrilldown] = useState<MaterialDrilldownPayload | null>(null);
    const [detailSearch, setDetailSearch] = useState('');

    const params = useMemo(() => toReportParams(appliedFilters), [appliedFilters]);
    const draftParams = useMemo(() => toReportParams(filters), [filters]);
    const hasPendingFilterChanges = JSON.stringify(draftParams) !== JSON.stringify(params);

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
    const distributionDetails = normalizeList<Distribution>(distributionDetailQuery.data);

    const isLoading =
        summaryQuery.isLoading ||
        costQuery.isLoading ||
        topQuery.isLoading ||
        supplierQuery.isLoading ||
        priceQuery.isLoading ||
        distributionQuery.isLoading;

    const hasError =
        summaryQuery.isError ||
        costQuery.isError ||
        topQuery.isError ||
        supplierQuery.isError ||
        priceQuery.isError ||
        distributionQuery.isError;

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

    const handleApplyFilters = () => {
        setAppliedFilters(filters);
    };

    const handleResetFilters = () => {
        setQuickRange('this_month');
        setFilters(DEFAULT_FILTERS);
        setAppliedFilters(DEFAULT_FILTERS);
    };

    const handleRefresh = () => {
        summaryQuery.refetch();
        costQuery.refetch();
        topQuery.refetch();
        supplierQuery.refetch();
        priceQuery.refetch();
        distributionQuery.refetch();
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

    const activeFilterCount = [
        appliedFilters.plantId,
        appliedFilters.materialId,
        appliedFilters.category,
        appliedFilters.supplierId,
        appliedFilters.status,
    ].filter(Boolean).length;

    const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
        const chips: ActiveFilterChip[] = [
            {
                key: 'period',
                label: `Kỳ: ${appliedFilters.dateRange[0].format('DD/MM/YYYY')} - ${appliedFilters.dateRange[1].format('DD/MM/YYYY')}`,
                color: 'blue',
            },
            { key: 'groupBy', label: `Nhóm kỳ: ${GROUP_BY_LABEL[appliedFilters.groupBy]}`, color: 'geekblue' },
        ];
        if (appliedFilters.plantId) {
            chips.push({
                key: 'plant',
                label: `Cơ sở: ${plants.find((plant) => plant.id === appliedFilters.plantId)?.name ?? 'Đã chọn'}`,
                color: 'cyan',
            });
        }
        if (appliedFilters.category) {
            chips.push({ key: 'category', label: `Nhóm VT: ${appliedFilters.category}`, color: 'purple' });
        }
        if (appliedFilters.materialId) {
            chips.push({
                key: 'material',
                label: `Vật tư: ${materials.find((material) => material.id === appliedFilters.materialId)?.name ?? 'Đã chọn'}`,
                color: 'green',
            });
        }
        if (appliedFilters.supplierId) {
            chips.push({
                key: 'supplier',
                label: `NCC: ${suppliers.find((supplier) => supplier.id === appliedFilters.supplierId)?.name ?? 'Đã chọn'}`,
                color: 'gold',
            });
        }
        if (appliedFilters.status) {
            chips.push({
                key: 'status',
                label: `Trạng thái: ${STATUS_LABEL[appliedFilters.status]?.label ?? appliedFilters.status}`,
                color: 'orange',
            });
        }
        return chips;
    }, [appliedFilters, materials, plants, suppliers]);

    const kpis: MaterialKpiConfig[] = [
        {
            title: 'Chi phí mua vật tư',
            value: summary?.totalPurchaseCost ?? summary?.totalMonthlyCost ?? 0,
            formatter: fmtCurrency,
            icon: <DollarOutlined />,
            color: '#1677ff',
            hint: 'Tổng giá trị các dòng vật tư đã mua trong kỳ, lọc theo cơ sở của từng dòng vật tư.',
            onClick: () =>
                setDrilldown({
                    kind: 'purchase',
                    title: 'Chi tiết chi phí mua vật tư',
                    description: 'Các đơn mua vật tư tạo nên KPI trong kỳ và bộ lọc hiện tại.',
                    rows: filteredPurchaseDetails,
                    loading: priceQuery.isLoading,
                }),
        },
        {
            title: 'Giá trị cấp phát vật tư',
            value: summary?.totalDistributionCost ?? 0,
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
            title: 'Phiếu mua chờ duyệt',
            value: summary?.pendingRequestCount ?? 0,
            suffix: 'phiếu',
            icon: <CalendarOutlined />,
            color: '#faad14',
            hint: 'Phiếu đề xuất mua vật tư còn ở trạng thái chờ duyệt.',
            onClick: () =>
                setDrilldown({
                    kind: 'message',
                    title: 'Phiếu mua chờ duyệt',
                    description:
                        'KPI này đang lấy từ tổng hợp backend. Phase sau nên bổ sung API danh sách phiếu chờ duyệt để drill-down đầy đủ.',
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
                subtitle={`Kỳ ${appliedFilters.dateRange[0].format('DD/MM/YYYY')} - ${appliedFilters.dateRange[1].format('DD/MM/YYYY')} · ${activeFilterCount} bộ lọc đang áp dụng`}
                extra={<ActiveFilterChips chips={activeFilterChips} />}
                actions={
                    <Space wrap className='report-header-actions'>
                        <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={isLoading}>
                            Làm mới
                        </Button>
                        <Button type='primary' icon={<DownloadOutlined />} onClick={() => setExportOpen(true)}>
                            Xuất Excel
                        </Button>
                    </Space>
                }
            />

            <Card className='report-filter-card' variant='outlined'>
                <div className='report-filter-toolbar'>
                    <div className='report-quick-range-scroll'>
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
                    <Space wrap className='report-filter-actions'>
                        <Badge count={activeFilterCount} size='small'>
                            <Button
                                type={hasPendingFilterChanges ? 'primary' : 'default'}
                                icon={<FilterOutlined />}
                                onClick={handleApplyFilters}
                            >
                                {hasPendingFilterChanges ? 'Áp dụng thay đổi' : 'Áp dụng'}
                            </Button>
                        </Badge>
                        <Button onClick={handleResetFilters}>Reset</Button>
                    </Space>
                </div>

                <Row gutter={[12, 12]} className='report-filter-grid'>
                    <Col xs={24} sm={12} xl={8} xxl={6}>
                        <Text className='report-filter-label'>Khoảng thời gian</Text>
                        <RangePicker
                            value={filters.dateRange}
                            allowClear={false}
                            format='DD/MM/YYYY'
                            className='report-filter-control'
                            onChange={(dates) => {
                                if (!dates) return;
                                setQuickRange('custom');
                                setFilters((current) => ({ ...current, dateRange: dates as [Dayjs, Dayjs] }));
                            }}
                        />
                    </Col>
                    {isManager ? (
                        <Col xs={24} sm={12} xl={8} xxl={6}>
                            <Text className='report-filter-label'>Cơ sở</Text>
                            <Select
                                allowClear
                                showSearch={{ optionFilterProp: 'label' }}
                                placeholder='Tất cả cơ sở'
                                className='report-filter-control'
                                value={filters.plantId}
                                onChange={(plantId) => setFilters((current) => ({ ...current, plantId }))}
                                options={plants.map((plant) => ({ label: plant.name, value: plant.id }))}
                            />
                        </Col>
                    ) : null}
                    <Col xs={24} sm={12} xl={8} xxl={6}>
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
                    </Col>
                    <Col xs={24} sm={12} xl={8} xxl={6}>
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
                    </Col>
                    <Col xs={24} sm={12} xl={8} xxl={6}>
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
                    </Col>
                    <Col xs={24} sm={12} xl={8} xxl={6}>
                        <Text className='report-filter-label'>Trạng thái mua hàng</Text>
                        <Select
                            allowClear
                            placeholder='Tất cả trạng thái'
                            className='report-filter-control'
                            value={filters.status}
                            onChange={(status) => setFilters((current) => ({ ...current, status }))}
                            options={Object.entries(STATUS_LABEL)
                                .filter(([status]) =>
                                    ['draft', 'confirmed', 'ordered', 'received', 'cancelled'].includes(status)
                                )
                                .map(([value, info]) => ({ label: info.label, value }))}
                        />
                    </Col>
                    <Col xs={24} sm={12} xl={8} xxl={6}>
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
                    </Col>
                </Row>
                <ActiveFilterChips chips={activeFilterChips} compact />
            </Card>

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
                {kpis.map((kpi) => (
                    <Col key={kpi.title} xs={24} sm={12} lg={8} xxl={4}>
                        <ReportKpiCard kpi={kpi} loading={summaryQuery.isLoading} />
                    </Col>
                ))}
            </Row>

            <MaterialInsightPanel
                summary={summary}
                highVarianceCount={highVarianceCount}
                topSupplier={topSupplier}
                topPlant={topPlant}
                topMaterial={topMaterials[0]}
                purchaseRows={priceRows}
                suppliers={supplierRows}
                materials={topMaterials}
                onOpenDrilldown={setDrilldown}
            />

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

function ActiveFilterChips({ chips, compact = false }: { chips: ActiveFilterChip[]; compact?: boolean }) {
    if (!chips.length) return null;

    return (
        <div className={compact ? 'report-active-filters report-active-filters--compact' : 'report-active-filters'}>
            {chips.map((chip) => (
                <Tag key={chip.key} color={chip.color ?? 'default'} className='report-filter-chip'>
                    {chip.label}
                </Tag>
            ))}
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
                {kpi.onClick ? <Text className='report-kpi-action'>Nhấn để xem chi tiết</Text> : null}
            </Card>
        </button>
    );
}

function MaterialInsightPanel({
    summary,
    highVarianceCount,
    topSupplier,
    topPlant,
    topMaterial,
    purchaseRows,
    suppliers,
    materials,
    onOpenDrilldown,
}: {
    summary?: MaterialReportSummary;
    highVarianceCount: number;
    topSupplier?: SupplierReportRow;
    topPlant?: DistributionCostByPlant;
    topMaterial?: TopConsumedMaterial;
    purchaseRows: PriceComparisonReportRow[];
    suppliers: SupplierReportRow[];
    materials: TopConsumedMaterial[];
    onOpenDrilldown: (payload: MaterialDrilldownPayload) => void;
}) {
    const lowStockCount = summary?.lowStockCount ?? 0;
    const lowStockRows = materials.filter(
        (row) => (row.currentStock ?? Number.POSITIVE_INFINITY) < (row.minStockLevel ?? 0)
    );

    const insights = [
        {
            title: 'Tồn kho',
            value: lowStockCount ? `${lowStockCount} vật tư dưới ngưỡng` : 'Không có cảnh báo dưới ngưỡng',
            tone: lowStockCount ? 'warning' : 'success',
            onClick: () =>
                onOpenDrilldown({
                    kind: 'materials',
                    title: 'Vật tư dưới ngưỡng',
                    description: 'Danh sách vật tư dưới ngưỡng từ dữ liệu đang có trong báo cáo.',
                    rows: lowStockRows,
                }),
        },
        {
            title: 'Lệch giá',
            value: highVarianceCount ? `${highVarianceCount} đơn có chênh lệch` : 'Chưa ghi nhận lệch giá đáng chú ý',
            tone: highVarianceCount ? 'info' : 'success',
            onClick: () =>
                onOpenDrilldown({
                    kind: 'purchase',
                    title: 'Các đơn có lệch giá',
                    description: 'Chênh lệch giữa giá dự kiến/tham chiếu và giá thực tế.',
                    rows: purchaseRows.filter((row) => Math.abs(row.difference ?? 0) > 0),
                }),
        },
        {
            title: 'Nhà cung cấp nổi bật',
            value: topSupplier
                ? `${topSupplier.supplierName}: ${fmtCurrency(topSupplier.totalAmount ?? 0)}`
                : 'Chưa có dữ liệu nhà cung cấp',
            tone: 'neutral',
            onClick: () =>
                onOpenDrilldown({
                    kind: 'suppliers',
                    title: 'Chi phí mua vật tư theo nhà cung cấp',
                    description: 'Tỷ trọng và giá trị mua vật tư theo NCC trong kỳ.',
                    rows: suppliers,
                }),
        },
        {
            title: 'Tiêu hao tập trung',
            value: topMaterial
                ? `${topMaterial.materialName}: ${fmtNumber(topMaterial.totalQuantityOut ?? 0)} ${topMaterial.unit ?? ''}`
                : topPlant
                  ? `${topPlant.plantName}: ${fmtCurrency(topPlant.totalWithVat)}`
                  : 'Chưa có dữ liệu tiêu hao',
            tone: 'neutral',
            onClick: () =>
                onOpenDrilldown({
                    kind: 'materials',
                    title: 'Top vật tư tiêu hao',
                    description: 'Các vật tư có lượng xuất/cấp phát lớn trong kỳ.',
                    rows: materials,
                }),
        },
    ];

    return (
        <Card className='report-insight-card' variant='outlined'>
            <div className='report-insight-head'>
                <div>
                    <Text className='report-section-title'>Gợi ý vận hành vật tư</Text>
                    <Text type='secondary'>Các điểm cần chú ý từ dữ liệu đang lọc.</Text>
                </div>
                <Tag color='blue'>Insight</Tag>
            </div>
            <div className='report-insight-grid'>
                {insights.map((insight) => (
                    <button
                        key={insight.title}
                        type='button'
                        className={`report-insight-item report-insight-item--${insight.tone}`}
                        onClick={insight.onClick}
                    >
                        <span>{insight.title}</span>
                        <strong>{insight.value}</strong>
                    </button>
                ))}
            </div>
        </Card>
    );
}

function OverviewTab({
    costTrend,
    topMaterials,
    suppliers,
    distribution,
    loading,
    onOpenDetail,
}: {
    costTrend: MaterialCostByPeriodPoint[];
    topMaterials: TopConsumedMaterial[];
    suppliers: SupplierReportRow[];
    distribution?: { byPlant: DistributionCostByPlant[]; byPeriod: DistributionCostByPeriod[] };
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

    if (loading) return <ReportSkeleton />;

    return (
        <Row gutter={[16, 16]}>
            <Col xs={24} xxl={15}>
                <SectionCard
                    title='Mua vật tư và cấp phát theo thời gian'
                    extra={<Tag color='blue'>Không cộng double-count</Tag>}
                >
                    <ChartFrame empty={!combinedTrend.length}>
                        <ResponsiveContainer width='100%' height='100%'>
                            <ComposedChart data={combinedTrend} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                                <CartesianGrid strokeDasharray='3 3' stroke='#eef2f7' />
                                <XAxis dataKey='period' tick={{ fontSize: 12 }} />
                                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 12 }} width={58} />
                                <ChartTooltip
                                    formatter={(value: any, name: any) => [fmtCurrency(Number(value)), String(name)]}
                                />
                                <Legend />
                                <Bar
                                    dataKey='distributionValue'
                                    name='Giá trị cấp phát vật tư'
                                    fill='#722ed1'
                                    radius={[6, 6, 0, 0]}
                                    barSize={24}
                                />
                                <Line
                                    type='monotone'
                                    dataKey='purchaseCost'
                                    name='Chi phí mua vật tư net'
                                    stroke='#1677ff'
                                    strokeWidth={3}
                                    dot={{ r: 4 }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </ChartFrame>
                </SectionCard>
            </Col>
            <Col xs={24} xxl={9}>
                <SectionCard title='Giá trị cấp phát vật tư theo cơ sở'>
                    <ChartFrame empty={!distribution?.byPlant?.length}>
                        <ResponsiveContainer width='100%' height='100%'>
                            <BarChart
                                data={distribution?.byPlant ?? []}
                                layout='vertical'
                                margin={{ top: 8, right: 24, left: 24, bottom: 8 }}
                            >
                                <CartesianGrid strokeDasharray='3 3' stroke='#eef2f7' />
                                <XAxis type='number' tickFormatter={fmtShort} tick={{ fontSize: 12 }} />
                                <YAxis type='category' dataKey='plantName' width={120} tick={{ fontSize: 12 }} />
                                <ChartTooltip
                                    formatter={(value: any) => [fmtCurrency(Number(value)), 'Giá trị cấp phát']}
                                />
                                <Bar
                                    dataKey='totalWithVat'
                                    name='Giá trị cấp phát'
                                    radius={[0, 6, 6, 0]}
                                    onClick={(entry: any) => {
                                        const row = entry?.payload as DistributionCostByPlant | undefined;
                                        if (row)
                                            onOpenDetail({ type: 'distribution', title: row.plantName, record: row });
                                    }}
                                >
                                    {(distribution?.byPlant ?? []).map((_, index) => (
                                        <Cell
                                            key={index}
                                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                                            cursor='pointer'
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartFrame>
                </SectionCard>
            </Col>
            <Col xs={24} xl={12}>
                <SectionCard title='Top vật tư tiêu hao'>
                    <TopMaterialMiniList data={topMaterials} onOpenDetail={onOpenDetail} />
                </SectionCard>
            </Col>
            <Col xs={24} xl={12}>
                <SectionCard title='Tỷ trọng nhà cung cấp'>
                    <ChartFrame empty={!suppliers.length} height={300}>
                        <ResponsiveContainer width='100%' height='100%'>
                            <PieChart>
                                <Pie
                                    data={suppliers.slice(0, 8)}
                                    dataKey='totalAmount'
                                    nameKey='supplierName'
                                    cx='50%'
                                    cy='50%'
                                    outerRadius={105}
                                    innerRadius={48}
                                    paddingAngle={2}
                                >
                                    {suppliers.slice(0, 8).map((_, index) => (
                                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                </Pie>
                                <ChartTooltip formatter={(value: any) => fmtCurrency(Number(value))} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartFrame>
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
    const columns: ColumnsType<TopConsumedMaterial> = [
        { title: 'Mã VT', dataIndex: 'materialCode', width: 120, render: (value) => <Text code>{value || '-'}</Text> },
        { title: 'Tên vật tư', dataIndex: 'materialName', ellipsis: true },
        { title: 'Nhóm', dataIndex: 'category', width: 160, render: (value) => value || '-' },
        { title: 'ĐVT', dataIndex: 'unit', width: 90 },
        {
            title: 'SL xuất',
            dataIndex: 'totalQuantityOut',
            align: 'right',
            sorter: (a, b) => (a.totalQuantityOut ?? 0) - (b.totalQuantityOut ?? 0),
            render: (value) => fmtNumber(value),
        },
        { title: 'Tồn hiện tại', dataIndex: 'currentStock', align: 'right', render: (value) => fmtNumber(value) },
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
                    <ChartFrame empty={!data.length}>
                        <ResponsiveContainer width='100%' height='100%'>
                            <BarChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 64 }}>
                                <CartesianGrid strokeDasharray='3 3' stroke='#eef2f7' />
                                <XAxis
                                    dataKey='materialName'
                                    tick={{ fontSize: 11 }}
                                    angle={-30}
                                    textAnchor='end'
                                    interval={0}
                                />
                                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 12 }} />
                                <ChartTooltip
                                    formatter={(value: any, _name: any, entry: any) => [
                                        `${fmtNumber(Number(value))} ${entry.payload.unit || ''}`,
                                        'Số lượng',
                                    ]}
                                />
                                <Bar dataKey='totalQuantityOut' name='SL xuất' radius={[6, 6, 0, 0]}>
                                    {data.map((_, index) => (
                                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartFrame>
                </SectionCard>
            </Col>
            <Col xs={24}>
                <Table
                    rowKey={(row) => row.materialId || row.materialCode || row.materialName}
                    loading={loading}
                    columns={columns}
                    dataSource={data}
                    size='small'
                    scroll={{ x: 980 }}
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
    const totalSupplierCost = suppliers.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0);
    const supplierColumns: ColumnsType<SupplierReportRow> = [
        { title: 'Nhà cung cấp', dataIndex: 'supplierName', ellipsis: true },
        {
            title: 'Số đơn',
            dataIndex: 'orderCount',
            width: 110,
            align: 'right',
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
        { title: 'Nhà cung cấp', dataIndex: 'supplierName', ellipsis: true },
        {
            title: 'Đề xuất',
            dataIndex: 'requestCodes',
            width: 220,
            render: (codes?: string[]) => (codes ?? []).map((code) => <Tag key={code}>{code}</Tag>),
        },
        {
            title: 'Dự tính',
            dataIndex: 'estimatedTotal',
            width: 150,
            align: 'right',
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
        { title: 'Trạng thái', dataIndex: 'status', width: 130, render: renderStatus },
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
                        scroll={{ x: 1050 }}
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
    const rows = data?.byPlant ?? [];
    const total = rows.reduce((sum, row) => sum + row.totalWithVat, 0);
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
                        <ResponsiveContainer width='100%' height='100%'>
                            <BarChart data={data?.byPeriod ?? []} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                                <CartesianGrid strokeDasharray='3 3' stroke='#eef2f7' />
                                <XAxis dataKey='period' tick={{ fontSize: 12 }} />
                                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 12 }} width={58} />
                                <ChartTooltip
                                    formatter={(value: any) => [fmtCurrency(Number(value)), 'Giá trị cấp phát']}
                                />
                                <Bar
                                    dataKey='totalWithVat'
                                    name='Giá trị cấp phát vật tư'
                                    fill='#722ed1'
                                    radius={[6, 6, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
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
                        scroll={{ x: 360 }}
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
    const purchaseColumns: ColumnsType<PriceComparisonReportRow> = [
        { title: 'Mã PO', dataIndex: 'orderCode', width: 140, render: (value) => <Text code>{value || '-'}</Text> },
        { title: 'Nhà cung cấp', dataIndex: 'supplierName', ellipsis: true, render: (value) => value || '-' },
        {
            title: 'Phiếu đề xuất',
            dataIndex: 'requestCodes',
            width: 210,
            render: (codes?: string[]) => (codes ?? []).map((code) => <Tag key={code}>{code}</Tag>),
        },
        {
            title: 'Dự tính',
            dataIndex: 'estimatedTotal',
            width: 140,
            align: 'right',
            render: (value) => fmtCurrency(value ?? 0),
        },
        {
            title: 'Thực tế net',
            dataIndex: 'netActual',
            width: 150,
            align: 'right',
            render: (_value, row) => fmtCurrency(row.netActual ?? row.actualTotal ?? 0),
        },
        { title: 'Trạng thái', dataIndex: 'status', width: 140, render: renderStatus },
        {
            title: 'Ngày nhận',
            dataIndex: 'receivedAt',
            width: 140,
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
        { title: 'Số dòng', dataIndex: 'items', width: 100, align: 'right', render: (items) => items?.length ?? 0 },
        {
            title: 'Tổng tiền',
            dataIndex: 'items',
            width: 160,
            align: 'right',
            render: (items) =>
                fmtCurrency((items ?? []).reduce((sum: number, item: any) => sum + (item.totalWithVat ?? 0), 0)),
        },
        { title: 'Trạng thái', dataIndex: 'status', width: 140, render: renderStatus },
        {
            title: 'Ngày xuất',
            dataIndex: 'distributedAt',
            width: 140,
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
                            scroll={{ x: 850 }}
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
                            scroll={{ x: 850 }}
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
