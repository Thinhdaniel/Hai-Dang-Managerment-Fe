import React, { useState } from 'react';
import { App, Button, Descriptions, Empty, Input, Modal, Spin, Steps, Timeline, Typography } from 'antd';
import {
    ArrowLeftOutlined,
    CheckCircleOutlined,
    CheckOutlined,
    CloseCircleOutlined,
    CloseOutlined,
    EnvironmentOutlined,
    FileTextOutlined,
    InfoCircleOutlined,
    RightOutlined,
    StopOutlined,
    SwapOutlined,
    TruckOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import AppBreadcrumb from '../components/navigation/AppBreadcrumb';
import TransferStatusBadge from '../components/transfer/TransferStatusBadge';
import ConfirmAction from '../components/shared/ConfirmAction';
import HandoverModal from '../components/transfer/HandoverModal';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess } from '../core/lib/permissions';
import { transferService } from '../core/services/transfer.service';

const { Text, Title } = Typography;

const fmt = (v?: string) => (v ? dayjs(v).format('DD/MM/YYYY HH:mm') : '—');
const fmtDate = (v?: string) => (v ? dayjs(v).format('DD/MM/YYYY') : '—');

const STEP_MAP: Record<string, number> = { pending: 0, approved: 1, completed: 2 };

// Màu accent theo trạng thái
const STATUS_ACCENT: Record<string, { bg: string; border: string; text: string; label: string }> = {
    pending:   { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   label: 'Chờ duyệt' },
    approved:  { bg: 'bg-sky-50',     border: 'border-sky-200',     text: 'text-sky-700',     label: 'Đã duyệt — Đang trên đường' },
    completed: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: 'Hoàn tất' },
    rejected:  { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    label: 'Từ chối' },
    cancelled: { bg: 'bg-slate-50',   border: 'border-slate-200',   text: 'text-slate-500',   label: 'Đã hủy' },
};


