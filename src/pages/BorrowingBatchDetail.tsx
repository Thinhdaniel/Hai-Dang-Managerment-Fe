import React, { useMemo, useState } from 'react';
import {
    Alert,
    App,
    Button,
    Card,
    DatePicker,
    Empty,
    Form,
    Input,
    Modal,
    Select,
    Skeleton,
    Space,
    Statistic,
    Table,
    Tabs,
    Tag,
    type TableColumnsType,
} from 'antd';
import {
    ArrowLeftOutlined,
    CheckCircleOutlined,
    DownloadOutlined,
    EditOutlined,
    PlusOutlined,
    PrinterOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    ScanOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../components/shared/PageHeader';
import QrCameraScanner from '../components/QrCameraScanner';
import TransactionStatusBadge from '../components/transactions/TransactionStatusBadge';
import TransactionTypeBadge from '../components/transactions/TransactionTypeBadge';
import { borrowingBatchStatusMeta, qrReturnActionMeta, qrReturnActionOptions } from '../core/constants/transactions';
import { extractPublicId } from '../core/lib/qrScan';
import { brandService, plantService } from '../core/services';
import { borrowingService } from '../core/services/borrowing.service';
import { qrLabelService } from '../core/services/qr-label.service';
import {
    type Borrowing,
    type BorrowingStatus,
    type BulkReturnBorrowingBatchPayload,
    type QrReturnAction,
    type ReceiveBorrowingBatchByQrPayload,
} from '../core/types';

type ReceiveFormValues = {
    publicId?: string;
    name: string;
    machineCode?: string;
    partnerMachineCode?: string;
    serial?: string;
    type: string;
    model: string;
    brandId: string;
    plantId?: string;
    area?: string;
    receiveCondition?: string;
    receiveNote?: string;
    note?: string;
};

type ReturnFormValues = {
    returnTime: dayjs.Dayjs;
    qrReturnAction?: QrReturnAction;
    returnCondition?: string;
    returnNote?: string;
    qrReturnNote?: string;
};

type EditBatchFormValues = {
    partnerName?: string;
    contractNo?: string;
    area?: string;
    expectedReturnTime?: dayjs.Dayjs;
    note?: string;
};

const formatDateTime = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-');
const BORROWING_STATUS_ACTIVE = 'active' as BorrowingStatus;
const BORROWING_STATUS_RETURNED = 'returned' as BorrowingStatus;
const QR_RETURN_ACTION_REMOVED = 'removed' as QrReturnAction;

const BorrowingBatchDetail: React.FC = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const [receiveForm] = Form.useForm<ReceiveFormValues>();
    const [returnForm] = Form.useForm<ReturnFormValues>();
    const [editBatchForm] = Form.useForm<EditBatchFormValues>();

    const [activeTab, setActiveTab] = useState('receive');
    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    // Nhận máy KHÔNG dán tem — không đụng gì vào máy khách, nhận diện bằng serial/mã đối tác
    const [noQrReceive, setNoQrReceive] = useState(false);
    const [isEditBatchOpen, setIsEditBatchOpen] = useState(false);
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [selectedReturnIds, setSelectedReturnIds] = useState<React.Key[]>([]);
    const [resolvingReturnQr, setResolvingReturnQr] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['borrowing-batch', id],
        queryFn: () => borrowingService.getBatchById(id),
        enabled: Boolean(id),
    });

    const { data: brands = [] } = useQuery({
        queryKey: ['brands'],
        queryFn: () => brandService.getAll(),
    });

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const batch = data?.batch;
    const items = data?.items ?? [];
    const activeItems = useMemo(() => items.filter((item) => item.status === BORROWING_STATUS_ACTIVE), [items]);
    const selectedActiveItems = useMemo(
        () => activeItems.filter((item) => selectedReturnIds.includes(item.id)),
        [activeItems, selectedReturnIds]
    );

    const brandOptions = useMemo(() => brands.map((brand) => ({ value: brand.id, label: brand.name })), [brands]);
    const plantOptions = useMemo(
        () =>
            plants.map((plant) => ({
                value: plant.id,
                label: plant.code ? `${plant.name} (${plant.code})` : plant.name,
            })),
        [plants]
    );

    const createQrMutation = useMutation({
        mutationFn: () => borrowingService.createBatchQr(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['borrowing-batch', id] });
            queryClient.invalidateQueries({ queryKey: ['borrowing-batches'] });
            queryClient.invalidateQueries({ queryKey: ['qr-label-batches'] });
            message.success('Đã tạo lô QR tạm');
        },
    });

    const receiveMutation = useMutation({
        mutationFn: (payload: ReceiveBorrowingBatchByQrPayload) => borrowingService.receiveBatchByQr(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['borrowing-batch', id] });
            queryClient.invalidateQueries({ queryKey: ['borrowing-batches'] });
            queryClient.invalidateQueries({ queryKey: ['borrowing-batch-stats'] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['qr-label-batches'] });
            queryClient.invalidateQueries({ queryKey: ['qr-labels'] });
            setIsReceiveModalOpen(false);
            receiveForm.resetFields();
            message.success('Đã nhận máy vào lô');
        },
    });

    const bulkReturnMutation = useMutation({
        mutationFn: (payload: BulkReturnBorrowingBatchPayload) => borrowingService.bulkReturnBatch(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['borrowing-batch', id] });
            queryClient.invalidateQueries({ queryKey: ['borrowing-batches'] });
            queryClient.invalidateQueries({ queryKey: ['borrowing-batch-stats'] });
            queryClient.invalidateQueries({ queryKey: ['borrowings'] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['qr-labels'] });
            setSelectedReturnIds([]);
            setIsReturnModalOpen(false);
            returnForm.resetFields();
            message.success('Đã trả máy và vô hiệu hóa QR tạm');
        },
    });

    const updateBatchMutation = useMutation({
        mutationFn: (payload: Parameters<typeof borrowingService.updateBatch>[1]) =>
            borrowingService.updateBatch(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['borrowing-batch', id] });
            queryClient.invalidateQueries({ queryKey: ['borrowing-batches'] });
            queryClient.invalidateQueries({ queryKey: ['borrowing-batch-stats'] });
            setIsEditBatchOpen(false);
            message.success('Đã cập nhật thông tin lô');
        },
    });

    const openEditBatchModal = () => {
        if (!batch) return;
        editBatchForm.setFieldsValue({
            partnerName: batch.partnerName === 'Chưa xác định' ? undefined : batch.partnerName,
            contractNo: batch.contractNo,
            area: batch.area,
            expectedReturnTime: batch.expectedReturnTime ? dayjs(batch.expectedReturnTime) : undefined,
            note: batch.note,
        });
        setIsEditBatchOpen(true);
    };

    const handleEditBatchSubmit = async () => {
        const values = await editBatchForm.validateFields();
        await updateBatchMutation.mutateAsync({
            partnerName: values.partnerName?.trim() || undefined,
            contractNo: values.contractNo?.trim() || undefined,
            area: values.area?.trim() || undefined,
            expectedReturnTime: values.expectedReturnTime?.toISOString(),
            note: values.note?.trim() || undefined,
        });
    };

    const [exportingHandover, setExportingHandover] = useState(false);
    const handleExportHandover = async () => {
        if (!batch) return;
        setExportingHandover(true);
        try {
            await borrowingService.exportBatchHandover(id, batch.code);
        } catch {
            message.error('Không xuất được biên bản. Thử lại sau.');
        } finally {
            setExportingHandover(false);
        }
    };

    const openReceiveModal = (rawValue: string) => {
        if (!batch) return;
        const publicId = extractPublicId(rawValue);
        setNoQrReceive(false);
        receiveForm.setFieldsValue({
            publicId,
            plantId: batch.plantId,
            area: batch.area,
        });
        setIsReceiveModalOpen(true);
    };

    const openReceiveNoQrModal = () => {
        if (!batch) return;
        setNoQrReceive(true);
        receiveForm.setFieldsValue({
            publicId: undefined,
            plantId: batch.plantId,
            area: batch.area,
        });
        setIsReceiveModalOpen(true);
    };

    const handleReceiveSubmit = async () => {
        const values = await receiveForm.validateFields();
        await receiveMutation.mutateAsync({
            publicId: noQrReceive ? undefined : values.publicId,
            asset: {
                name: values.name.trim(),
                machineCode: values.machineCode?.trim() || undefined,
                serial: values.serial?.trim() || undefined,
                type: values.type.trim(),
                model: values.model.trim(),
                brandId: values.brandId,
                plantId: values.plantId,
                area: values.area?.trim() || undefined,
                note: values.note?.trim() || undefined,
            },
            partnerMachineCode: values.partnerMachineCode?.trim() || undefined,
            receiveCondition: values.receiveCondition?.trim() || undefined,
            receiveNote: values.receiveNote?.trim() || undefined,
        });
    };

    const handleReturnDetected = async (rawValue: string) => {
        if (resolvingReturnQr) return;
        setResolvingReturnQr(true);

        try {
            const publicId = extractPublicId(rawValue);
            const resolved = await qrLabelService.resolveInternal(publicId);
            const assetId = resolved.asset?.id;

            if (!assetId) {
                message.warning('QR này chưa gắn máy hoặc không còn nhận diện được asset.');
                return;
            }

            const target = activeItems.find((item) => item.assetId === assetId);
            if (!target) {
                message.warning('Máy này không thuộc lô đang trả hoặc đã được trả trước đó.');
                return;
            }

            setSelectedReturnIds((current) => {
                if (current.includes(target.id)) {
                    message.info('Máy này đã nằm trong danh sách trả.');
                    return current;
                }
                message.success(`Đã thêm "${target.asset?.name || target.asset?.machineCode}" vào danh sách trả`);
                return [...current, target.id];
            });
        } finally {
            setResolvingReturnQr(false);
        }
    };

    const handleBulkReturn = async () => {
        const values = await returnForm.validateFields();
        await bulkReturnMutation.mutateAsync({
            returnTime: values.returnTime.toISOString(),
            note: values.returnNote?.trim() || undefined,
            items: selectedActiveItems.map((item) => ({
                borrowingId: item.id,
                // Máy nhận không tem thì không có QR để xử lý — chỉ gửi action cho máy có tem
                qrReturnAction: item.qrLabelId ? values.qrReturnAction : undefined,
                returnCondition: values.returnCondition?.trim() || undefined,
                returnNote: values.returnNote?.trim() || undefined,
                qrReturnNote: item.qrLabelId ? values.qrReturnNote?.trim() || undefined : undefined,
            })),
        });
    };

    const toggleReturnSelection = (itemId: string) => {
        setSelectedReturnIds((current) =>
            current.includes(itemId) ? current.filter((currentId) => currentId !== itemId) : [...current, itemId]
        );
    };

    const renderMobileBorrowingCard = (record: Borrowing, index: number, selectable = false) => {
        const selected = selectedReturnIds.includes(record.id);
        const returned = record.status === BORROWING_STATUS_RETURNED;
        const qrMeta = record.qrReturnAction ? qrReturnActionMeta[record.qrReturnAction] : null;
        const machineCode = record.asset?.machineCode || record.assetId;

        return (
            <article
                key={record.id}
                role={selectable ? 'button' : undefined}
                tabIndex={selectable ? 0 : undefined}
                className={[
                    'borrowing-batch-mobile-item',
                    selected ? 'borrowing-batch-mobile-item--selected' : '',
                    returned ? 'borrowing-batch-mobile-item--returned' : '',
                ]
                    .filter(Boolean)
                    .join(' ')}
                style={{ animationDelay: `${Math.min(index * 60, 420)}ms` }}
                onClick={() => selectable && toggleReturnSelection(record.id)}
                onKeyDown={(event) => {
                    if (!selectable) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleReturnSelection(record.id);
                    }
                }}
            >
                <div className='borrowing-batch-mobile-item__shine' />
                <div className='relative z-[1] flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                            <TransactionStatusBadge status={record.status} />
                            {!record.qrLabelId ? (
                                <Tag>Không tem</Tag>
                            ) : qrMeta ? (
                                <Tag color={qrMeta.color}>{qrMeta.label}</Tag>
                            ) : (
                                <Tag color='processing'>QR tạm</Tag>
                            )}
                        </div>
                        <h3 className='mt-2 mb-0 line-clamp-2 text-base font-black text-slate-950'>
                            {record.asset?.name || '-'}
                        </h3>
                        <div className='mt-1 flex flex-wrap items-center gap-2'>
                            <span className='borrowing-batch-mobile-item__code'>{machineCode}</span>
                            {record.partnerMachineCode ? (
                                <span className='text-[11px] font-bold text-slate-500'>
                                    Đối tác: {record.partnerMachineCode}
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <div
                        className={[
                            'borrowing-batch-mobile-item__select',
                            selected ? 'borrowing-batch-mobile-item__select--active' : '',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                    >
                        {selected ? <CheckCircleOutlined /> : <QrcodeOutlined />}
                    </div>
                </div>

                <div className='relative z-[1] mt-4 grid grid-cols-2 gap-2'>
                    <div className='borrowing-batch-mobile-time'>
                        <span>Nhận máy</span>
                        <strong>{formatDateTime(record.borrowTime)}</strong>
                    </div>
                    <div className='borrowing-batch-mobile-time'>
                        <span>Trả máy</span>
                        <strong>{formatDateTime(record.returnTime)}</strong>
                    </div>
                </div>

                <p className='relative z-[1] mt-3 mb-0 line-clamp-2 rounded-2xl bg-white/72 px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-100'>
                    {record.receiveCondition ||
                        record.receiveNote ||
                        record.returnNote ||
                        'Chưa có ghi chú tình trạng.'}
                </p>
            </article>
        );
    };

    const columns: TableColumnsType<Borrowing> = [
        {
            title: 'MÁY',
            key: 'asset',
            render: (_value, record) => (
                <div className='flex min-w-[240px] flex-col gap-1'>
                    <span className='text-sm font-black text-slate-900'>{record.asset?.name || '-'}</span>
                    <span className='font-mono text-xs font-bold text-blue-700'>
                        {record.asset?.machineCode || '-'}
                    </span>
                    {record.partnerMachineCode ? (
                        <span className='text-xs font-semibold text-slate-500'>
                            Mã đối tác: {record.partnerMachineCode}
                        </span>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'status',
            width: 150,
            render: (status) => <TransactionStatusBadge status={status} />,
        },
        {
            title: 'QR TẠM',
            key: 'qr',
            width: 180,
            render: (_value, record) => {
                if (!record.qrLabelId) return <Tag>Không tem</Tag>;
                return record.status === BORROWING_STATUS_RETURNED ? (
                    <div className='flex flex-col gap-1'>
                        <Tag
                            color={record.qrReturnAction ? qrReturnActionMeta[record.qrReturnAction].color : 'default'}
                        >
                            {record.qrReturnAction ? qrReturnActionMeta[record.qrReturnAction].label : 'Đã xử lý'}
                        </Tag>
                        <span className='text-xs text-slate-500'>{formatDateTime(record.qrRemovedAt)}</span>
                    </div>
                ) : (
                    <Tag color='processing'>Đang gắn trên máy</Tag>
                );
            },
        },
        {
            title: 'THỜI GIAN',
            key: 'time',
            width: 220,
            render: (_value, record) => (
                <div className='flex flex-col gap-1 text-sm'>
                    <span>Nhận: {formatDateTime(record.borrowTime)}</span>
                    <span className='text-slate-500'>Trả: {formatDateTime(record.returnTime)}</span>
                </div>
            ),
        },
        {
            title: 'GHI CHÚ',
            key: 'note',
            render: (_value, record) => (
                <span className='text-sm text-slate-600'>
                    {record.receiveCondition || record.receiveNote || record.returnNote || '-'}
                </span>
            ),
        },
    ];

    if (isLoading) {
        return <Skeleton active paragraph={{ rows: 10 }} className='rounded-xl bg-white p-6' />;
    }

    if (!batch) {
        return <Empty description='Không tìm thấy lô mượn/thuê' />;
    }

    const statusMeta = borrowingBatchStatusMeta[batch.status];
    const batchClosed = batch.status === 'returned' || batch.status === 'cancelled';
    // Lô còn nợ thông tin sau rà soát — nhắc bổ sung
    const needsInfo = !batchClosed && (batch.partnerName === 'Chưa xác định' || !batch.expectedReturnTime);
    const selectedHasLabel = selectedActiveItems.some((item) => item.qrLabelId);

    return (
        <div className='borrowing-batch-mobile-page flex flex-col gap-5'>
            <PageHeader
                title={batch.code}
                subtitle='Quản lý nhận/trả nhiều máy mượn hoặc thuê — có tem QR tạm hoặc không tem đều được.'
                actions={
                    <Space wrap>
                        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/borrowings')}>
                            Quay lại
                        </Button>
                        {!batchClosed ? (
                            <Button icon={<EditOutlined />} onClick={openEditBatchModal}>
                                Sửa thông tin lô
                            </Button>
                        ) : null}
                        <Button
                            icon={<DownloadOutlined />}
                            loading={exportingHandover}
                            onClick={handleExportHandover}
                        >
                            Xuất biên bản
                        </Button>
                        {batch.qrBatchId ? (
                            <Button
                                icon={<PrinterOutlined />}
                                onClick={() => navigate(`/qr-labels/batches/${batch.qrBatchId}/print`)}
                            >
                                In QR tạm
                            </Button>
                        ) : (
                            <Button
                                icon={<QrcodeOutlined />}
                                loading={createQrMutation.isPending}
                                onClick={() => createQrMutation.mutate()}
                            >
                                Tạo QR tạm
                            </Button>
                        )}
                    </Space>
                }
            />

            {needsInfo ? (
                <Alert
                    showIcon
                    type='warning'
                    className='rounded-2xl'
                    message='Lô này còn thiếu thông tin'
                    description={`${batch.partnerName === 'Chưa xác định' ? 'Chưa rõ đối tác. ' : ''}${!batch.expectedReturnTime ? 'Chưa có hạn trả dự kiến. ' : ''}Bấm "Sửa thông tin lô" để bổ sung khi đã tra được.`}
                    action={
                        <Button size='small' onClick={openEditBatchModal}>
                            Bổ sung ngay
                        </Button>
                    }
                />
            ) : null}

            <section className='borrowing-batch-hero rounded-3xl border border-slate-200 bg-white p-5 shadow-sm'>
                <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                    <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                            <TransactionTypeBadge type={batch.type} />
                            <Tag color={statusMeta?.color}>{statusMeta?.label || batch.status}</Tag>
                            {batch.qrBatchId ? <Tag color='purple'>QR tạm</Tag> : <Tag>Không dán tem</Tag>}
                        </div>
                        <h1 className='m-0 mt-3 text-2xl font-black text-slate-950'>{batch.partnerName}</h1>
                        <div className='mt-2 text-sm font-semibold text-slate-600'>
                            {batch.contractNo || 'Chưa có số hợp đồng'} · {batch.plant?.name || '-'}{' '}
                            {batch.area ? `· ${batch.area}` : ''}
                        </div>
                        <div className='mt-2 text-sm text-slate-500'>
                            Nhận: {formatDateTime(batch.borrowTime)} · Dự kiến trả:{' '}
                            {formatDateTime(batch.expectedReturnTime)}
                        </div>
                    </div>
                    <div className='grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]'>
                        <Card size='small' className='borrowing-batch-stat rounded-2xl'>
                            <Statistic title='Dự kiến' value={batch.plannedQuantity} />
                        </Card>
                        <Card size='small' className='borrowing-batch-stat rounded-2xl'>
                            <Statistic title='Đã nhận' value={batch.receivedCount ?? 0} />
                        </Card>
                        <Card size='small' className='borrowing-batch-stat rounded-2xl'>
                            <Statistic title='Đang giữ' value={batch.activeCount ?? 0} />
                        </Card>
                        <Card size='small' className='borrowing-batch-stat rounded-2xl'>
                            <Statistic title='Đã trả' value={batch.returnedCount ?? 0} />
                        </Card>
                    </div>
                </div>
            </section>

            {batch.qrBatchId ? (
                <Alert
                    showIcon
                    type='warning'
                    className='borrowing-batch-alert rounded-2xl'
                    message='QR của máy mượn/thuê là tem tạm'
                    description='Khi trả máy, hệ thống sẽ bắt buộc chọn trạng thái xử lý QR và vô hiệu hóa publicId để tránh QR Hải Đăng còn hoạt động trên máy đối tác.'
                />
            ) : null}

            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    {
                        key: 'receive',
                        label: 'Quét nhận máy',
                        children: (
                            <div className='grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]'>
                                <Card className='borrowing-scan-panel borrowing-scan-panel--receive rounded-3xl border-slate-200 shadow-sm'>
                                    <div className='mb-3 flex items-center gap-2 font-black text-slate-950'>
                                        <ScanOutlined className='text-blue-600' />
                                        Quét tem QR trắng
                                    </div>
                                    {batch.qrBatchId ? (
                                        <QrCameraScanner
                                            active={activeTab === 'receive' && !isReceiveModalOpen}
                                            onDetected={openReceiveModal}
                                        />
                                    ) : (
                                        <Alert
                                            type='info'
                                            message='Lô này không dùng tem QR — nhận máy bằng nút bên dưới. Nếu đối tác cho phép dán tem thì "Tạo QR tạm" ở góc trên.'
                                        />
                                    )}
                                    <Button
                                        block
                                        size='large'
                                        icon={<QrcodeOutlined />}
                                        className='mt-3'
                                        disabled={!batch.qrBatchId}
                                        onClick={() => openReceiveModal('')}
                                    >
                                        Nhập mã QR thủ công
                                    </Button>
                                    <Button
                                        block
                                        size='large'
                                        type='primary'
                                        icon={<PlusOutlined />}
                                        className='mt-2'
                                        disabled={batchClosed}
                                        onClick={openReceiveNoQrModal}
                                    >
                                        Nhận máy không tem
                                    </Button>
                                    <div className='mt-2 text-xs font-medium text-slate-500'>
                                        Máy khách không được dán/đánh dấu gì — nhập tay, nhận diện bằng serial và mã
                                        máy đối tác.
                                    </div>
                                </Card>

                                <Card className='rounded-3xl border-slate-200 shadow-sm'>
                                    <div className='mb-3 font-black text-slate-950'>Máy đã nhận vào lô</div>
                                    <div className='block md:hidden'>
                                        <div className='borrowing-batch-mobile-list'>
                                            {items.length ? (
                                                items.map((item, index) => renderMobileBorrowingCard(item, index))
                                            ) : (
                                                <Empty description='Chưa nhận máy nào vào lô' />
                                            )}
                                        </div>
                                    </div>
                                    <div className='hidden md:block'>
                                        <Table<Borrowing>
                                            rowKey='id'
                                            columns={columns}
                                            dataSource={items}
                                            scroll={{ x: 980 }}
                                            pagination={{ pageSize: 8 }}
                                        />
                                    </div>
                                </Card>
                            </div>
                        ),
                    },
                    {
                        key: 'return',
                        label: 'Quét trả máy',
                        children: (
                            <div className='grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]'>
                                <Card className='borrowing-scan-panel borrowing-scan-panel--return rounded-3xl border-slate-200 shadow-sm'>
                                    <div className='mb-3 flex items-center justify-between gap-3'>
                                        <div className='flex items-center gap-2 font-black text-slate-950'>
                                            <ScanOutlined className='text-emerald-600' />
                                            Quét máy cần trả
                                        </div>
                                        {resolvingReturnQr ? <Tag color='processing'>Đang đọc</Tag> : null}
                                    </div>
                                    <QrCameraScanner
                                        active={activeTab === 'return' && !isReturnModalOpen}
                                        onDetected={handleReturnDetected}
                                    />
                                    <div className='mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900'>
                                        Đã chọn {selectedActiveItems.length} máy để trả. Chỉ máy active thuộc lô này mới
                                        được thêm. Máy không tem thì tick chọn trong danh sách bên cạnh.
                                    </div>
                                    <Button
                                        block
                                        size='large'
                                        type='primary'
                                        icon={<CheckCircleOutlined />}
                                        className='mt-3'
                                        disabled={!selectedActiveItems.length}
                                        onClick={() => {
                                            returnForm.setFieldsValue({
                                                returnTime: dayjs(),
                                                qrReturnAction: QR_RETURN_ACTION_REMOVED,
                                            });
                                            setIsReturnModalOpen(true);
                                        }}
                                    >
                                        Xác nhận trả {selectedActiveItems.length} máy
                                    </Button>
                                </Card>

                                <Card className='rounded-3xl border-slate-200 shadow-sm'>
                                    <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
                                        <div className='font-black text-slate-950'>Danh sách máy đang giữ</div>
                                        <Button icon={<ReloadOutlined />} onClick={() => setSelectedReturnIds([])}>
                                            Bỏ chọn
                                        </Button>
                                    </div>
                                    <div className='block md:hidden'>
                                        <div className='borrowing-return-mobile-summary'>
                                            <span>{selectedActiveItems.length} máy đã chọn</span>
                                            <strong>{activeItems.length} máy đang giữ</strong>
                                        </div>
                                        <div className='borrowing-batch-mobile-list'>
                                            {activeItems.length ? (
                                                activeItems.map((item, index) =>
                                                    renderMobileBorrowingCard(item, index, true)
                                                )
                                            ) : (
                                                <Empty description='Không còn máy đang giữ trong lô' />
                                            )}
                                        </div>
                                    </div>
                                    <div className='hidden md:block'>
                                        <Table<Borrowing>
                                            rowKey='id'
                                            columns={columns}
                                            dataSource={activeItems}
                                            rowSelection={{
                                                selectedRowKeys: selectedReturnIds,
                                                onChange: setSelectedReturnIds,
                                            }}
                                            scroll={{ x: 980 }}
                                            pagination={{ pageSize: 8 }}
                                        />
                                    </div>
                                </Card>
                            </div>
                        ),
                    },
                ]}
            />

            <Modal
                open={isReceiveModalOpen}
                title={noQrReceive ? 'Nhận máy không tem vào lô' : 'Nhận máy vào lô bằng QR'}
                width={760}
                onCancel={() => setIsReceiveModalOpen(false)}
                okText='Nhận máy'
                confirmLoading={receiveMutation.isPending}
                onOk={handleReceiveSubmit}
                className='[&_.ant-modal-content]:rounded-2xl'
            >
                {noQrReceive ? (
                    <Alert
                        showIcon
                        type='info'
                        className='mt-2 rounded-xl'
                        message='Máy này sẽ không có tem QR — nhập serial hoặc mã máy đối tác để sau này còn nhận diện khi trả.'
                    />
                ) : null}
                <Form<ReceiveFormValues>
                    form={receiveForm}
                    layout='vertical'
                    className='pt-2 [&_.ant-form-item-label>label]:font-bold [&_.ant-form-item-label>label]:text-slate-700'
                >
                    <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                        {!noQrReceive ? (
                            <Form.Item
                                label='Mã QR'
                                name='publicId'
                                rules={[{ required: true, whitespace: true, message: 'Nhập mã QR' }]}
                            >
                                <Input size='large' placeholder='QR-XXXXXXX' />
                            </Form.Item>
                        ) : null}
                        <Form.Item label='Mã máy tự đặt' name='machineCode'>
                            <Input size='large' placeholder='Bỏ trống để hệ thống tự tạo' />
                        </Form.Item>
                        <Form.Item
                            label='Tên máy'
                            name='name'
                            rules={[{ required: true, whitespace: true, message: 'Nhập tên máy' }]}
                        >
                            <Input size='large' placeholder='Ví dụ: Máy may 1 kim Juki' />
                        </Form.Item>
                        <Form.Item label='Mã máy đối tác' name='partnerMachineCode'>
                            <Input size='large' placeholder='Mã/asset tag của bên cho mượn nếu có' />
                        </Form.Item>
                        <Form.Item label='Serial' name='serial'>
                            <Input size='large' placeholder='Serial nếu có' />
                        </Form.Item>
                        <Form.Item
                            label='Nhãn hiệu'
                            name='brandId'
                            rules={[{ required: true, message: 'Chọn nhãn hiệu' }]}
                        >
                            <Select size='large' showSearch={{ optionFilterProp: 'label' }} options={brandOptions} />
                        </Form.Item>
                        <Form.Item
                            label='Loại máy'
                            name='type'
                            rules={[{ required: true, whitespace: true, message: 'Nhập loại máy' }]}
                        >
                            <Input size='large' placeholder='Ví dụ: Máy vắt sổ' />
                        </Form.Item>
                        <Form.Item
                            label='Model'
                            name='model'
                            rules={[{ required: true, whitespace: true, message: 'Nhập model' }]}
                        >
                            <Input size='large' placeholder='Ví dụ: DDL-8000A' />
                        </Form.Item>
                        <Form.Item label='Cơ sở' name='plantId'>
                            <Select size='large' showSearch={{ optionFilterProp: 'label' }} options={plantOptions} />
                        </Form.Item>
                        <Form.Item label='Khu vực' name='area'>
                            <Input size='large' />
                        </Form.Item>
                        <Form.Item label='Tình trạng lúc nhận' name='receiveCondition' className='md:col-span-2'>
                            <Input.TextArea rows={3} placeholder='Trầy xước, thiếu phụ kiện, chạy thử OK...' />
                        </Form.Item>
                        <Form.Item label='Ghi chú nhận máy' name='receiveNote' className='md:col-span-2'>
                            <Input.TextArea rows={3} placeholder='Thông tin bàn giao, người giao, phụ kiện đi kèm...' />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>

            <Modal
                open={isReturnModalOpen}
                title={`Xác nhận trả ${selectedActiveItems.length} máy`}
                width={720}
                onCancel={() => setIsReturnModalOpen(false)}
                okText={selectedHasLabel ? 'Xác nhận trả và khóa QR' : 'Xác nhận trả máy'}
                confirmLoading={bulkReturnMutation.isPending}
                onOk={handleBulkReturn}
                className='[&_.ant-modal-content]:rounded-2xl'
            >
                {selectedHasLabel ? (
                    <Alert
                        showIcon
                        type='warning'
                        className='mb-4 rounded-2xl'
                        message='Bước xử lý QR là bắt buộc'
                        description='Sau khi xác nhận, hệ thống sẽ clear publicId của máy và retire/lost/damaged QR label theo lựa chọn bên dưới. Máy không tem trong danh sách được bỏ qua bước này.'
                    />
                ) : (
                    <Alert
                        showIcon
                        type='info'
                        className='mb-4 rounded-2xl'
                        message='Các máy được chọn đều không dán tem — không cần xử lý QR.'
                    />
                )}
                <Form<ReturnFormValues>
                    form={returnForm}
                    layout='vertical'
                    className='[&_.ant-form-item-label>label]:font-bold [&_.ant-form-item-label>label]:text-slate-700'
                >
                    <Form.Item
                        label='Thời gian trả'
                        name='returnTime'
                        rules={[{ required: true, message: 'Chọn thời gian trả' }]}
                    >
                        <DatePicker showTime size='large' className='w-full' format='DD/MM/YYYY HH:mm' />
                    </Form.Item>
                    {selectedHasLabel ? (
                        <Form.Item
                            label='Trạng thái xử lý QR'
                            name='qrReturnAction'
                            rules={[{ required: true, message: 'Chọn trạng thái xử lý QR' }]}
                        >
                            <Select
                                size='large'
                                options={qrReturnActionOptions}
                                onChange={(value) => {
                                    const meta = qrReturnActionMeta[value as QrReturnAction];
                                    if (meta) message.info(meta.description);
                                }}
                            />
                        </Form.Item>
                    ) : null}
                    <Form.Item label='Tình trạng máy khi trả' name='returnCondition'>
                        <Input.TextArea rows={3} placeholder='Tình trạng vận hành, hư hỏng, thiếu phụ kiện nếu có...' />
                    </Form.Item>
                    <Form.Item label='Ghi chú trả máy' name='returnNote'>
                        <Input.TextArea rows={3} placeholder='Biên bản trả, người nhận, ghi chú đối tác...' />
                    </Form.Item>
                    {selectedHasLabel ? (
                        <Form.Item label='Ghi chú xử lý QR' name='qrReturnNote'>
                            <Input.TextArea
                                rows={2}
                                placeholder='Ví dụ: đã bóc tem tại kho, tem rách khi gỡ, đối tác không cho bóc...'
                            />
                        </Form.Item>
                    ) : null}
                </Form>
            </Modal>

            <Modal
                open={isEditBatchOpen}
                title='Sửa thông tin lô mượn/thuê'
                width={640}
                onCancel={() => setIsEditBatchOpen(false)}
                okText='Lưu'
                confirmLoading={updateBatchMutation.isPending}
                onOk={handleEditBatchSubmit}
                className='[&_.ant-modal-content]:rounded-2xl'
            >
                <Form<EditBatchFormValues>
                    form={editBatchForm}
                    layout='vertical'
                    className='pt-2 [&_.ant-form-item-label>label]:font-bold [&_.ant-form-item-label>label]:text-slate-700'
                >
                    <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                        <Form.Item label='Đối tác' name='partnerName'>
                            <Input size='large' placeholder='Tên công ty/đối tác' />
                        </Form.Item>
                        <Form.Item label='Số hợp đồng / biên bản' name='contractNo'>
                            <Input size='large' placeholder='Ví dụ: HD-THUE-2026-01' />
                        </Form.Item>
                        <Form.Item label='Dự kiến trả' name='expectedReturnTime'>
                            <DatePicker showTime size='large' className='w-full' format='DD/MM/YYYY HH:mm' />
                        </Form.Item>
                        <Form.Item label='Khu vực' name='area'>
                            <Input size='large' placeholder='Ví dụ: Kho tạm, Xưởng 2...' />
                        </Form.Item>
                        <Form.Item label='Ghi chú' name='note' className='md:col-span-2'>
                            <Input.TextArea rows={3} placeholder='Đầu mối liên hệ, điều kiện trả...' />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>
        </div>
    );
};

export default BorrowingBatchDetail;
