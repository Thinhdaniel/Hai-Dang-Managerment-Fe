import React, { useDeferredValue, useMemo, useState } from 'react';
import {
    Alert,
    App,
    Button,
    Checkbox,
    DatePicker,
    Empty,
    Form,
    Image,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Progress,
    Select,
    Skeleton,
    Space,
    Steps,
    Table,
    Tag,
    type TableColumnsType,
} from 'antd';
import {
    ArrowLeftOutlined,
    AuditOutlined,
    CameraOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    PlusOutlined,
    QrcodeOutlined,
    RollbackOutlined,
    SafetyCertificateOutlined,
    SendOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import CloudinaryImagesField from '../components/shared/CloudinaryImagesField';
import PageHeader from '../components/shared/PageHeader';
import QrScanLookupModal from '../components/QrScanLookupModal';
import TransactionStatusBadge from '../components/transactions/TransactionStatusBadge';
import { outboundBorrowingBatchStatusMeta } from '../core/constants/transactions';
import { useAuth } from '../core/contexts/AuthContext';
import { can, hasDirectorAccess } from '../core/lib/permissions';
import { assetService } from '../core/services/asset.service';
import { borrowingService } from '../core/services/borrowing.service';
import {
    AssetOwnershipType,
    AssetStatus,
    BorrowingBatchStatus,
    BorrowingDirection,
    BorrowingStatus,
    type Asset,
    type Borrowing,
    type UpdateBorrowingBatchPayload,
} from '../core/types';

type AddAssetsFormValues = {
    assetIds: string[];
    issueCondition?: string;
    issueNote?: string;
    accessories?: string;
    issueImages?: string[];
};

type HandoverFormValues = {
    handoverTime: Dayjs;
    handoverImages?: string[];
    note?: string;
};

type ReturnFormValues = {
    returnTime: Dayjs;
    returnCondition?: string;
    returnNote?: string;
    returnImages?: string[];
};

type EditFormValues = {
    partnerName: string;
    contactName?: string;
    contactPhone?: string;
    partnerAddress?: string;
    contractNo?: string;
    area?: string;
    purpose: string;
    expectedReturnTime: Dayjs;
    plannedQuantity: number;
    note?: string;
};

const editableStatuses = new Set<BorrowingBatchStatus>([BorrowingBatchStatus.DRAFT, BorrowingBatchStatus.REJECTED]);
const metadataEditableStatuses = new Set<BorrowingBatchStatus>([
    ...editableStatuses,
    BorrowingBatchStatus.ACTIVE,
    BorrowingBatchStatus.PARTIALLY_RETURNED,
]);
const cancellableStatuses = new Set<BorrowingBatchStatus>([
    BorrowingBatchStatus.DRAFT,
    BorrowingBatchStatus.REJECTED,
    BorrowingBatchStatus.PENDING_APPROVAL,
    BorrowingBatchStatus.APPROVED,
]);

const formatDateTime = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : 'Chưa có');
const formatCurrency = (value?: number) =>
    typeof value === 'number' ? `${value.toLocaleString('vi-VN')} đ` : 'Chưa khai báo';

const EvidenceImages = ({ urls = [] }: { urls?: string[] }) =>
    urls.length ? (
        <Image.PreviewGroup>
            <div className='mt-2 flex flex-wrap gap-1.5'>
                {urls.map((url) => (
                    <Image key={url} src={url} width={34} height={34} className='rounded object-cover' />
                ))}
            </div>
        </Image.PreviewGroup>
    ) : null;

const getWorkflowStep = (status: BorrowingBatchStatus) => {
    if (status === BorrowingBatchStatus.RETURNED) return 4;
    if ([BorrowingBatchStatus.ACTIVE, BorrowingBatchStatus.PARTIALLY_RETURNED].includes(status)) return 3;
    if (status === BorrowingBatchStatus.APPROVED) return 2;
    if (status === BorrowingBatchStatus.PENDING_APPROVAL) return 1;
    return 0;
};

