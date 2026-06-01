import React, { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    App,
    Button,
    Card,
    Col,
    DatePicker,
    Drawer,
    Empty,
    Grid,
    Row,
    Segmented,
    Select,
    Skeleton,
    Space,
    Statistic,
    Table,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    BarChartOutlined,
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
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip as ChartTooltip,
    XAxis,
    YAxis,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
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
const { useBreakpoint } = Grid;

type QuickRange = 'this_month' | 'quarter' | 'six_months' | 'year' | 'custom';

type ReportFilters = {
    plantId?: string;
    dateRange: [Dayjs, Dayjs];
    groupBy: FacilityCostGroupBy;
};

type ActiveFilterChip = {
    key: string;
    label: string;
    color?: string;
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
          kind: 'message';
          title: string;
          description: string;
      };

const DEFAULT_FILTERS: ReportFilters = {
    dateRange: [dayjs().startOf('month'), dayjs().endOf('day')],
    groupBy: 'month',
};

const COST_COLORS = {
    material: '#1677ff',
    repair: '#fa8c16',
    total: '#13c2c2',
};

const GROUP_BY_LABEL: Record<FacilityCostGroupBy, string> = {
    day: 'Ngày',
    month: 'Tháng',
    quarter: 'Quý',
};

const fmtCurrency = (value = 0) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

const fmtShort = (value: number) => {
    if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
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

export default function FacilityCostReportPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { user } = useAuth();
    const screens = useBreakpoint();
    const isManager = hasManagerAccess(user?.role);
    const isMobile = !screens.md;
    const [quickRange, setQuickRange] = useState<QuickRange>('this_month');
    const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
    const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
    const [exporting, setExporting] = useState(false);
    const [drilldown, setDrilldown] = useState<FacilityDrilldownPayload | null>(null);

    const params = useMemo(() => toReportParams(appliedFilters), [appliedFilters]);
    const draftParams = useMemo(() => toReportParams(filters), [filters]);
    const hasPendingFilterChanges = JSON.stringify(draftParams) !== JSON.stringify(params);

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

    const plants = plantsQuery.data ?? [];
    const report = reportQuery.data;
    const summary = report?.summary;
    const costByPlant = report?.costByPlant ?? [];
    const costByPeriod = report?.costByPeriod ?? [];
    const topAssets = report?.topExternalRepairAssets ?? [];
    const topPlant = costByPlant[0];
    const activeFilterCount = [appliedFilters.plantId].filter(Boolean).length;
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
        return chips;
    }, [appliedFilters, plants]);

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

    const handleApplyFilters = () => {
        setAppliedFilters(filters);
    };

    const handleResetFilters = () => {
        setQuickRange('this_month');
        setFilters(DEFAULT_FILTERS);
        setAppliedFilters(DEFAULT_FILTERS);
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

    const plantColumns: ColumnsType<FacilityCostByPlant> = [
        {
            title: 'Cơ sở',
            dataIndex: 'plantName',
            fixed: isMobile ? undefined : 'left',
            width: 210,
            ellipsis: true,
            render: (value) => <Text strong>{value}</Text>,
        },
        {
            title: 'Chi phí vật tư đã cấp phát',
            dataIndex: 'materialDistributionCost',
            width: 170,
            align: 'right',
            sorter: (a, b) => a.materialDistributionCost - b.materialDistributionCost,
            render: (value) => fmtCurrency(value),
        },
        {
            title: 'Sửa ngoài',
            dataIndex: 'externalRepairCost',
            width: 160,
            align: 'right',
            sorter: (a, b) => a.externalRepairCost - b.externalRepairCost,
            render: (value) => fmtCurrency(value),
        },
        {
            title: 'Tổng chi phí',
            dataIndex: 'totalCost',
            width: 170,
            align: 'right',
            sorter: (a, b) => a.totalCost - b.totalCost,
            defaultSortOrder: 'descend',
            render: (value) => <Text strong>{fmtCurrency(value)}</Text>,
        },
        {
            title: 'Tỷ trọng sửa',
            dataIndex: 'repairSharePercent',
            width: 130,
            align: 'right',
            render: (value) => <Tag color={value > 30 ? 'orange' : 'blue'}>{Number(value ?? 0).toFixed(1)}%</Tag>,
        },
        {
            title: 'Phiếu cấp phát',
            dataIndex: 'distributionCount',
            width: 130,
            align: 'right',
            responsive: ['md'],
        },
        {
            title: 'Phiếu sửa ngoài',
            dataIndex: 'externalRepairCount',
            width: 135,
            align: 'right',
            responsive: ['md'],
        },
        {
            title: 'Máy sửa ngoài',
            dataIndex: 'externalRepairAssetCount',
            width: 130,
            align: 'right',
            responsive: ['lg'],
        },
        {
            title: 'Nguồn',
            key: 'actions',
            width: 180,
            fixed: isMobile ? undefined : 'right',
            render: (_, row) => (
                <Space size={4}>
                    <Button
                        size='small'
                        onClick={() =>
                            navigate(`/materials/distributions?${buildLinkedParams({ toPlantId: row.plantId })}`)
                        }
                    >
                        Cấp phát
                    </Button>
                    <Button
                        size='small'
                        onClick={() =>
                            navigate(
                                `/maintenances?${buildLinkedParams({
                                    plantId: row.plantId,
                                    repairMode: 'external',
                                    status: 'completed',
                                })}`
                            )
                        }
                    >
                        Sửa ngoài
                    </Button>
                </Space>
            ),
        },
    ];

    const assetColumns: ColumnsType<TopExternalRepairAsset> = [
        {
            title: 'Máy',
            key: 'asset',
            render: (_, row) => (
                <div className='facility-cost-asset-cell'>
                    <Text strong>{row.assetName}</Text>
                    <Space size={4} wrap>
                        {row.machineCode ? <Tag color='blue'>{row.machineCode}</Tag> : null}
                        {row.plantName ? <Tag>{row.plantName}</Tag> : null}
                    </Space>
                </div>
            ),
        },
        {
            title: 'Số lần',
            dataIndex: 'count',
            width: 90,
            align: 'right',
        },
        {
            title: 'Chi phí',
            dataIndex: 'totalCost',
            width: 150,
            align: 'right',
            sorter: (a, b) => a.totalCost - b.totalCost,
            render: (value) => <Text strong>{fmtCurrency(value)}</Text>,
        },
        {
            title: 'Nguồn',
            key: 'actions',
            width: 110,
            align: 'right',
            render: (_, row) => (
                <Button
                    size='small'
                    onClick={() =>
                        navigate(
                            `/maintenances?${buildLinkedParams({
                                assetId: row.assetId,
                                repairMode: 'external',
                                status: 'completed',
                            })}`
                        )
                    }
                >
                    Lịch sử
                </Button>
            ),
        },
    ];

    return (
        <div className='facility-cost-page'>
            <style>{FACILITY_COST_STYLE}</style>
            <PageHeader
                title='Báo cáo chi phí vận hành'
                subtitle={`Kỳ ${appliedFilters.dateRange[0].format('DD/MM/YYYY')} - ${appliedFilters.dateRange[1].format('DD/MM/YYYY')} · Scope hiện tại: vật tư đã cấp phát + sửa ngoài hoàn tất`}
                extra={<ActiveFilterChips chips={activeFilterChips} />}
                actions={
                    <Space wrap className='facility-cost-header-actions'>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={reportQuery.isFetching}
                            onClick={() => reportQuery.refetch()}
                        >
                            Làm mới
                        </Button>
                        <Button type='primary' icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
                            Xuất Excel
                        </Button>
                    </Space>
                }
            />

            <Card className='facility-cost-filter-card' variant='outlined'>
                <div className='facility-cost-filter-toolbar'>
                    <div className='facility-cost-segmented-scroll'>
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
                    <Space wrap>
                        <Button type={hasPendingFilterChanges ? 'primary' : 'default'} onClick={handleApplyFilters}>
                            {hasPendingFilterChanges ? 'Áp dụng thay đổi' : 'Áp dụng'}
                        </Button>
                        <Button onClick={handleResetFilters}>Reset</Button>
                    </Space>
                </div>
                <Row gutter={[12, 12]} align='bottom'>
                    <Col xs={24} md={12} xl={8}>
                        <Text className='facility-cost-filter-label'>Khoảng thời gian</Text>
                        <RangePicker
                            value={filters.dateRange}
                            allowClear={false}
                            format='DD/MM/YYYY'
                            className='facility-cost-control'
                            onChange={(dates) => {
                                if (!dates) return;
                                setQuickRange('custom');
                                setFilters((current) => ({ ...current, dateRange: dates as [Dayjs, Dayjs] }));
                            }}
                        />
                    </Col>
                    {isManager ? (
                        <Col xs={24} md={12} xl={8}>
                            <Text className='facility-cost-filter-label'>Cơ sở</Text>
                            <Select
                                allowClear
                                showSearch={{ optionFilterProp: 'label' }}
                                placeholder='Tất cả cơ sở'
                                className='facility-cost-control'
                                value={filters.plantId}
                                loading={plantsQuery.isLoading}
                                onChange={(plantId) => setFilters((current) => ({ ...current, plantId }))}
                                options={plants.map((plant) => ({ label: plant.name, value: plant.id }))}
                            />
                        </Col>
                    ) : null}
                    <Col xs={24} md={12} xl={8}>
                        <Text className='facility-cost-filter-label'>Nhóm kỳ</Text>
                        <Select
                            className='facility-cost-control'
                            value={filters.groupBy}
                            onChange={(groupBy) => setFilters((current) => ({ ...current, groupBy }))}
                            options={[
                                { label: 'Theo ngày', value: 'day' },
                                { label: 'Theo tháng', value: 'month' },
                                { label: 'Theo quý', value: 'quarter' },
                            ]}
                        />
                    </Col>
                </Row>
                {activeFilterCount ? (
                    <Text className='facility-cost-filter-note'>
                        Đang lọc theo {activeFilterCount} điều kiện cơ sở.
                    </Text>
                ) : null}
                <ActiveFilterChips chips={activeFilterChips} compact />
            </Card>

            {reportQuery.isError ? (
                <Card variant='outlined'>
                    <Empty description='Không thể tải báo cáo chi phí vận hành' />
                </Card>
            ) : null}

            <Row gutter={[16, 16]}>
                <Col xs={24} md={12} xl={4}>
                    <MetricCard
                        title='Tổng chi phí vận hành'
                        value={summary?.totalFacilityCost ?? 0}
                        loading={reportQuery.isLoading}
                        icon={<BarChartOutlined />}
                        color={COST_COLORS.total}
                        hint='Tổng các chi phí được tính trong trang này theo scope hiện tại, không tự động cộng chi phí mua vật tư vào chi phí tiêu hao.'
                        onClick={() =>
                            setDrilldown({
                                kind: 'plant',
                                title: 'Chi phí vận hành theo cơ sở',
                                description: 'Các cơ sở tạo nên tổng chi phí vận hành trong kỳ lọc.',
                                rows: costByPlant,
                            })
                        }
                    />
                </Col>
                <Col xs={24} md={12} xl={4}>
                    <MetricCard
                        title='Chi phí vật tư đã cấp phát'
                        value={summary?.materialDistributionCost ?? 0}
                        loading={reportQuery.isLoading}
                        icon={<InboxOutlined />}
                        color={COST_COLORS.material}
                        hint='Giá trị vật tư đã tiêu hao hoặc phân bổ cho cơ sở nhận, không phải dòng tiền mua vật tư.'
                        onClick={() =>
                            setDrilldown({
                                kind: 'plant',
                                title: 'Chi phí vật tư đã cấp phát theo cơ sở',
                                description: 'Giá trị vật tư đã cấp phát/phân bổ theo cơ sở nhận.',
                                rows: costByPlant.filter((row) => row.materialDistributionCost > 0),
                            })
                        }
                    />
                </Col>
                <Col xs={24} md={12} xl={4}>
                    <MetricCard
                        title='Chi phí sửa ngoài'
                        value={summary?.externalRepairCost ?? 0}
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
                <Col xs={24} md={12} xl={4}>
                    <MetricCard
                        title='Sửa ngoài chờ duyệt'
                        value={summary?.pendingApprovalCount ?? 0}
                        loading={reportQuery.isLoading}
                        suffix='phiếu'
                        icon={<WarningOutlined />}
                        color='#faad14'
                        hint='Số phiếu sửa ngoài đang chờ duyệt trong phạm vi cơ sở đã lọc.'
                        onClick={() =>
                            setDrilldown({
                                kind: 'message',
                                title: 'Sửa ngoài chờ duyệt',
                                description:
                                    'KPI này là tổng hợp trạng thái. Phase sau nên bổ sung API danh sách phiếu sửa ngoài chờ duyệt để drill-down sâu.',
                            })
                        }
                    />
                </Col>
                <Col xs={24} md={12} xl={4}>
                    <MetricCard
                        title='Sửa ngoài đang xử lý'
                        value={summary?.inProgressCount ?? 0}
                        loading={reportQuery.isLoading}
                        suffix='phiếu'
                        icon={<ToolOutlined />}
                        color='#1677ff'
                        hint='Số phiếu sửa ngoài đang xử lý trong phạm vi cơ sở đã lọc.'
                        onClick={() =>
                            setDrilldown({
                                kind: 'message',
                                title: 'Sửa ngoài đang xử lý',
                                description:
                                    'KPI này là tổng hợp trạng thái. Phase sau nên bổ sung API danh sách phiếu đang xử lý để xem chi tiết.',
                            })
                        }
                    />
                </Col>
                <Col xs={24} md={12} xl={4}>
                    <MetricCard
                        title='Cơ sở phát sinh cao nhất'
                        value={topPlant?.totalCost ?? 0}
                        loading={reportQuery.isLoading}
                        icon={<ShopOutlined />}
                        color='#52c41a'
                        hint='Cơ sở có tổng chi phí vận hành cao nhất trong kỳ lọc.'
                        meta={topPlant?.plantName ?? 'Chưa có dữ liệu'}
                        onClick={() =>
                            setDrilldown({
                                kind: 'plant',
                                title: 'Cơ sở phát sinh cao nhất',
                                description: 'Cơ sở đứng đầu theo tổng chi phí vận hành.',
                                rows: topPlant ? [topPlant] : [],
                            })
                        }
                    />
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                <Col xs={24} xl={16}>
                    <Card
                        className='facility-cost-section-card'
                        title='Xu hướng chi phí vận hành theo kỳ'
                        variant='outlined'
                    >
                        {reportQuery.isLoading ? (
                            <Skeleton active paragraph={{ rows: 8 }} />
                        ) : (
                            <CostTrendChart data={costByPeriod} />
                        )}
                    </Card>
                </Col>
                <Col xs={24} xl={8}>
                    <CostCompositionPanel
                        summary={summary}
                        topPlant={topPlant}
                        topAsset={topAssets[0]}
                        onOpenDrilldown={setDrilldown}
                        costByPlant={costByPlant}
                        topAssets={topAssets}
                    />
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                <Col xs={24} xl={15}>
                    <Card className='facility-cost-section-card' title='Chi phí vận hành theo cơ sở' variant='outlined'>
                        <Table
                            rowKey={(row) => row.plantId || row.plantName}
                            loading={reportQuery.isLoading}
                            columns={plantColumns}
                            dataSource={costByPlant}
                            size='small'
                            scroll={{ x: 1300 }}
                            pagination={{ pageSize: 10, showSizeChanger: true }}
                        />
                    </Card>
                </Col>
                <Col xs={24} xl={9}>
                    <Card
                        className='facility-cost-section-card'
                        title='Top máy phát sinh chi phí sửa ngoài'
                        variant='outlined'
                    >
                        <Table
                            rowKey={(row) => row.assetId}
                            loading={reportQuery.isLoading}
                            columns={assetColumns}
                            dataSource={topAssets}
                            size='small'
                            scroll={{ x: 640 }}
                            pagination={{ pageSize: 8 }}
                        />
                    </Card>
                </Col>
            </Row>

            <FacilityDrilldownDrawer drilldown={drilldown} onClose={() => setDrilldown(null)} />
        </div>
    );
}

