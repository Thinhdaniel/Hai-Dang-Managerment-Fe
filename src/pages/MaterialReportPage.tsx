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
    type MaterialReportQueryParams,
    type MaterialSupplier,
    type PriceComparisonReportRow,
    type SupplierReportRow,
    type TopConsumedMaterial,
} from '../core/services/material.service';

const { RangePicker } = DatePicker;
const { Text } = Typography;

type GroupBy = NonNullable<MaterialReportQueryParams['groupBy']>;
type QuickRange = 'this_month' | 'quarter' | 'six_months' | 'year' | 'custom';
type DetailPayload =
    | { type: 'purchase'; title: string; record: PriceComparisonReportRow }
    | { type: 'distribution'; title: string; record: Distribution | DistributionCostByPlant }
    | { type: 'material'; title: string; record: TopConsumedMaterial }
    | { type: 'supplier'; title: string; record: SupplierReportRow };

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
    return Array.isArray(response) ? response : response.data ?? [];
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
    const isManager = hasManagerAccess(user?.role);
    const [quickRange, setQuickRange] = useState<QuickRange>('this_month');
    const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
    const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
    const [exportOpen, setExportOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [detail, setDetail] = useState<DetailPayload | null>(null);
    const [detailSearch, setDetailSearch] = useState('');

    const params = useMemo(() => toReportParams(appliedFilters), [appliedFilters]);

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
        queryFn: () => distributionService.getAll({ ...params, page: 1, limit: 200 } as any),
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
            [
                record.orderCode,
                record.supplierName,
                record.status,
                ...(record.requestCodes ?? []),
            ]
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

    const kpis = [
        {
            title: 'Chi phí mua hàng',
            value: summary?.totalPurchaseCost ?? summary?.totalMonthlyCost ?? 0,
            formatter: fmtCurrency,
            icon: <DollarOutlined />,
            color: '#1677ff',
            hint: 'Tổng chi phí mua theo kỳ đã lọc.',
        },
        {
            title: 'Chi phí cấp phát',
            value: summary?.totalDistributionCost ?? 0,
            formatter: fmtCurrency,
            icon: <InboxOutlined />,
            color: '#722ed1',
            hint: 'Tổng giá trị cấp phát tới cơ sở nhận.',
        },
        {
            title: 'Net sau hoàn trả',
            value: summary?.totalNetPurchaseCost ?? 0,
            formatter: fmtCurrency,
            icon: <LineChartOutlined />,
            color: '#52c41a',
            hint: 'Chi phí mua hàng sau khi trừ hoàn trả.',
        },
        {
            title: 'Lệch giá',
            value: summary?.totalPriceVariance ?? 0,
            formatter: fmtCurrency,
            icon: <AlertOutlined />,
            color: (summary?.totalPriceVariance ?? 0) > 0 ? '#f5222d' : '#52c41a',
            hint: 'Chênh lệch giữa thực tế net và dự tính.',
        },
        {
            title: 'Phiếu chờ duyệt',
            value: summary?.pendingRequestCount ?? 0,
            suffix: 'phiếu',
            icon: <CalendarOutlined />,
            color: '#faad14',
            hint: 'Phiếu đề xuất vật tư còn ở trạng thái chờ.',
        },
        {
            title: 'Dưới ngưỡng',
            value: summary?.lowStockCount ?? 0,
            suffix: 'vật tư',
            icon: <WarningOutlined />,
            color: '#f5222d',
            hint: 'Vật tư có tồn thấp hơn ngưỡng tối thiểu.',
        },
    ];

    const topSupplier = supplierRows[0];
    const topPlant = distributionCost?.byPlant?.[0];
    const highVarianceCount = priceRows.filter((row) => Math.abs(row.difference ?? 0) > 0).length;

    return (
        <div className="report-page">
            <style>{REPORT_PAGE_STYLE}</style>
            <PageHeader
                title="Báo cáo vật tư"
                subtitle={`Kỳ ${appliedFilters.dateRange[0].format('DD/MM/YYYY')} - ${appliedFilters.dateRange[1].format('DD/MM/YYYY')} · ${activeFilterCount} bộ lọc đang áp dụng`}
                actions={
                    <Space wrap>
                        <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={isLoading}>
                            Làm mới
                        </Button>
                        <Button type="primary" icon={<DownloadOutlined />} onClick={() => setExportOpen(true)}>
                            Xuất Excel
                        </Button>
                    </Space>
                }
            />

            <Card className="report-filter-card" variant="outlined">
                <div className="report-filter-toolbar">
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
                    <Space wrap>
                        <Badge count={activeFilterCount} size="small">
                            <Button icon={<FilterOutlined />} onClick={handleApplyFilters}>
                                Áp dụng
                            </Button>
                        </Badge>
                        <Button onClick={handleResetFilters}>Reset</Button>
                    </Space>
                </div>

                <Row gutter={[12, 12]} className="report-filter-grid">
                    <Col xs={24} md={12} xl={6}>
                        <Text className="report-filter-label">Khoảng thời gian</Text>
                        <RangePicker
                            value={filters.dateRange}
                            allowClear={false}
                            format="DD/MM/YYYY"
                            className="report-filter-control"
                            onChange={(dates) => {
                                if (!dates) return;
                                setQuickRange('custom');
                                setFilters((current) => ({ ...current, dateRange: dates as [Dayjs, Dayjs] }));
                            }}
                        />
                    </Col>
                    {isManager ? (
                        <Col xs={24} md={12} xl={6}>
                            <Text className="report-filter-label">Cơ sở</Text>
                            <Select
                                allowClear
                                showSearch={{ optionFilterProp: 'label' }}
                                placeholder="Tất cả cơ sở"
                                className="report-filter-control"
                                value={filters.plantId}
                                onChange={(plantId) => setFilters((current) => ({ ...current, plantId }))}
                                options={plants.map((plant) => ({ label: plant.name, value: plant.id }))}
                            />
                        </Col>
                    ) : null}
                    <Col xs={24} md={12} xl={6}>
                        <Text className="report-filter-label">Nhóm vật tư</Text>
                        <Select
                            allowClear
                            showSearch={{ optionFilterProp: 'label' }}
                            placeholder="Tất cả nhóm"
                            className="report-filter-control"
                            value={filters.category}
                            onChange={(category) => setFilters((current) => ({ ...current, category, materialId: undefined }))}
                            options={categoryOptions}
                        />
                    </Col>
                    <Col xs={24} md={12} xl={6}>
                        <Text className="report-filter-label">Vật tư</Text>
                        <Select
                            allowClear
                            showSearch={{ optionFilterProp: 'label' }}
                            placeholder="Tất cả vật tư"
                            className="report-filter-control"
                            value={filters.materialId}
                            onChange={(materialId) => setFilters((current) => ({ ...current, materialId }))}
                            options={materials
                                .filter((material) => !filters.category || material.category === filters.category)
                                .map((material) => ({ label: `${material.code ? `${material.code} · ` : ''}${material.name}`, value: material.id }))}
                        />
                    </Col>
                    <Col xs={24} md={12} xl={6}>
                        <Text className="report-filter-label">Nhà cung cấp</Text>
                        <Select
                            allowClear
                            showSearch={{ optionFilterProp: 'label' }}
                            placeholder="Tất cả NCC"
                            className="report-filter-control"
                            value={filters.supplierId}
                            onChange={(supplierId) => setFilters((current) => ({ ...current, supplierId }))}
                            options={suppliers.map((supplier) => ({ label: supplier.name, value: supplier.id }))}
                        />
                    </Col>
                    <Col xs={24} md={12} xl={6}>
                        <Text className="report-filter-label">Trạng thái mua hàng</Text>
                        <Select
                            allowClear
                            placeholder="Tất cả trạng thái"
                            className="report-filter-control"
                            value={filters.status}
                            onChange={(status) => setFilters((current) => ({ ...current, status }))}
                            options={Object.entries(STATUS_LABEL)
                                .filter(([status]) => ['draft', 'confirmed', 'ordered', 'received', 'cancelled'].includes(status))
                                .map(([value, info]) => ({ label: info.label, value }))}
                        />
                    </Col>
                    <Col xs={24} md={12} xl={6}>
                        <Text className="report-filter-label">Gom biểu đồ</Text>
                        <Segmented
                            block
                            value={filters.groupBy}
                            onChange={(groupBy) => setFilters((current) => ({ ...current, groupBy: groupBy as GroupBy }))}
                            options={[
                                { label: 'Ngày', value: 'day' },
                                { label: 'Tuần', value: 'week' },
                                { label: 'Tháng', value: 'month' },
                                { label: 'Quý', value: 'quarter' },
                            ]}
                        />
                    </Col>
                </Row>
            </Card>

            {hasError ? (
                <Alert
                    showIcon
                    type="error"
                    title="Không tải được một phần dữ liệu báo cáo"
                    description="Vui lòng kiểm tra lại bộ lọc hoặc thử làm mới trang."
                    action={<Button onClick={handleRefresh}>Thử lại</Button>}
                />
            ) : null}

            <Row gutter={[16, 16]}>
                {kpis.map((kpi) => (
                    <Col key={kpi.title} xs={24} sm={12} xl={8} xxl={4}>
                        <Card className="report-kpi-card" loading={summaryQuery.isLoading} variant="outlined">
                            <div className="report-kpi-head">
                                <Tooltip title={kpi.hint}>
                                    <Text type="secondary" className="report-kpi-title">
                                        {kpi.title}
                                    </Text>
                                </Tooltip>
                                <span className="report-kpi-icon" style={{ color: kpi.color, background: `${kpi.color}16` }}>
                                    {kpi.icon}
                                </span>
                            </div>
                            <Statistic
                                value={kpi.value}
                                formatter={(value) => (kpi.formatter ? kpi.formatter(Number(value)) : fmtNumber(Number(value)))}
                                suffix={kpi.suffix}
                                styles={{ content: { color: kpi.color, fontWeight: 700, fontSize: 24 } }}
                            />
                        </Card>
                    </Col>
                ))}
            </Row>

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={8}>
                    <Alert
                        showIcon
                        type={(summary?.lowStockCount ?? 0) > 0 ? 'warning' : 'success'}
                        title="Cảnh báo tồn kho"
                        description={
                            (summary?.lowStockCount ?? 0) > 0
                                ? `${summary?.lowStockCount} vật tư đang thấp hơn ngưỡng tối thiểu.`
                                : 'Không có vật tư dưới ngưỡng trong phạm vi đang xem.'
                        }
                    />
                </Col>
                <Col xs={24} lg={8}>
                    <Alert
                        showIcon
                        type={highVarianceCount > 0 ? 'info' : 'success'}
                        title="Biến động giá"
                        description={
                            highVarianceCount > 0
                                ? `${highVarianceCount} đơn có chênh lệch giữa dự tính và thực tế.`
                                : 'Không ghi nhận chênh lệch giá đáng chú ý.'
                        }
                    />
                </Col>
                <Col xs={24} lg={8}>
                    <Alert
                        showIcon
                        type="info"
                        title="Điểm tập trung chi phí"
                        description={
                            topSupplier || topPlant
                                ? `${topSupplier?.supplierName ?? 'NCC chưa xác định'} / ${topPlant?.plantName ?? 'cơ sở chưa xác định'} đang đứng đầu theo chi phí.`
                                : 'Chưa có dữ liệu chi phí trong kỳ.'
                        }
                    />
                </Col>
            </Row>

            <Card className="report-main-card" variant="outlined">
                <Tabs
                    destroyOnHidden
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
                            children: <ConsumptionTab data={topMaterials} loading={topQuery.isLoading} onOpenDetail={setDetail} />,
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
                            label: 'Cấp phát',
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
                title="Xuất báo cáo Excel"
                open={exportOpen}
                confirmLoading={exporting}
                okText="Xuất Excel"
                cancelText="Đóng"
                onOk={handleExport}
                onCancel={() => setExportOpen(false)}
            >
                <Text type="secondary">
                    File sẽ được tạo theo đúng bộ lọc đang áp dụng, gồm các sheet nghiệp vụ chính.
                </Text>
                <div className="report-export-list">
                    {['Tổng quan', 'Chi phí theo kỳ', 'Mua hàng', 'Cấp phát', 'Top tiêu hao', 'Nhà cung cấp'].map((sheet) => (
                        <Tag key={sheet} color="blue">
                            {sheet}
                        </Tag>
                    ))}
                </div>
            </Modal>

            <ReportDetailDrawer detail={detail} onClose={() => setDetail(null)} />
        </div>
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
    if (loading) return <ReportSkeleton />;

    return (
        <Row gutter={[16, 16]}>
            <Col xs={24} xl={14}>
                <SectionCard title="Xu hướng chi phí mua hàng" extra={<Tag color="blue">Net cost</Tag>}>
                    <ChartFrame empty={!costTrend.length}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={costTrend} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 12 }} width={58} />
                                <ChartTooltip formatter={(value: any) => [fmtCurrency(Number(value)), 'Chi phí']} />
                                <Legend />
                                <Line type="monotone" dataKey="totalAmount" name="Chi phí" stroke="#1677ff" strokeWidth={3} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </ChartFrame>
                </SectionCard>
            </Col>
            <Col xs={24} xl={10}>
                <SectionCard title="Cấp phát theo cơ sở">
                    <ChartFrame empty={!distribution?.byPlant?.length}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={distribution?.byPlant ?? []} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                                <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 12 }} />
                                <YAxis type="category" dataKey="plantName" width={120} tick={{ fontSize: 12 }} />
                                <ChartTooltip formatter={(value: any) => [fmtCurrency(Number(value)), 'Chi phí']} />
                                <Bar
                                    dataKey="totalWithVat"
                                    name="Chi phí"
                                    radius={[0, 6, 6, 0]}
                                    onClick={(entry: any) => {
                                        const row = entry?.payload as DistributionCostByPlant | undefined;
                                        if (row) onOpenDetail({ type: 'distribution', title: row.plantName, record: row });
                                    }}
                                >
                                    {(distribution?.byPlant ?? []).map((_, index) => (
                                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} cursor="pointer" />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartFrame>
                </SectionCard>
            </Col>
            <Col xs={24} xl={12}>
                <SectionCard title="Top vật tư tiêu hao">
                    <TopMaterialMiniList data={topMaterials} onOpenDetail={onOpenDetail} />
                </SectionCard>
            </Col>
            <Col xs={24} xl={12}>
                <SectionCard title="Tỷ trọng nhà cung cấp">
                    <ChartFrame empty={!suppliers.length} height={300}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={suppliers.slice(0, 8)} dataKey="totalAmount" nameKey="supplierName" cx="50%" cy="50%" outerRadius={105} innerRadius={48} paddingAngle={2}>
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
        { title: 'SL xuất', dataIndex: 'totalQuantityOut', align: 'right', sorter: (a, b) => (a.totalQuantityOut ?? 0) - (b.totalQuantityOut ?? 0), render: (value) => fmtNumber(value) },
        { title: 'Tồn hiện tại', dataIndex: 'currentStock', align: 'right', render: (value) => fmtNumber(value) },
        {
            title: 'Trạng thái',
            width: 150,
            render: (_, row) =>
                (row.currentStock ?? 0) < (row.minStockLevel ?? 0) ? (
                    <Tag color="error" icon={<WarningOutlined />}>Dưới ngưỡng</Tag>
                ) : (
                    <Tag color="success">Đủ hàng</Tag>
                ),
        },
    ];

    return (
        <Row gutter={[16, 16]}>
            <Col xs={24}>
                <SectionCard title="Biểu đồ top vật tư xuất kho">
                    <ChartFrame empty={!data.length}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 64 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                                <XAxis dataKey="materialName" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 12 }} />
                                <ChartTooltip formatter={(value: any, _name: any, entry: any) => [`${fmtNumber(Number(value))} ${entry.payload.unit || ''}`, 'Số lượng']} />
                                <Bar dataKey="totalQuantityOut" name="SL xuất" radius={[6, 6, 0, 0]}>
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
                    size="small"
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
        { title: 'Số đơn', dataIndex: 'orderCount', width: 110, align: 'right', sorter: (a, b) => (a.orderCount ?? 0) - (b.orderCount ?? 0) },
        { title: 'Tổng tiền', dataIndex: 'totalAmount', width: 160, align: 'right', sorter: (a, b) => (a.totalAmount ?? 0) - (b.totalAmount ?? 0), render: (value) => fmtCurrency(value) },
        {
            title: 'Tỷ trọng',
            width: 120,
            align: 'right',
            render: (_, row) => (totalSupplierCost ? `${(((row.totalAmount ?? 0) / totalSupplierCost) * 100).toFixed(1)}%` : '-'),
        },
    ];

    const priceColumns: ColumnsType<PriceComparisonReportRow> = [
        { title: 'Mã PO', dataIndex: 'orderCode', width: 130, render: (value) => <Text code>{value || '-'}</Text> },
        { title: 'Nhà cung cấp', dataIndex: 'supplierName', ellipsis: true },
        { title: 'Đề xuất', dataIndex: 'requestCodes', width: 220, render: (codes?: string[]) => (codes ?? []).map((code) => <Tag key={code}>{code}</Tag>) },
        { title: 'Dự tính', dataIndex: 'estimatedTotal', width: 150, align: 'right', render: (value) => fmtCurrency(value) },
        { title: 'Thực tế net', dataIndex: 'netActual', width: 150, align: 'right', render: (_value, row) => fmtCurrency(row.netActual ?? row.actualTotal ?? 0) },
        {
            title: 'Chênh lệch',
            dataIndex: 'difference',
            width: 160,
            align: 'right',
            sorter: (a, b) => (a.difference ?? 0) - (b.difference ?? 0),
            render: (value = 0) => <Text type={value > 0 ? 'danger' : value < 0 ? 'success' : 'secondary'}>{value ? fmtCurrency(value) : '-'}</Text>,
        },
        { title: 'Trạng thái', dataIndex: 'status', width: 130, render: renderStatus },
    ];

    return (
        <Row gutter={[16, 16]}>
            <Col xs={24} xl={9}>
                <SectionCard title="Chi phí theo nhà cung cấp">
                    <Table
                        rowKey={(row) => row.supplierId || row.supplierName}
                        loading={loading}
                        columns={supplierColumns}
                        dataSource={suppliers}
                        size="small"
                        pagination={{ pageSize: 8 }}
                        onRow={(record) => ({
                            onClick: () => onOpenDetail({ type: 'supplier', title: record.supplierName, record }),
                        })}
                    />
                </SectionCard>
            </Col>
            <Col xs={24} xl={15}>
                <SectionCard title="So sánh dự tính và thực tế">
                    <Table
                        rowKey={(row) => row.orderId}
                        loading={loading}
                        columns={priceColumns}
                        dataSource={prices}
                        size="small"
                        scroll={{ x: 1050 }}
                        pagination={{ pageSize: 8, showSizeChanger: true }}
                        rowClassName={(row) => ((row.difference ?? 0) > 0 ? 'report-row-danger' : '')}
                        onRow={(record) => ({
                            onClick: () => onOpenDetail({ type: 'purchase', title: record.orderCode || 'Đơn mua hàng', record }),
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
        { title: 'Cơ sở nhận', dataIndex: 'plantName', ellipsis: true },
        { title: 'Số phiếu', dataIndex: 'count', width: 110, align: 'right' },
        { title: 'Tiền hàng', dataIndex: 'totalAmount', width: 150, align: 'right', render: (value) => fmtCurrency(value) },
        { title: 'Tổng có VAT', dataIndex: 'totalWithVat', width: 160, align: 'right', sorter: (a, b) => a.totalWithVat - b.totalWithVat, render: (value) => fmtCurrency(value) },
        { title: 'Tỷ trọng', width: 120, align: 'right', render: (_, row) => (total ? `${((row.totalWithVat / total) * 100).toFixed(1)}%` : '-') },
    ];

    return (
        <Row gutter={[16, 16]}>
            <Col xs={24} xl={14}>
                <SectionCard title="Chi phí cấp phát theo thời gian">
                    <ChartFrame empty={!data?.byPeriod?.length}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data?.byPeriod ?? []} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 12 }} width={58} />
                                <ChartTooltip formatter={(value: any) => [fmtCurrency(Number(value)), 'Chi phí']} />
                                <Bar dataKey="totalWithVat" name="Chi phí cấp phát" fill="#722ed1" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartFrame>
                </SectionCard>
            </Col>
            <Col xs={24} xl={10}>
                <SectionCard title="Chi phí theo cơ sở nhận">
                    <Table
                        rowKey={(row) => row.plantId}
                        loading={loading}
                        columns={columns}
                        dataSource={rows}
                        size="small"
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
        { title: 'Phiếu đề xuất', dataIndex: 'requestCodes', width: 210, render: (codes?: string[]) => (codes ?? []).map((code) => <Tag key={code}>{code}</Tag>) },
        { title: 'Dự tính', dataIndex: 'estimatedTotal', width: 140, align: 'right', render: (value) => fmtCurrency(value ?? 0) },
        { title: 'Thực tế net', dataIndex: 'netActual', width: 150, align: 'right', render: (_value, row) => fmtCurrency(row.netActual ?? row.actualTotal ?? 0) },
        { title: 'Trạng thái', dataIndex: 'status', width: 140, render: renderStatus },
        { title: 'Ngày nhận', dataIndex: 'receivedAt', width: 140, render: (value) => (value ? dayjs(value).format('DD/MM/YYYY') : '-') },
    ];

    const distributionColumns: ColumnsType<Distribution> = [
        { title: 'Mã phiếu', dataIndex: 'distributionCode', width: 150, render: (value) => <Text code>{value || '-'}</Text> },
        { title: 'Cơ sở nhận', dataIndex: ['toPlant', 'name'], ellipsis: true, render: (_value, row) => row.toPlant?.name || '-' },
        { title: 'Số dòng', dataIndex: 'items', width: 100, align: 'right', render: (items) => items?.length ?? 0 },
        { title: 'Tổng tiền', dataIndex: 'items', width: 160, align: 'right', render: (items) => fmtCurrency((items ?? []).reduce((sum: number, item: any) => sum + (item.totalWithVat ?? 0), 0)) },
        { title: 'Trạng thái', dataIndex: 'status', width: 140, render: renderStatus },
        { title: 'Ngày xuất', dataIndex: 'distributedAt', width: 140, render: (value) => (value ? dayjs(value).format('DD/MM/YYYY') : '-') },
    ];

    return (
        <div className="report-stack">
            <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Tìm mã phiếu, nhà cung cấp, vật tư..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="report-detail-search"
            />
            <Row gutter={[16, 16]}>
                <Col xs={24} xl={12}>
                    <SectionCard title="Đơn mua hàng">
                        <Table
                            rowKey={(row) => row.orderId}
                            loading={loading}
                            columns={purchaseColumns}
                            dataSource={purchaseRows}
                            size="small"
                            scroll={{ x: 850 }}
                            pagination={{ pageSize: 8 }}
                            onRow={(record) => ({
                                onClick: () => onOpenDetail({ type: 'purchase', title: record.orderCode || 'Đơn mua hàng', record }),
                            })}
                        />
                    </SectionCard>
                </Col>
                <Col xs={24} xl={12}>
                    <SectionCard title="Phiếu cấp phát">
                        <Table
                            rowKey={(row) => row.id}
                            loading={loading}
                            columns={distributionColumns}
                            dataSource={distributionRows}
                            size="small"
                            scroll={{ x: 850 }}
                            pagination={{ pageSize: 8 }}
                            onRow={(record) => ({
                                onClick: () => onOpenDetail({ type: 'distribution', title: record.distributionCode || 'Phiếu cấp phát', record }),
                            })}
                        />
                    </SectionCard>
                </Col>
            </Row>
        </div>
    );
}

