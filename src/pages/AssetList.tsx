import React, { lazy, useEffect, useMemo, useState } from 'react';
import {
    App,
    Badge,
    Button,
    Drawer,
    Dropdown,
    Input,
    Select,
    Space,
    Table,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import {
    AppstoreOutlined,
    CheckCircleOutlined,
    DeleteOutlined,
    DownOutlined,
    DownloadOutlined,
    EditOutlined,
    EyeOutlined,
    FilterOutlined,
    InboxOutlined,
    PlusOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    ScanOutlined,
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
import AssetAiSearchBar from '../components/AssetAiSearchBar';
import type { AiAssetSearchFilters } from '../core/services/ai-help.service';
import { useAuth } from '../core/contexts/AuthContext';
import { can } from '../core/lib/permissions';
import { normalizeSearchTerm } from '../core/lib/search';
import { brandService, plantService } from '../core/services';
import { assetService } from '../core/services/asset.service';
import { transferService } from '../core/services/transfer.service';
import { ASSET_OWNERSHIP_LABEL, ASSET_OWNERSHIP_OPTIONS, isReturnedToPartner } from '../core/constants';
import { AssetOwnershipType, AssetStatus, type Asset, type CreateTransferPayload } from '../core/types';

const AssetFormModal = lazy(() => import('../components/AssetFormModal'));
const AssetImportModal = lazy(() => import('../components/AssetImportModal'));
const TransferModal = lazy(() => import('../components/transfer/TransferModal'));
const QrScanLookupModal = lazy(() => import('../components/QrScanLookupModal'));
const QrQuickUpdateModal = lazy(() => import('../components/QrQuickUpdateModal'));
const QrQuickMaintenanceModal = lazy(() => import('../components/QrQuickMaintenanceModal'));

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
    returned_to_partner: {
        bg: 'bg-slate-100',
        text: 'text-slate-600',
        border: 'border-slate-300',
        dot: 'bg-slate-400',
        label: 'Đã trả đối tác',
    },
};

const ownershipMeta: Record<AssetOwnershipType, { label: string; className: string }> = {
    owned: {
        label: ASSET_OWNERSHIP_LABEL.owned,
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    partner_borrowed: {
        label: ASSET_OWNERSHIP_LABEL.partner_borrowed,
        className: 'border-violet-200 bg-violet-50 text-violet-700',
    },
    rental: {
        label: ASSET_OWNERSHIP_LABEL.rental,
        className: 'border-amber-200 bg-amber-50 text-amber-700',
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
    name: undefined as string | undefined,
    ownershipType: undefined as AssetOwnershipType | undefined,
});

const renderStatusPill = (status: AssetStatus) => {
    const meta = statusMeta[status] ?? statusMeta.active;

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${meta.bg} ${meta.text} ${meta.border}`}
        >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}></span>
            {meta.label}
        </span>
    );
};

const renderOwnershipPill = (ownershipType: AssetOwnershipType = AssetOwnershipType.OWNED) => {
    const meta = ownershipMeta[ownershipType] ?? ownershipMeta.owned;

    return (
        <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
            {meta.label}
        </span>
    );
};

const getAssetLocation = (asset: Asset) => asset.area || asset.plant?.name || 'Chưa gắn khu vực';
const formatNumber = (value?: number) => (value ?? 0).toLocaleString('vi-VN');

const AssetList: React.FC = () => {
    const navigate = useNavigate();
    const { role } = useAuth();
    const [searchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { message } = App.useApp();

    const initialSearch = normalizeSearchTerm(searchParams.get('search'));
    const canWriteAssets = can(role, 'asset.write');
    const canDeleteAssets = can(role, 'asset.delete');
    const canExportImport = can(role, 'asset.write');
    const canQuickUpdate = can(role, 'asset.status');
    const canCreateTransfer = can(role, 'transfer.write');
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [selectedAssetMap, setSelectedAssetMap] = useState<Record<string, Asset>>({});
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isScanLookupOpen, setIsScanLookupOpen] = useState(false);
    const [isQuickMaintenanceOpen, setIsQuickMaintenanceOpen] = useState(false);
    const [scanMode, setScanMode] = useState<'profile' | 'quick'>('profile');
    const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
    const [transferTarget, setTransferTarget] = useState<Asset | null>(null);
    const [transferTargets, setTransferTargets] = useState<Asset[]>([]);
    const [quickUpdateAsset, setQuickUpdateAsset] = useState<Asset | null>(null);
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

    const { data: names = [] } = useQuery({
        queryKey: ['asset-names'],
        queryFn: () => assetService.getNames(),
        staleTime: 5 * 60 * 1000,
    }); // Stats base — uses committed filters without status/pagination for per-status counts
    const statsFiltersBase = useMemo(
        () => ({
            search: filters.search,
            plantId: filters.plantId,
            brandId: filters.brandId,
            name: filters.name,
            ownershipType: filters.ownershipType,
            page: 1,
            limit: 1,
        }),
        [filters.search, filters.plantId, filters.brandId, filters.name, filters.ownershipType]
    );

    const ownedStatsFiltersBase = useMemo(
        () => ({
            search: filters.search,
            plantId: filters.plantId,
            brandId: filters.brandId,
            name: filters.name,
            ownershipType: AssetOwnershipType.OWNED,
            page: 1,
            limit: 1,
        }),
        [filters.search, filters.plantId, filters.brandId, filters.name]
    );

    const { data: statOwned } = useQuery({
        queryKey: ['asset-stat', 'owned', ownedStatsFiltersBase],
        queryFn: () => assetService.getAll(ownedStatsFiltersBase),
    });

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
    const { data: statReturnedToPartner } = useQuery({
        queryKey: ['asset-stat', 'returned-to-partner', statsFiltersBase],
        queryFn: () =>
            assetService.getAll({ ...statsFiltersBase, status: AssetStatus.RETURNED_TO_PARTNER as AssetStatus }),
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
            [...(payload.assetIds ?? []), payload.assetId]
                .filter(Boolean)
                .forEach((assetId) => queryClient.invalidateQueries({ queryKey: ['asset', assetId] }));
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
        () =>
            selectedRowKeys
                .map((key) => selectedAssetMap[String(key)] ?? assets.find((asset) => asset.id === String(key)))
                .filter((asset): asset is Asset => Boolean(asset)),
        [assets, selectedAssetMap, selectedRowKeys]
    );
    const selectedAssetIdSet = useMemo(() => new Set(selectedRowKeys.map(String)), [selectedRowKeys]);
    const currentPage = assetResponse?.page ?? filters.page;
    const pageSize = assetResponse?.limit ?? filters.limit;
    const totalItems = assetResponse?.total ?? 0;
    const totalPages = Math.max(assetResponse?.totalPages ?? Math.ceil(totalItems / Math.max(pageSize, 1)), 1);
    const pageStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const pageEnd = Math.min(currentPage * pageSize, totalItems);

    const assetSummary = useMemo(
        () => ({
            active: statActive?.total ?? 0,
            maintenance: statMaintenance?.total ?? 0,
            broken: statBroken?.total ?? 0,
            borrowing: statBorrowing?.total ?? 0,
            storage: statStorage?.total ?? 0,
            returnedToPartner: statReturnedToPartner?.total ?? 0,
            owned: statOwned?.total ?? 0,
            get total() {
                return (
                    this.active +
                    this.maintenance +
                    this.broken +
                    this.borrowing +
                    this.storage +
                    this.returnedToPartner
                );
            },
        }),
        [statActive, statMaintenance, statBroken, statBorrowing, statStorage, statReturnedToPartner, statOwned]
    );
    const activeFilterChips = useMemo(() => {
        const chips: string[] = [];

        if (filters.search) chips.push(`Từ khóa: ${filters.search}`);
        if (filters.plantId) chips.push(plants.find((plant) => plant.id === filters.plantId)?.name ?? 'Cơ sở đã chọn');
        if (filters.name) chips.push(`Tên máy: ${filters.name}`);
        if (filters.brandId) chips.push(brands.find((brand) => brand.id === filters.brandId)?.name ?? 'Nhãn hiệu');
        if (filters.status) chips.push(statusMeta[filters.status]?.label ?? 'Trạng thái');
        if (filters.ownershipType) {
            chips.push(ownershipMeta[filters.ownershipType]?.label ?? 'Nguồn gốc');
        }

        return chips;
    }, [brands, filters, plants]);
    const activeFilterCount = activeFilterChips.length;

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

    const handleAiApply = (aiFilters: AiAssetSearchFilters) => {
        const nextFilters = {
            ...createDefaultFilters(),
            search: aiFilters.search ?? '',
            status: (aiFilters.status as AssetStatus | undefined) ?? undefined,
            plantId: aiFilters.plantId ?? undefined,
            brandId: aiFilters.brandId ?? undefined,
            ownershipType: (aiFilters.ownershipType as AssetOwnershipType | undefined) ?? undefined,
            page: 1,
        };

        setDraftFilters(nextFilters);
        setFilters(nextFilters);
    };

    const handleApplyMobileFilters = () => {
        applyFilters();
        setIsMobileFilterOpen(false);
    };

    const handleResetMobileFilters = () => {
        resetFilters();
        setIsMobileFilterOpen(false);
    };

    const handleSelectionChange = (keys: React.Key[], rows: Asset[]) => {
        const nextKeySet = new Set(keys.map(String));

        setSelectedRowKeys(keys);
        setSelectedAssetMap((prev) => {
            const next = Object.fromEntries(Object.entries(prev).filter(([id]) => nextKeySet.has(id))) as Record<
                string,
                Asset
            >;

            assets.forEach((asset) => {
                if (nextKeySet.has(asset.id)) {
                    next[asset.id] = asset;
                }
            });

            rows.forEach((asset) => {
                if (nextKeySet.has(asset.id)) {
                    next[asset.id] = asset;
                }
            });

            return next;
        });
    };

    const clearSelectedAssets = () => {
        setSelectedRowKeys([]);
        setSelectedAssetMap({});
    };

    const handleToggleMobileSelection = (asset: Asset) => {
        if (isReturnedToPartner(asset.status)) {
            message.warning('Máy đã trả đối tác, không thể chọn để điều chuyển');
            return;
        }

        const isSelected = selectedAssetIdSet.has(asset.id);

        setSelectedRowKeys((current) =>
            isSelected ? current.filter((key) => String(key) !== asset.id) : [...current, asset.id]
        );
        setSelectedAssetMap((current) => {
            const next = { ...current };

            if (isSelected) {
                delete next[asset.id];
            } else {
                next[asset.id] = asset;
            }

            return next;
        });
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
        if (isReturnedToPartner(asset.status)) {
            message.warning('Máy đã trả đối tác, không thể tạo lệnh điều chuyển');
            return;
        }

        setTransferTarget(asset);
        setTransferTargets([asset]);
        setIsTransferModalOpen(true);
    };

    const handleOpenSelectedTransfer = () => {
        const returnedPartnerAssets = selectedAssets.filter((asset) => isReturnedToPartner(asset.status));
        if (returnedPartnerAssets.length) {
            message.warning(
                `Không thể điều chuyển máy đã trả đối tác: ${returnedPartnerAssets.map((asset) => asset.name).join(', ')}`
            );
            return;
        }

        const blocked = selectedAssets.filter((asset) => asset.hasOpenTransfer);
        if (blocked.length) {
            message.warning(
                `Không thể điều chuyển vì có máy đang có lệnh mở: ${blocked.map((asset) => asset.name).join(', ')}`
            );
            return;
        }

        const [firstAsset] = selectedAssets;
        const hasDifferentSource = selectedAssets.some(
            (asset) => asset.plantId !== firstAsset.plantId || (asset.area || '') !== (firstAsset.area || '')
        );

        if (hasDifferentSource) {
            message.warning('Chỉ có thể tạo một lệnh cho các máy cùng cơ sở và cùng khu vực hiện tại');
            return;
        }

        setTransferTarget(firstAsset);
        setTransferTargets(selectedAssets);
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

    const handleOpenScan = (mode: 'profile' | 'quick' | 'maintenance') => {
        if (mode === 'maintenance') {
            setIsQuickMaintenanceOpen(true);
            return;
        }
        setScanMode(mode);
        setIsScanLookupOpen(true);
    };

    const handleDelete = async (assetId: string) => {
        await deleteMutation.mutateAsync(assetId);
        message.success('Đã xóa thiết bị');
    };

    const handleDeleteSelected = async () => {
        await Promise.all(selectedRowKeys.map((id) => deleteMutation.mutateAsync(String(id))));
        clearSelectedAssets();
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
        setTransferTargets([]);
        clearSelectedAssets();
    };

    const columns: TableColumnsType<Asset> = [
        {
            title: 'THIẾT BỊ',
            dataIndex: 'name',
            key: 'name',
            render: (_value, record) => (
                <div className='flex flex-col gap-0.5'>
                    <span className='text-[14px] font-semibold text-slate-800'>{record.name}</span>
                    <span className='text-xs font-medium text-slate-500'>{getAssetLocation(record)}</span>
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
                    {record.type && value && <span className='text-xs text-slate-400'>{record.type}</span>}
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
            render: renderStatusPill,
        },
        {
            title: 'NGUỒN GỐC',
            dataIndex: 'ownershipType',
            key: 'ownershipType',
            render: renderOwnershipPill,
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
                    {canWriteAssets ? (
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
                    {canCreateTransfer ? (
                        <Tooltip
                            title={
                                isReturnedToPartner(record.status)
                                    ? 'Máy đã trả đối tác, không thể điều chuyển'
                                    : record.hasOpenTransfer
                                      ? 'Thiết bị đang có lệnh điều chuyển chờ xử lý'
                                      : 'Điều chuyển thiết bị'
                            }
                        >
                            <Button
                                type='text'
                                disabled={record.hasOpenTransfer || isReturnedToPartner(record.status)}
                                icon={<SwapOutlined />}
                                className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                                    record.hasOpenTransfer || isReturnedToPartner(record.status)
                                        ? 'cursor-not-allowed bg-slate-50 text-slate-300'
                                        : 'bg-sky-50 text-sky-600 hover:bg-sky-100 hover:text-sky-700'
                                }`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!record.hasOpenTransfer && !isReturnedToPartner(record.status))
                                        handleOpenTransfer(record);
                                }}
                            />
                        </Tooltip>
                    ) : null}
                    {canWriteAssets ? (
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
                    {canDeleteAssets ? (
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
                        <Space wrap size={8}>
                            <Dropdown
                                trigger={['click']}
                                menu={{
                                    items: [
                                        { key: 'profile', label: 'Quét mở hồ sơ', icon: <EyeOutlined /> },
                                        ...(canQuickUpdate
                                            ? [
                                                  {
                                                      key: 'quick',
                                                      label: 'Quét cập nhật nhanh',
                                                      icon: <ToolOutlined />,
                                                  },
                                              ]
                                            : []),
                                        {
                                            key: 'maintenance',
                                            label: 'Quét tạo bảo trì',
                                            icon: <WarningOutlined />,
                                        },
                                    ],
                                    onClick: ({ key }) => handleOpenScan(key as 'profile' | 'quick' | 'maintenance'),
                                }}
                            >
                                <Button
                                    icon={<ScanOutlined />}
                                    className='rounded-lg border-blue-200 font-medium text-blue-600 hover:!border-blue-300 hover:!text-blue-700'
                                >
                                    Quét QR <DownOutlined />
                                </Button>
                            </Dropdown>
                            {canExportImport ? (
                                <>
                                    <Button
                                        icon={<DownloadOutlined />}
                                        onClick={handleExport}
                                        className='rounded-lg border-slate-200 text-slate-600'
                                    >
                                        Export Excel
                                    </Button>
                                    <Button
                                        icon={<InboxOutlined />}
                                        onClick={() => setIsImportModalOpen(true)}
                                        className='rounded-lg border-slate-200 text-slate-600'
                                    >
                                        Import Excel
                                    </Button>
                                </>
                            ) : null}
                            {canWriteAssets ? (
                                <Button
                                    type='primary'
                                    icon={<PlusOutlined />}
                                    onClick={handleOpenCreate}
                                    className='rounded-lg bg-blue-600 hover:!bg-blue-700'
                                >
                                    Thêm thiết bị
                                </Button>
                            ) : null}
                        </Space>
                    }
                />
            </div>

            <div className='al-s'>
                <AssetAiSearchBar onApply={handleAiApply} onReset={resetFilters} />
            </div>

            {/* Stats count strip — reflects current applied filter */}
            <div className='al-s asset-list-stats flex flex-wrap gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200'>
                {[
                    { label: 'Trong bộ lọc', value: assetSummary.total },
                    { label: 'Máy Hải Đăng', value: assetSummary.owned, accent: 'oklch(0.36 0.12 160)' },
                    { label: 'Hoạt động', value: assetSummary.active, accent: 'oklch(0.42 0.14 145)' },
                    { label: 'Bảo trì', value: assetSummary.maintenance, accent: 'oklch(0.46 0.14 70)' },
                    { label: 'Lỗi / hỏng', value: assetSummary.broken, accent: 'oklch(0.44 0.16 25)' },
                    { label: 'Đang mượn', value: assetSummary.borrowing, accent: 'oklch(0.44 0.14 280)' },
                    { label: 'Tồn kho', value: assetSummary.storage, accent: 'oklch(0.48 0.04 250)' },
                    { label: 'Đã trả đối tác', value: assetSummary.returnedToPartner, accent: 'oklch(0.46 0.02 250)' },
                ].map(({ label, value, accent }) => (
                    <div key={label} className='al-stat flex min-w-[100px] flex-1 flex-col gap-0.5 bg-white px-5 py-4'>
                        <span className='text-[11px] font-medium text-slate-400'>{label}</span>
                        <span className='text-base font-bold' style={{ color: accent ?? 'oklch(0.18 0.012 250)' }}>
                            {value}
                        </span>
                    </div>
                ))}
            </div>

            <div className='asset-mobile-filter'>
                <div className='asset-mobile-filter__bar'>
                    <Input
                        prefix={<SearchOutlined className='text-slate-400' />}
                        placeholder='Tìm mã máy, tên máy, serial...'
                        value={draftFilters.search}
                        onChange={(event) => setDraftFilters((prev) => ({ ...prev, search: event.target.value }))}
                        onPressEnter={handleApplyMobileFilters}
                        allowClear
                    />
                    <Badge count={activeFilterCount} size='small' offset={[-2, 4]}>
                        <Button icon={<FilterOutlined />} onClick={() => setIsMobileFilterOpen(true)}>
                            Lọc
                        </Button>
                    </Badge>
                </div>
                <div className='asset-mobile-filter__meta'>
                    <span>{formatNumber(totalItems)} thiết bị</span>
                    {activeFilterChips.length ? (
                        <div className='asset-mobile-filter__chips'>
                            {activeFilterChips.slice(0, 3).map((chip) => (
                                <span key={chip}>{chip}</span>
                            ))}
                            {activeFilterChips.length > 3 ? <span>+{activeFilterChips.length - 3}</span> : null}
                        </div>
                    ) : (
                        <span>Chưa áp dụng bộ lọc</span>
                    )}
                </div>
            </div>

            {/* Filter bar — no card wrapper, just controls */}
            <div className='al-f asset-filter-bar flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
                <Select
                    placeholder='Cơ sở'
                    className='min-w-[148px]'
                    allowClear
                    value={draftFilters.plantId}
                    onChange={(value) => setDraftFilters((prev) => ({ ...prev, plantId: value }))}
                    options={plants.map((plant) => ({ value: plant.id, label: plant.name }))}
                />
                <Select
                    showSearch={{ optionFilterProp: 'label' }}
                    placeholder='Tên máy'
                    className='min-w-[148px]'
                    allowClear
                    value={draftFilters.name}
                    onChange={(value) => setDraftFilters((prev) => ({ ...prev, name: value }))}
                    options={names.map((n) => ({ value: n, label: n }))}
                />
                <Select
                    showSearch={{ optionFilterProp: 'label' }}
                    placeholder='Nhãn hiệu'
                    className='min-w-[148px]'
                    allowClear
                    value={draftFilters.brandId}
                    onChange={(value) => setDraftFilters((prev) => ({ ...prev, brandId: value }))}
                    options={brands.map((b) => ({ value: b.id, label: b.name }))}
                />
                <Select
                    placeholder='Trạng thái'
                    className='min-w-[148px]'
                    allowClear
                    value={draftFilters.status}
                    onChange={(value) => setDraftFilters((prev) => ({ ...prev, status: value }))}
                    options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
                />
                <Select
                    placeholder='Nguồn gốc'
                    className='min-w-[160px]'
                    allowClear
                    value={draftFilters.ownershipType}
                    onChange={(value) => setDraftFilters((prev) => ({ ...prev, ownershipType: value }))}
                    options={ASSET_OWNERSHIP_OPTIONS}
                />
                <div className='min-w-[220px] flex-1'>
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
                <div className='asset-filter-actions flex gap-2'>
                    <Button
                        type='primary'
                        icon={<SearchOutlined />}
                        onClick={applyFilters}
                        className='rounded-lg bg-blue-600 hover:!bg-blue-700'
                    >
                        Tìm
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={resetFilters} className='rounded-lg text-slate-500'>
                        Làm mới
                    </Button>
                </div>
            </div>

            <Drawer
                title='Bộ lọc thiết bị'
                placement='bottom'
                size='auto'
                open={isMobileFilterOpen}
                onClose={() => setIsMobileFilterOpen(false)}
                className='asset-filter-drawer'
                styles={{ body: { padding: 0 } }}
            >
                <div className='asset-filter-sheet'>
                    <div className='asset-filter-sheet__summary'>
                        <span>{formatNumber(totalItems)} thiết bị trong kết quả</span>
                        {activeFilterCount > 0 ? <strong>{activeFilterCount} bộ lọc đang áp dụng</strong> : null}
                    </div>
                    <div className='asset-filter-sheet__controls'>
                        <label>
                            <span>Cơ sở</span>
                            <Select
                                placeholder='Chọn cơ sở'
                                allowClear
                                value={draftFilters.plantId}
                                onChange={(value) => setDraftFilters((prev) => ({ ...prev, plantId: value }))}
                                options={plants.map((plant) => ({ value: plant.id, label: plant.name }))}
                            />
                        </label>
                        <label>
                            <span>Tên máy</span>
                            <Select
                                showSearch={{ optionFilterProp: 'label' }}
                                placeholder='Chọn tên máy'
                                allowClear
                                value={draftFilters.name}
                                onChange={(value) => setDraftFilters((prev) => ({ ...prev, name: value }))}
                                options={names.map((n) => ({ value: n, label: n }))}
                            />
                        </label>
                        <label>
                            <span>Nhãn hiệu</span>
                            <Select
                                showSearch={{ optionFilterProp: 'label' }}
                                placeholder='Chọn nhãn hiệu'
                                allowClear
                                value={draftFilters.brandId}
                                onChange={(value) => setDraftFilters((prev) => ({ ...prev, brandId: value }))}
                                options={brands.map((b) => ({ value: b.id, label: b.name }))}
                            />
                        </label>
                        <label>
                            <span>Trạng thái</span>
                            <Select
                                placeholder='Chọn trạng thái'
                                allowClear
                                value={draftFilters.status}
                                onChange={(value) => setDraftFilters((prev) => ({ ...prev, status: value }))}
                                options={Object.entries(statusMeta).map(([value, meta]) => ({
                                    value,
                                    label: meta.label,
                                }))}
                            />
                        </label>
                        <label>
                            <span>Nguồn gốc</span>
                            <Select
                                placeholder='Chọn nguồn gốc'
                                allowClear
                                value={draftFilters.ownershipType}
                                onChange={(value) => setDraftFilters((prev) => ({ ...prev, ownershipType: value }))}
                                options={ASSET_OWNERSHIP_OPTIONS}
                            />
                        </label>
                    </div>
                    <div className='asset-filter-sheet__actions'>
                        <Button onClick={handleResetMobileFilters}>Đặt lại</Button>
                        <Button type='primary' icon={<SearchOutlined />} onClick={handleApplyMobileFilters}>
                            Áp dụng
                        </Button>
                    </div>
                </div>
            </Drawer>

            <div className='al-t flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                {selectedRowKeys.length > 0 && (
                    <div className='al-sel asset-selection-bar flex items-center justify-between border-b border-blue-100 bg-blue-50 px-5 py-2.5'>
                        <div className='flex items-center gap-2 text-sm font-medium text-slate-700'>
                            <span className='flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white'>
                                {selectedRowKeys.length}
                            </span>
                            thiết bị đang chọn
                        </div>
                        <div className='asset-selection-actions flex gap-2'>
                            {canCreateTransfer ? (
                                <Tooltip
                                    title={
                                        selectedAssets[0]?.hasOpenTransfer
                                            ? 'Thiết bị đang có lệnh điều chuyển chờ xử lý'
                                            : selectedAssets.some((asset) => isReturnedToPartner(asset.status))
                                              ? 'Có máy đã trả đối tác trong danh sách chọn'
                                              : ''
                                    }
                                >
                                    <Button
                                        size='small'
                                        disabled={
                                            selectedAssets.length === 0 ||
                                            selectedAssets.some((asset) => isReturnedToPartner(asset.status))
                                        }
                                        className='rounded-md'
                                        onClick={handleOpenSelectedTransfer}
                                    >
                                        Điều chuyển
                                    </Button>
                                </Tooltip>
                            ) : null}
                            {canDeleteAssets ? (
                                <ConfirmAction
                                    title='Xóa các thiết bị đã chọn'
                                    description={`${selectedRowKeys.length} thiết bị sẽ bị xóa mềm. Hành động này không thể hoàn tác.`}
                                    okLabel='Xóa tất cả'
                                    onConfirm={handleDeleteSelected}
                                >
                                    <Button size='small' danger className='rounded-md'>
                                        Xóa đã chọn
                                    </Button>
                                </ConfirmAction>
                            ) : null}
                        </div>
                    </div>
                )}

                <div className='asset-mobile-list' aria-label='Danh sách thiết bị mobile'>
                    {isLoading ? (
                        <div className='asset-mobile-empty'>Đang tải danh sách thiết bị...</div>
                    ) : assets.length === 0 ? (
                        <div className='asset-mobile-empty'>Không có thiết bị phù hợp bộ lọc hiện tại.</div>
                    ) : (
                        assets.map((asset) => {
                            const transferDisabled =
                                Boolean(asset.hasOpenTransfer) || isReturnedToPartner(asset.status);
                            const isSelected = selectedAssetIdSet.has(asset.id);
                            const selectionDisabled = isReturnedToPartner(asset.status);

                            return (
                                <article
                                    key={asset.id}
                                    className={`asset-mobile-card${isSelected ? 'asset-mobile-card--selected' : ''}`}
                                >
                                    <button
                                        type='button'
                                        className='asset-mobile-card__main'
                                        onClick={() => navigate(`/assets/${asset.id}`)}
                                    >
                                        <span className='asset-mobile-card__heading'>
                                            <span className='asset-mobile-card__title'>{asset.name}</span>
                                            <span className='asset-mobile-card__code'>{asset.machineCode}</span>
                                        </span>
                                        <span className='asset-mobile-card__badges'>
                                            {renderStatusPill(asset.status)}
                                            {renderOwnershipPill(asset.ownershipType)}
                                        </span>
                                        <span className='asset-mobile-card__meta'>
                                            <span>{getAssetLocation(asset)}</span>
                                            <span>{asset.model || asset.type || 'Chưa có model'}</span>
                                            <span>{asset.serial || 'Chưa có serial'}</span>
                                        </span>
                                    </button>
                                    <div className='asset-mobile-card__actions'>
                                        <Button
                                            size='small'
                                            type={isSelected ? 'primary' : 'default'}
                                            icon={<CheckCircleOutlined />}
                                            disabled={selectionDisabled}
                                            onClick={() => handleToggleMobileSelection(asset)}
                                        >
                                            {isSelected ? 'Bỏ chọn' : 'Chọn'}
                                        </Button>
                                        <Button
                                            size='small'
                                            icon={<EyeOutlined />}
                                            onClick={() => navigate(`/assets/${asset.id}`)}
                                        >
                                            Xem
                                        </Button>
                                        {canCreateTransfer ? (
                                            <Button
                                                size='small'
                                                icon={<SwapOutlined />}
                                                disabled={transferDisabled}
                                                onClick={() => handleOpenTransfer(asset)}
                                            >
                                                Điều chuyển
                                            </Button>
                                        ) : null}
                                        {canWriteAssets ? (
                                            <Button
                                                size='small'
                                                icon={<EditOutlined />}
                                                onClick={() => handleOpenEdit(asset)}
                                            >
                                                Sửa
                                            </Button>
                                        ) : null}
                                    </div>
                                </article>
                            );
                        })
                    )}
                </div>

                {assets.length > 0 ? (
                    <div className='asset-mobile-pagination'>
                        <Button
                            size='small'
                            disabled={currentPage <= 1}
                            onClick={() => setFilters((prev) => ({ ...prev, page: currentPage - 1 }))}
                        >
                            Trước
                        </Button>
                        <span>
                            {pageStart}-{pageEnd} / {totalItems}
                        </span>
                        <Button
                            size='small'
                            disabled={currentPage >= totalPages}
                            onClick={() => setFilters((prev) => ({ ...prev, page: currentPage + 1 }))}
                        >
                            Sau
                        </Button>
                    </div>
                ) : null}

                <div className='asset-desktop-table [&_.ant-table-row]:group [&_.ant-table]:!bg-white [&_.ant-table-cell]:!transition-colors [&_.ant-table-cell]:!duration-100 [&_.ant-table-row:hover_td]:!bg-blue-50/30 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400'>
                    <Table<Asset>
                        rowKey='id'
                        rowSelection={{
                            selectedRowKeys,
                            onChange: handleSelectionChange,
                            preserveSelectedRowKeys: true,
                            columnWidth: 44,
                            getCheckboxProps: (record) => ({
                                disabled: isReturnedToPartner(record.status),
                            }),
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
                        assets={transferTargets}
                        plants={plants}
                        submitting={createTransferMutation.isPending}
                        onClose={() => {
                            setIsTransferModalOpen(false);
                            setTransferTarget(null);
                            setTransferTargets([]);
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

            {isScanLookupOpen ? (
                <LazyBoundary mode='overlay'>
                    <QrScanLookupModal
                        open={isScanLookupOpen}
                        onClose={() => setIsScanLookupOpen(false)}
                        title={scanMode === 'quick' ? 'Quét QR cập nhật nhanh' : 'Quét QR mở hồ sơ máy'}
                        subtitle={
                            scanMode === 'quick'
                                ? 'Quét hoặc nhập mã máy để đổi nhanh trạng thái/khu vực'
                                : 'Đưa tem QR trên máy vào khung để mở nhanh chi tiết'
                        }
                        successMessage={(asset) =>
                            scanMode === 'quick' ? `Đã nhận diện "${asset.name}"` : `Mở hồ sơ "${asset.name}"`
                        }
                        auditAction={scanMode === 'quick' ? 'quick_update' : 'open_profile'}
                        auditMetadata={{ screen: 'asset_list' }}
                        onResolved={(asset) => {
                            setIsScanLookupOpen(false);
                            if (scanMode === 'quick') {
                                setQuickUpdateAsset(asset);
                                return;
                            }
                            navigate(`/assets/${asset.id}`);
                        }}
                    />
                </LazyBoundary>
            ) : null}

            {quickUpdateAsset ? (
                <LazyBoundary mode='overlay'>
                    <QrQuickUpdateModal
                        open={Boolean(quickUpdateAsset)}
                        asset={quickUpdateAsset}
                        onClose={() => setQuickUpdateAsset(null)}
                        onUpdated={(asset) => setQuickUpdateAsset(asset)}
                        onScanNext={() => {
                            setQuickUpdateAsset(null);
                            handleOpenScan('quick');
                        }}
                    />
                </LazyBoundary>
            ) : null}

            {isQuickMaintenanceOpen ? (
                <LazyBoundary mode='overlay'>
                    <QrQuickMaintenanceModal open onClose={() => setIsQuickMaintenanceOpen(false)} />
                </LazyBoundary>
            ) : null}
        </div>
    );
};

export default AssetList;
