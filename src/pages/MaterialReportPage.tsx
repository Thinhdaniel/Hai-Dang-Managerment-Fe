import React, { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    App,
    Button,
    DatePicker,
    Empty,
    Select,
    Skeleton,
    Spin,
    Table,
    Tag,
    Typography,
    type TableColumnsType,
} from 'antd';
import {
    BarChartOutlined,
    ClockCircleOutlined,
    DownloadOutlined,
    RiseOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess } from '../core/lib/permissions';
import { plantService } from '../core/services';
import type {
    InventoryTransaction,
    InventoryTransactionQueryParams,
    MaterialCostByPeriodPoint,
    MaterialCostByPeriodQueryParams,
    MaterialReportSummary,
    PurchaseOrder,
    PurchaseOrderQueryParams,
} from '../core/services/material.service';
import { inventoryService, materialReportService, purchaseOrderService } from '../core/services/material.service';
import type { PaginatedResponse, Plant } from '../core/types';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const FETCH_LIMIT = 100;
const DEFAULT_DATE_RANGE: [Dayjs, Dayjs] = [dayjs().startOf('month'), dayjs().endOf('day')];

const PAGE_ANIM = `
@keyframes mrp-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.mrp-h{animation:mrp-up .28s cubic-bezier(.22,1,.36,1) .04s both}
.mrp-f{animation:mrp-up .30s cubic-bezier(.22,1,.36,1) .12s both}
.mrp-s{animation:mrp-up .30s cubic-bezier(.22,1,.36,1) .18s both}
.mrp-c{animation:mrp-up .32s cubic-bezier(.22,1,.36,1) .24s both}
.mrp-t{animation:mrp-up .34s cubic-bezier(.22,1,.36,1) .30s both}
.mrp-card{transition:transform 130ms cubic-bezier(.22,1,.36,1),box-shadow 130ms cubic-bezier(.22,1,.36,1)}
.mrp-card--clickable:hover{transform:translateY(-1px);box-shadow:0 16px 32px rgba(15,23,42,.08)}
@media(prefers-reduced-motion:reduce){.mrp-h,.mrp-f,.mrp-s,.mrp-c,.mrp-t{animation:none}.mrp-card{transition:none}}
`;

type DateRangeValue = [Dayjs, Dayjs];

type DraftReportFilters = {
    dateRange: DateRangeValue;
    plantId?: string;
};

type AppliedReportFilters = {
    startDate: string;
    endDate: string;
    plantId?: string;
};

type SummaryCardsData = {
    totalMaterials: number;
    totalCostInPeriod: number;
    pendingRequestCount: number;
    lowStockCount: number;
};

type ChartRow = {
    key: string;
    label: string;
    fullLabel: string;
    proposedCost: number;
    actualCost: number;
};

type TopConsumedRow = {
    materialId: string;
    materialName: string;
    materialCode?: string;
    unit?: string;
    totalQuantity: number;
    totalValue: number;
};

type SupplierCostRow = {
    supplierId?: string;
    supplierName: string;
    orderCount: number;
    totalAmount: number;
    percentage: number;
};

type MaterialPriceComparisonRow = {
    materialId: string;
    materialName: string;
    materialCode?: string;
    unit?: string;
    averageRequestedPrice: number;
    averageActualPrice: number;
    difference: number;
    differencePercent: number;
};

const createDraftFilters = (): DraftReportFilters => ({
    dateRange: DEFAULT_DATE_RANGE,
    plantId: undefined,
});

const buildAppliedFilters = (filters: DraftReportFilters): AppliedReportFilters => ({
    startDate: filters.dateRange[0].startOf('day').format('YYYY-MM-DD'),
    endDate: filters.dateRange[1].endOf('day').format('YYYY-MM-DD'),
    plantId: filters.plantId,
});

const normalizePositiveNumber = (value: number | undefined, fallback: number) => {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
        return fallback;
    }

    return value;
};

const normalizePaginatedResponse = <T,>(
    response: T[] | PaginatedResponse<T>,
    params: Pick<{ page?: number; limit?: number }, 'page' | 'limit'>
): PaginatedResponse<T> => {
    const page = normalizePositiveNumber(params.page, 1);
    const limit = normalizePositiveNumber(params.limit, FETCH_LIMIT);

    if (Array.isArray(response)) {
        const total = response.length;
        const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
        const safePage = Math.min(page, totalPages);
        const startIndex = (safePage - 1) * limit;

        return {
            data: response.slice(startIndex, startIndex + limit),
            total,
            page: safePage,
            limit,
            totalPages,
        };
    }

    return response;
};

const formatNumber = (value?: number) => (value ?? 0).toLocaleString('vi-VN');

const formatCurrency = (value?: number) =>
    new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
    }).format(value ?? 0);

const formatPercent = (value?: number) => `${(value ?? 0).toFixed(1)}%`;

