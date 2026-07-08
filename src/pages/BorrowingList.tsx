import React, { lazy, useMemo, useState } from 'react';
import {
    App,
    Button,
    Checkbox,
    DatePicker,
    Empty,
    Form,
    Input,
    InputNumber,
    Modal,
    Pagination,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    type TableColumnsType,
} from 'antd';
import {
    EyeOutlined,
    PlusOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    RollbackOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../components/shared/PageHeader';
import LazyBoundary from '../components/shared/LazyBoundary';
import TransactionStatusBadge from '../components/transactions/TransactionStatusBadge';
import TransactionTypeBadge from '../components/transactions/TransactionTypeBadge';
import {
    borrowingBatchStatusMeta,
    borrowingStatusOptions,
    borrowingTypeMeta,
    borrowingTypeOptions,
} from '../core/constants/transactions';
import { plantService } from '../core/services';
import { borrowingService } from '../core/services/borrowing.service';
import { useAuth } from '../core/contexts/AuthContext';
import { can } from '../core/lib/permissions';
import type { Borrowing, BorrowingBatch, BorrowingFilter } from '../core/types';

const ReturnTransactionModal = lazy(() => import('../components/transactions/ReturnTransactionModal'));

const createDefaultFilters = () => ({
    page: 1,
    limit: 10,
    search: '',
    type: undefined as BorrowingFilter['type'],
    status: undefined as BorrowingFilter['status'],
});

const buildTransactionCode = (item: Borrowing) =>
    `TX-${new Date(item.createdAt).getFullYear()}-${item.id.slice(-4).toUpperCase()}`;

const getCounterpartyLabel = (item: Borrowing) => item.borrowerName || item.partnerName || 'Chưa xác định';

const getCounterpartySubLabel = (item: Borrowing) => {
    if (item.type === 'internal') {
        return item.purpose || 'Công nhân nội bộ';
    }

    if (item.type === 'rental') {
        return item.cost != null ? `${item.cost.toLocaleString('vi-VN')} VND` : 'Thuê máy';
    }

    return item.location || 'Đối tác bên ngoài';
};

const summaryCardClassName =
    'borrowing-mobile-stat-card relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md';
const BORROWING_TYPE_EXTERNAL = 'external' as BorrowingBatch['type'];
const BORROWING_TYPE_RENTAL = 'rental' as BorrowingBatch['type'];

type BatchFormValues = {
    type: BorrowingBatch['type'];
    partnerName?: string;
    contractNo?: string;
    plantId: string;
    area?: string;
    borrowTime: dayjs.Dayjs;
    expectedReturnTime?: dayjs.Dayjs;
    plannedQuantity: number;
    note?: string;
    createQrBatch?: boolean;
};

const BorrowingList: React.FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const { role } = useAuth();
    const canManageBorrowing = can(role, 'borrowing.write');

    const [filters, setFilters] = useState(() => createDefaultFilters());
    const [draftFilters, setDraftFilters] = useState(() => createDefaultFilters());
    const [selectedTransaction, setSelectedTransaction] = useState<Borrowing | null>(null);
    const [batchForm] = Form.useForm<BatchFormValues>();
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

    const { data: transactionResponse, isLoading } = useQuery({
        queryKey: ['borrowings', filters],
        queryFn: () => borrowingService.getAll(filters),
    });

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const { data: batchResponse, isLoading: isLoadingBatches } = useQuery({
        queryKey: ['borrowing-batches', { page: 1, limit: 8 }],
        queryFn: () => borrowingService.getBatches({ page: 1, limit: 8 }),
        enabled: canManageBorrowing,
    });

    // Tổng quan máy ngoài: đang giữ bao nhiêu máy của ai, lô nào quá hạn/thiếu thông tin
    const { data: batchStats } = useQuery({
        queryKey: ['borrowing-batch-stats'],
        queryFn: () => borrowingService.getBatchStats(),
        enabled: canManageBorrowing,
        staleTime: 60_000,
    });

    const returnMutation = useMutation({
        mutationFn: ({ id, returnTime, note }: { id: string; returnTime: string; note?: string }) =>
            borrowingService.returnAsset(id, returnTime, note),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['borrowings'] });
            queryClient.invalidateQueries({ queryKey: ['borrowing', variables.id] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });

    const createBatchMutation = useMutation({
        mutationFn: borrowingService.createBatch,
        onSuccess: (batch) => {
            queryClient.invalidateQueries({ queryKey: ['borrowing-batches'] });
            queryClient.invalidateQueries({ queryKey: ['borrowing-batch-stats'] });
            queryClient.invalidateQueries({ queryKey: ['qr-label-batches'] });
            setIsBatchModalOpen(false);
            batchForm.resetFields();
            message.success('Đã tạo lô mượn/thuê');
            navigate(`/borrowings/batches/${batch.id}`);
        },
    });

    const transactions = useMemo(() => transactionResponse?.data ?? [], [transactionResponse?.data]);
    const batches = useMemo(() => batchResponse?.data ?? [], [batchResponse?.data]);
    const plantOptions = useMemo(
        () =>
            plants.map((plant) => ({
                value: plant.id,
                label: plant.code ? `${plant.name} (${plant.code})` : plant.name,
            })),
        [plants]
    );

    const summary = useMemo(
        () =>
            transactions.reduce(
                (acc, item) => {
                    acc.total += 1;
                    acc[item.status] += 1;
                    acc[item.type] += 1;
                    return acc;
                },
                {
                    total: 0,
                    active: 0,
                    returned: 0,
                    internal: 0,
                    external: 0,
                    rental: 0,
                }
            ),
        [transactions]
    );

    const applyFilters = () => {
        setFilters({
            ...draftFilters,
            search: draftFilters.search.trim(),
            page: 1,
        });
    };

    const resetFilters = () => {
        const next = createDefaultFilters();
        setDraftFilters(next);
        setFilters(next);
    };

    const handleReturn = async ({ returnTime, note }: { returnTime: string; note?: string }) => {
        if (!selectedTransaction) {
            return;
        }

        await returnMutation.mutateAsync({ id: selectedTransaction.id, returnTime, note });
        message.success('Đã xác nhận trả thiết bị');
        setSelectedTransaction(null);
    };

    const handleCreateBatch = async () => {
        const values = await batchForm.validateFields();
        await createBatchMutation.mutateAsync({
            type: values.type,
            // Rà soát thực tế có thể chưa biết máy của ai — để trống, BE tự điền "Chưa xác định"
            partnerName: values.partnerName?.trim() || undefined,
            contractNo: values.contractNo?.trim() || undefined,
            plantId: values.plantId,
            area: values.area?.trim() || undefined,
            borrowTime: values.borrowTime.toISOString(),
            expectedReturnTime: values.expectedReturnTime?.toISOString(),
            plannedQuantity: Number(values.plannedQuantity),
            note: values.note?.trim() || undefined,
            createQrBatch: values.createQrBatch === true,
        });
    };

    // Lô còn nợ thông tin sau rà soát (chưa rõ đối tác hoặc chưa có hạn trả) — nhắc bổ sung
    const batchNeedsInfo = (batch: BorrowingBatch) =>
        batch.status !== 'returned' &&
        batch.status !== 'cancelled' &&
        (batch.partnerName === 'Chưa xác định' || !batch.expectedReturnTime);

    const batchColumns: TableColumnsType<BorrowingBatch> = [
        {
            title: 'LÔ MƯỢN/THUÊ',
            key: 'batch',
            render: (_value, record) => (
                <div className='flex min-w-[220px] flex-col gap-1'>
                    <button
                        type='button'
                        className='w-fit font-mono text-sm font-black text-blue-700 hover:text-blue-800'
                        onClick={() => navigate(`/borrowings/batches/${record.id}`)}
                    >
                        {record.code}
                    </button>
                    <span className='text-xs font-semibold text-slate-500'>
                        {record.type === BORROWING_TYPE_RENTAL ? 'Thuê máy' : 'Mượn ngoài'} ·{' '}
                        {record.contractNo || 'Chưa có hợp đồng'}
                    </span>
                </div>
            ),
        },
        {
            title: 'ĐỐI TÁC',
            key: 'partner',
            render: (_value, record) => (
                <div className='flex min-w-[180px] flex-col gap-1'>
                    <span className='flex items-center gap-2 text-sm font-bold text-slate-800'>
                        {record.partnerName}
                        {batchNeedsInfo(record) ? (
                            <Tag color='orange' className='!m-0'>
                                Cần bổ sung
                            </Tag>
                        ) : null}
                    </span>
                    <span className='text-xs text-slate-500'>
                        {record.plant?.name || '-'} {record.area ? `· ${record.area}` : ''}
                        {record.expectedReturnTime
                            ? ` · Hạn trả ${dayjs(record.expectedReturnTime).format('DD/MM/YYYY')}`
                            : ' · Chưa có hạn trả'}
                    </span>
                </div>
            ),
        },
        {
            title: 'TIẾN ĐỘ',
            key: 'progress',
            width: 190,
            render: (_value, record) => (
                <div className='flex flex-col gap-1'>
                    <span className='text-sm font-black text-slate-900'>
                        {record.receivedCount ?? 0}/{record.plannedQuantity} đã nhận
                    </span>
                    <span className='text-xs font-semibold text-slate-500'>
                        Đang giữ {record.activeCount ?? 0} · Đã trả {record.returnedCount ?? 0}
                    </span>
                    {record.qrBatchId ? (
                        <span className='text-xs font-semibold text-blue-600'>
                            Còn {record.unusedQrCount ?? 0} QR trắng
                        </span>
                    ) : (
                        <span className='text-xs font-semibold text-amber-600'>Chưa tạo QR tạm</span>
                    )}
                </div>
            ),
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'status',
            width: 160,
            render: (status) => {
                const meta = borrowingBatchStatusMeta[status as BorrowingBatch['status']];
                return <Tag color={meta?.color}>{meta?.label || status}</Tag>;
            },
        },
        {
            title: 'THAO TÁC',
            key: 'actions',
            width: 180,
            align: 'right',
            render: (_value, record) => (
                <Space size='small'>
                    {record.qrBatchId ? (
                        <Tooltip title='In tem QR tạm'>
                            <Button
                                icon={<QrcodeOutlined />}
                                onClick={() => navigate(`/qr-labels/batches/${record.qrBatchId}/print`)}
                            >
                                In QR
                            </Button>
                        </Tooltip>
                    ) : null}
                    <Button type='primary' onClick={() => navigate(`/borrowings/batches/${record.id}`)}>
                        Mở lô
                    </Button>
                </Space>
            ),
        },
    ];

    const columns: TableColumnsType<Borrowing> = [
        {
            title: 'THIẾT BỊ',
            key: 'asset',
            render: (_value, record) => (
                <div className='flex min-w-[220px] flex-col gap-1'>
                    <span className='text-sm font-semibold text-slate-800'>{record.asset?.name || '-'}</span>
                    <span className='inline-flex w-fit items-center rounded border border-blue-100 bg-blue-50 px-2 py-1 font-mono text-[11px] font-semibold text-blue-700'>
                        {record.asset?.machineCode || record.assetId}
                    </span>
                </div>
            ),
        },
        {
            title: 'LOẠI',
            dataIndex: 'type',
            key: 'type',
            width: 150,
            render: (value) => <TransactionTypeBadge type={value} />,
        },
        {
            title: 'NGƯỜI MƯỢN / ĐỐI TÁC',
            key: 'counterparty',
            render: (_value, record) => (
                <div className='flex min-w-[220px] flex-col gap-1'>
                    <span className='text-sm font-medium text-slate-800'>{getCounterpartyLabel(record)}</span>
                    <span className='text-xs text-slate-500'>{getCounterpartySubLabel(record)}</span>
                </div>
            ),
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'status',
            key: 'status',
            width: 150,
            render: (value) => <TransactionStatusBadge status={value} />,
        },
        {
            title: 'THỜI GIAN',
            key: 'time',
            width: 220,
            render: (_value, record) => (
                <div className='flex flex-col gap-1 text-sm'>
                    <span className='font-medium text-slate-700'>
                        Bắt đầu: {dayjs(record.borrowTime).format('DD/MM/YYYY HH:mm')}
                    </span>
                    <span className='text-slate-500'>
                        Trả: {record.returnTime ? dayjs(record.returnTime).format('DD/MM/YYYY HH:mm') : 'Chưa trả'}
                    </span>
                </div>
            ),
        },
        {
            title: 'THAO TÁC',
            key: 'action',
            width: 150,
            align: 'right',
            render: (_value, record) => (
                <div className='flex items-center justify-end gap-2'>
                    <Tooltip title='Xem chi tiết'>
                        <Button
                            type='text'
                            icon={<EyeOutlined />}
                            className='flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-700'
                            onClick={() => navigate(`/borrowings/${record.id}`)}
                        />
                    </Tooltip>
                    <Tooltip title={record.status === 'active' ? 'Xác nhận trả' : 'Giao dịch đã hoàn tất'}>
                        <Button
                            type='text'
                            icon={<RollbackOutlined />}
                            disabled={record.status !== 'active'}
                            className='flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700 disabled:bg-slate-100 disabled:text-slate-300'
                            onClick={() => record.status === 'active' && setSelectedTransaction(record)}
                        />
                    </Tooltip>
                </div>
            ),
        },
    ];

    const renderBatchMobileCard = (record: BorrowingBatch, index: number) => {
        const meta = borrowingBatchStatusMeta[record.status];
        const receivedCount = record.receivedCount ?? 0;
        const progress = Math.min(100, Math.round((receivedCount / Math.max(record.plannedQuantity, 1)) * 100));

        return (
            <article
                key={record.id}
                className='borrowing-mobile-card borrowing-mobile-card--batch'
                style={{ animationDelay: `${Math.min(index * 70, 420)}ms` }}
            >
                <div className='borrowing-mobile-card__glow' />
                <div className='relative z-[1] flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                            <span className='borrowing-mobile-card__code'>{record.code}</span>
                            <Tag color={meta?.color}>{meta?.label || record.status}</Tag>
                        </div>
                        <h3 className='mt-2 mb-0 line-clamp-2 text-base font-black text-slate-950'>
                            {record.partnerName}
                        </h3>
                        <p className='mt-1 mb-0 text-xs font-semibold text-slate-500'>
                            {record.type === BORROWING_TYPE_RENTAL ? 'Thuê máy' : 'Mượn ngoài'} ·{' '}
                            {record.contractNo || 'Chưa có hợp đồng'}
                        </p>
                    </div>
                    <div className='borrowing-mobile-card__orb'>
                        <QrcodeOutlined />
                    </div>
                </div>

                <div className='relative z-[1] mt-4 grid grid-cols-3 gap-2'>
                    <div className='borrowing-mobile-metric'>
                        <span>Dự kiến</span>
                        <strong>{record.plannedQuantity}</strong>
                    </div>
                    <div className='borrowing-mobile-metric'>
                        <span>Đã nhận</span>
                        <strong>{receivedCount}</strong>
                    </div>
                    <div className='borrowing-mobile-metric'>
                        <span>Đang giữ</span>
                        <strong>{record.activeCount ?? 0}</strong>
                    </div>
                </div>

                <div className='relative z-[1] mt-4'>
                    <div className='mb-1 flex items-center justify-between text-[11px] font-black text-slate-500 uppercase'>
                        <span>Tiến độ nhận máy</span>
                        <span>{progress}%</span>
                    </div>
                    <div className='borrowing-mobile-progress'>
                        <span style={{ width: `${progress}%` }} />
                    </div>
                    <div className='mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500'>
                        <span>{record.plant?.name || '-'}</span>
                        {record.area ? <span>· {record.area}</span> : null}
                        <span>· Còn {record.unusedQrCount ?? 0} QR trắng</span>
                    </div>
                </div>

                <div className='relative z-[1] mt-4 grid grid-cols-2 gap-2'>
                    <Button
                        size='large'
                        icon={<EyeOutlined />}
                        className='borrowing-mobile-action'
                        onClick={() => navigate(`/borrowings/batches/${record.id}`)}
                    >
                        Mở lô
                    </Button>
                    <Button
                        size='large'
                        icon={<QrcodeOutlined />}
                        disabled={!record.qrBatchId}
                        className='borrowing-mobile-action borrowing-mobile-action--primary'
                        onClick={() => record.qrBatchId && navigate(`/qr-labels/batches/${record.qrBatchId}/print`)}
                    >
                        In QR
                    </Button>
                </div>
            </article>
        );
    };

    const renderTransactionMobileCard = (record: Borrowing, index: number) => {
        const isActive = record.status === 'active';

        return (
            <article
                key={record.id}
                className={[
                    'borrowing-mobile-card borrowing-mobile-card--transaction',
                    isActive ? 'borrowing-mobile-card--live' : '',
                ]
                    .filter(Boolean)
                    .join(' ')}
                style={{ animationDelay: `${Math.min(index * 60, 420)}ms` }}
            >
                <div className='relative z-[1] flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                            <TransactionTypeBadge type={record.type} />
                            <TransactionStatusBadge status={record.status} />
                        </div>
                        <h3 className='mt-2 mb-0 line-clamp-2 text-base font-black text-slate-950'>
                            {record.asset?.name || '-'}
                        </h3>
                        <span className='mt-1 inline-flex rounded-full bg-blue-50 px-2.5 py-1 font-mono text-[11px] font-black text-blue-700'>
                            {record.asset?.machineCode || record.assetId}
                        </span>
                    </div>
                    <div className='borrowing-mobile-card__orb borrowing-mobile-card__orb--green'>
                        <RollbackOutlined />
                    </div>
                </div>

                <div className='relative z-[1] mt-4 rounded-2xl bg-white/74 p-3 ring-1 ring-slate-100'>
                    <div className='text-sm font-black text-slate-800'>{getCounterpartyLabel(record)}</div>
                    <div className='mt-1 text-xs font-semibold text-slate-500'>{getCounterpartySubLabel(record)}</div>
                    <div className='mt-3 grid grid-cols-2 gap-2 text-xs'>
                        <div>
                            <span className='block font-black text-slate-400 uppercase'>Bắt đầu</span>
                            <span className='font-bold text-slate-700'>
                                {dayjs(record.borrowTime).format('DD/MM HH:mm')}
                            </span>
                        </div>
                        <div>
                            <span className='block font-black text-slate-400 uppercase'>Trả</span>
                            <span className='font-bold text-slate-700'>
                                {record.returnTime ? dayjs(record.returnTime).format('DD/MM HH:mm') : 'Chưa trả'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className='relative z-[1] mt-4 grid grid-cols-2 gap-2'>
                    <Button
                        size='large'
                        icon={<EyeOutlined />}
                        className='borrowing-mobile-action'
                        onClick={() => navigate(`/borrowings/${record.id}`)}
                    >
                        Chi tiết
                    </Button>
                    <Button
                        size='large'
                        icon={<RollbackOutlined />}
                        disabled={!isActive}
                        className='borrowing-mobile-action borrowing-mobile-action--return'
                        onClick={() => isActive && setSelectedTransaction(record)}
                    >
                        Trả máy
                    </Button>
                </div>
            </article>
        );
    };

    return (
        <div className='borrowing-mobile-page flex flex-col gap-6'>
            <PageHeader
                title='Borrow / Return Management'
                subtitle='Theo dõi mượn nội bộ, mượn ngoài và thuê máy trong cùng một luồng vận hành thống nhất.'
                actions={
                    <Space wrap>
                        {canManageBorrowing ? (
                            <Button icon={<QrcodeOutlined />} onClick={() => setIsBatchModalOpen(true)}>
                                Tạo lô + QR tạm
                            </Button>
                        ) : null}
                        <Button
                            type='primary'
                            icon={<PlusOutlined />}
                            onClick={() => navigate('/borrowings/new')}
                            className='rounded-lg border-none bg-blue-600 font-medium hover:bg-blue-700'
                        >
                            Tạo giao dịch
                        </Button>
                    </Space>
                }
            />

            <div className='borrowing-mobile-summary-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
                <div className={summaryCardClassName}>
                    <div className='absolute top-0 left-0 h-full w-1 rounded-l-xl bg-blue-500' />
                    <div className='text-xs font-bold tracking-wider text-slate-500 uppercase'>Tổng giao dịch</div>
                    <div className='mt-2 text-3xl font-bold text-slate-800'>{transactionResponse?.total ?? 0}</div>
                    <div className='mt-2 text-xs font-medium text-slate-500'>
                        Toàn bộ mượn / trả trong bộ lọc hiện tại
                    </div>
                </div>
                <div className={summaryCardClassName}>
                    <div className='absolute top-0 left-0 h-full w-1 rounded-l-xl bg-emerald-500' />
                    <div className='text-xs font-bold tracking-wider text-slate-500 uppercase'>Đang hoạt động</div>
                    <div className='mt-2 text-3xl font-bold text-slate-800'>{summary.active}</div>
                    <div className='mt-2 text-xs font-medium text-emerald-600'>Thiết bị đang được mượn hoặc thuê</div>
                </div>
                <div className={summaryCardClassName}>
                    <div className='absolute top-0 left-0 h-full w-1 rounded-l-xl bg-blue-500' />
                    <div className='text-xs font-bold tracking-wider text-slate-500 uppercase'>Mượn nội bộ</div>
                    <div className='mt-2 text-3xl font-bold text-slate-800'>{summary.internal}</div>
                    <div className='mt-2 text-xs font-medium text-slate-500'>{borrowingTypeMeta.internal.label}</div>
                </div>
                <div className={summaryCardClassName}>
                    <div className='absolute top-0 left-0 h-full w-1 rounded-l-xl bg-amber-500' />
                    <div className='text-xs font-bold tracking-wider text-slate-500 uppercase'>Thuê máy</div>
                    <div className='mt-2 text-3xl font-bold text-slate-800'>{summary.rental}</div>
                    <div className='mt-2 text-xs font-medium text-slate-500'>Giao dịch có phát sinh chi phí</div>
                </div>
            </div>

            {canManageBorrowing ? (
                <section className='borrowing-mobile-section overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                    <div className='borrowing-mobile-section__head flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 md:flex-row md:items-center md:justify-between'>
                        <div>
                            <div className='text-sm font-black tracking-[0.16em] text-blue-700 uppercase'>
                                Máy mượn/thuê từ đối tác
                            </div>
                            <div className='mt-1 text-base font-black text-slate-950'>Lô nhận/trả nhiều máy</div>
                            <div className='mt-1 text-sm font-semibold text-slate-500'>
                                Dùng cho máy không thuộc Hải Đăng — nhận bằng tem QR tạm hoặc không tem đều được.
                            </div>
                        </div>
                        <Button type='primary' icon={<QrcodeOutlined />} onClick={() => setIsBatchModalOpen(true)}>
                            Tạo lô mới
                        </Button>
                    </div>

                    {batchStats && (batchStats.activeMachines > 0 || batchStats.openBatches > 0) ? (
                        <div className='border-b border-slate-100 px-5 py-4'>
                            <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
                                <div className='rounded-xl border border-slate-200 bg-slate-50 px-4 py-3'>
                                    <div className='text-[11px] font-bold tracking-wider text-slate-500 uppercase'>
                                        Đang giữ máy ngoài
                                    </div>
                                    <div className='mt-1 text-2xl font-black text-slate-900'>
                                        {batchStats.activeMachines}
                                    </div>
                                </div>
                                <div className='rounded-xl border border-slate-200 bg-slate-50 px-4 py-3'>
                                    <div className='text-[11px] font-bold tracking-wider text-slate-500 uppercase'>
                                        Đối tác
                                    </div>
                                    <div className='mt-1 text-2xl font-black text-slate-900'>
                                        {batchStats.partnerCount}
                                    </div>
                                </div>
                                <div
                                    className={`rounded-xl border px-4 py-3 ${batchStats.overdueBatches ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
                                >
                                    <div className='text-[11px] font-bold tracking-wider text-slate-500 uppercase'>
                                        Lô quá hạn trả
                                    </div>
                                    <div
                                        className={`mt-1 text-2xl font-black ${batchStats.overdueBatches ? 'text-rose-600' : 'text-slate-900'}`}
                                    >
                                        {batchStats.overdueBatches}
                                    </div>
                                </div>
                                <div
                                    className={`rounded-xl border px-4 py-3 ${batchStats.needsInfoBatches ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}
                                >
                                    <div className='text-[11px] font-bold tracking-wider text-slate-500 uppercase'>
                                        Lô cần bổ sung
                                    </div>
                                    <div
                                        className={`mt-1 text-2xl font-black ${batchStats.needsInfoBatches ? 'text-amber-600' : 'text-slate-900'}`}
                                    >
                                        {batchStats.needsInfoBatches}
                                    </div>
                                </div>
                            </div>
                            {batchStats.byPartner.length ? (
                                <div className='mt-3 flex flex-wrap gap-2'>
                                    {batchStats.byPartner.slice(0, 8).map((row) => (
                                        <span
                                            key={row.partnerName}
                                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                                                row.overdue
                                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                                    : 'border-slate-200 bg-white text-slate-700'
                                            }`}
                                        >
                                            {row.partnerName}
                                            <span className='font-black'>{row.machines} máy</span>
                                            {row.nearestDue ? (
                                                <span className='font-normal text-slate-500'>
                                                    · hạn {dayjs(row.nearestDue).format('DD/MM')}
                                                </span>
                                            ) : (
                                                <span className='font-normal text-amber-600'>· chưa có hạn</span>
                                            )}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    <div className='block md:hidden'>
                        <div className='borrowing-mobile-list p-3'>
                            {isLoadingBatches ? (
                                <div className='borrowing-mobile-empty'>Đang tải lô QR tạm...</div>
                            ) : batches.length ? (
                                batches.map(renderBatchMobileCard)
                            ) : (
                                <Empty description='Chưa có lô mượn/thuê QR tạm' />
                            )}
                        </div>
                    </div>
                    <div className='hidden md:block'>
                        <Table<BorrowingBatch>
                            rowKey='id'
                            loading={isLoadingBatches}
                            columns={batchColumns}
                            dataSource={batches}
                            scroll={{ x: 980 }}
                            pagination={false}
                            className='[&_.ant-table-thead_th]:!bg-white [&_.ant-table-thead_th]:!text-[12px] [&_.ant-table-thead_th]:!font-black [&_.ant-table-thead_th]:!tracking-wider [&_.ant-table-thead_th]:!text-slate-500'
                            onRow={(record) => ({
                                onDoubleClick: () => navigate(`/borrowings/batches/${record.id}`),
                            })}
                        />
                    </div>
                </section>
            ) : null}

            <section className='borrowing-mobile-filter-panel rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                <div className='flex flex-col gap-4 lg:flex-row'>
                    <Input
                        prefix={<SearchOutlined className='text-slate-400' />}
                        placeholder='Tìm theo thiết bị, công nhân, đối tác...'
                        value={draftFilters.search}
                        onChange={(event) => setDraftFilters((prev) => ({ ...prev, search: event.target.value }))}
                        onPressEnter={applyFilters}
                        allowClear
                        size='large'
                        className='flex-1 rounded-lg'
                    />
                    <Select
                        placeholder='Loại giao dịch'
                        allowClear
                        size='large'
                        value={draftFilters.type}
                        onChange={(value) => setDraftFilters((prev) => ({ ...prev, type: value }))}
                        options={borrowingTypeOptions}
                        className='w-full lg:w-52'
                    />
                    <Select
                        placeholder='Trạng thái'
                        allowClear
                        size='large'
                        value={draftFilters.status}
                        onChange={(value) => setDraftFilters((prev) => ({ ...prev, status: value }))}
                        options={borrowingStatusOptions}
                        className='w-full lg:w-52'
                    />
                    <div className='flex gap-2'>
                        <Button
                            type='primary'
                            icon={<SearchOutlined />}
                            onClick={applyFilters}
                            size='large'
                            className='rounded-lg border-none bg-blue-600 font-medium hover:bg-blue-700'
                        >
                            Lọc
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={resetFilters}
                            size='large'
                            className='rounded-lg text-slate-600'
                        >
                            Mặc định
                        </Button>
                    </div>
                </div>
                <div className='borrowing-mobile-filter-chips lg:hidden'>
                    <span>{draftFilters.search.trim() || 'Tất cả từ khóa'}</span>
                    <span>
                        {borrowingTypeOptions.find((item) => item.value === draftFilters.type)?.label || 'Mọi loại'}
                    </span>
                    <span>
                        {borrowingStatusOptions.find((item) => item.value === draftFilters.status)?.label ||
                            'Mọi trạng thái'}
                    </span>
                </div>
            </section>

            <section className='borrowing-mobile-section overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                <div className='borrowing-mobile-section__head border-b border-slate-100 px-5 py-4'>
                    <div className='text-sm font-semibold text-slate-800'>Danh sách giao dịch thiết bị</div>
                    <div className='mt-1 text-sm text-slate-500'>
                        Quản lý tập trung các giao dịch mượn nội bộ, mượn ngoài và thuê máy.
                    </div>
                </div>

                <div className='block lg:hidden'>
                    <div className='borrowing-mobile-list p-3'>
                        {isLoading ? (
                            <div className='borrowing-mobile-empty'>Đang tải giao dịch mượn trả...</div>
                        ) : transactions.length ? (
                            transactions.map(renderTransactionMobileCard)
                        ) : (
                            <Empty description='Không có giao dịch phù hợp bộ lọc' />
                        )}
                    </div>
                    <div className='borrowing-mobile-pagination'>
                        <Pagination
                            size='small'
                            current={transactionResponse?.page ?? filters.page}
                            total={transactionResponse?.total ?? 0}
                            pageSize={transactionResponse?.limit ?? filters.limit}
                            showSizeChanger={false}
                            onChange={(page, pageSize) => setFilters((prev) => ({ ...prev, page, limit: pageSize }))}
                        />
                    </div>
                </div>

                <div className='hidden lg:block [&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-slate-50/70 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[12px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-wider [&_.ant-table-thead_th]:!text-slate-500'>
                    <Table<Borrowing>
                        rowKey='id'
                        columns={columns}
                        dataSource={transactions}
                        loading={isLoading}
                        scroll={{ x: 1180 }}
                        pagination={{
                            current: transactionResponse?.page ?? filters.page,
                            total: transactionResponse?.total ?? 0,
                            pageSize: transactionResponse?.limit ?? filters.limit,
                            showSizeChanger: true,
                            showTotal: (total, range) => (
                                <span className='font-medium text-slate-500'>
                                    Đang xem {range[0]}-{range[1]} / {total} giao dịch
                                </span>
                            ),
                            onChange: (page, pageSize) => setFilters((prev) => ({ ...prev, page, limit: pageSize })),
                            className: '!m-0 border-t border-slate-100 !px-5 !py-4',
                        }}
                    />
                </div>
            </section>

            <Modal
                open={isBatchModalOpen}
                title='Tạo lô mượn/thuê và QR tạm'
                width={760}
                onCancel={() => setIsBatchModalOpen(false)}
                okText='Tạo lô'
                confirmLoading={createBatchMutation.isPending}
                onOk={handleCreateBatch}
                className='[&_.ant-modal-content]:rounded-2xl'
            >
                <Form<BatchFormValues>
                    form={batchForm}
                    layout='vertical'
                    initialValues={{
                        type: BORROWING_TYPE_EXTERNAL,
                        borrowTime: dayjs(),
                        plannedQuantity: 10,
                        createQrBatch: false,
                    }}
                    className='pt-2 [&_.ant-form-item-label>label]:font-bold [&_.ant-form-item-label>label]:text-slate-700'
                >
                    <div className='mb-4 rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-sm font-semibold text-cyan-900'>
                        Lô này dùng cho máy mượn/thuê từ đối tác. Chưa rõ đối tác hay hạn trả thì cứ để trống — nhập
                        máy trước, bổ sung sau. Chỉ tạo QR tạm nếu đối tác cho phép dán tem lên máy.
                    </div>
                    <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                        <Form.Item label='Loại lô' name='type' rules={[{ required: true, message: 'Chọn loại lô' }]}>
                            <Select
                                size='large'
                                options={[
                                    { value: BORROWING_TYPE_EXTERNAL, label: 'Mượn máy đối tác' },
                                    { value: BORROWING_TYPE_RENTAL, label: 'Thuê máy' },
                                ]}
                            />
                        </Form.Item>
                        <Form.Item label='Đối tác' name='partnerName'>
                            <Input size='large' placeholder='Chưa rõ thì để trống — bổ sung sau' />
                        </Form.Item>
                        <Form.Item label='Số hợp đồng / biên bản' name='contractNo'>
                            <Input size='large' placeholder='Ví dụ: HD-THUE-2026-01' />
                        </Form.Item>
                        <Form.Item label='Số lượng dự kiến' name='plannedQuantity' rules={[{ required: true }]}>
                            <InputNumber size='large' min={1} max={3000} className='w-full' />
                        </Form.Item>
                        <Form.Item
                            label='Cơ sở nhận'
                            name='plantId'
                            rules={[{ required: true, message: 'Chọn cơ sở' }]}
                        >
                            <Select size='large' showSearch={{ optionFilterProp: 'label' }} options={plantOptions} />
                        </Form.Item>
                        <Form.Item label='Khu vực nhận' name='area'>
                            <Input size='large' placeholder='Ví dụ: Kho tạm, Xưởng 2...' />
                        </Form.Item>
                        <Form.Item label='Thời gian nhận' name='borrowTime' rules={[{ required: true }]}>
                            <DatePicker showTime size='large' className='w-full' format='DD/MM/YYYY HH:mm' />
                        </Form.Item>
                        <Form.Item label='Dự kiến trả' name='expectedReturnTime'>
                            <DatePicker showTime size='large' className='w-full' format='DD/MM/YYYY HH:mm' />
                        </Form.Item>
                        <Form.Item name='createQrBatch' valuePropName='checked' className='md:col-span-2'>
                            <Checkbox>
                                Tạo lô QR tạm để dán lên máy (bỏ trống nếu không được dán gì lên máy khách)
                            </Checkbox>
                        </Form.Item>
                        <Form.Item label='Ghi chú' name='note' className='md:col-span-2'>
                            <Input.TextArea
                                rows={3}
                                placeholder='Điều kiện nhận máy, đầu mối liên hệ, lưu ý khi trả...'
                            />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>

            {selectedTransaction ? (
                <LazyBoundary mode='overlay'>
                    <ReturnTransactionModal
                        open={Boolean(selectedTransaction)}
                        transaction={selectedTransaction}
                        submitting={returnMutation.isPending}
                        onClose={() => setSelectedTransaction(null)}
                        onSubmit={handleReturn}
                    />
                </LazyBoundary>
            ) : null}
        </div>
    );
};

export default BorrowingList;
