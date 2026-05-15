import React, { useState } from 'react';
import { App, Button, Input, Modal, Select, Table, Tooltip, Typography, type TableColumnsType } from 'antd';
import {
    AppstoreOutlined,
    CheckCircleOutlined,
    CheckOutlined,
    CloseOutlined,
    DownloadOutlined,
    EyeOutlined,
    ReloadOutlined,
    SearchOutlined,
    StopOutlined,
    SwapOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import ConfirmAction from '../components/shared/ConfirmAction';
import TransferStatusBadge from '../components/transfer/TransferStatusBadge';
import HandoverModal from '../components/transfer/HandoverModal';
import { transferStatusOptions } from '../core/constants/transfer';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess } from '../core/lib/permissions';
import { plantService } from '../core/services';
import { transferService } from '../core/services/transfer.service';
import type { Transfer, TransferFilter } from '../core/types';

const { Text } = Typography;

const createDefaultFilters = () => ({
    page: 1,
    limit: 10,
    search: '',
    status: undefined as TransferFilter['status'],
    fromPlantId: undefined as string | undefined,
    toPlantId: undefined as string | undefined,
});

const buildTransferCode = (transfer: Transfer) =>
    `TRF-${new Date(transfer.createdAt).getFullYear()}-${transfer.id.slice(-4).toUpperCase()}`;

const getTransferAssets = (transfer: Transfer) =>
    transfer.assets?.length ? transfer.assets : transfer.asset ? [transfer.asset] : [];

const getTransferAssetLabel = (transfer: Transfer) => {
    const assets = getTransferAssets(transfer);
    if (assets.length === 1) return assets[0].name;
    if (assets.length > 1) return `${assets.length} máy`;
    return '-';
};

const getTransferAssetCodes = (transfer: Transfer) => {
    const assets = getTransferAssets(transfer);
    if (assets.length === 1) return assets[0].machineCode || transfer.assetId;
    if (assets.length > 1)
        return (
            assets
                .map((asset) => asset.machineCode)
                .filter(Boolean)
                .join(', ') || `${assets.length} máy`
        );
    return transfer.assetId;
};

const getTransferFromPlantId = (transfer: Transfer) => transfer.fromPlantId || transfer.fromPlant?.id;