const formatCompactCurrency = (value?: number) => {
    const amount = Math.abs(Number(value ?? 0));

    if (amount >= 1_000_000_000) {
        return `${(Number(value ?? 0) / 1_000_000_000).toFixed(amount >= 10_000_000_000 ? 0 : 1)}B`;
    }

    if (amount >= 1_000_000) {
        return `${(Number(value ?? 0) / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}M`;
    }

    if (amount >= 1_000) {
        return `${(Number(value ?? 0) / 1_000).toFixed(amount >= 10_000 ? 0 : 1)}K`;
    }

    return formatNumber(value);
};

const getOrderReportDate = (order: PurchaseOrder) => order.receivedAt || order.orderedAt || order.createdAt;

const getEstimatedOrderTotal = (order: PurchaseOrder) =>
    (order.requests ?? []).reduce((sum, request) => sum + Number(request.totalEstimated ?? 0), 0);

const getYearsInRange = (startDate: string, endDate: string) => {
    const startYear = dayjs(startDate).year();
    const endYear = dayjs(endDate).year();
    const years: number[] = [];

    for (let year = startYear; year <= endYear; year += 1) {
        years.push(year);
    }

    return years;
};

const formatChartLabel = (monthKey: string, multipleYears: boolean) => {
    const month = dayjs(`${monthKey}-01`);
    return multipleYears ? `T${month.month() + 1}/${String(month.year()).slice(-2)}` : `Th${month.month() + 1}`;
};

const buildMonthRange = (startDate: string, endDate: string) => {
    const rows: string[] = [];
    let cursor = dayjs(startDate).startOf('month');
    const end = dayjs(endDate).endOf('month');

    while (cursor.isBefore(end) || cursor.isSame(end, 'month')) {
        rows.push(cursor.format('YYYY-MM'));
        cursor = cursor.add(1, 'month');
    }

    return rows;
};

const fetchAllPurchaseOrders = async (params: Omit<PurchaseOrderQueryParams, 'page' | 'limit'>) => {
    const firstPageParams: PurchaseOrderQueryParams = {
        ...params,
        page: 1,
        limit: FETCH_LIMIT,
    };

    const firstResponse = normalizePaginatedResponse(
        await purchaseOrderService.getAll(firstPageParams),
        firstPageParams
    );

    const rows = [...firstResponse.data];

    for (let page = 2; page <= firstResponse.totalPages; page += 1) {
        const nextParams: PurchaseOrderQueryParams = {
            ...params,
            page,
            limit: FETCH_LIMIT,
        };
        const response = normalizePaginatedResponse(await purchaseOrderService.getAll(nextParams), nextParams);
        rows.push(...response.data);
    }

    return rows;
};

const fetchAllInventoryTransactions = async (params: Omit<InventoryTransactionQueryParams, 'page' | 'limit'>) => {
    const firstPageParams: InventoryTransactionQueryParams = {
        ...params,
        page: 1,
        limit: FETCH_LIMIT,
    };

    const firstResponse = normalizePaginatedResponse(
        await inventoryService.getTransactions(firstPageParams),
        firstPageParams
    );

    const rows = [...firstResponse.data];

    for (let page = 2; page <= firstResponse.totalPages; page += 1) {
        const nextParams: InventoryTransactionQueryParams = {
            ...params,
            page,
            limit: FETCH_LIMIT,
        };
        const response = normalizePaginatedResponse(await inventoryService.getTransactions(nextParams), nextParams);
        rows.push(...response.data);
    }

    return rows;
};

const fetchCostByPeriodDataset = async (params: AppliedReportFilters) => {
    const years = getYearsInRange(params.startDate, params.endDate);

    const responses = await Promise.all(
        years.map((year) =>
            materialReportService.getCostByPeriod({
                plantId: params.plantId,
                year,
                period: 'month',
            } satisfies MaterialCostByPeriodQueryParams)
        )
    );

    return responses.flat();
};

const buildCostChartRows = (
    costByPeriodRows: MaterialCostByPeriodPoint[],
    orders: PurchaseOrder[],
    filters: AppliedReportFilters
) => {
    const monthKeys = buildMonthRange(filters.startDate, filters.endDate);
    const multipleYears = new Set(monthKeys.map((monthKey) => monthKey.slice(0, 4))).size > 1;

    const actualMap = new Map<string, number>();
    costByPeriodRows.forEach((row) => {
        if (row.period && monthKeys.includes(row.period)) {
            actualMap.set(row.period, Number(row.totalAmount ?? 0));
        }
    });

    const estimatedMap = new Map<string, number>();
    const actualFallbackMap = new Map<string, number>();

    orders.forEach((order) => {
        const dateKey = dayjs(getOrderReportDate(order)).format('YYYY-MM');
        if (!monthKeys.includes(dateKey)) {
            return;
        }

        estimatedMap.set(dateKey, (estimatedMap.get(dateKey) ?? 0) + getEstimatedOrderTotal(order));
        actualFallbackMap.set(dateKey, (actualFallbackMap.get(dateKey) ?? 0) + Number(order.totalAmount ?? 0));
    });

    return monthKeys.map((monthKey) => ({
        key: monthKey,
        label: formatChartLabel(monthKey, multipleYears),
        fullLabel: dayjs(`${monthKey}-01`).format(multipleYears ? 'MM/YYYY' : 'MM/YYYY'),
        proposedCost: Number((estimatedMap.get(monthKey) ?? 0).toFixed(2)),
        actualCost: Number((actualMap.get(monthKey) ?? actualFallbackMap.get(monthKey) ?? 0).toFixed(2)),
    }));
};

