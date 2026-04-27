import React, { useMemo, useState } from 'react';
import { App, Button, Card, Input, Select, Space, Table, Tooltip, Typography, type TableColumnsType } from 'antd';
import {
    AppstoreOutlined,
    CheckCircleOutlined,
    CheckOutlined,
    EyeOutlined,
    ReloadOutlined,
    SearchOutlined,
    SwapOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import ConfirmAction from '../components/shared/ConfirmAction';
import TransferStatusBadge from '../components/transfer/TransferStatusBadge';
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

const TransferList: React.FC = () => {
    const navigate = useNavigate();
    const { role } = useAuth();
    const queryClient = useQueryClient();
    const { message } = App.useApp();

    const [filters, setFilters] = useState(() => createDefaultFilters());
    const [draftFilters, setDraftFilters] = useState(() => createDefaultFilters());
    const [approvingTransferId, setApprovingTransferId] = useState<string | null>(null);
    const [completingTransferId, setCompletingTransferId] = useState<string | null>(null);
    const canManageTransfers = hasManagerAccess(role);

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const { data: transferResponse, isLoading } = useQuery({
        queryKey: ['transfers', filters],
        queryFn: () => transferService.getAll(filters),
    });

    const approveMutation = useMutation({
        mutationFn: transferService.approve,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });

    const completeMutation = useMutation({
        mutationFn: transferService.complete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });

    const transfers = useMemo(() => transferResponse?.data ?? [], [transferResponse?.data]);

    const transferSummary = useMemo(
        () =>
            transfers.reduce(
                (summary, transfer) => {
                    summary.total += 1;
                    summary[transfer.status] += 1;
                    return summary;
                },
                {
                    total: 0,
                    pending: 0,
                    approved: 0,
                    completed: 0,
                    rejected: 0,
                }
            ),
        [transfers]
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
        try {
            setCompletingTransferId(transfer.id);
            await completeMutation.mutateAsync(transfer.id);
            message.success('Đã hoàn tất điều chuyển');
        } finally {
            setCompletingTransferId(null);
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
                    <span className='text-[14px] font-semibold text-slate-800'>{record.asset?.name || '-'}</span>
                    <span className='font-mono text-xs font-medium text-slate-500'>
                        Mã máy: <span className="text-slate-600">{record.asset?.machineCode || record.assetId}</span>
                    </span>
                </div>
            ),
        },
        {
            title: 'LỘ TRÌNH',
            key: 'route',
            render: (_value, record) => (
                <div className='flex items-center gap-3'>
                    <div className="flex flex-col gap-0.5">
                        <span className='text-[13px] font-semibold text-slate-700'>{record.fromPlant?.name || '-'}</span>
                        <span className='text-xs font-medium text-slate-500'>{record.fromArea || 'Chưa chỉ định'}</span>
                    </div>
                    <div className="text-slate-300">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                    </div>
                    <div className="flex flex-col gap-0.5">
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
                    <span className='text-sm font-medium text-slate-700 line-clamp-1' title={value}>{value}</span>
                    {record.note ? <Text type='secondary' className="text-xs line-clamp-1" title={record.note}>{record.note}</Text> : null}
                    {record.rejectReason ? <span className='text-xs font-medium text-rose-600 line-clamp-1' title={record.rejectReason}>{record.rejectReason}</span> : null}
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
                    <Tooltip title='Xem thiết bị'>
                        <Button
                            type='text'
                            icon={<EyeOutlined />}
                            className='flex h-8 w-8 items-center justify-center rounded-md bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800'
                            onClick={() => navigate(`/assets/${record.assetId}`)}
                        />
                    </Tooltip>
                    {record.status === 'pending' && canManageTransfers ? (
                        <ConfirmAction
                            intent='warning'
                            title='Duyệt lệnh điều chuyển'
                            description={`Xác nhận duyệt lệnh điều chuyển máy “${record.asset?.name || record.assetId}”?`}
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
                            description={`Xác nhận hoàn tất và cập nhật vị trí máy “${record.asset?.name || record.assetId}”?`}
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

            {/* Stats Cards Section */}
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                {/* Total */}
                <div className='group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md'>
                    <div className='absolute top-0 bottom-0 left-0 w-1 rounded-l-xl bg-blue-500'></div>
                    <div className='flex items-start justify-between'>
                        <div>
                            <div className='mb-1 text-xs font-bold tracking-wider text-slate-500 uppercase'>
                                Tổng lệnh
                            </div>
                            <div className='text-3xl font-bold text-slate-800'>{transferResponse?.total ?? 0}</div>
                            <div className='mt-2 text-xs font-medium text-slate-500'>
                                Toàn bộ lịch sử điều chuyển
                            </div>
                        </div>
                        <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-2xl text-blue-600 transition-transform group-hover:scale-110'>
                            <AppstoreOutlined />
                        </div>
                    </div>
                </div>

                {/* Pending */}
                <div className='group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md'>
                    <div className='absolute top-0 bottom-0 left-0 w-1 rounded-l-xl bg-amber-500'></div>
                    <div className='flex items-start justify-between'>
                        <div>
                            <div className='mb-1 text-xs font-bold tracking-wider text-slate-500 uppercase'>
                                Chờ duyệt
                            </div>
                            <div className='text-3xl font-bold text-slate-800'>{transferSummary.pending}</div>
                            <div className='mt-2 flex items-center gap-1 text-xs font-medium text-amber-600'>
                                Lệnh đang chờ xử lý
                            </div>
                        </div>
                        <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-2xl text-amber-600 transition-transform group-hover:scale-110'>
                            <ClockCircleOutlined />
                        </div>
                    </div>
                </div>

                {/* Approved */}
                <div className='group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md'>
                    <div className='absolute top-0 bottom-0 left-0 w-1 rounded-l-xl bg-sky-500'></div>
                    <div className='flex items-start justify-between'>
                        <div>
                            <div className='mb-1 text-xs font-bold tracking-wider text-slate-500 uppercase'>
                                Đã duyệt / Đang chuyển
                            </div>
                            <div className='text-3xl font-bold text-slate-800'>{transferSummary.approved}</div>
                            <div className='mt-2 flex items-center gap-1 text-xs font-medium text-sky-600'>
                                Thiết bị đang trên đường
                            </div>
                        </div>
                        <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-2xl text-sky-600 transition-transform group-hover:scale-110'>
                            <SwapOutlined />
                        </div>
                    </div>
                </div>

                {/* Completed */}
                <div className='group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md'>
                    <div className='absolute top-0 bottom-0 left-0 w-1 rounded-l-xl bg-emerald-500'></div>
                    <div className='flex items-start justify-between'>
                        <div>
                            <div className='mb-1 text-xs font-bold tracking-wider text-slate-500 uppercase'>
                                Hoàn tất
                            </div>
                            <div className='text-3xl font-bold text-slate-800'>{transferSummary.completed}</div>
                            <div className='mt-2 flex items-center gap-1 text-xs font-medium text-emerald-600'>
                                Đã cập nhật vị trí mới
                            </div>
                        </div>
                        <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-2xl text-emerald-600 transition-transform group-hover:scale-110'>
                            <CheckCircleOutlined />
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Section */}
            <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                <div className='flex flex-col gap-4 lg:flex-row'>
                    <div className='flex-1'>
                        <Input
                            prefix={<SearchOutlined className='text-slate-400' />}
                            placeholder='Tìm theo tên máy, mã máy, lý do điều chuyển...'
                            value={draftFilters.search}
                            onChange={(event) => setDraftFilters((prev) => ({ ...prev, search: event.target.value }))}
                            onPressEnter={applyFilters}
                            allowClear
                            size='large'
                            className='w-full rounded-lg transition-all focus-within:border-blue-500 focus-within:shadow-[0_0_0_2px_rgba(59,130,246,0.1)] hover:border-blue-400'
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
                            options={plants.map((plant) => ({ value: plant.id, label: plant.name }))}
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
                            options={plants.map((plant) => ({ value: plant.id, label: plant.name }))}
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

            {/* Table Section */}
            <div className='flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                <div className='[&_.ant-table-row]:group [&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-slate-50/80 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[12px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-wider [&_.ant-table-thead_th]:!text-slate-500'>
                    <Table<Transfer>
                        rowKey='id'
                        columns={columns}
                        dataSource={transfers}
                        loading={isLoading}
                        scroll={{ x: 1100 }}
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
        </div>
    );
};

export default TransferList;