const TransferDetail: React.FC = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const { role } = useAuth();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const canManage = hasManagerAccess(role);

    const [rejectModal, setRejectModal] = useState({ open: false, reason: '' });
    const [cancelModal, setCancelModal] = useState({ open: false, reason: '' });
    const [handoverOpen, setHandoverOpen] = useState(false);

    const { data: transfer, isLoading } = useQuery({
        queryKey: ['transfer', id],
        queryFn: () => transferService.getById(id),
        enabled: Boolean(id),
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['transfer', id] });
        queryClient.invalidateQueries({ queryKey: ['transfers'] });
        queryClient.invalidateQueries({ queryKey: ['transfers-stats'] });
        queryClient.invalidateQueries({ queryKey: ['assets'] });
    };

    const approveMutation = useMutation({
        mutationFn: () => transferService.approve(id),
        onSuccess: () => { invalidate(); message.success('Đã duyệt lệnh điều chuyển'); },
    });
    const completeMutation = useMutation({
        mutationFn: (payload: { receivedBy: string; handoverImages?: string[] }) =>
            transferService.complete(id, payload),
        onSuccess: () => { invalidate(); message.success('Đã hoàn tất điều chuyển, vị trí thiết bị đã được cập nhật'); },
    });
    const rejectMutation = useMutation({
        mutationFn: (reason: string) => transferService.reject(id, reason),
        onSuccess: () => { invalidate(); message.success('Đã từ chối lệnh điều chuyển'); setRejectModal({ open: false, reason: '' }); },
    });
    const cancelMutation = useMutation({
        mutationFn: (reason: string) => transferService.cancel(id, reason),
        onSuccess: () => { invalidate(); message.success('Đã hủy lệnh điều chuyển'); setCancelModal({ open: false, reason: '' }); },
    });

    if (isLoading) return (
        <div className='flex min-h-[50vh] items-center justify-center'>
            <Spin size='large' />
        </div>
    );

    if (!transfer) return <Empty description='Không tìm thấy lệnh điều chuyển' className='py-20' />;

    const accent = STATUS_ACCENT[transfer.status] ?? STATUS_ACCENT.pending;
    const stepIndex = STEP_MAP[transfer.status] ?? -1;
    const isActive = !['rejected', 'cancelled', 'completed'].includes(transfer.status);
    const transferCode = `TRF-${new Date(transfer.createdAt).getFullYear()}-${transfer.id.slice(-4).toUpperCase()}`;

    // Timeline items
    const timelineItems = [
        {
            dot: <FileTextOutlined className='text-slate-400' />,
            children: (
                <div>
                    <div className='text-xs font-semibold text-slate-400'>Tạo lệnh</div>
                    <div className='text-sm font-medium text-slate-700'>{fmt(transfer.createdAt)}</div>
                </div>
            ),
        },
        ...(transfer.approvedAt ? [{
            dot: transfer.status === 'rejected'
                ? <CloseCircleOutlined className='text-rose-500' />
                : <CheckOutlined className='text-sky-500' />,
            children: (
                <div>
                    <div className={`text-xs font-semibold ${transfer.status === 'rejected' ? 'text-rose-400' : 'text-sky-400'}`}>
                        {transfer.status === 'rejected' ? 'Từ chối' : 'Duyệt lệnh'}
                    </div>
                    <div className='text-sm font-medium text-slate-700'>{fmt(transfer.approvedAt)}</div>
                    {transfer.rejectReason && (
                        <div className='mt-1 text-xs text-rose-500'>Lý do: {transfer.rejectReason}</div>
                    )}
                </div>
            ),
        }] : []),
        ...(transfer.completedAt ? [{
            dot: <CheckCircleOutlined className='text-emerald-500' />,
            children: (
                <div>
                    <div className='text-xs font-semibold text-emerald-400'>Hoàn tất</div>
                    <div className='text-sm font-medium text-slate-700'>{fmt(transfer.completedAt)}</div>
                    {transfer.receivedBy && (
                        <div className='mt-1 text-xs text-slate-500'>Người nhận: {transfer.receivedBy}</div>
                    )}
                </div>
            ),
        }] : []),
        ...(transfer.cancelledAt ? [{
            dot: <StopOutlined className='text-slate-400' />,
            children: (
                <div>
                    <div className='text-xs font-semibold text-slate-400'>Hủy lệnh</div>
                    <div className='text-sm font-medium text-slate-700'>{fmt(transfer.cancelledAt)}</div>
                    {transfer.cancelReason && (
                        <div className='mt-1 text-xs text-slate-500'>Lý do: {transfer.cancelReason}</div>
                    )}
                </div>
            ),
        }] : []),
    ];


    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>

            {/* ── Header ── */}
            <section className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                <div className='flex flex-col gap-5 p-6 md:p-8'>
                    {/* Top row */}
                    <div className='flex flex-col items-start justify-between gap-4 md:flex-row'>
                        <div className='flex min-w-0 flex-col gap-2'>
                            <AppBreadcrumb />
                            <Button
                                icon={<ArrowLeftOutlined />}
                                size='small'
                                onClick={() => navigate('/transfers')}
                                className='w-fit rounded-lg border-slate-200 text-slate-500'
                            >
                                Quay lại danh sách
                            </Button>
                            <div className='flex flex-wrap items-center gap-2.5 pt-1'>
                                <Title level={4} className='!mb-0'>
                                    Lệnh điều chuyển
                                </Title>
                                <code className='rounded-md bg-indigo-50 px-2.5 py-1 font-mono text-sm font-bold text-indigo-700'>
                                    {transferCode}
                                </code>
                                <TransferStatusBadge status={transfer.status} />
                            </div>
                            <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500'>
                                <span>Tạo lúc: <strong className='text-slate-700'>{fmt(transfer.createdAt)}</strong></span>
                                {transfer.asset?.machineCode && (
                                    <span>Mã máy: <strong className='text-slate-700'>{transfer.asset.machineCode}</strong></span>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className='flex flex-shrink-0 flex-wrap items-center gap-2'>
                            {transfer.status === 'pending' && canManage && (
                                <ConfirmAction
                                    intent='warning'
                                    title='Duyệt lệnh điều chuyển'
                                    description='Xác nhận duyệt? Thiết bị sẽ chuyển sang trạng thái đang vận chuyển.'
                                    okLabel='Duyệt'
                                    onConfirm={() => approveMutation.mutate()}
                                >
                                    <Button icon={<CheckOutlined />} loading={approveMutation.isPending} className='rounded-lg border-amber-300 bg-amber-50 font-medium text-amber-700 hover:bg-amber-100'>
                                        Duyệt lệnh
                                    </Button>
                                </ConfirmAction>
                            )}
                            {transfer.status === 'approved' && canManage && (
                                <Button type='primary' icon={<CheckCircleOutlined />} onClick={() => setHandoverOpen(true)} className='rounded-lg bg-emerald-600 font-medium hover:!bg-emerald-700'>
                                    Xác nhận hoàn tất
                                </Button>
                            )}
                            {['pending', 'approved'].includes(transfer.status) && canManage && (
                                <Button icon={<CloseOutlined />} danger onClick={() => setRejectModal({ open: true, reason: '' })} className='rounded-lg font-medium'>
                                    Từ chối
                                </Button>
                            )}
                            {transfer.status === 'pending' && (
                                <Button icon={<StopOutlined />} onClick={() => setCancelModal({ open: true, reason: '' })} className='rounded-lg font-medium text-slate-600'>
                                    Hủy lệnh
                                </Button>
                            )}
                            <Button icon={<SwapOutlined />} onClick={() => navigate(`/assets/${transfer.assetId}`)} className='rounded-lg'>
                                Xem thiết bị
                            </Button>
                        </div>
                    </div>

                    {/* Status banner */}
                    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${accent.bg} ${accent.border}`}>
                        {transfer.status === 'approved' && <TruckOutlined className={`text-lg ${accent.text}`} />}
                        {transfer.status === 'pending' && <InfoCircleOutlined className={`text-lg ${accent.text}`} />}
                        {transfer.status === 'completed' && <CheckCircleOutlined className={`text-lg ${accent.text}`} />}
                        {transfer.status === 'rejected' && <CloseCircleOutlined className={`text-lg ${accent.text}`} />}
                        {transfer.status === 'cancelled' && <StopOutlined className={`text-lg ${accent.text}`} />}
                        <span className={`text-sm font-semibold ${accent.text}`}>{accent.label}</span>
                        {transfer.status === 'approved' && (
                            <span className='ml-1 text-sm text-sky-600'>
                                — {transfer.asset?.name || 'Thiết bị'} đang được vận chuyển từ <strong>{transfer.fromPlant?.name}</strong> đến <strong>{transfer.toPlant?.name}</strong>
                            </span>
                        )}
                        {transfer.status === 'completed' && transfer.completedAt && (
                            <span className='ml-1 text-sm text-emerald-600'>lúc {fmt(transfer.completedAt)}</span>
                        )}
                    </div>

                    {/* Progress steps — chỉ hiện khi đang active */}
                    {isActive && (
                        <Steps
                            current={stepIndex}
                            size='small'
                            className='pt-1'
                            items={[
                                { title: 'Chờ duyệt', description: fmt(transfer.createdAt) },
                                { title: 'Đang vận chuyển', description: transfer.approvedAt ? fmt(transfer.approvedAt) : 'Chưa duyệt' },
                                { title: 'Hoàn tất', description: transfer.completedAt ? fmt(transfer.completedAt) : 'Chờ xác nhận' },
                            ]}
                        />
                    )}
                </div>
            </section>


            {/* ── Body ── */}
            <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>

                {/* Left — main content */}
                <div className='flex flex-col gap-6 lg:col-span-2'>

                    {/* Lộ trình */}
                    <div className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
                        <div className='mb-4 flex items-center gap-2'>
                            <EnvironmentOutlined className='text-slate-400' />
                            <h3 className='font-bold text-slate-800'>Lộ trình điều chuyển</h3>
                        </div>
                        <div className='flex items-stretch gap-3'>
                            <div className='flex-1 rounded-xl border border-slate-100 bg-slate-50 p-4'>
                                <div className='mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400'>Xuất phát</div>
                                <div className='text-base font-bold text-slate-800'>{transfer.fromPlant?.name || '—'}</div>
                                <div className='mt-0.5 text-sm text-slate-500'>{transfer.fromArea || 'Chưa chỉ định khu vực'}</div>
                                {transfer.fromPlant?.address && (
                                    <div className='mt-1 text-xs text-slate-400'>{transfer.fromPlant.address}</div>
                                )}
                            </div>
                            <div className='flex flex-col items-center justify-center gap-1 px-1'>
                                <div className={`h-2 w-2 rounded-full ${transfer.status === 'approved' ? 'bg-sky-400' : 'bg-slate-300'}`} />
                                <div className={`h-8 w-0.5 ${transfer.status === 'approved' ? 'bg-sky-300' : 'bg-slate-200'}`} />
                                <RightOutlined className={`text-xs ${transfer.status === 'approved' ? 'text-sky-400' : 'text-slate-300'}`} />
                                <div className={`h-8 w-0.5 ${transfer.status === 'approved' ? 'bg-sky-300' : 'bg-slate-200'}`} />
                                <div className={`h-2 w-2 rounded-full ${transfer.status === 'completed' ? 'bg-emerald-400' : transfer.status === 'approved' ? 'bg-sky-400' : 'bg-slate-300'}`} />
                            </div>
                            <div className={`flex-1 rounded-xl border p-4 ${transfer.status === 'completed' ? 'border-emerald-100 bg-emerald-50' : transfer.status === 'approved' ? 'border-sky-100 bg-sky-50' : 'border-slate-100 bg-slate-50'}`}>
                                <div className={`mb-1 text-[11px] font-bold uppercase tracking-wider ${transfer.status === 'completed' ? 'text-emerald-400' : transfer.status === 'approved' ? 'text-sky-400' : 'text-slate-400'}`}>
                                    Điểm đến
                                </div>
                                <div className='text-base font-bold text-slate-800'>{transfer.toPlant?.name || '—'}</div>
                                <div className='mt-0.5 text-sm text-slate-500'>{transfer.toArea || 'Chưa chỉ định khu vực'}</div>
                                {transfer.toPlant?.address && (
                                    <div className='mt-1 text-xs text-slate-400'>{transfer.toPlant.address}</div>
                                )}
                            </div>
                        </div>
                        {transfer.status === 'approved' && (
                            <div className='mt-3 flex items-center gap-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2'>
                                <TruckOutlined className='text-sky-500' />
                                <span className='text-sm font-medium text-sky-700'>Thiết bị đang trên đường vận chuyển</span>
                            </div>
                        )}
                    </div>

                    {/* Chi tiết lệnh */}
                    <div className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
                        <div className='mb-4 flex items-center gap-2'>
                            <FileTextOutlined className='text-slate-400' />
                            <h3 className='font-bold text-slate-800'>Chi tiết lệnh</h3>
                        </div>
                        <Descriptions
                            column={{ xs: 1, sm: 2 }}
                            layout='vertical'
                            className='[&_.ant-descriptions-item-content]:font-medium [&_.ant-descriptions-item-content]:text-slate-800 [&_.ant-descriptions-item-label]:text-xs [&_.ant-descriptions-item-label]:font-semibold [&_.ant-descriptions-item-label]:uppercase [&_.ant-descriptions-item-label]:tracking-wider [&_.ant-descriptions-item-label]:text-slate-400'
                        >
                            <Descriptions.Item label='Ngày điều chuyển'>{fmtDate(transfer.transferDate)}</Descriptions.Item>
                            <Descriptions.Item label='Trạng thái'><TransferStatusBadge status={transfer.status} /></Descriptions.Item>
                            <Descriptions.Item label='Lý do điều chuyển' span={2}>{transfer.reason}</Descriptions.Item>
                            {transfer.note && (
                                <Descriptions.Item label='Ghi chú' span={2}>{transfer.note}</Descriptions.Item>
                            )}
                            {transfer.receivedBy && (
                                <Descriptions.Item label='Người nhận bàn giao' span={2}>
                                    <span className='flex items-center gap-1.5'>
                                        <UserOutlined className='text-slate-400' />
                                        {transfer.receivedBy}
                                    </span>
                                </Descriptions.Item>
                            )}
                            {transfer.rejectReason && (
                                <Descriptions.Item label='Lý do từ chối' span={2}>
                                    <span className='font-semibold text-rose-600'>{transfer.rejectReason}</span>
                                </Descriptions.Item>
                            )}
                            {transfer.cancelReason && (
                                <Descriptions.Item label='Lý do hủy' span={2}>
                                    <span className='text-slate-500'>{transfer.cancelReason}</span>
                                </Descriptions.Item>
                            )}
                        </Descriptions>

                        {/* Ảnh xác nhận bàn giao */}
                        {transfer.handoverImages && transfer.handoverImages.length > 0 && (
                            <div className='mt-5 border-t border-slate-100 pt-5'>
                                <div className='mb-3 flex items-center gap-2'>
                                    <span className='text-xs font-bold uppercase tracking-wider text-slate-400'>Ảnh xác nhận bàn giao</span>
                                    <span className='rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700'>
                                        {transfer.handoverImages.length} ảnh
                                    </span>
                                </div>
                                <div className='flex flex-wrap gap-3'>
                                    {transfer.handoverImages.map((url, idx) => (
                                        <a
                                            key={idx}
                                            href={url}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            className='group relative block h-28 w-28 overflow-hidden rounded-xl border-2 border-slate-100 transition-all hover:border-emerald-300 hover:shadow-md'
                                        >
                                            <img
                                                src={url}
                                                alt={`Ảnh bàn giao ${idx + 1}`}
                                                className='h-full w-full object-cover transition-transform group-hover:scale-105'
                                            />
                                            <div className='absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20'>
                                                <span className='text-xs font-bold text-white opacity-0 transition-opacity group-hover:opacity-100'>Xem</span>
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right — sidebar */}
                <div className='flex flex-col gap-4'>

                    {/* Thiết bị */}
                    <div className='rounded-xl border border-slate-200 bg-white p-5 shadow-sm'>
                        <p className='mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400'>Thiết bị</p>
                        <div className='flex flex-col gap-2'>
                            <div className='text-base font-bold text-slate-800'>{transfer.asset?.name || '—'}</div>
                            <div className='flex flex-wrap gap-1.5'>
                                {transfer.asset?.machineCode && (
                                    <code className='rounded bg-blue-50 px-2 py-0.5 font-mono text-xs font-semibold text-blue-700'>
                                        {transfer.asset.machineCode}
                                    </code>
                                )}
                                {transfer.asset?.type && (
                                    <span className='rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600'>
                                        {transfer.asset.type}
                                    </span>
                                )}
                            </div>
                            {transfer.asset?.brand?.name && (
                                <Text type='secondary' className='text-sm'>{transfer.asset.brand.name}</Text>
                            )}
                            <Button
                                size='small'
                                icon={<SwapOutlined />}
                                onClick={() => navigate(`/assets/${transfer.assetId}`)}
                                className='mt-1 w-fit rounded-lg'
                            >
                                Xem thiết bị
                            </Button>
                        </div>
                    </div>

                    {/* Timeline xử lý */}
                    <div className='rounded-xl border border-slate-200 bg-white p-5 shadow-sm'>
                        <p className='mb-4 text-[11px] font-bold uppercase tracking-wider text-slate-400'>Lịch sử xử lý</p>
                        <Timeline items={timelineItems} />
                    </div>
                </div>
            </div>

            {/* Modal từ chối */}
            <Modal
                open={rejectModal.open}
                title='Từ chối lệnh điều chuyển'
                okText='Xác nhận từ chối'
                cancelText='Hủy'
                okButtonProps={{ danger: true, loading: rejectMutation.isPending, disabled: !rejectModal.reason.trim() }}
                onOk={() => rejectMutation.mutate(rejectModal.reason.trim())}
                onCancel={() => setRejectModal({ open: false, reason: '' })}
                destroyOnHidden
            >
                <p className='mb-3 text-sm text-slate-600'>
                    Thiết bị: <strong>{transfer.asset?.name || transfer.assetId}</strong>
                </p>
                <Input.TextArea
                    rows={3}
                    placeholder='Nhập lý do từ chối...'
                    value={rejectModal.reason}
                    onChange={(e) => setRejectModal((prev) => ({ ...prev, reason: e.target.value }))}
                    autoFocus
                />
            </Modal>

            {/* Modal hủy lệnh */}
            <Modal
                open={cancelModal.open}
                title='Hủy lệnh điều chuyển'
                okText='Xác nhận hủy'
                cancelText='Đóng'
                okButtonProps={{ danger: true, loading: cancelMutation.isPending, disabled: !cancelModal.reason.trim() }}
                onOk={() => cancelMutation.mutate(cancelModal.reason.trim())}
                onCancel={() => setCancelModal({ open: false, reason: '' })}
                destroyOnHidden
            >
                <p className='mb-3 text-sm text-slate-600'>
                    Thiết bị: <strong>{transfer.asset?.name || transfer.assetId}</strong>
                </p>
                <Input.TextArea
                    rows={3}
                    placeholder='Nhập lý do hủy...'
                    value={cancelModal.reason}
                    onChange={(e) => setCancelModal((prev) => ({ ...prev, reason: e.target.value }))}
                    autoFocus
                />
            </Modal>

            <HandoverModal
                open={handoverOpen}
                assetName={transfer.asset?.name}
                submitting={completeMutation.isPending}
                onClose={() => setHandoverOpen(false)}
                onSubmit={async (payload) => { await completeMutation.mutateAsync(payload); }}
            />
        </div>
    );
};

export default TransferDetail;