const buildActualPriceMap = (orders: PurchaseOrder[]) => {
    const aggregate = new Map<
        string,
        { totalAmount: number; totalQuantity: number; materialName?: string; materialCode?: string; unit?: string }
    >();

    orders.forEach((order) => {
        order.items.forEach((item) => {
            const materialId = item.materialId;
            if (!materialId) {
                return;
            }

            const existing = aggregate.get(materialId) ?? {
                totalAmount: 0,
                totalQuantity: 0,
                materialName: item.material?.name || item.materialName,
                materialCode: item.material?.code,
                unit: item.unit || item.material?.unit,
            };

            const quantity = Number(item.quantity ?? 0);
            const unitPrice = Number(item.unitPrice ?? 0);

            existing.totalAmount += quantity * unitPrice;
            existing.totalQuantity += quantity;
            existing.materialName = existing.materialName || item.material?.name || item.materialName;
            existing.materialCode = existing.materialCode || item.material?.code;
            existing.unit = existing.unit || item.unit || item.material?.unit;

            aggregate.set(materialId, existing);
        });
    });

    return new Map(
        Array.from(aggregate.entries()).map(([materialId, value]) => [
            materialId,
            {
                averageUnitPrice:
                    value.totalQuantity > 0 ? Number((value.totalAmount / value.totalQuantity).toFixed(2)) : 0,
                materialName: value.materialName,
                materialCode: value.materialCode,
                unit: value.unit,
            },
        ])
    );
};

const buildTopConsumedRows = (transactions: InventoryTransaction[], orders: PurchaseOrder[]) => {
    const priceMap = buildActualPriceMap(orders);
    const grouped = new Map<
        string,
        { materialName: string; materialCode?: string; unit?: string; totalQuantity: number; totalValue: number }
    >();

    transactions.forEach((transaction) => {
        const materialId = transaction.materialId;
        if (!materialId) {
            return;
        }

        const quantity = Math.abs(Number(transaction.quantity ?? 0));
        const priceInfo = priceMap.get(materialId);
        const current = grouped.get(materialId) ?? {
            materialName: transaction.material?.name || 'Vật tư',
            materialCode: transaction.material?.code,
            unit: transaction.material?.unit,
            totalQuantity: 0,
            totalValue: 0,
        };

        current.totalQuantity += quantity;
        current.totalValue += quantity * Number(priceInfo?.averageUnitPrice ?? 0);
        current.materialName =
            current.materialName || priceInfo?.materialName || transaction.material?.name || 'Vật tư';
        current.materialCode = current.materialCode || priceInfo?.materialCode || transaction.material?.code;
        current.unit = current.unit || priceInfo?.unit || transaction.material?.unit;

        grouped.set(materialId, current);
    });

    return Array.from(grouped.entries())
        .map(([materialId, value]) => ({
            materialId,
            materialName: value.materialName,
            materialCode: value.materialCode,
            unit: value.unit,
            totalQuantity: Number(value.totalQuantity.toFixed(2)),
            totalValue: Number(value.totalValue.toFixed(2)),
        }))
        .sort((a, b) => b.totalQuantity - a.totalQuantity)
        .slice(0, 10);
};