const TransferList: React.FC = () => {
    const navigate = useNavigate();
    const { role, user } = useAuth();
    const queryClient = useQueryClient();
    const { message } = App.useApp();

    const [filters, setFilters] = useState(() => createDefaultFilters());
    const [draftFilters, setDraftFilters] = useState(() => createDefaultFilters());
    const [approvingTransferId, setApprovingTransferId] = useState<string | null>(null);
    const [completingTransferId, setCompletingTransferId] = useState<string | null>(null);
    const [rejectingTransferId, setRejectingTransferId] = useState<string | null>(null);
    const [cancellingTransferId, setCancellingTransferId] = useState<string | null>(null);
    const [exportingTransferId, setExportingTransferId] = useState<string | null>(null);
    const [rejectModal, setRejectModal] = useState<{ open: boolean; transfer: Transfer | null; reason: string }>({
        open: false,
        transfer: null,
        reason: '',
    });
    const [cancelModal, setCancelModal] = useState<{ open: boolean; transfer: Transfer | null; reason: string }>({
        open: false,
        transfer: null,
        reason: '',
    });
    const [handoverTransfer, setHandoverTransfer] = useState<Transfer | null>(null);
    const canManageTransfers = hasManagerAccess(role);

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const { data: transferResponse, isLoading } = useQuery({
        queryKey: ['transfers', filters],
        queryFn: () => transferService.getAll(filters),
    });

    // Stats queries riêng — chính xác toàn bộ DB, không bị ảnh hưởng bởi filter/pagination
    const { data: totalStats = 0 } = useQuery({
        queryKey: ['transfers-stats', 'total'],
        queryFn: () => transferService.getAll({ page: 1, limit: 1 }),
        select: (d) => d.total,
    });
    const { data: pendingStats = 0 } = useQuery({
        queryKey: ['transfers-stats', 'pending'],
        queryFn: () => transferService.getAll({ page: 1, limit: 1, status: 'pending' as any }),
        select: (d) => d.total,
    });
    const { data: approvedStats = 0 } = useQuery({
        queryKey: ['transfers-stats', 'approved'],
        queryFn: () => transferService.getAll({ page: 1, limit: 1, status: 'approved' as any }),
        select: (d) => d.total,
    });
    const { data: completedStats = 0 } = useQuery({
        queryKey: ['transfers-stats', 'completed'],
        queryFn: () => transferService.getAll({ page: 1, limit: 1, status: 'completed' as any }),
        select: (d) => d.total,
    });

    const approveMutation = useMutation({
        mutationFn: transferService.approve,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });

    const completeMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: { receivedBy: string; handoverImages?: string[] } }) =>
            transferService.complete(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });

    const rejectMutation = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) => transferService.reject(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });

    const cancelMutation = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) => transferService.cancel(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });

    const transfers = transferResponse?.data ?? [];
    const canRejectOrCancelTransfer = (transfer: Transfer) =>
        canManageTransfers && (!user?.plantId || getTransferFromPlantId(transfer) === user.plantId);

    const applyFilters = () => setFilters({ ...draftFilters, search: draftFilters.search.trim(), page: 1 });

    const resetFilters = () => {
        const next = createDefaultFilters();
        setDraftFilters(next);
        setFilters(next);
    };

    const handleApprove = async (transfer: Transfer) => {
        try {
            setApprovingTransferId(transfer.id);
            await approveMutation.mutateAsync(transfer.id);
            message.success('Đã duyệt lệnh điều chuyển');
        } finally {
            setApprovingTransferId(null);
        }
    };

    const handleComplete = async (transfer: Transfer) => {
        setHandoverTransfer(transfer);
    };

    const handleHandoverSubmit = async (payload: { receivedBy: string; handoverImages?: string[] }) => {
        if (!handoverTransfer) return;
        try {
            setCompletingTransferId(handoverTransfer.id);
            await completeMutation.mutateAsync({ id: handoverTransfer.id, payload });
            message.success('Đã hoàn tất điều chuyển');
            setHandoverTransfer(null);
        } finally {
            setCompletingTransferId(null);
        }
    };

    const handleReject = async () => {
        if (!rejectModal.transfer || !rejectModal.reason.trim()) return;
        if (rejectModal.transfer.status !== 'pending' || !canRejectOrCancelTransfer(rejectModal.transfer)) return;
        try {
            setRejectingTransferId(rejectModal.transfer.id);
            await rejectMutation.mutateAsync({ id: rejectModal.transfer.id, reason: rejectModal.reason.trim() });
            message.success('Đã từ chối lệnh điều chuyển');
            setRejectModal({ open: false, transfer: null, reason: '' });
        } finally {
            setRejectingTransferId(null);
        }
    };

    const handleCancel = async () => {
        if (!cancelModal.transfer || !cancelModal.reason.trim()) return;
        if (cancelModal.transfer.status !== 'pending' || !canRejectOrCancelTransfer(cancelModal.transfer)) return;
        try {
            setCancellingTransferId(cancelModal.transfer.id);
            await cancelMutation.mutateAsync({ id: cancelModal.transfer.id, reason: cancelModal.reason.trim() });
            message.success('Đã hủy lệnh điều chuyển');
            setCancelModal({ open: false, transfer: null, reason: '' });
        } finally {
            setCancellingTransferId(null);
        }
    };

    const handleExportStockOut = async (transfer: Transfer) => {
        try {
            setExportingTransferId(transfer.id);
            await transferService.exportStockOutXlsx(transfer.id, buildTransferCode(transfer));
        } catch {
            message.error('Không thể xuất phiếu xuất kho');
        } finally {
            setExportingTransferId(null);
        }
    };

    const columns: TableColumnsType<Transfer> = [
        {
            title: 'MÃ LỆNH',
            key: 'code',
            width: 140,
            render: (_value, record) => (
                <span className='inline-flex items-center rounded border border-indigo-100 bg-indigo-50 px-2 py-1 font-mono text-xs font-semibold text-indigo-700'>
                    {buildTransferCode(record)}
                </span>
            ),
        },
        {
            title: 'THIẾT BỊ',
            key: 'asset',
            render: (_value, record) => (
                <div className='flex flex-col gap-0.5'>
                    <span className='text-[14px] font-semibold text-slate-800'>{getTransferAssetLabel(record)}</span>
                    <span className='font-mono text-xs font-medium text-slate-500'>
                        Mã máy: <span className='text-slate-600'>{getTransferAssetCodes(record)}</span>
                    </span>
                </div>
            ),
        },
        {
            title: 'LỘ TRÌNH',
            key: 'route',
            render: (_value, record) => (
                <div className='flex items-center gap-3'>
                    <div className='flex flex-col gap-0.5'>
                        <span className='text-[13px] font-semibold text-slate-700'>
                            {record.fromPlant?.name || '-'}
                        </span>
                        <span className='text-xs font-medium text-slate-500'>{record.fromArea || 'Chưa chỉ định'}</span>
                    </div>
                    <div className='text-slate-300'>
                        <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth='2'
                                d='M14 5l7 7m0 0l-7 7m7-7H3'
                            />
                        </svg>
                    </div>
                    <div className='flex flex-col gap-0.5'>
                        <span className='text-[13px] font-semibold text-slate-700'>{record.toPlant?.name || '-'}</span>
                        <span className='text-xs font-medium text-slate-500'>{record.toArea || 'Chưa chỉ định'}</span>
                    </div>
                </div>
            ),
        },
        {
            title: 'NGÀY CHUYỂN',
            dataIndex: 'transferDate',
            key: 'transferDate',
            width: 130,
            render: (value: string) => (
                <span className='font-medium text-slate-700'>{new Date(value).toLocaleDateString('vi-VN')}</span>
            ),
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'status',
            key: 'status',
            width: 140,
            render: (status) => <TransferStatusBadge status={status} />,
        },
        {
            title: 'LÝ DO',
            dataIndex: 'reason',
            key: 'reason',
            render: (value: string, record) => (
                <div className='flex flex-col gap-1'>
                    <span className='line-clamp-1 text-sm font-medium text-slate-700' title={value}>
                        {value}
                    </span>
                    {record.note ? (
                        <Text type='secondary' className='line-clamp-1 text-xs' title={record.note}>
                            {record.note}
                        </Text>
                    ) : null}
                    {record.rejectReason ? (
                        <span className='line-clamp-1 text-xs font-medium text-rose-600' title={record.rejectReason}>
                            {record.rejectReason}
                        </span>
                    ) : null}
                    {record.cancelReason ? (
                        <span className='line-clamp-1 text-xs font-medium text-slate-400' title={record.cancelReason}>
                            {record.cancelReason}
                        </span>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'THAO TÁC',
            key: 'action',
            width: 230,
            align: 'right',
            render: (_value, record) => (
                <div className='flex items-center justify-end gap-1.5' onClick={(e) => e.stopPropagation()}>
                    <Tooltip title='Xem chi tiết'>
                        <Button
                            type='text'
                            icon={<EyeOutlined />}
                            className='flex h-8 w-8 items-center justify-center rounded-md bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800'
                            onClick={() => navigate(`/transfers/${record.id}`)}
                        />
                    </Tooltip>
                    {['approved', 'completed'].includes(record.status) ? (
                        <Tooltip title='Xuất phiếu xuất kho'>
                            <Button
                                type='text'
                                icon={<DownloadOutlined />}
                                loading={exportingTransferId === record.id}
                                className='flex h-8 w-8 items-center justify-center rounded-md bg-green-50 text-green-600 transition-colors hover:bg-green-100 hover:text-green-700'
                                onClick={() => handleExportStockOut(record)}
                            />
                        </Tooltip>
                    ) : null}
                    {record.status === 'pending' && canManageTransfers ? (
                        <ConfirmAction
                            intent='warning'
                            title='Duyệt lệnh điều chuyển'
                            description={`Xác nhận duyệt lệnh điều chuyển "${getTransferAssetLabel(record)}"?`}
                            okLabel='Duyệt'
                            onConfirm={() => handleApprove(record)}
                        >
                            <Tooltip title='Duyệt lệnh'>
                                <Button
                                    type='text'
                                    icon={<CheckOutlined />}
                                    loading={approvingTransferId === record.id}
                                    className='flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100 hover:text-amber-700'
                                />
                            </Tooltip>
                        </ConfirmAction>
                    ) : null}
                    {record.status === 'approved' && canManageTransfers ? (
                        <ConfirmAction
                            intent='primary'
                            title='Hoàn tất điều chuyển'
                            description={`Xác nhận hoàn tất và cập nhật vị trí cho "${getTransferAssetLabel(record)}"?`}
                            okLabel='Hoàn tất'
                            onConfirm={() => handleComplete(record)}
                        >
                            <Tooltip title='Hoàn tất điều chuyển'>
                                <Button
                                    type='text'
                                    icon={<CheckCircleOutlined />}
                                    loading={completingTransferId === record.id}
                                    className='flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700'
                                />
                            </Tooltip>
                        </ConfirmAction>
                    ) : null}
                    {record.status === 'pending' && canRejectOrCancelTransfer(record) ? (
                        <Tooltip title='Từ chối'>
                            <Button
                                type='text'
                                icon={<CloseOutlined />}
                                loading={rejectingTransferId === record.id}
                                onClick={() => setRejectModal({ open: true, transfer: record, reason: '' })}
                                className='flex h-8 w-8 items-center justify-center rounded-md bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100 hover:text-rose-700'
                            />
                        </Tooltip>
                    ) : null}
                    {record.status === 'pending' && canRejectOrCancelTransfer(record) ? (
                        <Tooltip title='Hủy lệnh'>
                            <Button
                                type='text'
                                icon={<StopOutlined />}
                                loading={cancellingTransferId === record.id}
                                onClick={() => setCancelModal({ open: true, transfer: record, reason: '' })}
                                className='flex h-8 w-8 items-center justify-center rounded-md bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700'
                            />
                        </Tooltip>
                    ) : null}
                </div>
            ),
        },
    ];

    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <PageHeader
                title='Điều Chuyển Thiết Bị'
                subtitle='Theo dõi và quản lý toàn bộ lệnh điều chuyển phát sinh từ hệ thống.'
                actions={
                    <Button
                        type='primary'
                        onClick={() => navigate('/assets')}
                        className='rounded-lg border-none bg-blue-600 font-medium shadow-sm hover:bg-blue-700'
                    >
                        Tạo từ danh sách máy
                    </Button>
                }
            />

            {/* Stats Cards */}
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                {[
                    {
                        label: 'Tổng lệnh',
                        value: totalStats,
                        color: 'blue',
                        sub: 'Toàn bộ lịch sử',
                        icon: <AppstoreOutlined />,
                    },
                    {
                        label: 'Chờ duyệt',
                        value: pendingStats,
                        color: 'amber',
                        sub: 'Lệnh đang chờ xử lý',
                        icon: <ClockCircleOutlined />,
                    },
                    {
                        label: 'Đã duyệt / Đang chuyển',
                        value: approvedStats,
                        color: 'sky',
                        sub: 'Thiết bị đang trên đường',
                        icon: <SwapOutlined />,
                    },
                    {
                        label: 'Hoàn tất',
                        value: completedStats,
                        color: 'emerald',
                        sub: 'Đã cập nhật vị trí mới',
                        icon: <CheckCircleOutlined />,
                    },
                ].map(({ label, value, color, sub, icon }) => (
                    <div
                        key={label}
                        className='group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md'
                    >
                        <div className={`absolute top-0 bottom-0 left-0 w-1 rounded-l-xl bg-${color}-500`} />
                        <div className='flex items-start justify-between'>
                            <div>
                                <div className='mb-1 text-xs font-bold tracking-wider text-slate-500 uppercase'>
                                    {label}
                                </div>
                                <div className='text-3xl font-bold text-slate-800'>{value}</div>
                                <div className={`mt-2 text-xs font-medium text-${color}-600`}>{sub}</div>
                            </div>
                            <div
                                className={`flex h-12 w-12 items-center justify-center rounded-xl bg-${color}-50 text-2xl text-${color}-600 transition-transform group-hover:scale-110`}
                            >
                                {icon}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filter */}
            <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                <div className='flex flex-col gap-4 lg:flex-row'>
                    <div className='flex-1'>
                        <Input
                            prefix={<SearchOutlined className='text-slate-400' />}
                            placeholder='Tìm theo tên máy, mã máy, lý do điều chuyển...'
                            value={draftFilters.search}
                            onChange={(e) => setDraftFilters((prev) => ({ ...prev, search: e.target.value }))}
                            onPressEnter={applyFilters}
                            allowClear
                            size='large'
                            className='w-full rounded-lg'
                        />
                    </div>
                    <div className='w-full lg:w-48'>
                        <Select
                            placeholder='Trạng thái'
                            allowClear
                            size='large'
                            value={draftFilters.status}
                            onChange={(value) => setDraftFilters((prev) => ({ ...prev, status: value }))}
                            options={transferStatusOptions}
                            className='w-full'
                        />
                    </div>
                    <div className='w-full lg:w-48'>
                        <Select
                            placeholder='Từ cơ sở'
                            allowClear
                            size='large'
                            value={draftFilters.fromPlantId}
                            onChange={(value) => setDraftFilters((prev) => ({ ...prev, fromPlantId: value }))}
                            options={plants.map((p) => ({ value: p.id, label: p.name }))}
                            className='w-full'
                        />
                    </div>
                    <div className='w-full lg:w-48'>
                        <Select
                            placeholder='Đến cơ sở'
                            allowClear
                            size='large'
                            value={draftFilters.toPlantId}
                            onChange={(value) => setDraftFilters((prev) => ({ ...prev, toPlantId: value }))}
                            options={plants.map((p) => ({ value: p.id, label: p.name }))}
                            className='w-full'
                        />
                    </div>
                    <div className='flex w-full gap-2 lg:w-auto'>
                        <Button
                            type='primary'
                            icon={<SearchOutlined />}
                            onClick={applyFilters}
                            size='large'
                            className='flex-1 rounded-lg border-none bg-blue-600 font-medium shadow-sm hover:bg-blue-700 lg:flex-none'
                        >
                            Tìm kiếm
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={resetFilters}
                            size='large'
                            className='flex-1 rounded-lg font-medium text-slate-600 hover:text-slate-800 lg:flex-none'
                        >
                            Làm mới
                        </Button>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className='flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                <div className='[&_.ant-table-row]:group [&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-slate-50/80 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[12px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-wider [&_.ant-table-thead_th]:!text-slate-500'>
                    <Table<Transfer>
                        rowKey='id'
                        columns={columns}
                        dataSource={transfers}
                        loading={isLoading}
                        scroll={{ x: 1200 }}
                        onRow={(record) => ({
                            onClick: () => navigate(`/transfers/${record.id}`),
                            style: { cursor: 'pointer' },
                        })}
                        pagination={{
                            current: transferResponse?.page ?? filters.page,
                            total: transferResponse?.total ?? 0,
                            pageSize: transferResponse?.limit ?? filters.limit,
                            showSizeChanger: true,
                            showTotal: (total, range) => (
                                <span className='font-medium text-slate-500'>
                                    Đang xem {range[0]}-{range[1]} / Tổng số {total} lệnh
                                </span>
                            ),
                            onChange: (page, pageSize) => setFilters((prev) => ({ ...prev, page, limit: pageSize })),
                            className: '!px-5 !py-4 !m-0 border-t border-slate-100',
                        }}
                        size='middle'
                    />
                </div>
            </div>

            {/* Modal từ chối */}
            <Modal
                open={rejectModal.open}
                title='Từ chối lệnh điều chuyển'
                okText='Từ chối'
                cancelText='Hủy'
                okButtonProps={{ danger: true, loading: rejectMutation.isPending }}
                onOk={handleReject}
                onCancel={() => setRejectModal({ open: false, transfer: null, reason: '' })}
                destroyOnHidden
            >
                <p className='mb-3 text-sm text-slate-600'>
                    Máy: <strong>{rejectModal.transfer ? getTransferAssetLabel(rejectModal.transfer) : '-'}</strong>
                </p>
                <Input.TextArea
                    rows={3}
                    placeholder='Nhập lý do từ chối...'
                    value={rejectModal.reason}
                    onChange={(e) => setRejectModal((prev) => ({ ...prev, reason: e.target.value }))}
                />
            </Modal>

            {/* Modal hủy lệnh */}
            <Modal
                open={cancelModal.open}
                title='Hủy lệnh điều chuyển'
                okText='Xác nhận hủy'
                cancelText='Đóng'
                okButtonProps={{ danger: true, loading: cancelMutation.isPending }}
                onOk={handleCancel}
                onCancel={() => setCancelModal({ open: false, transfer: null, reason: '' })}
                destroyOnHidden
            >
                <p className='mb-3 text-sm text-slate-600'>
                    Máy: <strong>{cancelModal.transfer ? getTransferAssetLabel(cancelModal.transfer) : '-'}</strong>
                </p>
                <Input.TextArea
                    rows={3}
                    placeholder='Nhập lý do hủy...'
                    value={cancelModal.reason}
                    onChange={(e) => setCancelModal((prev) => ({ ...prev, reason: e.target.value }))}
                />
            </Modal>

            <HandoverModal
                open={Boolean(handoverTransfer)}
                assetName={handoverTransfer ? getTransferAssetLabel(handoverTransfer) : undefined}
                submitting={completeMutation.isPending}
                onClose={() => setHandoverTransfer(null)}
                onSubmit={handleHandoverSubmit}
            />
        </div>
    );
};

export default TransferList;