function ActiveFilterChips({ chips, compact = false }: { chips: ActiveFilterChip[]; compact?: boolean }) {
    if (!chips.length) return null;

    return (
        <div
            className={
                compact
                    ? 'facility-cost-active-filters facility-cost-active-filters--compact'
                    : 'facility-cost-active-filters'
            }
        >
            {chips.map((chip) => (
                <Tag key={chip.key} color={chip.color ?? 'default'} className='facility-cost-filter-chip'>
                    {chip.label}
                </Tag>
            ))}
        </div>
    );
}

function CostCompositionPanel({
    summary,
    topPlant,
    topAsset,
    costByPlant,
    topAssets,
    onOpenDrilldown,
}: {
    summary?: FacilityCostSummary;
    topPlant?: FacilityCostByPlant;
    topAsset?: TopExternalRepairAsset;
    costByPlant: FacilityCostByPlant[];
    topAssets: TopExternalRepairAsset[];
    onOpenDrilldown: (payload: FacilityDrilldownPayload) => void;
}) {
    const mixData = [
        {
            name: 'Chi phí vật tư đã cấp phát',
            value: summary?.materialDistributionCost ?? 0,
            color: COST_COLORS.material,
        },
        { name: 'Chi phí sửa ngoài', value: summary?.externalRepairCost ?? 0, color: COST_COLORS.repair },
    ].filter((item) => item.value > 0);

    return (
        <Card
            className='facility-cost-section-card facility-cost-composition-card'
            title='Cơ cấu và tín hiệu'
            variant='outlined'
        >
            <div className='facility-cost-donut-frame'>
                {mixData.length ? (
                    <ResponsiveContainer width='100%' height='100%'>
                        <PieChart>
                            <Pie
                                data={mixData}
                                dataKey='value'
                                nameKey='name'
                                cx='50%'
                                cy='50%'
                                innerRadius={54}
                                outerRadius={86}
                                paddingAngle={2}
                            >
                                {mixData.map((item) => (
                                    <Cell key={item.name} fill={item.color} />
                                ))}
                            </Pie>
                            <ChartTooltip
                                formatter={(value, name) => [fmtCurrency(Number(value ?? 0)), String(name)]}
                            />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có dữ liệu chi phí trong kỳ' />
                )}
            </div>
            <div className='facility-cost-insight-list'>
                <button
                    type='button'
                    onClick={() =>
                        onOpenDrilldown({
                            kind: 'plant',
                            title: 'Chi phí vận hành theo cơ sở',
                            description: 'Các cơ sở tạo nên tổng chi phí vận hành.',
                            rows: costByPlant,
                        })
                    }
                >
                    <span>Cơ sở cao nhất</span>
                    <strong>
                        {topPlant ? `${topPlant.plantName}: ${fmtCurrency(topPlant.totalCost)}` : 'Chưa có dữ liệu'}
                    </strong>
                </button>
                <button
                    type='button'
                    onClick={() =>
                        onOpenDrilldown({
                            kind: 'asset',
                            title: 'Top máy phát sinh chi phí sửa ngoài',
                            description: 'Các máy có chi phí sửa ngoài cao nhất trong kỳ.',
                            rows: topAssets,
                        })
                    }
                >
                    <span>Máy nổi bật</span>
                    <strong>
                        {topAsset ? `${topAsset.assetName}: ${fmtCurrency(topAsset.totalCost)}` : 'Chưa có dữ liệu'}
                    </strong>
                </button>
                <div className='facility-cost-status-grid facility-cost-status-grid--compact'>
                    <StatusTile
                        icon={<BuildOutlined />}
                        label='Hoàn tất'
                        value={summary?.externalRepairCount ?? 0}
                        color='#52c41a'
                    />
                    <StatusTile
                        icon={<WarningOutlined />}
                        label='Chờ duyệt'
                        value={summary?.pendingApprovalCount ?? 0}
                        color='#faad14'
                    />
                    <StatusTile
                        icon={<ToolOutlined />}
                        label='Đang xử lý'
                        value={summary?.inProgressCount ?? 0}
                        color='#1677ff'
                    />
                    <StatusTile
                        icon={<ShopOutlined />}
                        label='Cấp phát VT'
                        value={summary?.distributionRecordCount ?? 0}
                        color='#722ed1'
                    />
                </div>
            </div>
        </Card>
    );
}

