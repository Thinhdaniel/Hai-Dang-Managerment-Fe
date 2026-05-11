import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    App, Badge, Button, DatePicker, Descriptions, Drawer, Empty,
    Form, Grid, Input, InputNumber, Modal, Select, Steps, Table, Tag, Tooltip, Typography,
    type TableColumnsType,
} from 'antd';

const { useBreakpoint } = Grid;
import {
    CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
    DeleteOutlined, DownloadOutlined, EyeOutlined, FileTextOutlined,
    InboxOutlined, PlusOutlined, ReloadOutlined, SearchOutlined,
    SendOutlined, SyncOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import { useAuth } from '../core/contexts/AuthContext';
import { api } from '../core/lib/api';
import { hasManagerAccess } from '../core/lib/permissions';
import { normalizeSearchTerm } from '../core/lib/search';
import { plantService } from '../core/services';
import type {
    Material, PurchaseRequest, PurchaseRequestPayload,
    PurchaseRequestQueryParams, PurchaseRequestStatus,
} from '../core/services/material.service';
import { distributionService, materialService, supplyRequestService } from '../core/services/material.service';
import type { PaginatedResponse, Plant, User } from '../core/types';

const { RangePicker } = DatePicker;
const { Text, Paragraph } = Typography;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const SEARCH_DEBOUNCE_MS = 300;

// ─── Types ────────────────────────────────────────────────────────────────────

type SupplyRequestTab = 'mine' | 'pending' | 'all';
type DateRangeValue = [Dayjs, Dayjs];

type FilterState = {
    search: string;
    fromPlantId?: string;
    status?: PurchaseRequestStatus;
    startDate?: string;
    endDate?: string;
};

type DraftFilterState = {
    search: string;
    fromPlantId?: string;
    status?: PurchaseRequestStatus;
    dateRange: DateRangeValue | null;
};

type FormItemValue = {
    materialName?: string;
    unit?: string;
    quantityRequested?: number;
    note?: string;
};

type FormValues = {
    fromPlantId?: string;
    note?: string;
    requestDate?: any;
    items: FormItemValue[];
};

type Stats = {
    total: number; pending: number; approved: number;
    in_progress: number; distributed: number; rejected: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    pending:     { color: 'orange',  label: 'Chờ duyệt',      icon: <ClockCircleOutlined /> },
    approved:    { color: 'blue',    label: 'Đã duyệt',        icon: <CheckCircleOutlined /> },
    in_progress: { color: 'cyan',    label: 'Đang cấp phát',   icon: <SyncOutlined spin /> },
    distributed: { color: 'green',   label: 'Đã nhận hàng',    icon: <CheckCircleOutlined /> },
    rejected:    { color: 'red',     label: 'Từ chối',          icon: <CloseCircleOutlined /> },
    cancelled:   { color: 'default', label: 'Đã hủy',           icon: <CloseCircleOutlined /> },
};

const STATUS_OPTIONS: Array<{ value: PurchaseRequestStatus; label: string }> = [
    { value: 'pending',                          label: 'Chờ duyệt' },
    { value: 'approved',                         label: 'Đã duyệt' },
    { value: 'in_progress' as PurchaseRequestStatus, label: 'Đang cấp phát' },
    { value: 'distributed',                      label: 'Đã nhận hàng' },
    { value: 'rejected',                         label: 'Từ chối' },
];

const WORKFLOW_STEPS = [
    { title: 'Tạo phiếu',     status: 'pending' },
    { title: 'Duyệt',         status: 'approved' },
    { title: 'Cấp phát',      status: 'in_progress' },
    { title: 'Đã nhận hàng',  status: 'distributed' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtNum = (v?: number) => (v ?? 0).toLocaleString('vi-VN');
const fmtDate = (v?: string) => (v ? dayjs(v).format('DD/MM/YYYY') : '—');
const fmtDateTime = (v?: string) => (v ? dayjs(v).format('DD/MM/YYYY HH:mm') : '—');
const resolveUser = (v?: string | User) => {
    if (!v) return '—';
    if (typeof v === 'string') return v;
    return (v as any).name || (v as any).email || '—';
};
const normalizeText = (v?: string | null) => { const s = (v || '').trim().replace(/\s+/g, ' '); return s || undefined; };
const resolveError = (e: unknown, fallback: string) =>
    e && typeof e === 'object' && 'message' in e ? String((e as any).message) : fallback;
const parseNum = (v: string | number | null | undefined) => {
    const n = String(v ?? '').replace(/[^\d.-]/g, '');
    return n ? Number(n) : 0;
};
const normalizePaginated = <T,>(res: T[] | PaginatedResponse<T>, page: number, limit: number): PaginatedResponse<T> => {
    if (Array.isArray(res)) {
        const total = res.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const safePage = Math.min(page, totalPages);
        return { data: res.slice((safePage - 1) * limit, safePage * limit), total, page: safePage, limit, totalPages };
    }
    return res;
};

const getWorkflowStep = (status: string) => {
    if (status === 'rejected' || status === 'cancelled') return -1;
    const idx = WORKFLOW_STEPS.findIndex((s) => s.status === status);
    return idx === -1 ? 0 : idx;
};

const emptyItem = (): FormItemValue => ({ materialName: '', unit: '', quantityRequested: 1, note: '' });

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatusTag: React.FC<{ status: string }> = ({ status }) => {
    const m = STATUS_META[status] ?? { color: 'default', label: status, icon: null };
    return <Tag color={m.color} icon={m.icon}>{m.label}</Tag>;
};

const StatCard: React.FC<{
    title: string; value: number; icon: React.ReactNode;
    color: string; active?: boolean; onClick?: () => void;
}> = ({ title, value, icon, color, active, onClick }) => (
    <div
        onClick={onClick}
        className={[
            'flex cursor-pointer items-center gap-2 sm:gap-4 rounded-2xl border p-3 sm:p-4 transition-all hover:shadow-md',
            active ? 'shadow-sm' : 'border-slate-200 bg-white',
        ].join(' ')}
        style={active ? { borderColor: color, backgroundColor: `${color}10` } : undefined}
    >
        <div className="flex h-8 w-8 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl text-base sm:text-xl"
            style={{ background: `${color}18`, color }}>
            {icon}
        </div>
        <div className="min-w-0">
            <div className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wide truncate">{title}</div>
            <div className="text-lg sm:text-2xl font-bold leading-tight" style={{ color }}>{fmtNum(value)}</div>
        </div>
    </div>
);

// ─── Form Drawer ──────────────────────────────────────────────────────────────

const FormDrawer: React.FC<{
    open: boolean;
    initialValues?: PurchaseRequest | null;
    defaultPlantId?: string;
    defaultPlantName?: string;
    submitting: boolean;
    onClose: () => void;
    onSubmit: (payload: Partial<PurchaseRequestPayload>) => Promise<void>;
}> = ({ open, initialValues, defaultPlantId, defaultPlantName, submitting, onClose, onSubmit }) => {
    const [form] = Form.useForm<FormValues>();
    const watchedItems: FormItemValue[] = Form.useWatch('items', form) ?? [];
    const screens = useBreakpoint();
    const isMobile = !screens.sm;

    useEffect(() => {
        if (!open) return;
        if (initialValues) {
            form.setFieldsValue({
                fromPlantId: initialValues.fromPlantId,
                note: initialValues.note,
                requestDate: initialValues.requestDate ? dayjs(initialValues.requestDate) : dayjs(),
                items: initialValues.items.map((i) => ({
                    materialName: i.materialName || '',
                    unit: i.unit || '',
                    quantityRequested: i.quantityRequested,
                    note: i.note,
                })),
            });
        } else {
            form.resetFields();
            form.setFieldsValue({ fromPlantId: defaultPlantId, requestDate: dayjs(), items: [emptyItem()] });
        }
    }, [open, initialValues, defaultPlantId, form]);

    const handleSubmit = async () => {
        const values = await form.validateFields();
        await onSubmit({
            fromPlantId: String(values.fromPlantId),
            note: normalizeText(values.note),
            requestDate: values.requestDate?.toISOString(),
            items: (values.items ?? []).map((i) => ({
                materialName: String(i.materialName ?? '').trim(),
                unit: String(i.unit ?? '').trim(),
                quantityRequested: Number(i.quantityRequested ?? 0),
                note: normalizeText(i.note),
            })) as any,
        });
    };

    return (
        <Drawer
            open={open}
            onClose={onClose}
            width={isMobile ? '100%' : 860}
            destroyOnHidden
            maskClosable={false}
            styles={{ body: { padding: isMobile ? '12px' : '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
            title={
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                        <SendOutlined />
                    </div>
                    <div>
                        <div className="font-semibold text-slate-900">
                            {initialValues ? 'Cập nhật đề xuất cấp vật tư' : 'Tạo đề xuất cấp vật tư'}
                        </div>
                        <div className="text-xs text-slate-400">Gửi yêu cầu cấp vật tư từ cơ sở chính</div>
                    </div>
                </div>
            }
            footer={
                <div className="flex items-center justify-between">
                    <Text type="secondary" className="text-sm">
                        {watchedItems.length} loại vật tư
                    </Text>
                    <div className="flex gap-2">
                        <Button onClick={onClose}>Huỷ</Button>
                        <Button type="primary" loading={submitting} onClick={handleSubmit}
                            disabled={!watchedItems.length} icon={<SendOutlined />}>
                            {initialValues ? 'Lưu cập nhật' : 'Gửi đề xuất'}
                        </Button>
                    </div>
                </div>
            }
        >
            <Form form={form} layout="vertical" className="h-full flex flex-col gap-0">
                {/* Thông tin chung — cố định */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-5 mb-3 sm:mb-5 shrink-0">
                    <div className="mb-3 sm:mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <FileTextOutlined /> Thông tin chung
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
                        <Form.Item label="Cơ sở gửi" className="mb-0">
                            <Input value={defaultPlantName || '—'} readOnly
                                className="cursor-default bg-white font-medium text-slate-700" />
                        </Form.Item>
                        <Form.Item name="fromPlantId" hidden><Input /></Form.Item>

                        <Form.Item name="requestDate" label="Ngày đề xuất" className="mb-0"
                            rules={[{ required: true, message: 'Chọn ngày đề xuất' }]}>
                            <DatePicker format="DD/MM/YYYY" className="w-full" />
                        </Form.Item>

                        <Form.Item name="note" label="Lý do / Mục đích đề xuất" className="mb-0 sm:col-span-2"
                            rules={[
                                { required: true, message: 'Vui lòng nhập lý do đề xuất' },
                                { min: 10, message: 'Tối thiểu 10 ký tự' },
                            ]}>
                            <Input.TextArea rows={3} maxLength={500} showCount
                                placeholder="Ghi rõ lý do cần cấp và mục đích sử dụng vật tư..." />
                        </Form.Item>
                    </div>
                </div>

                {/* Danh sách vật tư — scroll riêng */}
                <Form.List name="items">
                    {(fields, { add, remove }) => (
                        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden flex-1 min-h-0">
                            {/* Sticky header */}
                            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 sm:px-5 py-3 shrink-0">
                                <div>
                                    <div className="text-sm font-semibold text-slate-800">Danh sách vật tư cần cấp</div>
                                    <div className="text-xs text-slate-400">Tối thiểu 1 vật tư.</div>
                                </div>
                                <Tag color="blue">{fields.length} loại</Tag>
                            </div>

                            {/* Column headers — desktop only */}
                            {!isMobile && (
                                <div className="grid grid-cols-[minmax(0,2.5fr)_90px_130px_minmax(0,1.5fr)_40px] gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">
                                    <span>Tên vật tư *</span><span>ĐVT *</span><span>Số lượng *</span><span>Ghi chú</span><span />
                                </div>
                            )}

                            {/* Scrollable rows */}
                            <div className="overflow-y-auto flex-1">
                                {fields.length === 0 && (
                                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
                                        <InboxOutlined style={{ fontSize: 32 }} />
                                        <span className="text-sm">Chưa có vật tư nào</span>
                                    </div>
                                )}
                                {fields.map((field, index) => (
                                    isMobile ? (
                                        /* Mobile: card layout dọc */
                                        <div key={field.key}
                                            className="border-b border-slate-100 px-3 py-3 last:border-b-0">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-semibold text-slate-500">Vật tư #{index + 1}</span>
                                                <Tooltip title="Xoá dòng">
                                                    <Button type="text" danger size="small"
                                                        disabled={fields.length === 1}
                                                        icon={<DeleteOutlined />}
                                                        onClick={() => remove(field.name)} />
                                                </Tooltip>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <Form.Item name={[field.name, 'materialName']} label="Tên vật tư" className="mb-0 col-span-2"
                                                    rules={[{ required: true, message: 'Nhập tên' }]}>
                                                    <Input placeholder={`Vật tư ${index + 1}`} maxLength={200} />
                                                </Form.Item>
                                                <Form.Item name={[field.name, 'unit']} label="ĐVT" className="mb-0"
                                                    rules={[{ required: true, message: 'Nhập ĐVT' }]}>
                                                    <Input placeholder="Cái, Kg..." maxLength={50} />
                                                </Form.Item>
                                                <Form.Item name={[field.name, 'quantityRequested']} label="Số lượng" className="mb-0"
                                                    rules={[{ required: true, message: 'Nhập SL' }]}>
                                                    <InputNumber<number> min={1} className="w-full"
                                                        formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                                        parser={parseNum} />
                                                </Form.Item>
                                                <Form.Item name={[field.name, 'note']} label="Ghi chú" className="mb-0 col-span-2">
                                                    <Input placeholder="Ghi chú..." maxLength={250} />
                                                </Form.Item>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Desktop: grid layout ngang */
                                        <div key={field.key}
                                            className="grid grid-cols-[minmax(0,2.5fr)_90px_130px_minmax(0,1.5fr)_40px] gap-3 border-b border-slate-100 px-5 py-3 last:border-b-0 hover:bg-blue-50/20 transition-colors">
                                            <Form.Item name={[field.name, 'materialName']} className="mb-0"
                                                rules={[{ required: true, message: 'Nhập tên' }]}>
                                                <Input placeholder={`Vật tư ${index + 1}`} maxLength={200} />
                                            </Form.Item>
                                            <Form.Item name={[field.name, 'unit']} className="mb-0"
                                                rules={[{ required: true, message: 'Nhập ĐVT' }]}>
                                                <Input placeholder="Cái, Kg..." maxLength={50} />
                                            </Form.Item>
                                            <Form.Item name={[field.name, 'quantityRequested']} className="mb-0"
                                                rules={[{ required: true, message: 'Nhập SL' }]}>
                                                <InputNumber<number> min={1} className="w-full"
                                                    formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                                    parser={parseNum} />
                                            </Form.Item>
                                            <Form.Item name={[field.name, 'note']} className="mb-0">
                                                <Input placeholder="Ghi chú..." maxLength={250} />
                                            </Form.Item>
                                            <div className="flex items-center justify-center">
                                                <Tooltip title="Xoá dòng">
                                                    <Button type="text" danger size="small"
                                                        disabled={fields.length === 1}
                                                        icon={<DeleteOutlined />}
                                                        onClick={() => remove(field.name)} />
                                                </Tooltip>
                                            </div>
                                        </div>
                                    )
                                ))}
                            </div>

                            {/* Sticky footer — nút thêm luôn hiển thị */}
                            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 sm:px-5 py-3 shrink-0">
                                <Text type="secondary" className="text-xs">
                                    Tổng: <strong>{fields.length}</strong> loại vật tư
                                </Text>
                                <Button icon={<PlusOutlined />} onClick={() => add(emptyItem())}>
                                    Thêm dòng
                                </Button>
                            </div>
                        </div>
                    )}
                </Form.List>
            </Form>
        </Drawer>
    );
};


// ─── Main Page ────────────────────────────────────────────────────────────────

const SupplyRequestPage: React.FC = () => {
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const screens = useBreakpoint();
    const isMobile = !screens.sm;

    const mainPlantId = import.meta.env.VITE_MAIN_PLANT_ID;
    const isMainPlant = Boolean(mainPlantId && user?.plantId === mainPlantId);
    const isCS1Manager = isMainPlant && ['admin', 'manager', 'director'].includes(user?.role ?? '');

    const queryStatus = STATUS_OPTIONS.find((o) => o.value === searchParams.get('status'))?.value;

    const [activeTab, setActiveTab] = useState<SupplyRequestTab>(() =>
        queryStatus === 'pending' ? 'pending' : 'mine'
    );
    const [filters, setFilters] = useState<FilterState>({
        search: '', fromPlantId: undefined,
        status: queryStatus !== 'pending' ? queryStatus : undefined,
    });
    const [draft, setDraft] = useState<DraftFilterState>({
        search: '', fromPlantId: undefined,
        status: queryStatus !== 'pending' ? queryStatus : undefined,
        dateRange: null,
    });
    const [pagination, setPagination] = useState({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [rejectTarget, setRejectTarget] = useState<PurchaseRequest | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [approvalQty, setApprovalQty] = useState<Record<number, number>>({});;

    // Debounce search
    useEffect(() => {
        const t = window.setTimeout(() => {
            const n = normalizeSearchTerm(draft.search);
            setFilters((c) => ({ ...c, search: n }));
            setPagination((c) => ({ ...c, page: DEFAULT_PAGE }));
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(t);
    }, [draft.search]);

    const listParams = useMemo<PurchaseRequestQueryParams>(() => ({
        search: filters.search || undefined,
        fromPlantId: activeTab === 'mine' && !isCS1Manager ? user?.plantId : filters.fromPlantId,
        requestedBy: activeTab === 'mine' && isCS1Manager ? user?.id : undefined,
        status: activeTab === 'pending' ? 'pending' : filters.status,
        startDate: filters.startDate,
        endDate: filters.endDate,
        page: pagination.page,
        limit: pagination.limit,
    }), [activeTab, filters, pagination, user, isCS1Manager]);

    // ── Queries ──────────────────────────────────────────────────────────────
    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        staleTime: 5 * 60_000,
    });

    const { data: listRes, isLoading, isFetching } = useQuery({
        queryKey: ['supply-requests', listParams],
        queryFn: async () => normalizePaginated(await supplyRequestService.getAll(listParams), listParams.page!, listParams.limit!),
        placeholderData: (p) => p,
    });

    const { data: statsRes } = useQuery({
        queryKey: ['supply-requests', 'stats'],
        queryFn: () => supplyRequestService.getAll({ page: 1, limit: 500 }),
        enabled: isCS1Manager,
        staleTime: 60_000,
    });

    const requests = (listRes as PaginatedResponse<PurchaseRequest> | undefined)?.data ?? [];
    const totalRequests = (listRes as PaginatedResponse<PurchaseRequest> | undefined)?.total ?? 0;
    const selectedRequest = requests.find((r) => r.id === selectedId) ?? null;

    const stats = useMemo<Stats>(() => {
        const base: Stats = { total: 0, pending: 0, approved: 0, in_progress: 0, distributed: 0, rejected: 0 };
        if (!statsRes) return base;
        const items: PurchaseRequest[] = Array.isArray(statsRes) ? statsRes : (statsRes as any).data ?? [];
        const total = Array.isArray(statsRes) ? items.length : (statsRes as any).total ?? 0;
        return items.reduce((acc, r) => {
            if (r.status === 'pending') acc.pending++;
            if (r.status === 'approved') acc.approved++;
            if ((r.status as string) === 'in_progress') acc.in_progress++;
            if (r.status === 'distributed') acc.distributed++;
            if (r.status === 'rejected') acc.rejected++;
            return acc;
        }, { ...base, total });
    }, [statsRes]);

    // Linked distribution for in_progress requests
    const isInProgress = (selectedRequest?.status as string) === 'in_progress';
    const { data: linkedDistRes } = useQuery({
        queryKey: ['distributions', 'by-sr', selectedId],
        queryFn: () => distributionService.getAll({ supplyRequestId: selectedId!, limit: 1, page: 1 }),
        enabled: !!selectedId && isInProgress,
    });
    const linkedDist = useMemo(() => {
        if (!linkedDistRes) return null;
        const items = Array.isArray(linkedDistRes) ? linkedDistRes : (linkedDistRes as any).data ?? [];
        return items[0] ?? null;
    }, [linkedDistRes]);

    const resolveId = (v: any): string | undefined =>
        v && typeof v === 'object' ? v.id ?? String(v._id ?? '') : v;
    const canConfirm = isInProgress && linkedDist?.status === 'distributed'
        && (isCS1Manager || resolveId(selectedRequest?.fromPlantId) === user?.plantId);

    // ── Mutations ─────────────────────────────────────────────────────────────
    const { mutateAsync: createReq, isPending: isCreating } = useMutation({
        mutationFn: supplyRequestService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
            message.success('Tạo phiếu đề xuất thành công');
            setFormOpen(false);
        },
        onError: (e) => message.error(resolveError(e, 'Không thể tạo phiếu')),
    });

    const { mutateAsync: approveReq } = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: { items: Array<{ quantityApproved: number }> } }) =>
            supplyRequestService.approve(id, payload),
        onSuccess: (approved) => {
            queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
            setApprovingId(null);
            setSelectedId(null);
            navigate('/materials/distributions', {
                state: { supplyRequestId: approved.id, fromPlantId: mainPlantId, toPlantId: approved.fromPlantId },
            });
        },
        onError: (e) => { setApprovingId(null); message.error(resolveError(e, 'Không thể duyệt phiếu')); },
    });

    const { mutateAsync: rejectReq, isPending: isRejecting } = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) => supplyRequestService.reject(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
            message.success('Đã từ chối phiếu');
            setRejectTarget(null);
            setRejectReason('');
        },
        onError: (e) => message.error(resolveError(e, 'Không thể từ chối')),
    });

    const { mutateAsync: confirmDist, isPending: isConfirming } = useMutation({
        mutationFn: (id: string) => distributionService.confirm(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
            queryClient.invalidateQueries({ queryKey: ['distributions'] });
            message.success('Xác nhận nhận hàng thành công!');
            setSelectedId(null);
        },
        onError: (e) => message.error(resolveError(e, 'Không thể xác nhận')),
    });

    const exportXlsx = async (record: PurchaseRequest) => {
        try {
            const res: any = await api.get(`/supply-requests/${record.id}/export-xlsx`, { responseType: 'blob' });
            const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Phieu_De_Xuat_Cap_Vat_Tu_${record.requestCode || record.id}.xlsx`;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
        } catch { message.error('Không thể tải file Excel'); }
    };


    // ── Table columns ─────────────────────────────────────────────────────────
    const columns: TableColumnsType<PurchaseRequest> = [
        {
            title: 'Mã phiếu', dataIndex: 'requestCode', width: 150,
            render: (v?: string) => (
                <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-0.5">
                    {v || '—'}
                </span>
            ),
        },
        {
            title: 'Cơ sở gửi', key: 'plant',
            responsive: ['sm'] as any,
            render: (_: any, r: PurchaseRequest) => (
                <span className="font-medium text-slate-700">
                    {r.fromPlant?.name || r.plant?.name || '—'}
                </span>
            ),
        },
        {
            title: 'Ngày đề xuất', key: 'date', width: 130,
            responsive: ['md'] as any,
            render: (_: any, r: PurchaseRequest) => (
                <span className="text-slate-500 text-sm">{fmtDate(r.requestDate || r.createdAt)}</span>
            ),
        },
        {
            title: 'Số loại VT', key: 'items', width: 100, align: 'center' as const,
            responsive: ['sm'] as any,
            render: (_: any, r: PurchaseRequest) => (
                <Badge count={r.items?.length ?? 0} color="#6366f1" showZero />
            ),
        },
        {
            title: 'Người tạo', key: 'requestedBy', width: 140,
            responsive: ['lg'] as any,
            render: (_: any, r: PurchaseRequest) => (
                <span className="text-sm text-slate-600">{resolveUser(r.requestedBy)}</span>
            ),
        },
        {
            title: 'Trạng thái', dataIndex: 'status', width: 150,
            render: (s: string) => <StatusTag status={s} />,
        },
        {
            title: '', key: 'action', width: 90, align: 'right' as const,
            render: (_: any, record: PurchaseRequest) => (
                <div className="flex items-center justify-end gap-1">
                    {!isMobile && (
                        <Tooltip title="Xuất Excel">
                            <Button type="text" size="small" icon={<DownloadOutlined />}
                                onClick={(e) => { e.stopPropagation(); exportXlsx(record); }}
                                className="text-slate-400 hover:text-green-600" />
                        </Tooltip>
                    )}
                    <Tooltip title="Xem chi tiết">
                        <Button type="text" size="small" icon={<EyeOutlined />}
                            onClick={() => { setSelectedId(record.id); setApprovalQty({}); }}
                            className="text-slate-400 hover:text-blue-600" />
                    </Tooltip>
                </div>
            ),
        },
    ];

    const defaultPlantName = plants.find((p: Plant) => p.id === user?.plantId)?.name;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
            <PageHeader
                title="Đề Xuất Cấp Vật Tư"
                subtitle="Quản lý luồng đề xuất cấp vật tư từ cơ sở về kho trung tâm."
                actions={
                    <div className="flex gap-2">
                        <Button icon={<ReloadOutlined />}
                            onClick={() => queryClient.invalidateQueries({ queryKey: ['supply-requests'] })} />
                        {!isMainPlant && (
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                                Tạo đề xuất
                            </Button>
                        )}
                    </div>
                }
            />

            {/* Stats */}
            {isCS1Manager && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                        { title: 'Tổng phiếu',     value: stats.total,       color: '#3b82f6', icon: <FileTextOutlined />,    tab: 'all' as SupplyRequestTab,    status: undefined },
                        { title: 'Chờ duyệt',       value: stats.pending,     color: '#f97316', icon: <ClockCircleOutlined />, tab: 'pending' as SupplyRequestTab, status: undefined },
                        { title: 'Đã duyệt',        value: stats.approved,    color: '#6366f1', icon: <CheckCircleOutlined />, tab: 'all' as SupplyRequestTab,    status: 'approved' as PurchaseRequestStatus },
                        { title: 'Đang cấp phát',   value: stats.in_progress, color: '#06b6d4', icon: <SyncOutlined />,        tab: 'all' as SupplyRequestTab,    status: 'in_progress' as PurchaseRequestStatus },
                        { title: 'Đã nhận hàng',    value: stats.distributed, color: '#22c55e', icon: <CheckCircleOutlined />, tab: 'all' as SupplyRequestTab,    status: 'distributed' as PurchaseRequestStatus },
                        { title: 'Từ chối',         value: stats.rejected,    color: '#ef4444', icon: <CloseCircleOutlined />, tab: 'all' as SupplyRequestTab,    status: 'rejected' as PurchaseRequestStatus },
                    ].map((s) => (
                        <StatCard key={s.title} title={s.title} value={s.value} color={s.color} icon={s.icon}
                            active={activeTab === s.tab && (s.status ? filters.status === s.status : !filters.status && s.tab !== 'pending')}
                            onClick={() => {
                                setActiveTab(s.tab);
                                setFilters((p) => ({ ...p, status: s.status }));
                                setDraft((p) => ({ ...p, status: s.status }));
                                setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Table card */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                {/* Tabs */}
                <div className="border-b border-slate-100 px-5 pt-2">
                    <div className="flex gap-1">
                        {([
                            { key: 'mine', label: 'Phiếu của tôi' },
                            ...(isCS1Manager ? [{ key: 'pending', label: `Chờ xử lý${stats.pending > 0 ? ` (${stats.pending})` : ''}` }] : []),
                            { key: 'all', label: 'Tất cả' },
                        ] as { key: SupplyRequestTab; label: string }[]).map((tab) => (
                            <button key={tab.key}
                                onClick={() => { setActiveTab(tab.key); setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT }); }}
                                className={[
                                    'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                                    activeTab === tab.key
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-700',
                                ].join(' ')}>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-3 border-b border-slate-100 px-3 sm:px-5 py-3">
                    <Input prefix={<SearchOutlined className="text-slate-400" />}
                        placeholder="Tìm mã phiếu, ghi chú..." allowClear
                        value={draft.search}
                        onChange={(e) => setDraft((p) => ({ ...p, search: e.target.value }))}
                        className="w-full sm:w-60" />
                    {isCS1Manager && (
                        <Select placeholder="Cơ sở gửi" allowClear value={draft.fromPlantId}
                            onChange={(v) => { setDraft((p) => ({ ...p, fromPlantId: v })); setFilters((p) => ({ ...p, fromPlantId: v })); setPagination((p) => ({ ...p, page: 1 })); }}
                            options={plants.map((p: Plant) => ({ label: p.name, value: p.id }))}
                            className="w-full sm:w-44" />
                    )}
                    <Select placeholder="Trạng thái" allowClear value={draft.status}
                        onChange={(v) => { setDraft((p) => ({ ...p, status: v })); setFilters((p) => ({ ...p, status: v })); setPagination((p) => ({ ...p, page: 1 })); }}
                        options={STATUS_OPTIONS} className="w-full sm:w-40" />
                    <RangePicker value={draft.dateRange}
                        onChange={(dates) => {
                            setDraft((p) => ({ ...p, dateRange: dates as any }));
                            setFilters((p) => ({
                                ...p,
                                startDate: dates?.[0]?.startOf('day').toISOString(),
                                endDate: dates?.[1]?.endOf('day').toISOString(),
                            }));
                            setPagination((p) => ({ ...p, page: 1 }));
                        }}
                        format="DD/MM/YYYY" className="w-full sm:w-60" />
                </div>

                {/* Table */}
                <div className="px-2 sm:px-5 py-4">
                    <Table
                        columns={columns}
                        dataSource={requests}
                        rowKey="id"
                        loading={isLoading || isFetching}
                        size={isMobile ? 'small' : 'middle'}
                        onRow={(record) => ({
                            onClick: () => { setSelectedId(record.id); setApprovalQty({}); },
                            className: 'cursor-pointer hover:bg-blue-50/30 transition-colors',
                        })}
                        pagination={{
                            current: pagination.page, pageSize: pagination.limit, total: totalRequests,
                            showSizeChanger: !isMobile,
                            simple: isMobile,
                            onChange: (page, limit) => setPagination({ page, limit }),
                            showTotal: isMobile ? undefined : (total) => `${total} phiếu`,
                        }}
                        locale={{ emptyText: <Empty description="Không có phiếu nào" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                    />
                </div>
            </div>

            {/* Form Drawer */}
            <FormDrawer
                open={formOpen}
                defaultPlantId={user?.plantId}
                defaultPlantName={defaultPlantName}
                submitting={isCreating}
                onClose={() => setFormOpen(false)}
                onSubmit={async (payload) => { await createReq(payload); }}
            />


            {/* Detail Drawer */}
            <Drawer
                open={!!selectedId}
                onClose={() => { setSelectedId(null); setApprovalQty({}); }}
                width={isMobile ? '100%' : 820}
                destroyOnHidden
                styles={{ body: { padding: isMobile ? '12px' : undefined } }}
                title={
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                            <FileTextOutlined />
                        </div>
                        <div>
                            <div className="font-semibold text-slate-900">
                                Chi tiết phiếu đề xuất
                                {selectedRequest?.requestCode && (
                                    <span className="ml-2 font-mono text-sm text-blue-600">
                                        #{selectedRequest.requestCode}
                                    </span>
                                )}
                            </div>
                            {selectedRequest && <StatusTag status={selectedRequest.status} />}
                        </div>
                    </div>
                }
                footer={selectedRequest && (
                    <div className={`flex gap-2 ${isMobile ? 'flex-col' : 'items-center justify-between'}`}>
                        <Button icon={<DownloadOutlined />} onClick={() => exportXlsx(selectedRequest)}
                            className={isMobile ? 'w-full' : ''}>
                            Xuất Excel
                        </Button>
                        <div className={`flex gap-2 ${isMobile ? 'flex-col' : ''}`}>
                            {selectedRequest.status === 'pending' && isCS1Manager && (
                                <>
                                    <Button danger onClick={() => setRejectTarget(selectedRequest)}
                                        className={isMobile ? 'w-full' : ''}>
                                        Từ chối
                                    </Button>
                                    <Button type="primary" className={`bg-green-600 hover:!bg-green-700${isMobile ? ' w-full' : ''}`}
                                        loading={approvingId === selectedRequest.id}
                                        onClick={() => {
                                            const items = selectedRequest.items.map((r: any, idx: number) => ({
                                                quantityApproved: approvalQty[idx] ?? r.quantityRequested,
                                            }));
                                            Modal.confirm({
                                                title: 'Duyệt phiếu đề xuất?',
                                                content: 'Sau khi duyệt, bạn sẽ được chuyển sang trang tạo phiếu cấp phát.',
                                                okText: 'Duyệt', okButtonProps: { className: 'bg-green-600' },
                                                onOk: () => {
                                                    setApprovingId(selectedRequest.id);
                                                    return approveReq({ id: selectedRequest.id, payload: { items } });
                                                },
                                            });
                                        }}>
                                        <CheckCircleOutlined /> Duyệt phiếu
                                    </Button>
                                </>
                            )}
                            {canConfirm && (
                                <Button type="primary" loading={isConfirming}
                                    className={`bg-green-600 hover:!bg-green-700${isMobile ? ' w-full' : ''}`}
                                    onClick={() => {
                                        if (!linkedDist?.id) return;
                                        Modal.confirm({
                                            title: 'Xác nhận đã nhận hàng?',
                                            content: 'Thao tác này xác nhận cơ sở đã nhận đủ vật tư. Không thể hoàn tác.',
                                            okText: 'Xác nhận', okButtonProps: { className: 'bg-green-600' },
                                            onOk: () => confirmDist(linkedDist.id),
                                        });
                                    }}>
                                    <CheckCircleOutlined /> Xác nhận đã nhận hàng
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            >
                {selectedRequest ? (
                    <div className="flex flex-col gap-5">
                        {/* Workflow steps */}
                        {selectedRequest.status !== 'rejected' && selectedRequest.status !== 'cancelled' && (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4">
                                <Steps
                                    size="small"
                                    current={getWorkflowStep(selectedRequest.status)}
                                    items={WORKFLOW_STEPS.map((s) => ({ title: s.title }))}
                                />
                            </div>
                        )}

                        {/* Rejected banner */}
                        {selectedRequest.status === 'rejected' && (
                            <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
                                <WarningOutlined className="mt-0.5 shrink-0" />
                                <div>
                                    <div className="font-semibold">Phiếu bị từ chối</div>
                                    <div className="text-sm">{selectedRequest.rejectedReason || '—'}</div>
                                </div>
                            </div>
                        )}

                        {/* In-progress banner */}
                        {isInProgress && linkedDist?.status === 'distributed' && (
                            <div className="flex gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-cyan-700">
                                <SendOutlined className="mt-0.5 shrink-0" />
                                <div>
                                    <div className="font-semibold">Hàng đang trên đường vận chuyển</div>
                                    <div className="text-sm">Vui lòng xác nhận sau khi nhận đủ vật tư thực tế.</div>
                                </div>
                            </div>
                        )}

                        {/* Info */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-5">
                            <div className="mb-3 text-sm font-semibold text-slate-700">Thông tin phiếu</div>
                            <Descriptions column={isMobile ? 1 : 2} size="small" labelStyle={{ color: '#94a3b8', fontWeight: 500 }}>
                                <Descriptions.Item label="Mã phiếu">
                                    <Text copyable className="font-mono font-semibold text-blue-700">
                                        {selectedRequest.requestCode}
                                    </Text>
                                </Descriptions.Item>
                                <Descriptions.Item label="Trạng thái">
                                    <StatusTag status={selectedRequest.status} />
                                </Descriptions.Item>
                                <Descriptions.Item label="Cơ sở gửi">
                                    {selectedRequest.fromPlant?.name || selectedRequest.plant?.name || '—'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Ngày đề xuất">
                                    {fmtDate(selectedRequest.requestDate || selectedRequest.createdAt)}
                                </Descriptions.Item>
                                <Descriptions.Item label="Người tạo">
                                    {resolveUser(selectedRequest.requestedBy)}
                                </Descriptions.Item>
                                <Descriptions.Item label="Ngày tạo">
                                    {fmtDateTime(selectedRequest.createdAt)}
                                </Descriptions.Item>
                                {selectedRequest.approvedBy && (
                                    <Descriptions.Item label="Người duyệt">
                                        {resolveUser(selectedRequest.approvedBy)}
                                    </Descriptions.Item>
                                )}
                                {selectedRequest.approvedAt && (
                                    <Descriptions.Item label="Ngày duyệt">
                                        {fmtDateTime(selectedRequest.approvedAt)}
                                    </Descriptions.Item>
                                )}
                                {selectedRequest.note && (
                                    <Descriptions.Item label="Lý do / Mục đích" span={2}>
                                        <Paragraph className="mb-0 text-slate-700">{selectedRequest.note}</Paragraph>
                                    </Descriptions.Item>
                                )}
                            </Descriptions>
                        </div>

                        {/* Items table */}
                        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">
                                Danh sách vật tư ({selectedRequest.items?.length ?? 0} loại)
                            </div>
                            <Table
                                dataSource={selectedRequest.items}
                                rowKey={(_, idx) => String(idx)}
                                pagination={false}
                                size="small"
                                className="[&_.ant-table-thead_th]:bg-slate-50"
                                columns={[
                                    {
                                        title: '#', key: 'idx', width: 40, align: 'center' as const,
                                        render: (_: any, __: any, idx: number) => (
                                            <span className="text-xs text-slate-400">{idx + 1}</span>
                                        ),
                                    },
                                    {
                                        title: 'Tên vật tư đề xuất', key: 'name',
                                        render: (_: any, r: any) => (
                                            <span className="font-medium text-slate-800">{r.materialName || '—'}</span>
                                        ),
                                    },
                                    { title: 'ĐVT', dataIndex: 'unit', width: 80 },
                                    {
                                        title: 'SL đề xuất', dataIndex: 'quantityRequested',
                                        width: 100, align: 'right' as const,
                                        render: (v: number) => <span className="font-semibold">{fmtNum(v)}</span>,
                                    },
                                    ...(isCS1Manager && selectedRequest.status === 'pending' ? [
                                        {
                                            title: 'SL duyệt', key: 'qtyA', width: 110,
                                            render: (_: any, r: any, idx: number) => (
                                                <InputNumber min={1} size="small" style={{ width: '100%' }}
                                                    value={approvalQty[idx] ?? r.quantityRequested}
                                                    onChange={(v) => setApprovalQty((p) => ({
                                                        ...p, [idx]: v ?? r.quantityRequested,
                                                    }))} />
                                            ),
                                        },
                                    ] : [
                                        {
                                            title: 'SL duyệt', key: 'qtyA', width: 100, align: 'right' as const,
                                            render: (_: any, r: any) => (
                                                <span className={r.quantityApproved != null && r.quantityApproved < r.quantityRequested ? 'text-orange-600 font-semibold' : ''}>
                                                    {fmtNum(r.quantityApproved ?? r.quantityRequested)}
                                                </span>
                                            ),
                                        },
                                    ]),
                                    {
                                        title: 'Ghi chú', dataIndex: 'note', width: 160,
                                        render: (v?: string) => <span className="text-slate-400 text-sm">{v || '—'}</span>,
                                    },
                                ]}
                            />
                        </div>
                    </div>
                ) : (
                    <Empty description="Không có dữ liệu" />
                )}
            </Drawer>

            {/* Reject Modal */}
            <Modal
                open={Boolean(rejectTarget)}
                title={
                    <div className="flex items-center gap-2 text-red-600">
                        <CloseCircleOutlined /> Từ chối phiếu đề xuất
                    </div>
                }
                okText="Xác nhận từ chối" okButtonProps={{ danger: true }}
                cancelText="Huỷ"
                confirmLoading={isRejecting}
                onOk={async () => {
                    if (!rejectTarget || !rejectReason.trim()) {
                        message.warning('Vui lòng nhập lý do từ chối');
                        return;
                    }
                    await rejectReq({ id: rejectTarget.id, reason: rejectReason.trim() });
                }}
                onCancel={() => { setRejectTarget(null); setRejectReason(''); }}
                destroyOnHidden
            >
                <div className="mt-4 flex flex-col gap-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        Phiếu: <span className="font-semibold text-slate-800">{rejectTarget?.requestCode}</span>
                        {' · '}
                        <span className="text-slate-500">{rejectTarget?.fromPlant?.name || rejectTarget?.plant?.name}</span>
                    </div>
                    <Input.TextArea rows={4} value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Nhập lý do từ chối rõ ràng để cơ sở biết và điều chỉnh..."
                        maxLength={300} showCount />
                </div>
            </Modal>
        </>
    );
};

export default SupplyRequestPage;