function SectionCard({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
    return (
        <Card className="report-section-card" title={<span className="report-section-title">{title}</span>} extra={extra} variant="outlined">
            {children}
        </Card>
    );
}

function ChartFrame({ empty, height = 340, children }: { empty: boolean; height?: number; children: React.ReactNode }) {
    if (empty) {
        return (
            <div className="report-empty-chart" style={{ height }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có dữ liệu trong kỳ đã chọn" />
            </div>
        );
    }
    return <div style={{ height }}>{children}</div>;
}

function ReportSkeleton() {
    return (
        <Row gutter={[16, 16]}>
            {[1, 2, 3, 4].map((item) => (
                <Col key={item} xs={24} xl={12}>
                    <Card variant="outlined">
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
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có dữ liệu tiêu hao" />;
    }

    const max = Math.max(...data.map((row) => row.totalQuantityOut ?? 0), 1);
    return (
        <div className="report-mini-stack">
            {data.slice(0, 8).map((row, index) => {
                const percent = ((row.totalQuantityOut ?? 0) / max) * 100;
                return (
                    <button
                        key={row.materialId || row.materialName}
                        type="button"
                        className="report-rank-row"
                        onClick={() => onOpenDetail({ type: 'material', title: row.materialName, record: row })}
                    >
                        <span className="report-rank-index">{index + 1}</span>
                        <span className="report-rank-main">
                            <span className="report-rank-name">{row.materialName}</span>
                            <span className="report-rank-bar"><span style={{ width: `${percent}%` }} /></span>
                        </span>
                        <span className="report-rank-value">{fmtNumber(row.totalQuantityOut)} {row.unit}</span>
                    </button>
                );
            })}
        </div>
    );
}

function ReportDetailDrawer({ detail, onClose }: { detail: DetailPayload | null; onClose: () => void }) {
    const record: any = detail?.record;
    return (
        <Drawer open={Boolean(detail)} onClose={onClose} title={detail?.title} size={560} destroyOnHidden>
            {!detail ? null : (
                <div className="report-stack">
                    <Descriptions column={1} bordered size="small">
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
                            size="small"
                            pagination={false}
                            scroll={{ x: 640 }}
                            columns={[
                                { title: 'Vật tư', dataIndex: 'materialName', ellipsis: true },
                                { title: 'ĐVT', dataIndex: 'unit', width: 80 },
                                { title: 'SL', dataIndex: 'quantityOrdered', width: 90, align: 'right', render: (_value, row: any) => fmtNumber(row.quantityOrdered ?? row.quantityRequested ?? row.quantity ?? 0) },
                                { title: 'Tổng', dataIndex: 'totalWithVat', width: 130, align: 'right', render: (value, row: any) => fmtCurrency(value ?? row.totalPrice ?? 0) },
                            ]}
                        />
                    ) : null}
                </div>
            )}
        </Drawer>
    );
}

const REPORT_PAGE_STYLE = `
.report-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.report-filter-card,
.report-kpi-card,
.report-main-card,
.report-section-card {
    border-radius: 8px;
}
.report-filter-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;
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
.report-section-title {
    font-weight: 700;
}
.report-empty-chart {
    display: flex;
    align-items: center;
    justify-content: center;
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
`;
