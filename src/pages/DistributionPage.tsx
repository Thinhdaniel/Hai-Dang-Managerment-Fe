import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    App,
    Button,
    DatePicker,
    Descriptions,
    Drawer,
    Empty,
    Grid,
    Input,
    InputNumber,
    Modal,
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
    EditOutlined,
    EyeOutlined,
    FilterOutlined,
    PlusOutlined,
    ReloadOutlined,
    RightOutlined,
    SearchOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';

const { useBreakpoint } = Grid;
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import ExpressDispatchModal from '../components/ExpressDispatchModal';
import InternalDistributionModal from '../components/InternalDistributionModal';
import SupplyCompensationModal from '../components/SupplyCompensationModal';
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
    DistributionType,
    PurchaseRequest,
} from '../core/services/material.service';
import { distributionService, supplyRequestService } from '../core/services/material.service';
import { supplyShortageService } from '../core/services/material.service';
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
    distributionType?: DistributionType;
    status?: DistributionStatus;
    startDate?: string;
    endDate?: string;
};

type DraftFilterState = {
    search: string;
    toPlantId?: string;
    distributionType?: DistributionType;
    status?: DistributionStatus;
    dateRange: DateRangeValue | null;
};

// Status display config
const STATUS_META: Record<DistributionStatus, { color: string; label: string; icon: React.ReactNode }> = {
    draft:       { color: 'orange',     label: 'Nháp',                icon: <ClockCircleOutlined /> },
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

const TYPE_OPTIONS: Array<{ value: DistributionType; label: string }> = [
    { value: 'facility_transfer', label: 'Lien co so' },
    { value: 'internal_issue', label: 'Noi bo' },
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

const createFiltersFromSearch = (search: string): { filters: FilterState; draft: DraftFilterState } => {
    const params = new URLSearchParams(search);
    const startDate = params.get('startDate') ?? undefined;
    const endDate = params.get('endDate') ?? undefined;
    const dateRange =
        startDate && endDate && dayjs(startDate).isValid() && dayjs(endDate).isValid()
            ? ([dayjs(startDate), dayjs(endDate)] as DateRangeValue)
            : null;
    const searchValue = params.get('search') ?? '';
    const toPlantId = params.get('toPlantId') ?? params.get('plantId') ?? undefined;
    const distributionType = (params.get('distributionType') as DistributionType) ?? undefined;
    const status = (params.get('status') as DistributionStatus) ?? undefined;

    return {
        filters: {
            search: normalizeSearchTerm(searchValue),
            toPlantId,
            distributionType,
            status,
            startDate,
            endDate,
        },
        draft: {
            search: searchValue,
            toPlantId,
            distributionType,
            status,
            dateRange,
        },
    };
};


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
    const initialFilters = useMemo(() => createFiltersFromSearch(location.search), [location.search]);

    // Pre-fill from SupplyRequest navigate state
    const prefillSRId = locationState.supplyRequestId as string | undefined;

    const isCS1Manager =
        Boolean(user?.plantId) &&
        user!.plantId === MAIN_PLANT_ID &&
        (role === 'admin' || role === 'manager' || role === 'director');

    const [filters, setFilters] = useState<FilterState>(initialFilters.filters);
    const [draft, setDraft] = useState<DraftFilterState>(initialFilters.draft);
    const [pagination, setPagination] = useState({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [internalOpen, setInternalOpen] = useState(false);
    const [expressOpen, setExpressOpen] = useState(false);
    const [compensationOpen, setCompensationOpen] = useState(false);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [distributingId, setDistributingId] = useState<string | null>(null);
    const [exportingId, setExportingId] = useState<string | null>(null);
    const [exportingRange, setExportingRange] = useState(false);
    const [editPriceOpen, setEditPriceOpen] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const screens = useBreakpoint();
    const isMobile = !screens.sm;
    /** Draft đang mở để thêm vật tư */
    const [activeDraft, setActiveDraft] = useState<Distribution | null>(null);

    // Auto-open create modal when navigated from SR page
    useEffect(() => {
        if (prefillSRId && isCS1Manager) setCreateOpen(true);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Search debounce
    useEffect(() => {
        const t = window.setTimeout(() => {
            const s = normalizeSearchTerm(draft.search);
            setPagination((p) => (p.page === DEFAULT_PAGE ? p : { ...p, page: DEFAULT_PAGE }));
            setFilters((f) => (f.search === s ? f : { ...f, search: s }));
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(t);
    }, [draft.search]);

    const listParams = useMemo<DistributionQueryParams>(
        () => ({
            search: filters.search || undefined,
            toPlantId: filters.toPlantId,
            distributionType: filters.distributionType,
            status: filters.status,
            startDate: filters.startDate,
            endDate: filters.endDate,
            page: pagination.page,
            limit: pagination.limit,
        }),
        [
            filters.distributionType,
            filters.endDate,
            filters.search,
            filters.startDate,
            filters.status,
            filters.toPlantId,
            pagination.limit,
            pagination.page,
        ]
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

    const { data: shortageRes } = useQuery({
        queryKey: ['materials', 'supply-shortages', detail?.supplyRequestId],
        queryFn: () =>
            supplyShortageService
                .getAll({ originalSupplyRequestId: detail!.supplyRequestId, limit: 100 })
                .then((res) => (Array.isArray(res) ? res : res.data ?? [])),
        enabled: Boolean(detail?.supplyRequestId),
    });
    const openShortages = (shortageRes ?? []).filter((item: any) =>
        ['outstanding', 'partially_settled'].includes(String(item.status)) && Number(item.quantityOutstanding ?? 0) > 0
    );

    // Fetch approved SRs for create selector
    const { data: approvedSRs = [] } = useQuery({
        queryKey: ['materials', 'supply-requests', 'approved'],
        queryFn: () =>
            supplyRequestService
                .getAll({ status: 'approved', limit: 100 })
                .then((r) => (Array.isArray(r) ? r : (r as PaginatedResponse<PurchaseRequest>).data)),
        enabled: createOpen && isCS1Manager,
    });

    // Phiếu nội bộ đang draft (hôm nay)
    const { data: draftInternals = [] } = useQuery({
        queryKey: ['materials', 'distributions', 'draft-internal'],
        queryFn: () =>
            distributionService.getAll({
                distributionType: 'internal_issue',
                status: 'draft' as any,
                startDate: dayjs().startOf('day').toISOString(),
                endDate: dayjs().endOf('day').toISOString(),
                limit: 50,
            }).then((r) => (Array.isArray(r) ? r : (r as PaginatedResponse<Distribution>).data ?? [])),
        enabled: isCS1Manager,
        staleTime: 30_000,
    });

    const distributions = listRes?.data ?? [];

    // ── Mutations ─────────────────────────────────────────────────────────────
    const confirmMutation = useMutation({ mutationFn: (id: string) => distributionService.confirm(id) });
    const distributeMutation = useMutation({ mutationFn: (id: string) => distributionService.distribute(id) });
    const updateMutation = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => distributionService.update(id, data) });

    const invalidate = async (id?: string) => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['materials', 'distributions'] }),
            queryClient.invalidateQueries({ queryKey: ['materials', 'inventory'] }),
            queryClient.invalidateQueries({ queryKey: ['materials', 'supply-requests'] }),
            queryClient.invalidateQueries({ queryKey: ['materials', 'supply-shortages'] }),
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

    const handleExportRange = async () => {
        try {
            setExportingRange(true);
            const params: Record<string, string | undefined> = {
                startDate: filters.startDate,
                endDate: filters.endDate,
                toPlantId: filters.toPlantId,
                distributionType: filters.distributionType,
                status: filters.status,
                search: filters.search || undefined,
            };
            const label = filters.startDate && filters.endDate
                ? `${filters.startDate}_den_${filters.endDate}`
                : 'tat-ca';
            await distributionService.exportRangeXlsx(params, `cap-phat-${label}.xlsx`);
        } catch {
            message.error('Không thể xuất Excel.');
        } finally {
            setExportingRange(false);
        }
    };

    const resetFilters = () => {
        setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
        setDraft({ search: '', toPlantId: undefined, distributionType: undefined, status: undefined, dateRange: null });
        setFilters({ search: '', toPlantId: undefined, distributionType: undefined, status: undefined });
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
            title: 'LOAI',
            key: 'distributionType',
            width: 120,
            render: (_v, r) => (
                <Tag color={r.distributionType === 'internal_issue' ? 'green' : 'blue'}>
                    {r.distributionType === 'internal_issue' ? 'Noi bo' : 'Lien co so'}
                </Tag>
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
            title: 'SL THIẾU', dataIndex: 'quantityShortage', key: 'qtyShortage', width: 95, align: 'right',
            render: (v?: number) => v ? <span className='font-semibold text-orange-600'>{fmt(v)}</span> : <span className='text-slate-400'>-</span>,
        },
        {
            title: 'TÌNH TRẠNG', dataIndex: 'fulfillmentStatus', key: 'fulfillmentStatus', width: 120,
            render: (value?: string) => {
                if (value === 'not_supplied') return <Tag color='red'>Không cấp</Tag>;
                if (value === 'partial') return <Tag color='orange'>Cấp thiếu</Tag>;
                return <Tag color='green'>Đủ</Tag>;
            },
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
            <div className='mdp-s grid grid-cols-2 gap-2 sm:flex sm:gap-0 sm:overflow-hidden sm:rounded-xl sm:border sm:border-slate-200 sm:bg-slate-200'>
                {[
                    { label: 'Tổng phiếu',          value: listRes?.total ?? 0, accent: '#1A3A5C' },
                    { label: 'Chờ xuất kho',         value: 0,                  accent: '#FA8C16' },
                    { label: 'Đã xuất — chờ nhận',   value: 0,                  accent: '#1677ff' },
                    { label: 'Hoàn thành',            value: 0,                  accent: '#16a34a' },
                ].map(({ label, value, accent }) => (
                    <div key={label} className='flex flex-col gap-0.5 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:min-w-[150px] sm:flex-1 sm:rounded-none sm:border-0'>
                        <span className='text-[10px] font-semibold uppercase tracking-wide text-slate-400'>{label}</span>
                        <span className='text-xl font-bold sm:text-base' style={{ color: accent }}>{fmt(value)}</span>
                    </div>
                ))}
            </div>

            {/* Actions + Filters */}
            <div className='mdp-f rounded-xl border border-slate-200 bg-white shadow-sm'>
                {/* Actions row */}
                {isCS1Manager && (
                    <div className='flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 sm:px-5 py-3'>
                        {/* Draft badge — mobile: compact */}
                        {(draftInternals as Distribution[]).length > 0 && (
                            <Select
                                placeholder={
                                    <span className='flex items-center gap-1.5'>
                                        <ClockCircleOutlined className='text-orange-500' />
                                        <span className='font-medium text-orange-600 text-xs sm:text-sm'>
                                            {(draftInternals as Distribution[]).length} nháp hôm nay
                                        </span>
                                    </span>
                                }
                                style={{ minWidth: isMobile ? 160 : 210 }}
                                value={null}
                                onChange={(id) => {
                                    const d = (draftInternals as Distribution[]).find((x) => x.id === id);
                                    if (d) { setActiveDraft(d); setInternalOpen(true); }
                                }}
                                options={(draftInternals as Distribution[]).map((d) => ({
                                    value: d.id,
                                    label: (
                                        <span className='flex items-center gap-2'>
                                            <span className='font-mono text-xs font-semibold'>{d.distributionCode}</span>
                                            <span className='text-xs text-slate-400'>{d.targetDepartment || d.requesterName} · {d.items?.length ?? 0} dòng</span>
                                        </span>
                                    ),
                                }))}
                            />
                        )}
                        <div className='flex flex-wrap items-center gap-2 ml-auto'>
                            {isMobile ? (
                                /* Mobile: icon-only buttons */
                                <>
                                    <Tooltip title='Cấp phát nội bộ'>
                                        <Button icon={<PlusOutlined />} onClick={() => setInternalOpen(true)}
                                            className='border-emerald-500 text-emerald-600' />
                                    </Tooltip>
                                    <Tooltip title='Xuất thẳng khẩn cấp'>
                                        <Button icon={<ThunderboltOutlined />} onClick={() => setExpressOpen(true)}
                                            className='border-orange-400 text-orange-500' />
                                    </Tooltip>
                                    <Button type='primary' icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}
                                        className='bg-blue-600 hover:!bg-blue-700'>
                                        Tạo phiếu
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button icon={<PlusOutlined />} onClick={() => setInternalOpen(true)}
                                        className='border-emerald-500 text-emerald-600 hover:!border-emerald-600 hover:!text-emerald-700'>
                                        Cấp phát nội bộ
                                    </Button>
                                    <Button icon={<ThunderboltOutlined />} onClick={() => setExpressOpen(true)}
                                        className='border-orange-400 text-orange-500 hover:!border-orange-500 hover:!text-orange-600'>
                                        Xuất thẳng khẩn cấp
                                    </Button>
                                    <Button type='primary' icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}
                                        className='bg-blue-600 hover:!bg-blue-700'>
                                        Tạo phiếu cấp phát
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Filter row */}
                <div className='px-3 sm:px-5 py-3'>
                    {/* Mobile */}
                    <div className='flex gap-2 sm:hidden'>
                        <Input allowClear prefix={<SearchOutlined className='text-slate-400' />}
                            placeholder='Tìm mã phiếu...' className='flex-1'
                            value={draft.search} onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))} />
                        <Button icon={<FilterOutlined />}
                            type={(draft.toPlantId || draft.distributionType || draft.status || draft.dateRange) ? 'primary' : 'default'}
                            ghost={!!(draft.toPlantId || draft.distributionType || draft.status || draft.dateRange)}
                            onClick={() => setFilterOpen((v) => !v)} />
                        <Button icon={<DownloadOutlined />} loading={exportingRange} onClick={handleExportRange} />
                    </div>
                    {filterOpen && (
                        <div className='mt-2 flex flex-col gap-2 sm:hidden'>
                            <Select showSearch optionFilterProp='label' allowClear placeholder='Cơ sở nhận' className='w-full'
                                value={draft.toPlantId}
                                onChange={(v) => { setDraft((d) => ({ ...d, toPlantId: v })); setPagination((p) => ({ ...p, page: DEFAULT_PAGE })); setFilters((f) => ({ ...f, toPlantId: v })); }}
                                options={(plants as Plant[]).map((p) => ({ value: p.id, label: p.name }))} />
                            <Select allowClear placeholder='Loại phiếu' className='w-full'
                                value={draft.distributionType}
                                onChange={(v) => { setDraft((d) => ({ ...d, distributionType: v })); setPagination((p) => ({ ...p, page: DEFAULT_PAGE })); setFilters((f) => ({ ...f, distributionType: v })); }}
                                options={TYPE_OPTIONS} />
                            <Select allowClear placeholder='Trạng thái' className='w-full'
                                value={draft.status}
                                onChange={(v) => { setDraft((d) => ({ ...d, status: v })); setPagination((p) => ({ ...p, page: DEFAULT_PAGE })); setFilters((f) => ({ ...f, status: v })); }}
                                options={STATUS_OPTIONS} />
                            <RangePicker format='DD/MM/YYYY' className='w-full' inputReadOnly
                                value={draft.dateRange}
                                onChange={(v) => {
                                    const range = v && v[0] && v[1] ? [v[0], v[1]] as DateRangeValue : null;
                                    setDraft((d) => ({ ...d, dateRange: range }));
                                    setPagination((p) => ({ ...p, page: DEFAULT_PAGE }));
                                    setFilters((f) => ({ ...f, startDate: range ? range[0].startOf('day').format('YYYY-MM-DD') : undefined, endDate: range ? range[1].endOf('day').format('YYYY-MM-DD') : undefined }));
                                }} />
                        </div>
                    )}
                    {/* Desktop */}
                    <div className='hidden sm:flex flex-wrap items-center gap-2'>
                        <Input allowClear prefix={<SearchOutlined className='text-slate-400' />}
                            placeholder='Tìm mã phiếu, mã đề xuất...' style={{ width: 220 }}
                            value={draft.search} onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))} />
                        <Select showSearch optionFilterProp='label' allowClear placeholder='Cơ sở nhận' style={{ width: 180 }}
                            value={draft.toPlantId}
                            onChange={(v) => { setDraft((d) => ({ ...d, toPlantId: v })); setPagination((p) => ({ ...p, page: DEFAULT_PAGE })); setFilters((f) => ({ ...f, toPlantId: v })); }}
                            options={(plants as Plant[]).map((p) => ({ value: p.id, label: p.name }))} />
                        <Select allowClear placeholder='Loại phiếu' style={{ width: 150 }}
                            value={draft.distributionType}
                            onChange={(v) => { setDraft((d) => ({ ...d, distributionType: v })); setPagination((p) => ({ ...p, page: DEFAULT_PAGE })); setFilters((f) => ({ ...f, distributionType: v })); }}
                            options={TYPE_OPTIONS} />
                        <Select allowClear placeholder='Trạng thái' style={{ width: 170 }}
                            value={draft.status}
                            onChange={(v) => { setDraft((d) => ({ ...d, status: v })); setPagination((p) => ({ ...p, page: DEFAULT_PAGE })); setFilters((f) => ({ ...f, status: v })); }}
                            options={STATUS_OPTIONS} />
                        <RangePicker format='DD/MM/YYYY' style={{ width: 230 }} value={draft.dateRange}
                            onChange={(v) => {
                                const range = v && v[0] && v[1] ? [v[0], v[1]] as DateRangeValue : null;
                                setDraft((d) => ({ ...d, dateRange: range }));
                                setPagination((p) => ({ ...p, page: DEFAULT_PAGE }));
                                setFilters((f) => ({ ...f, startDate: range ? range[0].startOf('day').format('YYYY-MM-DD') : undefined, endDate: range ? range[1].endOf('day').format('YYYY-MM-DD') : undefined }));
                            }} />
                        <Button icon={<ReloadOutlined />} onClick={resetFilters} className='text-slate-500'>Làm mới</Button>
                        <Button icon={<DownloadOutlined />} loading={exportingRange} onClick={handleExportRange} type='primary' ghost>Xuất Excel</Button>
                    </div>
                </div>
            </div>

            {/* Table / Card list */}
            <div className='mdp-t overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                {isMobile ? (
                    <div className='divide-y divide-slate-100'>
                        {(isLoading || isFetching) && distributions.length === 0 ? (
                            <div className='py-16 text-center text-sm text-slate-400'>Đang tải...</div>
                        ) : distributions.length === 0 ? (
                            <div className='py-16'><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có phiếu cấp phát' /></div>
                        ) : distributions.map((r) => {
                            const meta = STATUS_META[r.status];
                            const total = r.items.reduce((s, i) => s + (i.totalWithVat ?? 0), 0);
                            return (
                                <div key={r.id} onClick={() => setSelectedId(r.id)}
                                    className='flex items-center gap-3 px-4 py-3.5 active:bg-slate-50 cursor-pointer transition-colors'>
                                    <div className='shrink-0 w-2 h-2 rounded-full mt-0.5'
                                        style={{ backgroundColor: ({ orange: '#FA8C16', default: '#94a3b8', processing: '#1677ff', blue: '#1677ff', green: '#16a34a' } as any)[meta?.color] ?? '#94a3b8' }} />
                                    <div className='flex-1 min-w-0'>
                                        <div className='flex items-center justify-between gap-2 mb-0.5'>
                                            <span className='font-mono text-xs font-bold text-blue-700 truncate'>{r.distributionCode || '—'}</span>
                                            {meta && <Tag color={meta.color} icon={meta.icon} style={{ margin: 0 }}>{meta.label}</Tag>}
                                        </div>
                                        <div className='text-sm font-medium text-slate-700 truncate'>
                                            {r.distributionType === 'internal_issue' ? 'Nội bộ' : (r.toPlant?.name || r.toPlantId || '—')}
                                        </div>
                                        <div className='flex items-center gap-2 mt-0.5 text-xs text-slate-400'>
                                            <span>{dayjs(r.distributedAt || r.createdAt).format('DD/MM/YYYY')}</span>
                                            <span>·</span>
                                            <span>{r.items.length} vật tư</span>
                                            {total > 0 && <><span>·</span><span className='font-semibold text-slate-600'>{fmt(total)}</span></>}
                                        </div>
                                    </div>
                                    <RightOutlined className='shrink-0 text-slate-300 text-xs' />
                                </div>
                            );
                        })}
                        {(listRes?.total ?? 0) > 0 && (
                            <div className='flex items-center justify-between px-4 py-3 bg-slate-50'>
                                <Button size='small' disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}>← Trước</Button>
                                <span className='text-xs text-slate-400'>{pagination.page} / {Math.max(1, Math.ceil((listRes?.total ?? 0) / pagination.limit))} · {listRes?.total ?? 0} phiếu</span>
                                <Button size='small' disabled={pagination.page >= Math.ceil((listRes?.total ?? 0) / pagination.limit)} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}>Sau →</Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className='[&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-blue-50/30 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400'>
                        <Table<Distribution>
                            rowKey='id' columns={columns} dataSource={distributions}
                            loading={isLoading || isFetching} size='small' scroll={{ x: 900 }}
                            onRow={(record) => ({ onClick: () => setSelectedId(record.id), style: { cursor: 'pointer' } })}
                            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có phiếu cấp phát' /> }}
                            pagination={{
                                current: listRes?.page ?? pagination.page, total: listRes?.total ?? 0,
                                pageSize: listRes?.limit ?? pagination.limit, showSizeChanger: true,
                                showTotal: (total, range) => <span className='text-sm text-slate-400'>{total > 0 ? `${range[0]}-${range[1]} / ${total} phiếu` : 'Không có kết quả'}</span>,
                                onChange: (page, pageSize) => setPagination({ page, limit: pageSize }),
                                className: '!m-0 border-t border-slate-100 !px-5 !py-3',
                            }}
                        />
                    </div>
                )}
            </div>


            {/* Create modal — SR-only flow via SupplyDistributionModal */}
            {isCS1Manager && (
                <InternalDistributionModal
                    open={internalOpen}
                    plantId={MAIN_PLANT_ID}
                    existingDraft={activeDraft}
                    onClose={() => { setInternalOpen(false); setActiveDraft(null); }}
                    onSuccess={(distribution) => {
                        setInternalOpen(false);
                        setActiveDraft(null);
                        setSelectedId(distribution.id);
                        invalidate(distribution.id);
                        queryClient.invalidateQueries({ queryKey: ['materials', 'distributions', 'draft-internal'] });
                    }}
                />
            )}

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

            {isCS1Manager && (
                <SupplyCompensationModal
                    open={compensationOpen}
                    shortages={openShortages as any}
                    onClose={() => setCompensationOpen(false)}
                    onSuccess={() => { setCompensationOpen(false); invalidate(detail?.id); }}
                />
            )}

            {/* Detail Drawer */}
            <Drawer
                title={
                    detail ? (
                        <div className='flex items-center gap-2'>
                            <span className='font-semibold text-slate-900 text-sm sm:text-base'>{detail.distributionCode || 'Chi tiết'}</span>
                            <Tag color={STATUS_META[detail.status]?.color ?? 'default'} icon={STATUS_META[detail.status]?.icon} style={{ margin: 0 }}>
                                {STATUS_META[detail.status]?.label ?? detail.status}
                            </Tag>
                        </div>
                    ) : 'Chi tiết phiếu cấp phát'
                }
                placement={isMobile ? 'bottom' : 'right'}
                size={isMobile ? '92%' : 1020}
                open={Boolean(selectedId)}
                onClose={() => setSelectedId(null)}
                destroyOnHidden
                styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }, header: { padding: isMobile ? '12px 16px' : undefined } }}
                footer={detail ? (
                    <div className={`flex gap-2 ${isMobile ? 'flex-col' : 'flex-wrap items-center justify-between'}`}>
                        {!isMobile && <Text className='text-sm text-slate-500'>{detail.items.length} vật tư · Tổng: <strong>{fmt(detail.items.reduce((s, i) => s + (i.totalWithVat ?? 0), 0))}</strong></Text>}
                        <div className={`flex gap-2 ${isMobile ? 'flex-col' : 'flex-wrap'}`}>
                            {isCS1Manager && <Button icon={<EditOutlined />} onClick={() => setEditPriceOpen(true)} block={isMobile}>Cập nhật giá</Button>}
                            {detail.status === 'draft' && detail.distributionType === 'internal_issue' && isCS1Manager && (
                                <>
                                    <Button icon={<PlusOutlined />} block={isMobile} onClick={() => { setActiveDraft(detail); setSelectedId(null); setInternalOpen(true); }}>Thêm vật tư</Button>
                                    <Button type='primary' icon={<CheckCircleOutlined />} block={isMobile} className='bg-emerald-600 hover:!bg-emerald-700'
                                        onClick={() => Modal.confirm({ title: 'Chốt phiếu cấp phát nội bộ?', content: 'Tồn kho sẽ bị trừ ngay lập tức. Không thể hoàn tác.', okText: 'Chốt phiếu', okButtonProps: { className: 'bg-green-600' }, onOk: async () => { await distributionService.finalizeInternalDraft(detail.id); await invalidate(detail.id); queryClient.invalidateQueries({ queryKey: ['materials', 'distributions', 'draft-internal'] }); setSelectedId(null); } })}>
                                        Chốt phiếu — trừ kho
                                    </Button>
                                </>
                            )}
                            {detail.status === 'pending' && isCS1Manager && (
                                <ConfirmAction intent='primary' title='Xác nhận xuất kho?' description='Tồn kho CS1 sẽ bị trừ ngay lập tức và không thể hoàn tác.' okLabel='Xác nhận xuất kho' onConfirm={() => handleDistribute(detail)}>
                                    <Button type='primary' icon={<CheckCircleOutlined />} loading={distributingId === detail.id} block={isMobile} className='bg-green-600 hover:!bg-green-700'>Xác nhận xuất kho</Button>
                                </ConfirmAction>
                            )}
                            {canConfirm && (
                                <ConfirmAction intent='primary' title='Xác nhận đã nhận vật tư' description='Xác nhận đã nhận đủ vật tư theo phiếu?' okLabel='Xác nhận đã nhận' onConfirm={() => handleConfirm(detail)}>
                                    <Button type='primary' icon={<CheckCircleOutlined />} loading={confirmingId === detail.id} block={isMobile} className='bg-blue-600 hover:!bg-blue-700'>Xác nhận đã nhận</Button>
                                </ConfirmAction>
                            )}
                            {isCS1Manager && openShortages.length > 0 && (
                                <Button icon={<PlusOutlined />} block={isMobile} onClick={() => setCompensationOpen(true)}>
                                    Tạo phiếu cấp bù ({openShortages.length})
                                </Button>
                            )}
                            {isCS1Manager && (detail.status === 'distributed' || detail.status === 'confirmed') && (
                                <Button icon={<DownloadOutlined />} loading={exportingId === detail.id} block={isMobile} onClick={() => handleExport(detail.id, detail.distributionCode || detail.id)}>Xuất Excel</Button>
                            )}
                        </div>
                    </div>
                ) : undefined}
            >
                {detailLoading ? (
                    <div className='py-12 text-center text-sm text-slate-500'>Đang tải...</div>
                ) : detail ? (
                    <div className='flex-1 overflow-y-auto'>
                        <div className='flex flex-col gap-4 p-4 sm:p-5'>
                            {/* Status steps */}
                            <div className='rounded-xl border border-slate-200 bg-white p-4'>
                                <StatusSteps status={detail.status} />
                            </div>

                            {/* From → To */}
                            <div className='flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4'>
                                <div className='flex flex-1 flex-col gap-0.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5'>
                                    <span className='text-[10px] font-semibold uppercase tracking-widest text-slate-400'>Từ cơ sở</span>
                                    <span className='font-semibold text-slate-900 text-sm'>{detail.fromPlant?.name || detail.fromPlantId || '-'}</span>
                                </div>
                                <ArrowRightOutlined className='text-slate-400 self-center hidden sm:block' />
                                <div className='flex flex-1 flex-col gap-0.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5'>
                                    <span className='text-[10px] font-semibold uppercase tracking-widest text-slate-400'>
                                        {detail.distributionType === 'internal_issue' ? 'Bộ phận' : 'Đến cơ sở'}
                                    </span>
                                    <span className='font-semibold text-slate-900 text-sm'>
                                        {detail.distributionType === 'internal_issue'
                                            ? (detail.targetDepartment || detail.requesterName || '-')
                                            : (detail.toPlant?.name || detail.toPlantId || '-')}
                                    </span>
                                </div>
                            </div>

                            {/* SR info */}
                            {detail.supplyRequest && (
                                <div className='rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm'>
                                    <span className='font-medium text-blue-700'>Căn cứ đề xuất: </span>
                                    <span className='font-mono font-semibold text-blue-900'>{detail.supplyRequest?.requestCode || detail.supplyRequestId}</span>
                                </div>
                            )}

                            {/* Info rows */}
                            <div className='rounded-xl border border-slate-200 bg-white overflow-hidden'>
                                <div className='border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400'>Thông tin phiếu</div>
                                <div className='divide-y divide-slate-100'>
                                    {[
                                        { label: 'Ngày cấp phát', value: fmtDt(detail.distributedAt || detail.createdAt) },
                                        { label: 'Người cấp phát', value: resolveUser(detail.distributedBy) },
                                        ...(detail.confirmedAt ? [{ label: 'Ngày xác nhận', value: fmtDt(detail.confirmedAt) }] : []),
                                        ...(detail.confirmedBy ? [{ label: 'Người xác nhận', value: resolveUser(detail.confirmedBy) }] : []),
                                        ...(detail.requesterName ? [{ label: 'Người xin cấp', value: detail.requesterName }] : []),
                                        ...(detail.targetDepartment ? [{ label: 'Bộ phận', value: detail.targetDepartment }] : []),
                                        ...(detail.targetLine ? [{ label: 'Chuyền may', value: detail.targetLine }] : []),
                                        ...(detail.note ? [{ label: 'Ghi chú', value: detail.note }] : []),
                                    ].map(({ label, value }) => (
                                        <div key={label} className='flex items-start justify-between gap-3 px-4 py-2.5'>
                                            <span className='text-xs text-slate-400 shrink-0 w-28'>{label}</span>
                                            <span className='text-sm text-slate-800 text-right flex-1'>{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Items */}
                            <div className='rounded-xl border border-slate-200 bg-white overflow-hidden'>
                                <div className='border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400'>
                                    Danh sách vật tư · {detail.items.length} dòng
                                </div>
                                {isMobile ? (
                                    <div className='divide-y divide-slate-100'>
                                        {detail.items.map((item, idx) => (
                                            <div key={idx} className='px-4 py-3'>
                                                <div className='flex items-start justify-between gap-2 mb-1'>
                                                    <span className='text-sm font-semibold text-slate-800 flex-1'>{item.material?.name || item.materialName || '—'}</span>
                                                    <span className='text-xs text-slate-400 shrink-0'>{item.unit || '—'}</span>
                                                </div>
                                                {item.adjustReason && <Tag color='warning' className='mb-1 text-xs'>⚠ {item.adjustReason}</Tag>}
                                                <div className='flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500'>
                                                    {item.quantityRequested != null && <span>Đề xuất: <strong>{fmt(item.quantityRequested)}</strong></span>}
                                                    <span>Cấp: <strong className='text-slate-700'>{fmt(item.quantity)}</strong></span>
                                                    {item.quantityShortage ? <span className='text-orange-600'>Thiếu: <strong>{fmt(item.quantityShortage)}</strong></span> : null}
                                                    {item.unitPrice ? <span>Đơn giá: <strong>{fmt(item.unitPrice)}</strong></span> : null}
                                                    {item.totalWithVat ? <span className='font-bold text-slate-900'>Tổng: {fmt(item.totalWithVat)}</span> : null}
                                                </div>
                                                {item.note && <div className='mt-0.5 text-xs text-slate-400 italic'>{item.note}</div>}
                                            </div>
                                        ))}
                                        <div className='flex items-center justify-between px-4 py-3 bg-slate-50'>
                                            <span className='text-xs font-semibold text-slate-500'>Tổng cộng</span>
                                            <span className='font-bold text-slate-900'>{fmt(detail.items.reduce((s, i) => s + (i.totalWithVat ?? 0), 0))}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className='[&_.ant-table]:!bg-white [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!text-slate-400'>
                                        <Table<Distribution['items'][number]>
                                            rowKey={(_r, i) => String(i)} columns={detailColumns} dataSource={detail.items}
                                            pagination={false} size='small' scroll={{ x: 1100 }}
                                            summary={() => {
                                                const tp = detail.items.reduce((s, i) => s + (i.totalPrice ?? 0), 0);
                                                const tv = detail.items.reduce((s, i) => s + (i.vatAmount ?? 0), 0);
                                                const tw = detail.items.reduce((s, i) => s + (i.totalWithVat ?? 0), 0);
                                                if (!tp && !tv && !tw) return null;
                                                return (
                                                    <Table.Summary.Row className='bg-slate-50 font-semibold'>
                                                        <Table.Summary.Cell index={0} colSpan={8} align='right'>Tổng TT</Table.Summary.Cell>
                                                        <Table.Summary.Cell index={1} align='right'>{fmt(tp)}</Table.Summary.Cell>
                                                        <Table.Summary.Cell index={2} />
                                                        <Table.Summary.Cell index={3} align='right'>{fmt(tv)}</Table.Summary.Cell>
                                                        <Table.Summary.Cell index={4} align='right'><span className='font-bold text-slate-900'>{fmt(tw)}</span></Table.Summary.Cell>
                                                        <Table.Summary.Cell index={5} />
                                                    </Table.Summary.Row>
                                                );
                                            }}
                                        />
                                    </div>
                                )}
                            </div>

                            {openShortages.length > 0 && (
                                <div className='rounded-xl border border-orange-200 bg-orange-50 overflow-hidden'>
                                    <div className='flex items-center justify-between border-b border-orange-100 px-4 py-2.5'>
                                        <span className='text-xs font-semibold uppercase tracking-wider text-orange-700'>
                                            Vật tư còn thiếu cần cấp bù · {openShortages.length} dòng
                                        </span>
                                        {isCS1Manager && (
                                            <Button size='small' icon={<PlusOutlined />} onClick={() => setCompensationOpen(true)}>
                                                Tạo phiếu cấp bù
                                            </Button>
                                        )}
                                    </div>
                                    <div className='divide-y divide-orange-100 bg-white'>
                                        {openShortages.map((shortage: any) => (
                                            <div key={shortage.id} className='grid grid-cols-[1fr_90px_110px_110px] gap-3 px-4 py-2.5 text-sm'>
                                                <span className='font-medium text-slate-800'>{shortage.materialName}</span>
                                                <span className='text-slate-500'>{shortage.unit || '-'}</span>
                                                <span className='text-right text-slate-500'>Thiếu {fmt(shortage.quantityShortage)}</span>
                                                <span className='text-right font-semibold text-orange-600'>Còn {fmt(shortage.quantityOutstanding)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {editPriceOpen && (
                                <EditDistributionPriceModal open={editPriceOpen} distribution={detail}
                                    onClose={() => setEditPriceOpen(false)}
                                    onSuccess={async () => { setEditPriceOpen(false); await invalidate(detail.id); }}
                                    updateMutation={updateMutation} />
                            )}
                        </div>
                    </div>
                ) : <Empty description='Không có dữ liệu' className='py-20' />}
            </Drawer>
        </div>
    );
};

// ── Edit Distribution Price Modal ─────────────────────────────────────────────
type EditItemRow = {
    index: number;
    materialName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    totalPrice: number;
    vatAmount: number;
    totalWithVat: number;
    note: string;
};

const computeEditRow = (r: EditItemRow): EditItemRow => {
    const totalPrice = Number((r.quantity * r.unitPrice).toFixed(2));
    const vatAmount = Number((totalPrice * r.vatRate / 100).toFixed(2));
    return { ...r, totalPrice, vatAmount, totalWithVat: Number((totalPrice + vatAmount).toFixed(2)) };
};

interface EditDistributionPriceModalProps {
    open: boolean;
    distribution: Distribution;
    onClose: () => void;
    onSuccess: () => void;
    updateMutation: ReturnType<typeof useMutation<Distribution, Error, { id: string; data: any }>>;
}

const EditDistributionPriceModal: React.FC<EditDistributionPriceModalProps> = ({
    open, distribution, onClose, onSuccess, updateMutation,
}) => {
    const { message } = App.useApp();
    const screens = useBreakpoint();
    const isMobile = !screens.sm;
    const [rows, setRows] = useState<EditItemRow[]>([]);

    useEffect(() => {
        if (!open) return;
        setRows(
            distribution.items.map((item, idx) =>
                computeEditRow({
                    index: idx,
                    materialName: item.material?.name || item.materialName || '',
                    unit: item.unit || '',
                    quantity: item.quantity,
                    unitPrice: item.unitPrice ?? 0,
                    vatRate: item.vatRate ?? 0,
                    totalPrice: item.totalPrice ?? 0,
                    vatAmount: item.vatAmount ?? 0,
                    totalWithVat: item.totalWithVat ?? 0,
                    note: item.note || '',
                })
            )
        );
    }, [open, distribution]);

    const patch = (index: number, field: keyof EditItemRow, value: any) =>
        setRows((prev) => prev.map((r) => r.index === index ? computeEditRow({ ...r, [field]: value }) : r));

    const totals = {
        price: rows.reduce((s, r) => s + r.totalPrice, 0),
        vat: rows.reduce((s, r) => s + r.vatAmount, 0),
        total: rows.reduce((s, r) => s + r.totalWithVat, 0),
    };

    const handleOk = async () => {
        await updateMutation.mutateAsync({
            id: distribution.id,
            data: {
                items: rows.map((r) => ({ index: r.index, unitPrice: r.unitPrice, vatRate: r.vatRate, note: r.note || undefined })),
            },
        });
        message.success('Cập nhật giá thành công!');
        onSuccess();
    };

    const columns: TableColumnsType<EditItemRow> = [
        { title: 'STT', key: 'stt', width: 46, align: 'center', render: (_v, _r, i) => i + 1 },
        { title: 'Tên vật tư', dataIndex: 'materialName', key: 'name' },
        { title: 'ĐVT', dataIndex: 'unit', key: 'unit', width: 60, align: 'center' },
        { title: 'SL', dataIndex: 'quantity', key: 'qty', width: 70, align: 'right', render: (v) => fmt(v) },
        {
            title: 'Đơn giá', key: 'price', width: 130,
            render: (_v, r) => (
                <InputNumber
                    size='small' min={0} value={r.unitPrice} style={{ width: 120 }}
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(v) => Number(String(v).replace(/,/g, '')) as any}
                    onChange={(v) => patch(r.index, 'unitPrice', v ?? 0)}
                />
            ),
        },
        {
            title: 'VAT%', key: 'vat', width: 80,
            render: (_v, r) => (
                <InputNumber
                    size='small' min={0} max={100} value={r.vatRate} style={{ width: 70 }}
                    formatter={(v) => `${v}%`} parser={(v) => Number(String(v).replace('%', '')) as any}
                    onChange={(v) => patch(r.index, 'vatRate', v ?? 0)}
                />
            ),
        },
        { title: 'Thành tiền', key: 'tp', width: 120, align: 'right', render: (_v, r) => fmt(r.totalPrice) },
        { title: 'Tiền VAT', key: 'va', width: 110, align: 'right', render: (_v, r) => fmt(r.vatAmount) },
        {
            title: 'Tổng tiền', key: 'tw', width: 120, align: 'right',
            render: (_v, r) => <span className='font-bold text-slate-900'>{fmt(r.totalWithVat)}</span>,
        },
        {
            title: 'Ghi chú', key: 'note', width: 160,
            render: (_v, r) => (
                <Input size='small' value={r.note} style={{ width: 150 }}
                    onChange={(e) => patch(r.index, 'note', e.target.value)} />
            ),
        },
    ];

    const footerEl = (
        <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-end justify-between border-t border-slate-100 pt-3'}`}>
            <div className='text-sm text-slate-500'>
                <div>Thành tiền: <strong>{fmt(totals.price)}</strong></div>
                <div>Tổng VAT: <strong>{fmt(totals.vat)}</strong></div>
                <div className='text-base font-bold text-slate-900'>TỔNG CỘNG: {fmt(totals.total)}</div>
            </div>
            <div className={`flex gap-2 ${isMobile ? 'flex-col-reverse' : ''}`}>
                <Button onClick={onClose} block={isMobile}>Huỷ</Button>
                <Button type='primary' loading={updateMutation.isPending} onClick={handleOk} block={isMobile}>Lưu cập nhật</Button>
            </div>
        </div>
    );

    const tableEl = isMobile ? (
        <div className='flex flex-col gap-3'>
            {rows.map((r) => (
                <div key={r.index} className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
                    <div className='flex items-center justify-between mb-2'>
                        <span className='text-sm font-semibold text-slate-800'>{r.materialName}</span>
                        <span className='text-xs text-slate-400'>{r.unit} · SL: {fmt(r.quantity)}</span>
                    </div>
                    <div className='grid grid-cols-2 gap-2'>
                        <div>
                            <div className='text-xs text-slate-400 mb-1'>Đơn giá</div>
                            <InputNumber size='large' min={0} value={r.unitPrice} style={{ width: '100%' }}
                                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                parser={(v) => Number(String(v).replace(/,/g, '')) as any}
                                onChange={(v) => patch(r.index, 'unitPrice', v ?? 0)} />
                        </div>
                        <div>
                            <div className='text-xs text-slate-400 mb-1'>VAT%</div>
                            <InputNumber size='large' min={0} max={100} value={r.vatRate} style={{ width: '100%' }}
                                formatter={(v) => `${v}%`} parser={(v) => Number(String(v).replace('%', '')) as any}
                                onChange={(v) => patch(r.index, 'vatRate', v ?? 0)} />
                        </div>
                        <div className='col-span-2'>
                            <div className='text-xs text-slate-400 mb-1'>Ghi chú</div>
                            <Input value={r.note} onChange={(e) => patch(r.index, 'note', e.target.value)} />
                        </div>
                        {r.totalWithVat > 0 && <div className='col-span-2 text-right text-sm font-bold text-slate-900'>Tổng: {fmt(r.totalWithVat)}</div>}
                    </div>
                </div>
            ))}
        </div>
    ) : (
        <Table<EditItemRow> rowKey='index' dataSource={rows} columns={columns} pagination={false} size='small' scroll={{ x: 'max-content' }} />
    );

    if (isMobile) {
        return (
            <Drawer open={open} onClose={onClose} placement='bottom' size='92%' destroyOnHidden
                title={`Cập nhật giá — ${distribution.distributionCode || ''}`}
                styles={{ body: { padding: '16px', overflowY: 'auto' }, footer: { padding: '12px 16px' } }}
                footer={footerEl}>
                {tableEl}
            </Drawer>
        );
    }

    return (
        <Modal open={open} title={`Cập nhật giá — ${distribution.distributionCode || ''}`}
            width={1000} centered mask={{ closable: false }} destroyOnHidden onCancel={onClose}
            okText='Lưu cập nhật' cancelText='Huỷ' confirmLoading={updateMutation.isPending} onOk={handleOk}
            footer={() => footerEl}>
            {tableEl}
        </Modal>
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
            size={520}
            open={open}
            onClose={onClose}
            destroyOnHidden
            mask={{ closable: false }}
            footer={null}
        >
            <div className='flex flex-col gap-4'>
                <div>
                    <div className='mb-2 text-sm font-medium text-slate-700'>
                        Chọn phiếu đề xuất đã duyệt <span className='text-red-500'>*</span>
                    </div>
                    <Select
                        showSearch
                        optionFilterProp='label'
                        className='w-full'
                        placeholder='Tìm mã đề xuất...'
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