function MetricCard({
    title,
    value,
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
                {meta ? <Text className='facility-cost-metric-meta'>{meta}</Text> : null}
            </Card>
        </button>
    );
}

function CostTrendChart({ data }: { data: FacilityCostByPeriod[] }) {
    if (!data.length) {
        return (
            <div className='facility-cost-empty-chart'>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có dữ liệu trong kỳ đã chọn' />
            </div>
        );
    }

    return (
        <div className='facility-cost-chart-frame'>
            <ResponsiveContainer width='100%' height='100%'>
                <BarChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray='3 3' stroke='#eef2f7' />
                    <XAxis dataKey='period' tickFormatter={getPeriodLabel} tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 12 }} width={58} />
                    <ChartTooltip
                        labelFormatter={(label) => getPeriodLabel(String(label ?? ''))}
                        formatter={(value, name) => [fmtCurrency(Number(value ?? 0)), String(name ?? '')]}
                    />
                    <Legend />
                    <Bar
                        dataKey='materialDistributionCost'
                        name='Chi phí vật tư đã cấp phát'
                        stackId='cost'
                        fill={COST_COLORS.material}
                        radius={[0, 0, 0, 0]}
                    />
                    <Bar
                        dataKey='externalRepairCost'
                        name='Chi phí sửa ngoài'
                        stackId='cost'
                        fill={COST_COLORS.repair}
                        radius={[6, 6, 0, 0]}
                    >
                        {data.map((entry) => (
                            <Cell key={entry.period} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

function StatusTile({
    icon,
    label,
    value,
    color,
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
    color: string;
}) {
    return (
        <div className='facility-cost-status-tile'>
            <span className='facility-cost-status-icon' style={{ color, backgroundColor: `${color}14` }}>
                {icon}
            </span>
            <span className='facility-cost-status-content'>
                <Text type='secondary'>{label}</Text>
                <Text strong>{new Intl.NumberFormat('vi-VN').format(value)}</Text>
            </span>
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
    const plantColumns: ColumnsType<FacilityCostByPlant> = [
        { title: 'Cơ sở', dataIndex: 'plantName', ellipsis: true, render: (value) => <Text strong>{value}</Text> },
        {
            title: 'Vật tư đã cấp phát',
            dataIndex: 'materialDistributionCost',
            width: 170,
            align: 'right',
            render: fmtCurrency,
        },
        { title: 'Sửa ngoài', dataIndex: 'externalRepairCost', width: 150, align: 'right', render: fmtCurrency },
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
        <Drawer open={Boolean(drilldown)} onClose={onClose} title={drilldown?.title} size={720} destroyOnHidden>
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
    border: 1px solid #dbeafe;
    background:
        linear-gradient(135deg, rgba(19, 194, 194, 0.12), rgba(250, 140, 22, 0.08)),
        #ffffff;
    box-shadow: 0 16px 36px rgba(15, 23, 42, 0.06);
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
    color: #0f172a;
    line-height: 1.35;
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
