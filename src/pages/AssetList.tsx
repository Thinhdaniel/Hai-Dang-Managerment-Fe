import React, { lazy, useEffect, useMemo, useState } from 'react';
import { App, Button, Input, Select, Space, Table, Tooltip, Typography, type TableColumnsType } from 'antd';
import {
    AppstoreOutlined,
    CheckCircleOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    EyeOutlined,
    InboxOutlined,
    PlusOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    SearchOutlined,
    SwapOutlined,
    ToolOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ConfirmAction from '../components/shared/ConfirmAction';
import LazyBoundary from '../components/shared/LazyBoundary';
import PageHeader from '../components/shared/PageHeader';
import AssetQrModal from '../components/AssetQrModal';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess, isAdmin } from '../core/lib/permissions';
import { normalizeSearchTerm } from '../core/lib/search';
import { brandService, plantService } from '../core/services';
import { assetService } from '../core/services/asset.service';
import { transferService } from '../core/services/transfer.service';
import type { Asset, AssetStatus, CreateTransferPayload } from '../core/types';

const AssetFormModal = lazy(() => import('../components/AssetFormModal'));
const AssetImportModal = lazy(() => import('../components/AssetImportModal'));
const TransferModal = lazy(() => import('../components/transfer/TransferModal'));

const { Text } = Typography;

const statusMeta: Record<AssetStatus, { bg: string; text: string; border: string; dot: string; label: string }> = {
    active: {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
        label: 'Hoạt động',
    },
    maintenance: {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
        label: 'Bảo trì',
    },
    broken: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500', label: 'Lỗi' },
    borrowing: {
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-200',
        dot: 'bg-indigo-500',
        label: 'Đang mượn',
    },
    storage: {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300',
        dot: 'bg-slate-500',
        label: 'Tồn kho',
    },
};

const PAGE_ANIM = `
@keyframes al-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.al-h{animation:al-up .28s cubic-bezier(.22,1,.36,1) .04s both}
.al-s{animation:al-up .30s cubic-bezier(.22,1,.36,1) .12s both}
.al-f{animation:al-up .30s cubic-bezier(.22,1,.36,1) .18s both}
.al-t{animation:al-up .32s cubic-bezier(.22,1,.36,1) .24s both}
.al-stat{transition:background-color 130ms cubic-bezier(.22,1,.36,1)}
.al-stat:hover{background-color:oklch(0.975 0.005 250)}
.al-sel{animation:al-up .2s cubic-bezier(.22,1,.36,1) both}
@media(prefers-reduced-motion:reduce){.al-h,.al-s,.al-f,.al-t,.al-sel{animation:none}.al-stat{transition:none}}
`;

const createDefaultFilters = (search = '') => ({
    page: 1,
    limit: 10,
    search,
    status: undefined as AssetStatus | undefined,
    plantId: undefined as string | undefined,
    brandId: undefined as string | undefined,
    type: undefined as string | undefined,
});

