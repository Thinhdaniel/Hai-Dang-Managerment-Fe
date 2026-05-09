import React, { useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { App, Button, Card, Col, DatePicker, Row, Select, Spin, Statistic, Tabs, Tag, Typography } from 'antd';
import {
    BarChartOutlined,
    DollarOutlined,
    DownloadOutlined,
    InboxOutlined,
    ReloadOutlined,
    ShoppingCartOutlined,
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
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../components/shared/PageHeader';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess } from '../core/lib/permissions';
import { plantService } from '../core/services/plant.service';
import {
    materialReportService,
    type DistributionCostByPeriod,
    type DistributionCostByPlant,
    type MaterialCostByPeriodPoint,
    type PriceComparisonReportRow,
    type SupplierReportRow,
    type TopConsumedMaterial,
} from '../core/services/material.service';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const CHART_COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];

const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);

const fmtShort = (v: number) => {
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return String(v);
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    received: { label: 'Đã nhận', color: 'success' },
    ordered: { label: 'Đã đặt', color: 'processing' },
    confirmed: { label: 'Xác nhận', color: 'blue' },
    draft: { label: 'Nháp', color: 'default' },
    cancelled: { label: 'Huỷ', color: 'error' },
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MaterialReportPage() {
    const { message } = App.useApp();
    const { user } = useAuth();
    const isManager = hasManagerAccess(user?.role);

    const [plantId, setPlantId] = useState<string | undefined>();
    const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
        dayjs().subtract(5, 'month').startOf('month'),
        dayjs().endOf('month'),
    ]);
    const [exporting, setExporting] = useState(false);

    const params = {
        plantId,
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
    };

    // ── Queries ──────────────────────────────────────────────────────────────
    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        staleTime: 5 * 60_000,
    });

    const { data: summary, isLoading: loadingSummary, refetch: refetchSummary } = useQuery({
        queryKey: ['material-report-summary', params],
        queryFn: () => materialReportService.getSummary(params),
        staleTime: 60_000,
    });

    const { data: costTrend = [], isLoading: loadingCost, refetch: refetchCost } = useQuery({
        queryKey: ['material-report-cost', params],
        queryFn: () => materialReportService.getCostByPeriod({ ...params, period: 'month' }),
        staleTime: 60_000,
    });

    const { data: topMaterials = [], isLoading: loadingTop, refetch: refetchTop } = useQuery({
        queryKey: ['material-report-top', params],
        queryFn: () => materialReportService.getTopMaterials({ ...params, limit: 10 }),
        staleTime: 60_000,
    });

    const { data: supplierData = [], isLoading: loadingSupplier, refetch: refetchSupplier } = useQuery({
        queryKey: ['material-report-supplier', params],
        queryFn: () => materialReportService.getBySupplier(params),
        staleTime: 60_000,
    });

    const { data: priceComparison = [], isLoading: loadingPrice, refetch: refetchPrice } = useQuery({
        queryKey: ['material-report-price', params],
        queryFn: () => materialReportService.getPriceComparison(params),
        staleTime: 60_000,
    });

    const { data: distributionCost, isLoading: loadingDist, refetch: refetchDist } = useQuery({
        queryKey: ['material-report-dist', params],
        queryFn: () => materialReportService.getDistributionCost(params),
        staleTime: 60_000,
    });

    const isLoading = loadingSummary || loadingCost || loadingTop || loadingSupplier || loadingPrice || loadingDist;

    const handleRefresh = () => {
        refetchSummary(); refetchCost(); refetchTop(); refetchSupplier(); refetchPrice(); refetchDist();
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            await materialReportService.exportExcel(params);
            message.success('Xuất báo cáo Excel thành công');
        } catch {
            message.error('Không thể xuất báo cáo');
        } finally {
            setExporting(false);
        }
    };

    // ── Summary cards ────────────────────────────────────────────────────────
    const summaryCards = [
        {
            title: 'Tổng loại vật tư',
            value: summary?.totalMaterials ?? 0,
            icon: <InboxOutlined />,
            color: '#1890ff',
            suffix: 'loại',
        },
        {
            title: 'Chi phí trong kỳ',
            value: summary?.totalMonthlyCost ?? 0,
            icon: <DollarOutlined />,
            color: '#52c41a',
            formatter: (v: number) => fmtCurrency(v),
        },
        {
            title: 'Phiếu chờ duyệt',
            value: summary?.pendingRequestCount ?? 0,
            icon: <ShoppingCartOutlined />,
            color: '#faad14',
            suffix: 'phiếu',
        },
        {
            title: 'Vật tư dưới ngưỡng',
            value: summary?.lowStockCount ?? 0,
            icon: <WarningOutlined />,
            color: '#f5222d',
            suffix: 'loại',
        },
    ];

    return (
        <>
            <style>{PAGE_ANIM}</style>
            <PageHeader
                title="Báo Cáo Vật Tư"
                subtitle="Tổng hợp chi phí, tiêu thụ và hiệu quả mua sắm vật tư theo thời gian và cơ sở."
                actions={
                    <div className="flex gap-2">
                        <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={isLoading}>
                            Làm mới
                        </Button>
                        <Button
                            type="primary"
                            icon={<DownloadOutlined />}
                            onClick={handleExport}
                            loading={exporting}
                        >
                            Xuất Excel
                        </Button>
                    </div>
                }
            />

            {/* Filters */}
            <Card className="mr-filter-card">
                <div className="flex flex-wrap gap-3 items-center">
                    {isManager && (
                        <Select
                            placeholder="Tất cả cơ sở"
                            style={{ width: 200 }}
                            allowClear
                            value={plantId}
                            onChange={setPlantId}
                            options={plants.map((p) => ({ label: p.name, value: p.id }))}
                        />
                    )}
                    <RangePicker
                        value={dateRange}
                        onChange={(dates) => dates && setDateRange(dates as [Dayjs, Dayjs])}
                        format="DD/MM/YYYY"
                        allowClear={false}
                    />
                    <Text type="secondary" className="text-xs">
                        Kỳ: {dateRange[0].format('DD/MM/YYYY')} – {dateRange[1].format('DD/MM/YYYY')}
                    </Text>
                </div>
            </Card>

            {/* Summary cards */}
            <Row gutter={[16, 16]} className="mr-summary-row">
                {summaryCards.map((card) => (
                    <Col key={card.title} xs={24} sm={12} lg={6}>
                        <Card className="mr-stat-card" loading={loadingSummary}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <Text type="secondary" className="text-xs uppercase tracking-wide">
                                        {card.title}
                                    </Text>
                                    <div className="mt-1">
                                        <Statistic
                                            value={card.value}
                                            formatter={card.formatter ? (v) => card.formatter!(Number(v)) : undefined}
                                            suffix={card.suffix}
                                            valueStyle={{ color: card.color, fontSize: 24, fontWeight: 700 }}
                                        />
                                    </div>
                                </div>
                                <div
                                    className="flex items-center justify-center rounded-xl w-12 h-12"
                                    style={{ background: `${card.color}18` }}
                                >
                                    <span style={{ color: card.color, fontSize: 22 }}>{card.icon}</span>
                                </div>
                            </div>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* Charts & Tables */}
            <Card className="mr-tabs-card">
                <Tabs
                    defaultActiveKey="cost"
                    items={[
                        {
                            key: 'cost',
                            label: (
                                <span className="flex items-center gap-1">
                                    <BarChartOutlined /> Xu hướng chi phí
                                </span>
                            ),
                            children: <CostTrendTab data={costTrend} loading={loadingCost} />,
                        },
                        {
                            key: 'top',
                            label: 'Top vật tư tiêu thụ',
                            children: <TopMaterialsTab data={topMaterials} loading={loadingTop} />,
                        },
                        {
                            key: 'supplier',
                            label: 'Phân tích nhà cung cấp',
                            children: <SupplierTab data={supplierData} loading={loadingSupplier} />,
                        },
                        {
                            key: 'price',
                            label: 'So sánh giá',
                            children: <PriceComparisonTab data={priceComparison} loading={loadingPrice} />,
                        },
                        {
                            key: 'distribution',
                            label: 'Chi phí cấp phát',
                            children: <DistributionCostTab data={distributionCost} loading={loadingDist} />,
                        },
                    ]}
                />
            </Card>
        </>
    );
}


// ─── Tab: Cost Trend ─────────────────────────────────────────────────────────

function CostTrendTab({ data, loading }: { data: MaterialCostByPeriodPoint[]; loading: boolean }) {
    if (loading) return <ChartSkeleton />;
    if (!data.length) return <EmptyChart />;

    return (
        <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 24, left: 16, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 12 }} width={60} />
                    <Tooltip
                        formatter={(v: number) => [fmtCurrency(v), 'Chi phí']}
                        labelStyle={{ fontWeight: 600 }}
                    />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey="totalAmount"
                        name="Chi phí (₫)"
                        stroke="#1890ff"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─── Tab: Top Materials ───────────────────────────────────────────────────────

function TopMaterialsTab({ data, loading }: { data: TopConsumedMaterial[]; loading: boolean }) {
    if (loading) return <ChartSkeleton />;
    if (!data.length) return <EmptyChart />;

    return (
        <div className="flex flex-col gap-6">
            <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 8, right: 24, left: 16, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                            dataKey="materialName"
                            tick={{ fontSize: 11 }}
                            angle={-35}
                            textAnchor="end"
                            interval={0}
                        />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                            formatter={(v: number, _: string, entry: any) => [
                                `${v} ${entry.payload.unit || ''}`,
                                'Số lượng xuất',
                            ]}
                        />
                        <Bar dataKey="totalQuantityOut" name="SL xuất" radius={[4, 4, 0, 0]}>
                            {data.map((_, i) => (
                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="mr-table w-full text-sm">
                    <thead>
                        <tr>
                            <th className="w-10">STT</th>
                            <th>Mã VT</th>
                            <th>Tên vật tư</th>
                            <th>Nhóm</th>
                            <th>ĐVT</th>
                            <th className="text-right">SL xuất</th>
                            <th className="text-right">Tồn kho</th>
                            <th className="text-center">Trạng thái</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, i) => {
                            const isLow = (row.currentStock ?? 0) < (row.minStockLevel ?? 0);
                            return (
                                <tr key={i} className={isLow ? 'mr-row-warn' : ''}>
                                    <td className="text-center text-gray-400">{i + 1}</td>
                                    <td><code className="text-xs bg-gray-100 px-1 rounded">{row.materialCode || '—'}</code></td>
                                    <td className="font-medium">{row.materialName}</td>
                                    <td>{row.category || '—'}</td>
                                    <td>{row.unit}</td>
                                    <td className="text-right font-semibold">{row.totalQuantityOut?.toLocaleString()}</td>
                                    <td className="text-right">{row.currentStock?.toLocaleString() ?? '—'}</td>
                                    <td className="text-center">
                                        {isLow ? (
                                            <Tag color="error" icon={<WarningOutlined />}>Dưới ngưỡng</Tag>
                                        ) : (
                                            <Tag color="success">Đủ hàng</Tag>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Tab: Supplier Analysis ───────────────────────────────────────────────────

function SupplierTab({ data, loading }: { data: SupplierReportRow[]; loading: boolean }) {
    if (loading) return <ChartSkeleton />;
    if (!data.length) return <EmptyChart />;

    const totalAmount = data.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
    const top8 = data.slice(0, 8);

    return (
        <div className="flex flex-col gap-6">
            <Row gutter={[24, 16]}>
                <Col xs={24} md={10}>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={top8}
                                    dataKey="totalAmount"
                                    nameKey="supplierName"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={100}
                                    innerRadius={40}
                                    paddingAngle={2}
                                >
                                    {top8.map((_, i) => (
                                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                                <Legend
                                    formatter={(value) =>
                                        value.length > 18 ? value.slice(0, 18) + '…' : value
                                    }
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Col>
                <Col xs={24} md={14}>
                    <div className="overflow-x-auto max-h-72">
                        <table className="mr-table w-full text-sm">
                            <thead>
                                <tr>
                                    <th>Nhà cung cấp</th>
                                    <th className="text-right">Số đơn</th>
                                    <th className="text-right">Tổng tiền</th>
                                    <th className="text-right">Tỷ trọng</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((row, i) => (
                                    <tr key={i}>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                    style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                                                />
                                                {row.supplierName}
                                            </div>
                                        </td>
                                        <td className="text-right">{row.orderCount ?? 0}</td>
                                        <td className="text-right font-medium">{fmtCurrency(row.totalAmount ?? 0)}</td>
                                        <td className="text-right">
                                            <span className="text-gray-500">
                                                {totalAmount > 0
                                                    ? `${(((row.totalAmount ?? 0) / totalAmount) * 100).toFixed(1)}%`
                                                    : '—'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="font-semibold border-t-2 border-gray-300">
                                    <td>Tổng cộng</td>
                                    <td className="text-right">{data.reduce((s, r) => s + (r.orderCount ?? 0), 0)}</td>
                                    <td className="text-right">{fmtCurrency(totalAmount)}</td>
                                    <td className="text-right">100%</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Col>
            </Row>
        </div>
    );
}

// ─── Tab: Price Comparison ────────────────────────────────────────────────────

function PriceComparisonTab({ data, loading }: { data: PriceComparisonReportRow[]; loading: boolean }) {
    if (loading) return <ChartSkeleton />;
    if (!data.length) return <EmptyChart />;

    const totalEstimated = data.reduce((s, r) => s + (r.estimatedTotal ?? 0), 0);
    const totalActual = data.reduce((s, r) => s + (r.actualTotal ?? 0), 0);
    const totalDiff = totalActual - totalEstimated;

    return (
        <div className="flex flex-col gap-4">
            {/* Summary bar */}
            <Row gutter={16}>
                <Col xs={24} sm={8}>
                    <div className="mr-mini-stat">
                        <Text type="secondary" className="text-xs">Tổng dự tính</Text>
                        <div className="font-bold text-blue-600">{fmtCurrency(totalEstimated)}</div>
                    </div>
                </Col>
                <Col xs={24} sm={8}>
                    <div className="mr-mini-stat">
                        <Text type="secondary" className="text-xs">Tổng thực tế</Text>
                        <div className="font-bold text-green-600">{fmtCurrency(totalActual)}</div>
                    </div>
                </Col>
                <Col xs={24} sm={8}>
                    <div className="mr-mini-stat">
                        <Text type="secondary" className="text-xs">Chênh lệch</Text>
                        <div className={`font-bold ${totalDiff > 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {totalDiff > 0 ? '+' : ''}{fmtCurrency(totalDiff)}
                        </div>
                    </div>
                </Col>
            </Row>

            <div className="overflow-x-auto">
                <table className="mr-table w-full text-sm">
                    <thead>
                        <tr>
                            <th>Mã đơn hàng</th>
                            <th>Nhà cung cấp</th>
                            <th>Phiếu đề xuất</th>
                            <th className="text-right">Dự tính (₫)</th>
                            <th className="text-right">Thực tế (₫)</th>
                            <th className="text-right">Chênh lệch</th>
                            <th className="text-center">Trạng thái</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, i) => {
                            const diff = row.difference ?? 0;
                            const pct = row.estimatedTotal
                                ? ((diff / row.estimatedTotal) * 100).toFixed(1)
                                : '0';
                            const statusInfo = STATUS_LABEL[row.status ?? ''] ?? { label: row.status ?? '—', color: 'default' };
                            return (
                                <tr key={i}>
                                    <td>
                                        <code className="text-xs bg-gray-100 px-1 rounded">{row.orderCode || '—'}</code>
                                    </td>
                                    <td>{row.supplierName}</td>
                                    <td>
                                        <div className="flex flex-wrap gap-1">
                                            {(row.requestCodes ?? []).map((c) => (
                                                <Tag key={c} className="text-xs">{c}</Tag>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="text-right">{fmtCurrency(row.estimatedTotal ?? 0)}</td>
                                    <td className="text-right">{fmtCurrency(row.actualTotal ?? 0)}</td>
                                    <td className={`text-right font-semibold ${diff > 0 ? 'text-red-500' : diff < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                        {diff !== 0 ? `${diff > 0 ? '+' : ''}${fmtCurrency(diff)}` : '—'}
                                        {diff !== 0 && (
                                            <span className="ml-1 text-xs font-normal opacity-70">
                                                ({diff > 0 ? '+' : ''}{pct}%)
                                            </span>
                                        )}
                                    </td>
                                    <td className="text-center">
                                        <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Tab: Distribution Cost ───────────────────────────────────────────────────

function DistributionCostTab({
    data,
    loading,
}: {
    data: { byPlant: DistributionCostByPlant[]; byPeriod: DistributionCostByPeriod[] } | undefined;
    loading: boolean;
}) {
    if (loading) return <ChartSkeleton />;
    if (!data || (!data.byPlant.length && !data.byPeriod.length)) return <EmptyChart />;

    const totalWithVat = data.byPlant.reduce((s, r) => s + r.totalWithVat, 0);

    return (
        <div className="flex flex-col gap-6">
            {/* Trend chart */}
            {data.byPeriod.length > 0 && (
                <div className="h-64">
                    <div className="text-sm font-semibold text-gray-600 mb-2">Chi phí cấp phát theo tháng</div>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.byPeriod} margin={{ top: 4, right: 24, left: 16, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 12 }} width={60} />
                            <Tooltip formatter={(v: number) => [fmtCurrency(v), 'Chi phí (có VAT)']} />
                            <Bar dataKey="totalWithVat" name="Chi phí" fill="#722ed1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* By plant table */}
            <div>
                <div className="text-sm font-semibold text-gray-600 mb-2">Chi phí theo cơ sở nhận</div>
                <div className="overflow-x-auto">
                    <table className="mr-table w-full text-sm">
                        <thead>
                            <tr>
                                <th>Cơ sở nhận</th>
                                <th className="text-right">Số phiếu</th>
                                <th className="text-right">Tiền hàng (₫)</th>
                                <th className="text-right">Tổng có VAT (₫)</th>
                                <th className="text-right">Tỷ trọng</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.byPlant.map((row, i) => (
                                <tr key={i}>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                                            />
                                            {row.plantName}
                                        </div>
                                    </td>
                                    <td className="text-right">{row.count}</td>
                                    <td className="text-right">{fmtCurrency(row.totalAmount)}</td>
                                    <td className="text-right font-medium">{fmtCurrency(row.totalWithVat)}</td>
                                    <td className="text-right text-gray-500">
                                        {totalWithVat > 0
                                            ? `${((row.totalWithVat / totalWithVat) * 100).toFixed(1)}%`
                                            : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="font-semibold border-t-2 border-gray-300">
                                <td>Tổng cộng</td>
                                <td className="text-right">{data.byPlant.reduce((s, r) => s + r.count, 0)}</td>
                                <td className="text-right">{fmtCurrency(data.byPlant.reduce((s, r) => s + r.totalAmount, 0))}</td>
                                <td className="text-right">{fmtCurrency(totalWithVat)}</td>
                                <td className="text-right">100%</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function ChartSkeleton() {
    return (
        <div className="flex items-center justify-center h-64">
            <Spin size="large" />
        </div>
    );
}

function EmptyChart() {
    return (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <BarChartOutlined style={{ fontSize: 40 }} />
            <span>Không có dữ liệu trong kỳ đã chọn</span>
        </div>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PAGE_ANIM = `
.mr-filter-card .ant-card-body { padding: 16px 20px; }
.mr-stat-card { transition: box-shadow 0.2s; }
.mr-stat-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.10); }
.mr-stat-card .ant-card-body { padding: 20px; }
.mr-tabs-card .ant-card-body { padding: 20px; }
.mr-table { border-collapse: collapse; }
.mr-table th {
    background: #fafafa;
    padding: 10px 14px;
    text-align: left;
    font-weight: 600;
    font-size: 12px;
    color: #595959;
    border-bottom: 2px solid #f0f0f0;
    white-space: nowrap;
}
.mr-table td {
    padding: 10px 14px;
    border-bottom: 1px solid #f5f5f5;
    color: #262626;
}
.mr-table tbody tr:hover td { background: #fafafa; }
.mr-table tfoot td { padding: 10px 14px; }
.mr-row-warn td { background: rgba(255, 247, 230, 0.7) !important; }
.mr-mini-stat {
    background: #fafafa;
    border: 1px solid #f0f0f0;
    border-radius: 8px;
    padding: 12px 16px;
}
`;