const OutboundBorrowingBatchDetail: React.FC = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const { role } = useAuth();
    const canWrite = can(role, 'borrowing.write');
    const canApprove = hasDirectorAccess(role);

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [assetSearch, setAssetSearch] = useState('');
    const deferredAssetSearch = useDeferredValue(assetSearch);
    const [selectedReturnIds, setSelectedReturnIds] = useState<string[]>([]);
    const [isReturnOpen, setIsReturnOpen] = useState(false);
    const [isHandoverOpen, setIsHandoverOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [reasonAction, setReasonAction] = useState<'reject' | 'cancel' | null>(null);
    const [exporting, setExporting] = useState(false);

    const [addForm] = Form.useForm<AddAssetsFormValues>();
    const [handoverForm] = Form.useForm<HandoverFormValues>();
    const [returnForm] = Form.useForm<ReturnFormValues>();
    const [editForm] = Form.useForm<EditFormValues>();
    const [reasonForm] = Form.useForm<{ reason: string }>();

    const { data, isLoading } = useQuery({
        queryKey: ['borrowing-batch', id],
        queryFn: () => borrowingService.getBatchById(id),
        enabled: Boolean(id),
    });
    const batch = data?.batch;
    const items = useMemo(() => data?.items ?? [], [data?.items]);
    const editable = Boolean(batch && editableStatuses.has(batch.status) && canWrite);
    const metadataEditable = Boolean(batch && metadataEditableStatuses.has(batch.status) && canWrite);

    const { data: candidateAssets = [], isFetching: loadingCandidates } = useQuery({
        queryKey: ['outbound-asset-candidates', batch?.plantId, deferredAssetSearch],
        queryFn: async () => {
            const params = {
                page: 1,
                limit: 30,
                plantId: batch?.plantId,
                ownershipType: AssetOwnershipType.OWNED,
                search: deferredAssetSearch.trim() || undefined,
            };
            const [activeResponse, storageResponse] = await Promise.all([
                assetService.getAll({ ...params, status: AssetStatus.ACTIVE }),
                assetService.getAll({ ...params, status: AssetStatus.STORAGE }),
            ]);
            return [
                ...new Map(
                    [...activeResponse.data, ...storageResponse.data].map((asset) => [asset.id, asset])
                ).values(),
            ];
        },
        enabled: Boolean(batch?.plantId && editable && isAddOpen),
        staleTime: 15_000,
    });

    const existingAssetIds = useMemo(() => new Set(items.map((item) => item.assetId)), [items]);
    const candidates = useMemo(
        () => candidateAssets.filter((asset) => !existingAssetIds.has(asset.id)),
        [candidateAssets, existingAssetIds]
    );

    const invalidate = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['borrowing-batch', id] }),
            queryClient.invalidateQueries({ queryKey: ['borrowing-batches'] }),
            queryClient.invalidateQueries({ queryKey: ['borrowing-batch-stats'] }),
            queryClient.invalidateQueries({ queryKey: ['assets'] }),
            queryClient.invalidateQueries({ queryKey: ['asset-stat'] }),
            queryClient.invalidateQueries({ queryKey: ['asset'] }),
            queryClient.invalidateQueries({ queryKey: ['borrowings'] }),
            queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
            queryClient.invalidateQueries({ queryKey: ['floor-map'] }),
            queryClient.invalidateQueries({ queryKey: ['floor-map-reality'] }),
        ]);
    };

    const addMutation = useMutation({
        mutationFn: (values: AddAssetsFormValues) =>
            borrowingService.addOutboundAssets(id, {
                items: values.assetIds.map((assetId) => ({
                    assetId,
                    issueCondition: values.issueCondition?.trim() || undefined,
                    issueNote: values.issueNote?.trim() || undefined,
                    accessories:
                        values.accessories
                            ?.split(/[,;\n]/)
                            .map((value) => value.trim())
                            .filter(Boolean) ?? [],
                    issueImages: values.issueImages ?? [],
                })),
            }),
        onSuccess: async () => {
            await invalidate();
            setIsAddOpen(false);
            setAssetSearch('');
            addForm.resetFields();
            message.success('Đã thêm máy vào lô');
        },
    });

    const removeMutation = useMutation({
        mutationFn: (itemId: string) => borrowingService.removeOutboundAsset(id, itemId),
        onSuccess: async () => {
            await invalidate();
            message.success('Đã bỏ máy khỏi lô');
        },
    });

    const submitMutation = useMutation({
        mutationFn: () => borrowingService.submitOutboundBatch(id),
        onSuccess: async () => {
            await invalidate();
            message.success('Đã gửi giám đốc duyệt');
        },
    });

    const approveMutation = useMutation({
        mutationFn: () => borrowingService.approveOutboundBatch(id),
        onSuccess: async () => {
            await invalidate();
            message.success('Đã duyệt lô cho mượn');
        },
    });

    const rejectMutation = useMutation({
        mutationFn: (reason: string) => borrowingService.rejectOutboundBatch(id, { reason }),
        onSuccess: async () => {
            await invalidate();
            setReasonAction(null);
            reasonForm.resetFields();
            message.success('Đã từ chối và trả lô về người lập');
        },
    });

    const cancelMutation = useMutation({
        mutationFn: (reason: string) => borrowingService.cancelOutboundBatch(id, { reason }),
        onSuccess: async () => {
            await invalidate();
            setReasonAction(null);
            reasonForm.resetFields();
            message.success('Đã hủy lô');
        },
    });

    const handoverMutation = useMutation({
        mutationFn: (values: HandoverFormValues) =>
            borrowingService.confirmOutboundHandover(id, {
                handoverTime: values.handoverTime.toISOString(),
                handoverImages: values.handoverImages ?? [],
                note: values.note?.trim() || undefined,
            }),
        onSuccess: async () => {
            await invalidate();
            setIsHandoverOpen(false);
            handoverForm.resetFields();
            message.success('Đã xác nhận bàn giao máy cho đối tác');
        },
    });

    const returnMutation = useMutation({
        mutationFn: (values: ReturnFormValues) =>
            borrowingService.bulkReturnBatch(id, {
                returnTime: values.returnTime.toISOString(),
                note: values.returnNote?.trim() || undefined,
                items: selectedReturnIds.map((borrowingId) => ({
                    borrowingId,
                    returnCondition: values.returnCondition?.trim() || undefined,
                    returnNote: values.returnNote?.trim() || undefined,
                    returnImages: values.returnImages ?? [],
                })),
            }),
        onSuccess: async () => {
            await invalidate();
            setSelectedReturnIds([]);
            setIsReturnOpen(false);
            returnForm.resetFields();
            message.success('Đã xác nhận nhận lại máy');
        },
    });

    const updateMutation = useMutation({
        mutationFn: (payload: UpdateBorrowingBatchPayload) => borrowingService.updateBatch(id, payload),
        onSuccess: async () => {
            await invalidate();
            setIsEditOpen(false);
            message.success('Đã cập nhật hồ sơ lô');
        },
    });

    const activeItems = items.filter((item) => item.status === BorrowingStatus.ACTIVE);
    const selectedReturnItems = activeItems.filter((item) => selectedReturnIds.includes(item.id));
    const selectedCount =
        batch?.selectedCount ?? items.filter((item) => item.status !== BorrowingStatus.CANCELLED).length;
    const issuedCount = batch?.issuedCount ?? items.filter((item) => item.status !== BorrowingStatus.DRAFT).length;
    const returnedCount =
        batch?.returnedCount ?? items.filter((item) => item.status === BorrowingStatus.RETURNED).length;
    const progress = batch?.plannedQuantity
        ? Math.min(100, Math.round((selectedCount / batch.plannedQuantity) * 100))
        : 0;
    const totalAssetValue = items.reduce((sum, item) => sum + Number(item.asset?.purchasePrice || 0), 0);

    const handleScanResolved = (asset: Asset) => {
        if (!batch) return;
        if (asset.ownershipType !== AssetOwnershipType.OWNED) {
            message.error('Chỉ được chọn máy thuộc sở hữu Hải Đăng');
            return;
        }
        if (asset.plantId !== batch.plantId && asset.plant?.id !== batch.plantId) {
            message.error(`Máy không thuộc ${batch.plant?.name || 'cơ sở xuất đã chọn'}`);
            return;
        }
        if (![AssetStatus.ACTIVE, AssetStatus.STORAGE].includes(asset.status)) {
            message.error('Máy phải đang hoạt động hoặc tồn kho');
            return;
        }
        if (existingAssetIds.has(asset.id)) {
            message.info('Máy này đã có trong lô');
            return;
        }
        const current = addForm.getFieldValue('assetIds') ?? [];
        addForm.setFieldValue('assetIds', [...new Set([...current, asset.id])]);
        setIsScannerOpen(false);
        setIsAddOpen(true);
        message.success(`Đã chọn ${asset.machineCode}`);
    };

    const openEdit = () => {
        if (!batch) return;
        editForm.setFieldsValue({
            partnerName: batch.partnerName,
            contactName: batch.contactName,
            contactPhone: batch.contactPhone,
            partnerAddress: batch.partnerAddress,
            contractNo: batch.contractNo,
            area: batch.area,
            purpose: batch.purpose || '',
            expectedReturnTime: batch.expectedReturnTime ? dayjs(batch.expectedReturnTime) : dayjs().add(30, 'day'),
            plannedQuantity: batch.plannedQuantity,
            note: batch.note,
        });
        setIsEditOpen(true);
    };

    const handleEdit = async () => {
        const values = await editForm.validateFields();
        await updateMutation.mutateAsync({
            partnerName: values.partnerName.trim(),
            contactName: values.contactName?.trim() || undefined,
            contactPhone: values.contactPhone?.trim() || undefined,
            partnerAddress: values.partnerAddress?.trim() || undefined,
            contractNo: values.contractNo?.trim() || undefined,
            area: values.area?.trim() || undefined,
            purpose: values.purpose.trim(),
            expectedReturnTime: values.expectedReturnTime.toISOString(),
            ...(editable ? { plannedQuantity: Number(values.plannedQuantity) } : {}),
            note: values.note?.trim() || undefined,
        });
    };

    const handleExport = async () => {
        if (!batch) return;
        setExporting(true);
        try {
            await borrowingService.exportBatchHandover(id, batch.code);
        } catch {
            message.error('Không xuất được biên bản bàn giao');
        } finally {
            setExporting(false);
        }
    };

    const toggleReturn = (itemId: string) => {
        setSelectedReturnIds((current) =>
            current.includes(itemId) ? current.filter((value) => value !== itemId) : [...current, itemId]
        );
    };

    const columns: TableColumnsType<Borrowing> = [
        {
            title: 'MÁY',
            key: 'asset',
            render: (_value, record) => (
                <div className='min-w-[220px]'>
                    <div className='font-bold text-slate-900'>{record.asset?.name || '-'}</div>
                    <div className='mt-1 font-mono text-xs font-black text-blue-700'>
                        {record.asset?.machineCode || record.assetId}
                    </div>
                    <div className='mt-1 text-xs text-slate-500'>
                        {record.asset?.brand?.name || 'Chưa rõ hãng'} · {record.asset?.model || 'Chưa rõ model'}
                    </div>
                </div>
            ),
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'status',
            width: 155,
            render: (status: BorrowingStatus) => (
                <TransactionStatusBadge status={status} direction={BorrowingDirection.OUTBOUND} />
            ),
        },
        {
            title: 'TÌNH TRẠNG GIAO / NHẬN',
            key: 'condition',
            render: (_value, record) => (
                <div className='max-w-[300px] text-sm text-slate-600'>
                    <div className='text-[10px] font-black tracking-wide text-slate-400 uppercase'>Khi giao</div>
                    <div className='mt-0.5 font-semibold text-slate-800'>
                        {record.issueCondition || record.issueNote || 'Chưa ghi nhận'}
                    </div>
                    {record.accessories?.length ? (
                        <div className='mt-1 text-xs'>Kèm: {record.accessories.join(', ')}</div>
                    ) : null}
                    <EvidenceImages urls={record.issueImages} />
                    {record.status === BorrowingStatus.RETURNED ? (
                        <div className='mt-3 border-t border-slate-200 pt-2'>
                            <div className='text-[10px] font-black tracking-wide text-emerald-700 uppercase'>
                                Nhận lại · {formatDateTime(record.returnTime)}
                            </div>
                            <div className='mt-0.5 font-semibold text-slate-800'>
                                {record.returnCondition || record.returnNote || 'Chưa ghi nhận tình trạng'}
                            </div>
                            <EvidenceImages urls={record.returnImages} />
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'GIÁ TRỊ GHI SỔ',
            key: 'value',
            width: 150,
            render: (_value, record) => (
                <span className='font-semibold'>{formatCurrency(record.asset?.purchasePrice)}</span>
            ),
        },
        {
            title: '',
            key: 'action',
            width: 82,
            align: 'right',
            render: (_value, record) =>
                editable && record.status === BorrowingStatus.DRAFT ? (
                    <Popconfirm
                        title='Bỏ máy khỏi lô?'
                        description='Thao tác này không xóa máy khỏi danh mục.'
                        okText='Bỏ máy'
                        cancelText='Giữ lại'
                        onConfirm={() => removeMutation.mutate(record.id)}
                    >
                        <Button danger type='text' icon={<DeleteOutlined />} aria-label='Bỏ máy khỏi lô' />
                    </Popconfirm>
                ) : record.status === BorrowingStatus.ACTIVE ? (
                    <Checkbox
                        checked={selectedReturnIds.includes(record.id)}
                        onChange={() => toggleReturn(record.id)}
                    />
                ) : null,
        },
    ];

    if (isLoading) return <Skeleton active paragraph={{ rows: 12 }} className='rounded-lg bg-white p-6' />;
    if (!batch || batch.direction !== BorrowingDirection.OUTBOUND) {
        return <Empty description='Không tìm thấy lô Hải Đăng cho đối tác mượn' />;
    }

    const statusMeta = outboundBorrowingBatchStatusMeta[batch.status];
    const isRejected = batch.status === BorrowingBatchStatus.REJECTED;
    const canSubmit = editable && selectedCount === batch.plannedQuantity && selectedCount > 0;
    const hasReturnAction = activeItems.length > 0 && canWrite;

    return (
        <div className='flex flex-col gap-5 pb-28 lg:pb-8'>
            <PageHeader
                title={batch.code}
                subtitle='Hồ sơ máy Hải Đăng bàn giao cho đối tác mượn; QR vĩnh viễn được giữ nguyên trong toàn bộ vòng đời.'
                actions={
                    <Space wrap>
                        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/borrowings')}>
                            Quay lại
                        </Button>
                        <Button
                            icon={<DownloadOutlined />}
                            loading={exporting}
                            onClick={handleExport}
                            disabled={!items.length}
                        >
                            Xuất biên bản
                        </Button>
                        {metadataEditable ? (
                            <Button icon={<EditOutlined />} onClick={openEdit}>
                                Sửa hồ sơ
                            </Button>
                        ) : null}
                    </Space>
                }
            />

            {isRejected ? (
                <Alert
                    type='error'
                    showIcon
                    message='Lô bị từ chối, cần chỉnh sửa trước khi gửi lại'
                    description={batch.rejectReason || 'Chưa có lý do từ chối.'}
                />
            ) : null}

            <section className='overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm'>
                <div className='border-b border-slate-200 bg-slate-950 px-4 py-5 text-white sm:px-6'>
                    <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                        <div>
                            <div className='flex flex-wrap items-center gap-2'>
                                <Tag color={statusMeta?.color} className='!m-0'>
                                    {statusMeta?.label || batch.status}
                                </Tag>
                                <span className='text-xs font-bold tracking-[0.14em] text-cyan-300 uppercase'>
                                    Cho mượn ra ngoài
                                </span>
                            </div>
                            <h1 className='mt-3 mb-0 text-xl font-black sm:text-2xl'>{batch.partnerName}</h1>
                            <p className='mt-1 mb-0 text-sm font-medium text-slate-300'>
                                {batch.contractNo || 'Chưa có số hợp đồng'} ·{' '}
                                {batch.plant?.name || 'Chưa rõ cơ sở xuất'}
                            </p>
                        </div>
                        <div className='grid grid-cols-2 gap-x-8 gap-y-2 text-sm lg:text-right'>
                            <div>
                                <span className='block text-xs text-slate-400'>Dự kiến giao</span>
                                <strong>{formatDateTime(batch.borrowTime)}</strong>
                            </div>
                            <div>
                                <span className='block text-xs text-slate-400'>Hạn nhận lại</span>
                                <strong>{formatDateTime(batch.expectedReturnTime)}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <div className='px-4 py-5 sm:px-6'>
                    <Steps
                        current={getWorkflowStep(batch.status)}
                        status={isRejected || batch.status === BorrowingBatchStatus.CANCELLED ? 'error' : 'process'}
                        responsive={false}
                        size='small'
                        items={[
                            { title: 'Chọn máy' },
                            { title: 'Chờ duyệt' },
                            { title: 'Đã duyệt' },
                            { title: 'Đang cho mượn' },
                            { title: 'Đã nhận đủ' },
                        ]}
                        className='overflow-x-auto pb-2 [&_.ant-steps-item]:min-w-[130px]'
                    />
                </div>

                <div className='grid grid-cols-2 border-t border-slate-200 md:grid-cols-4'>
                    {[
                        ['Đã chọn', `${selectedCount}/${batch.plannedQuantity} máy`],
                        ['Đã bàn giao', `${issuedCount} máy`],
                        ['Đã nhận lại', `${returnedCount} máy`],
                        ['Giá trị ghi sổ', formatCurrency(totalAssetValue)],
                    ].map(([label, value], index) => (
                        <div
                            key={label}
                            className={`px-4 py-4 ${index % 2 ? 'border-l' : ''} border-slate-200 md:border-l first:md:border-l-0`}
                        >
                            <div className='text-[10px] font-black tracking-[0.12em] text-slate-400 uppercase'>
                                {label}
                            </div>
                            <div className='mt-1 text-lg font-black text-slate-950'>{value}</div>
                        </div>
                    ))}
                </div>
            </section>

            <section className='grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]'>
                <div className='rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5'>
                    <div className='flex items-center justify-between gap-4'>
                        <div>
                            <div className='text-[11px] font-black tracking-[0.12em] text-slate-500 uppercase'>
                                Tiến độ lập danh sách
                            </div>
                            <div className='mt-1 text-base font-black text-slate-950'>
                                {selectedCount} máy đã được đối chiếu
                            </div>
                        </div>
                        <strong className='text-2xl text-cyan-700'>{progress}%</strong>
                    </div>
                    <Progress
                        percent={progress}
                        showInfo={false}
                        strokeColor='#0e7490'
                        trailColor='#e2e8f0'
                        className='mt-3'
                    />
                    <div className='mt-4 flex flex-wrap gap-2'>
                        {editable ? (
                            <Button
                                type='primary'
                                icon={<PlusOutlined />}
                                onClick={() => setIsAddOpen(true)}
                                className='bg-cyan-700 hover:!bg-cyan-800'
                            >
                                Thêm / quét máy
                            </Button>
                        ) : null}
                        {canSubmit ? (
                            <Popconfirm
                                title='Gửi lô cho giám đốc duyệt?'
                                description='Danh sách máy sẽ bị khóa cho tới khi bị từ chối hoặc được duyệt.'
                                okText='Gửi duyệt'
                                cancelText='Kiểm tra lại'
                                onConfirm={() => submitMutation.mutate()}
                            >
                                <Button icon={<SendOutlined />} loading={submitMutation.isPending}>
                                    Gửi duyệt
                                </Button>
                            </Popconfirm>
                        ) : null}
                    </div>
                </div>

                <div className='rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5'>
                    <div className='flex items-center gap-2 text-sm font-black text-slate-950'>
                        <SafetyCertificateOutlined className='text-cyan-700' /> Kiểm soát QR
                    </div>
                    <p className='mt-2 mb-0 text-sm leading-6 text-slate-600'>
                        Mỗi máy giữ nguyên QR và mã máy Hải Đăng. Khi trả chỉ xác nhận tình trạng, không gỡ hoặc vô hiệu
                        hóa tem.
                    </p>
                </div>
            </section>

            <section className='overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm'>
                <div className='flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5'>
                    <div>
                        <div className='text-[11px] font-black tracking-[0.12em] text-slate-500 uppercase'>
                            Danh sách bàn giao
                        </div>
                        <h2 className='mt-1 mb-0 text-lg font-black text-slate-950'>{items.length} máy trong lô</h2>
                    </div>
                    {hasReturnAction ? (
                        <div className='flex items-center gap-2'>
                            <Button
                                size='small'
                                onClick={() => setSelectedReturnIds(activeItems.map((item) => item.id))}
                            >
                                Chọn máy đang mượn
                            </Button>
                            <Button
                                type='primary'
                                size='small'
                                icon={<RollbackOutlined />}
                                disabled={!selectedReturnIds.length}
                                onClick={() => {
                                    returnForm.setFieldsValue({ returnTime: dayjs() });
                                    setIsReturnOpen(true);
                                }}
                                className='bg-emerald-700 hover:!bg-emerald-800'
                            >
                                Nhận lại ({selectedReturnIds.length})
                            </Button>
                        </div>
                    ) : null}
                </div>

                <div className='hidden md:block'>
                    <Table<Borrowing>
                        rowKey='id'
                        dataSource={items}
                        columns={columns}
                        pagination={false}
                        scroll={{ x: 1080 }}
                    />
                </div>
                <div className='grid grid-cols-1 gap-3 p-3 md:hidden'>
                    {items.length ? (
                        items.map((item) => {
                            const isActive = item.status === BorrowingStatus.ACTIVE;
                            const selected = selectedReturnIds.includes(item.id);
                            return (
                                <article
                                    key={item.id}
                                    className={`rounded-lg border p-4 ${selected ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}
                                    onClick={() => isActive && toggleReturn(item.id)}
                                >
                                    <div className='flex items-start justify-between gap-3'>
                                        <div className='min-w-0'>
                                            <TransactionStatusBadge
                                                status={item.status}
                                                direction={BorrowingDirection.OUTBOUND}
                                            />
                                            <h3 className='mt-2 mb-0 line-clamp-2 text-base font-black text-slate-950'>
                                                {item.asset?.name || '-'}
                                            </h3>
                                            <span className='mt-1 inline-block font-mono text-xs font-black text-blue-700'>
                                                {item.asset?.machineCode || item.assetId}
                                            </span>
                                        </div>
                                        {isActive ? (
                                            <Checkbox checked={selected} />
                                        ) : editable && item.status === BorrowingStatus.DRAFT ? (
                                            <Popconfirm
                                                title='Bỏ máy khỏi lô?'
                                                onConfirm={() => removeMutation.mutate(item.id)}
                                            >
                                                <Button
                                                    danger
                                                    type='text'
                                                    icon={<DeleteOutlined />}
                                                    onClick={(event) => event.stopPropagation()}
                                                />
                                            </Popconfirm>
                                        ) : null}
                                    </div>
                                    <div className='mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs'>
                                        <div>
                                            <span className='block text-slate-400'>Tình trạng xuất</span>
                                            <strong className='text-slate-700'>
                                                {item.issueCondition || 'Chưa ghi'}
                                            </strong>
                                        </div>
                                        <div>
                                            <span className='block text-slate-400'>Giá trị ghi sổ</span>
                                            <strong className='text-slate-700'>
                                                {formatCurrency(item.asset?.purchasePrice)}
                                            </strong>
                                        </div>
                                    </div>
                                    <EvidenceImages urls={item.issueImages} />
                                    {item.status === BorrowingStatus.RETURNED ? (
                                        <div className='mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs'>
                                            <span className='block font-black text-emerald-800 uppercase'>
                                                Nhận lại · {formatDateTime(item.returnTime)}
                                            </span>
                                            <strong className='mt-1 block text-slate-800'>
                                                {item.returnCondition || item.returnNote || 'Chưa ghi nhận tình trạng'}
                                            </strong>
                                            <EvidenceImages urls={item.returnImages} />
                                        </div>
                                    ) : null}
                                </article>
                            );
                        })
                    ) : (
                        <Empty description='Chưa có máy trong lô' />
                    )}
                </div>
            </section>

            <section className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                <div className='rounded-lg border border-slate-200 bg-white p-5 shadow-sm'>
                    <div className='text-[11px] font-black tracking-[0.12em] text-slate-500 uppercase'>
                        Thông tin đối tác
                    </div>
                    <dl className='mt-4 grid grid-cols-[120px_1fr] gap-x-3 gap-y-3 text-sm'>
                        <dt className='text-slate-500'>Đầu mối</dt>
                        <dd className='m-0 font-semibold text-slate-800'>{batch.contactName || '-'}</dd>
                        <dt className='text-slate-500'>Điện thoại</dt>
                        <dd className='m-0 font-semibold text-slate-800'>{batch.contactPhone || '-'}</dd>
                        <dt className='text-slate-500'>Địa điểm</dt>
                        <dd className='m-0 font-semibold text-slate-800'>{batch.partnerAddress || '-'}</dd>
                        <dt className='text-slate-500'>Mục đích</dt>
                        <dd className='m-0 font-semibold text-slate-800'>{batch.purpose || '-'}</dd>
                    </dl>
                </div>
                <div className='rounded-lg border border-slate-200 bg-white p-5 shadow-sm'>
                    <div className='text-[11px] font-black tracking-[0.12em] text-slate-500 uppercase'>
                        Dấu vết phê duyệt
                    </div>
                    <dl className='mt-4 grid grid-cols-[120px_1fr] gap-x-3 gap-y-3 text-sm'>
                        <dt className='text-slate-500'>Gửi duyệt</dt>
                        <dd className='m-0 font-semibold text-slate-800'>{formatDateTime(batch.submittedAt)}</dd>
                        <dt className='text-slate-500'>Phê duyệt</dt>
                        <dd className='m-0 font-semibold text-slate-800'>{formatDateTime(batch.approvedAt)}</dd>
                        <dt className='text-slate-500'>Bàn giao</dt>
                        <dd className='m-0 font-semibold text-slate-800'>{formatDateTime(batch.handedOverAt)}</dd>
                        <dt className='text-slate-500'>Ghi chú</dt>
                        <dd className='m-0 font-semibold text-slate-800'>{batch.note || '-'}</dd>
                    </dl>
                    {batch.handoverImages?.length ? (
                        <Image.PreviewGroup>
                            <div className='mt-4 flex gap-2'>
                                {batch.handoverImages.map((url) => (
                                    <Image
                                        key={url}
                                        src={url}
                                        width={64}
                                        height={64}
                                        className='rounded-md object-cover'
                                    />
                                ))}
                            </div>
                        </Image.PreviewGroup>
                    ) : null}
                </div>
            </section>

            <div className='fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden'>
                {editable ? (
                    <div className='grid grid-cols-2 gap-2'>
                        <Button size='large' icon={<QrcodeOutlined />} onClick={() => setIsAddOpen(true)}>
                            Thêm máy
                        </Button>
                        <Button
                            type='primary'
                            size='large'
                            icon={<SendOutlined />}
                            disabled={!canSubmit}
                            loading={submitMutation.isPending}
                            onClick={() => submitMutation.mutate()}
                            className='bg-cyan-700 hover:!bg-cyan-800'
                        >
                            Gửi duyệt
                        </Button>
                    </div>
                ) : batch.status === BorrowingBatchStatus.APPROVED && canWrite ? (
                    <Button
                        block
                        type='primary'
                        size='large'
                        icon={<CheckCircleOutlined />}
                        onClick={() => {
                            handoverForm.setFieldsValue({ handoverTime: dayjs() });
                            setIsHandoverOpen(true);
                        }}
                        className='h-12 bg-cyan-700 font-bold hover:!bg-cyan-800'
                    >
                        Xác nhận bàn giao
                    </Button>
                ) : hasReturnAction ? (
                    <Button
                        block
                        type='primary'
                        size='large'
                        icon={<RollbackOutlined />}
                        disabled={!selectedReturnIds.length}
                        onClick={() => {
                            returnForm.setFieldsValue({ returnTime: dayjs() });
                            setIsReturnOpen(true);
                        }}
                        className='h-12 bg-emerald-700 font-bold hover:!bg-emerald-800'
                    >
                        Nhận lại {selectedReturnIds.length} máy
                    </Button>
                ) : null}
            </div>

            {batch.status === BorrowingBatchStatus.PENDING_APPROVAL && canApprove ? (
                <div className='fixed right-5 bottom-24 z-20 hidden items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-lg lg:flex'>
                    <Button danger icon={<CloseCircleOutlined />} onClick={() => setReasonAction('reject')}>
                        Từ chối
                    </Button>
                    <Popconfirm
                        title='Duyệt lô cho mượn này?'
                        onConfirm={() => approveMutation.mutate()}
                        okText='Duyệt'
                    >
                        <Button
                            type='primary'
                            icon={<CheckCircleOutlined />}
                            loading={approveMutation.isPending}
                            className='bg-emerald-700 hover:!bg-emerald-800'
                        >
                            Phê duyệt
                        </Button>
                    </Popconfirm>
                </div>
            ) : null}

            <div className='flex flex-wrap justify-end gap-2'>
                {batch.status === BorrowingBatchStatus.PENDING_APPROVAL && canApprove ? (
                    <>
                        <Button danger icon={<CloseCircleOutlined />} onClick={() => setReasonAction('reject')}>
                            Từ chối
                        </Button>
                        <Popconfirm
                            title='Duyệt lô cho mượn này?'
                            onConfirm={() => approveMutation.mutate()}
                            okText='Duyệt'
                        >
                            <Button
                                type='primary'
                                icon={<CheckCircleOutlined />}
                                loading={approveMutation.isPending}
                                className='bg-emerald-700 hover:!bg-emerald-800'
                            >
                                Phê duyệt
                            </Button>
                        </Popconfirm>
                    </>
                ) : null}
                {batch.status === BorrowingBatchStatus.APPROVED && canWrite ? (
                    <Button
                        type='primary'
                        icon={<AuditOutlined />}
                        onClick={() => {
                            handoverForm.setFieldsValue({ handoverTime: dayjs() });
                            setIsHandoverOpen(true);
                        }}
                        className='bg-cyan-700 hover:!bg-cyan-800'
                    >
                        Xác nhận bàn giao máy
                    </Button>
                ) : null}
                {canApprove && cancellableStatuses.has(batch.status) ? (
                    <Button danger type='text' onClick={() => setReasonAction('cancel')}>
                        Hủy lô
                    </Button>
                ) : null}
            </div>

            <Modal
                open={isAddOpen}
                title='Chọn máy Hải Đăng đưa vào lô'
                width={720}
                destroyOnHidden
                maskClosable={false}
                onCancel={() => setIsAddOpen(false)}
                okText={`Thêm ${addForm.getFieldValue('assetIds')?.length || ''} máy`}
                confirmLoading={addMutation.isPending}
                onOk={() => addForm.validateFields().then((values) => addMutation.mutate(values))}
            >
                <Alert
                    type='info'
                    showIcon
                    message={`Chỉ hiển thị máy hoạt động/tồn kho tại ${batch.plant?.name || 'cơ sở xuất'}`}
                    className='mb-4'
                />
                <Form
                    form={addForm}
                    layout='vertical'
                    initialValues={{ issueCondition: 'Đang sử dụng bình thường', assetIds: [] }}
                >
                    <Form.Item
                        name='assetIds'
                        label='Máy bàn giao'
                        rules={[{ required: true, type: 'array', min: 1, message: 'Chọn ít nhất một máy' }]}
                    >
                        <Select
                            mode='multiple'
                            size='large'
                            showSearch
                            filterOption={false}
                            searchValue={assetSearch}
                            onSearch={setAssetSearch}
                            loading={loadingCandidates}
                            placeholder='Tìm theo mã máy, serial, tên máy...'
                            options={candidates.map((asset) => ({
                                value: asset.id,
                                label: `${asset.machineCode} · ${asset.name} · ${asset.area || 'Chưa có khu vực'}`,
                            }))}
                            maxTagCount='responsive'
                        />
                    </Form.Item>
                    <Button block icon={<CameraOutlined />} className='mb-4' onClick={() => setIsScannerOpen(true)}>
                        Quét QR máy để chọn
                    </Button>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                        <Form.Item name='issueCondition' label='Tình trạng khi xuất'>
                            <Input size='large' placeholder='Ví dụ: hoạt động tốt, đủ bộ phận' maxLength={200} />
                        </Form.Item>
                        <Form.Item name='accessories' label='Phụ kiện đi kèm'>
                            <Input
                                size='large'
                                placeholder='Chân vịt, bàn máy, mô-tơ... cách nhau bằng dấu phẩy'
                                maxLength={300}
                            />
                        </Form.Item>
                        <Form.Item name='issueNote' label='Ghi chú tình trạng' className='md:col-span-2'>
                            <Input.TextArea rows={2} maxLength={500} showCount />
                        </Form.Item>
                        <Form.Item name='issueImages' label='Ảnh hiện trạng' className='md:col-span-2'>
                            <CloudinaryImagesField
                                folder={`borrowing/outbound/${batch.id}/issue`}
                                max={5}
                                emptyHint='Chụp toàn cảnh hoặc chi tiết dễ đối chiếu khi nhận lại'
                            />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>

            <QrScanLookupModal
                open={isScannerOpen}
                onClose={() => setIsScannerOpen(false)}
                onResolved={handleScanResolved}
                title='Quét QR chọn máy cho mượn'
                subtitle='QR chỉ dùng nhận diện máy, không bị thay đổi hoặc thu hồi'
            />

            <Modal
                open={isHandoverOpen}
                title='Xác nhận bàn giao máy cho đối tác'
                okText='Xác nhận đã giao'
                confirmLoading={handoverMutation.isPending}
                onCancel={() => setIsHandoverOpen(false)}
                onOk={() => handoverForm.validateFields().then((values) => handoverMutation.mutate(values))}
                destroyOnHidden
                maskClosable={false}
            >
                <Alert
                    type='warning'
                    showIcon
                    message={`Thao tác này chuyển ${items.filter((item) => item.status === BorrowingStatus.DRAFT).length} máy sang trạng thái “Đang cho đối tác mượn”.`}
                    className='mb-4'
                />
                <Form form={handoverForm} layout='vertical'>
                    <Form.Item
                        name='handoverTime'
                        label='Thời điểm bàn giao'
                        rules={[{ required: true, message: 'Chọn thời điểm bàn giao' }]}
                    >
                        <DatePicker showTime format='DD/MM/YYYY HH:mm' size='large' className='w-full' />
                    </Form.Item>
                    <Form.Item name='handoverImages' label='Ảnh bàn giao'>
                        <CloudinaryImagesField
                            folder={`borrowing/outbound/${batch.id}/handover`}
                            max={5}
                            emptyHint='Ảnh máy, người nhận hoặc biên bản đã ký'
                        />
                    </Form.Item>
                    <Form.Item name='note' label='Ghi chú bàn giao'>
                        <Input.TextArea rows={3} maxLength={500} showCount />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                open={isReturnOpen}
                title={`Nhận lại ${selectedReturnItems.length} máy từ đối tác`}
                okText='Xác nhận nhận lại'
                confirmLoading={returnMutation.isPending}
                onCancel={() => setIsReturnOpen(false)}
                onOk={() => returnForm.validateFields().then((values) => returnMutation.mutate(values))}
                destroyOnHidden
                maskClosable={false}
            >
                <Alert
                    type='info'
                    showIcon
                    message='Máy được khôi phục về cơ sở, khu vực và trạng thái trước khi bàn giao. QR vĩnh viễn giữ nguyên.'
                    className='mb-4'
                />
                <Form form={returnForm} layout='vertical'>
                    <Form.Item
                        name='returnTime'
                        label='Thời điểm nhận lại'
                        rules={[{ required: true, message: 'Chọn thời điểm nhận lại' }]}
                    >
                        <DatePicker showTime format='DD/MM/YYYY HH:mm' size='large' className='w-full' />
                    </Form.Item>
                    <Form.Item name='returnCondition' label='Tình trạng khi nhận lại'>
                        <Input
                            size='large'
                            placeholder='Nguyên trạng / hao mòn / thiếu phụ kiện / có lỗi...'
                            maxLength={200}
                        />
                    </Form.Item>
                    <Form.Item name='returnImages' label='Ảnh đối chiếu khi nhận lại'>
                        <CloudinaryImagesField folder={`borrowing/outbound/${batch.id}/return`} max={5} />
                    </Form.Item>
                    <Form.Item name='returnNote' label='Ghi chú'>
                        <Input.TextArea rows={3} maxLength={500} showCount />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                open={isEditOpen}
                title='Cập nhật hồ sơ lô cho mượn'
                width={720}
                okText='Lưu thay đổi'
                confirmLoading={updateMutation.isPending}
                onCancel={() => setIsEditOpen(false)}
                onOk={handleEdit}
                destroyOnHidden
            >
                <Form form={editForm} layout='vertical'>
                    <div className='grid grid-cols-1 gap-x-4 md:grid-cols-2'>
                        <Form.Item
                            name='partnerName'
                            label='Tên đối tác'
                            rules={[{ required: true, whitespace: true }]}
                        >
                            <Input size='large' />
                        </Form.Item>
                        <Form.Item name='contractNo' label='Số hợp đồng / biên bản'>
                            <Input size='large' />
                        </Form.Item>
                        <Form.Item name='contactName' label='Người liên hệ'>
                            <Input size='large' />
                        </Form.Item>
                        <Form.Item name='contactPhone' label='Số điện thoại'>
                            <Input size='large' />
                        </Form.Item>
                        <Form.Item name='partnerAddress' label='Địa điểm đặt máy' className='md:col-span-2'>
                            <Input size='large' />
                        </Form.Item>
                        <Form.Item name='area' label='Khu vực xuất'>
                            <Input size='large' />
                        </Form.Item>
                        <Form.Item name='plannedQuantity' label='Số máy dự kiến' rules={[{ required: true }]}>
                            <InputNumber
                                min={Math.max(selectedCount, 1)}
                                max={1000}
                                precision={0}
                                size='large'
                                className='!w-full'
                                disabled={!editable}
                            />
                        </Form.Item>
                        <Form.Item name='expectedReturnTime' label='Hạn nhận lại' rules={[{ required: true }]}>
                            <DatePicker showTime format='DD/MM/YYYY HH:mm' size='large' className='w-full' />
                        </Form.Item>
                        <Form.Item
                            name='purpose'
                            label='Mục đích'
                            className='md:col-span-2'
                            rules={[{ required: true, whitespace: true }]}
                        >
                            <Input.TextArea rows={2} />
                        </Form.Item>
                        <Form.Item name='note' label='Ghi chú' className='md:col-span-2'>
                            <Input.TextArea rows={2} />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>

            <Modal
                open={Boolean(reasonAction)}
                title={reasonAction === 'reject' ? 'Từ chối lô cho mượn' : 'Hủy lô cho mượn'}
                okText={reasonAction === 'reject' ? 'Xác nhận từ chối' : 'Xác nhận hủy'}
                okButtonProps={{ danger: true }}
                confirmLoading={rejectMutation.isPending || cancelMutation.isPending}
                onCancel={() => setReasonAction(null)}
                onOk={() =>
                    reasonForm.validateFields().then(({ reason }) => {
                        if (reasonAction === 'reject') rejectMutation.mutate(reason.trim());
                        else cancelMutation.mutate(reason.trim());
                    })
                }
                destroyOnHidden
            >
                <Form form={reasonForm} layout='vertical'>
                    <Form.Item
                        name='reason'
                        label='Lý do'
                        rules={[{ required: true, whitespace: true, message: 'Nhập lý do để lưu dấu vết' }]}
                    >
                        <Input.TextArea rows={4} maxLength={500} showCount />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default OutboundBorrowingBatchDetail;