const buildSupplierRows = (orders: PurchaseOrder[]) => {
    const grouped = new Map<string, SupplierCostRow>();
    const totalCost = orders.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0);

    orders.forEach((order) => {
        const supplierId = order.supplierId || order.supplier?.id;
        const supplierName = order.supplier?.name || order.supplierName || 'Chưa gán nhà cung cấp';
        const key = supplierId || supplierName;
        const current = grouped.get(key) ?? {
            supplierId,
            supplierName,
            orderCount: 0,
            totalAmount: 0,
            percentage: 0,
        };

        current.orderCount += 1;
        current.totalAmount += Number(order.totalAmount ?? 0);
        grouped.set(key, current);
    });

    return Array.from(grouped.values())
        .map((row) => ({
            ...row,
            totalAmount: Number(row.totalAmount.toFixed(2)),
            percentage: totalCost > 0 ? Number(((row.totalAmount / totalCost) * 100).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);
};

const buildPriceComparisonRows = (orders: PurchaseOrder[]) => {
    const grouped = new Map<
        string,
        {
            materialName: string;
            materialCode?: string;
            unit?: string;
            estimatedWeightedTotal: number;
            estimatedQuantity: number;
            actualWeightedTotal: number;
            actualQuantity: number;
        }
    >();

    orders.forEach((order) => {
        order.requests?.forEach((request) => {
            request.items.forEach((item) => {
                const materialId = item.materialId;
                if (!materialId || item.estimatedPrice == null) {
                    return;
                }

                const current = grouped.get(materialId) ?? {
                    materialName: item.material?.name || item.materialName || 'Vật tư',
                    materialCode: item.material?.code,
                    unit: item.unit || item.material?.unit,
                    estimatedWeightedTotal: 0,
                    estimatedQuantity: 0,
                    actualWeightedTotal: 0,
                    actualQuantity: 0,
                };

                const quantity = Number(item.quantityRequested ?? 0);
                const price = Number(item.estimatedPrice ?? 0);

                current.estimatedWeightedTotal += quantity * price;
                current.estimatedQuantity += quantity;
                current.materialName = current.materialName || item.material?.name || item.materialName || 'Vật tư';
                current.materialCode = current.materialCode || item.material?.code;
                current.unit = current.unit || item.unit || item.material?.unit;

                grouped.set(materialId, current);
            });
        });

        order.items.forEach((item) => {
            const materialId = item.materialId;
            if (!materialId || item.unitPrice == null) {
                return;
            }

            const current = grouped.get(materialId) ?? {
                materialName: item.material?.name || item.materialName || 'Vật tư',
                materialCode: item.material?.code,
                unit: item.unit || item.material?.unit,
                estimatedWeightedTotal: 0,
                estimatedQuantity: 0,
                actualWeightedTotal: 0,
                actualQuantity: 0,
            };

            const quantity = Number(item.quantity ?? 0);
            const price = Number(item.unitPrice ?? 0);

            current.actualWeightedTotal += quantity * price;
            current.actualQuantity += quantity;
            current.materialName = current.materialName || item.material?.name || item.materialName || 'Vật tư';
            current.materialCode = current.materialCode || item.material?.code;
            current.unit = current.unit || item.unit || item.material?.unit;

            grouped.set(materialId, current);
        });
    });

    return Array.from(grouped.entries())
        .map(([materialId, value]) => {
            const averageRequestedPrice =
                value.estimatedQuantity > 0 ? value.estimatedWeightedTotal / value.estimatedQuantity : 0;
            const averageActualPrice = value.actualQuantity > 0 ? value.actualWeightedTotal / value.actualQuantity : 0;
            const difference = averageActualPrice - averageRequestedPrice;
            const differencePercent = averageRequestedPrice > 0 ? (difference / averageRequestedPrice) * 100 : 0;

            return {
                materialId,
                materialName: value.materialName,
                materialCode: value.materialCode,
                unit: value.unit,
                averageRequestedPrice: Number(averageRequestedPrice.toFixed(2)),
                averageActualPrice: Number(averageActualPrice.toFixed(2)),
                difference: Number(difference.toFixed(2)),
                differencePercent: Number(differencePercent.toFixed(2)),
            };
        })
        .filter((row) => row.averageRequestedPrice > 0 && row.averageActualPrice > 0)
        .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
};

const escapeCsvCell = (value: string | number | undefined | null) => {
    const normalized = String(value ?? '');
    if (/[",\n]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`;
    }

    return normalized;
};

const downloadCsv = (filename: string, rows: Array<Array<string | number | undefined>>) => {
    const content = `\ufeff${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
};

const CostChartTooltip = ({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: Array<{ dataKey?: string; value?: number; color?: string }>;
    label?: string;
}) => {
    if (!active || !payload?.length) {
        return null;
    }

    return (
        <div className='rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg'>
            <div className='text-sm font-semibold text-slate-900'>{label}</div>
            <div className='mt-2 flex flex-col gap-1.5 text-sm'>
                {payload.map((item) => (
                    <div key={item.dataKey} className='flex items-center justify-between gap-6'>
                        <div className='flex items-center gap-2 text-slate-600'>
                            <span
                                className='inline-block h-2.5 w-2.5 rounded-full'
                                style={{ backgroundColor: item.color }}
                            />
                            <span>{item.dataKey === 'proposedCost' ? 'Giá đề xuất' : 'Giá thực tế'}</span>
                        </div>
                        <span className='font-semibold text-slate-900'>{formatCurrency(item.value)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const MaterialReportPage: React.FC = () => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { message } = App.useApp();
    const { role } = useAuth();
    const canViewReports = hasManagerAccess(role);

    const [draftFilters, setDraftFilters] = useState<DraftReportFilters>(() => createDraftFilters());
    const [appliedFilters, setAppliedFilters] = useState<AppliedReportFilters>(() =>
        buildAppliedFilters(createDraftFilters())
    );

    const reportParams = useMemo(
        () => ({
            plantId: appliedFilters.plantId,
            startDate: appliedFilters.startDate,
            endDate: appliedFilters.endDate,
        }),
        [appliedFilters.endDate, appliedFilters.plantId, appliedFilters.startDate]
    );

    const sharedOrdersQueryOptions = useMemo(
        () => ({
            queryKey: ['materials', 'reports', 'orders-dataset', reportParams],
            queryFn: () => fetchAllPurchaseOrders(reportParams),
            staleTime: 60_000,
        }),
        [reportParams]
    );

    const sharedCostByPeriodQueryOptions = useMemo(
        () => ({
            queryKey: ['materials', 'reports', 'cost-by-period-dataset', reportParams],
            queryFn: () => fetchCostByPeriodDataset(appliedFilters),
            staleTime: 60_000,
        }),
        [appliedFilters, reportParams]
    );

    const sharedExportTransactionsQueryOptions = useMemo(
        () => ({
            queryKey: ['materials', 'reports', 'export-transactions-dataset', reportParams],
            queryFn: () =>
                fetchAllInventoryTransactions({
                    ...reportParams,
                    type: 'export',
                }),
            staleTime: 60_000,
        }),
        [reportParams]
    );

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const summaryQuery = useQuery({
        queryKey: ['materials', 'reports', 'summary-cards', reportParams],
        queryFn: async (): Promise<SummaryCardsData> => {
            const [summary, orders] = await Promise.all([
                materialReportService.getSummary({ plantId: reportParams.plantId }),
                queryClient.fetchQuery(sharedOrdersQueryOptions),
            ]);

            return {
                totalMaterials: Number(summary.totalMaterials ?? 0),
                totalCostInPeriod: Number(
                    orders.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0).toFixed(2)
                ),
                pendingRequestCount: Number(summary.pendingRequestCount ?? summary.pendingPurchaseRequests ?? 0),
                lowStockCount: Number(summary.lowStockCount ?? 0),
            };
        },
        enabled: canViewReports,
        placeholderData: (previousData) => previousData,
    });

    const chartQuery = useQuery({
        queryKey: ['materials', 'reports', 'chart', reportParams],
        queryFn: async (): Promise<ChartRow[]> => {
            const [costByPeriodRows, orders] = await Promise.all([
                queryClient.fetchQuery(sharedCostByPeriodQueryOptions),
                queryClient.fetchQuery(sharedOrdersQueryOptions),
            ]);

            return buildCostChartRows(costByPeriodRows, orders, appliedFilters);
        },
        enabled: canViewReports,
        placeholderData: (previousData) => previousData,
    });

    const topConsumedQuery = useQuery({
        queryKey: ['materials', 'reports', 'top-consumed', reportParams],
        queryFn: async (): Promise<TopConsumedRow[]> => {
            const [transactions, orders] = await Promise.all([
                queryClient.fetchQuery(sharedExportTransactionsQueryOptions),
                queryClient.fetchQuery(sharedOrdersQueryOptions),
            ]);

            return buildTopConsumedRows(transactions, orders);
        },
        enabled: canViewReports,
        placeholderData: (previousData) => previousData,
    });

    const supplierCostQuery = useQuery({
        queryKey: ['materials', 'reports', 'by-supplier', reportParams],
        queryFn: async (): Promise<SupplierCostRow[]> => {
            const orders = await queryClient.fetchQuery(sharedOrdersQueryOptions);
            return buildSupplierRows(orders);
        },
        enabled: canViewReports,
        placeholderData: (previousData) => previousData,
    });

    const priceComparisonQuery = useQuery({
        queryKey: ['materials', 'reports', 'price-comparison', reportParams],
        queryFn: async (): Promise<MaterialPriceComparisonRow[]> => {
            const orders = await queryClient.fetchQuery(sharedOrdersQueryOptions);
            return buildPriceComparisonRows(orders);
        },
        enabled: canViewReports,
        placeholderData: (previousData) => previousData,
    });

    const selectedPlantLabel = useMemo(
        () => plants.find((plant) => plant.id === appliedFilters.plantId)?.name || 'Tất cả cơ sở',
        [appliedFilters.plantId, plants]
    );

    const chartRows = chartQuery.data ?? [];
    const topConsumedRows = topConsumedQuery.data ?? [];
    const supplierRows = supplierCostQuery.data ?? [];
    const priceComparisonRows = priceComparisonQuery.data ?? [];
    const summaryData = summaryQuery.data;

    const hasChartData = chartRows.some((row) => row.proposedCost > 0 || row.actualCost > 0);

    const handleApplyFilters = () => {
        setAppliedFilters(buildAppliedFilters(draftFilters));
    };

    const handleExport = () => {
        const rows: Array<Array<string | number | undefined>> = [
            ['Báo cáo vật tư'],
            ['Từ ngày', dayjs(appliedFilters.startDate).format('DD/MM/YYYY')],
            ['Đến ngày', dayjs(appliedFilters.endDate).format('DD/MM/YYYY')],
            ['Cơ sở', selectedPlantLabel],
            [],
            ['Top vật tư tiêu thụ nhiều nhất'],
            ['STT', 'Tên VT', 'Mã', 'ĐVT', 'Tổng SL xuất', 'Tổng giá trị'],
            ...topConsumedRows.map((row, index) => [
                index + 1,
                row.materialName,
                row.materialCode,
                row.unit,
                row.totalQuantity,
                row.totalValue,
            ]),
            [],
            ['Chi phí theo nhà cung cấp'],
            ['Tên NCC', 'Số đơn hàng', 'Tổng tiền', '% tổng chi phí'],
            ...supplierRows.map((row) => [row.supplierName, row.orderCount, row.totalAmount, row.percentage]),
            [],
            ['So sánh giá đề xuất vs thực tế'],
            ['Tên VT', 'Mã', 'Giá đề xuất TB', 'Giá thực tế TB', 'Chênh lệch', '% chênh'],
            ...priceComparisonRows.map((row) => [
                row.materialName,
                row.materialCode,
                row.averageRequestedPrice,
                row.averageActualPrice,
                row.difference,
                row.differencePercent,
            ]),
        ];

        downloadCsv(`material-report-${dayjs().format('YYYYMMDD-HHmm')}.csv`, rows);
        message.success('Xuất báo cáo CSV thành công');
    };

    const summaryCards = [
        {
            key: 'total-materials',
            label: 'Tổng loại vật tư đang quản lý',
            value: summaryData ? formatNumber(summaryData.totalMaterials) : '0',
            accent: 'text-slate-900',
            icon: <BarChartOutlined />,
        },
        {
            key: 'total-cost',
            label: 'Tổng chi phí trong kỳ',
            value: summaryData ? formatCurrency(summaryData.totalCostInPeriod) : formatCurrency(0),
            accent: 'text-blue-600',
            icon: <RiseOutlined />,
        },
        {
            key: 'pending-requests',
            label: 'Số phiếu đề xuất đang chờ duyệt',
            value: summaryData ? formatNumber(summaryData.pendingRequestCount) : '0',
            accent: 'text-amber-600',
            icon: <ClockCircleOutlined />,
            onClick: () => {
                const params = new URLSearchParams({ status: 'pending' });
                if (appliedFilters.plantId) {
                    params.set('plantId', appliedFilters.plantId);
                }
                navigate(`/materials/purchase-requests?${params.toString()}`);
            },
        },
        {
            key: 'low-stock',
            label: 'Số loại vật tư dưới ngưỡng tối thiểu',
            value: summaryData ? formatNumber(summaryData.lowStockCount) : '0',
            accent: 'text-rose-600',
            icon: <WarningOutlined />,
            onClick: () => {
                const params = new URLSearchParams({ lowStock: 'true' });
                if (appliedFilters.plantId) {
                    params.set('plantId', appliedFilters.plantId);
                }
                navigate(`/materials/inventory?${params.toString()}`);
            },
        },
    ];

    const topConsumedColumns: TableColumnsType<TopConsumedRow> = [
        {
            title: 'STT',
            key: 'index',
            width: 72,
            align: 'center',
            render: (_value, _record, index) => index + 1,
        },
        {
            title: 'TÊN VT',
            key: 'materialName',
            render: (_value, record) => (
                <div className='flex flex-col gap-0.5'>
                    <span className='font-semibold text-slate-800'>{record.materialName}</span>
                    <span className='text-xs text-slate-500'>{record.materialId}</span>
                </div>
            ),
        },
        {
            title: 'MÃ',
            dataIndex: 'materialCode',
            key: 'materialCode',
            width: 140,
            render: (value?: string) => value || '-',
        },
        {
            title: 'ĐVT',
            dataIndex: 'unit',
            key: 'unit',
            width: 100,
            render: (value?: string) => value || '-',
        },
        {
            title: 'TỔNG SL XUẤT',
            dataIndex: 'totalQuantity',
            key: 'totalQuantity',
            width: 140,
            align: 'right',
            render: (value?: number) => formatNumber(value),
        },
        {
            title: 'TỔNG GIÁ TRỊ',
            dataIndex: 'totalValue',
            key: 'totalValue',
            width: 160,
            align: 'right',
            render: (value?: number) => <span className='font-semibold text-slate-800'>{formatCurrency(value)}</span>,
        },
    ];

    const supplierColumns: TableColumnsType<SupplierCostRow> = [
        {
            title: 'TÊN NCC',
            dataIndex: 'supplierName',
            key: 'supplierName',
            render: (value: string, record) => (
                <div className='flex flex-col gap-0.5'>
                    <span className='font-semibold text-slate-800'>{value}</span>
                    <span className='text-xs text-slate-500'>{record.supplierId || 'Không có mã NCC'}</span>
                </div>
            ),
        },
        {
            title: 'SỐ ĐƠN HÀNG',
            dataIndex: 'orderCount',
            key: 'orderCount',
            width: 140,
            align: 'right',
            render: (value?: number) => formatNumber(value),
        },
        {
            title: 'TỔNG TIỀN',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            width: 180,
            align: 'right',
            render: (value?: number) => <span className='font-semibold text-slate-800'>{formatCurrency(value)}</span>,
        },
        {
            title: '% TỔNG CHI PHÍ',
            dataIndex: 'percentage',
            key: 'percentage',
            width: 150,
            align: 'right',
            render: (value?: number) => formatPercent(value),
        },
    ];

    const priceComparisonColumns: TableColumnsType<MaterialPriceComparisonRow> = [
        {
            title: 'TÊN VT',
            key: 'materialName',
            render: (_value, record) => (
                <div className='flex flex-col gap-0.5'>
                    <span className='font-semibold text-slate-800'>{record.materialName}</span>
                    <span className='text-xs text-slate-500'>{record.unit || '-'}</span>
                </div>
            ),
        },
        {
            title: 'MÃ',
            dataIndex: 'materialCode',
            key: 'materialCode',
            width: 140,
            render: (value?: string) => value || '-',
        },
        {
            title: 'GIÁ ĐỀ XUẤT TB',
            dataIndex: 'averageRequestedPrice',
            key: 'averageRequestedPrice',
            width: 170,
            align: 'right',
            render: (value?: number) => formatCurrency(value),
        },
        {
            title: 'GIÁ THỰC TẾ TB',
            dataIndex: 'averageActualPrice',
            key: 'averageActualPrice',
            width: 170,
            align: 'right',
            render: (value?: number) => formatCurrency(value),
        },
        {
            title: 'CHÊNH LỆCH',
            dataIndex: 'difference',
            key: 'difference',
            width: 150,
            align: 'right',
            render: (value?: number) => (
                <span className={(value ?? 0) > 0 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-600'}>
                    {formatCurrency(value)}
                </span>
            ),
        },
        {
            title: '% CHÊNH',
            dataIndex: 'differencePercent',
            key: 'differencePercent',
            width: 130,
            align: 'right',
            render: (value?: number) => (
                <Tag color={(value ?? 0) > 0 ? 'error' : 'success'}>{formatPercent(value)}</Tag>
            ),
        },
    ];

    if (!canViewReports) {
        return (
            <div className='flex flex-col gap-6'>
                <style>{PAGE_ANIM}</style>
                <div className='mrp-h'>
                    <PageHeader
                        title='Báo cáo vật tư'
                        subtitle='Tổng hợp chi phí, tiêu thụ và hiệu quả mua sắm vật tư theo thời gian và cơ sở.'
                    />
                </div>
                <div className='rounded-xl border border-slate-200 bg-white px-6 py-10'>
                    <Empty description='Trang báo cáo vật tư chỉ dành cho tài khoản quản lý.' />
                </div>
            </div>
        );
    }

    return (
        <div className='flex flex-col gap-6'>
            <style>{PAGE_ANIM}</style>

            <div className='mrp-h'>
                <PageHeader
                    title='Báo cáo vật tư'
                    subtitle='Theo dõi tổng chi phí, mức tiêu thụ và chênh lệch giá mua vật tư theo kỳ báo cáo.'
                    actions={
                        <Button
                            icon={<DownloadOutlined />}
                            onClick={handleExport}
                            className='rounded-lg border-slate-200'
                        >
                            Xuất Excel
                        </Button>
                    }
                />
            </div>

            <div className='mrp-f rounded-xl border border-slate-200 bg-white shadow-sm'>
                <div className='flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between'>
                    <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
                        <RangePicker
                            className='min-w-[280px]'
                            format='DD/MM/YYYY'
                            allowClear={false}
                            value={draftFilters.dateRange}
                            onChange={(value) => {
                                if (!value || !value[0] || !value[1]) {
                                    return;
                                }

                                const nextRange: DateRangeValue = [value[0], value[1]];

                                setDraftFilters((current) => ({
                                    ...current,
                                    dateRange: nextRange,
                                }));
                            }}
                        />

                        <Select
                            showSearch
                            allowClear
                            placeholder='Cơ sở'
                            className='min-w-[220px]'
                            value={draftFilters.plantId}
                            onChange={(value) =>
                                setDraftFilters((current) => ({
                                    ...current,
                                    plantId: value,
                                }))
                            }
                            options={plants.map((plant: Plant) => ({
                                value: plant.id,
                                label: plant.name,
                            }))}
                            optionFilterProp='label'
                        />
                    </div>

                    <Button
                        type='primary'
                        onClick={handleApplyFilters}
                        className='rounded-lg bg-blue-600 hover:!bg-blue-700'
                    >
                        Áp dụng
                    </Button>
                </div>
            </div>

            <div className='mrp-s grid grid-cols-1 gap-4 xl:grid-cols-4'>
                {summaryQuery.isLoading && !summaryQuery.data
                    ? Array.from({ length: 4 }).map((_, index) => (
                          <div key={index} className='rounded-xl border border-slate-200 bg-white p-5 shadow-sm'>
                              <Skeleton active title={false} paragraph={{ rows: 2 }} />
                          </div>
                      ))
                    : summaryCards.map((card) =>
                          card.onClick ? (
                              <button
                                  key={card.key}
                                  type='button'
                                  onClick={card.onClick}
                                  className='mrp-card mrp-card--clickable rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm'
                              >
                                  <div className='flex items-start justify-between gap-4'>
                                      <div>
                                          <div className='text-[11px] font-medium tracking-[0.08em] text-slate-400 uppercase'>
                                              {card.label}
                                          </div>
                                          <div className={`mt-2 text-xl font-bold ${card.accent}`}>{card.value}</div>
                                      </div>
                                      <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600'>
                                          {card.icon}
                                      </div>
                                  </div>
                              </button>
                          ) : (
                              <div
                                  key={card.key}
                                  className='mrp-card rounded-xl border border-slate-200 bg-white p-5 shadow-sm'
                              >
                                  <div className='flex items-start justify-between gap-4'>
                                      <div>
                                          <div className='text-[11px] font-medium tracking-[0.08em] text-slate-400 uppercase'>
                                              {card.label}
                                          </div>
                                          <div className={`mt-2 text-xl font-bold ${card.accent}`}>{card.value}</div>
                                      </div>
                                      <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600'>
                                          {card.icon}
                                      </div>
                                  </div>
                              </div>
                          )
                      )}
            </div>

            <div className='mrp-c rounded-xl border border-slate-200 bg-white shadow-sm'>
                <div className='border-b border-slate-100 px-5 py-4'>
                    <div className='text-sm font-semibold text-slate-900'>Chi phí theo tháng</div>
                    <div className='text-xs text-slate-500'>
                        So sánh tổng giá đề xuất và tổng giá thực tế theo kỳ báo cáo đang áp dụng.
                    </div>
                </div>

                <div className='h-[360px] px-3 py-4 sm:px-5'>
                    {chartQuery.isLoading && !chartQuery.data ? (
                        <div className='flex h-full items-center justify-center'>
                            <Spin />
                        </div>
                    ) : hasChartData ? (
                        <ResponsiveContainer width='100%' height='100%'>
                            <BarChart data={chartRows} margin={{ top: 16, right: 16, left: 4, bottom: 0 }}>
                                <CartesianGrid strokeDasharray='3 3' vertical={false} stroke='#e2e8f0' />
                                <XAxis
                                    dataKey='label'
                                    tick={{ fill: '#64748b', fontSize: 12 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fill: '#64748b', fontSize: 12 }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={formatCompactCurrency}
                                />
                                <RechartsTooltip content={<CostChartTooltip />} />
                                <Legend />
                                <Bar dataKey='proposedCost' name='Giá đề xuất' fill='#93c5fd' radius={[8, 8, 0, 0]} />
                                <Bar dataKey='actualCost' name='Giá thực tế' fill='#2563eb' radius={[8, 8, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className='flex h-full items-center justify-center'>
                            <Empty description='Không có dữ liệu trong kỳ này' />
                        </div>
                    )}
                </div>
            </div>

            <div className='mrp-t grid grid-cols-1 gap-6'>
                <div className='overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                    <div className='border-b border-slate-100 px-5 py-4'>
                        <div className='text-sm font-semibold text-slate-900'>Top vật tư tiêu thụ nhiều nhất</div>
                        <div className='text-xs text-slate-500'>
                            Top 10 vật tư có tổng khối lượng xuất kho lớn nhất trong kỳ.
                        </div>
                    </div>

                    <div className='[&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-slate-50/80 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400'>
                        <Table<TopConsumedRow>
                            rowKey='materialId'
                            columns={topConsumedColumns}
                            dataSource={topConsumedRows}
                            loading={topConsumedQuery.isLoading || topConsumedQuery.isFetching}
                            pagination={false}
                            size='small'
                            scroll={{ x: 960 }}
                        />
                    </div>
                </div>

                <div className='overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                    <div className='border-b border-slate-100 px-5 py-4'>
                        <div className='text-sm font-semibold text-slate-900'>Chi phí theo nhà cung cấp</div>
                        <div className='text-xs text-slate-500'>
                            Phân bổ tổng chi phí mua vật tư theo từng nhà cung cấp trong kỳ.
                        </div>
                    </div>

                    <div className='[&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-slate-50/80 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400'>
                        <Table<SupplierCostRow>
                            rowKey={(record) => record.supplierId || record.supplierName}
                            columns={supplierColumns}
                            dataSource={supplierRows}
                            loading={supplierCostQuery.isLoading || supplierCostQuery.isFetching}
                            pagination={false}
                            size='small'
                            scroll={{ x: 900 }}
                        />
                    </div>
                </div>

                <div className='overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                    <div className='border-b border-slate-100 px-5 py-4'>
                        <div className='text-sm font-semibold text-slate-900'>So sánh giá đề xuất vs thực tế</div>
                        <div className='text-xs text-slate-500'>
                            Chỉ hiển thị vật tư có đủ cả giá đề xuất trung bình và giá thực tế trung bình.
                        </div>
                    </div>

                    <div className='[&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-slate-50/80 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400'>
                        <Table<MaterialPriceComparisonRow>
                            rowKey='materialId'
                            columns={priceComparisonColumns}
                            dataSource={priceComparisonRows}
                            loading={priceComparisonQuery.isLoading || priceComparisonQuery.isFetching}
                            pagination={false}
                            size='small'
                            scroll={{ x: 1080 }}
                        />
                    </div>
                </div>
            </div>

            <div className='rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500'>
                <Text className='text-xs text-slate-500'>
                    Phạm vi báo cáo: {dayjs(appliedFilters.startDate).format('DD/MM/YYYY')} -{' '}
                    {dayjs(appliedFilters.endDate).format('DD/MM/YYYY')} · {selectedPlantLabel}
                </Text>
            </div>
        </div>
    );
};

export default MaterialReportPage;
