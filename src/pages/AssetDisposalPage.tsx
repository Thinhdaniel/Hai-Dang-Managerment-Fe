import React, { useMemo, useState } from 'react';
import {
    Alert,
    App,
    Button,
    Card,
    Empty,
    Form,
    Grid,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Select,
    Statistic,
    Table,
    Tag,
    Tooltip,
    type TableColumnsType,
} from 'antd';
import {
    AuditOutlined,
    CheckCircleOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    FileDoneOutlined,
    PlusOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    ScanOutlined,
    SearchOutlined,
    StopOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../components/shared/PageHeader';
import QrCameraScanner from '../components/QrCameraScanner';
import { useAuth } from '../core/contexts/AuthContext';
import { can, isAdmin, isDirector } from '../core/lib/permissions';
import { assetDisposalService } from '../core/services/asset-disposal.service';
import { assetService } from '../core/services/asset.service';
import { plantService } from '../core/services';
import type {
    Asset,
    AssetDisposalBatch,
    AssetDisposalBatchDetail,
    AssetDisposalItem,
    AssetDisposalItemPayload,
    CreateAssetDisposalBatchPayload,
} from '../core/types';
import {
    AssetDisposalAction,
    AssetDisposalBatchStatus,
    AssetDisposalCondition,
    AssetDisposalItemStatus,
    AssetDisposalSourceType,
} from '../core/types';

const { useBreakpoint } = Grid;

const batchStatusMeta: Record<AssetDisposalBatchStatus, { label: string; color: string }> = {
    [AssetDisposalBatchStatus.DRAFT]: { label: 'Nháp', color: 'default' },
    [AssetDisposalBatchStatus.SCANNING]: { label: 'Đang rà soát', color: 'processing' },
    [AssetDisposalBatchStatus.REVIEWING]: { label: 'Chờ duyệt', color: 'warning' },
    [AssetDisposalBatchStatus.APPROVED]: { label: 'Đã duyệt', color: 'success' },
    [AssetDisposalBatchStatus.COMPLETED]: { label: 'Hoàn tất', color: 'default' },
    [AssetDisposalBatchStatus.CANCELLED]: { label: 'Đã hủy', color: 'error' },
};

const itemStatusMeta: Record<AssetDisposalItemStatus, { label: string; color: string }> = {
    [AssetDisposalItemStatus.PENDING]: { label: 'Thiếu thông tin', color: 'warning' },
    [AssetDisposalItemStatus.CHECKED]: { label: 'Đã rà soát', color: 'processing' },
    [AssetDisposalItemStatus.APPROVED]: { label: 'Đã duyệt', color: 'success' },
    [AssetDisposalItemStatus.DISPOSED]: { label: 'Đã thanh lý', color: 'default' },
    [AssetDisposalItemStatus.KEPT]: { label: 'Giữ lại', color: 'blue' },
    [AssetDisposalItemStatus.CANCELLED]: { label: 'Hủy dòng', color: 'error' },
};

const conditionOptions = [
    { value: AssetDisposalCondition.USABLE, label: 'Còn dùng được' },
    { value: AssetDisposalCondition.MINOR_FAULT, label: 'Hỏng nhẹ' },
    { value: AssetDisposalCondition.MAJOR_FAULT, label: 'Hỏng nặng' },
    { value: AssetDisposalCondition.MISSING_PARTS, label: 'Mất linh kiện' },
    { value: AssetDisposalCondition.SCRAP, label: 'Phế liệu' },
    { value: AssetDisposalCondition.UNKNOWN, label: 'Chưa xác định' },
];

const actionOptions = [
    { value: AssetDisposalAction.SELL, label: 'Bán thanh lý' },
    { value: AssetDisposalAction.PART_OUT, label: 'Tháo linh kiện' },
    { value: AssetDisposalAction.SCRAP, label: 'Hủy / phế liệu' },
    { value: AssetDisposalAction.KEEP, label: 'Giữ lại' },
    { value: AssetDisposalAction.REPAIR, label: 'Sửa tiếp' },
    { value: AssetDisposalAction.UNKNOWN, label: 'Chưa quyết định' },
];

const sourceLabel: Record<AssetDisposalSourceType, string> = {
    [AssetDisposalSourceType.ASSET]: 'Máy trong hệ thống',
    [AssetDisposalSourceType.EXTERNAL]: 'Máy ngoài hệ thống',
    [AssetDisposalSourceType.QR_ONLY]: 'QR tạm',
};

const disposalCardClass = 'asset-disposal-card rounded-2xl border-slate-200 shadow-sm';

type BatchFormValues = CreateAssetDisposalBatchPayload;
type ItemFormValues = AssetDisposalItemPayload & { mode?: 'asset' | 'external' };

const formatDateTime = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-');
const formatMoney = (value?: number) => (value != null ? value.toLocaleString('vi-VN') : '-');
const formatMoneyInput = (value?: string | number) =>
    value == null || value === '' ? '' : `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const parseMoneyInput = (value?: string) => {
    const raw = String(value || '').replace(/[^\d]/g, '');
    return raw ? Number(raw) : '';
};

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

const BatchStatusTag = ({ status }: { status: AssetDisposalBatchStatus }) => {
    const meta = batchStatusMeta[status] ?? { label: status, color: 'default' };
    return (
        <Tag color={meta.color} className='asset-disposal-status-tag'>
            {meta.label}
        </Tag>
    );
};

const ItemStatusTag = ({ status }: { status: AssetDisposalItemStatus }) => {
    const meta = itemStatusMeta[status] ?? { label: status, color: 'default' };
    return (
        <Tag color={meta.color} className='asset-disposal-status-tag'>
            {meta.label}
        </Tag>
    );
};

const renderItemTitle = (item: AssetDisposalItem) => (
    <div className='min-w-0'>
        <div className='asset-disposal-item-title text-sm font-semibold text-slate-900'>
            {item.name || item.asset?.name || item.machineCode || item.publicId || 'Máy chưa định danh'}
        </div>
        <div className='mt-1 flex flex-wrap items-center gap-1.5'>
            <Tag color='blue' className='asset-disposal-code-tag font-mono'>
                {item.machineCode || item.publicId || 'QR tạm'}
            </Tag>
            <Tag className='asset-disposal-code-tag'>{sourceLabel[item.sourceType]}</Tag>
        </div>
        <div className='asset-disposal-muted-line mt-1 text-xs text-slate-500'>
            {[item.plant?.name || item.asset?.plant?.name, item.area || item.asset?.area, item.serial]
                .filter(Boolean)
                .join(' / ') || 'Chưa có vị trí/serial'}
        </div>
    </div>
);

const AssetDisposalPage: React.FC = () => {
    const { id } = useParams();
    const isDetail = Boolean(id);
    const navigate = useNavigate();
    const screens = useBreakpoint();
    const isDesktop = Boolean(screens.lg);
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const { role } = useAuth();
    const canApprove = Boolean(role) && (isAdmin(role) || isDirector(role));
    const canManage = can(role, 'assetDisposal.manage');

    const [filters, setFilters] = useState({
        page: 1,
        limit: 10,
        search: '',
        status: undefined as AssetDisposalBatchStatus | undefined,
    });
    const [draftSearch, setDraftSearch] = useState('');
    const [batchModalOpen, setBatchModalOpen] = useState(false);
    const [itemModalOpen, setItemModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<AssetDisposalItem | null>(null);
    const [scannerActive, setScannerActive] = useState(false);
    const [manualQr, setManualQr] = useState('');
    const [assetSearch, setAssetSearch] = useState('');
    const [batchForm] = Form.useForm<BatchFormValues>();
    const [itemForm] = Form.useForm<ItemFormValues>();

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const batchListQuery = useQuery({
        queryKey: ['asset-disposal-batches', filters],
        queryFn: () => assetDisposalService.getBatches(filters),
        enabled: !isDetail,
    });

    const detailQuery = useQuery({
        queryKey: ['asset-disposal-batch', id],
        queryFn: () => assetDisposalService.getBatchById(id!),
        enabled: Boolean(id),
    });

    const detail = detailQuery.data;
    const batch = detail?.batch;

    const assetOptionsQuery = useQuery({
        queryKey: ['asset-disposal-asset-options', batch?.plantId, assetSearch],
        queryFn: () =>
            assetService.getAll({
                plantId: batch?.plantId,
                lifecycle: 'operating',
                search: assetSearch.trim() || undefined,
                page: 1,
                limit: 30,
            }),
        enabled: Boolean(batch?.plantId && itemModalOpen && !editingItem),
    });

    const refreshDetail = () => {
        queryClient.invalidateQueries({ queryKey: ['asset-disposal-batch', id] });
        queryClient.invalidateQueries({ queryKey: ['asset-disposal-batches'] });
        queryClient.invalidateQueries({ queryKey: ['assets'] });
    };

    const createBatchMutation = useMutation({
        mutationFn: assetDisposalService.createBatch,
        onSuccess: (created) => {
            queryClient.invalidateQueries({ queryKey: ['asset-disposal-batches'] });
            setBatchModalOpen(false);
            batchForm.resetFields();
            message.success('Đã tạo đợt thanh lý');
            navigate(`/assets/disposals/${created.id}`);
        },
    });

    const addItemMutation = useMutation({
        mutationFn: (payload: AssetDisposalItemPayload) => assetDisposalService.addItem(id!, payload),
        onSuccess: () => {
            refreshDetail();
            setItemModalOpen(false);
            setEditingItem(null);
            itemForm.resetFields();
            message.success('Đã thêm máy vào đợt thanh lý');
        },
    });

    const updateItemMutation = useMutation({
        mutationFn: ({ itemId, payload }: { itemId: string; payload: AssetDisposalItemPayload }) =>
            assetDisposalService.updateItem(itemId, payload),
        onSuccess: () => {
            refreshDetail();
            setItemModalOpen(false);
            setEditingItem(null);
            itemForm.resetFields();
            message.success('Đã cập nhật dòng rà soát');
        },
    });

    const deleteItemMutation = useMutation({
        mutationFn: (itemId: string) => assetDisposalService.deleteItem(itemId),
        onSuccess: () => {
            refreshDetail();
            message.success('Đã xóa dòng khỏi đợt thanh lý');
        },
    });

    const scanMutation = useMutation({
        mutationFn: (rawValue: string) => assetDisposalService.scanQr(id!, { rawValue }),
        onSuccess: (result) => {
            refreshDetail();
            if (result.result === 'duplicate') {
                // Máy đã có trong đợt: mở luôn form để cập nhật tình trạng & định giá
                // (vd bên thu mua tới định giá lại) thay vì chỉ báo trùng rồi dừng.
                if (result.item) {
                    message.info('Máy đã có trong đợt — mở form để cập nhật tình trạng & định giá');
                    setEditingItem(result.item);
                    itemForm.resetFields();
                    itemForm.setFieldsValue({
                        ...result.item,
                        mode: result.item.sourceType === AssetDisposalSourceType.ASSET ? 'asset' : 'external',
                    });
                    setItemModalOpen(true);
                } else {
                    message.info('Máy này đã có trong đợt thanh lý');
                }
            } else if (result.canEditExternalInfo) {
                message.warning('QR chưa có hồ sơ máy, hãy bổ sung thông tin trước khi gửi duyệt');
                setEditingItem(result.item);
                itemForm.setFieldsValue({
                    ...result.item,
                    mode: 'external',
                    sourceType: result.item.sourceType,
                    condition: result.item.condition ?? AssetDisposalCondition.UNKNOWN,
                    suggestedAction: result.item.suggestedAction ?? AssetDisposalAction.UNKNOWN,
                });
                setItemModalOpen(true);
            } else {
                message.success('Đã quét máy vào đợt thanh lý');
            }
            setManualQr('');
        },
    });

    const submitMutation = useMutation({
        mutationFn: () => assetDisposalService.submitBatch(id!),
        onSuccess: () => {
            refreshDetail();
            message.success('Đã gửi duyệt đợt thanh lý');
        },
    });

    const approveMutation = useMutation({
        mutationFn: () => assetDisposalService.approveBatch(id!),
        onSuccess: () => {
            refreshDetail();
            message.success('Đã duyệt đợt thanh lý');
        },
    });

    const completeMutation = useMutation({
        mutationFn: () => assetDisposalService.completeBatch(id!),
        onSuccess: () => {
            refreshDetail();
            message.success('Đã hoàn tất thanh lý và retire QR liên quan');
        },
    });

    const cancelMutation = useMutation({
        mutationFn: (reason: string) => assetDisposalService.cancelBatch(id!, reason),
        onSuccess: () => {
            refreshDetail();
            message.success('Đã hủy đợt thanh lý');
        },
    });

    const exportMutation = useMutation({
        mutationFn: (batchId: string) => assetDisposalService.exportXlsx(batchId),
        onSuccess: (blob) => downloadBlob(blob, `thanh-ly-may-${batch?.code || id}.xlsx`),
    });

    const batchRows = batchListQuery.data?.data ?? [];
    const plantOptions = useMemo(
        () =>
            plants.map((plant) => ({
                value: plant.id,
                label: plant.code ? `${plant.name} (${plant.code})` : plant.name,
            })),
        [plants]
    );
    const assetOptions = useMemo(
        () =>
            (assetOptionsQuery.data?.data ?? []).map((asset: Asset) => ({
                value: asset.id,
                label: `${asset.machineCode} - ${asset.name}${asset.area ? ` / ${asset.area}` : ''}`,
            })),
        [assetOptionsQuery.data?.data]
    );

    const canEditBatch =
        batch &&
        ![
            AssetDisposalBatchStatus.APPROVED,
            AssetDisposalBatchStatus.COMPLETED,
            AssetDisposalBatchStatus.CANCELLED,
        ].includes(batch.status);

    const openCreateItem = (mode: 'asset' | 'external' = 'asset') => {
        setEditingItem(null);
        itemForm.resetFields();
        itemForm.setFieldsValue({
            mode,
            sourceType: mode === 'asset' ? AssetDisposalSourceType.ASSET : AssetDisposalSourceType.EXTERNAL,
            plantId: batch?.plantId,
            area: batch?.area,
            condition: AssetDisposalCondition.UNKNOWN,
            suggestedAction: AssetDisposalAction.UNKNOWN,
        });
        setItemModalOpen(true);
    };

    const openEditItem = (item: AssetDisposalItem) => {
        setEditingItem(item);
        itemForm.resetFields();
        itemForm.setFieldsValue({
            ...item,
            mode: item.sourceType === AssetDisposalSourceType.ASSET ? 'asset' : 'external',
        });
        setItemModalOpen(true);
    };

    const handleSaveItem = async () => {
        const values = await itemForm.validateFields();
        const mode = values.mode ?? 'asset';
        const commonPayload = {
            condition: values.condition,
            reason: values.reason?.trim() || undefined,
            suggestedAction: values.suggestedAction,
            estimatedValue: values.estimatedValue,
            finalValue: values.finalValue,
            note: values.note?.trim() || undefined,
            status: values.status,
        };
        const externalPayload = {
            sourceType: values.sourceType ?? AssetDisposalSourceType.EXTERNAL,
            publicId: values.publicId?.trim() || undefined,
            machineCode: values.machineCode?.trim() || undefined,
            name: values.name?.trim() || undefined,
            type: values.type?.trim() || undefined,
            model: values.model?.trim() || undefined,
            serial: values.serial?.trim() || undefined,
            plantId: batch?.plantId,
            area: values.area?.trim() || batch?.area || undefined,
        };
        const payload: AssetDisposalItemPayload = editingItem
            ? {
                  ...commonPayload,
                  ...(editingItem.sourceType === AssetDisposalSourceType.ASSET ? {} : externalPayload),
              }
            : mode === 'asset'
              ? {
                    assetId: values.assetId,
                    ...commonPayload,
                }
              : {
                    ...externalPayload,
                    ...commonPayload,
                };

        if (editingItem) {
            await updateItemMutation.mutateAsync({ itemId: editingItem.id, payload });
        } else {
            await addItemMutation.mutateAsync(payload);
        }
    };

    // Bỏ máy đang mở trong form ra khỏi lô (đỡ phải đóng modal rồi dò lại từng dòng).
    const handleRemoveFromModal = async () => {
        if (!editingItem) return;
        await deleteItemMutation.mutateAsync(editingItem.id);
        setItemModalOpen(false);
        setEditingItem(null);
        itemForm.resetFields();
    };

    const handleScan = async (rawValue?: string) => {
        const value = (rawValue ?? manualQr).trim();
        if (!value || scanMutation.isPending) return;
        await scanMutation.mutateAsync(value);
    };

    const batchColumns: TableColumnsType<AssetDisposalBatch> = [
        {
            title: 'Đợt thanh lý',
            render: (_value, record) => (
                <div className='min-w-[220px]'>
                    <button
                        type='button'
                        className='font-mono text-sm font-semibold text-blue-700 hover:text-blue-800'
                        onClick={() => navigate(`/assets/disposals/${record.id}`)}
                    >
                        {record.code}
                    </button>
                    <div className='mt-1 text-xs font-semibold text-slate-500'>
                        {record.plant?.name || '-'} {record.area ? `/ ${record.area}` : ''}
                    </div>
                </div>
            ),
        },
        {
            title: 'Lý do',
            dataIndex: 'reason',
            render: (value) => <span className='asset-disposal-table-text text-sm text-slate-700'>{value}</span>,
        },
        {
            title: 'Tiến độ',
            width: 220,
            render: (_value, record) => (
                <div className='text-sm'>
                    <div className='font-semibold text-slate-900'>{record.totalItems ?? 0} máy</div>
                    <div className='text-xs font-semibold text-slate-500'>
                        Hệ thống {record.assetItems ?? 0} / Ngoài {record.externalItems ?? 0}
                    </div>
                    <div className='text-xs font-semibold text-orange-600'>
                        Thiếu thông tin {record.pendingItems ?? 0}
                    </div>
                </div>
            ),
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 150,
            render: (status) => <BatchStatusTag status={status} />,
        },
        {
            title: 'Ngày tạo',
            dataIndex: 'createdAt',
            width: 160,
            render: formatDateTime,
        },
        {
            title: 'Thao tác',
            width: 120,
            align: 'right',
            render: (_value, record) => (
                <Button type='primary' onClick={() => navigate(`/assets/disposals/${record.id}`)}>
                    Mở đợt
                </Button>
            ),
        },
    ];

    const itemColumns: TableColumnsType<AssetDisposalItem> = [
        {
            title: 'Máy / QR',
            render: (_value, record) => renderItemTitle(record),
        },
        {
            title: 'Tình trạng',
            width: 180,
            render: (_value, record) => (
                <div className='flex flex-col gap-1'>
                    <span className='text-sm font-semibold text-slate-700'>
                        {conditionOptions.find((item) => item.value === record.condition)?.label || 'Chưa xác định'}
                    </span>
                    <span className='text-xs text-slate-500'>
                        {actionOptions.find((item) => item.value === record.suggestedAction)?.label ||
                            'Chưa quyết định'}
                    </span>
                </div>
            ),
        },
        {
            title: 'Giá trị',
            width: 140,
            render: (_value, record) => (
                <div className='text-sm'>
                    <div>{formatMoney(record.estimatedValue)}</div>
                    {record.finalValue != null ? (
                        <div className='text-xs text-slate-500'>Chốt {formatMoney(record.finalValue)}</div>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 150,
            render: (status) => <ItemStatusTag status={status} />,
        },
        {
            title: 'Thao tác',
            width: 132,
            align: 'right',
            render: (_value, record) => (
                <div className='flex items-center justify-end gap-1.5'>
                    <Tooltip title='Cập nhật thông tin rà soát'>
                        <Button icon={<EditOutlined />} disabled={!canEditBatch} onClick={() => openEditItem(record)} />
                    </Tooltip>
                    <Popconfirm
                        title='Xóa khỏi lô thanh lý?'
                        description='Chỉ xóa dòng khỏi lô, không xóa hồ sơ máy. Nếu là máy trong hệ thống, trạng thái sẽ được trả về trước khi quét.'
                        okText='Xóa khỏi lô'
                        cancelText='Giữ lại'
                        okButtonProps={{ danger: true, loading: deleteItemMutation.isPending }}
                        onConfirm={() => deleteItemMutation.mutate(record.id)}
                        disabled={!canEditBatch}
                    >
                        <Tooltip title='Xóa dòng quét nhầm'>
                            <Button
                                danger
                                icon={<DeleteOutlined />}
                                disabled={!canEditBatch}
                                loading={deleteItemMutation.isPending}
                            />
                        </Tooltip>
                    </Popconfirm>
                </div>
            ),
        },
    ];

    const renderBatchCards = () => {
        if (!batchRows.length) {
            return <Empty description='Chưa có đợt thanh lý phù hợp' />;
        }

        return (
            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                {batchRows.map((record) => (
                    <Card key={record.id} className={disposalCardClass}>
                        <div className='flex items-start justify-between gap-3'>
                            <div className='min-w-0'>
                                <button
                                    type='button'
                                    className='block max-w-full truncate font-mono text-base font-semibold text-blue-700'
                                    onClick={() => navigate(`/assets/disposals/${record.id}`)}
                                >
                                    {record.code}
                                </button>
                                <div className='asset-disposal-card-title mt-1 text-sm font-semibold text-slate-700'>
                                    {record.reason}
                                </div>
                                <div className='asset-disposal-muted-line mt-1 text-xs text-slate-500'>
                                    {record.plant?.name || '-'} {record.area ? `/ ${record.area}` : ''}
                                </div>
                            </div>
                            <BatchStatusTag status={record.status} />
                        </div>
                        <div className='asset-disposal-mini-stats mt-4 grid grid-cols-3 gap-2'>
                            <Statistic
                                title='Tổng'
                                value={record.totalItems ?? 0}
                                valueStyle={{ fontSize: 18, fontWeight: 800 }}
                            />
                            <Statistic
                                title='Trong HT'
                                value={record.assetItems ?? 0}
                                valueStyle={{ fontSize: 18, fontWeight: 800 }}
                            />
                            <Statistic
                                title='QR tạm'
                                value={record.externalItems ?? 0}
                                valueStyle={{ fontSize: 18, fontWeight: 800 }}
                            />
                        </div>
                        <Button
                            className='asset-disposal-action-button mt-4 w-full'
                            type='primary'
                            onClick={() => navigate(`/assets/disposals/${record.id}`)}
                        >
                            Mở đợt
                        </Button>
                    </Card>
                ))}
            </div>
        );
    };

    const renderList = () => (
        <div className='asset-disposal-page flex flex-col gap-4 sm:gap-5'>
            <PageHeader
                title='Thanh lý máy'
                subtitle='Quản lý các đợt rà soát, quét QR và hoàn tất thanh lý máy theo đúng quy trình.'
                actions={
                    <Button
                        className='asset-disposal-action-button'
                        type='primary'
                        icon={<PlusOutlined />}
                        onClick={() => setBatchModalOpen(true)}
                    >
                        Tạo đợt thanh lý
                    </Button>
                }
            />

            <Card className={`${disposalCardClass} asset-disposal-filter-card`}>
                <div className='grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_210px] lg:grid-cols-[minmax(0,1fr)_220px_auto]'>
                    <Input
                        size='large'
                        prefix={<SearchOutlined />}
                        value={draftSearch}
                        allowClear
                        placeholder='Tìm theo mã đợt, lý do, khu vực...'
                        onChange={(event) => setDraftSearch(event.target.value)}
                        onPressEnter={() => setFilters((prev) => ({ ...prev, search: draftSearch.trim(), page: 1 }))}
                    />
                    <Select
                        size='large'
                        allowClear
                        placeholder='Trạng thái'
                        value={filters.status}
                        onChange={(status) => setFilters((prev) => ({ ...prev, status, page: 1 }))}
                        options={Object.entries(batchStatusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
                    />
                    <Button
                        className='asset-disposal-action-button'
                        size='large'
                        icon={<SearchOutlined />}
                        onClick={() => setFilters((prev) => ({ ...prev, search: draftSearch.trim(), page: 1 }))}
                    >
                        Lọc
                    </Button>
                </div>
            </Card>

            <Card className={`${disposalCardClass} asset-disposal-table-card`}>
                {isDesktop ? (
                    <Table<AssetDisposalBatch>
                        rowKey='id'
                        columns={batchColumns}
                        dataSource={batchRows}
                        loading={batchListQuery.isFetching}
                        scroll={{ x: 960 }}
                        pagination={{
                            current: batchListQuery.data?.page ?? filters.page,
                            pageSize: batchListQuery.data?.limit ?? filters.limit,
                            total: batchListQuery.data?.total ?? 0,
                            onChange: (page, limit) => setFilters((prev) => ({ ...prev, page, limit })),
                        }}
                    />
                ) : (
                    renderBatchCards()
                )}
            </Card>

            <Modal
                open={batchModalOpen}
                title='Tạo đợt thanh lý máy'
                width={isDesktop ? 560 : 'calc(100vw - 24px)'}
                style={!isDesktop ? { top: 12 } : undefined}
                styles={{
                    body: {
                        maxHeight: isDesktop ? '70vh' : 'calc(100dvh - 190px)',
                        overflowY: 'auto',
                    },
                }}
                okText='Tạo đợt'
                confirmLoading={createBatchMutation.isPending}
                onCancel={() => setBatchModalOpen(false)}
                onOk={async () => createBatchMutation.mutateAsync(await batchForm.validateFields())}
            >
                <Form<BatchFormValues> form={batchForm} layout='vertical' className='pt-2'>
                    <Form.Item name='plantId' label='Cơ sở' rules={[{ required: true, message: 'Chọn cơ sở' }]}>
                        <Select size='large' showSearch={{ optionFilterProp: 'label' }} options={plantOptions} />
                    </Form.Item>
                    <Form.Item name='area' label='Khu vực'>
                        <Input size='large' placeholder='Ví dụ: Kho cũ, xưởng 2...' />
                    </Form.Item>
                    <Form.Item name='reason' label='Lý do thanh lý' rules={[{ required: true, whitespace: true }]}>
                        <Input.TextArea rows={3} placeholder='Máy hỏng nặng, lỗi thời, không còn nhu cầu sử dụng...' />
                    </Form.Item>
                    <Form.Item name='note' label='Ghi chú'>
                        <Input.TextArea rows={2} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );

    const renderDetailCards = (items: AssetDisposalItem[]) => {
        if (!items.length) return <Empty description='Chưa có máy nào trong đợt thanh lý' />;
        return (
            <div className='flex flex-col gap-3'>
                {items.map((item) => (
                    <Card key={item.id} className={disposalCardClass}>
                        <div className='flex items-start justify-between gap-3'>
                            {renderItemTitle(item)}
                            <ItemStatusTag status={item.status} />
                        </div>
                        <div className='asset-disposal-detail-facts mt-3 grid grid-cols-1 gap-2 text-xs font-semibold text-slate-500 sm:grid-cols-2'>
                            <div>
                                Tình trạng:{' '}
                                {conditionOptions.find((option) => option.value === item.condition)?.label || '-'}
                            </div>
                            <div>
                                Đề xuất:{' '}
                                {actionOptions.find((option) => option.value === item.suggestedAction)?.label || '-'}
                            </div>
                            <div>Ước tính: {formatMoney(item.estimatedValue)}</div>
                            <div>Chốt: {formatMoney(item.finalValue)}</div>
                        </div>
                        <div className='asset-disposal-inline-actions mt-3'>
                            <Button
                                className='asset-disposal-action-button'
                                icon={<EditOutlined />}
                                disabled={!canEditBatch}
                                onClick={() => openEditItem(item)}
                            >
                                Cập nhật
                            </Button>
                            <Popconfirm
                                title='Xóa khỏi lô thanh lý?'
                                description='Chỉ xóa dòng khỏi lô, không xóa hồ sơ máy. Nếu là máy trong hệ thống, trạng thái sẽ được trả về trước khi quét.'
                                okText='Xóa khỏi lô'
                                cancelText='Giữ lại'
                                okButtonProps={{ danger: true, loading: deleteItemMutation.isPending }}
                                onConfirm={() => deleteItemMutation.mutate(item.id)}
                                disabled={!canEditBatch}
                            >
                                <Button
                                    className='asset-disposal-action-button'
                                    danger
                                    icon={<DeleteOutlined />}
                                    disabled={!canEditBatch}
                                    loading={deleteItemMutation.isPending}
                                >
                                    Xóa khỏi lô
                                </Button>
                            </Popconfirm>
                        </div>
                    </Card>
                ))}
            </div>
        );
    };

    const renderDetail = (data: AssetDisposalBatchDetail) => {
        const currentBatch = data.batch;
        const items = data.items;
        const pendingCount = data.summary.pending;
        const isReviewing = currentBatch.status === AssetDisposalBatchStatus.REVIEWING;
        const isApproved = currentBatch.status === AssetDisposalBatchStatus.APPROVED;

        return (
            <div className='asset-disposal-page flex flex-col gap-4 sm:gap-5'>
                <PageHeader
                    title={`Đợt thanh lý ${currentBatch.code}`}
                    subtitle={`${currentBatch.plant?.name || '-'}${currentBatch.area ? ` / ${currentBatch.area}` : ''} · ${currentBatch.reason}`}
                    actions={
                        <div className='asset-disposal-actions'>
                            <Button
                                className='asset-disposal-action-button'
                                icon={<ReloadOutlined />}
                                onClick={() => detailQuery.refetch()}
                            >
                                Tải lại
                            </Button>
                            <Button
                                className='asset-disposal-action-button'
                                icon={<DownloadOutlined />}
                                loading={exportMutation.isPending}
                                onClick={() => exportMutation.mutate(currentBatch.id)}
                            >
                                Xuất Excel
                            </Button>
                            {canEditBatch ? (
                                <>
                                    <Button
                                        className='asset-disposal-action-button'
                                        icon={<PlusOutlined />}
                                        onClick={() => openCreateItem('asset')}
                                    >
                                        Thêm máy
                                    </Button>
                                    <Button
                                        className='asset-disposal-action-button'
                                        icon={<FileDoneOutlined />}
                                        disabled={!items.length || pendingCount > 0}
                                        loading={submitMutation.isPending}
                                        onClick={() => submitMutation.mutate()}
                                    >
                                        Gửi duyệt
                                    </Button>
                                </>
                            ) : null}
                            {canApprove && isReviewing ? (
                                <Button
                                    className='asset-disposal-action-button'
                                    type='primary'
                                    icon={<CheckCircleOutlined />}
                                    loading={approveMutation.isPending}
                                    onClick={() => approveMutation.mutate()}
                                >
                                    Duyệt
                                </Button>
                            ) : null}
                            {canApprove && isApproved ? (
                                <Popconfirm
                                    title='Hoàn tất thanh lý?'
                                    description='Máy trong hệ thống sẽ chuyển sang Đã thanh lý và QR liên quan sẽ bị vô hiệu hóa.'
                                    okText='Hoàn tất'
                                    cancelText='Hủy'
                                    onConfirm={() => completeMutation.mutate()}
                                >
                                    <Button
                                        className='asset-disposal-action-button'
                                        danger
                                        type='primary'
                                        icon={<DeleteOutlined />}
                                        loading={completeMutation.isPending}
                                    >
                                        Hoàn tất
                                    </Button>
                                </Popconfirm>
                            ) : null}
                        </div>
                    }
                />

                <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5'>
                    {[
                        { label: 'Tổng máy', value: data.summary.total, color: '#0f172a' },
                        { label: 'Trong hệ thống', value: data.summary.asset, color: '#2563eb' },
                        { label: 'QR/máy ngoài', value: data.summary.external, color: '#7c3aed' },
                        { label: 'Thiếu thông tin', value: data.summary.pending, color: '#ea580c' },
                        {
                            label: 'Đã duyệt/hoàn tất',
                            value: data.summary.approved + data.summary.disposed,
                            color: '#059669',
                        },
                    ].map((item) => (
                        <Card key={item.label} className={`${disposalCardClass} asset-disposal-stat-card`}>
                            <Statistic
                                title={item.label}
                                value={item.value}
                                valueStyle={{ color: item.color, fontWeight: 900 }}
                            />
                        </Card>
                    ))}
                </div>

                <div className='grid grid-cols-1 gap-4 lg:grid-cols-[minmax(330px,400px)_minmax(0,1fr)]'>
                    <div className='flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start'>
                        <Card className={disposalCardClass}>
                            <div className='mb-3 flex items-center justify-between'>
                                <div className='flex items-center gap-2 font-bold text-slate-900'>
                                    <AuditOutlined className='text-orange-600' />
                                    Thông tin đợt
                                </div>
                                <BatchStatusTag status={currentBatch.status} />
                            </div>
                            <div className='space-y-2 text-sm text-slate-600'>
                                <div>
                                    <span className='font-bold text-slate-900'>Cơ sở:</span>{' '}
                                    {currentBatch.plant?.name || '-'}
                                </div>
                                <div>
                                    <span className='font-bold text-slate-900'>Khu vực:</span>{' '}
                                    {currentBatch.area || '-'}
                                </div>
                                <div>
                                    <span className='font-bold text-slate-900'>Tạo lúc:</span>{' '}
                                    {formatDateTime(currentBatch.createdAt)}
                                </div>
                                {currentBatch.approvedAt ? (
                                    <div>
                                        <span className='font-bold text-slate-900'>Duyệt:</span>{' '}
                                        {formatDateTime(currentBatch.approvedAt)}
                                    </div>
                                ) : null}
                            </div>
                        </Card>

                        <Card className={`${disposalCardClass} asset-disposal-scanner-card`}>
                            <div className='mb-3 flex items-center justify-between'>
                                <div className='flex items-center gap-2 font-bold text-slate-900'>
                                    <QrcodeOutlined className='text-blue-600' />
                                    Quét QR thanh lý
                                </div>
                                <Tag color={scannerActive ? 'green' : 'default'}>
                                    {scannerActive ? 'Đang quét' : 'Tạm dừng'}
                                </Tag>
                            </div>
                            <QrCameraScanner
                                active={scannerActive && Boolean(canEditBatch)}
                                onDetected={handleScan}
                                cooldownMs={1800}
                            />
                            <div className='asset-disposal-scan-input mt-3 flex gap-2'>
                                <Input
                                    value={manualQr}
                                    placeholder='Nhập mã QR thủ công'
                                    onChange={(event) => setManualQr(event.target.value)}
                                    onPressEnter={() => handleScan()}
                                />
                                <Button
                                    className='asset-disposal-action-button'
                                    icon={<ScanOutlined />}
                                    loading={scanMutation.isPending}
                                    disabled={!canEditBatch}
                                    onClick={() => handleScan()}
                                >
                                    Quét
                                </Button>
                            </div>
                            <Button
                                className='asset-disposal-action-button mt-3 w-full'
                                type={scannerActive ? 'default' : 'primary'}
                                icon={scannerActive ? <StopOutlined /> : <QrcodeOutlined />}
                                disabled={!canEditBatch}
                                onClick={() => setScannerActive((value) => !value)}
                            >
                                {scannerActive ? 'Dừng camera' : 'Bật camera'}
                            </Button>
                        </Card>
                    </div>

                    <Card className={`${disposalCardClass} asset-disposal-table-card`}>
                        <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
                            <div className='min-w-0'>
                                <div className='text-base font-semibold text-slate-950'>Danh sách máy rà soát</div>
                                <div className='text-sm font-semibold text-slate-500'>
                                    QR trắng sẽ tạo dòng tạm, cần điền đủ thông tin trước khi gửi duyệt.
                                </div>
                            </div>
                            {canEditBatch ? (
                                <div className='asset-disposal-inline-actions'>
                                    <Button
                                        className='asset-disposal-action-button'
                                        icon={<PlusOutlined />}
                                        onClick={() => openCreateItem('external')}
                                    >
                                        Máy ngoài hệ thống
                                    </Button>
                                    <Button
                                        className='asset-disposal-action-button'
                                        type='primary'
                                        icon={<PlusOutlined />}
                                        onClick={() => openCreateItem('asset')}
                                    >
                                        Chọn máy
                                    </Button>
                                </div>
                            ) : null}
                        </div>

                        {isDesktop ? (
                            <Table<AssetDisposalItem>
                                rowKey='id'
                                columns={itemColumns}
                                dataSource={items}
                                loading={detailQuery.isFetching}
                                scroll={{ x: 920 }}
                                pagination={{ pageSize: 10 }}
                            />
                        ) : (
                            renderDetailCards(items)
                        )}
                    </Card>
                </div>

                {currentBatch.status !== AssetDisposalBatchStatus.COMPLETED &&
                currentBatch.status !== AssetDisposalBatchStatus.CANCELLED ? (
                    <Card className='asset-disposal-card rounded-2xl border-rose-100 bg-rose-50 shadow-sm'>
                        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
                            <div>
                                <div className='font-bold text-rose-900'>Hủy đợt thanh lý</div>
                                <div className='text-sm text-rose-700'>
                                    Máy đang chờ thanh lý sẽ được trả về trạng thái trước đó nếu chưa hoàn tất.
                                </div>
                            </div>
                            <Popconfirm
                                title='Nhập lý do hủy'
                                description='Hủy đợt thanh lý này?'
                                okText='Hủy đợt'
                                cancelText='Đóng'
                                onConfirm={() => cancelMutation.mutate('Huy dot thanh ly')}
                            >
                                <Button
                                    className='asset-disposal-action-button'
                                    danger
                                    icon={<StopOutlined />}
                                    loading={cancelMutation.isPending}
                                >
                                    Hủy đợt
                                </Button>
                            </Popconfirm>
                        </div>
                    </Card>
                ) : null}
            </div>
        );
    };

    if (!canManage) {
        return <Empty description='Bạn không có quyền quản lý thanh lý máy' />;
    }

    return (
        <>
            {isDetail ? detail ? renderDetail(detail) : <Card loading className={disposalCardClass} /> : renderList()}

            <Modal
                open={itemModalOpen}
                title={
                    <div className='asset-disposal-item-modal-title'>
                        <span>{editingItem ? 'Cập nhật máy thanh lý' : 'Thêm máy vào đợt thanh lý'}</span>
                        <small>
                            {batch?.code || 'Lô thanh lý'} · {batch?.plant?.name || 'Cơ sở của lô'}
                            {batch?.area ? ` · ${batch.area}` : ''}
                        </small>
                    </div>
                }
                width={isDesktop ? 900 : 'calc(100vw - 24px)'}
                style={!isDesktop ? { top: 12 } : undefined}
                styles={{
                    body: {
                        maxHeight: isDesktop ? '72vh' : 'calc(100dvh - 188px)',
                        overflowY: 'auto',
                        paddingTop: 12,
                    },
                }}
                okText={editingItem ? 'Lưu' : 'Thêm'}
                confirmLoading={addItemMutation.isPending || updateItemMutation.isPending}
                onCancel={() => {
                    setItemModalOpen(false);
                    setEditingItem(null);
                }}
                onOk={handleSaveItem}
                footer={(_, { OkBtn, CancelBtn }) => (
                    <div className='flex items-center justify-between gap-2'>
                        <div>
                            {editingItem && canEditBatch ? (
                                <Popconfirm
                                    title='Bỏ máy khỏi lô thanh lý?'
                                    description='Chỉ gỡ khỏi lô, không xóa hồ sơ máy. Máy trong hệ thống sẽ được trả về trạng thái trước khi quét.'
                                    okText='Bỏ khỏi lô'
                                    cancelText='Giữ lại'
                                    okButtonProps={{ danger: true, loading: deleteItemMutation.isPending }}
                                    onConfirm={handleRemoveFromModal}
                                >
                                    <Button danger icon={<DeleteOutlined />} loading={deleteItemMutation.isPending}>
                                        Bỏ khỏi lô
                                    </Button>
                                </Popconfirm>
                            ) : (
                                <span />
                            )}
                        </div>
                        <div className='flex items-center gap-2'>
                            <CancelBtn />
                            <OkBtn />
                        </div>
                    </div>
                )}
            >
                <Form<ItemFormValues>
                    form={itemForm}
                    layout='vertical'
                    className='asset-disposal-modal-form'
                    initialValues={{ mode: 'asset' }}
                >
                    {!editingItem ? (
                        <Alert
                            showIcon
                            type='info'
                            className='asset-disposal-modal-hint'
                            message='Dữ liệu máy thanh lý được khóa theo cơ sở của lô'
                            description='Nếu nhập mã máy/QR/serial trùng máy trong hệ thống, hệ thống sẽ tự kiểm tra và chặn máy sai cơ sở, máy đã thanh lý hoặc máy đang nằm trong lô khác.'
                        />
                    ) : null}

                    {!editingItem ? (
                        <Form.Item name='mode' label='Nguồn máy' className='asset-disposal-source-select'>
                            <Select
                                size='large'
                                options={[
                                    { value: 'asset', label: 'Chọn máy trong hệ thống' },
                                    { value: 'external', label: 'Máy ngoài hệ thống / QR tạm' },
                                ]}
                                onChange={(mode) => {
                                    itemForm.setFieldsValue({
                                        sourceType:
                                            mode === 'asset'
                                                ? AssetDisposalSourceType.ASSET
                                                : AssetDisposalSourceType.EXTERNAL,
                                    });
                                }}
                            />
                        </Form.Item>
                    ) : null}

                    {editingItem && editingItem.sourceType === AssetDisposalSourceType.ASSET ? (
                        <div className='asset-disposal-form-section'>
                            <div className='asset-disposal-form-section__head'>
                                <strong>{editingItem.name || 'Máy trong hệ thống'}</strong>
                                <span>Thông tin máy đã có — chỉ cập nhật tình trạng & định giá bên dưới</span>
                            </div>
                            <div className='asset-disposal-locked-plant'>
                                <span>Mã máy / QR</span>
                                <strong>{editingItem.machineCode || editingItem.publicId || '-'}</strong>
                                <small>
                                    {[editingItem.model, editingItem.serial].filter(Boolean).join(' · ') ||
                                        'Chưa có model/serial'}
                                </small>
                            </div>
                        </div>
                    ) : (
                        <Form.Item shouldUpdate noStyle>
                            {({ getFieldValue }) =>
                                getFieldValue('mode') === 'asset' && !editingItem ? (
                                    <div className='asset-disposal-form-section'>
                                        <div className='asset-disposal-form-section__head'>
                                            <strong>Máy trong hệ thống</strong>
                                            <span>
                                                Chỉ hiển thị máy còn vận hành thuộc {batch?.plant?.name || 'cơ sở lô'}
                                            </span>
                                        </div>
                                        <Form.Item
                                            name='assetId'
                                            label='Chọn máy'
                                            rules={[{ required: true, message: 'Chọn máy' }]}
                                        >
                                            <Select
                                                size='large'
                                                showSearch
                                                filterOption={false}
                                                onSearch={setAssetSearch}
                                                options={assetOptions}
                                                loading={assetOptionsQuery.isFetching}
                                                placeholder='Tìm theo mã máy, tên máy, serial...'
                                            />
                                        </Form.Item>
                                    </div>
                                ) : (
                                    <div className='asset-disposal-form-section'>
                                        <div className='asset-disposal-form-section__head'>
                                            <strong>Máy ngoài hệ thống / QR tạm</strong>
                                            <span>
                                                Thông tin này dùng để rà soát thực tế, không được giả danh mã máy đã có
                                            </span>
                                        </div>
                                        <div className='asset-disposal-locked-plant'>
                                            <span>Cơ sở khóa theo lô</span>
                                            <strong>{batch?.plant?.name || '-'}</strong>
                                            <small>
                                                {batch?.area ? `Khu vực mặc định: ${batch.area}` : 'Chưa khóa khu vực'}
                                            </small>
                                        </div>
                                        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                                            <Form.Item name='publicId' label='Mã QR'>
                                                <Input size='large' placeholder='QR-XXXXXX' />
                                            </Form.Item>
                                            <Form.Item name='machineCode' label='Mã máy'>
                                                <Input size='large' placeholder='VD: HD-MAY-001' />
                                            </Form.Item>
                                            <Form.Item
                                                name='name'
                                                label='Tên máy'
                                                rules={[{ required: !editingItem, message: 'Nhập tên máy' }]}
                                            >
                                                <Input size='large' placeholder='Tên máy theo tem/khảo sát' />
                                            </Form.Item>
                                            <Form.Item name='serial' label='Serial'>
                                                <Input size='large' />
                                            </Form.Item>
                                            <Form.Item name='type' label='Loại máy'>
                                                <Input size='large' />
                                            </Form.Item>
                                            <Form.Item name='model' label='Model'>
                                                <Input size='large' />
                                            </Form.Item>
                                            <Form.Item name='area' label='Khu vực thực tế' className='md:col-span-2'>
                                                <Input
                                                    size='large'
                                                    placeholder={batch?.area || 'Nhập khu vực trong cơ sở'}
                                                />
                                            </Form.Item>
                                        </div>
                                    </div>
                                )
                            }
                        </Form.Item>
                    )}

                    <div className='asset-disposal-form-section'>
                        <div className='asset-disposal-form-section__head'>
                            <strong>Tình trạng & hướng xử lý</strong>
                            <span>Thông tin bắt buộc trước khi gửi duyệt lô thanh lý</span>
                        </div>
                        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                            <Form.Item
                                name='condition'
                                label='Tình trạng'
                                rules={[{ required: true, message: 'Chọn tình trạng' }]}
                            >
                                <Select size='large' options={conditionOptions} />
                            </Form.Item>
                            <Form.Item
                                name='suggestedAction'
                                label='Đề xuất xử lý'
                                rules={[{ required: true, message: 'Chọn đề xuất xử lý' }]}
                            >
                                <Select size='large' options={actionOptions} />
                            </Form.Item>
                        </div>
                    </div>

                    <div className='asset-disposal-money-panel'>
                        <div className='asset-disposal-money-panel__head'>
                            <strong>Định giá thanh lý</strong>
                            <span>Nhập theo VNĐ, hệ thống tự format hàng nghìn</span>
                        </div>
                        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                            <Form.Item name='estimatedValue' label='Giá trị ước tính'>
                                <InputNumber
                                    size='large'
                                    min={0}
                                    controls={false}
                                    className='asset-disposal-money-input'
                                    addonAfter='đ'
                                    formatter={formatMoneyInput}
                                    parser={parseMoneyInput}
                                    placeholder='0'
                                />
                            </Form.Item>
                            {editingItem ? (
                                <Form.Item name='finalValue' label='Giá trị chốt'>
                                    <InputNumber
                                        size='large'
                                        min={0}
                                        controls={false}
                                        className='asset-disposal-money-input'
                                        addonAfter='đ'
                                        formatter={formatMoneyInput}
                                        parser={parseMoneyInput}
                                        placeholder='0'
                                    />
                                </Form.Item>
                            ) : null}
                        </div>
                    </div>

                    <div className='asset-disposal-form-section'>
                        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                            {editingItem ? (
                                <Form.Item name='status' label='Trạng thái dòng'>
                                    <Select
                                        size='large'
                                        options={Object.entries(itemStatusMeta).map(([value, meta]) => ({
                                            value,
                                            label: meta.label,
                                        }))}
                                    />
                                </Form.Item>
                            ) : null}
                            <Form.Item name='reason' label='Lý do / ghi nhận' className='md:col-span-2'>
                                <Input.TextArea rows={3} placeholder='VD: hỏng nặng, không còn linh kiện thay thế...' />
                            </Form.Item>
                            <Form.Item name='note' label='Ghi chú' className='md:col-span-2'>
                                <Input.TextArea rows={3} placeholder='Ghi chú nội bộ, tình trạng phụ kiện, ảnh...' />
                            </Form.Item>
                        </div>
                    </div>
                </Form>
            </Modal>
        </>
    );
};

export default AssetDisposalPage;