const AssetList: React.FC = () => {
    const navigate = useNavigate();
    const { role } = useAuth();
    const [searchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { message } = App.useApp();

    const initialSearch = normalizeSearchTerm(searchParams.get('search'));
    const canManageAssets = isAdmin(role);
    const canExportImport = hasManagerAccess(role);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
    const [transferTarget, setTransferTarget] = useState<Asset | null>(null);
    const [qrAsset, setQrAsset] = useState<Asset | null>(null);
    const [qrLoadingAssetId, setQrLoadingAssetId] = useState<string | null>(null);
    const [filters, setFilters] = useState(() => createDefaultFilters(initialSearch));
    const [draftFilters, setDraftFilters] = useState(() => createDefaultFilters(initialSearch));

    useEffect(() => {
        const normalizedQuerySearch = normalizeSearchTerm(searchParams.get('search'));

        setDraftFilters((prev) => ({ ...prev, search: normalizedQuerySearch }));
        setFilters((prev) =>
            prev.search === normalizedQuerySearch ? prev : { ...prev, page: 1, search: normalizedQuerySearch }
        );
    }, [searchParams]);

    const { data: assetResponse, isLoading } = useQuery({
        queryKey: ['assets', filters],
        queryFn: () => assetService.getAll(filters),
    });

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const { data: brands = [] } = useQuery({
        queryKey: ['brands'],
        queryFn: () => brandService.getAll(),
    });

    const { data: types = [] } = useQuery({
        queryKey: ['asset-types'],
        queryFn: () => assetService.getTypes(),
    });

    // Stats base — uses committed filters without status/pagination for per-status counts
    const statsFiltersBase = useMemo(
        () => ({
            search: filters.search,
            plantId: filters.plantId,
            brandId: filters.brandId,
            type: filters.type,
            page: 1,
            limit: 1,
        }),
        [filters.search, filters.plantId, filters.brandId, filters.type]
    );

    const { data: statActive } = useQuery({
        queryKey: ['asset-stat', 'active', statsFiltersBase],
        queryFn: () => assetService.getAll({ ...statsFiltersBase, status: 'active' as AssetStatus }),
    });
    const { data: statMaintenance } = useQuery({
        queryKey: ['asset-stat', 'maintenance', statsFiltersBase],
        queryFn: () => assetService.getAll({ ...statsFiltersBase, status: 'maintenance' as AssetStatus }),
    });
    const { data: statBroken } = useQuery({
        queryKey: ['asset-stat', 'broken', statsFiltersBase],
        queryFn: () => assetService.getAll({ ...statsFiltersBase, status: 'broken' as AssetStatus }),
    });
    const { data: statBorrowing } = useQuery({
        queryKey: ['asset-stat', 'borrowing', statsFiltersBase],
        queryFn: () => assetService.getAll({ ...statsFiltersBase, status: 'borrowing' as AssetStatus }),
    });
    const { data: statStorage } = useQuery({
        queryKey: ['asset-stat', 'storage', statsFiltersBase],
        queryFn: () => assetService.getAll({ ...statsFiltersBase, status: 'storage' as AssetStatus }),
    });

    const createMutation = useMutation({
        mutationFn: assetService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['asset-models'] });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Asset> }) => assetService.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['asset-models'] });
            if (editingAsset?.id) {
                queryClient.invalidateQueries({ queryKey: ['asset', editingAsset.id] });
            }
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => assetService.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['asset-models'] });
        },
    });

    const createTransferMutation = useMutation({
        mutationFn: transferService.create,
        onSuccess: (_transfer, payload) => {
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            queryClient.invalidateQueries({ queryKey: ['asset', payload.assetId] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });

    const ensurePublicIdMutation = useMutation({
        mutationFn: (id: string) => assetService.ensurePublicId(id),
        onSuccess: (_data, assetId) => {
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['asset', assetId] });
        },
    });

    const assets = useMemo(() => assetResponse?.data ?? [], [assetResponse?.data]);
    const selectedAssets = useMemo(
        () => assets.filter((asset) => selectedRowKeys.includes(asset.id)),
        [assets, selectedRowKeys]
    );

    const assetSummary = useMemo(
        () => ({
            active: statActive?.total ?? 0,
            maintenance: statMaintenance?.total ?? 0,
            broken: statBroken?.total ?? 0,
            borrowing: statBorrowing?.total ?? 0,
            storage: statStorage?.total ?? 0,
            get total() {
                return this.active + this.maintenance + this.broken + this.borrowing + this.storage;
            },
        }),
        [statActive, statMaintenance, statBroken, statBorrowing, statStorage]
    );

    const applyFilters = () => {
        const nextFilters = {
            ...draftFilters,
            search: normalizeSearchTerm(draftFilters.search),
            page: 1,
        };

        setDraftFilters(nextFilters);
        setFilters(nextFilters);
    };

    const resetFilters = () => {
        const resetValue = createDefaultFilters();
        setDraftFilters(resetValue);
        setFilters(resetValue);
    };

    const handleOpenCreate = () => {
        setEditingAsset(null);
        setIsFormModalOpen(true);
    };

    const handleOpenEdit = (asset: Asset) => {
        setEditingAsset(asset);
        setIsFormModalOpen(true);
    };

    const handleOpenTransfer = (asset: Asset) => {
        setTransferTarget(asset);
        setIsTransferModalOpen(true);
    };

    const handleOpenQr = async (asset: Asset) => {
        if (asset.publicId) {
            setQrAsset(asset);
            return;
        }

        try {
            setQrLoadingAssetId(asset.id);
            const result = await ensurePublicIdMutation.mutateAsync(asset.id);
            setQrAsset({ ...asset, publicId: result.publicId });
            message.success('Đã tạo liên kết công khai cho thiết bị');
        } finally {
            setQrLoadingAssetId(null);
        }
    };

    const handleDelete = async (assetId: string) => {
        await deleteMutation.mutateAsync(assetId);
        message.success('Đã xóa thiết bị');
    };

    const handleDeleteSelected = async () => {
        await Promise.all(selectedRowKeys.map((id) => deleteMutation.mutateAsync(String(id))));
        setSelectedRowKeys([]);
        message.success('Đã xóa các thiết bị đã chọn');
    };

    const handleExport = async () => {
        const blob = await assetService.exportExcel(filters);
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'assets.xlsx';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    const handleFormSubmit = async (values: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) => {
        if (editingAsset) {
            await updateMutation.mutateAsync({ id: editingAsset.id, data: values });
            return;
        }
        await createMutation.mutateAsync(values);
    };

    const handleTransferSubmit = async (payload: CreateTransferPayload) => {
        await createTransferMutation.mutateAsync(payload);
        message.success('Đã tạo lệnh điều chuyển thiết bị');
        setIsTransferModalOpen(false);
        setTransferTarget(null);
    };

    const columns: TableColumnsType<Asset> = [
        {
            title: 'THIẾT BỊ',
            dataIndex: 'name',
            key: 'name',
            render: (_value, record) => (
                <div className='flex flex-col gap-0.5'>
                    <span className='text-[14px] font-semibold text-slate-800'>{record.name}</span>
                    <span className='text-xs font-medium text-slate-500'>
                        {record.area || record.plant?.name || 'Chưa gắn khu vực'}
                    </span>
                </div>
            ),
        },
        {
            title: 'MÃ MÁY',
            dataIndex: 'machineCode',
            key: 'machineCode',
            render: (text: string) => (
                <span className='inline-flex items-center rounded border border-blue-100 bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700'>
                    {text}
                </span>
            ),
        },
        {
            title: 'SERIAL',
            dataIndex: 'serial',
            key: 'serial',
            render: (text?: string) => <span className='font-medium text-slate-500'>{text || '-'}</span>,
        },
        {
            title: 'LOẠI / MODEL',
            dataIndex: 'model',
            key: 'model',
            render: (value: string, record) => (
                <div className='flex flex-col gap-0.5'>
                    <span className='inline-flex w-fit items-center rounded bg-indigo-50 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-700'>
                        {value || record.type || '-'}
                    </span>
                    {record.type && value && (
                        <span className='text-xs text-slate-400'>{record.type}</span>
                    )}
                </div>
            ),
        },
        {
            title: 'NHÃN HIỆU',
            dataIndex: ['brand', 'name'],
            key: 'brand',
            render: (_value, record) => <span className='text-slate-700'>{record.brand?.name || '-'}</span>,
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'status',
            key: 'status',
            render: (status: AssetStatus) => {
                const meta = statusMeta[status];
                return (
                    <span
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${meta.bg} ${meta.text} ${meta.border}`}
                    >
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}></span>
                        {meta.label}
                    </span>
                );
            },
        },
        {
            title: 'CƠ SỞ',
            dataIndex: ['plant', 'name'],
            key: 'plant',
            render: (_value, record) => <span className='text-slate-700'>{record.plant?.name || '-'}</span>,
        },
        {
            title: 'THAO TÁC',
            key: 'action',
            width: 220,
            align: 'right',
            render: (_value, record) => (
                <div className='flex items-center justify-end gap-2'>
                    <Tooltip title='Xem chi tiết'>
                        <Button
                            type='text'
                            icon={<EyeOutlined />}
                            className='flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-700'
                            onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/assets/${record.id}`);
                            }}
                        />
                    </Tooltip>
                    {canManageAssets ? (
                        <Tooltip title='Chỉnh sửa'>
                            <Button
                                type='text'
                                icon={<EditOutlined />}
                                className='flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100 hover:text-amber-700'
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEdit(record);
                                }}
                            />
                        </Tooltip>
                    ) : null}
                    <Tooltip title={record.hasOpenTransfer ? 'Thiết bị đang có lệnh điều chuyển chờ xử lý' : 'Điều chuyển thiết bị'}>
                        <Button
                            type='text'
                            disabled={record.hasOpenTransfer}
                            icon={<SwapOutlined />}
                            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                                record.hasOpenTransfer 
                                ? 'bg-slate-50 text-slate-300 cursor-not-allowed' 
                                : 'bg-sky-50 text-sky-600 hover:bg-sky-100 hover:text-sky-700'
                            }`}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!record.hasOpenTransfer) handleOpenTransfer(record);
                            }}
                        />
                    </Tooltip>
                    {canManageAssets ? (
                        <Tooltip title='QR công khai'>
                            <Button
                                type='text'
                                icon={<QrcodeOutlined />}
                                loading={ensurePublicIdMutation.isPending && qrLoadingAssetId === record.id}
                                className='flex h-8 w-8 items-center justify-center rounded-md bg-violet-50 text-violet-600 transition-colors hover:bg-violet-100 hover:text-violet-700'
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenQr(record);
                                }}
                            />
                        </Tooltip>
                    ) : null}
                    {canManageAssets ? (
                        <ConfirmAction
                            title='Xóa thiết bị'
                            description={`Thiết bị “${record.name}” sẽ bị xóa mềm khỏi hệ thống. Không thể hoàn tác.`}
                            okLabel='Xóa'
                            onConfirm={() => handleDelete(record.id)}
                        >
                            <div onClick={(e) => e.stopPropagation()}>
                                <Tooltip title='Xóa mềm'>
                                    <Button
                                        type='text'
                                        danger
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

    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <style>{PAGE_ANIM}</style>

            <div className='al-h'>
                <PageHeader
                    title='Quản Lý Thiết Bị'
                    subtitle='Theo dõi và quản lý toàn bộ thiết bị trong nhà máy'
                    actions={
                        canExportImport ? (
                            <Space wrap size={8}>
                                <Button icon={<DownloadOutlined />} onClick={handleExport} className='rounded-lg border-slate-200 text-slate-600'>
                                    Export Excel
                                </Button>
                                <Button icon={<InboxOutlined />} onClick={() => setIsImportModalOpen(true)} className='rounded-lg border-slate-200 text-slate-600'>
                                    Import Excel
                                </Button>
                                {canManageAssets ? (
                                    <Button type='primary' icon={<PlusOutlined />} onClick={handleOpenCreate} className='rounded-lg bg-blue-600 hover:!bg-blue-700'>
                                        Thêm thiết bị
                                    </Button>
                                ) : null}
                            </Space>
                        ) : undefined
                    }
                />
            </div>

            {/* Stats count strip — reflects current applied filter */}
            <div className='al-s flex flex-wrap gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200'>
                {[
                    { label: 'Tổng cộng', value: assetSummary.total },
                    { label: 'Hoạt động', value: assetSummary.active, accent: 'oklch(0.42 0.14 145)' },
                    { label: 'Bảo trì', value: assetSummary.maintenance, accent: 'oklch(0.46 0.14 70)' },
                    { label: 'Lỗi / hỏng', value: assetSummary.broken, accent: 'oklch(0.44 0.16 25)' },
                    { label: 'Đang mượn', value: assetSummary.borrowing, accent: 'oklch(0.44 0.14 280)' },
                    { label: 'Tồn kho', value: assetSummary.storage, accent: 'oklch(0.48 0.04 250)' },
                ].map(({ label, value, accent }) => (
                    <div key={label} className='al-stat flex min-w-[100px] flex-1 flex-col gap-0.5 bg-white px-5 py-4'>
                        <span className='text-[11px] font-medium text-slate-400'>{label}</span>
                        <span className='text-base font-bold' style={{ color: accent ?? 'oklch(0.18 0.012 250)' }}>{value}</span>
                    </div>
                ))}
            </div>

            {/* Filter bar — no card wrapper, just controls */}
            <div className='al-f flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
                <div className='flex-1 min-w-[220px]'>
                    <Input
                        prefix={<SearchOutlined className='text-slate-400' />}
                        placeholder='Tên máy, mã máy, serial, model...'
                        value={draftFilters.search}
                        onChange={(event) => setDraftFilters((prev) => ({ ...prev, search: event.target.value }))}
                        onPressEnter={applyFilters}
                        allowClear
                        className='w-full rounded-lg'
                    />
                </div>
                <Select
                    placeholder='Trạng thái'
                    className='min-w-[148px]'
                    allowClear
                    value={draftFilters.status}
                    onChange={(value) => setDraftFilters((prev) => ({ ...prev, status: value }))}
                    options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
                />
                <Select
                    placeholder='Cơ sở'
                    className='min-w-[148px]'
                    allowClear
                    value={draftFilters.plantId}
                    onChange={(value) => setDraftFilters((prev) => ({ ...prev, plantId: value }))}
                    options={plants.map((plant) => ({ value: plant.id, label: plant.name }))}
                />
                <Select
                    placeholder='Loại máy'
                    className='min-w-[148px]'
                    allowClear
                    value={draftFilters.type}
                    onChange={(value) => setDraftFilters((prev) => ({ ...prev, type: value }))}
                    options={types.map((t) => ({ value: t, label: t }))}
                />
                <Select
                    placeholder='Nhãn hiệu'
                    className='min-w-[148px]'
                    allowClear
                    value={draftFilters.brandId}
                    onChange={(value) => setDraftFilters((prev) => ({ ...prev, brandId: value }))}
                    options={brands.map((b) => ({ value: b.id, label: b.name }))}
                />
                <div className='flex gap-2'>
                    <Button type='primary' icon={<SearchOutlined />} onClick={applyFilters} className='rounded-lg bg-blue-600 hover:!bg-blue-700'>
                        Tìm
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={resetFilters} className='rounded-lg text-slate-500'>
                        Làm mới
                    </Button>
                </div>
            </div>

            <div className='al-t flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                {selectedRowKeys.length > 0 && (
                    <div className='al-sel flex items-center justify-between border-b border-blue-100 bg-blue-50 px-5 py-2.5'>
                        <div className='flex items-center gap-2 text-sm font-medium text-slate-700'>
                            <span className='flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white'>
                                {selectedRowKeys.length}
                            </span>
                            thiết bị đang chọn
                        </div>
                        <div className='flex gap-2'>
                            <Tooltip title={selectedAssets[0]?.hasOpenTransfer ? 'Thiết bị đang có lệnh điều chuyển chờ xử lý' : ''}>
                                <Button
                                    size='small'
                                    disabled={selectedAssets.length !== 1 || selectedAssets[0]?.hasOpenTransfer}
                                    className='rounded-md'
                                    onClick={() => selectedAssets[0] && !selectedAssets[0].hasOpenTransfer && handleOpenTransfer(selectedAssets[0])}
                                >
                                    Điều chuyển
                                </Button>
                            </Tooltip>
                            {canManageAssets ? (
                                <ConfirmAction
                                    title='Xóa các thiết bị đã chọn'
                                    description={`${selectedRowKeys.length} thiết bị sẽ bị xóa mềm. Hành động này không thể hoàn tác.`}
                                    okLabel='Xóa tất cả'
                                    onConfirm={handleDeleteSelected}
                                >
                                    <Button size='small' danger className='rounded-md'>Xóa đã chọn</Button>
                                </ConfirmAction>
                            ) : null}
                        </div>
                    </div>
                )}

                <div className='[&_.ant-table-row]:group [&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-blue-50/30 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400 [&_.ant-table-cell]:!transition-colors [&_.ant-table-cell]:!duration-100'>
                    <Table<Asset>
                        rowKey='id'
                        rowSelection={{
                            selectedRowKeys,
                            onChange: setSelectedRowKeys,
                            columnWidth: 44,
                        }}
                        columns={columns}
                        dataSource={assets}
                        loading={isLoading}
                        scroll={{ x: 1100 }}
                        onRow={(record) => ({
                            onClick: () => navigate(`/assets/${record.id}`),
                            className: 'cursor-pointer',
                        })}
                        pagination={{
                            current: assetResponse?.page ?? filters.page,
                            total: assetResponse?.total ?? 0,
                            pageSize: assetResponse?.limit ?? filters.limit,
                            showSizeChanger: true,
                            showTotal: (total, range) => (
                                <span className='text-sm text-slate-400'>
                                    {range[0]}–{range[1]} / {total} thiết bị
                                </span>
                            ),
                            onChange: (page, pageSize) => setFilters((prev) => ({ ...prev, page, limit: pageSize })),
                            className: '!m-0 border-t border-slate-100 !px-5 !py-3',
                        }}
                        size='small'
                    />
                </div>
            </div>

            {isFormModalOpen ? (
                <LazyBoundary mode='overlay'>
                    <AssetFormModal
                        open={isFormModalOpen}
                        onClose={() => setIsFormModalOpen(false)}
                        initialValues={editingAsset}
                        onSubmit={handleFormSubmit}
                        plants={plants}
                        brands={brands}
                    />
                </LazyBoundary>
            ) : null}

            {isImportModalOpen ? (
                <LazyBoundary mode='overlay'>
                    <AssetImportModal
                        open={isImportModalOpen}
                        onClose={() => setIsImportModalOpen(false)}
                        onImported={(result) => {
                            queryClient.invalidateQueries({ queryKey: ['assets'] });
                            queryClient.invalidateQueries({ queryKey: ['asset-models'] });
                            setIsImportModalOpen(false);
                            message.success(
                                `Import xong ${result.summary.importedRows} may, loi ${result.summary.failedRows} dong`
                            );
                        }}
                    />
                </LazyBoundary>
            ) : null}

            {isTransferModalOpen ? (
                <LazyBoundary mode='overlay'>
                    <TransferModal
                        open={isTransferModalOpen}
                        asset={transferTarget}
                        plants={plants}
                        submitting={createTransferMutation.isPending}
                        onClose={() => {
                            setIsTransferModalOpen(false);
                            setTransferTarget(null);
                        }}
                        onSubmit={handleTransferSubmit}
                    />
                </LazyBoundary>
            ) : null}

            {qrAsset ? (
                <AssetQrModal
                    open={Boolean(qrAsset)}
                    assetName={qrAsset.name}
                    machineCode={qrAsset.machineCode}
                    publicId={qrAsset.publicId}
                    onClose={() => setQrAsset(null)}
                />
            ) : null}
        </div>
    );
};

export default AssetList;
