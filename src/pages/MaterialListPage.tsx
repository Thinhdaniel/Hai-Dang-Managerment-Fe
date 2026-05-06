import React, { lazy, useEffect, useMemo, useState } from 'react';
import {
    App,
    Button,
    Descriptions,
    Drawer,
    Empty,
    Input,
    Select,
    Table,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, WarningOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ConfirmAction from '../components/shared/ConfirmAction';
import LazyBoundary from '../components/shared/LazyBoundary';
import PageHeader from '../components/shared/PageHeader';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess, isAdmin } from '../core/lib/permissions';
import { normalizeSearchTerm } from '../core/lib/search';
import type {
    InventoryQueryParams,
    Material,
    MaterialInventory,
    MaterialListApiResponse,
    MaterialPayload,
} from '../core/services/material.service';
import { inventoryService, materialReportService, materialService } from '../core/services/material.service';
import type { PaginatedResponse } from '../core/types';

const MaterialFormModal = lazy(() => import('../components/MaterialFormModal'));

const { Text } = Typography;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_CATEGORIES = ['Kim chỉ', 'Phụ liệu', 'Dầu nhớt', 'Văn phòng phẩm'];

const PAGE_ANIM = `
@keyframes ml-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.ml-h{animation:ml-up .28s cubic-bezier(.22,1,.36,1) .04s both}
.ml-s{animation:ml-up .30s cubic-bezier(.22,1,.36,1) .12s both}
.ml-f{animation:ml-up .30s cubic-bezier(.22,1,.36,1) .18s both}
.ml-t{animation:ml-up .32s cubic-bezier(.22,1,.36,1) .24s both}
.ml-stat{transition:background-color 130ms cubic-bezier(.22,1,.36,1)}
.ml-stat:hover{background-color:oklch(0.975 0.005 250)}
.ml-low-stock-row td{background:rgba(254,242,242,.82)!important}
@media(prefers-reduced-motion:reduce){.ml-h,.ml-s,.ml-f,.ml-t{animation:none}.ml-stat{transition:none}}
`;

type MaterialStatusFilterValue = 'all' | 'active' | 'inactive';

type MaterialFilterState = {
    search: string;
    category?: string;
    isActive?: boolean;
};

type MaterialDraftFilterState = {
    search: string;
    category?: string;
    status: MaterialStatusFilterValue;
};

type NormalizedMaterialListResponse = PaginatedResponse<Material> & {
    statsSource: Material[];
};

const createDefaultFilters = (): MaterialFilterState => ({
    search: '',
    category: undefined,
    isActive: undefined,
});

const createDefaultDraftFilters = (): MaterialDraftFilterState => ({
    search: '',
    category: undefined,
    status: 'all',
});

const normalizePositiveNumber = (value: number | undefined, fallback: number) => {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
        return fallback;
    }

    return value;
};

const normalizeMaterialListResponse = (
    response: MaterialListApiResponse,
    params: Pick<InventoryQueryParams, 'page' | 'limit'>
): NormalizedMaterialListResponse => {
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
            statsSource: response,
        };
    }

    return {
        ...response,
        statsSource: response.data,
    };
};

const resolveErrorMessage = (error: unknown, fallbackMessage: string) => {
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }

    return fallbackMessage;
};

const formatNumber = (value?: number) => (value ?? 0).toLocaleString('vi-VN');

