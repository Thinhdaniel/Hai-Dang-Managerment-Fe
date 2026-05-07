import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    App,
    Button,
    DatePicker,
    Descriptions,
    Drawer,
    Empty,
    Input,
    Select,
    Space,
    Steps,
    Table,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import {
    ArrowRightOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    DownloadOutlined,
    EyeOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import ExpressDispatchModal from '../components/ExpressDispatchModal';
import SupplyDistributionModal from '../components/SupplyDistributionModal';
import ConfirmAction from '../components/shared/ConfirmAction';
import PageHeader from '../components/shared/PageHeader';
import { useAuth } from '../core/contexts/AuthContext';
import { normalizeSearchTerm } from '../core/lib/search';
import { plantService } from '../core/services';
import type {
    Distribution,
    DistributionQueryParams,
    DistributionStatus,
    PurchaseRequest,
} from '../core/services/material.service';
import { distributionService, supplyRequestService } from '../core/services/material.service';
import type { PaginatedResponse, Plant, User } from '../core/types';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const SEARCH_DEBOUNCE_MS = 300;
const MAIN_PLANT_ID = import.meta.env.VITE_MAIN_PLANT_ID as string;

const PAGE_ANIM = `
@keyframes mdp-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.mdp-h{animation:mdp-up .28s cubic-bezier(.22,1,.36,1) .04s both}
.mdp-s{animation:mdp-up .30s cubic-bezier(.22,1,.36,1) .12s both}
.mdp-f{animation:mdp-up .30s cubic-bezier(.22,1,.36,1) .18s both}
.mdp-t{animation:mdp-up .32s cubic-bezier(.22,1,.36,1) .24s both}
`;

type DateRangeValue = [Dayjs, Dayjs];

type FilterState = {
    search: string;
    toPlantId?: string;
    status?: DistributionStatus;
    startDate?: string;
    endDate?: string;
};

type DraftFilterState = {
    search: string;
    toPlantId?: string;
    status?: DistributionStatus;
    dateRange: DateRangeValue | null;
};

// Status display config
const STATUS_META: Record<DistributionStatus, { color: string; label: string; icon: React.ReactNode }> = {
    pending:     { color: 'default',    label: 'Chờ xuất kho',        icon: <ClockCircleOutlined /> },
    processing:  { color: 'processing', label: 'Đang xử lý',          icon: <ClockCircleOutlined /> },
    distributed: { color: 'blue',       label: 'Đã xuất — chờ nhận',  icon: <ArrowRightOutlined /> },
    confirmed:   { color: 'green',      label: 'Hoàn thành',           icon: <CheckCircleOutlined /> },
};

const STATUS_OPTIONS: Array<{ value: DistributionStatus; label: string }> = [
    { value: 'pending',     label: 'Chờ xuất kho' },
    { value: 'distributed', label: 'Đã xuất — chờ nhận' },
    { value: 'confirmed',   label: 'Hoàn thành' },
];

// Helpers
const fmt = (v?: number) => (v ?? 0).toLocaleString('vi-VN');
const fmtDt = (v?: string) => (v ? dayjs(v).format('DD/MM/YYYY HH:mm') : '-');
const resolveUser = (v?: string | User) => {
    if (!v) return '-';
    if (typeof v === 'string') return v;
    return (v as User).name || (v as User).email || (v as User).id;
};

const normalizePaginated = <T,>(
    res: T[] | PaginatedResponse<T>,
    page: number,
    limit: number
): PaginatedResponse<T> => {
    if (Array.isArray(res)) {
        const total = res.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const safePage = Math.min(page, totalPages);
        return { data: res.slice((safePage - 1) * limit, safePage * limit), total, page: safePage, limit, totalPages };
    }
    return res;
};

const resolveErr = (e: unknown, fallback: string) =>
    e && typeof e === 'object' && 'message' in e && typeof (e as any).message === 'string'
        ? (e as any).message
        : fallback;


// ── Status Steps ──────────────────────────────────────────────────────────────
const StatusSteps: React.FC<{ status: DistributionStatus }> = ({ status }) => {
    const current = status === 'confirmed' ? 2 : status === 'distributed' ? 1 : 0;
    return (
        <Steps
            size='small'
            current={current}
            items={[
                { title: 'Chờ xuất kho', status: current > 0 ? 'finish' : current === 0 ? 'process' : 'wait' },
                { title: 'Đã xuất — chờ nhận', status: current > 1 ? 'finish' : current === 1 ? 'process' : 'wait' },
                { title: 'Hoàn thành', status: current === 2 ? 'finish' : 'wait' },
            ]}
        />
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const DistributionPage: React.FC = () => {
    const { message, notification } = App.useApp();
    const queryClient = useQueryClient();
    const { user, role } = useAuth();
    const location = useLocation();
    const locationState = (location.state as any) || {};

    // Pre-fill from SupplyRequest navigate state
    const prefillSRId = locationState.supplyRequestId as string | undefined;

    const isCS1Manager =
        Boolean(user?.plantId) &&
        user!.plantId === MAIN_PLANT_ID &&
        (role === 'admin' || role === 'manager' || role === 'director');

    const [filters, setFilters] = useState<FilterState>({ search: '', toPlantId: undefined, status: undefined });
    const [draft, setDraft] = useState<DraftFilterState>({ search: '', toPlantId: undefined, status: undefined, dateRange: null });
    const [pagination, setPagination] = useState({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [expressOpen, setExpressOpen] = useState(false);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [distributingId, setDistributingId] = useState<string | null>(null);
    const [exportingId, setExportingId] = useState<string | null>(null);

    // Auto-open create modal when navigated from SR page
    useEffect(() => {
        if (prefillSRId && isCS1Manager) setCreateOpen(true);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Search debounce
    useEffect(() => {
        const t = window.setTimeout(() => {
            const s = normalizeSearchTerm(draft.search);
            setPagination((p) => ({ ...p, page: DEFAULT_PAGE }));
            setFilters((f) => ({ ...f, search: s }));
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(t);
    }, [draft.search]);

    const listParams = useMemo<DistributionQueryParams>(
        () => ({
            search: filters.search || undefined,
            toPlantId: filters.toPlantId,
            status: filters.status,
            startDate: filters.startDate,
            endDate: filters.endDate,
            page: pagination.page,
            limit: pagination.limit,
        }),
        [filters, pagination]
    );

    // ── Queries ───────────────────────────────────────────────────────────────
    const { data: plants = [] } = useQuery({ queryKey: ['plants'], queryFn: () => plantService.getAll() });

    const { data: listRes, isLoading, isFetching } = useQuery({
        queryKey: ['materials', 'distributions', listParams],
        queryFn: () => distributionService.getAll(listParams).then((r) => normalizePaginated(r, pagination.page, pagination.limit)),
        placeholderData: (p) => p,
    });

    const { data: detail, isLoading: detailLoading } = useQuery({
        queryKey: ['materials', 'distribution', selectedId],
        queryFn: () => distributionService.getById(selectedId!),
        enabled: Boolean(selectedId),
    });

    // Fetch approved SRs for create selector
    const { data: approvedSRs = [] } = useQuery({
        queryKey: ['materials', 'supply-requests', 'approved'],
        queryFn: () =>
            supplyRequestService
                .getAll({ status: 'approved', limit: 100 })
                .then((r) => (Array.isArray(r) ? r : (r as PaginatedResponse<PurchaseRequest>).data)),
        enabled: createOpen && isCS1Manager,
    });

    const distributions = listRes?.data ?? [];

    // ── Mutations ─────────────────────────────────────────────────────────────
    const confirmMutation = useMutation({ mutationFn: (id: string) => distributionService.confirm(id) });
    const distributeMutation = useMutation({ mutationFn: (id: string) => distributionService.distribute(id) });

    const invalidate = async (id?: string) => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['materials', 'distributions'] }),
            queryClient.invalidateQueries({ queryKey: ['materials', 'inventory'] }),
            queryClient.invalidateQueries({ queryKey: ['materials', 'supply-requests'] }),
            id ? queryClient.invalidateQueries({ queryKey: ['materials', 'distribution', id] }) : Promise.resolve(),
        ]);
    };

    const handleDistribute = async (dist: Distribution) => {
        try {
            setDistributingId(dist.id);
            await distributeMutation.mutateAsync(dist.id);
            await invalidate(dist.id);
            notification.success({ message: 'Xuất kho thành công! Tồn kho CS1 đã cập nhật.' });
            setSelectedId(null);
        } catch (e) {
            message.error(resolveErr(e, 'Không thể xác nhận xuất kho.'));
        } finally {
            setDistributingId(null);
        }
    };

    const handleConfirm = async (dist: Distribution) => {
        if (dist.status !== 'distributed') {
            message.error('Phiếu chưa được xuất kho, không thể xác nhận nhận hàng');
            return;
        }
        try {
            setConfirmingId(dist.id);
            await confirmMutation.mutateAsync(dist.id);
            await invalidate(dist.id);
            notification.success({ message: 'Xác nhận nhận hàng thành công!' });
            setSelectedId(null);
        } catch (e) {
            message.error(resolveErr(e, 'Không thể xác nhận nhận vật tư.'));
        } finally {
            setConfirmingId(null);
        }
    };

    const handleExport = async (id: string, code: string) => {
        try {
            setExportingId(id);
            await distributionService.exportXlsx(id, code);
        } catch {
            message.error('Không thể xuất Excel.');
        } finally {
            setExportingId(null);
        }
    };

    const resetFilters = () => {
        setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
        setDraft({ search: '', toPlantId: undefined, status: undefined, dateRange: null });
        setFilters({ search: '', toPlantId: undefined, status: undefined });
    };

    const userPlantId = user?.plantId || (user as any)?.plant?.id;
    const canConfirm =
        detail?.status === 'distributed' &&
        Boolean(userPlantId) &&
        detail.toPlantId === userPlantId;


    // ── Table columns ─────────────────────────────────────────────────────────
    const columns: TableColumnsType<Distribution> = [
        {
            title: 'MÃ PHIẾU',
            dataIndex: 'distributionCode',
            key: 'code',
            width: 155,
            render: (v?: string) => (
                <span className='inline-flex items-center rounded border border-blue-100 bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700'>
                    {v || '-'}
                </span>
            ),
        },
        {
            title: 'MÃ ĐỀ XUẤT',
            key: 'srCode',
            width: 145,
            render: (_v, r) => {
                const sr = r.supplyRequest;
                return sr?.requestCode ? (
                    <span className='font-mono text-xs text-slate-600'>{sr.requestCode}</span>
                ) : (
                    <span className='text-slate-400'>-</span>
                );
            },
        },
        {
            title: 'ĐẾN CƠ SỞ',
            key: 'toPlant',
            render: (_v, r) => (
                <div className='flex flex-col gap-0.5'>
                    <span className='font-semibold text-slate-800'>{r.toPlant?.name || '-'}</span>
                    <span className='text-xs text-slate-500'>{r.toPlant?.code || r.toPlantId}</span>
                </div>
            ),
        },
        {
            title: 'TỔNG TIỀN',
            key: 'totalWithVat',
            width: 130,
            align: 'right',
            render: (_v, r) => {
                const total = r.items.reduce((s, i) => s + (i.totalWithVat ?? 0), 0);
                return <span className='font-semibold text-slate-700'>{total > 0 ? fmt(total) : '-'}</span>;
            },
        },
        {
            title: 'NGÀY CẤP PHÁT',
            key: 'distributedAt',
            width: 145,
            render: (_v, r) => <span className='text-slate-600'>{fmtDt(r.distributedAt || r.createdAt)}</span>,
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'status',
            key: 'status',
            width: 175,
            render: (s: DistributionStatus) => {
                const m = STATUS_META[s] ?? { color: 'default', label: s, icon: null };
                return (
                    <Tag color={m.color} icon={m.icon}>
                        {m.label}
                    </Tag>
                );
            },
        },
        {
            title: '',
            key: 'action',
            width: 56,
            align: 'right',
            render: (_v, r) => (
                <Tooltip title='Xem chi tiết'>
                    <Button
                        type='text'
                        icon={<EyeOutlined />}
                        className='flex h-8 w-8 items-center justify-center rounded-md bg-sky-50 text-sky-600 hover:bg-sky-100'
                        onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); }}
                    />
                </Tooltip>
            ),
        },
    ];

    const detailColumns: TableColumnsType<Distribution['items'][number]> = [
        {
            title: 'STT', key: 'stt', width: 52, align: 'center',
            render: (_v, _r, i) => <span className='text-slate-500'>{i + 1}</span>,
        },
        {
            title: 'TÊN VT', key: 'name',
            render: (_v, r) => (
                <div className='flex flex-col gap-0.5'>
                    <span className='font-semibold text-slate-800'>{r.material?.name || r.materialName || '-'}</span>
                    {r.adjustReason && (
                        <Tag color='warning' style={{ fontSize: 11, width: 'fit-content' }}>⚠ {r.adjustReason}</Tag>
                    )}
                </div>
            ),
        },
        { title: 'ĐVT', dataIndex: 'unit', key: 'unit', width: 70 },
        {
            title: 'SL ĐỀ XUẤT', dataIndex: 'quantityRequested', key: 'qtyR', width: 100, align: 'right',
            render: (v?: number) => <span className='text-slate-500'>{v != null ? fmt(v) : '-'}</span>,
        },
        {
            title: 'SL CẤP', dataIndex: 'quantity', key: 'qty', width: 90, align: 'right',
            render: (v?: number) => <span className='font-semibold text-slate-800'>{fmt(v)}</span>,
        },
        {
            title: 'ĐƠN GIÁ', dataIndex: 'unitPrice', key: 'price', width: 110, align: 'right',
            render: (v?: number) => v != null ? fmt(v) : '-',
        },
        {
            title: 'THÀNH TIỀN', dataIndex: 'totalPrice', key: 'totalPrice', width: 120, align: 'right',
            render: (v?: number) => v != null ? fmt(v) : '-',
        },
        {
            title: 'VAT%', dataIndex: 'vatRate', key: 'vat', width: 70, align: 'right',
            render: (v?: number) => v != null ? `${v}%` : '-',
        },
        {
            title: 'GIÁ VAT', dataIndex: 'vatAmount', key: 'vatAmt', width: 110, align: 'right',
            render: (v?: number) => v != null ? fmt(v) : '-',
        },
        {
            title: 'TỔNG TIỀN', dataIndex: 'totalWithVat', key: 'totalWithVat', width: 120, align: 'right',
            render: (v?: number) => (
                <span className='font-bold text-slate-900'>{v != null ? fmt(v) : '-'}</span>
            ),
        },
        {
            title: 'GHI CHÚ', dataIndex: 'note', key: 'note',
            render: (v?: string) => v || '-',
        },
    ];


    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className='flex flex-col gap-6'>
            <style>{PAGE_ANIM}</style>

            <div className='mdp-h'>
                <PageHeader
                    title='Cấp phát vật tư'
                    subtitle='Theo dõi phiếu cấp phát từ đề xuất vật tư, kiểm soát xuất kho và xác nhận nhận hàng.'
                />
            </div>

            {/* Stats */}
            <div className='mdp-s flex flex-wrap gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200'>
                {[
                    { label: 'Tổng phiếu', value: listRes?.total ?? 0, accent: 'oklch(0.18 0.012 250)' },
                    { label: 'Chờ xuất kho', value: 0, accent: 'oklch(0.64 0.16 72)' },
                    { label: 'Đã xuất — chờ nhận', value: 0, accent: 'oklch(0.48 0.15 250)' },
                    { label: 'Hoàn thành', value: 0, accent: 'oklch(0.58 0.15 160)' },
                ].map(({ label, value, accent }) => (
                    <div key={label} className='flex min-w-[150px] flex-1 flex-col gap-0.5 bg-white px-5 py-4'>
                        <span className='text-[11px] font-medium text-slate-400'>{label}</span>
                        <span className='text-base font-bold' style={{ color: accent }}>{fmt(value)}</span>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className='mdp-f rounded-xl border border-slate-200 bg-white shadow-sm'>
                <div className='flex flex-col gap-3 border-b border-slate-100 px-4 py-4 lg:flex-row lg:items-center lg:justify-between'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <Select
                            showSearch allowClear placeholder='Cơ sở nhận' className='min-w-[200px]'
                            value={draft.toPlantId}
                            onChange={(v) => {
                                setDraft((d) => ({ ...d, toPlantId: v }));
                                setPagination((p) => ({ ...p, page: DEFAULT_PAGE }));
                                setFilters((f) => ({ ...f, toPlantId: v }));
                            }}
                            options={(plants as Plant[]).map((p) => ({ value: p.id, label: p.name }))}
                            optionFilterProp='label'
                        />
                        <Select
                            allowClear placeholder='Trạng thái' className='min-w-[180px]'
                            value={draft.status}
                            onChange={(v) => {
                                setDraft((d) => ({ ...d, status: v }));
                                setPagination((p) => ({ ...p, page: DEFAULT_PAGE }));
                                setFilters((f) => ({ ...f, status: v }));
                            }}
                            options={STATUS_OPTIONS}
                        />
                        <RangePicker
                            className='min-w-[240px]' format='DD/MM/YYYY'
                            value={draft.dateRange}
                            onChange={(v) => {
                                const range = v && v[0] && v[1] ? [v[0], v[1]] as DateRangeValue : null;
                                setDraft((d) => ({ ...d, dateRange: range }));
                                setPagination((p) => ({ ...p, page: DEFAULT_PAGE }));
                                setFilters((f) => ({
                                    ...f,
                                    startDate: range ? range[0].startOf('day').format('YYYY-MM-DD') : undefined,
                                    endDate: range ? range[1].endOf('day').format('YYYY-MM-DD') : undefined,
                                }));
                            }}
                        />
                        <Input
                            allowClear prefix={<SearchOutlined className='text-slate-400' />}
                            placeholder='Tìm mã phiếu, mã đề xuất...' className='min-w-[220px] rounded-lg'
                            value={draft.search}
                            onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
                        />
                        <Button icon={<ReloadOutlined />} onClick={resetFilters} className='text-slate-500'>
                            Làm mới
                        </Button>
                    </div>

                    {isCS1Manager && (
                        <Space>
                            <Button
                                icon={<ThunderboltOutlined />}
                                onClick={() => setExpressOpen(true)}
                                className='rounded-lg border-orange-400 text-orange-500 hover:!border-orange-500 hover:!text-orange-600'
                            >
                                Xuất thẳng khẩn cấp
                            </Button>
                            <Button
                                type='primary' icon={<PlusOutlined />}
                                onClick={() => setCreateOpen(true)}
                                className='rounded-lg bg-blue-600 hover:!bg-blue-700'
                            >
                                Tạo phiếu cấp phát
                            </Button>
                        </Space>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className='mdp-t overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                <div className='[&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-blue-50/30 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400'>
                    <Table<Distribution>
                        rowKey='id'
                        columns={columns}
                        dataSource={distributions}
                        loading={isLoading || isFetching}
                        size='small'
                        scroll={{ x: 900 }}
                        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có phiếu cấp phát' /> }}
                        pagination={{
                            current: listRes?.page ?? pagination.page,
                            total: listRes?.total ?? 0,
                            pageSize: listRes?.limit ?? pagination.limit,
                            showSizeChanger: true,
                            showTotal: (total, range) => (
                                <span className='text-sm text-slate-400'>
                                    {total > 0 ? `${range[0]}-${range[1]} / ${total} phiếu` : 'Không có kết quả'}
                                </span>
                            ),
                            onChange: (page, pageSize) => setPagination({ page, limit: pageSize }),
                            className: '!m-0 border-t border-slate-100 !px-5 !py-3',
                        }}
                    />
                </div>
            </div>


            {/* Create modal — SR-only flow via SupplyDistributionModal */}
            {isCS1Manager && (
                <CreateFromSRDrawer
                    open={createOpen}
                    approvedSRs={approvedSRs}
                    prefillSRId={prefillSRId}
                    onClose={() => setCreateOpen(false)}
                    onSuccess={() => {
                        setCreateOpen(false);
                        invalidate();
                    }}
                />
            )}

            {/* Express Dispatch Modal */}
            {isCS1Manager && (
                <ExpressDispatchModal
                    open={expressOpen}
                    onClose={() => setExpressOpen(false)}
                    onSuccess={() => { setExpressOpen(false); invalidate(); }}
                />
            )}

            {/* Detail Drawer */}
            <Drawer
                title={
                    detail ? (
                        <div className='flex flex-wrap items-center gap-3'>
                            <span className='font-semibold text-slate-900'>
                                {detail.distributionCode || 'Chi tiết phiếu cấp phát'}
                            </span>
                            <Tag color={STATUS_META[detail.status]?.color ?? 'default'} icon={STATUS_META[detail.status]?.icon}>
                                {STATUS_META[detail.status]?.label ?? detail.status}
                            </Tag>
                        </div>
                    ) : 'Chi tiết phiếu cấp phát'
                }
                width={1020}
                open={Boolean(selectedId)}
                onClose={() => setSelectedId(null)}
                destroyOnHidden
                footer={
                    detail ? (
                        <div className='flex flex-wrap items-center justify-between gap-3'>
                            <Text className='text-sm text-slate-500'>
                                {detail.items.length} vật tư •{' '}
                                Tổng: <strong>{fmt(detail.items.reduce((s, i) => s + (i.totalWithVat ?? 0), 0))}</strong>
                            </Text>
                            <div className='flex flex-wrap gap-2'>
                                {/* Xuất kho: pending + CS1Manager */}
                                {detail.status === 'pending' && isCS1Manager && (
                                    <ConfirmAction
                                        intent='primary'
                                        title='Xác nhận xuất kho?'
                                        description='Tồn kho CS1 sẽ bị trừ ngay lập tức và không thể hoàn tác.'
                                        okLabel='Xác nhận xuất kho'
                                        onConfirm={() => handleDistribute(detail)}
                                    >
                                        <Button
                                            type='primary'
                                            icon={<CheckCircleOutlined />}
                                            loading={distributingId === detail.id}
                                            disabled={distributingId === detail.id}
                                            className='rounded-lg bg-green-600 hover:!bg-green-700'
                                        >
                                            Xác nhận xuất kho
                                        </Button>
                                    </ConfirmAction>
                                )}
                                {/* Xác nhận đã nhận: distributed + CS nhận */}
                                {canConfirm && (
                                    <ConfirmAction
                                        intent='primary'
                                        title='Xác nhận đã nhận vật tư'
                                        description='Xác nhận đã nhận đủ vật tư theo phiếu?'
                                        okLabel='Xác nhận đã nhận'
                                        onConfirm={() => handleConfirm(detail)}
                                    >
                                        <Button
                                            type='primary'
                                            icon={<CheckCircleOutlined />}
                                            loading={confirmingId === detail.id}
                                            disabled={confirmingId === detail.id}
                                            className='rounded-lg bg-blue-600 hover:!bg-blue-700'
                                        >
                                            Xác nhận đã nhận
                                        </Button>
                                    </ConfirmAction>
                                )}
                                {/* Xuất Excel: CS1Manager, chỉ khi distributed hoặc confirmed */}
                                {isCS1Manager && (detail.status === 'distributed' || detail.status === 'confirmed') && (
                                    <Button
                                        icon={<DownloadOutlined />}
                                        loading={exportingId === detail.id}
                                        onClick={() => handleExport(detail.id, detail.distributionCode || detail.id)}
                                    >
                                        Xuất Excel
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : undefined
                }
            >
                {detailLoading ? (
                    <div className='py-12 text-center text-sm text-slate-500'>Đang tải...</div>
                ) : detail ? (
                    <div className='flex flex-col gap-6'>
                        {/* Status steps */}
                        <div className='rounded-xl border border-slate-200 bg-white p-4'>
                            <StatusSteps status={detail.status} />
                        </div>

                        {/* Info */}
                        <div className='rounded-xl border border-slate-200 bg-white p-5'>
                            {/* From → To */}
                            <div className='mb-4 flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center'>
                                <div className='flex flex-1 flex-col gap-1 rounded-lg border border-slate-200 bg-white px-4 py-3'>
                                    <span className='text-[11px] font-medium uppercase tracking-widest text-slate-400'>Từ cơ sở</span>
                                    <span className='font-semibold text-slate-900'>{detail.fromPlant?.name || detail.fromPlantId || '-'}</span>
                                </div>
                                <ArrowRightOutlined className='text-slate-400' />
                                <div className='flex flex-1 flex-col gap-1 rounded-lg border border-slate-200 bg-white px-4 py-3'>
                                    <span className='text-[11px] font-medium uppercase tracking-widest text-slate-400'>Đến cơ sở</span>
                                    <span className='font-semibold text-slate-900'>{detail.toPlant?.name || detail.toPlantId || '-'}</span>
                                </div>
                            </div>

                            {/* SR info */}
                            {detail.supplyRequest && (
                                <div className='mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm'>
                                    <span className='font-medium text-blue-700'>Căn cứ đề xuất: </span>
                                    <span className='font-mono font-semibold text-blue-900'>
                                        {detail.supplyRequest?.requestCode || detail.supplyRequestId}
                                    </span>
                                </div>
                            )}

                            <Descriptions
                                column={{ xs: 1, md: 2 }}
                                size='small'
                                className='[&_.ant-descriptions-item-content]:font-medium [&_.ant-descriptions-item-content]:text-slate-800 [&_.ant-descriptions-item-label]:text-slate-500'
                            >
                                <Descriptions.Item label='Ngày cấp phát'>{fmtDt(detail.distributedAt || detail.createdAt)}</Descriptions.Item>
                                <Descriptions.Item label='Người cấp phát'>{resolveUser(detail.distributedBy)}</Descriptions.Item>
                                <Descriptions.Item label='Ngày xác nhận'>{fmtDt(detail.confirmedAt)}</Descriptions.Item>
                                <Descriptions.Item label='Người xác nhận'>{resolveUser(detail.confirmedBy)}</Descriptions.Item>
                                {detail.note && (
                                    <Descriptions.Item label='Ghi chú' span={2}>{detail.note}</Descriptions.Item>
                                )}
                            </Descriptions>
                        </div>

                        {/* Items table */}
                        <div className='overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                            <div className='border-b border-slate-100 px-5 py-4'>
                                <div className='text-sm font-semibold text-slate-900'>Danh sách vật tư</div>
                                <div className='text-xs text-slate-500'>{detail.items.length} dòng vật tư</div>
                            </div>
                            <div className='[&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-slate-50/80 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400'>
                                <Table<Distribution['items'][number]>
                                    rowKey={(_r, i) => String(i)}
                                    columns={detailColumns}
                                    dataSource={detail.items}
                                    pagination={false}
                                    size='small'
                                    scroll={{ x: 1100 }}
                                    summary={() => {
                                        const tp = detail.items.reduce((s, i) => s + (i.totalPrice ?? 0), 0);
                                        const tv = detail.items.reduce((s, i) => s + (i.vatAmount ?? 0), 0);
                                        const tw = detail.items.reduce((s, i) => s + (i.totalWithVat ?? 0), 0);
                                        if (!tp && !tv && !tw) return null;
                                        return (
                                            <Table.Summary.Row className='bg-slate-50 font-semibold'>
                                                <Table.Summary.Cell index={0} colSpan={6} align='right'>Tổng TT</Table.Summary.Cell>
                                                <Table.Summary.Cell index={1} align='right'>{fmt(tp)}</Table.Summary.Cell>
                                                <Table.Summary.Cell index={2} />
                                                <Table.Summary.Cell index={3} align='right'>{fmt(tv)}</Table.Summary.Cell>
                                                <Table.Summary.Cell index={4} align='right'>
                                                    <span className='font-bold text-slate-900'>{fmt(tw)}</span>
                                                </Table.Summary.Cell>
                                                <Table.Summary.Cell index={5} />
                                            </Table.Summary.Row>
                                        );
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <Empty description='Không có dữ liệu' />
                )}
            </Drawer>
        </div>
    );
};

// ── Create from SR Drawer ─────────────────────────────────────────────────────
interface CreateFromSRDrawerProps {
    open: boolean;
    approvedSRs: PurchaseRequest[];
    prefillSRId?: string;
    onClose: () => void;
    onSuccess: () => void;
}

const CreateFromSRDrawer: React.FC<CreateFromSRDrawerProps> = ({
    open, approvedSRs, prefillSRId, onClose, onSuccess,
}) => {
    const [selectedSRId, setSelectedSRId] = useState<string | undefined>(prefillSRId);

    useEffect(() => {
        if (open) setSelectedSRId(prefillSRId);
    }, [open, prefillSRId]);

    const selectedSR = approvedSRs.find((sr) => sr.id === selectedSRId);

    const srOptions = approvedSRs.map((sr) => ({
        value: sr.id,
        label: `${sr.requestCode || sr.id} — ${(sr as any).fromPlant?.name || sr.plantId}`,
    }));

    return (
        <Drawer
            title={
                <div className='flex items-center gap-3'>
                    <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600'>
                        <PlusOutlined />
                    </div>
                    <div>
                        <div className='text-lg font-semibold text-slate-900'>Tạo phiếu cấp phát</div>
                        <div className='text-sm text-slate-500'>Chọn đề xuất đã duyệt để tạo phiếu cấp phát</div>
                    </div>
                </div>
            }
            width={520}
            open={open}
            onClose={onClose}
            destroyOnHidden
            maskClosable={false}
            footer={null}
        >
            <div className='flex flex-col gap-4'>
                <div>
                    <div className='mb-2 text-sm font-medium text-slate-700'>
                        Chọn phiếu đề xuất đã duyệt <span className='text-red-500'>*</span>
                    </div>
                    <Select
                        showSearch
                        className='w-full'
                        placeholder='Tìm mã đề xuất...'
                        optionFilterProp='label'
                        value={selectedSRId}
                        onChange={setSelectedSRId}
                        options={srOptions}
                        notFoundContent='Không có đề xuất đã duyệt'
                    />
                </div>

                {selectedSR && (
                    <div className='rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm'>
                        <div className='grid grid-cols-2 gap-2'>
                            <div>
                                <span className='text-slate-500'>Cơ sở yêu cầu: </span>
                                <span className='font-medium'>{(selectedSR as any).fromPlant?.name || selectedSR.plantId}</span>
                            </div>
                            <div>
                                <span className='text-slate-500'>Số vật tư: </span>
                                <span className='font-medium'>{selectedSR.items.length}</span>
                            </div>
                        </div>
                        {selectedSR.note && (
                            <div className='mt-2 text-slate-500'>Ghi chú: {selectedSR.note}</div>
                        )}
                    </div>
                )}

                {selectedSRId && selectedSR && (selectedSR.fromPlantId || selectedSR.plantId) && (
                    <SupplyDistributionModal
                        open={true}
                        supplyRequestId={selectedSRId}
                        fromPlantId={MAIN_PLANT_ID}
                        toPlantId={selectedSR.fromPlantId || selectedSR.plantId}
                        onClose={onClose}
                        onSuccess={onSuccess}
                    />
                )}

                {!selectedSRId && (
                    <div className='rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400'>
                        Chọn phiếu đề xuất để tiếp tục
                    </div>
                )}
            </div>
        </Drawer>
    );
};

export default DistributionPage;
