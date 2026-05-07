import React, { lazy, useMemo, useState } from 'react';
import { App, Button, Empty, Segmented, Spin, Tag, Tabs, Timeline, Tooltip } from 'antd';
import {
    ArrowLeftOutlined,
    CalendarOutlined,
    EditOutlined,
    EnvironmentOutlined,
    HistoryOutlined,
    RollbackOutlined,
    SwapOutlined,
    ToolOutlined,
    WalletOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import AppBreadcrumb from '../components/navigation/AppBreadcrumb';
import LazyBoundary from '../components/shared/LazyBoundary';
import TransferHistorySection from '../components/transfer/TransferHistorySection';
import TransactionStatusBadge from '../components/transactions/TransactionStatusBadge';
import TransactionTypeBadge from '../components/transactions/TransactionTypeBadge';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess } from '../core/lib/permissions';
import { brandService, plantService } from '../core/services';
import { assetService } from '../core/services/asset.service';
import { borrowingService } from '../core/services/borrowing.service';
import { maintenanceService } from '../core/services/maintenance.service';
import { transferService } from '../core/services/transfer.service';
import type { Asset, AssetStatus, Borrowing, CreateTransferPayload, Maintenance, Transfer } from '../core/types';

const AssetFormModal = lazy(() => import('../components/AssetFormModal'));
const TransferModal = lazy(() => import('../components/transfer/TransferModal'));
const HandoverModal = lazy(() => import('../components/transfer/HandoverModal'));

const STATUS_CFG: Record<AssetStatus, { label: string; accent: string; bg: string; text: string; dot: string; ring: string }> = {
    active:      { label: 'Đang hoạt động', accent: '#16a34a', bg: '#f0fdf4', text: '#15803d', dot: '#22c55e', ring: '#bbf7d0' },
    maintenance: { label: 'Đang bảo trì',   accent: '#d97706', bg: '#fffbeb', text: '#b45309', dot: '#f59e0b', ring: '#fde68a' },
    broken:      { label: 'Hỏng / Lỗi',     accent: '#dc2626', bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444', ring: '#fecaca' },
    borrowing:   { label: 'Đang cho mượn',  accent: '#7c3aed', bg: '#f5f3ff', text: '#6d28d9', dot: '#8b5cf6', ring: '#ddd6fe' },
    storage:     { label: 'Tồn kho',        accent: '#475569', bg: '#f8fafc', text: '#475569', dot: '#94a3b8', ring: '#e2e8f0' },
};

const MAINT_CLS: Record<string, string> = {
    completed: 'bg-emerald-50 text-emerald-700', overdue: 'bg-rose-50 text-rose-700',
    in_progress: 'bg-sky-50 text-sky-700', pending: 'bg-amber-50 text-amber-700',
};
const MAINT_LABEL: Record<string, string> = {
    completed: 'Hoàn thành', overdue: 'Quá hạn', in_progress: 'Đang làm', pending: 'Chờ xử lý',
};
const TRANSFER_CLS: Record<string, string> = {
    completed: 'bg-emerald-50 text-emerald-700', approved: 'bg-sky-50 text-sky-700',
    pending: 'bg-amber-50 text-amber-700', rejected: 'bg-rose-50 text-rose-700', cancelled: 'bg-slate-100 text-slate-500',
};
const TRANSFER_LABEL: Record<string, string> = {
    completed: 'Hoàn tất', approved: 'Đã duyệt', pending: 'Chờ duyệt', rejected: 'Từ chối', cancelled: 'Đã hủy',
};

const fmt = (v?: string) => (v ? dayjs(v).format('DD/MM/YYYY') : '—');
const fmtMoney = (v?: number) => (v ? v.toLocaleString('vi-VN') + ' ₫' : '—');

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className='flex flex-col gap-0.5'>
        <span className='text-[11px] font-semibold uppercase tracking-wider text-slate-400'>{label}</span>
        <span className='text-sm font-medium text-slate-800'>{children || '—'}</span>
    </div>
);

