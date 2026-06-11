import React, { lazy, useMemo, useState } from 'react';
import {
    App,
    Button,
    Checkbox,
    DatePicker,
    Form,
    Input,
    InputNumber,
    Modal,
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
import { BorrowingType, type Borrowing, type BorrowingBatch, type BorrowingFilter } from '../core/types';

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
    'relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md';

type BatchFormValues = {
    type: BorrowingType.EXTERNAL | BorrowingType.RENTAL;
    partnerName: string;
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
            partnerName: values.partnerName.trim(),
            contractNo: values.contractNo?.trim() || undefined,
            plantId: values.plantId,
            area: values.area?.trim() || undefined,
            borrowTime: values.borrowTime.toISOString(),
            expectedReturnTime: values.expectedReturnTime?.toISOString(),
            plannedQuantity: Number(values.plannedQuantity),
            note: values.note?.trim() || undefined,
            createQrBatch: values.createQrBatch !== false,
        });
    };

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
                        {record.type === BorrowingType.RENTAL ? 'Thuê máy' : 'Mượn ngoài'} ·{' '}
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
                    <span className='text-sm font-bold text-slate-800'>{record.partnerName}</span>
                    <span className='text-xs text-slate-500'>
                        {record.plant?.name || '-'} {record.area ? `· ${record.area}` : ''}
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

    return (
        <div className='flex flex-col gap-6'>
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

            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
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
                <section className='overflow-hidden rounded-xl border border-violet-100 bg-white shadow-sm'>
                    <div className='flex flex-col gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-cyan-50 px-5 py-4 md:flex-row md:items-center md:justify-between'>
                        <div>
                            <div className='text-sm font-black tracking-[0.16em] text-violet-600 uppercase'>
                                QR tạm cho máy mượn/thuê
                            </div>
                            <div className='mt-1 text-base font-black text-slate-950'>Lô nhận/trả nhiều máy</div>
                            <div className='mt-1 text-sm font-semibold text-slate-500'>
                                Dùng cho máy không thuộc Hải Đăng: in tem tạm, quét nhận từng máy và bắt buộc gỡ QR khi
                                trả.
                            </div>
                        </div>
                        <Button type='primary' icon={<QrcodeOutlined />} onClick={() => setIsBatchModalOpen(true)}>
                            Tạo lô mới
                        </Button>
                    </div>
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
                </section>
            ) : null}

            <section className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
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
            </section>

            <section className='overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                <div className='border-b border-slate-100 px-5 py-4'>
                    <div className='text-sm font-semibold text-slate-800'>Danh sách giao dịch thiết bị</div>
                    <div className='mt-1 text-sm text-slate-500'>
                        Quản lý tập trung các giao dịch mượn nội bộ, mượn ngoài và thuê máy.
                    </div>
                </div>

                <div className='[&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-slate-50/70 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[12px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-wider [&_.ant-table-thead_th]:!text-slate-500'>
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
                        type: BorrowingType.EXTERNAL,
                        borrowTime: dayjs(),
                        plannedQuantity: 10,
                        createQrBatch: true,
                    }}
                    className='pt-2 [&_.ant-form-item-label>label]:font-bold [&_.ant-form-item-label>label]:text-slate-700'
                >
                    <div className='mb-4 rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-sm font-semibold text-cyan-900'>
                        Lô này dùng cho máy mượn/thuê từ đối tác. QR được xem là tem tạm và sẽ bị vô hiệu hóa khi trả
                        máy.
                    </div>
                    <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                        <Form.Item label='Loại lô' name='type' rules={[{ required: true, message: 'Chọn loại lô' }]}>
                            <Select
                                size='large'
                                options={[
                                    { value: BorrowingType.EXTERNAL, label: 'Mượn máy đối tác' },
                                    { value: BorrowingType.RENTAL, label: 'Thuê máy' },
                                ]}
                            />
                        </Form.Item>
                        <Form.Item
                            label='Đối tác'
                            name='partnerName'
                            rules={[{ required: true, whitespace: true, message: 'Nhập tên đối tác' }]}
                        >
                            <Input size='large' placeholder='Tên công ty/đối tác' />
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
                            <Checkbox>Tạo luôn lô QR tạm theo số lượng dự kiến</Checkbox>
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
