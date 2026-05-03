import React, { lazy, useMemo, useState } from 'react';
import { App, Badge, Button, Card, Descriptions, Empty, Segmented, Space, Spin, Tag, Timeline, Tooltip, Typography } from 'antd';
import { ArrowLeftOutlined, EditOutlined, RollbackOutlined, SwapOutlined } from '@ant-design/icons';
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

const { Title, Text } = Typography;

const statusMeta: Record<
    AssetStatus,
    { color: 'success' | 'warning' | 'error' | 'processing' | 'default'; label: string; accent: string }
> = {
    active: { color: 'success', label: 'Hoạt động', accent: '#22a06b' },
    maintenance: { color: 'warning', label: 'Bảo trì', accent: '#fa8c16' },
    broken: { color: 'error', label: 'Lỗi / hỏng', accent: '#ef4444' },
    borrowing: { color: 'processing', label: 'Đang mượn/Cho mượn', accent: '#7c3aed' },
    storage: { color: 'default', label: 'Tồn kho', accent: '#64748b' },
};

const formatDateTime = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY') : '-');

const STATUS_PILL: Record<AssetStatus, { bg: string; text: string; dot: string }> = {
    active:      { bg: 'oklch(0.96 0.04 145)', text: 'oklch(0.32 0.14 145)', dot: 'oklch(0.52 0.20 145)' },
    maintenance: { bg: 'oklch(0.97 0.04 65)',  text: 'oklch(0.38 0.16 65)',  dot: 'oklch(0.58 0.22 65)'  },
    broken:      { bg: 'oklch(0.96 0.04 25)',  text: 'oklch(0.36 0.16 25)',  dot: 'oklch(0.52 0.24 25)'  },
    borrowing:   { bg: 'oklch(0.95 0.05 280)', text: 'oklch(0.36 0.16 280)', dot: 'oklch(0.50 0.22 280)' },
    storage:     { bg: 'oklch(0.96 0.01 250)', text: 'oklch(0.44 0.04 250)', dot: 'oklch(0.56 0.08 250)' },
};

const PAGE_ANIM = `
@keyframes ad-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes ad-dot{0%,100%{opacity:1}50%{opacity:0.45}}
.ad-h{animation:ad-up .3s cubic-bezier(.22,1,.36,1) .04s both}
.ad-s{animation:ad-up .32s cubic-bezier(.22,1,.36,1) .14s both}
.ad-m{animation:ad-up .34s cubic-bezier(.22,1,.36,1) .22s both}
.ad-r{animation:ad-up .34s cubic-bezier(.22,1,.36,1) .30s both}
.ad-dot{animation:ad-dot 2.4s ease-in-out infinite}
.ad-row{transition:background-color 120ms cubic-bezier(.22,1,.36,1)}
.ad-row:hover{background-color:oklch(0.975 0.004 250)}
.ad-stat{transition:background-color 150ms cubic-bezier(.22,1,.36,1)}
.ad-stat:hover{background-color:oklch(0.97 0.006 250)}
.ad-btn:active{transform:scale(0.97);transition:transform 80ms cubic-bezier(.22,1,.36,1)}
@media(prefers-reduced-motion:reduce){
  .ad-h,.ad-s,.ad-m,.ad-r{animation:none}
  .ad-dot{animation:none}
  .ad-row,.ad-stat,.ad-btn{transition:none}
}
`;