const MaterialListPage: React.FC = () => {
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const { role } = useAuth();
    const canManageMaterials = hasManagerAccess(role);
    const canDeleteMaterials = isAdmin(role);
    const canViewSummary = hasManagerAccess(role);

    const [filters, setFilters] = useState<MaterialFilterState>(() => createDefaultFilters());
    const [draftFilters, setDraftFilters] = useState<MaterialDraftFilterState>(() => createDefaultDraftFilters());
    const [pagination, setPagination] = useState({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
    const [detailMaterial, setDetailMaterial] = useState<Material | null>(null);

    const queryParams = useMemo(
        () => ({
            ...filters,
            page: pagination.page,
            limit: pagination.limit,
        }),
        [filters, pagination.limit, pagination.page]
    );

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            const normalizedSearch = normalizeSearchTerm(draftFilters.search);

            setPagination((current) =>
                current.page === DEFAULT_PAGE ? current : { ...current, page: DEFAULT_PAGE }
            );
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

    const { data: materialResponse, isLoading, isFetching } = useQuery({
        queryKey: ['materials', queryParams],
        queryFn: async () => normalizeMaterialListResponse(await materialService.getAll(queryParams), queryParams),
        placeholderData: (previousData) => previousData,
    });

    const { data: lowStockMaterials = [] } = useQuery({
        queryKey: ['materials', 'low-stock'],
        queryFn: () => materialService.getLowStock(),
    });

    const { data: summary } = useQuery({
        queryKey: ['materials', 'summary'],
        queryFn: () => materialReportService.getSummary(),
        enabled: canViewSummary,
    });

    const { data: activeStats } = useQuery({
        queryKey: ['materials', 'stat', 'active'],
        queryFn: async () => normalizeMaterialListResponse(await materialService.getAll({ page: 1, limit: 1, isActive: true }), { page: 1, limit: 1 }),
    });

    const { data: inactiveStats } = useQuery({
        queryKey: ['materials', 'stat', 'inactive'],
        queryFn: async () => normalizeMaterialListResponse(await materialService.getAll({ page: 1, limit: 1, isActive: false }), { page: 1, limit: 1 }),
    });

    const detailMaterialId = detailMaterial?.id;

    const { data: inventoryDetail, isLoading: isInventoryLoading } = useQuery({
        queryKey: ['materials', 'inventory', detailMaterialId],
        queryFn: () => inventoryService.getByMaterial(detailMaterialId as string),
        enabled: Boolean(detailMaterialId),
    });

    const createMutation = useMutation({
        mutationFn: materialService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['materials'] });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: MaterialPayload }) => materialService.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['materials'] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: materialService.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['materials'] });
        },
    });

    const materials = useMemo(() => materialResponse?.data ?? [], [materialResponse?.data]);

    const lowStockMaterialIds = useMemo(
        () => new Set(lowStockMaterials.map((material) => material.id)),
        [lowStockMaterials]
    );

    const categoryOptions = useMemo(() => {
        const values = new Set<string>(DEFAULT_CATEGORIES);

        [...materials, ...lowStockMaterials].forEach((material) => {
            if (material.category?.trim()) {
                values.add(material.category);
            }
        });

        return Array.from(values).map((value) => ({
            value,
            label: value,
        }));
    }, [lowStockMaterials, materials]);

    const stats = useMemo(
        () => ({
            total: summary?.totalMaterials ?? materialResponse?.total ?? 0,
            active: activeStats?.total ?? 0,
            inactive: inactiveStats?.total ?? 0,
            lowStock: summary?.lowStockCount ?? lowStockMaterials.length,
        }),
        [activeStats?.total, inactiveStats?.total, lowStockMaterials.length, materialResponse?.total, summary?.lowStockCount, summary?.totalMaterials]
    );

    const handleCategoryChange = (value?: string) => {
        setDraftFilters((current) => ({ ...current, category: value }));
        setPagination((current) => ({ ...current, page: DEFAULT_PAGE }));
        setFilters((current) => ({ ...current, category: value }));
    };

    const handleStatusChange = (value: MaterialStatusFilterValue) => {
        setDraftFilters((current) => ({ ...current, status: value }));
        setPagination((current) => ({ ...current, page: DEFAULT_PAGE }));
        setFilters((current) => ({
            ...current,
            isActive: value === 'all' ? undefined : value === 'active',
        }));
    };

    const handleResetFilters = () => {
        setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
        setDraftFilters(createDefaultDraftFilters());
        setFilters(createDefaultFilters());
    };

    const handleOpenCreate = () => {
        setEditingMaterial(null);
        setIsFormModalOpen(true);
    };

    const handleOpenEdit = (material: Material) => {
        setEditingMaterial(material);
        setIsFormModalOpen(true);
    };

    const handleOpenDetail = (material: Material) => {
        setDetailMaterial(material);
    };

    const handleCreateMaterial = async (payload: MaterialPayload) => {
        try {
            await createMutation.mutateAsync(payload);
            setIsFormModalOpen(false);
        } catch (error) {
            message.error(resolveErrorMessage(error, 'Không thể tạo vật tư. Vui lòng thử lại.'));
            throw error;
        }
    };

    const handleUpdateMaterial = async (payload: MaterialPayload) => {
        if (!editingMaterial) {
            return;
        }

        try {
            await updateMutation.mutateAsync({
                id: editingMaterial.id,
                data: payload,
            });
            setIsFormModalOpen(false);
            setEditingMaterial(null);
        } catch (error) {
            message.error(resolveErrorMessage(error, 'Không thể cập nhật vật tư. Vui lòng thử lại.'));
            throw error;
        }
    };

    const handleDeleteMaterial = async (material: Material) => {
        await deleteMutation.mutateAsync(material.id);
        message.success('Đã xóa vật tư');

        if (detailMaterial?.id === material.id) {
            setDetailMaterial(null);
        }
    };

    const columns: TableColumnsType<Material> = [
        {
            title: 'MÃ VẬT TƯ',
            dataIndex: 'code',
            key: 'code',
            width: 170,
            render: (value: string) => (
                <span className='inline-flex items-center rounded border border-blue-100 bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700'>
                    {value}
                </span>
            ),
        },
        {
            title: 'TÊN VẬT TƯ',
            dataIndex: 'name',
            key: 'name',
            render: (_value, record) => {
                const isLowStock = record.lowStock ?? lowStockMaterialIds.has(record.id);

                return (
                    <div className='flex flex-col gap-1'>
                        <button
                            type='button'
                            onClick={() => handleOpenDetail(record)}
                            className='w-fit text-left text-[14px] font-semibold text-slate-800 transition-colors hover:text-blue-600'
                        >
                            {record.name}
                        </button>
                        {isLowStock ? (
                            <Tag color='warning' className='mr-0 w-fit'>
                                Dưới ngưỡng tồn kho
                            </Tag>
                        ) : null}
                    </div>
                );
            },
        },
        {
            title: 'NHÓM / CATEGORY',
            dataIndex: 'category',
            key: 'category',
            render: (value?: string) => <span className='text-slate-700'>{value || '-'}</span>,
        },
        {
            title: 'ĐƠN VỊ TÍNH',
            dataIndex: 'unit',
            key: 'unit',
            width: 130,
            render: (value: string) => <span className='font-medium text-slate-700'>{value}</span>,
        },
        {
            title: 'NGƯỠNG TỐI THIỂU',
            dataIndex: 'minStockLevel',
            key: 'minStockLevel',
            width: 150,
            render: (value?: number) => <span className='text-slate-700'>{formatNumber(value)}</span>,
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'isActive',
            key: 'isActive',
            width: 130,
            render: (isActive: boolean) =>
                isActive ? <Tag color='success'>Hoạt động</Tag> : <Tag color='error'>Ngừng</Tag>,
        },
        {
            title: 'THAO TÁC',
            key: 'action',
            width: 120,
            align: 'right',
            render: (_value, record) => (
                <div className='flex items-center justify-end gap-2'>
                    {canManageMaterials ? (
                        <Tooltip title='Chỉnh sửa'>
                            <Button
                                type='text'
                                icon={<EditOutlined />}
                                className='flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100 hover:text-amber-700'
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleOpenEdit(record);
                                }}
                            />
                        </Tooltip>
                    ) : null}

                    {canDeleteMaterials ? (
                        <ConfirmAction
                            title='Xóa vật tư'
                            description={`Vật tư “${record.name}” sẽ bị xóa mềm khỏi hệ thống. Không thể hoàn tác.`}
                            okLabel='Xóa'
                            onConfirm={() => handleDeleteMaterial(record)}
                        >
                            <div onClick={(event) => event.stopPropagation()}>
                                <Tooltip title='Xóa mềm'>
                                    <Button
                                        type='text'
                                        danger
                                        loading={deleteMutation.isPending}
                                        icon={<DeleteOutlined />}
                                        className='flex h-8 w-8 items-center justify-center rounded-md bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100 hover:text-rose-700'
                                    />
                                </Tooltip>
                            </div>
                        </ConfirmAction>
                    ) : null}
                </div>
            ),
        },
    ];

    const inventoryColumns: TableColumnsType<MaterialInventory> = [
        {
            title: 'CƠ SỞ',
            dataIndex: ['plant', 'name'],
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
            render: (value: number, record) => (
                <span className={record.lowStock ? 'font-semibold text-rose-600' : 'font-semibold text-slate-700'}>
                    {formatNumber(value)}
                </span>
            ),
        },
        {
            title: 'NGƯỠNG TỐI THIỂU',
            dataIndex: 'minStockLevel',
            key: 'minStockLevel',
            width: 150,
            render: (value?: number) => <span className='text-slate-700'>{formatNumber(value)}</span>,
        },
        {
            title: 'TRẠNG THÁI TỒN',
            dataIndex: 'lowStock',
            key: 'lowStock',
            width: 140,
            render: (lowStock?: boolean) =>
                lowStock ? <Tag color='error'>Thiếu</Tag> : <Tag color='success'>Đủ</Tag>,
        },
    ];

    const detailSummary = inventoryDetail?.material ?? detailMaterial;

    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <style>{PAGE_ANIM}</style>

            <div className='ml-h'>
                <PageHeader
                    title='Danh mục vật tư'
                    subtitle='Quản lý danh mục vật tư dùng chung cho mua sắm, tồn kho và cấp phát trong hệ thống.'
                    actions={
                        canManageMaterials ? (
                            <Button
                                type='primary'
                                icon={<PlusOutlined />}
                                onClick={handleOpenCreate}
                                className='rounded-lg bg-blue-600 hover:!bg-blue-700'
                            >
                                Thêm vật tư
                            </Button>
                        ) : undefined
                    }
                />
            </div>

            <div className='ml-s flex flex-wrap gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200'>
                {[
                    { label: 'Tổng loại VT', value: stats.total, accent: 'oklch(0.18 0.012 250)' },
                    { label: 'Đang hoạt động', value: stats.active, accent: 'oklch(0.42 0.14 145)' },
                    { label: 'Không hoạt động', value: stats.inactive, accent: 'oklch(0.44 0.16 25)' },
                    { label: 'Dưới ngưỡng tồn kho', value: stats.lowStock, accent: 'oklch(0.46 0.17 75)' },
                ].map(({ label, value, accent }) => (
                    <div key={label} className='ml-stat flex min-w-[130px] flex-1 flex-col gap-0.5 bg-white px-5 py-4'>
                        <span className='text-[11px] font-medium text-slate-400'>{label}</span>
                        <span className='text-base font-bold' style={{ color: accent }}>
                            {value}
                        </span>
                    </div>
                ))}
            </div>

            <div className='ml-f flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
                <div className='min-w-[220px] flex-1'>
                    <Input
                        allowClear
                        prefix={<SearchOutlined className='text-slate-400' />}
                        placeholder='Tìm theo tên hoặc mã vật tư...'
                        value={draftFilters.search}
                        onChange={(event) =>
                            setDraftFilters((current) => ({ ...current, search: event.target.value }))
                        }
                        onPressEnter={() =>
                            setFilters((current) => ({
                                ...current,
                                search: normalizeSearchTerm(draftFilters.search),
                            }))
                        }
                        className='w-full rounded-lg'
                    />
                </div>

                <Select
                    showSearch
                    allowClear
                    placeholder='Nhóm vật tư'
                    className='min-w-[180px]'
                    value={draftFilters.category}
                    onChange={handleCategoryChange}
                    options={categoryOptions}
                    optionFilterProp='label'
                />

                <Select
                    value={draftFilters.status}
                    className='min-w-[160px]'
                    onChange={handleStatusChange}
                    options={[
                        { value: 'all', label: 'Tất cả' },
                        { value: 'active', label: 'Hoạt động' },
                        { value: 'inactive', label: 'Ngừng' },
                    ]}
                />

                <Button icon={<ReloadOutlined />} onClick={handleResetFilters} className='rounded-lg text-slate-500'>
                    Làm mới
                </Button>
            </div>

            <div className='ml-t overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                <div className='[&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-blue-50/30 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400 [&_.ant-table-cell]:!transition-colors [&_.ant-table-cell]:!duration-100'>
                    <Table<Material>
                        rowKey='id'
                        columns={columns}
                        dataSource={materials}
                        loading={isLoading || isFetching}
                        size='small'
                        scroll={{ x: 980 }}
                        locale={{
                            emptyText: (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description='Chưa có vật tư nào phù hợp bộ lọc hiện tại'
                                />
                            ),
                        }}
                        pagination={{
                            current: materialResponse?.page ?? pagination.page,
                            total: materialResponse?.total ?? 0,
                            pageSize: materialResponse?.limit ?? pagination.limit,
                            showSizeChanger: true,
                            showTotal: (total, range) => (
                                <span className='text-sm text-slate-400'>
                                    {total > 0 ? `${range[0]}–${range[1]} / ${total} vật tư` : 'Không có kết quả'}
                                </span>
                            ),
                            onChange: (page, pageSize) => setPagination({ page, limit: pageSize }),
                            className: '!m-0 border-t border-slate-100 !px-5 !py-3',
                        }}
                    />
                </div>
            </div>

            {isFormModalOpen ? (
                <LazyBoundary mode='overlay'>
                    <MaterialFormModal
                        open={isFormModalOpen}
                        initialValues={editingMaterial}
                        onClose={() => {
                            setIsFormModalOpen(false);
                            setEditingMaterial(null);
                        }}
                        onSubmit={editingMaterial ? handleUpdateMaterial : handleCreateMaterial}
                    />
                </LazyBoundary>
            ) : null}

            <Drawer
                title='Chi tiết vật tư'
                width={760}
                open={Boolean(detailMaterial)}
                onClose={() => setDetailMaterial(null)}
                destroyOnHidden
                styles={{ body: { paddingBottom: 24 } }}
            >
                {detailSummary ? (
                    <div className='flex flex-col gap-6'>
                        <div className='rounded-xl border border-slate-200 bg-white p-5'>
                            <div className='mb-4 flex items-center justify-between gap-3'>
                                <div>
                                    <div className='text-lg font-semibold text-slate-900'>{detailSummary.name}</div>
                                    <div className='mt-1 flex flex-wrap items-center gap-2'>
                                        <span className='inline-flex items-center rounded border border-blue-100 bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700'>
                                            {detailSummary.code}
                                        </span>
                                        {(detailSummary.lowStock ?? lowStockMaterialIds.has(detailSummary.id)) ? (
                                            <Tag color='warning' icon={<WarningOutlined />}>
                                                Dưới ngưỡng tồn kho
                                            </Tag>
                                        ) : null}
                                    </div>
                                </div>
                                {detailSummary.isActive ? (
                                    <Tag color='success'>Hoạt động</Tag>
                                ) : (
                                    <Tag color='error'>Ngừng</Tag>
                                )}
                            </div>

                            <Descriptions
                                column={{ xs: 1, md: 2 }}
                                size='small'
                                className='[&_.ant-descriptions-item-label]:font-medium [&_.ant-descriptions-item-label]:text-slate-500 [&_.ant-descriptions-item-content]:font-medium [&_.ant-descriptions-item-content]:text-slate-800'
                            >
                                <Descriptions.Item label='Nhóm / Category'>
                                    {detailSummary.category || '-'}
                                </Descriptions.Item>
                                <Descriptions.Item label='Đơn vị tính'>
                                    {detailSummary.unit}
                                </Descriptions.Item>
                                <Descriptions.Item label='Ngưỡng tối thiểu'>
                                    {formatNumber(detailSummary.minStockLevel)}
                                </Descriptions.Item>
                                <Descriptions.Item label='Tổng tồn hiện tại'>
                                    {formatNumber(detailSummary.totalCurrentStock)}
                                </Descriptions.Item>
                            </Descriptions>

                            <div className='mt-4'>
                                <Text className='font-semibold text-slate-800'>Mô tả</Text>
                                <div className='mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600'>
                                    {detailSummary.description || 'Chưa có mô tả'}
                                </div>
                            </div>
                        </div>

                        <div className='overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                            <div className='border-b border-slate-100 px-5 py-4'>
                                <div className='text-sm font-semibold text-slate-900'>Tồn kho theo từng cơ sở</div>
                                <div className='text-xs text-slate-500'>Nguồn dữ liệu từ `/api/inventory/:materialId`</div>
                            </div>

                            <div className='[&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-slate-50/80 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400'>
                                <Table<MaterialInventory>
                                    rowKey='id'
                                    columns={inventoryColumns}
                                    dataSource={inventoryDetail?.stocks ?? []}
                                    loading={isInventoryLoading}
                                    pagination={false}
                                    size='small'
                                    locale={{
                                        emptyText: (
                                            <Empty
                                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                                description='Chưa có dữ liệu tồn kho theo cơ sở'
                                            />
                                        ),
                                    }}
                                    rowClassName={(record) => (record.lowStock ? 'ml-low-stock-row' : '')}
                                    scroll={{ x: 720 }}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <Empty description='Chưa có dữ liệu vật tư' />
                )}
            </Drawer>
        </div>
    );
};

export default MaterialListPage;
