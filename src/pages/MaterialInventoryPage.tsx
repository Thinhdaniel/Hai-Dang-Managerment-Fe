import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    Button,
    DatePicker,
    Drawer,
    Dropdown,
    Empty,
    Input,
    Modal,
    Form,
    InputNumber,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    App,
    type TableColumnsType,
    type MenuProps,
} from 'antd';
import {
    DownloadOutlined,
    EditOutlined,
    HistoryOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    UploadOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import { useAuth } from '../core/contexts/AuthContext';
import { normalizeSearchTerm } from '../core/lib/search';
import { hasManagerAccess } from '../core/lib/permissions';
import { plantService } from '../core/services';
import {
    inventoryService,
    materialReportService,
    materialService,
    type InventoryTransaction,
    type InventoryTransactionQueryParams,
    type InventoryTransactionType,
    type Material,
    type MaterialInventory,
} from '../core/services/material.service';
import type { PaginatedResponse, Plant, User } from '../core/types';
import ModalInitStock from '../components/ModalInitStock';
import ModalImportExcel from '../components/ModalImportExcel';
import ModalExportHistory from '../components/ModalExportHistory';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const DEFAULT_HISTORY_PAGE = 1;
const DEFAULT_HISTORY_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;
const LOW_STOCK_VIEW_LIMIT = 200;
const CATEGORY_FALLBACKS = ['Kim chỉ', 'Phụ liệu', 'Dầu nhớt', 'Văn phòng phẩm'];

const PAGE_ANIM = `
@keyframes mi-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.mi-h{animation:mi-up .28s cubic-bezier(.22,1,.36,1) .04s both}
.mi-s{animation:mi-up .30s cubic-bezier(.22,1,.36,1) .12s both}
.mi-f{animation:mi-up .30s cubic-bezier(.22,1,.36,1) .18s both}
.mi-t{animation:mi-up .32s cubic-bezier(.22,1,.36,1) .24s both}
.mi-stat{transition:background-color 130ms cubic-bezier(.22,1,.36,1)}
.mi-stat:hover{background-color:oklch(0.975 0.005 250)}
.mi-low-stock-row td{background:rgba(255,247,237,.86)!important}
@media(prefers-reduced-motion:reduce){.mi-h,.mi-s,.mi-f,.mi-t{animation:none}.mi-stat{transition:none}}
`;

type InventoryFilterState = {
    search: string;
    category?: string;
    plantId?: string;
};

type SelectedInventoryItem = {
    materialId: string;
    materialName: string;
    materialCode?: string;
    plantId: string;
    plantName: string;
};

type DateRangeValue = [Dayjs, Dayjs];

const createDefaultFilters = (): InventoryFilterState => ({
    search: '',
    category: undefined,
    plantId: undefined,
});

const createDefaultHistoryRange = (): DateRangeValue => [
    dayjs().subtract(29, 'day').startOf('day'),
    dayjs().endOf('day'),
];

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
    const page = normalizePositiveNumber(params.page, DEFAULT_PAGE);
    const limit = normalizePositiveNumber(params.limit, DEFAULT_LIMIT);

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
const formatDateTime = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-');

const resolvePerformerLabel = (performedBy?: string | User) => {
    if (!performedBy) {
        return '-';
    }

    if (typeof performedBy === 'string') {
        return performedBy;
    }

    return performedBy.name || performedBy.email || performedBy.id;
};

const resolveTransactionType = (type?: string) => {
    switch (type) {
        case 'import':
            return {
                color: 'processing' as const,
                label: 'Nhập kho',
            };
        case 'export':
            return {
                color: 'error' as const,
                label: 'Xuất kho',
            };
        case 'adjust':
        case 'adjustment':
            return {
                color: 'warning' as const,
                label: 'Điều chỉnh',
            };
        default:
            return {
                color: 'default' as const,
                label: type || 'Không xác định',
            };
    }
};

const resolveRelatedTypeLabel = (relatedType?: string) => {
    switch (relatedType) {
        case 'purchase_order':
            return 'Đơn hàng';
        case 'distribution':
            return 'Cấp phát';
        case 'manual':
            return 'Thủ công';
        default:
            return '-';
    }
};

const formatTransactionQuantity = (record: InventoryTransaction) => {
    const quantity = Number(record.quantity ?? 0);
    const type = record.type as InventoryTransactionType;
    const normalizedQuantity = type === 'export' && quantity > 0 ? -quantity : quantity;
    const sign = normalizedQuantity > 0 ? '+' : '';

    return `${sign}${formatNumber(normalizedQuantity)}`;
};

const getTransactionQuantityClassName = (record: InventoryTransaction) => {
    switch (record.type) {
        case 'import':
            return 'font-semibold text-blue-600';
        case 'export':
            return 'font-semibold text-rose-600';
        case 'adjust':
        case 'adjustment':
            return 'font-semibold text-amber-600';
        default:
            return 'font-semibold text-slate-700';
    }
};

const fetchTransactionQuantityTotal = async (params: InventoryTransactionQueryParams) => {
    const firstResponse = normalizePaginatedResponse(
        await inventoryService.getTransactions({
            ...params,
            page: 1,
            limit: 100,
        }),
        { page: 1, limit: 100 }
    );

    let totalQuantity = firstResponse.data.reduce(
        (sum, transaction) => sum + Math.abs(Number(transaction.quantity ?? 0)),
        0
    );

    for (let page = 2; page <= firstResponse.totalPages; page += 1) {
        const response = normalizePaginatedResponse(
            await inventoryService.getTransactions({
                ...params,
                page,
                limit: 100,
            }),
            { page, limit: 100 }
        );

        totalQuantity += response.data.reduce(
            (sum, transaction) => sum + Math.abs(Number(transaction.quantity ?? 0)),
            0
        );
    }

    return totalQuantity;
};

const MaterialInventoryPage: React.FC = () => {
    const { role, user } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message, notification } = App.useApp();
    const [searchParams] = useSearchParams();
    const canViewSummary = hasManagerAccess(role);
    const mainPlantId = import.meta.env.VITE_MAIN_PLANT_ID;
    const isMainPlant = Boolean(mainPlantId && user?.plantId === mainPlantId);
    const canEditStock = role === 'admin' && isMainPlant;

    const lowStockOnly = searchParams.get('lowStock') === 'true';
    const queryPlantId = searchParams.get('plantId')?.trim() || undefined;

    const [filters, setFilters] = useState<InventoryFilterState>(() => ({
        ...createDefaultFilters(),
        plantId: queryPlantId,
    }));
    const [draftFilters, setDraftFilters] = useState<InventoryFilterState>(() => ({
        ...createDefaultFilters(),
        plantId: queryPlantId,
    }));
    const [pagination, setPagination] = useState({
        page: DEFAULT_PAGE,
        limit: lowStockOnly ? LOW_STOCK_VIEW_LIMIT : DEFAULT_LIMIT,
    });
    const [selectedInventoryItem, setSelectedInventoryItem] = useState<SelectedInventoryItem | null>(null);
    const [historyRange, setHistoryRange] = useState<DateRangeValue>(() => createDefaultHistoryRange());
    const [historyPagination, setHistoryPagination] = useState({
        page: DEFAULT_HISTORY_PAGE,
        limit: DEFAULT_HISTORY_LIMIT,
    });
    const [editingStockItem, setEditingStockItem] = useState<MaterialInventory | null>(null);
    const [newStock, setNewStock] = useState<number | null>(null);
    const [adjustReason, setAdjustReason] = useState<string>('');

    const [initStockOpen, setInitStockOpen] = useState(false);
    const [importExcelOpen, setImportExcelOpen] = useState(false);
    const [exportHistoryOpen, setExportHistoryOpen] = useState(false);

    const { mutateAsync: adjustStock, isPending: isAdjustingStock } = useMutation({
        mutationFn: inventoryService.overrideStock,
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['materials', 'inventory'] });
            notification.success({
                message: 'Đã điều chỉnh tồn kho thành công',
                description: `${editingStockItem?.material?.name} tại ${editingStockItem?.plant?.name}: ${editingStockItem?.currentStock} → ${variables.newStock}`,
            });
            setEditingStockItem(null);
            setNewStock(null);
            setAdjustReason('');
        },
        onError: (error: any) => {
            message.error(error?.message || 'Không thể điều chỉnh tồn kho');
        },
    });

    const listParams = useMemo(
        () => ({
            ...filters,
            page: pagination.page,
            limit: lowStockOnly ? LOW_STOCK_VIEW_LIMIT : pagination.limit,
        }),
        [filters, lowStockOnly, pagination.limit, pagination.page]
    );

    const summaryParams = useMemo(
        () => (filters.plantId ? { plantId: filters.plantId } : undefined),
        [filters.plantId]
    );

    const historyDateParams = useMemo(
        () => ({
            startDate: historyRange[0].startOf('day').format('YYYY-MM-DD'),
            endDate: historyRange[1].endOf('day').format('YYYY-MM-DD'),
        }),
        [historyRange]
    );

    const monthlyDateParams = useMemo(
        () => ({
            startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
            endDate: dayjs().endOf('month').format('YYYY-MM-DD'),
        }),
        []
    );

    const historyQueryParams = useMemo(
        () =>
            selectedInventoryItem
                ? {
                      materialId: selectedInventoryItem.materialId,
                      plantId: selectedInventoryItem.plantId,
                      startDate: historyDateParams.startDate,
                      endDate: historyDateParams.endDate,
                      page: historyPagination.page,
                      limit: historyPagination.limit,
                  }
                : undefined,
        [
            historyDateParams.endDate,
            historyDateParams.startDate,
            historyPagination.limit,
            historyPagination.page,
            selectedInventoryItem,
        ]
    );

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            const normalizedSearch = normalizeSearchTerm(draftFilters.search);

            setPagination((current) => (current.page === DEFAULT_PAGE ? current : { ...current, page: DEFAULT_PAGE }));
            setFilters((current) =>
                current.search === normalizedSearch
                    ? current
                    : {
                          ...current,
                          search: normalizedSearch,
                      }
            );
        }, SEARCH_DEBOUNCE_MS);

        return () => window.clearTimeout(timeoutId);
    }, [draftFilters.search]);

    useEffect(() => {
        if (!searchParams.has('lowStock') && !searchParams.has('plantId')) {
            return;
        }

        setPagination({
            page: DEFAULT_PAGE,
            limit: lowStockOnly ? LOW_STOCK_VIEW_LIMIT : DEFAULT_LIMIT,
        });
        setFilters((current) => ({
            ...current,
            plantId: queryPlantId,
        }));
        setDraftFilters((current) => ({
            ...current,
            plantId: queryPlantId,
        }));
    }, [lowStockOnly, queryPlantId, searchParams]);

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const { data: materialCatalogResponse } = useQuery({
        queryKey: ['materials', 'catalog-options'],
        queryFn: async () =>
            normalizePaginatedResponse(await materialService.getAll({ page: 1, limit: 500 }), {
                page: 1,
                limit: 500,
            }),
        placeholderData: (previousData) => previousData,
    });

    const {
        data: inventoryResponse,
        isLoading,
        isFetching,
    } = useQuery({
        queryKey: ['materials', 'inventory', listParams],
        queryFn: async () => normalizePaginatedResponse(await inventoryService.getAll(listParams), listParams),
        placeholderData: (previousData) => previousData,
    });

    const { data: summary } = useQuery({
        queryKey: ['materials', 'inventory', 'summary', summaryParams],
        queryFn: () => materialReportService.getSummary(summaryParams),
        enabled: canViewSummary,
    });

    const { data: lowStockMaterials = [] } = useQuery({
        queryKey: ['materials', 'inventory', 'low-stock', summaryParams],
        queryFn: () => materialService.getLowStock(summaryParams),
    });

    const { data: importedThisMonth = 0 } = useQuery({
        queryKey: ['materials', 'inventory', 'monthly-import', summaryParams, monthlyDateParams],
        queryFn: () =>
            fetchTransactionQuantityTotal({
                ...summaryParams,
                ...monthlyDateParams,
                type: 'import',
            }),
    });

    const { data: exportedThisMonth = 0 } = useQuery({
        queryKey: ['materials', 'inventory', 'monthly-export', summaryParams, monthlyDateParams],
        queryFn: () =>
            fetchTransactionQuantityTotal({
                ...summaryParams,
                ...monthlyDateParams,
                type: 'export',
            }),
    });

    const {
        data: historyResponse,
        isLoading: isHistoryLoading,
        isFetching: isHistoryFetching,
    } = useQuery({
        queryKey: ['materials', 'inventory', 'transactions', historyQueryParams],
        queryFn: async () =>
            normalizePaginatedResponse(
                await inventoryService.getTransactions(historyQueryParams as InventoryTransactionQueryParams),
                historyQueryParams as InventoryTransactionQueryParams
            ),
        enabled: Boolean(historyQueryParams),
        placeholderData: (previousData) => previousData,
    });

    const inventoryRows = useMemo(() => inventoryResponse?.data ?? [], [inventoryResponse?.data]);
    const displayedInventoryRows = useMemo(
        () =>
            lowStockOnly
                ? inventoryRows.filter((record) => record.currentStock < (record.minStockLevel ?? 0))
                : inventoryRows,
        [inventoryRows, lowStockOnly]
    );
    const currentPage = lowStockOnly ? 1 : (inventoryResponse?.page ?? pagination.page);
    const pageSize = lowStockOnly ? LOW_STOCK_VIEW_LIMIT : (inventoryResponse?.limit ?? pagination.limit);
    const totalItems = lowStockOnly ? displayedInventoryRows.length : (inventoryResponse?.total ?? 0);
    const totalPages = Math.max(inventoryResponse?.totalPages ?? Math.ceil(totalItems / Math.max(pageSize, 1)), 1);
    const pageStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const pageEnd = Math.min(currentPage * pageSize, totalItems);
    const catalogMaterials = useMemo(() => materialCatalogResponse?.data ?? [], [materialCatalogResponse?.data]);
    const historyRows = useMemo(() => historyResponse?.data ?? [], [historyResponse?.data]);

    const categoryOptions = useMemo(() => {
        const values = new Set<string>(CATEGORY_FALLBACKS);

        catalogMaterials.forEach((material: Material) => {
            if (material.category?.trim()) {
                values.add(material.category);
            }
        });

        inventoryRows.forEach((item) => {
            if (item.material?.category?.trim()) {
                values.add(item.material.category);
            }
        });

        return Array.from(values).map((value) => ({
            value,
            label: value,
        }));
    }, [catalogMaterials, inventoryRows]);

    const stats = useMemo(
        () => ({
            totalMaterials: filters.plantId
                ? (inventoryResponse?.total ?? summary?.totalMaterials ?? materialCatalogResponse?.total ?? 0)
                : (summary?.totalMaterials ?? materialCatalogResponse?.total ?? inventoryResponse?.total ?? 0),
            lowStockCount: summary?.lowStockCount ?? lowStockMaterials.length,
            importedThisMonth,
            exportedThisMonth,
        }),
        [
            exportedThisMonth,
            filters.plantId,
            importedThisMonth,
            inventoryResponse?.total,
            lowStockMaterials.length,
            materialCatalogResponse?.total,
            summary?.lowStockCount,
            summary?.totalMaterials,
        ]
    );

    const handlePlantChange = (value?: string) => {
        setDraftFilters((current) => ({ ...current, plantId: value }));
        setPagination((current) => ({ ...current, page: DEFAULT_PAGE }));
        setFilters((current) => ({ ...current, plantId: value }));
    };

    const handleCategoryChange = (value?: string) => {
        setDraftFilters((current) => ({ ...current, category: value }));
        setPagination((current) => ({ ...current, page: DEFAULT_PAGE }));
        setFilters((current) => ({ ...current, category: value }));
    };

    const handleResetFilters = () => {
        if (searchParams.has('lowStock') || searchParams.has('plantId')) {
            navigate('/materials/inventory');
            return;
        }

        setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
        setDraftFilters(createDefaultFilters());
        setFilters(createDefaultFilters());
    };

    const handleOpenHistory = (record: MaterialInventory) => {
        const materialName = record.material?.name || 'Vật tư';
        const plantName = record.plant?.name || 'Cơ sở';

        setSelectedInventoryItem({
            materialId: record.materialId,
            materialName,
            materialCode: record.material?.code,
            plantId: record.plantId,
            plantName,
        });
        setHistoryRange(createDefaultHistoryRange());
        setHistoryPagination({
            page: DEFAULT_HISTORY_PAGE,
            limit: DEFAULT_HISTORY_LIMIT,
        });
    };

    const handleOpenAdjustStock = (record: MaterialInventory) => {
        setEditingStockItem(record);
        setNewStock(record.currentStock);
        setAdjustReason('');
    };

    const columns: TableColumnsType<MaterialInventory> = [
        {
            title: 'MÃ VẬT TƯ',
            key: 'code',
            width: 160,
            render: (_value, record) => (
                <span className='inline-flex items-center rounded border border-blue-100 bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700'>
                    {record.material?.code || '-'}
                </span>
            ),
        },
        {
            title: 'TÊN VẬT TƯ',
            key: 'name',
            render: (_value, record) => (
                <div className='flex flex-col gap-0.5'>
                    <span className='font-semibold text-slate-800'>{record.material?.name || '-'}</span>
                    {record.currentStock < (record.minStockLevel ?? 0) ? (
                        <Text className='text-xs text-amber-600'>Cần theo dõi bổ sung tồn kho</Text>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'ĐƠN VỊ TÍNH',
            key: 'unit',
            width: 130,
            render: (_value, record) => (
                <span className='font-medium text-slate-700'>{record.material?.unit || '-'}</span>
            ),
        },
        {
            title: 'NHÓM',
            key: 'category',
            render: (_value, record) => <span className='text-slate-700'>{record.material?.category || '-'}</span>,
        },
        {
            title: 'CƠ SỞ',
            key: 'plant',
            render: (_value, record) => (
                <div className='flex flex-col gap-0.5'>
                    <span className='font-semibold text-slate-800'>{record.plant?.name || '-'}</span>
                    <span className='text-xs text-slate-500'>{record.plant?.code || record.plantId}</span>
                </div>
            ),
        },
        {
            title: 'TỒN HIỆN TẠI',
            dataIndex: 'currentStock',
            key: 'currentStock',
            width: 140,
            align: 'right',
            render: (value: number, record) => (
                <span
                    className={
                        record.currentStock < (record.minStockLevel ?? 0)
                            ? 'font-semibold text-rose-600'
                            : 'font-semibold text-slate-700'
                    }
                >
                    {formatNumber(value)}
                </span>
            ),
        },
        {
            title: 'NGƯỠNG TỐI THIỂU',
            dataIndex: 'minStockLevel',
            key: 'minStockLevel',
            width: 150,
            align: 'right',
            render: (value?: number) => <span className='text-slate-700'>{formatNumber(value)}</span>,
        },
        {
            title: 'TRẠNG THÁI TỒN',
            key: 'stockStatus',
            width: 160,
            render: (_value, record) => {
                if (record.currentStock === 0) {
                    return <Tag color='error'>Hết hàng</Tag>;
                }

                if (record.currentStock < (record.minStockLevel ?? 0)) {
                    return (
                        <Tag color='warning' icon={<WarningOutlined />}>
                            Sắp hết
                        </Tag>
                    );
                }

                return <Tag color='success'>Đủ hàng</Tag>;
            },
        },
        {
            title: 'THAO TÁC',
            key: 'action',
            width: 120,
            align: 'right',
            render: (_value, record) => (
                <div className='flex items-center justify-end gap-2'>
                    {canEditStock && (
                        <Tooltip title='Điều chỉnh tồn kho'>
                            <Button
                                type='text'
                                icon={<EditOutlined />}
                                className='flex h-8 w-8 items-center justify-center rounded-md text-amber-600 hover:bg-amber-50 hover:text-amber-700'
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleOpenAdjustStock(record);
                                }}
                            />
                        </Tooltip>
                    )}
                    <Tooltip title='Xem lịch sử'>
                        <Button
                            type='text'
                            icon={<HistoryOutlined />}
                            className='flex h-8 w-8 items-center justify-center rounded-md bg-sky-50 text-sky-600 transition-colors hover:bg-sky-100 hover:text-sky-700'
                            onClick={(event) => {
                                event.stopPropagation();
                                handleOpenHistory(record);
                            }}
                        />
                    </Tooltip>
                </div>
            ),
        },
    ];

    const historyColumns: TableColumnsType<InventoryTransaction> = [
        {
            title: 'NGÀY GIỜ',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 160,
            render: (value?: string) => <span className='text-slate-700'>{formatDateTime(value)}</span>,
        },
        {
            title: 'LOẠI',
            dataIndex: 'type',
            key: 'type',
            width: 130,
            render: (value?: string) => {
                const config = resolveTransactionType(value);

                return <Tag color={config.color}>{config.label}</Tag>;
            },
        },
        {
            title: 'SỐ LƯỢNG',
            key: 'quantity',
            width: 120,
            align: 'right',
            render: (_value, record) => (
                <span className={getTransactionQuantityClassName(record)}>{formatTransactionQuantity(record)}</span>
            ),
        },
        {
            title: 'TỒN TRƯỚC',
            dataIndex: 'stockBefore',
            key: 'stockBefore',
            width: 110,
            align: 'right',
            render: (value?: number) => <span className='text-slate-700'>{formatNumber(value)}</span>,
        },
        {
            title: 'TỒN SAU',
            dataIndex: 'stockAfter',
            key: 'stockAfter',
            width: 110,
            align: 'right',
            render: (value?: number) => <span className='text-slate-700'>{formatNumber(value)}</span>,
        },
        {
            title: 'NGUỒN',
            dataIndex: 'relatedType',
            key: 'relatedType',
            width: 110,
            render: (value?: string) => <span className='text-slate-700'>{resolveRelatedTypeLabel(value)}</span>,
        },
        {
            title: 'NGƯỜI THỰC HIỆN',
            dataIndex: 'performedBy',
            key: 'performedBy',
            render: (value?: string | User) => <span className='text-slate-700'>{resolvePerformerLabel(value)}</span>,
        },
        {
            title: 'GHI CHÚ',
            dataIndex: 'note',
            key: 'note',
            render: (value?: string) => <span className='text-slate-600'>{value || '-'}</span>,
        },
    ];

    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <style>{PAGE_ANIM}</style>

            <div className='mi-h'>
                <PageHeader
                    title='Tồn kho vật tư'
                    subtitle='Theo dõi tồn kho vật tư theo từng cơ sở, nhận diện mã sắp hết và tra cứu lịch sử nhập xuất.'
                    actions={
                        canEditStock ? (
                            <Space wrap>
                                <Button icon={<PlusOutlined />} type='primary' onClick={() => setInitStockOpen(true)}>
                                    Nhập tồn kho
                                </Button>
                                <Button icon={<UploadOutlined />} onClick={() => setImportExcelOpen(true)}>
                                    Import Excel
                                </Button>
                                <Dropdown
                                    menu={{
                                        items: [
                                            {
                                                key: 'stock',
                                                label: 'Báo cáo tồn kho',
                                                icon: <DownloadOutlined />,
                                                onClick: () => inventoryService.exportStock({ plantId: mainPlantId }),
                                            },
                                            {
                                                key: 'history',
                                                label: 'Lịch sử nhập xuất',
                                                icon: <HistoryOutlined />,
                                                onClick: () => setExportHistoryOpen(true),
                                            },
                                        ] as MenuProps['items'],
                                    }}
                                    placement='bottomRight'
                                >
                                    <Button icon={<DownloadOutlined />}>Export</Button>
                                </Dropdown>
                            </Space>
                        ) : undefined
                    }
                />
            </div>

            <div className='mi-s inventory-list-stats flex flex-wrap gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200'>
                {[
                    {
                        label: 'Tổng loại vật tư đang theo dõi',
                        value: stats.totalMaterials,
                        accent: 'oklch(0.18 0.012 250)',
                    },
                    { label: 'Đang dưới ngưỡng tối thiểu', value: stats.lowStockCount, accent: 'oklch(0.55 0.18 55)' },
                    {
                        label: 'Tổng nhập kho tháng này',
                        value: stats.importedThisMonth,
                        accent: 'oklch(0.45 0.14 240)',
                    },
                    { label: 'Tổng xuất kho tháng này', value: stats.exportedThisMonth, accent: 'oklch(0.48 0.17 25)' },
                ].map(({ label, value, accent }) => (
                    <div key={label} className='mi-stat flex min-w-[150px] flex-1 flex-col gap-0.5 bg-white px-5 py-4'>
                        <span className='text-[11px] font-medium text-slate-400'>{label}</span>
                        <span className='text-base font-bold' style={{ color: accent }}>
                            {formatNumber(value)}
                        </span>
                    </div>
                ))}
            </div>

            <div className='mi-f inventory-filter-bar flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
                <Select
                    showSearch
                    allowClear
                    placeholder='Cơ sở'
                    className='min-w-[220px]'
                    value={draftFilters.plantId}
                    onChange={handlePlantChange}
                    options={plants.map((plant: Plant) => ({
                        value: plant.id,
                        label: plant.name,
                    }))}
                    optionFilterProp='label'
                />

                <Select
                    showSearch
                    allowClear
                    placeholder='Nhóm vật tư'
                    className='min-w-[190px]'
                    value={draftFilters.category}
                    onChange={handleCategoryChange}
                    options={categoryOptions}
                    optionFilterProp='label'
                />

                <div className='min-w-[240px] flex-1'>
                    <Input
                        allowClear
                        prefix={<SearchOutlined className='text-slate-400' />}
                        placeholder='Tìm theo tên hoặc mã vật tư...'
                        value={draftFilters.search}
                        onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
                        onPressEnter={() => {
                            setPagination((current) => ({ ...current, page: DEFAULT_PAGE }));
                            setFilters((current) => ({
                                ...current,
                                search: normalizeSearchTerm(draftFilters.search),
                            }));
                        }}
                        className='w-full rounded-lg'
                    />
                </div>

                <Button icon={<ReloadOutlined />} onClick={handleResetFilters} className='rounded-lg text-slate-500'>
                    Làm mới
                </Button>
            </div>

            <div className='mi-t overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                <div className='inventory-mobile-list' aria-label='Danh sách tồn kho mobile'>
                    {isLoading || isFetching ? (
                        <div className='inventory-mobile-empty'>Đang tải dữ liệu tồn kho...</div>
                    ) : displayedInventoryRows.length === 0 ? (
                        <div className='inventory-mobile-empty'>Chưa có dữ liệu tồn kho phù hợp bộ lọc hiện tại.</div>
                    ) : (
                        displayedInventoryRows.map((record) => {
                            const isLowStock = record.currentStock < (record.minStockLevel ?? 0);
                            const isOutOfStock = record.currentStock === 0;

                            return (
                                <article
                                    key={record.id}
                                    className={`inventory-mobile-card${isLowStock ? 'inventory-mobile-card--warning' : ''}`}
                                >
                                    <div className='inventory-mobile-card__main'>
                                        <div className='inventory-mobile-card__heading'>
                                            <span className='inventory-mobile-card__title'>
                                                {record.material?.name || '-'}
                                            </span>
                                            <span className='inventory-mobile-card__code'>
                                                {record.material?.code || '-'}
                                            </span>
                                        </div>
                                        <div className='inventory-mobile-card__stock'>
                                            <span className={isLowStock ? 'text-rose-600' : 'text-slate-900'}>
                                                {formatNumber(record.currentStock)}
                                            </span>
                                            <small>{record.material?.unit || '-'}</small>
                                        </div>
                                        <div className='inventory-mobile-card__badges'>
                                            {isOutOfStock ? (
                                                <Tag color='error'>Hết hàng</Tag>
                                            ) : isLowStock ? (
                                                <Tag color='warning' icon={<WarningOutlined />}>
                                                    Sắp hết
                                                </Tag>
                                            ) : (
                                                <Tag color='success'>Đủ hàng</Tag>
                                            )}
                                        </div>
                                        <div className='inventory-mobile-card__meta'>
                                            <span>Cơ sở: {record.plant?.name || '-'}</span>
                                            <span>Nhóm: {record.material?.category || '-'}</span>
                                            <span>Ngưỡng: {formatNumber(record.minStockLevel)}</span>
                                        </div>
                                    </div>
                                    <div className='inventory-mobile-card__actions'>
                                        <Button
                                            size='small'
                                            icon={<HistoryOutlined />}
                                            onClick={() => handleOpenHistory(record)}
                                        >
                                            Lịch sử
                                        </Button>
                                        {canEditStock ? (
                                            <Button
                                                size='small'
                                                icon={<EditOutlined />}
                                                onClick={() => handleOpenAdjustStock(record)}
                                            >
                                                Điều chỉnh
                                            </Button>
                                        ) : null}
                                    </div>
                                </article>
                            );
                        })
                    )}
                </div>

                {displayedInventoryRows.length > 0 ? (
                    <div className='inventory-mobile-pagination'>
                        <Button
                            size='small'
                            disabled={currentPage <= 1 || lowStockOnly}
                            onClick={() => setPagination((current) => ({ ...current, page: currentPage - 1 }))}
                        >
                            Trước
                        </Button>
                        <span>
                            {pageStart}-{pageEnd} / {totalItems}
                        </span>
                        <Button
                            size='small'
                            disabled={currentPage >= totalPages || lowStockOnly}
                            onClick={() => setPagination((current) => ({ ...current, page: currentPage + 1 }))}
                        >
                            Sau
                        </Button>
                    </div>
                ) : null}

                <div className='inventory-desktop-table [&_.ant-table]:!bg-white [&_.ant-table-cell]:!transition-colors [&_.ant-table-cell]:!duration-100 [&_.ant-table-row:hover_td]:!bg-blue-50/30 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400'>
                    <Table<MaterialInventory>
                        rowKey='id'
                        columns={columns}
                        dataSource={displayedInventoryRows}
                        loading={isLoading || isFetching}
                        size='small'
                        scroll={{ x: 1180 }}
                        rowClassName={(record) =>
                            record.currentStock < (record.minStockLevel ?? 0) ? 'mi-low-stock-row' : ''
                        }
                        locale={{
                            emptyText: (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description='Chưa có dữ liệu tồn kho phù hợp bộ lọc hiện tại'
                                />
                            ),
                        }}
                        pagination={{
                            current: lowStockOnly ? 1 : (inventoryResponse?.page ?? pagination.page),
                            total: lowStockOnly ? displayedInventoryRows.length : (inventoryResponse?.total ?? 0),
                            pageSize: lowStockOnly
                                ? LOW_STOCK_VIEW_LIMIT
                                : (inventoryResponse?.limit ?? pagination.limit),
                            showSizeChanger: !lowStockOnly,
                            showTotal: (total, range) => (
                                <span className='text-sm text-slate-400'>
                                    {total > 0
                                        ? `${range[0]}-${range[1]} / ${total} bản ghi tồn kho`
                                        : 'Không có kết quả'}
                                </span>
                            ),
                            onChange: (page, pageSize) =>
                                setPagination({ page, limit: lowStockOnly ? LOW_STOCK_VIEW_LIMIT : pageSize }),
                            className: '!m-0 border-t border-slate-100 !px-5 !py-3',
                        }}
                    />
                </div>
            </div>

            <Drawer
                title={
                    selectedInventoryItem
                        ? `Lịch sử giao dịch - ${selectedInventoryItem.materialName} tại ${selectedInventoryItem.plantName}`
                        : 'Lịch sử giao dịch'
                }
                size={980}
                open={Boolean(selectedInventoryItem)}
                onClose={() => setSelectedInventoryItem(null)}
                destroyOnHidden
                styles={{ body: { paddingBottom: 24 } }}
            >
                {selectedInventoryItem ? (
                    <div className='flex flex-col gap-5'>
                        <div className='rounded-xl border border-slate-200 bg-slate-50 px-4 py-3'>
                            <div className='text-sm font-semibold text-slate-900'>
                                {selectedInventoryItem.materialName}
                                {selectedInventoryItem.materialCode ? (
                                    <span className='ml-2 font-mono text-xs text-slate-500'>
                                        {selectedInventoryItem.materialCode}
                                    </span>
                                ) : null}
                            </div>
                            <div className='mt-1 text-xs text-slate-500'>{selectedInventoryItem.plantName}</div>
                        </div>

                        <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'>
                            <div>
                                <div className='text-sm font-semibold text-slate-800'>Khoảng thời gian</div>
                                <div className='text-xs text-slate-500'>Mặc định hiển thị 30 ngày gần nhất</div>
                            </div>

                            <RangePicker
                                value={historyRange}
                                format='DD/MM/YYYY'
                                allowClear={false}
                                onChange={(value) => {
                                    if (!value || value.length !== 2 || !value[0] || !value[1]) {
                                        return;
                                    }

                                    setHistoryRange([value[0], value[1]]);
                                    setHistoryPagination((current) => ({ ...current, page: DEFAULT_HISTORY_PAGE }));
                                }}
                            />
                        </div>

                        <div className='overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                            <div className='[&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-slate-50/90 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400'>
                                <Table<InventoryTransaction>
                                    rowKey='id'
                                    columns={historyColumns}
                                    dataSource={historyRows}
                                    loading={isHistoryLoading || isHistoryFetching}
                                    size='small'
                                    scroll={{ x: 1120 }}
                                    locale={{
                                        emptyText: (
                                            <Empty
                                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                                description='Chưa có giao dịch trong khoảng thời gian đã chọn'
                                            />
                                        ),
                                    }}
                                    pagination={{
                                        current: historyResponse?.page ?? historyPagination.page,
                                        total: historyResponse?.total ?? 0,
                                        pageSize: historyResponse?.limit ?? historyPagination.limit,
                                        showSizeChanger: false,
                                        onChange: (page) => setHistoryPagination((current) => ({ ...current, page })),
                                        showTotal: (total, range) => (
                                            <span className='text-sm text-slate-400'>
                                                {total > 0
                                                    ? `${range[0]}-${range[1]} / ${total} giao dịch`
                                                    : 'Không có giao dịch'}
                                            </span>
                                        ),
                                        className: '!m-0 border-t border-slate-100 !px-5 !py-3',
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                ) : null}
            </Drawer>

            <Modal
                title='Điều chỉnh tồn kho'
                open={!!editingStockItem}
                onCancel={() => {
                    setEditingStockItem(null);
                    setNewStock(null);
                    setAdjustReason('');
                }}
                onOk={() => {
                    if (newStock === null || newStock < 0)
                        return message.error('Vui lòng nhập số lượng tồn kho hợp lệ');
                    if (newStock === editingStockItem?.currentStock)
                        return message.error('Số lượng tồn kho chưa thay đổi');
                    if (!adjustReason.trim() || adjustReason.length < 10)
                        return message.error('Vui lòng nhập lý do hợp lệ (ít nhất 10 ký tự)');

                    adjustStock({
                        materialId: editingStockItem!.materialId,
                        plantId: editingStockItem!.plantId,
                        newStock,
                        reason: adjustReason,
                    });
                }}
                confirmLoading={isAdjustingStock}
                okText='Xác nhận điều chỉnh'
                okButtonProps={{ className: 'bg-blue-600' }}
                cancelText='Huỷ'
            >
                {editingStockItem && (
                    <div className='flex flex-col gap-4 py-4'>
                        <div className='rounded-lg border border-slate-200 bg-slate-50 p-4'>
                            <div className='mb-2 flex items-center justify-between'>
                                <span className='text-slate-500'>Vật tư:</span>
                                <span className='font-semibold'>
                                    {editingStockItem.material?.name} ({editingStockItem.material?.code})
                                </span>
                            </div>
                            <div className='mb-2 flex items-center justify-between'>
                                <span className='text-slate-500'>Cơ sở:</span>
                                <span className='font-semibold'>{editingStockItem.plant?.name}</span>
                            </div>
                            <div className='flex items-center justify-between'>
                                <span className='text-slate-500'>Tồn kho hiện tại:</span>
                                <span className='text-xl font-bold text-blue-600'>
                                    {formatNumber(editingStockItem.currentStock)} {editingStockItem.material?.unit}
                                </span>
                            </div>
                        </div>

                        <div className='flex flex-col gap-1'>
                            <label className='font-medium'>
                                Tồn kho mới <span className='text-red-500'>*</span>
                            </label>
                            <InputNumber
                                min={0}
                                value={newStock}
                                onChange={(val) => setNewStock(val)}
                                className='w-full'
                                placeholder='Nhập số lượng tồn kho thực tế'
                            />
                            {newStock !== null && newStock !== editingStockItem.currentStock && (
                                <div
                                    className={`mt-1 text-sm ${newStock > editingStockItem.currentStock ? 'text-green-600' : 'text-red-600'}`}
                                >
                                    Thay đổi: {formatNumber(editingStockItem.currentStock)} → {formatNumber(newStock)} (
                                    {newStock > editingStockItem.currentStock ? '+' : ''}
                                    {formatNumber(newStock - editingStockItem.currentStock)})
                                </div>
                            )}
                        </div>

                        <div className='flex flex-col gap-1'>
                            <label className='font-medium'>
                                Lý do điều chỉnh <span className='text-red-500'>*</span>
                            </label>
                            <Input.TextArea
                                rows={3}
                                value={adjustReason}
                                onChange={(e) => setAdjustReason(e.target.value)}
                                placeholder='VD: Kiểm kê thực tế ngày 15/01/2026...'
                            />
                        </div>
                    </div>
                )}
            </Modal>

            {canEditStock && mainPlantId && (
                <>
                    <ModalInitStock
                        open={initStockOpen}
                        plantId={mainPlantId}
                        onClose={() => setInitStockOpen(false)}
                    />
                    <ModalImportExcel
                        open={importExcelOpen}
                        plantId={mainPlantId}
                        onClose={() => setImportExcelOpen(false)}
                    />
                    <ModalExportHistory
                        open={exportHistoryOpen}
                        plantId={mainPlantId}
                        onClose={() => setExportHistoryOpen(false)}
                    />
                </>
            )}
        </div>
    );
};

export default MaterialInventoryPage;