const SidePanel = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <div className='overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
        <div className='flex items-center gap-2 border-b border-slate-100 px-4 py-3'>
            <span className='text-slate-400 text-xs'>{icon}</span>
            <span className='text-[11px] font-bold uppercase tracking-wider text-slate-400'>{title}</span>
        </div>
        {children}
    </div>
);


const AssetDetail: React.FC = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const { role } = useAuth();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const canManage = hasManagerAccess(role);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isTransferOpen, setIsTransferOpen] = useState(false);
    const [statusDraft, setStatusDraft] = useState<AssetStatus | undefined>();
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [completingId, setCompletingId] = useState<string | null>(null);
    const [handoverTransfer, setHandoverTransfer] = useState<Transfer | null>(null);
    const [tab, setTab] = useState('overview');

    const { data: asset, isLoading } = useQuery({ queryKey: ['asset', id], queryFn: () => assetService.getById(id), enabled: !!id });
    const { data: plants = [] } = useQuery({ queryKey: ['plants'], queryFn: () => plantService.getAll() });
    const { data: brands = [] } = useQuery({ queryKey: ['brands'], queryFn: () => brandService.getAll() });
    const { data: maintenances = [] } = useQuery({ queryKey: ['maintenances', 'asset', id], queryFn: () => maintenanceService.getByAsset(id), enabled: !!id });
    const { data: transfers = [] } = useQuery({ queryKey: ['transfers', 'asset', id], queryFn: () => transferService.getByAsset(id), enabled: !!id });
    const { data: borrowings = [] } = useQuery({ queryKey: ['borrowings', 'asset', id], queryFn: () => borrowingService.getByAsset(id), enabled: !!id });

    const inv = () => { queryClient.invalidateQueries({ queryKey: ['asset', id] }); queryClient.invalidateQueries({ queryKey: ['assets'] }); };

    const updateMut = useMutation({ mutationFn: (p: { id: string; data: Partial<Asset> }) => assetService.update(p.id, p.data), onSuccess: () => { inv(); queryClient.invalidateQueries({ queryKey: ['asset-models'] }); } });
    const statusMut = useMutation({ mutationFn: ({ nextStatus, note }: { nextStatus: AssetStatus; note?: string }) => assetService.updateStatus(id, nextStatus, note), onSuccess: inv });
    const createTransferMut = useMutation({ mutationFn: transferService.create, onSuccess: (_t, p) => { queryClient.invalidateQueries({ queryKey: ['transfers', 'asset', p.assetId] }); queryClient.invalidateQueries({ queryKey: ['transfers'] }); inv(); } });
    const approveTransferMut = useMutation({ mutationFn: transferService.approve, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transfers', 'asset', id] }); queryClient.invalidateQueries({ queryKey: ['transfers'] }); inv(); } });
    const completeTransferMut = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: { receivedBy: string; handoverImages?: string[] } }) => transferService.complete(id, payload),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transfers', 'asset', id] }); queryClient.invalidateQueries({ queryKey: ['transfers'] }); inv(); },
    });

    const history = useMemo(() => {
        const m = maintenances.map((i: Maintenance) => ({ key: `m-${i.id}`, date: i.endDate || i.startDate, color: i.status === 'completed' ? 'green' : i.status === 'overdue' ? 'red' : 'orange', title: `Bảo trì ${i.type}`, desc: i.description, meta: i.technician ? `KTV: ${i.technician}` : undefined }));
        const t = transfers.map((i: Transfer) => ({ key: `t-${i.id}`, date: i.transferDate, color: i.status === 'completed' ? 'blue' : i.status === 'rejected' ? 'red' : 'gray', title: `Điều chuyển: ${i.fromPlant?.name || '?'} → ${i.toPlant?.name || '?'}`, desc: i.reason, meta: undefined }));
        const b = borrowings.map((i: Borrowing) => ({ key: `b-${i.id}`, date: i.returnTime || i.borrowTime, color: i.status === 'returned' ? 'green' : 'gold', title: i.status === 'returned' ? 'Đã trả thiết bị' : `Giao dịch ${i.type}`, desc: i.purpose || i.partnerName || '', meta: i.borrowerName ? `Người mượn: ${i.borrowerName}` : undefined }));
        return [...m, ...t, ...b].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [borrowings, maintenances, transfers]);

    const handleUpdate = async (values: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) => { await updateMut.mutateAsync({ id, data: values }); message.success('Đã cập nhật thiết bị'); setIsFormOpen(false); };
    const handleCreateTransfer = async (payload: CreateTransferPayload) => { await createTransferMut.mutateAsync(payload); message.success('Đã tạo lệnh điều chuyển'); setIsTransferOpen(false); };
    const handleStatusChange = async (v: AssetStatus) => { setStatusDraft(v); await statusMut.mutateAsync({ nextStatus: v }); message.success('Đã cập nhật trạng thái'); };
    const handleApprove = async (t: Transfer) => { try { setApprovingId(t.id); await approveTransferMut.mutateAsync(t.id); message.success('Đã duyệt lệnh điều chuyển'); } finally { setApprovingId(null); } };
    const handleComplete = (t: Transfer) => setHandoverTransfer(t);
    const handleHandover = async (payload: { receivedBy: string; handoverImages?: string[] }) => {
        if (!handoverTransfer) return;
        try { setCompletingId(handoverTransfer.id); await completeTransferMut.mutateAsync({ id: handoverTransfer.id, payload }); message.success('Đã hoàn tất điều chuyển'); setHandoverTransfer(null); }
        finally { setCompletingId(null); }
    };

    if (isLoading) return <div className='flex min-h-[50vh] items-center justify-center'><Spin size='large' /></div>;
    if (!asset) return <Empty description='Không tìm thấy thiết bị' className='py-20' />;

    const sc = STATUS_CFG[asset.status];
    const cur = statusDraft ?? asset.status;
    const openTransfer = transfers.find((t: Transfer) => ['pending', 'approved'].includes(t.status));


    return (
        <div className='flex w-full max-w-full flex-col overflow-hidden'>

            {/* ── HEADER ── */}
            <div className='border-b border-slate-200 bg-white'>
                {/* Status accent bar */}
                <div className='h-1 w-full' style={{ background: sc.accent }} />

                <div className='px-6 pb-0 pt-5 md:px-8'>
                    {/* Nav */}
                    <div className='mb-4 flex items-center gap-2'>
                        <Button icon={<ArrowLeftOutlined />} size='small' onClick={() => navigate('/assets')} className='rounded-lg border-slate-200 text-slate-500'>
                            Danh sách máy
                        </Button>
                        <span className='text-slate-300'>/</span>
                        <AppBreadcrumb />
                    </div>

                    {/* Identity + actions */}
                    <div className='flex flex-col items-start justify-between gap-4 md:flex-row md:items-start'>
                        <div className='flex flex-col gap-2'>
                            {/* Badges */}
                            <div className='flex flex-wrap items-center gap-2'>
                                <span
                                    className='inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold'
                                    style={{ background: sc.bg, color: sc.text, borderColor: sc.ring }}
                                >
                                    <span className='h-1.5 w-1.5 rounded-full' style={{ background: sc.dot }} />
                                    {sc.label}
                                </span>
                                {openTransfer && (
                                    <span className='inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700'>
                                        <SwapOutlined style={{ fontSize: 10 }} /> Đang điều chuyển
                                    </span>
                                )}
                            </div>

                            {/* Name */}
                            <h1 className='text-2xl font-bold tracking-tight text-slate-900'>{asset.name}</h1>

                            {/* Meta */}
                            <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500'>
                                <code className='rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold text-blue-700'>{asset.machineCode}</code>
                                {asset.serial && <span>S/N: <strong className='text-slate-700'>{asset.serial}</strong></span>}
                                {asset.brand?.name && <span>{asset.brand.name}</span>}
                                {asset.plant?.name && (
                                    <span className='flex items-center gap-1'>
                                        <EnvironmentOutlined className='text-slate-300' />
                                        {asset.plant.name}{asset.area ? ` · ${asset.area}` : ''}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className='flex flex-shrink-0 flex-wrap items-center gap-2'>
                            <Tooltip title={asset.hasOpenTransfer ? 'Đang có lệnh điều chuyển chờ xử lý' : ''}>
                                <Button icon={<SwapOutlined />} disabled={asset.hasOpenTransfer} onClick={() => setIsTransferOpen(true)} className='rounded-lg'>
                                    Điều chuyển
                                </Button>
                            </Tooltip>
                            <Button icon={<RollbackOutlined />} onClick={() => navigate(`/borrowings/new?assetId=${asset.id}`)} className='rounded-lg'>
                                Tạo giao dịch
                            </Button>
                            {canManage && (
                                <Button type='primary' icon={<EditOutlined />} onClick={() => setIsFormOpen(true)} className='rounded-lg bg-blue-600 hover:!bg-blue-700'>
                                    Chỉnh sửa
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Status control */}
                    {canManage && (
                        <div className='mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5'>
                            <span className='text-xs font-bold uppercase tracking-wider text-slate-400'>Trạng thái</span>
                            <Segmented<AssetStatus>
                                value={cur}
                                size='small'
                                options={Object.entries(STATUS_CFG).map(([v, cfg]) => ({
                                    value: v as AssetStatus,
                                    label: (
                                        <span className='flex items-center gap-1.5 px-0.5' style={{ color: cur === v ? cfg.text : undefined, fontWeight: cur === v ? 700 : 400 }}>
                                            {cur === v && <span className='h-1.5 w-1.5 rounded-full' style={{ background: cfg.dot }} />}
                                            {cfg.label}
                                        </span>
                                    ),
                                }))}
                                onChange={handleStatusChange}
                            />
                        </div>
                    )}

                    {/* Tabs */}
                    <div className='mt-4'>
                        <Tabs
                            activeKey={tab}
                            onChange={setTab}
                            size='middle'
                            className='[&_.ant-tabs-nav]:!mb-0 [&_.ant-tabs-tab]:!py-3 [&_.ant-tabs-tab]:!px-1 [&_.ant-tabs-tab]:font-medium'
                            items={[
                                { key: 'overview', label: 'Tổng quan' },
                                {
                                    key: 'maintenance',
                                    label: <span className='flex items-center gap-1.5'>Bảo trì {maintenances.length > 0 && <span className='rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500'>{maintenances.length}</span>}</span>,
                                },
                                {
                                    key: 'transfer',
                                    label: <span className='flex items-center gap-1.5'>Điều chuyển {transfers.length > 0 && <span className='rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500'>{transfers.length}</span>}</span>,
                                },
                                {
                                    key: 'borrowing',
                                    label: <span className='flex items-center gap-1.5'>Giao dịch {borrowings.length > 0 && <span className='rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500'>{borrowings.length}</span>}</span>,
                                },
                                { key: 'history', label: <span className='flex items-center gap-1.5'><HistoryOutlined />Lịch sử</span> },
                            ]}
                        />
                    </div>
                </div>
            </div>


            {/* ── TAB CONTENT ── */}
            <div className='min-h-[60vh] bg-slate-50 p-6 md:p-8'>

                {/* OVERVIEW */}
                {tab === 'overview' && (
                    <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>

                        {/* Main */}
                        <div className='flex flex-col gap-6 lg:col-span-2'>
                            {/* Core info */}
                            <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                                <div className='border-b border-slate-100 px-6 py-4'>
                                    <h3 className='font-bold text-slate-800'>Thông tin thiết bị</h3>
                                </div>
                                <div className='p-6'>
                                    <div className='grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3'>
                                        <Field label='Loại máy'>{asset.type ? <Tag className='rounded border-blue-100 bg-blue-50 font-medium text-blue-700'>{asset.type}</Tag> : '—'}</Field>
                                        <Field label='Model'>{asset.model || asset.type}</Field>
                                        <Field label='Thương hiệu'>{asset.brand?.name}</Field>
                                        <Field label='Cơ sở'>{asset.plant?.name}</Field>
                                        <Field label='Khu vực'>{asset.area}</Field>
                                        <Field label='Serial'>{asset.serial ? <code className='font-mono text-sm font-bold text-slate-700'>{asset.serial}</code> : undefined}</Field>
                                        <Field label='Ngày mua'>{fmt(asset.purchaseDate)}</Field>
                                        <Field label='Giá trị'><strong className='text-slate-800'>{fmtMoney(asset.purchasePrice)}</strong></Field>
                                        <Field label='Nhập hệ thống'>{fmt(asset.createdAt)}</Field>
                                    </div>
                                    {asset.note && (
                                        <div className='mt-6 rounded-xl border border-amber-100 bg-amber-50/70 p-4'>
                                            <div className='mb-1.5 text-xs font-bold uppercase tracking-wider text-amber-600'>Ghi chú</div>
                                            <p className='text-sm leading-relaxed text-slate-700'>{asset.note}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Specs */}
                            {asset.specifications && Object.keys(asset.specifications).length > 0 && (
                                <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                                    <div className='border-b border-slate-100 px-6 py-4'>
                                        <h3 className='font-bold text-slate-800'>Thông số kỹ thuật</h3>
                                    </div>
                                    <div className='p-6'>
                                        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                                            {Object.entries(asset.specifications).map(([k, v]) => (
                                                <div key={k} className='rounded-xl border border-slate-100 bg-slate-50 px-4 py-3'>
                                                    <div className='text-[11px] font-semibold uppercase tracking-wider text-slate-400'>{k}</div>
                                                    <div className='mt-1 text-sm font-bold text-slate-800'>{String(v)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sidebar sticky */}
                        <div className='flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start'>
                            {/* Location */}
                            <SidePanel icon={<EnvironmentOutlined />} title='Vị trí hiện tại'>
                                <div className='flex flex-col gap-3 p-4'>
                                    <div className='rounded-lg border border-slate-100 bg-slate-50 p-3'>
                                        <div className='text-[11px] font-semibold uppercase tracking-wider text-slate-400'>Cơ sở</div>
                                        <div className='mt-0.5 font-bold text-slate-800'>{asset.plant?.name || '—'}</div>
                                        {asset.plant?.code && <div className='text-xs text-slate-400'>{asset.plant.code}</div>}
                                        {asset.plant?.address && <div className='mt-1 text-xs text-slate-500'>{asset.plant.address}</div>}
                                    </div>
                                    {asset.area && (
                                        <div className='rounded-lg border border-slate-100 bg-slate-50 p-3'>
                                            <div className='text-[11px] font-semibold uppercase tracking-wider text-slate-400'>Khu vực</div>
                                            <div className='mt-0.5 font-bold text-slate-800'>{asset.area}</div>
                                        </div>
                                    )}
                                </div>
                            </SidePanel>

                            {/* Maintenance schedule */}
                            <SidePanel icon={<CalendarOutlined />} title='Lịch bảo trì'>
                                <div className='divide-y divide-slate-50'>
                                    {[
                                        { label: 'Gần nhất', value: fmt(asset.lastMaintenanceDate), warn: false },
                                        { label: 'Kế tiếp', value: fmt(asset.nextMaintenanceDate), warn: !!asset.nextMaintenanceDate && dayjs(asset.nextMaintenanceDate).isBefore(dayjs()) },
                                        { label: 'Tổng lần bảo trì', value: String(maintenances.length), warn: false },
                                    ].map(({ label, value, warn }) => (
                                        <div key={label} className='flex items-center justify-between px-4 py-3'>
                                            <span className='text-xs text-slate-400'>{label}</span>
                                            <span className={`text-sm font-semibold ${warn ? 'text-rose-600' : 'text-slate-700'}`}>{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </SidePanel>

                            {/* Finance */}
                            {(asset.purchaseDate || asset.purchasePrice) && (
                                <SidePanel icon={<WalletOutlined />} title='Tài chính'>
                                    <div className='divide-y divide-slate-50'>
                                        {asset.purchaseDate && (
                                            <div className='flex items-center justify-between px-4 py-3'>
                                                <span className='text-xs text-slate-400'>Ngày mua</span>
                                                <span className='text-sm font-semibold text-slate-700'>{fmt(asset.purchaseDate)}</span>
                                            </div>
                                        )}
                                        {asset.purchasePrice && (
                                            <div className='px-4 py-3'>
                                                <div className='text-xs text-slate-400'>Giá trị</div>
                                                <div className='mt-0.5 text-lg font-bold text-slate-800'>{fmtMoney(asset.purchasePrice)}</div>
                                            </div>
                                        )}
                                    </div>
                                </SidePanel>
                            )}

                            {/* Quick actions */}
                            <SidePanel icon={<ToolOutlined />} title='Thao tác nhanh'>
                                <div className='flex flex-col gap-2 p-4'>
                                    <Tooltip title={asset.hasOpenTransfer ? 'Đang có lệnh điều chuyển' : ''}>
                                        <Button block icon={<SwapOutlined />} disabled={asset.hasOpenTransfer} onClick={() => setIsTransferOpen(true)} className='rounded-lg justify-start'>
                                            Tạo lệnh điều chuyển
                                        </Button>
                                    </Tooltip>
                                    <Button block icon={<RollbackOutlined />} onClick={() => navigate(`/borrowings/new?assetId=${asset.id}`)} className='rounded-lg justify-start'>
                                        Tạo giao dịch mượn/thuê
                                    </Button>
                                    {canManage && (
                                        <Button block type='primary' icon={<EditOutlined />} onClick={() => setIsFormOpen(true)} className='rounded-lg bg-blue-600 hover:!bg-blue-700 justify-start'>
                                            Chỉnh sửa thông tin
                                        </Button>
                                    )}
                                </div>
                            </SidePanel>
                        </div>
                    </div>
                )}


                {/* MAINTENANCE */}
                {tab === 'maintenance' && (
                    <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                        <div className='flex items-center justify-between border-b border-slate-100 px-6 py-4'>
                            <h3 className='font-bold text-slate-800'>Lịch sử bảo trì</h3>
                            <span className='text-sm text-slate-400'>{maintenances.length} lần</span>
                        </div>
                        {maintenances.length ? (
                            <div className='divide-y divide-slate-50'>
                                {maintenances.map((item: Maintenance) => (
                                    <div key={item.id} className='flex items-start justify-between gap-4 px-6 py-4 transition-colors hover:bg-slate-50'>
                                        <div className='flex flex-col gap-1'>
                                            <div className='flex items-center gap-2'>
                                                <span className='text-sm font-bold text-slate-800'>{item.description || item.type}</span>
                                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${MAINT_CLS[item.status || 'pending'] || 'bg-slate-100 text-slate-500'}`}>
                                                    {MAINT_LABEL[item.status || 'pending'] || item.status}
                                                </span>
                                            </div>
                                            {item.technician && <span className='text-xs text-slate-400'>KTV: {item.technician}</span>}
                                            {item.cost && <span className='text-xs font-semibold text-slate-600'>{fmtMoney(item.cost)}</span>}
                                        </div>
                                        <div className='flex-shrink-0 text-right'>
                                            <div className='text-xs font-semibold text-slate-500'>{fmt(item.startDate)}</div>
                                            {item.endDate && <div className='text-xs text-slate-400'>→ {fmt(item.endDate)}</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <div className='py-16'><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có lịch sử bảo trì' /></div>}
                    </div>
                )}

                {/* TRANSFER */}
                {tab === 'transfer' && (
                    <TransferHistorySection
                        transfers={transfers}
                        loading={createTransferMut.isPending || approveTransferMut.isPending || completeTransferMut.isPending}
                        approvingTransferId={approvingId}
                        completingTransferId={completingId}
                        onCreate={() => setIsTransferOpen(true)}
                        onApprove={canManage ? handleApprove : undefined}
                        onComplete={canManage ? handleComplete : undefined}
                    />
                )}

                {/* BORROWING */}
                {tab === 'borrowing' && (
                    <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                        <div className='flex items-center justify-between border-b border-slate-100 px-6 py-4'>
                            <h3 className='font-bold text-slate-800'>Lịch sử giao dịch</h3>
                            <Button size='small' icon={<RollbackOutlined />} onClick={() => navigate(`/borrowings/new?assetId=${asset.id}`)} className='rounded-lg'>
                                Tạo giao dịch
                            </Button>
                        </div>
                        {borrowings.length ? (
                            <div className='divide-y divide-slate-50'>
                                {borrowings.map((item: Borrowing) => (
                                    <div key={item.id} className='flex cursor-pointer items-start justify-between gap-4 px-6 py-4 transition-colors hover:bg-slate-50' onClick={() => navigate(`/borrowings/${item.id}`)}>
                                        <div className='flex flex-col gap-1'>
                                            <div className='flex items-center gap-2'>
                                                <span className='text-sm font-bold text-slate-800'>{item.borrowerName || item.partnerName || '—'}</span>
                                                <TransactionTypeBadge type={item.type} />
                                                <TransactionStatusBadge status={item.status} />
                                            </div>
                                            {item.purpose && <span className='text-xs text-slate-400'>{item.purpose}</span>}
                                        </div>
                                        <div className='flex-shrink-0 text-right'>
                                            <div className='text-xs font-semibold text-slate-500'>{fmt(item.borrowTime)}</div>
                                            {item.returnTime && <div className='text-xs text-slate-400'>→ {fmt(item.returnTime)}</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <div className='py-16'><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có giao dịch nào' /></div>}
                    </div>
                )}

                {/* HISTORY */}
                {tab === 'history' && (
                    <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                        <div className='border-b border-slate-100 px-6 py-4'>
                            <h3 className='font-bold text-slate-800'>Lịch sử hoạt động</h3>
                        </div>
                        <div className='p-6'>
                            {history.length > 0 ? (
                                <Timeline items={history.map(item => ({
                                    key: item.key, color: item.color,
                                    children: (
                                        <div className='pb-3'>
                                            <div className='text-xs font-semibold text-slate-400'>{fmt(item.date)}</div>
                                            <div className='mt-0.5 text-sm font-bold text-slate-800'>{item.title}</div>
                                            {item.desc && <div className='mt-0.5 text-sm text-slate-500'>{item.desc}</div>}
                                            {item.meta && <div className='mt-1 inline-block rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-400'>{item.meta}</div>}
                                        </div>
                                    ),
                                }))} />
                            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có lịch sử' />}
                        </div>
                    </div>
                )}
            </div>

            {/* ── MODALS ── */}
            {isFormOpen && <LazyBoundary mode='overlay'><AssetFormModal open onClose={() => setIsFormOpen(false)} initialValues={asset} onSubmit={handleUpdate} plants={plants} brands={brands} /></LazyBoundary>}
            {isTransferOpen && <LazyBoundary mode='overlay'><TransferModal open asset={asset} plants={plants} submitting={createTransferMut.isPending} onClose={() => setIsTransferOpen(false)} onSubmit={handleCreateTransfer} /></LazyBoundary>}
            {handoverTransfer && <LazyBoundary mode='overlay'><HandoverModal open assetName={handoverTransfer.asset?.name || asset.name} submitting={completeTransferMut.isPending} onClose={() => setHandoverTransfer(null)} onSubmit={handleHandover} /></LazyBoundary>}
        </div>
    );
};

export default AssetDetail;