const AssetDetail: React.FC = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const { role } = useAuth();
    const queryClient = useQueryClient();
    const { message } = App.useApp();

    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [statusValue, setStatusValue] = useState<AssetStatus | undefined>(undefined);
    const [approvingTransferId, setApprovingTransferId] = useState<string | null>(null);
    const [completingTransferId, setCompletingTransferId] = useState<string | null>(null);
    const canManageAssets = hasManagerAccess(role);

    const { data: asset, isLoading } = useQuery({
        queryKey: ['asset', id],
        queryFn: () => assetService.getById(id),
        enabled: Boolean(id),
    });

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const { data: brands = [] } = useQuery({
        queryKey: ['brands'],
        queryFn: () => brandService.getAll(),
    });

    const { data: maintenances = [] } = useQuery({
        queryKey: ['maintenances', 'asset', id],
        queryFn: () => maintenanceService.getByAsset(id),
        enabled: Boolean(id),
    });

    const { data: transfers = [] } = useQuery({
        queryKey: ['transfers', 'asset', id],
        queryFn: () => transferService.getByAsset(id),
        enabled: Boolean(id),
    });

    const { data: borrowings = [] } = useQuery({
        queryKey: ['borrowings', 'asset', id],
        queryFn: () => borrowingService.getByAsset(id),
        enabled: Boolean(id),
    });

    const updateAssetMutation = useMutation({
        mutationFn: (payload: { id: string; data: Partial<Asset> }) => assetService.update(payload.id, payload.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['asset', id] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['asset-models'] });
        },
    });

    const updateStatusMutation = useMutation({
        mutationFn: ({ nextStatus, note }: { nextStatus: AssetStatus; note?: string }) =>
            assetService.updateStatus(id, nextStatus, note),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['asset', id] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });

    const createTransferMutation = useMutation({
        mutationFn: transferService.create,
        onSuccess: (_transfer, payload) => {
            queryClient.invalidateQueries({ queryKey: ['transfers', 'asset', payload.assetId] });
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            queryClient.invalidateQueries({ queryKey: ['asset', id] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });

    const approveTransferMutation = useMutation({
        mutationFn: transferService.approve,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfers', 'asset', id] });
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            queryClient.invalidateQueries({ queryKey: ['asset', id] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });

    const completeTransferMutation = useMutation({
        mutationFn: transferService.complete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfers', 'asset', id] });
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            queryClient.invalidateQueries({ queryKey: ['asset', id] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });

    const combinedHistory = useMemo(() => {
        const maintenanceEvents = maintenances.map((item: Maintenance) => ({
            key: `m-${item.id}`,
            date: item.endDate || item.startDate,
            color: item.status === 'completed' ? 'green' : item.status === 'overdue' ? 'red' : 'orange',
            title: `Bảo trì ${item.type}`,
            description: item.description,
            meta: item.technician ? `KTV: ${item.technician}` : undefined,
        }));

        const transferEvents = transfers.map((item: Transfer) => ({
            key: `t-${item.id}`,
            date: item.transferDate,
            color: item.status === 'completed' ? 'blue' : item.status === 'rejected' ? 'red' : 'gray',
            title: `Điều chuyển ${item.fromPlant?.name || '-'} -> ${item.toPlant?.name || '-'}`,
            description: item.reason,
            meta: item.note || undefined,
        }));

        const borrowingEvents = borrowings.map((item: Borrowing) => ({
            key: `b-${item.id}`,
            date: item.returnTime || item.borrowTime,
            color: item.status === 'returned' ? 'green' : 'gold',
            title:
                item.status === 'returned'
                    ? `Đã trả ${item.type === 'rental' ? 'thiết bị thuê' : 'thiết bị'}`
                    : `Giao dịch ${item.type === 'internal' ? 'mượn nội bộ' : item.type === 'external' ? 'mượn ngoài' : 'thuê máy'}`,
            description: item.purpose || item.partnerName || 'Giao dịch thiết bị',
            meta: item.borrowerName
                ? `Người mượn: ${item.borrowerName}`
                : item.partnerName
                  ? `Đối tác: ${item.partnerName}`
                  : item.location,
        }));

        return [...maintenanceEvents, ...transferEvents, ...borrowingEvents].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    }, [borrowings, maintenances, transfers]);

    const handleUpdateAsset = async (values: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) => {
        await updateAssetMutation.mutateAsync({ id, data: values });
        message.success('Cập nhật thiết bị thành công');
        setIsFormModalOpen(false);
    };

    const handleCreateTransfer = async (payload: CreateTransferPayload) => {
        await createTransferMutation.mutateAsync(payload);
        message.success('Đã tạo lệnh điều chuyển');
        setIsTransferModalOpen(false);
    };

    const handleStatusChange = async (value: AssetStatus) => {
        setStatusValue(value);
        await updateStatusMutation.mutateAsync({ nextStatus: value });
        message.success('Đã cập nhật trạng thái thiết bị');
    };

    const handleApproveTransfer = async (transfer: Transfer) => {
        try {
            setApprovingTransferId(transfer.id);
            await approveTransferMutation.mutateAsync(transfer.id);
            message.success('Đã duyệt lệnh điều chuyển');
        } finally {
            setApprovingTransferId(null);
        }
    };

    const handleCompleteTransfer = async (transfer: Transfer) => {
        try {
            setCompletingTransferId(transfer.id);
            await completeTransferMutation.mutateAsync(transfer.id);
            message.success('Đã hoàn tất điều chuyển và cập nhật vị trí thiết bị');
        } finally {
            setCompletingTransferId(null);
        }
    };

    if (isLoading) {
        return <div className='flex min-h-[40vh] items-center justify-center'><Spin size='large' /></div>;
    }

    if (!asset) {
        return <Empty description='Không tìm thấy thiết bị' className='py-20' />;
    }

    const sp = STATUS_PILL[asset.status];

    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <style>{PAGE_ANIM}</style>

            {/* ── Page header ── */}
            <section className='ad-h overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                <div className='flex flex-col gap-5 p-6 md:p-8'>
                    <div className='flex flex-col items-start justify-between gap-4 md:flex-row'>
                        <div className='flex min-w-0 flex-col gap-2.5'>
                            <AppBreadcrumb />
                            <div className='flex flex-wrap items-center gap-2.5'>
                                <Button
                                    icon={<ArrowLeftOutlined />}
                                    onClick={() => navigate('/assets')}
                                    size='small'
                                    className='rounded-lg border-slate-200 text-slate-500 hover:border-slate-300'
                                >
                                    Quay lại
                                </Button>
                                {/* Status pill — identity, not action */}
                                <span
                                    className='inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold'
                                    style={{ background: sp.bg, color: sp.text }}
                                >
                                    <span className='ad-dot h-1.5 w-1.5 rounded-full flex-shrink-0' style={{ background: sp.dot }} />
                                    {statusMeta[asset.status].label}
                                </span>
                            </div>
                            <h1 className='text-[1.375rem] font-bold leading-tight tracking-tight text-slate-900'>{asset.name}</h1>
                            <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500'>
                                <code className='rounded bg-blue-50 px-2 py-0.5 font-mono text-xs font-semibold text-blue-700'>{asset.machineCode}</code>
                                {asset.serial && <span>Serial {asset.serial}</span>}
                                {(asset.model || asset.type) && <span>{asset.model || asset.type}</span>}
                                {asset.brand?.name && <span>{asset.brand.name}</span>}
                                {asset.plant?.name && <span>{asset.plant.name}{asset.area ? ` · ${asset.area}` : ''}</span>}
                            </div>
                        </div>

                        <div className='flex flex-wrap items-center gap-2'>
                            <Tooltip title={asset.hasOpenTransfer ? 'Thiết bị đang có lệnh điều chuyển chờ xử lý' : ''}>
                                <Button 
                                    icon={<SwapOutlined />} 
                                    onClick={() => !asset.hasOpenTransfer && setIsTransferModalOpen(true)} 
                                    className='ad-btn h-9 rounded-lg'
                                    disabled={asset.hasOpenTransfer}
                                >
                                    Điều chuyển
                                </Button>
                            </Tooltip>
                            <Button icon={<RollbackOutlined />} onClick={() => navigate(`/borrowings/new?assetId=${asset.id}`)} className='ad-btn h-9 rounded-lg'>Tạo giao dịch</Button>
                            {canManageAssets && (
                                <Button icon={<EditOutlined />} type='primary' onClick={() => setIsFormModalOpen(true)} className='ad-btn h-9 rounded-lg bg-blue-600 hover:!bg-blue-700'>Sửa thông tin</Button>
                            )}
                        </div>
                    </div>

                    {/* Status control — separated from actions */}
                    {canManageAssets && (
                        <div className='flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5'>
                            <span className='text-xs font-semibold uppercase tracking-wide text-slate-400'>Trạng thái</span>
                            <Segmented<AssetStatus>
                                value={statusValue ?? asset.status}
                                size='small'
                                options={Object.entries(statusMeta).map(([value, meta]) => {
                                    const isSelected = (statusValue ?? asset.status) === value;
                                    return {
                                        value: value as AssetStatus,
                                        label: (
                                            <div className='flex items-center gap-1.5 px-1'>
                                                {isSelected && (
                                                    <span 
                                                        className='h-1.5 w-1.5 rounded-full shadow-sm' 
                                                        style={{ background: meta.accent }}
                                                    />
                                                )}
                                                <span 
                                                    className='transition-colors'
                                                    style={{ 
                                                        color: isSelected ? meta.accent : 'inherit',
                                                        fontWeight: isSelected ? 600 : 500
                                                    }}
                                                >
                                                    {meta.label}
                                                </span>
                                            </div>
                                        )
                                    };
                                })}
                                onChange={handleStatusChange}
                            />
                        </div>
                    )}
                </div>

                {/* Counts strip — subdued, not hero */}
                <div className='ad-s flex flex-wrap gap-px border-t border-slate-100 bg-slate-100'>
                    {[
                        { label: 'Bảo trì', value: maintenances.length },
                        { label: 'Điều chuyển', value: transfers.length },
                        { label: 'Giao dịch', value: borrowings.length },
                        { label: 'Bảo trì gần nhất', value: formatDateTime(asset.lastMaintenanceDate) },
                        { label: 'Bảo trì kế tiếp', value: formatDateTime(asset.nextMaintenanceDate) },
                    ].map(({ label, value }) => (
                        <div key={label} className='ad-stat flex min-w-[110px] flex-1 flex-col gap-0.5 bg-white px-5 py-4'>
                            <span className='text-[11px] font-medium text-slate-400'>{label}</span>
                            <span className='text-base font-bold text-slate-800'>{value}</span>
                        </div>
                    ))}
                </div>
            </section>

            <div className='grid grid-cols-1 items-start gap-6 lg:grid-cols-3' style={{ animationFillMode: 'both' }}>
                <div className='ad-m flex flex-col gap-6 lg:col-span-2'>
                    <Card
                        title={<span className='font-bold text-slate-800'>Thông tin chung</span>}
                        bordered={false}
                        className='rounded-2xl border border-slate-200 shadow-sm [&_.ant-card-head]:border-b-slate-100'
                    >
                        <Descriptions
                            column={{ xs: 1, md: 2, xl: 3 }}
                            layout='vertical'
                            className='[&_.ant-descriptions-item-content]:font-medium [&_.ant-descriptions-item-content]:text-slate-800 [&_.ant-descriptions-item-label]:font-medium [&_.ant-descriptions-item-label]:text-slate-500'
                        >
                            <Descriptions.Item label='Loại máy'>
                                <Tag color='blue' className='rounded border-blue-200 bg-blue-50 text-blue-700'>
                                    {asset.type || '-'}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label='Model'>{asset.model || asset.type || '-'}</Descriptions.Item>
                            <Descriptions.Item label='Cơ sở'>{asset.plant?.name || '-'}</Descriptions.Item>
                            <Descriptions.Item label='Khu vực / xưởng'>{asset.area || '-'}</Descriptions.Item>
                            <Descriptions.Item label='Ngày mua / nhập'>
                                {formatDateTime(asset.purchaseDate)}
                            </Descriptions.Item>
                            <Descriptions.Item label='Giá trị'>
                                {asset.purchasePrice ? asset.purchasePrice.toLocaleString('vi-VN') + ' VNĐ' : '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label='Bảo trì kế tiếp'>
                                {formatDateTime(asset.nextMaintenanceDate)}
                            </Descriptions.Item>
                            <Descriptions.Item label='Ngày tạo'>{formatDateTime(asset.createdAt)}</Descriptions.Item>
                            <Descriptions.Item label='Ngày cập nhật'>
                                {formatDateTime(asset.updatedAt)}
                            </Descriptions.Item>
                            <Descriptions.Item label='Trạng thái'>{statusMeta[asset.status].label}</Descriptions.Item>
                        </Descriptions>

                        <div className='mt-6'>
                            <Text className='font-bold text-slate-800'>Ghi chú</Text>
                            <div className='mt-2 min-h-[80px] rounded-xl border border-amber-100 bg-amber-50/50 p-4 text-slate-700'>
                                {asset.note || <Text type='secondary'>Chưa có ghi chú</Text>}
                            </div>
                        </div>
                    </Card>

                    <Card
                        title={<span className='font-bold text-slate-800'>Thông số kỹ thuật</span>}
                        bordered={false}
                        className='rounded-2xl border border-slate-200 shadow-sm [&_.ant-card-head]:border-b-slate-100'
                    >
                        {asset.specifications && Object.keys(asset.specifications).length > 0 ? (
                            <Descriptions
                                column={{ xs: 1, md: 2 }}
                                bordered
                                size='small'
                                className='[&_.ant-descriptions-item-content]:font-medium [&_.ant-descriptions-item-label]:bg-slate-50 [&_.ant-descriptions-item-label]:font-medium [&_.ant-descriptions-view]:border-slate-200'
                            >
                                {Object.entries(asset.specifications).map(([key, value]) => (
                                    <Descriptions.Item key={key} label={key}>
                                        {String(value)}
                                    </Descriptions.Item>
                                ))}
                            </Descriptions>
                        ) : (
                            <Empty description='Chưa có thông số kỹ thuật' />
                        )}
                    </Card>

                    <TransferHistorySection
                        transfers={transfers}
                        loading={
                            createTransferMutation.isPending ||
                            approveTransferMutation.isPending ||
                            completeTransferMutation.isPending
                        }
                        approvingTransferId={approvingTransferId}
                        completingTransferId={completingTransferId}
                        onCreate={() => setIsTransferModalOpen(true)}
                        onApprove={canManageAssets ? handleApproveTransfer : undefined}
                        onComplete={canManageAssets ? handleCompleteTransfer : undefined}
                    />

                    <Card
                        title={<span className='font-bold text-slate-800'>Lịch sử hoạt động</span>}
                        bordered={false}
                        className='rounded-2xl border border-slate-200 shadow-sm [&_.ant-card-head]:border-b-slate-100'
                    >
                        {combinedHistory.length > 0 ? (
                            <Timeline
                                items={combinedHistory.map((item) => ({
                                    key: item.key,
                                    color: item.color,
                                    children: (
                                        <div className='pb-4'>
                                            <div className='font-bold text-slate-800'>{formatDateTime(item.date)}</div>
                                            <div className='mt-1 font-medium text-slate-700'>{item.title}</div>
                                            <div className='mt-1 leading-relaxed text-slate-500'>
                                                {item.description}
                                            </div>
                                            {item.meta && (
                                                <div className='mt-2 inline-block rounded bg-slate-50 px-2 py-1 text-sm font-medium text-slate-400'>
                                                    {item.meta}
                                                </div>
                                            )}
                                        </div>
                                    ),
                                }))}
                                className='mt-4'
                            />
                        ) : (
                            <Empty description='Chưa có lịch sử hoạt động' />
                        )}
                    </Card>
                </div>

                <div className='ad-r flex flex-col gap-4'>
                    {/* Location — compact panel */}
                    <div className='rounded-xl border border-slate-200 bg-white p-5'>
                        <p className='mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400'>Vị trí hiện tại</p>
                        <div className='grid grid-cols-2 gap-3'>
                            {[['Cơ sở', asset.plant?.name], ['Mã cơ sở', asset.plant?.code], ['Khu vực', asset.area], ['Serial', asset.serial]].map(([lbl, val]) => (
                                <div key={lbl}>
                                    <div className='text-[11px] text-slate-400'>{lbl}</div>
                                    <div className='mt-0.5 text-sm font-semibold text-slate-800'>{val || '—'}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Maintenance list */}
                    <div className='overflow-hidden rounded-xl border border-slate-200 bg-white'>
                        <div className='border-b border-slate-100 px-5 py-3'>
                            <p className='text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400'>Bảo trì gần đây</p>
                        </div>
                        {maintenances.length ? (
                            <div className='divide-y divide-slate-100'>
                                {maintenances.slice(0, 4).map((item) => (
                                    <div key={item.id} className='ad-row px-5 py-3'>
                                        <div className='text-xs font-semibold text-slate-400'>{formatDateTime(item.startDate)}</div>
                                        <div className='mt-0.5 text-sm font-medium text-slate-800'>{item.description || item.type}</div>
                                        {item.technician && <div className='mt-0.5 text-xs text-slate-400'>{item.technician}</div>}
                                    </div>
                                ))}
                            </div>
                        ) : <div className='px-5 py-5'><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có dữ liệu' /></div>}
                    </div>

                    {/* Transfers list */}
                    <div className='overflow-hidden rounded-xl border border-slate-200 bg-white'>
                        <div className='border-b border-slate-100 px-5 py-3'>
                            <p className='text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400'>Điều chuyển gần đây</p>
                        </div>
                        {transfers.length ? (
                            <div className='divide-y divide-slate-100'>
                                {transfers.slice(0, 4).map((item) => (
                                    <div key={item.id} className='ad-row px-5 py-3'>
                                        <div className='text-xs font-semibold text-slate-400'>{formatDateTime(item.transferDate)}</div>
                                        <div className='mt-0.5 text-sm font-medium text-slate-800'>{item.fromPlant?.name || '?'} → {item.toPlant?.name || '?'}</div>
                                        {item.reason && <div className='mt-0.5 text-xs text-slate-400'>{item.reason}</div>}
                                    </div>
                                ))}
                            </div>
                        ) : <div className='px-5 py-5'><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có dữ liệu' /></div>}
                    </div>

                    {/* Borrowings list */}
                    <div className='overflow-hidden rounded-xl border border-slate-200 bg-white'>
                        <div className='flex items-center justify-between border-b border-slate-100 px-5 py-3'>
                            <p className='text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400'>Giao dịch gần đây</p>
                            <button onClick={() => navigate(`/borrowings/new?assetId=${asset.id}`)} className='text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700'>+ Tạo</button>
                        </div>
                        {borrowings.length ? (
                            <div className='divide-y divide-slate-100'>
                                {borrowings.slice(0, 4).map((item) => (
                                    <div key={item.id} className='ad-row px-5 py-3'>
                                        <div className='flex items-center justify-between'>
                                            <span className='text-xs font-semibold text-slate-400'>{formatDateTime(item.borrowTime)}</span>
                                            <div className='flex gap-1'>
                                                <TransactionTypeBadge type={item.type} />
                                                <TransactionStatusBadge status={item.status} />
                                            </div>
                                        </div>
                                        <div className='mt-0.5 text-sm font-medium text-slate-800'>{item.borrowerName || item.partnerName || '—'}</div>
                                        <button onClick={() => navigate(`/borrowings/${item.id}`)} className='mt-1 text-xs font-medium text-blue-600 transition-colors hover:text-blue-700'>Xem chi tiết →</button>
                                    </div>
                                ))}
                            </div>
                        ) : <div className='px-5 py-5'><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có dữ liệu' /></div>}
                    </div>
                </div>
            </div>

            {isFormModalOpen ? (
                <LazyBoundary mode='overlay'>
                    <AssetFormModal
                        open={isFormModalOpen}
                        onClose={() => setIsFormModalOpen(false)}
                        initialValues={asset}
                        onSubmit={handleUpdateAsset}
                        plants={plants}
                        brands={brands}
                    />
                </LazyBoundary>
            ) : null}

            {isTransferModalOpen ? (
                <LazyBoundary mode='overlay'>
                    <TransferModal
                        open={isTransferModalOpen}
                        asset={asset}
                        plants={plants}
                        submitting={createTransferMutation.isPending}
                        onClose={() => setIsTransferModalOpen(false)}
                        onSubmit={handleCreateTransfer}
                    />
                </LazyBoundary>
            ) : null}
        </div>
    );
};

export default AssetDetail;
